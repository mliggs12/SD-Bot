import {
  Message,
  TriggerWorkflowMessage,
  ContinueWithManualRequesterMessage,
  SelectLaptopMessage,
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
const copyLaptopButton = document.getElementById('copy-laptop-btn') as HTMLButtonElement | null;
const buildInfoDiv = document.getElementById('build-info');
const runWorkflowButton = document.getElementById('run-workflow') as HTMLButtonElement | null;
const testModeSection = document.getElementById('test-mode-section');
const testModeToggle = document.getElementById('test-mode-toggle') as HTMLInputElement | null;
const testPhoneInput = document.getElementById('test-phone') as HTMLInputElement | null;
const manualContinueSection = document.getElementById('manual-continue-section') as HTMLDivElement | null;
const continueManualButton = document.getElementById('continue-manual-btn') as HTMLButtonElement | null;
const laptopSelectSection = document.getElementById('laptop-select-section') as HTMLDivElement | null;
const laptopSelectButtons = document.getElementById('laptop-select-buttons') as HTMLDivElement | null;

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
  updateCopyButtonVisibility();
  hideLaptopSelectUi();

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
  if (copyLaptopButton) {
    copyLaptopButton.addEventListener('click', () => copyLaptopNumber());
  }
}

/**
 * Returns the laptop number text to copy, or null if nothing worth copying
 * is currently displayed: blank, "None found", or the "Multiple found" list
 * shown before the tech picks one via the laptop selection buttons
 */
function getCopyableLaptopText(): string | null {
  const text = laptopSerialSpan?.textContent?.trim();
  if (!text || text === 'None found' || text.startsWith('Multiple found')) return null;
  return text;
}

/**
 * Show/hide the copy button based on whether a laptop # is currently displayed
 */
function updateCopyButtonVisibility(): void {
  if (!copyLaptopButton) return;
  copyLaptopButton.style.display = getCopyableLaptopText() ? 'inline-block' : 'none';
}

/**
 * Copy the currently displayed laptop number to the clipboard as plain text,
 * with brief "Copied" feedback on the button
 */
function copyLaptopNumber(): void {
  if (!copyLaptopButton) return;

  const text = getCopyableLaptopText();
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    copyLaptopButton.textContent = 'Copied!';
    copyLaptopButton.classList.add('copied');
    setTimeout(() => {
      copyLaptopButton.textContent = 'Copy';
      copyLaptopButton.classList.remove('copied');
    }, 1500);
  }).catch((error) => {
    console.error('[SD-Bot] Failed to copy laptop number to clipboard:', error);
  });
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

  const { requesterName, phoneNumber, source, laptopNumber, assetTags, requesterAutoSelected } =
    message.requesterData;

  // Update UI elements
  if (requesterNameSpan) requesterNameSpan.textContent = requesterName;
  if (phoneNumberSpan) phoneNumberSpan.textContent = phoneNumber;
  if (laptopSerialSpan) laptopSerialSpan.textContent = formatLaptopDisplay(laptopNumber, assetTags);
  updateCopyButtonVisibility();
  updateLaptopSelectUi(laptopNumber, assetTags);

  const sourceLabel = source === 'tickets' ? ' (matched from tickets)' : '';
  resultDiv.style.fontWeight = 'bold';

  // Multiple assets found (and not yet resolved by a manual pick), or the
  // Requester field couldn't be uniquely auto-selected — either leaves
  // something for the tech to finish manually
  const warnings: string[] = [];
  if (!laptopNumber && assetTags && assetTags.length > 1) {
    warnings.push('Multiple laptops found — select the correct one below.');
  }
  if (requesterName && requesterAutoSelected === false) {
    warnings.push(`Requester field left blank — select "${requesterName}" manually.`);
  }

  if (warnings.length > 0) {
    resultDiv.textContent = `Workflow complete${sourceLabel}. ${warnings.join(' ')}`;
    resultDiv.className = 'warning';
    resultDiv.style.color = '';
  } else {
    resultDiv.textContent = `Workflow complete${sourceLabel}. All tabs opened.`;
    resultDiv.className = '';
    resultDiv.style.color = '#28a745';
  }
}

/**
 * Formats the sidepanel's Laptop # display: the asset tag once one is known
 * (whether it was the sole match found, or picked via the multi-laptop
 * selection buttons), a list to prompt disambiguation while several are
 * still unresolved, or a "none found" note otherwise
 */
function formatLaptopDisplay(laptopNumber: string | undefined, assetTags: string[] | undefined): string {
  if (laptopNumber) {
    return laptopNumber;
  }
  if (assetTags && assetTags.length > 1) {
    return `Multiple found (ask caller): ${assetTags.join(', ')}`;
  }
  return 'None found';
}

/**
 * Shows one button per candidate asset tag when multiple laptops were found
 * and none has been picked yet; hides the section otherwise (resolved, or
 * never ambiguous to begin with)
 */
function updateLaptopSelectUi(laptopNumber: string | undefined, assetTags: string[] | undefined): void {
  if (!laptopSelectSection || !laptopSelectButtons) return;

  const needsSelection = !laptopNumber && !!assetTags && assetTags.length > 1;
  if (!needsSelection) {
    hideLaptopSelectUi();
    return;
  }

  laptopSelectSection.style.display = 'block';
  laptopSelectButtons.innerHTML = '';
  assetTags.forEach((tag) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = tag;
    button.className = 'laptop-select-btn';
    button.addEventListener('click', () => selectLaptop(tag, button));
    laptopSelectButtons.appendChild(button);
  });
}

/**
 * Hides the laptop selection buttons and clears them, so a stale list from a
 * previous run never lingers into the next
 */
function hideLaptopSelectUi(): void {
  if (laptopSelectSection) laptopSelectSection.style.display = 'none';
  if (laptopSelectButtons) laptopSelectButtons.innerHTML = '';
}

/**
 * Called when the tech clicks one of the multi-laptop selection buttons.
 * Disables the buttons and tells the background to re-autofill the ticket's
 * Laptop# line with the chosen tag; the result arrives via the normal
 * WORKFLOW_UPDATE/WORKFLOW_COMPLETE/WORKFLOW_ERROR messages
 */
function selectLaptop(assetTag: string, button: HTMLButtonElement): void {
  if (laptopSelectButtons) {
    Array.from(laptopSelectButtons.querySelectorAll('button')).forEach((btn) => {
      (btn as HTMLButtonElement).disabled = true;
    });
  }
  button.dataset.originalLabel = assetTag;
  button.textContent = `Setting ${assetTag}...`;

  const message: SelectLaptopMessage = {
    type: 'SELECT_LAPTOP',
    assetTag,
  };

  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore - result/errors arrive via onMessage
  });
}

/**
 * Re-enables the laptop selection buttons and restores their labels after a
 * failed selection attempt (e.g. autofill failure), so the tech can retry a
 * different laptop instead of being stuck with disabled "Setting..." buttons
 */
function resetLaptopSelectButtons(): void {
  if (!laptopSelectButtons) return;
  Array.from(laptopSelectButtons.querySelectorAll('button')).forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = false;
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
    }
  });
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

  resetLaptopSelectButtons();
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
  updateCopyButtonVisibility();
  hideLaptopSelectUi();
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
  updateCopyButtonVisibility();
  hideLaptopSelectUi();
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
