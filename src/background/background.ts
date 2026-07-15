/// <reference types="chrome" />

import {
  Message,
  TriggerWorkflowMessage,
  PhoneNumberIdentifiedMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowErrorMessage,
  StoredRequester,
  CallingNumberResultMessage,
  SearchResultsResultMessage,
  AutofillTicketResultMessage,
  isSuccessfulCallingNumberResult,
  isSuccessfulSingleMatchResult,
  isMultipleRequestersResult
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
  STORAGE_KEYS
} from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

// Handle action button click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

/**
 * Show a TEST badge on the toolbar icon whenever test mode is enabled, so the
 * state is visible even when the side panel is closed — a run in test mode
 * uses the configured number instead of detecting the live call
 */
async function updateTestModeBadge(): Promise<void> {
  const settings = await StorageService.getTestModeSettings();
  await chrome.action.setBadgeText({ text: settings.enabled ? 'TEST' : '' });
  if (settings.enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: '#FFC107' });
    await chrome.action.setBadgeTextColor({ color: '#000000' });
  }
}

// Re-assert the badge on every service worker start, and flip it the instant
// the sidepanel toggle changes the stored settings
updateTestModeBadge().catch((error) => console.error('Failed to update test mode badge:', error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.testModeSettings]) {
    updateTestModeBadge().catch((error) => console.error('Failed to update test mode badge:', error));
  }
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
  
  return false;
});

/**
 * Main workflow handler
 */
async function handleWorkflow(): Promise<void> {
  try {
    let phoneNumber: string;

    // Test mode is a runtime setting toggled from the sidepanel
    const testSettings = await StorageService.getTestModeSettings();

    if (testSettings.enabled) {
      // Test mode: use the configured phone number, skip RingCentral steps
      phoneNumber = testSettings.phoneNumber.trim();
      if (!phoneNumber) {
        throw new Error('Test mode is enabled but no test phone number is set. Enter one in the sidepanel.');
      }
      sendPhoneNumberIdentified(phoneNumber);
      sendWorkflowUpdate(`Test Mode: Using ${phoneNumber} (no call detection). Searching FreshService...`);
    } else {
      // Normal mode: find RingCentral tab and extract calling number
      const maxTab = await findRingCentralTab();
      phoneNumber = await extractCallingNumber(maxTab.id!);
      sendPhoneNumberIdentified(phoneNumber);
      sendWorkflowUpdate(`Searching FreshService for ${phoneNumber}...`);
    }

    // Always open new ticket tab first; keep a handle on it for autofill
    const ticketTab = await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);

    const searchTab = await searchFreshService(phoneNumber);

    // Identify the requester, but prep the new ticket even when identification fails
    let requesterData: StoredRequester | undefined;
    let searchError: unknown;
    try {
      requesterData = await processSearchResults(searchTab.id!, phoneNumber);
    } catch (error) {
      searchError = error;
    }

    // TM Name is left blank when no unique requester was found
    const autofillError = await autofillNewTicket(
      ticketTab.id!,
      requesterData?.requesterName ?? '',
      phoneNumber
    );

    if (searchError !== undefined || !requesterData) {
      throw searchError;
    }

    await openRequesterProfileTab(requesterData);

    if (autofillError) {
      sendWorkflowError(
        'Ticket autofill failed',
        `${autofillError} Fill the ticket description manually.`
      );
      return;
    }

    sendWorkflowComplete(requesterData);
  } catch (error) {
    const errorMessage = formatErrorWithStack(error, true);
    sendWorkflowError('Extension Error', errorMessage);
  }
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
 * Step 4: Process search results and store requester data
 * @param searchTabId - The tab ID of the FreshService search results tab
 * @param phoneNumber - The phone number that was searched
 * @returns The stored requester data
 * @throws Error if requester cannot be uniquely identified
 */
async function processSearchResults(
  searchTabId: number,
  phoneNumber: string
): Promise<StoredRequester> {
  const searchResults = await MessageService.scrapeSearchResults(searchTabId);

  // Check for scenario 1: Single unique requester
  if (searchResults.success && searchResults.data && isSuccessfulSingleMatchResult(searchResults.data)) {
    // Store requester data - TypeScript now knows data.name and data.userId are defined
    const source = searchResults.data.source;
    const requesterData: StoredRequester = {
      requesterName: searchResults.data.name,
      requesterUserId: searchResults.data.userId,
      phoneNumber: phoneNumber,
      timestamp: Date.now(),
      source: source,
    };

    await StorageService.setCurrentRequester(requesterData);
    const sourceLabel = source === 'tickets' ? ' (from tickets)' : '';
    sendWorkflowUpdate(`Requester found${sourceLabel}. Opening tabs...`);

    return requesterData;
  }

  // Check for scenario 2: Multiple requesters from tickets
  if (searchResults.success && searchResults.data && isMultipleRequestersResult(searchResults.data)) {
    const requesters = searchResults.data.requesters;
    const requesterNames = requesters.map(r => r.name).join(', ');

    sendWorkflowError(
      'Multiple requesters found',
      `Found ${requesters.length} requesters in tickets: ${requesterNames}. Manual selection required.`
    );

    throw new Error(`Multiple requesters found: ${requesterNames}`);
  }

  // Scenario 3: Not found or other error
  const reason = searchResults.data?.reason || searchResults.error || 'Unknown error';
  const count = searchResults.data?.count;

  sendWorkflowError(
    'Requester not uniquely identified',
    `${reason}${count ? ` (Found ${count} requesters)` : ''}. Manual selection may be required.`
  );

  throw new Error(`Requester not uniquely identified: ${reason}`);
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

  // Include the ticket tab's state so "Receiving end does not exist" errors
  // show whether the tab ever loaded (or was discarded) when retries ran out
  let tabInfo = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    tabInfo = ` (ticket tab: status=${tab.status}, discarded=${tab.discarded}, url=${tab.url || 'n/a'})`;
  } catch {
    tabInfo = ' (ticket tab no longer exists)';
  }
  throw new Error(`${formatErrorWithStack(lastError, true)}${tabInfo}`);
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

