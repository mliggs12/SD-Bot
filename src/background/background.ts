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
  RequesterAssetsResultMessage,
  isSuccessfulCallingNumberResult,
  isSuccessfulSingleMatchResult,
  isMultipleRequestersResult
} from '../types';
import { TabManager } from '../services/tab-manager';
import { StorageService } from '../services/storage-service';
import { MessageService } from '../services/message-service';
import {
  RINGCENTRAL_PATTERN,
  FRESHSERVICE_BASE_URL,
  FRESHSERVICE_SEARCH_URL,
  FRESHSERVICE_NEW_TICKET_URL,
  FRESHSERVICE_USER_PROFILE_URL,
  AUTOFILL_RETRY,
  CALLING_NUMBER_RETRY,
  ASSET_LOOKUP_RETRY,
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

  if (message.type === 'CONTINUE_WITH_MANUAL_REQUESTER') {
    handleManualContinue().catch((error) => {
      console.error('Manual continue error:', error);
      // Error already sent via message
    });
    return true;
  }

  if (message.type === 'SELECT_LAPTOP') {
    handleSelectLaptop(message.assetTag).catch((error) => {
      console.error('Select laptop error:', error);
      // Error already sent via message
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

    // Persisted (rather than kept only as a local variable) so the manual
    // continue path can resume this same run if the service worker restarts
    // while the tech is manually searching FreshService
    await StorageService.setPendingRun({ ticketTabId: ticketTab.id!, phoneNumber, timestamp: Date.now() });

    const searchTab = await searchFreshService(phoneNumber);

    // Identify the requester, but prep the new ticket even when identification
    // fails, so the tech has a partially-filled ticket (template + Ph#) while
    // they search manually. If they later use "Continue with active tab",
    // handleManualContinue autofills again with the now-known requester —
    // safe because rewriteDescription() replaces each line's value in place
    // rather than appending to it, and only trims the template's boilerplate
    // down to the keep lines once, so a second pass updates values without
    // duplicating text or touching anything the tech added in between
    let requesterData: StoredRequester | undefined;
    let searchError: unknown;
    try {
      requesterData = await processSearchResults(searchTab.id!, phoneNumber);
    } catch (error) {
      searchError = error;
    }

    // Only a uniquely identified requester has a profile page to check; the
    // profile tab is opened (and awaited) here rather than at the end so its
    // assigned laptop, if any, can be included in the single autofill pass below
    if (requesterData) {
      requesterData = { ...requesterData, ticketTabId: ticketTab.id };
      const profileTab = await openRequesterProfileTab(requesterData);
      const assetLookup = await lookupRequesterAssets(profileTab.id!, requesterData.requesterName);
      requesterData = { ...requesterData, ...assetLookup };
    }

    // TM Name and Laptop# are left blank when not uniquely determined
    const autofillOutcome = await autofillNewTicket(
      ticketTab.id!,
      requesterData?.requesterName ?? '',
      phoneNumber,
      requesterData?.laptopNumber ?? ''
    );

    if (searchError !== undefined || !requesterData) {
      // processSearchResults already reported the specific failure to the
      // sidepanel; leave the pending run persisted so the manual continue
      // path can pick up this ticket tab/phone number once the tech finds
      // the correct requester
      return;
    }

    // A requester was identified, so the manual continue path no longer applies
    await StorageService.clearPendingRun();

    if (!autofillOutcome.success) {
      sendWorkflowError(
        'Ticket autofill failed',
        `${autofillOutcome.error} Fill the ticket description manually.`
      );
      return;
    }

    requesterData = {
      ...requesterData,
      requesterAutoSelected: autofillOutcome.requesterAutoSelected,
      requesterSelectionNote: autofillOutcome.requesterSelectionNote,
    };
    // Re-persist the enriched data (assets, ticketTabId, requester selection
    // outcome) — the earlier setCurrentRequester in processSearchResults only
    // had the initial name/userId/phone. A later laptop selection (see
    // handleSelectLaptop) needs this full record to re-autofill the ticket.
    await StorageService.setCurrentRequester(requesterData);
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
 * Manual continue path: resumes a run whose automated identification failed.
 * The tech has manually searched FreshService and left the correct
 * requester's profile page focused; this reads their name/userId from that
 * tab, looks up assets, and autofills the ticket from the original run
 * @throws Nothing - all failures are reported via sendWorkflowError
 */
async function handleManualContinue(): Promise<void> {
  try {
    const pendingRun = await StorageService.getPendingRun();
    if (!pendingRun) {
      sendWorkflowError(
        'No pending workflow',
        'Run the workflow first, then use Continue if it fails to identify a requester.'
      );
      return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const requesterUserId = extractUserIdFromProfileUrl(activeTab?.url);
    if (!activeTab?.id || !requesterUserId) {
      sendWorkflowError(
        'No requester profile tab focused',
        `Open the correct requester's FreshService profile page, leave it as the focused tab, then click Continue again.`
      );
      return;
    }
    const profileTabId = activeTab.id;

    sendWorkflowUpdate('Reading requester profile...');
    const nameResult = await MessageService.getRequesterProfileInfo(profileTabId);
    const requesterName = nameResult.success && nameResult.name ? nameResult.name : '';

    let requesterData: StoredRequester = {
      requesterName,
      requesterUserId,
      phoneNumber: pendingRun.phoneNumber,
      timestamp: Date.now(),
      source: 'manual',
      ticketTabId: pendingRun.ticketTabId,
    };
    await StorageService.setCurrentRequester(requesterData);

    const assetLookup = await lookupRequesterAssets(profileTabId, requesterName || '(unknown)');
    requesterData = { ...requesterData, ...assetLookup };

    let ticketTabExists = true;
    try {
      await chrome.tabs.get(pendingRun.ticketTabId);
    } catch {
      ticketTabExists = false;
    }

    await StorageService.clearPendingRun();

    if (!ticketTabExists) {
      sendWorkflowError('New ticket tab was closed', 'Create the ticket manually using the details below.');
      sendWorkflowComplete(requesterData);
      return;
    }

    const autofillOutcome = await autofillNewTicket(
      pendingRun.ticketTabId,
      requesterData.requesterName,
      pendingRun.phoneNumber,
      requesterData.laptopNumber ?? ''
    );

    if (!autofillOutcome.success) {
      sendWorkflowError(
        'Ticket autofill failed',
        `${autofillOutcome.error} Fill the ticket description manually.`
      );
      return;
    }

    requesterData = {
      ...requesterData,
      requesterAutoSelected: autofillOutcome.requesterAutoSelected,
      requesterSelectionNote: autofillOutcome.requesterSelectionNote,
    };
    await StorageService.setCurrentRequester(requesterData);
    sendWorkflowComplete(requesterData);
  } catch (error) {
    sendWorkflowError('Extension Error', formatErrorWithStack(error, true));
  }
}

/**
 * Handles the tech picking the correct laptop from a "multiple assets found"
 * list in the sidepanel: re-autofills the same ticket's Laptop# line with the
 * chosen asset tag. Safe to run against an already-autofilled ticket — see
 * the INVARIANT note in ticket-form-filler.ts's autofillNewTicket(), which
 * this reuses unchanged; applyTemplate()/selectRequester()/selectAgent() are
 * all idempotent, so only the Laptop# value actually changes
 * @throws Nothing - all failures are reported via sendWorkflowError
 */
async function handleSelectLaptop(assetTag: string): Promise<void> {
  try {
    const current = await StorageService.getCurrentRequester();
    if (!current || current.ticketTabId === undefined) {
      sendWorkflowError('No active ticket to update', 'Run the workflow first, then select a laptop.');
      return;
    }

    try {
      await chrome.tabs.get(current.ticketTabId);
    } catch {
      sendWorkflowError('New ticket tab was closed', `Set Laptop# to ${assetTag} manually.`);
      return;
    }

    sendWorkflowUpdate(`Setting Laptop# to ${assetTag}...`);
    const autofillOutcome = await autofillNewTicket(
      current.ticketTabId,
      current.requesterName,
      current.phoneNumber,
      assetTag
    );

    if (!autofillOutcome.success) {
      sendWorkflowError(
        'Ticket autofill failed',
        `${autofillOutcome.error} Set Laptop# to ${assetTag} manually.`
      );
      return;
    }

    const updated: StoredRequester = {
      ...current,
      laptopNumber: assetTag,
      requesterAutoSelected: autofillOutcome.requesterAutoSelected,
      requesterSelectionNote: autofillOutcome.requesterSelectionNote,
    };
    await StorageService.setCurrentRequester(updated);
    sendWorkflowComplete(updated);
  } catch (error) {
    sendWorkflowError('Extension Error', formatErrorWithStack(error, true));
  }
}

/**
 * Extracts the requester userId from a FreshService profile tab's URL,
 * validating the origin. FreshService profile pages are reachable at two
 * path shapes that both resolve to the same page: /users/{id} (used when
 * this extension opens the tab itself, via FRESHSERVICE_USER_PROFILE_URL)
 * and /itil/requesters/{id} (what the tab's address bar actually shows,
 * e.g. after manually navigating there via search)
 */
function extractUserIdFromProfileUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(FRESHSERVICE_BASE_URL).origin) return undefined;
    return parsed.pathname.match(/^\/(?:users|itil\/requesters)\/(\d+)/)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Step 6: Autofill the new ticket with the Standard Ticket template and caller details
 * Failures are reported without aborting the workflow — the opened tabs are still useful
 * @param ticketTabId - The tab ID of the new ticket tab opened at workflow start
 * @param requesterName - Requester name ('' when not uniquely identified)
 * @param phoneNumber - The caller's phone number
 * @param laptopNumber - Asset tag for the Laptop# line ('' when none or multiple were found)
 * @returns The autofill result: success===false means the template/description
 *   couldn't be applied; requesterAutoSelected/Note report the independent,
 *   non-fatal outcome of the Requester field selection either way
 */
async function autofillNewTicket(
  ticketTabId: number,
  requesterName: string,
  phoneNumber: string,
  laptopNumber: string
): Promise<AutofillTicketResultMessage> {
  sendWorkflowUpdate('Prepping new ticket with Standard Ticket template...');
  try {
    // Foreground the ticket tab first: hidden tabs may never finish rendering
    // the Ember form, and the prepped ticket is where the tech works next
    await TabManager.activateTab(ticketTabId);
    await TabManager.waitForTabComplete(ticketTabId);

    const result = await sendAutofillWithRetry(ticketTabId, requesterName, phoneNumber, laptopNumber);
    if (!result.success) {
      console.error('Ticket autofill failed:', result.error);
      return { ...result, error: result.error || 'Ticket autofill failed for an unknown reason.' };
    }
    sendWorkflowUpdate('New ticket prepped with caller details.');
    return result;
  } catch (error) {
    console.error('Ticket autofill failed:', error);
    return {
      type: 'AUTOFILL_TICKET_RESULT',
      success: false,
      error: formatErrorWithStack(error, true),
      requesterAutoSelected: false,
    };
  }
}

/**
 * Sends the autofill message, retrying while the ticket tab's content script
 * may still be loading (the tab was opened without waiting for it)
 */
async function sendAutofillWithRetry(
  tabId: number,
  requesterName: string,
  phoneNumber: string,
  laptopNumber: string
): Promise<AutofillTicketResultMessage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < AUTOFILL_RETRY.attempts; attempt++) {
    if (attempt > 0) {
      await delay(AUTOFILL_RETRY.delayMs);
    }
    try {
      return await MessageService.autofillTicket(tabId, requesterName, phoneNumber, laptopNumber);
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
 * Step 5a: Open the identified requester's profile tab and wait for it to
 * load — needed (rather than fire-and-forget) so its Assets tab content can
 * be scraped for an assigned laptop before the ticket is autofilled
 * @param requesterData - The requester data containing user ID
 * @returns The opened profile tab
 */
async function openRequesterProfileTab(requesterData: StoredRequester): Promise<chrome.tabs.Tab> {
  return TabManager.createTabAndWait(FRESHSERVICE_USER_PROFILE_URL(requesterData.requesterUserId), false);
}

/**
 * Step 5b: Look up assets assigned to the requester from their (already open)
 * profile tab. Non-fatal: lookup failures are logged and leave laptopNumber/
 * assetTags unset rather than aborting the workflow, since a blank Laptop#
 * line was already the pre-existing behavior for manual fill-in
 * @param profileTabId - The tab ID of the requester's profile page
 * @param requesterName - Used only for the status message shown while looking up
 * @returns laptopNumber (set only when exactly one asset was found) and
 *   assetTags (all asset tags found, for the sidepanel to surface when there
 *   are multiple, so the tech can confirm the right one with the caller)
 */
async function lookupRequesterAssets(
  profileTabId: number,
  requesterName: string
): Promise<Pick<StoredRequester, 'laptopNumber' | 'assetTags'>> {
  sendWorkflowUpdate(`Checking assigned assets for ${requesterName}...`);
  try {
    const result = await fetchAssetsWithRetry(profileTabId);
    if (!result.success || !result.data) {
      console.error('Asset lookup failed:', result.error);
      return {};
    }
    const assetTags = result.data.assets.map((asset) => asset.assetTag);
    return {
      assetTags,
      laptopNumber: assetTags.length === 1 ? assetTags[0] : undefined,
    };
  } catch (error) {
    console.error('Asset lookup failed:', formatErrorWithStack(error, true));
    return {};
  }
}

/**
 * Sends the asset lookup message, retrying while the profile tab's content
 * script may still be loading (the tab was just created)
 */
async function fetchAssetsWithRetry(tabId: number): Promise<RequesterAssetsResultMessage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ASSET_LOOKUP_RETRY.attempts; attempt++) {
    if (attempt > 0) {
      await delay(ASSET_LOOKUP_RETRY.delayMs);
    }
    try {
      return await MessageService.getRequesterAssets(tabId);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
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

