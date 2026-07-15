import {
  Message,
  TriggerWorkflowMessage,
  PhoneNumberIdentifiedMessage,
  WorkflowUpdateMessage,
  WorkflowCompleteMessage,
  WorkflowErrorMessage
} from '../types';
import { StorageService } from '../services/storage-service';

// UI elements
const resultDiv = document.getElementById('result');
const requesterNameSpan = document.getElementById('requester-name');
const phoneNumberSpan = document.getElementById('phone-number');
const laptopSerialSpan = document.getElementById('laptop-serial');
const buildInfoDiv = document.getElementById('build-info');
const runWorkflowButton = document.getElementById('run-workflow') as HTMLButtonElement | null;
const testModeSection = document.getElementById('test-mode-section');
const testModeToggle = document.getElementById('test-mode-toggle') as HTMLInputElement | null;
const testPhoneInput = document.getElementById('test-phone') as HTMLInputElement | null;

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

  // Show version + build stamp so a stale dist/ build is immediately visible
  if (buildInfoDiv) {
    buildInfoDiv.textContent = `SD Bot v${chrome.runtime.getManifest().version} — built ${__BUILD_INFO__}`;
  }

  initTestModeControls();

  if (runWorkflowButton) {
    runWorkflowButton.addEventListener('click', () => triggerWorkflow());
  }
}

/**
 * Load persisted test mode settings into the controls and save on change
 * Test mode is read by the background script at workflow start, so no rebuild
 * or reload is needed to toggle it
 */
function initTestModeControls(): void {
  if (!testModeToggle || !testPhoneInput) return;

  StorageService.getTestModeSettings().then((settings) => {
    testModeToggle.checked = settings.enabled;
    testPhoneInput.value = settings.phoneNumber;
    updateTestModeUi();
  });

  testModeToggle.addEventListener('change', () => {
    updateTestModeUi();
    saveTestModeSettings();
  });
  testPhoneInput.addEventListener('input', () => saveTestModeSettings());
}

/**
 * Reflect the toggle state in the UI (highlight section, enable/disable input)
 */
function updateTestModeUi(): void {
  if (!testModeToggle || !testPhoneInput) return;
  testPhoneInput.disabled = !testModeToggle.checked;
  if (testModeSection) {
    testModeSection.classList.toggle('active', testModeToggle.checked);
  }
}

/**
 * Persist the current test mode controls to storage
 */
function saveTestModeSettings(): void {
  if (!testModeToggle || !testPhoneInput) return;
  StorageService.setTestModeSettings({
    enabled: testModeToggle.checked,
    phoneNumber: testPhoneInput.value.trim(),
  });
}

/**
 * Handle messages from background script
 */
function handleMessage(message: Message): void {
  switch (message.type) {
    case 'PHONE_NUMBER_IDENTIFIED':
      handlePhoneNumberIdentified(message);
      break;
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
 * Handle phone number identified message
 */
function handlePhoneNumberIdentified(message: PhoneNumberIdentifiedMessage): void {
  if (phoneNumberSpan) {
    phoneNumberSpan.textContent = message.phoneNumber;
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

  // Clear data from any previous run
  if (requesterNameSpan) requesterNameSpan.textContent = '';
  if (phoneNumberSpan) phoneNumberSpan.textContent = '';

  resultDiv.textContent = 'Starting workflow...';
  resultDiv.className = '';

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
