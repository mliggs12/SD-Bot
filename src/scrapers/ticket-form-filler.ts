import { TicketAutofillResult } from '../types';
import {
  FRESHSERVICE_TICKET_SELECTORS,
  REQUESTER_SEARCH,
  TICKET_AGENT,
  TICKET_TEMPLATE,
  TIMEOUTS,
} from '../utils/config';
import { waitFor, dispatchMouseSequence, typeIntoInput } from '../utils/dom-utils';
import { formatError, formatErrorWithStack } from '../utils/error-handler';

/**
 * Stage logging so the ticket tab's DevTools console shows autofill progress
 */
function log(message: string): void {
  console.log(`[SD-Bot] ${message}`);
}

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
 * Finds an ember-power-select widget's trigger via its search input, shared
 * by fields (Requester, Agent) whose trigger has no aria-label to query by
 * directly, unlike the template dropdown
 */
function getPowerSelectTrigger(searchInputSelector: string): HTMLElement | null {
  const input = document.querySelector<HTMLElement>(searchInputSelector);
  return input?.closest<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.powerSelectTrigger) ?? null;
}

/**
 * Reads a power-select trigger's "selected item" span — screen-reader-only
 * (not what's visually shown) but populated only once a real selection
 * commits, making it a reliable post-commit signal
 */
function getSelectedItemText(trigger: HTMLElement): string | null {
  const selectedItem = trigger.querySelector(FRESHSERVICE_TICKET_SELECTORS.powerSelectSelectedItem);
  return selectedItem?.textContent ? cleanText(selectedItem.textContent) : null;
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
    FRESHSERVICE_TICKET_SELECTORS.powerSelectOption
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
    log('Template content already present; skipping dropdown selection');
    return alreadyPopulated;
  }

  log('Waiting for template dropdown trigger...');
  const trigger = await waitFor(
    () => document.querySelector<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.templateTrigger),
    TIMEOUTS.ticketFormLoad,
    'template dropdown trigger'
  );

  log('Trigger found; opening dropdown');
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
    const optionCount = document.querySelectorAll(
      FRESHSERVICE_TICKET_SELECTORS.powerSelectOption
    ).length;
    log(
      `Dropdown did not show "${TICKET_TEMPLATE.name}" after trigger click ` +
        `(${optionCount} option(s) visible); retrying via inline search input`
    );
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

  log(`Selecting "${TICKET_TEMPLATE.name}" option`);
  dispatchMouseSequence(option);

  log('Waiting for template content to populate the editor...');
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
 * True once the description has already been trimmed down to just the
 * keep-label lines — false for the freshly-applied, full-boilerplate
 * template. Distinguishes the one-time destructive trim from a later
 * value-only update, since autofill can run more than once against the same
 * tab (e.g. an early pass with partial data, then again via manual continue
 * once the requester is known)
 */
function isDescriptionTrimmed(editor: HTMLElement): boolean {
  return !cleanText(editor.textContent).includes(TICKET_TEMPLATE.trimmedAwayMarker);
}

/**
 * Strips the freshly-applied template down to only the keep-label lines
 * (labels only, no values yet). Only safe to call once, before any values
 * are set or the tech has had a chance to add their own content — everything
 * outside the keep lines is discarded
 */
function trimToKeepLabels(editor: HTMLElement): void {
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

    lines.appendChild(paragraph);
  }

  editor.innerHTML = '';
  editor.appendChild(lines);
}

/**
 * Removes trailing whitespace-only text nodes (plain spaces or &nbsp;) from
 * the end of an element's children. FreshService's template markup is
 * inconsistent about where a label's trailing space lives: TM Name's is a
 * paragraph-level sibling (`<u>TM Name:</u>&nbsp;`), while Ph#/Laptop#'s is
 * nested *inside* the same wrapper as the label
 * (`<span><u>Ph#:</u>&nbsp;</span>`). The paragraph-level child-count trim in
 * setLineValues only catches the former shape, so without this, Ph#/Laptop#'s
 * inner &nbsp; survives and combines with the newly appended value's leading
 * space into a double space
 */
function stripTrailingWhitespace(element: HTMLElement): void {
  while (element.lastChild?.nodeType === Node.TEXT_NODE && !cleanText(element.lastChild.textContent)) {
    element.removeChild(element.lastChild);
  }
}

/**
 * Sets each keep-label line's value in place, replacing whatever value (if
 * any) was set on a previous pass rather than appending to it. Safe to call
 * repeatedly — e.g. once with partial data (Ph# known, TM Name still blank),
 * again later via manual continue with the final data — without duplicating
 * text, and without touching anything else in the description (including
 * any content the tech may have added between passes)
 */
function setLineValues(editor: HTMLElement, values: Readonly<Record<string, string>>): void {
  const paragraphs = Array.from(editor.querySelectorAll('p'));

  for (const label of TICKET_TEMPLATE.keepLabels) {
    const paragraph = paragraphs.find((p) => cleanText(p.textContent).startsWith(label));
    if (!paragraph) continue; // shouldn't happen once trimmed, but don't fail the whole pass over it

    for (const marker of paragraph.querySelectorAll(FRESHSERVICE_TICKET_SELECTORS.editorMarker)) {
      marker.remove();
    }
    // Keep only the label element (first child); drop any value text a
    // previous pass appended, so this replaces rather than duplicates it
    while (paragraph.childNodes.length > 1) {
      paragraph.removeChild(paragraph.lastChild as ChildNode);
    }
    // Some labels (Ph#, Laptop#) nest their trailing space inside the same
    // wrapper as the label itself, rather than as a paragraph-level sibling,
    // so the child-count trim above doesn't remove it; strip it here too so
    // exactly one space ends up separating the label from the value below
    if (paragraph.firstChild?.nodeType === Node.ELEMENT_NODE) {
      stripTrailingWhitespace(paragraph.firstChild as HTMLElement);
    }

    const value = values[label];
    paragraph.appendChild(document.createTextNode(value ? ` ${value}` : ' '));
  }

  // Notify Froala/Ember that the content changed so the form model picks it up
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
}

/**
 * Trims the template to the keep lines (only on the first pass) and sets
 * their values (every pass) — see isDescriptionTrimmed/trimToKeepLabels/
 * setLineValues for why these are split rather than one combined step
 */
function rewriteDescription(editor: HTMLElement, values: Readonly<Record<string, string>>): void {
  if (!isDescriptionTrimmed(editor)) {
    trimToKeepLabels(editor);
  }
  setLineValues(editor, values);
}

/**
 * Strips the trailing " <email>" suffix FreshService appends to requester
 * typeahead option/selected-item text, leaving just the display name
 */
function cleanOptionName(text: string | null | undefined): string {
  const cleaned = cleanText(text);
  const angleIndex = cleaned.indexOf('<');
  return (angleIndex === -1 ? cleaned : cleaned.slice(0, angleIndex)).trim();
}

/**
 * Finds the Requester field's dropdown trigger via its search input's stable
 * Ember property-name id suffix (see getPowerSelectTrigger)
 */
function getRequesterTrigger(): HTMLElement | null {
  return getPowerSelectTrigger(FRESHSERVICE_TICKET_SELECTORS.requesterSearchInput);
}

/**
 * Reads the currently selected requester's name from the trigger. Checks two
 * signals: the shared "selected item" span (see getSelectedItemText), and
 * the search input's own value — FreshService rewrites the input to show
 * "Name <email>" once a real selection commits, which is the signal actually
 * visible when looking at the field, and only appears post-commit
 * (typed-but-unselected text never includes the email suffix)
 */
function getSelectedRequesterName(trigger: HTMLElement): string | null {
  const selectedItem = getSelectedItemText(trigger);
  if (selectedItem) {
    return cleanOptionName(selectedItem);
  }
  const input = trigger.querySelector<HTMLInputElement>(FRESHSERVICE_TICKET_SELECTORS.requesterSearchInput);
  if (input?.value.includes('<')) {
    return cleanOptionName(input.value);
  }
  return null;
}

/**
 * Reads the dropdown's status message text ("Type to search", "Loading
 * options...", or a terminal no-results message), or null when real result
 * options are shown instead of a status message
 */
function getRequesterStatusText(): string | null {
  const status = document.querySelector(FRESHSERVICE_TICKET_SELECTORS.requesterStatusMessage);
  return status ? cleanText(status.textContent) : null;
}

/**
 * Returns only the real person-result options, excluding the dropdown's own
 * status-message li (shown for "Type to search", "Loading options...", and
 * presumably a terminal no-results state) — identified by text content
 * rather than CSS class, since every real result renders as "Name <email>"
 * while no status message does, and not every status text reliably carries
 * the same modifier class
 */
function getRequesterResultOptions(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.powerSelectOption)
  ).filter((option) => cleanText(option.textContent).includes('<'));
}

/**
 * Polls until the requester typeahead settles: returns the result options
 * once any are rendered, or an empty array once the status message reaches
 * a terminal (non-transitional) state, signaling zero results
 */
async function waitForRequesterSearchSettled(): Promise<HTMLElement[]> {
  return waitFor(
    () => {
      const options = getRequesterResultOptions();
      if (options.length > 0) {
        return options;
      }
      const status = getRequesterStatusText();
      if (!status) {
        return null;
      }
      const isTransitional =
        status.startsWith(REQUESTER_SEARCH.typeToSearchText) ||
        status.startsWith(REQUESTER_SEARCH.loadingText);
      return isTransitional ? null : [];
    },
    TIMEOUTS.requesterSearchResults,
    'requester search results to settle'
  );
}

/**
 * Filters rendered options down to those whose name (case-insensitive)
 * matches the requester's known name, since FreshService's search can
 * loosely return unrelated results alongside the intended match(es). Most
 * requesters have more than one email on file, so multiple matches for the
 * same name are the common case, not an ambiguity signal — any of them
 * identifies the same person and is a valid pick
 */
function findExactRequesterMatches(options: HTMLElement[], requesterName: string): HTMLElement[] {
  const target = requesterName.toLowerCase();
  return options.filter((option) => cleanOptionName(option.textContent).toLowerCase() === target);
}

/**
 * Opens the Requester typeahead, types the known requester name, and clicks
 * a matching result. Never throws: any failure (DOM not found, timeout, no
 * match found) leaves the field blank, which is treated as non-fatal so it
 * can never affect template/description autofill
 * @returns Whether the field was auto-selected, and a reason if not
 */
async function selectRequester(requesterName: string): Promise<{ selected: boolean; note?: string }> {
  if (!requesterName) {
    return { selected: false, note: 'no requester identified' };
  }

  const existingTrigger = getRequesterTrigger();
  if (
    existingTrigger &&
    getSelectedRequesterName(existingTrigger)?.toLowerCase() === requesterName.toLowerCase()
  ) {
    log('Requester already selected; skipping');
    return { selected: true };
  }

  try {
    log('Waiting for requester field trigger...');
    const trigger = await waitFor(getRequesterTrigger, TIMEOUTS.ticketFormLoad, 'requester field trigger');

    log('Trigger found; opening dropdown');
    dispatchMouseSequence(trigger);

    const searchInput = trigger.querySelector<HTMLInputElement>(
      FRESHSERVICE_TICKET_SELECTORS.requesterSearchInput
    );
    if (!searchInput) {
      return { selected: false, note: 'requester search input not found' };
    }

    log(`Typing requester name: "${requesterName}"`);
    typeIntoInput(searchInput, requesterName);

    const options = await waitForRequesterSearchSettled();
    log(
      `Search returned ${options.length} option(s): ${
        options.map((o) => cleanText(o.textContent)).join(' | ') || '(none)'
      }`
    );
    const matches = findExactRequesterMatches(options, requesterName);

    if (matches.length === 0) {
      return { selected: false, note: 'no matching requester found' };
    }

    log(
      `${matches.length > 1 ? `${matches.length} entries found (multiple emails on file); ` : ''}` +
        `clicking: "${cleanText(matches[0].textContent)}"`
    );
    dispatchMouseSequence(matches[0]);

    // Re-query the trigger fresh on every poll too, in case the whole
    // dropdown component gets replaced (not just its options) once a
    // selection commits — checking a stale trigger reference would never
    // see the update and would falsely report the field as still blank
    await waitFor(
      () => {
        const liveTrigger = getRequesterTrigger();
        return liveTrigger && getSelectedRequesterName(liveTrigger)?.toLowerCase() === requesterName.toLowerCase()
          ? true
          : null;
      },
      TIMEOUTS.requesterSearchResults,
      'requester selection to apply'
    );

    log('Requester selection verified as applied');
    return { selected: true };
  } catch (error) {
    return { selected: false, note: formatError(error) };
  }
}

/**
 * Finds the Agent field's dropdown trigger via its search input's stable
 * Ember property-name id suffix (see getPowerSelectTrigger) — FreshService's
 * internal name for this field is "Responder"
 */
function getAgentTrigger(): HTMLElement | null {
  return getPowerSelectTrigger(FRESHSERVICE_TICKET_SELECTORS.agentSearchInput);
}

function isConfiguredAgent(name: string | null): boolean {
  return !!name && name.toLowerCase().startsWith(TICKET_AGENT.name.toLowerCase());
}

/**
 * Finds the configured agent's option in the dropdown. Matched via
 * startsWith rather than exact equality since FreshService appends a
 * "(Me)" suffix to whichever agent is currently logged in
 */
function findAgentOption(): HTMLElement | null {
  const options = document.querySelectorAll<HTMLElement>(FRESHSERVICE_TICKET_SELECTORS.powerSelectOption);
  for (const option of options) {
    if (isConfiguredAgent(cleanText(option.textContent))) {
      return option;
    }
  }
  return null;
}

/**
 * Opens the Agent dropdown and clicks the configured agent's option. Unlike
 * the Requester field, this list is static and fully populated as soon as
 * the dropdown opens (no typing/search needed), and the target is always the
 * same fixed name, so there's no ambiguity to handle. Never throws: FreshService
 * appears to default this field to the current user already, so a failure
 * here is low-stakes and treated as non-fatal, same as Requester
 * @returns Whether the field was auto-selected, and a reason if not
 */
async function selectAgent(): Promise<{ selected: boolean; note?: string }> {
  const existingTrigger = getAgentTrigger();
  if (existingTrigger && isConfiguredAgent(getSelectedItemText(existingTrigger))) {
    log('Agent already selected; skipping');
    return { selected: true };
  }

  try {
    log('Waiting for agent field trigger...');
    const trigger = await waitFor(getAgentTrigger, TIMEOUTS.ticketFormLoad, 'agent field trigger');

    log('Trigger found; opening dropdown');
    dispatchMouseSequence(trigger);

    const option = await waitFor(
      findAgentOption,
      TIMEOUTS.dropdownOpen,
      `"${TICKET_AGENT.name}" option in agent dropdown`
    );

    log(`Selecting agent option: "${cleanText(option.textContent)}"`);
    dispatchMouseSequence(option);

    await waitFor(
      () => {
        const liveTrigger = getAgentTrigger();
        return liveTrigger && isConfiguredAgent(getSelectedItemText(liveTrigger)) ? true : null;
      },
      TIMEOUTS.dropdownOpen,
      'agent selection to apply'
    );

    log('Agent selection verified as applied');
    return { selected: true };
  } catch (error) {
    return { selected: false, note: formatError(error) };
  }
}

/**
 * Snapshot of the page state for failure diagnostics, so error reports show
 * what the page actually looked like (e.g. form not rendered, a picker/dialog
 * in the way, or selectors no longer matching)
 */
function buildDiagnostics(): string {
  const trigger = document.querySelector(FRESHSERVICE_TICKET_SELECTORS.templateTrigger);
  const anyTriggerCount = document.querySelectorAll(FRESHSERVICE_TICKET_SELECTORS.powerSelectTrigger).length;
  const editor = getDescriptionEditor();
  const optionCount = document.querySelectorAll(FRESHSERVICE_TICKET_SELECTORS.powerSelectOption).length;
  return [
    `url=${location.pathname}`,
    `title="${document.title}"`,
    `templateTrigger=${trigger ? 'found' : 'MISSING'}`,
    `powerSelectTriggersOnPage=${anyTriggerCount}`,
    `descriptionEditor=${editor ? 'found' : 'MISSING'}`,
    `visibleOptions=${optionCount}`,
    `docHidden=${document.hidden}`,
  ].join(', ');
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
 * @param laptopNumber - Asset tag for the Laptop# line; empty string leaves
 *   it blank (used when no asset or multiple assets were found)
 */
export async function autofillNewTicket(
  requesterName: string,
  phoneNumber: string,
  laptopNumber: string
): Promise<TicketAutofillResult> {
  log(
    `Autofill started (requester: "${requesterName || '(blank)'}", phone: ${phoneNumber}, ` +
      `laptop: "${laptopNumber || '(blank)'}")`
  );

  // INVARIANT: applyTemplate() must run before any other field selection
  // below (Requester, Agent, and any field added later). Selecting a
  // template resets other fields back to its own defaults — confirmed via
  // testing, Agent (and likely Requester) got silently cleared when set
  // before this point. A field selector added above this block will hit the
  // same bug. Once applied, applyTemplate()'s own idempotency check prevents
  // the reset from happening again on a later autofill pass against the
  // same tab, so everything after this point is safe regardless of order
  let templateError: string | undefined;
  try {
    const editor = await applyTemplate();
    rewriteDescription(editor, {
      [TICKET_TEMPLATE.tmNameLabel]: requesterName,
      [TICKET_TEMPLATE.phoneLabel]: phoneNumber,
      [TICKET_TEMPLATE.laptopLabel]: laptopNumber,
    });
    log('Description rewritten');
  } catch (error) {
    templateError =
      `Error autofilling new ticket: ${formatErrorWithStack(error, true)} | ` +
      `Page state: ${buildDiagnostics()}`;
    console.error(`[SD-Bot] ${templateError}`);
  }

  // Both self-contained and non-throwing: a failure in either only affects
  // its own outcome. Run after the template regardless of whether it
  // succeeded — a failed template attempt doesn't reset anything, so it's
  // still safe (and worth attempting) to select these independently
  const requesterOutcome = await selectRequester(requesterName);
  log(
    `Requester field: ${requesterOutcome.selected ? 'selected' : `left blank (${requesterOutcome.note})`}`
  );

  const agentOutcome = await selectAgent();
  log(
    `Agent field: ${agentOutcome.selected ? 'selected' : `left as-is (${agentOutcome.note})`}`
  );

  if (templateError) {
    return {
      success: false,
      error: templateError,
      requesterAutoSelected: requesterOutcome.selected,
      requesterSelectionNote: requesterOutcome.note,
    };
  }

  log('Autofill complete');
  return {
    success: true,
    requesterAutoSelected: requesterOutcome.selected,
    requesterSelectionNote: requesterOutcome.note,
  };
}
