import { 
  Message, 
  TriggerWorkflowMessage, 
  WorkflowUpdateMessage, 
  WorkflowCompleteMessage, 
  WorkflowErrorMessage,
  StoredRequester 
} from '../types';
import { TabManager } from '../services/tab-manager';
import { StorageService } from '../services/storage-service';
import { MessageService } from '../services/message-service';
import { 
  RINGCENTRAL_PATTERN, 
  FRESHSERVICE_SEARCH_URL, 
  FRESHSERVICE_NEW_TICKET_URL,
  FRESHSERVICE_USER_PROFILE_URL 
} from '../utils/config';

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
    // Step 1: Find RingCentral MAX tab
    sendWorkflowUpdate('Searching for MAX window...');
    const maxTab = await TabManager.findTabByUrl(RINGCENTRAL_PATTERN);
    
    sendWorkflowUpdate('Found MAX window. Checking for call data...');
    
    // Step 2: Get calling number from RingCentral content script
    const callingNumberResult = await MessageService.getCallingNumber(maxTab.id!);
    
    if (!callingNumberResult.success || !callingNumberResult.phoneNumber) {
      sendWorkflowError(
        'No customer number found',
        callingNumberResult.error || 'No active call detected or calling number not available'
      );
      return;
    }
    
    const phoneNumber = callingNumberResult.phoneNumber;
    sendWorkflowUpdate(`Phone number found: ${phoneNumber}. Searching FreshService...`);
    
    // Step 3: Create FreshService search tab
    const searchUrl = `${FRESHSERVICE_SEARCH_URL}?term=${phoneNumber}`;
    const searchTab = await TabManager.createTabAndWait(searchUrl, true);
    
    sendWorkflowUpdate('Searching for requester...');
    
    // Step 4: Scrape search results
    const searchResults = await MessageService.scrapeSearchResults(searchTab.id!);
    
    if (!searchResults.success || !searchResults.data?.found || searchResults.data.scenario !== 1) {
      // Not scenario 1 - requester not found or multiple found
      const reason = searchResults.data?.reason || searchResults.error || 'Unknown error';
      const count = searchResults.data?.count;
      
      sendWorkflowError(
        'Requester not uniquely identified',
        `${reason}${count ? ` (Found ${count} requesters)` : ''}. Manual selection may be required.`
      );
      
      // Still open new incident tab for manual work
      await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
      return;
    }
    
    // Step 5: Store requester data
    const requesterData: StoredRequester = {
      requesterName: searchResults.data.name!,
      requesterUserId: searchResults.data.userId!,
      phoneNumber: phoneNumber,
      timestamp: Date.now(),
    };
    
    await StorageService.setCurrentRequester(requesterData);
    
    sendWorkflowUpdate('Requester found. Opening tabs...');
    
    // Step 6: Open additional tabs
    await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
    await TabManager.createTab(FRESHSERVICE_USER_PROFILE_URL(requesterData.requesterUserId), false);
    
    // Step 7: Notify sidepanel of completion
    sendWorkflowComplete(requesterData);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack?.split('\n')[0] : undefined;
    
    sendWorkflowError(
      'Extension Error',
      `${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ''}`
    );
  }
}

/**
 * Send workflow update message to sidepanel
 */
function sendWorkflowUpdate(message: string): void {
  const updateMessage: WorkflowUpdateMessage = {
    type: 'WORKFLOW_UPDATE',
    status: 'in_progress',
    message: message,
  };
  
  // Send to sidepanel with callback to handle errors properly
  chrome.runtime.sendMessage(updateMessage, (response) => {
    if (chrome.runtime.lastError) {
      // Sidepanel might not be ready - this is expected and OK
      return;
    }
  });
}

/**
 * Send workflow completion message to sidepanel
 */
function sendWorkflowComplete(requesterData: StoredRequester): void {
  const completeMessage: WorkflowCompleteMessage = {
    type: 'WORKFLOW_COMPLETE',
    requesterData: requesterData,
  };
  
  chrome.runtime.sendMessage(completeMessage, (response) => {
    if (chrome.runtime.lastError) {
      // Sidepanel might not be ready - this is expected and OK
      return;
    }
  });
}

/**
 * Send workflow error message to sidepanel
 */
function sendWorkflowError(error: string, details?: string): void {
  const errorMessage: WorkflowErrorMessage = {
    type: 'WORKFLOW_ERROR',
    error: error,
    details: details,
  };
  
  chrome.runtime.sendMessage(errorMessage, (response) => {
    if (chrome.runtime.lastError) {
      // Sidepanel might not be ready - this is expected and OK
      return;
    }
  });
}

