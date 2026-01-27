/// <reference types="chrome" />

import {
  Message,
  TriggerWorkflowMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowErrorMessage,
  StoredRequester,
  CallingNumberResultMessage,
  SearchResultsResultMessage,
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
      sendWorkflowUpdate(`Test Mode: Using static number ${phoneNumber}. Searching FreshService...`);
    } else {
      // Normal mode: find RingCentral tab and extract calling number
      const maxTab = await findRingCentralTab();
      phoneNumber = await extractCallingNumber(maxTab.id!);
    }
    
    const searchTab = await searchFreshService(phoneNumber);
    const requesterData = await processSearchResults(searchTab.id!, phoneNumber);
    await openRequesterTabs(requesterData);
    sendWorkflowComplete(requesterData);
  } catch (error) {
    const errorMessage = formatErrorWithStack(error, true);
    sendWorkflowError('Extension Error', errorMessage);
  }
}

/**
 * Step 1: Find RingCentral MAX tab
 * @returns The RingCentral MAX tab
 * @throws Error if tab is not found
 */
async function findRingCentralTab(): Promise<chrome.tabs.Tab> {
  sendWorkflowUpdate('Searching for MAX window...');
  const maxTab = await TabManager.findTabByUrl(RINGCENTRAL_PATTERN);
  sendWorkflowUpdate('Found MAX window. Checking for call data...');
  return maxTab;
}

/**
 * Step 2: Extract calling number from RingCentral content script
 * @param tabId - The tab ID of the RingCentral MAX tab
 * @returns The extracted phone number
 * @throws Error if calling number cannot be extracted
 */
async function extractCallingNumber(tabId: number): Promise<string> {
  const callingNumberResult = await MessageService.getCallingNumber(tabId);

  if (!isSuccessfulCallingNumberResult(callingNumberResult)) {
    throw new Error(
      callingNumberResult.error || 'No active call detected or calling number not available'
    );
  }

  const phoneNumber = callingNumberResult.phoneNumber;
  sendWorkflowUpdate(`Phone number found: ${phoneNumber}. Searching FreshService...`);
  return phoneNumber;
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
    const requesterData: StoredRequester = {
      requesterName: searchResults.data.name,
      requesterUserId: searchResults.data.userId,
      phoneNumber: phoneNumber,
      timestamp: Date.now(),
    };

    await StorageService.setCurrentRequester(requesterData);
    const source = searchResults.data.source === 'tickets' ? ' (from tickets)' : '';
    sendWorkflowUpdate(`Requester found${source}. Opening tabs...`);

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

    // Open new incident tab for manual work
    await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
    throw new Error(`Multiple requesters found: ${requesterNames}`);
  }

  // Scenario 3: Not found or other error
  const reason = searchResults.data?.reason || searchResults.error || 'Unknown error';
  const count = searchResults.data?.count;

  sendWorkflowError(
    'Requester not uniquely identified',
    `${reason}${count ? ` (Found ${count} requesters)` : ''}. Manual selection may be required.`
  );

  // Still open new incident tab for manual work
  await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
  throw new Error(`Requester not uniquely identified: ${reason}`);
}

/**
 * Step 5: Open tabs for requester (new ticket and user profile)
 * @param requesterData - The requester data containing user ID
 */
async function openRequesterTabs(requesterData: StoredRequester): Promise<void> {
  await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
  await TabManager.createTab(FRESHSERVICE_USER_PROFILE_URL(requesterData.requesterUserId), false);
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

