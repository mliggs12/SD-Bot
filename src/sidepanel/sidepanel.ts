import {
  Message,
  RequesterInfo,
  TriggerWorkflowMessage,
  PhoneNumberIdentifiedMessage,
  RequesterSelectionRequiredMessage,
  SelectRequesterMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowNoMatchMessage,
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
  if (phoneNumberSpan) phoneNumberSpan.textContent = '';
  if (requesterNameSpan) requesterNameSpan.textContent = '';
}

/**
 * Handle messages from background script
 */
function handleMessage(message: Message): void {
  switch (message.type) {
    case 'PHONE_NUMBER_IDENTIFIED':
      handlePhoneNumberIdentified(message);
      break;
    case 'REQUESTER_SELECTION_REQUIRED':
      handleRequesterSelectionRequired(message);
      break;
    case 'WORKFLOW_UPDATE':
      handleWorkflowUpdate(message);
      break;
    case 'WORKFLOW_COMPLETE':
      handleWorkflowComplete(message);
      break;
    case 'WORKFLOW_NO_MATCH':
      handleWorkflowNoMatch(message);
      break;
    case 'WORKFLOW_ERROR':
      handleWorkflowError(message);
      break;
  }
}

/**
 * Handle phone number identified message
 */
function handlePhoneNumberIdentified(message: PhoneNumberIdentifiedMessage): void {
  if (phoneNumberSpan) {
    phoneNumberSpan.textContent = message.phoneNumber;
  }
}

/**
 * Show the requester picker when the search matched more than one person.
 * Clicking a name resumes the background workflow with that requester.
 */
function handleRequesterSelectionRequired(message: RequesterSelectionRequiredMessage): void {
  if (!resultDiv) return;

  resultDiv.innerHTML = '';
  resultDiv.className = 'warning';
  resultDiv.removeAttribute('style');

  const title = document.createElement('div');
  title.className = 'picker-title';
  title.textContent = `Multiple requesters found (${message.requesters.length})`;
  resultDiv.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'picker-hint';
  const sourceLabel = message.source === 'tickets' ? 'past tickets' : 'search results';
  hint.textContent = `Matched ${message.phoneNumber} in ${sourceLabel}. Pick the caller to finish prepping the ticket:`;
  resultDiv.appendChild(hint);

  const buttons: HTMLButtonElement[] = [];
  for (const requester of message.requesters) {
    const button = document.createElement('button');
    button.className = 'requester-btn';
    button.textContent = requester.name;
    button.addEventListener('click', () => {
      buttons.forEach((b) => (b.disabled = true));
      selectRequester(requester);
    });
    buttons.push(button);
    resultDiv.appendChild(button);
  }
}

/**
 * Send the picked requester to the background script to finish the workflow
 */
function selectRequester(requester: RequesterInfo): void {
  if (requesterNameSpan) requesterNameSpan.textContent = requester.name;

  const message: SelectRequesterMessage = {
    type: 'SELECT_REQUESTER',
    requester: requester,
  };

  // Fire and forget - progress arrives via WORKFLOW_UPDATE/COMPLETE/ERROR
  chrome.runtime.sendMessage(message).catch(() => {
    // Errors are reported by the background script via WORKFLOW_ERROR
  });
}

/**
 * Handle a search that legitimately found no requester: the ticket is still
 * prepped with the phone number, so show a warning rather than an error
 */
function handleWorkflowNoMatch(message: WorkflowNoMatchMessage): void {
  if (!resultDiv) return;

  resultDiv.innerHTML = '';
  resultDiv.className = 'warning';
  resultDiv.removeAttribute('style');

  const title = document.createElement('div');
  title.className = 'picker-title';
  title.textContent = `No requester found for ${message.phoneNumber}`;
  resultDiv.appendChild(title);

  const body = document.createElement('div');
  body.className = 'picker-hint';
  body.textContent = message.ticketPrepped
    ? 'New ticket prepped with the phone number only — fill in the TM Name manually.'
    : 'The new ticket could not be prepped automatically — fill in the description manually.';
  resultDiv.appendChild(body);

  if (message.reason) {
    const detail = document.createElement('div');
    detail.style.fontSize = '11px';
    detail.style.color = '#666';
    detail.textContent = message.reason;
    resultDiv.appendChild(detail);
  }
}

/**
 * Handle workflow update messages
 */
function handleWorkflowUpdate(message: WorkflowUpdateMessage): void {
  if (!resultDiv) return;

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

  const { requesterName, requesterUserId, phoneNumber, source } = message.requesterData;

  // Update UI elements
  if (requesterNameSpan) requesterNameSpan.textContent = requesterName;
  if (phoneNumberSpan) phoneNumberSpan.textContent = phoneNumber;

  // Status message with source indicator
  const sourceLabel = source === 'tickets' ? ' (matched from tickets)' : '';
  resultDiv.textContent = `Workflow complete${sourceLabel}. All tabs opened.`;
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
