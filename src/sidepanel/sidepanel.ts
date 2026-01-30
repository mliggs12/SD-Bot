import { 
  Message, 
  TriggerWorkflowMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowErrorMessage 
} from '../types';

// UI elements
const resultDiv = document.getElementById('result');
const requesterNameSpan = document.getElementById('requester-name');
const phoneNumberSpan = document.getElementById('phone-number');
const laptopSerialSpan = document.getElementById('laptop-serial');

/**
 * Initialize the sidepanel
 */
function init(): void {
  if (!resultDiv) {
    console.error('Result div not found');
    return;
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Display initial state
  resultDiv.textContent = 'Ready. Click extension icon to start workflow.';
  resultDiv.className = '';
}

/**
 * Handle messages from background script
 */
function handleMessage(message: Message): void {
  switch (message.type) {
    case 'WORKFLOW_UPDATE':
      handleWorkflowUpdate(message);
      break;
    case 'WORKFLOW_COMPLETE':
      handleWorkflowComplete(message);
      break;
    case 'WORKFLOW_ERROR':
      handleWorkflowError(message);
      break;
  }
}

/**
 * Handle workflow update messages
 */
function handleWorkflowUpdate(message: WorkflowUpdateMessage): void {
  if (!resultDiv) return;

  // Extract and display phone number if present in message
  // Matches both: "Phone number found: 1234567890." and "Test Mode: Using static number 1234567890."
  const phoneMatch = message.message.match(/(?:Phone number found|Using static number): (\d+)\./);
  if (phoneMatch && phoneNumberSpan) {
    phoneNumberSpan.textContent = phoneMatch[1];
  }

  resultDiv.innerHTML = `
    <div style="color: #666;">${message.message}</div>
  `;
  resultDiv.className = '';
}

/**
 * Handle workflow completion
 */
function handleWorkflowComplete(message: WorkflowCompleteMessage): void {
  if (!resultDiv || !message.requesterData) return;

  const { requesterName, requesterUserId, phoneNumber } = message.requesterData;

  // Update UI elements
  if (requesterNameSpan) requesterNameSpan.textContent = requesterName;
  if (phoneNumberSpan) phoneNumberSpan.textContent = phoneNumber;

  // Simple status message - requester info is already shown above
  resultDiv.textContent = 'Workflow complete. All tabs opened.';
  resultDiv.className = '';
  resultDiv.style.color = '#28a745';
  resultDiv.style.fontWeight = 'bold';
}

/**
 * Handle workflow errors
 */
function handleWorkflowError(message: WorkflowErrorMessage): void {
  if (!resultDiv) return;
  
  const details = message.details ? `<br><div style="font-size: 11px; margin-top: 5px; color: #666;">${message.details}</div>` : '';
  
  resultDiv.innerHTML = `
    <div class="error">X ${message.error}</div>
    ${details}
  `;
  resultDiv.className = 'error';
}

/**
 * Trigger workflow when sidepanel opens
 * This will be called when user clicks extension icon
 */
function triggerWorkflow(): void {
  if (!resultDiv) return;

  resultDiv.textContent = 'Starting workflow...';

  const message: TriggerWorkflowMessage = {
    type: 'TRIGGER_WORKFLOW',
  };

  // Don't await - fire and forget, listen for updates via onMessage
  // The background script handles the workflow asynchronously and sends
  // updates via chrome.runtime.sendMessage() which we listen for in handleMessage()
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors - workflow will send updates via onMessage if it starts
    // If there's an error, the background script will send a WORKFLOW_ERROR message
  });
}

/**
 * Initialize sidepanel and trigger workflow
 * Small delay ensures message listener is fully registered before workflow starts
 */
function initAndTrigger(): void {
  const LISTENER_SETUP_DELAY = 100; // Wait for message listener to fully register
  init();
  setTimeout(() => triggerWorkflow(), LISTENER_SETUP_DELAY);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAndTrigger);
} else {
  initAndTrigger();
}
