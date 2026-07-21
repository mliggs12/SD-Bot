import {
  Message,
  TriggerWorkflowMessage,
  ContinueWithManualRequesterMessage,
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
const manualContinueSection = document.getElementById('manual-continue-section') as HTMLDivElement | null;
const continueManualButton = document.getElementById('continue-manual-btn') as HTMLButtonElement | null;

// Errors from a failed automated identification that offer a manual continue
const MANUAL_CONTINUE_ERRORS = ['Requester not uniquely identified', 'Multiple requesters found'];

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
  resultDiv.textContent = 'Ready. Click "Run workflow" to start.';
  resultDiv.className = '';
  if (phoneNumberSpan) phoneNumberSpan.textContent = '';
  if (requesterNameSpan) requesterNameSpan.textContent = '';
  if (laptopSerialSpan) laptopSerialSpan.textContent = '';

  // Show version + build stamp so a stale dist/ build is immediately visible
  if (buildInfoDiv) {
    buildInfoDiv.textContent = `SD Bot v${chrome.runtime.getManifest().version} — built ${__BUILD_INFO__}`;
  }

  initTestModeControls();

  if (runWorkflowButton) {
    runWorkflowButton.addEventListener('click', () => triggerWorkflow());
  }
  if (continueManualButton) {
    continueManualButton.addEventListener('click', () => continueWithManualRequester());
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

  const { requesterName, phoneNumber, source, laptopNumber, assetTags } = message.requesterData;

  // Update UI elements
  if (requesterNameSpan) requesterNameSpan.textContent = requesterName;
  if (phoneNumberSpan) phoneNumberSpan.textContent = phoneNumber;
  if (laptopSerialSpan) laptopSerialSpan.textContent = formatLaptopDisplay(laptopNumber, assetTags);

  const sourceLabel = source === 'tickets' ? ' (matched from tickets)' : '';
  resultDiv.style.fontWeight = 'bold';

  // Multiple assets found: the ticket's Laptop# was left blank since we can't
  // guess which one — flag it so the tech knows to confirm with the caller
  if (assetTags && assetTags.length > 1) {
    resultDiv.textContent = `Workflow complete${sourceLabel}. Multiple laptops found — confirm with caller and fill Laptop# manually.`;
    resultDiv.className = 'warning';
    resultDiv.style.color = '';
  } else {
    resultDiv.textContent = `Workflow complete${sourceLabel}. All tabs opened.`;
    resultDiv.className = '';
    resultDiv.style.color = '#28a745';
  }
}

/**
 * Formats the sidepanel's Laptop # display: the asset tag when exactly one
 * was found, a list to prompt manual disambiguation when there were several,
 * or a "none found" note otherwise
 */
function formatLaptopDisplay(laptopNumber: string | undefined, assetTags: string[] | undefined): string {
  if (assetTags && assetTags.length > 1) {
    return `Multiple found (ask caller): ${assetTags.join(', ')}`;
  }
  return laptopNumber || 'None found';
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

  if (manualContinueSection && MANUAL_CONTINUE_ERRORS.includes(message.error)) {
    manualContinueSection.style.display = 'block';
  }
}

/**
 * Trigger workflow
 * Called when the user clicks the "Run workflow" button
 */
function triggerWorkflow(): void {
  if (!resultDiv) return;

  // Clear data from any previous run
  if (requesterNameSpan) requesterNameSpan.textContent = '';
  if (phoneNumberSpan) phoneNumberSpan.textContent = '';
  if (laptopSerialSpan) laptopSerialSpan.textContent = '';
  if (manualContinueSection) manualContinueSection.style.display = 'none';

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
 * Continue with a manually found requester
 * Called when the user clicks "Continue with active tab" after the automated
 * workflow failed to uniquely identify a requester. The tech is expected to
 * have manually searched FreshService and left the correct requester's
 * profile page focused before clicking.
 */
function continueWithManualRequester(): void {
  if (!resultDiv) return;

  if (requesterNameSpan) requesterNameSpan.textContent = '';
  if (laptopSerialSpan) laptopSerialSpan.textContent = '';
  if (manualContinueSection) manualContinueSection.style.display = 'none';

  resultDiv.textContent = 'Continuing with manually selected requester...';
  resultDiv.className = '';

  const message: ContinueWithManualRequesterMessage = {
    type: 'CONTINUE_WITH_MANUAL_REQUESTER',
  };

  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors - result will arrive via onMessage if it starts
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
