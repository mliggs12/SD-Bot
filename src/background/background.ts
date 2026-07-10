/// <reference types="chrome" />

import {
  Message,
  TriggerWorkflowMessage,
  PhoneNumberIdentifiedMessage,
  RequesterSelectionRequiredMessage,
  SelectRequesterMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowNoMatchMessage,
  WorkflowErrorMessage,
  StoredRequester,
  RequesterInfo,
  CallingNumberResultMessage,
  SearchResultsResultMessage,
  AutofillTicketResultMessage,
  isSuccessfulCallingNumberResult,
  isSuccessfulSingleMatchResult,
  isMultipleRequestersResult,
  isNoMatchResult
} from '../types';
import { TabManager } from '../services/tab-manager';
import { StorageService } from '../services/storage-service';
import { MessageService } from '../services/message-service';
import {
  RINGCENTRAL_PATTERN,
  FRESHSERVICE_SEARCH_URL,
  FRESHSERVICE_NEW_TICKET_URL,
  FRESHSERVICE_USER_PROFILE_URL,
  AUTOFILL_RETRY,
  CALLING_NUMBER_RETRY,
  TEST_MODE,
  TEST_PHONE_NUMBER
} from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

// Handle action button click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((
  message: Message,
  sender,
  sendResponse: (response: Message) => void
) => {
  if (message.type === 'TRIGGER_WORKFLOW') {
    // Handle workflow asynchronously
    handleWorkflow()
      .then(() => {
        // Workflow completed successfully
      })
      .catch((error) => {
        console.error('Workflow error:', error);
        // Error already sent via message
      });

    // Return true to indicate async response
    return true;
  }

  if (message.type === 'SELECT_REQUESTER') {
    // Tech picked a requester in the sidepanel; finish the paused workflow
    handleRequesterSelection(message)
      .catch((error) => {
        console.error('Requester selection error:', error);
        sendWorkflowError('Extension Error', formatErrorWithStack(error, true));
      });

    return true;
  }

  return false;
});

/**
 * Main workflow handler
 */
async function handleWorkflow(): Promise<void> {
  try {
    let phoneNumber: string;

    if (TEST_MODE) {
      // Test mode: use static phone number, skip RingCentral steps
      phoneNumber = TEST_PHONE_NUMBER;
      sendPhoneNumberIdentified(phoneNumber);
      sendWorkflowUpdate(`Test Mode: Using static number ${phoneNumber}. Searching FreshService...`);
    } else {
      // Normal mode: find RingCentral tab and extract calling number
      const maxTab = await findRingCentralTab();
      phoneNumber = await extractCallingNumber(maxTab.id!);
      sendPhoneNumberIdentified(phoneNumber);
      sendWorkflowUpdate(`Searching FreshService for ${phoneNumber}...`);
    }

    // A new call supersedes any selection still pending from a previous one
    await StorageService.clearPendingSelection();

    // Always open new ticket tab first; keep a handle on it for autofill
    const ticketTab = await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);

    const searchTab = await searchFreshService(phoneNumber);

    const outcome = await processSearchResults(searchTab.id!, phoneNumber);

    // Prep the new ticket in every case; TM Name is left blank unless a
    // unique requester was identified
    const autofillError = await autofillNewTicket(
      ticketTab.id!,
      outcome.kind === 'single' ? outcome.requester.requesterName : '',
      phoneNumber
    );

    switch (outcome.kind) {
      case 'single': {
        await openRequesterProfileTab(outcome.requester);

        if (autofillError) {
          sendWorkflowError(
            'Ticket autofill failed',
            `${autofillError} Fill the ticket description manually.`
          );
          return;
        }

        sendWorkflowComplete(outcome.requester);
        return;
      }

      case 'multiple': {
        // Pause the workflow and ask the tech to pick; the selection handler
        // finishes the job (store requester, update ticket, open profile).
        // Any autofill error here is ignored — the post-selection autofill
        // pass retries and reports failures itself.
        await StorageService.setPendingSelection({
          phoneNumber,
          ticketTabId: ticketTab.id!,
          requesters: outcome.requesters,
          source: outcome.source,
          timestamp: Date.now(),
        });

        sendRequesterSelectionRequired(outcome.requesters, phoneNumber, outcome.source);
        return;
      }

      case 'none': {
        // Legitimate no-match: the ticket prepped with phone number only is
        // the final deliverable; the tech fills TM Name manually
        sendWorkflowNoMatch(phoneNumber, outcome.reason, autofillError === null);
        return;
      }

      case 'error': {
        throw new Error(`Requester not uniquely identified: ${outcome.reason}`);
      }
    }
  } catch (error) {
    const errorMessage = formatErrorWithStack(error, true);
    sendWorkflowError('Extension Error', errorMessage);
  }
}

/**
 * Finish a workflow paused on manual requester selection: store the chosen
 * requester, fill the TM Name on the already-prepped ticket, and open the
 * requester's profile tab
 */
async function handleRequesterSelection(message: SelectRequesterMessage): Promise<void> {
  const pending = await StorageService.getPendingSelection();
  if (!pending) {
    sendWorkflowError(
      'Selection expired',
      'No workflow is waiting for a requester selection. Run the workflow again.'
    );
    return;
  }

  // Only accept a requester that was actually offered for this call
  const chosen = pending.requesters.find((r) => r.userId === message.requester.userId);
  if (!chosen) {
    sendWorkflowError(
      'Invalid selection',
      'The selected requester is not part of the current search results.'
    );
    return;
  }

  await StorageService.clearPendingSelection();

  const requesterData: StoredRequester = {
    requesterName: chosen.name,
    requesterUserId: chosen.userId,
    phoneNumber: pending.phoneNumber,
    timestamp: Date.now(),
    source: pending.source,
  };
  await StorageService.setCurrentRequester(requesterData);

  sendWorkflowUpdate(`Continuing with ${chosen.name}. Updating ticket...`);

  // Second autofill pass on the prepped ticket fills in the TM Name;
  // rewriteDescription is idempotent so the phone line is not duplicated
  const autofillError = await autofillNewTicket(
    pending.ticketTabId,
    chosen.name,
    pending.phoneNumber
  );

  await openRequesterProfileTab(requesterData);

  if (autofillError) {
    sendWorkflowError(
      'Ticket autofill failed',
      `${autofillError} Fill the TM Name manually.`
    );
    return;
  }

  sendWorkflowComplete(requesterData);
}

/**
 * Step 1: Find RingCentral MAX tab and bring it to the front
 * The MAX window is often buried behind others when a call comes in, and
 * Chrome deprioritizes hidden windows, so the call UI may not render or
 * update until the window is visible again
 * @returns The RingCentral MAX tab
 * @throws Error if tab is not found
 */
async function findRingCentralTab(): Promise<chrome.tabs.Tab> {
  sendWorkflowUpdate('Searching for MAX window...');
  const maxTab = await TabManager.findTabByUrl(RINGCENTRAL_PATTERN);
  await TabManager.activateTab(maxTab.id!);
  sendWorkflowUpdate('Found MAX window. Checking for call data...');
  return maxTab;
}

/**
 * Step 2: Extract calling number from RingCentral content script
 * Retries briefly: the call UI may need a moment to render after the MAX
 * window is brought forward
 * @param tabId - The tab ID of the RingCentral MAX tab
 * @returns The extracted phone number
 * @throws Error if calling number cannot be extracted
 */
async function extractCallingNumber(tabId: number): Promise<string> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < CALLING_NUMBER_RETRY.attempts; attempt++) {
    if (attempt > 0) {
      await delay(CALLING_NUMBER_RETRY.delayMs);
    }
    try {
      const callingNumberResult = await MessageService.getCallingNumber(tabId);
      if (isSuccessfulCallingNumberResult(callingNumberResult)) {
        return callingNumberResult.phoneNumber;
      }
      lastError = callingNumberResult.error;
    } catch (error) {
      lastError = formatErrorWithStack(error, true);
    }
  }

  throw new Error(lastError || 'No active call detected or calling number not available');
}

/**
 * Step 3: Create FreshService search tab and wait for it to load
 * @param phoneNumber - The phone number to search for
 * @returns The created search tab
 * @throws Error if tab creation fails
 */
async function searchFreshService(phoneNumber: string): Promise<chrome.tabs.Tab> {
  const searchUrl = `${FRESHSERVICE_SEARCH_URL}?term=${phoneNumber}`;
  const searchTab = await TabManager.createTabAndWait(searchUrl, true);
  sendWorkflowUpdate('Searching for requester...');
  return searchTab;
}

/**
 * What the search results yielded, and everything the workflow needs to act on it
 */
type SearchOutcome =
  | { kind: 'single'; requester: StoredRequester }
  | { kind: 'multiple'; requesters: RequesterInfo[]; source?: 'requesters' | 'tickets' }
  | { kind: 'none'; reason: string }
  | { kind: 'error'; reason: string };

/**
 * Step 4: Process search results into a workflow outcome
 * A single unique match is stored as the current requester; multiple matches
 * and no-match results are returned for the workflow to handle
 * @param searchTabId - The tab ID of the FreshService search results tab
 * @param phoneNumber - The phone number that was searched
 */
async function processSearchResults(
  searchTabId: number,
  phoneNumber: string
): Promise<SearchOutcome> {
  const searchResults = await MessageService.scrapeSearchResults(searchTabId);
  const data = searchResults.data;

  // Scenario 1: Single unique requester
  if (searchResults.success && data && isSuccessfulSingleMatchResult(data)) {
    const requesterData: StoredRequester = {
      requesterName: data.name,
      requesterUserId: data.userId,
      phoneNumber: phoneNumber,
      timestamp: Date.now(),
      source: data.source,
    };

    await StorageService.setCurrentRequester(requesterData);
    const sourceLabel = data.source === 'tickets' ? ' (from tickets)' : '';
    sendWorkflowUpdate(`Requester found${sourceLabel}. Opening tabs...`);

    return { kind: 'single', requester: requesterData };
  }

  // Scenario 2: Multiple requesters (from the Requesters section or tickets)
  if (searchResults.success && data && isMultipleRequestersResult(data)) {
    return { kind: 'multiple', requesters: data.requesters, source: data.source };
  }

  // Scenario 3: The search page rendered but held no requester at all
  if (data && isNoMatchResult(data)) {
    return { kind: 'none', reason: data.reason || 'No requester found in search results' };
  }

  // Anything else is a scrape failure, not a search outcome
  return { kind: 'error', reason: data?.reason || searchResults.error || 'Unknown error' };
}

/**
 * Step 5: Autofill the new ticket with the Standard Ticket template and caller details
 * Failures are reported without aborting the workflow — the opened tabs are still useful
 * @param ticketTabId - The tab ID of the new ticket tab opened at workflow start
 * @param requesterName - Requester name ('' when not uniquely identified)
 * @param phoneNumber - The caller's phone number
 * @returns An error description on failure, or null on success
 */
async function autofillNewTicket(
  ticketTabId: number,
  requesterName: string,
  phoneNumber: string
): Promise<string | null> {
  sendWorkflowUpdate('Prepping new ticket with Standard Ticket template...');
  try {
    // Foreground the ticket tab first: hidden tabs may never finish rendering
    // the Ember form, and the prepped ticket is where the tech works next
    await TabManager.activateTab(ticketTabId);
    await TabManager.waitForTabComplete(ticketTabId);

    const result = await sendAutofillWithRetry(ticketTabId, requesterName, phoneNumber);
    if (!result.success) {
      console.error('Ticket autofill failed:', result.error);
      return result.error || 'Ticket autofill failed for an unknown reason.';
    }
    sendWorkflowUpdate('New ticket prepped with caller details.');
    return null;
  } catch (error) {
    console.error('Ticket autofill failed:', error);
    return formatErrorWithStack(error, true);
  }
}

/**
 * Sends the autofill message, retrying while the ticket tab's content script
 * may still be loading (the tab was opened without waiting for it)
 */
async function sendAutofillWithRetry(
  tabId: number,
  requesterName: string,
  phoneNumber: string
): Promise<AutofillTicketResultMessage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < AUTOFILL_RETRY.attempts; attempt++) {
    if (attempt > 0) {
      await delay(AUTOFILL_RETRY.delayMs);
    }
    try {
      return await MessageService.autofillTicket(tabId, requesterName, phoneNumber);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Promise-based delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Step 6: Open user profile tab for identified requester
 * @param requesterData - The requester data containing user ID
 */
async function openRequesterProfileTab(requesterData: StoredRequester): Promise<void> {
  await TabManager.createTab(FRESHSERVICE_USER_PROFILE_URL(requesterData.requesterUserId), false);
}

/**
 * Send phone number identified message to sidepanel
 */
function sendPhoneNumberIdentified(phoneNumber: string): void {
  MessageService.sendToSidepanel<PhoneNumberIdentifiedMessage>({
    type: 'PHONE_NUMBER_IDENTIFIED',
    phoneNumber: phoneNumber,
  });
}

/**
 * Send workflow update message to sidepanel
 */
function sendWorkflowUpdate(message: string): void {
  MessageService.sendToSidepanel<WorkflowUpdateMessage>({
    type: 'WORKFLOW_UPDATE',
    status: 'in_progress',
    message: message,
  });
}

/**
 * Ask the sidepanel to show the requester picker
 */
function sendRequesterSelectionRequired(
  requesters: RequesterInfo[],
  phoneNumber: string,
  source?: 'requesters' | 'tickets'
): void {
  MessageService.sendToSidepanel<RequesterSelectionRequiredMessage>({
    type: 'REQUESTER_SELECTION_REQUIRED',
    requesters: requesters,
    phoneNumber: phoneNumber,
    source: source,
  });
}

/**
 * Tell the sidepanel the search legitimately found no requester
 */
function sendWorkflowNoMatch(phoneNumber: string, reason: string, ticketPrepped: boolean): void {
  MessageService.sendToSidepanel<WorkflowNoMatchMessage>({
    type: 'WORKFLOW_NO_MATCH',
    phoneNumber: phoneNumber,
    reason: reason,
    ticketPrepped: ticketPrepped,
  });
}

/**
 * Send workflow completion message to sidepanel
 */
function sendWorkflowComplete(requesterData: StoredRequester): void {
  MessageService.sendToSidepanel<WorkflowCompleteMessage>({
    type: 'WORKFLOW_COMPLETE',
    requesterData: requesterData,
  });
}

/**
 * Send workflow error message to sidepanel
 */
function sendWorkflowError(error: string, details?: string): void {
  MessageService.sendToSidepanel<WorkflowErrorMessage>({
    type: 'WORKFLOW_ERROR',
    error: error,
    details: details,
  });
}

