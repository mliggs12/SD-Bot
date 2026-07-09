import { TicketAutofillResult } from '../types';
import { FRESHSERVICE_TICKET_SELECTORS, TICKET_TEMPLATE, TIMEOUTS } from '../utils/config';
import { waitFor, dispatchMouseSequence } from '../utils/dom-utils';
import { formatErrorWithStack } from '../utils/error-handler';

/**
 * Removes Froala's zero-width marker characters and trims whitespace
 */
function cleanText(text: string | null | undefined): string {
  return (text ?? '').replace(/\u200B/g, '').trim();
}

function getDescriptionEditor(): HTMLElement | null {
  return document.querySelector<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.descriptionEditor);
}

/**
 * Returns the description editor once the template content has populated it,
 * or null while it is still empty
 */
function getPopulatedEditor(): HTMLElement | null {
  const editor = getDescriptionEditor();
  if (editor && cleanText(editor.textContent).includes(TICKET_TEMPLATE.appliedMarker)) {
    return editor;
  }
  return null;
}

/**
 * Finds the dropdown option matching the configured template name
 * Options render only while the dropdown is open
 */
function findTemplateOption(): HTMLElement | null {
  const options = document.querySelectorAll<HTMLElement>(
    FRESHSERVICE_TICKET_SELECTORS.templateOption
  );
  for (const option of options) {
    if (cleanText(option.textContent) === TICKET_TEMPLATE.name) {
      return option;
    }
  }
  return null;
}

/**
 * Opens the template dropdown, selects the configured template, and waits
 * for the description editor to be populated with the template content
 * @returns The populated description editor element
 */
async function applyTemplate(): Promise<HTMLElement> {
  // Template may already be applied (e.g. workflow re-run against the same tab)
  const alreadyPopulated = getPopulatedEditor();
  if (alreadyPopulated) {
    return alreadyPopulated;
  }

  const trigger = await waitFor(
    () => document.querySelector<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.templateTrigger),
    TIMEOUTS.ticketFormLoad,
    'template dropdown trigger'
  );

  dispatchMouseSequence(trigger);

  let option: HTMLElement;
  try {
    option = await waitFor(
      findTemplateOption,
      TIMEOUTS.dropdownOpen,
      `"${TICKET_TEMPLATE.name}" option in template dropdown`
    );
  } catch {
    // Fallback: some power-select configurations toggle from the inline search
    // input inside the trigger rather than the trigger itself
    const searchInput = trigger.querySelector<HTMLElement>(
      FRESHSERVICE_TICKET_SELECTORS.templateSearchInput
    );
    if (searchInput) {
      searchInput.focus();
      dispatchMouseSequence(searchInput);
    }
    option = await waitFor(
      findTemplateOption,
      TIMEOUTS.templateApply,
      `"${TICKET_TEMPLATE.name}" option in template dropdown (after retry)`
    );
  }

  dispatchMouseSequence(option);

  return waitFor(
    getPopulatedEditor,
    TIMEOUTS.templateApply,
    'template content in description editor'
  );
}

/**
 * Builds a template line (<p><u><b>Label</b></u>&nbsp;</p>) matching the
 * template's styling, for when a label paragraph is missing from the template
 */
function createTemplateLine(label: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  const underline = document.createElement('u');
  const bold = document.createElement('b');
  bold.textContent = label;
  underline.appendChild(bold);
  paragraph.appendChild(underline);
  paragraph.appendChild(document.createTextNode('\u00A0'));
  return paragraph;
}

/**
 * Replaces the populated template content with only the keep-label lines,
 * appending the provided value after each label
 */
function rewriteDescription(editor: HTMLElement, values: Readonly<Record<string, string>>): void {
  const paragraphs = Array.from(editor.querySelectorAll('p'));
  const lines = document.createDocumentFragment();

  for (const label of TICKET_TEMPLATE.keepLabels) {
    // Reuse the template's own paragraph to preserve its styling; synthesize a
    // matching line if the template text changed and the label is missing
    const paragraph =
      paragraphs.find((p) => cleanText(p.textContent).startsWith(label)) ??
      createTemplateLine(label);

    for (const marker of paragraph.querySelectorAll(FRESHSERVICE_TICKET_SELECTORS.editorMarker)) {
      marker.remove();
    }

    const value = values[label];
    if (value) {
      paragraph.appendChild(document.createTextNode(value));
    }

    lines.appendChild(paragraph);
  }

  editor.innerHTML = '';
  editor.appendChild(lines);

  // Notify Froala/Ember that the content changed so the form model picks it up
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
}

/**
 * Applies the Standard Ticket template to the new ticket form and rewrites the
 * description down to the keep lines with caller details filled in:
 *
 *   TM Name: <requesterName>
 *   Ph#: <phoneNumber>
 *   Laptop#:
 *
 * @param requesterName - Requester name; empty string leaves TM Name blank
 *   (used when no unique requester was identified)
 * @param phoneNumber - Caller phone number in raw format
 */
export async function autofillNewTicket(
  requesterName: string,
  phoneNumber: string
): Promise<TicketAutofillResult> {
  try {
    const editor = await applyTemplate();
    rewriteDescription(editor, {
      [TICKET_TEMPLATE.tmNameLabel]: requesterName,
      [TICKET_TEMPLATE.phoneLabel]: phoneNumber,
      [TICKET_TEMPLATE.laptopLabel]: '',
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Error autofilling new ticket: ${formatErrorWithStack(error, true)}`,
    };
  }
}
