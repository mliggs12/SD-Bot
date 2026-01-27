# SD-Bot Chrome Extension - AI Assistant Context

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Code Organization](#architecture--code-organization)
3. [Design Patterns & Conventions](#design-patterns--conventions)
4. [Core Workflow](#core-workflow)
5. [Key Components Deep Dive](#key-components-deep-dive)
6. [Development Workflow](#development-workflow)
7. [Configuration & Environment](#configuration--environment)
8. [Testing & Debugging](#testing--debugging)
9. [Extension Points & Customization](#extension-points--customization)
10. [Common Patterns for AI Assistants](#common-patterns-for-ai-assistants)
11. [Important Considerations](#important-considerations)

---

## Project Overview

### Purpose

SD-Bot is a Chrome browser extension that automates service desk workflows by integrating RingCentral MAX (call center platform) with FreshService (ticketing system). It streamlines the process of handling incoming calls by automatically:

- Extracting caller phone numbers from active calls
- Searching for requesters in FreshService
- Opening relevant tabs when a unique requester is found
- Providing real-time status updates via a side panel

### Technology Stack

- **Language**: TypeScript 5.9
- **Platform**: Chrome Extensions Manifest V3
- **Build Tool**: Webpack 5
- **Type Definitions**: `@types/chrome`, `chrome-types`
- **Runtime**: Chrome Extension APIs only (no external runtime dependencies)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌────────────────┐                   │
│  │   Side Panel │◄─────┤   Background   │                   │
│  │      UI      │      │Service Worker  │                   │
│  └──────────────┘      └────┬───────┬───┘                   │
│                             │       │                        │
│                    ┌────────┘       └────────┐              │
│                    ▼                         ▼               │
│         ┌──────────────────┐    ┌───────────────────┐       │
│         │  RingCentral MAX │    │   FreshService    │       │
│         │ Content Script   │    │  Content Script   │       │
│         └────────┬─────────┘    └─────────┬─────────┘       │
│                  │                        │                  │
└──────────────────┼────────────────────────┼──────────────────┘
                   │                        │
                   ▼                        ▼
         ┌─────────────────┐      ┌──────────────────┐
         │ RingCentral MAX │      │   FreshService   │
         │   Web  Page     │      │    Web Page      │
         └─────────────────┘      └──────────────────┘
```

### Key Integrations

**RingCentral MAX**: `https://max.niceincontact.com/*`
- Extracts calling phone numbers from active call UI
- Uses DOM scraping with multiple fallback strategies

**FreshService**: `https://support.houseloan.com/*`
- Searches for requesters by phone number
- Opens new ticket and user profile tabs
- Parses search results to identify unique requesters

---

## Architecture & Code Organization

### Folder Structure

```
sd-bot/
├── src/
│   ├── background/
│   │   └── background.ts           # Main workflow orchestrator
│   ├── content/
│   │   ├── freshservice.ts         # FreshService content script
│   │   └── ringcentral.ts          # RingCentral content script
│   ├── scrapers/
│   │   ├── freshservice-scraper.ts # FreshService DOM scraping
│   │   └── ringcentral-scraper.ts  # RingCentral DOM scraping
│   ├── services/
│   │   ├── message-service.ts      # Chrome messaging abstraction
│   │   ├── storage-service.ts      # Chrome storage abstraction
│   │   └── tab-manager.ts          # Tab lifecycle management
│   ├── sidepanel/
│   │   ├── sidepanel.html          # Side panel UI
│   │   └── sidepanel.ts            # Side panel logic
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── utils/
│   │   ├── config.ts               # Configuration constants
│   │   ├── content-message-handler.ts # Generic message handler
│   │   └── error-handler.ts        # Error formatting utilities
│   └── images/
│       └── icon-128.png            # Extension icon
├── dist/                           # Build output (generated)
├── manifest.json                   # Extension manifest (source)
├── package.json                    # NPM configuration
├── tsconfig.json                   # TypeScript configuration
├── webpack.config.ts               # Build configuration
└── claude.md                       # This file
```

### Component Responsibilities

#### Background Service Worker ([src/background/background.ts](src/background/background.ts))
- **Main orchestrator** of extension workflow
- Listens for extension icon clicks to open side panel
- Manages 5-step workflow execution
- Coordinates communication between content scripts
- Sends status updates to side panel
- Handles errors and recovery

#### Content Scripts
- **RingCentral** ([src/content/ringcentral.ts](src/content/ringcentral.ts)): Injected into RingCentral MAX pages
- **FreshService** ([src/content/freshservice.ts](src/content/freshservice.ts)): Injected into FreshService pages
- Both use generic message handler pattern for consistency
- Delegate actual scraping to specialized scraper modules

#### Scrapers
- **RingCentral Scraper** ([src/scrapers/ringcentral-scraper.ts](src/scrapers/ringcentral-scraper.ts)):
  - Extracts phone numbers from call UI
  - 3 fallback methods: bold tags → paragraph text → iframe content
  - Returns structured CallingNumberResult

- **FreshService Scraper** ([src/scrapers/freshservice-scraper.ts](src/scrapers/freshservice-scraper.ts)):
  - Parses search results page
  - Identifies requester section
  - Handles 3 scenarios: single match (success), no match, multiple matches
  - Returns structured RequesterData

#### Services
- **TabManager** ([src/services/tab-manager.ts](src/services/tab-manager.ts)):
  - Find tabs by URL pattern
  - Create tabs with optional load waiting
  - Tab lifecycle management with timeouts

- **MessageService** ([src/services/message-service.ts](src/services/message-service.ts)):
  - Type-safe message passing
  - Sends messages to content scripts and background
  - Sends fire-and-forget messages to sidepanel
  - Promise-based API wrapping Chrome callbacks

- **StorageService** ([src/services/storage-service.ts](src/services/storage-service.ts)):
  - Type-safe Chrome storage operations
  - Stores current requester data
  - Get/set/clear operations

#### Side Panel ([src/sidepanel/](src/sidepanel/))
- HTML interface for workflow status
- Displays requester information
- Real-time updates during workflow execution
- Auto-triggers workflow on panel open

#### Utilities
- **Config** ([src/utils/config.ts](src/utils/config.ts)): URL patterns, DOM selectors, timeouts, test mode
- **Content Message Handler** ([src/utils/content-message-handler.ts](src/utils/content-message-handler.ts)): Generic message handler factory
- **Error Handler** ([src/utils/error-handler.ts](src/utils/error-handler.ts)): Error formatting utilities

#### Types ([src/types/index.ts](src/types/index.ts))
- 12 message type definitions
- Data structure interfaces (CallingNumberResult, RequesterData, StoredRequester)
- Custom error classes (ExtensionError, ScraperError, TabError)
- Type guard functions for runtime type checking

---

## Design Patterns & Conventions

### Messaging Pattern

Type-safe message passing using discriminated unions:

```typescript
// Define message types
export type MessageType =
  | 'GET_CALLING_NUMBER'
  | 'CALLING_NUMBER_RESULT'
  | 'WORKFLOW_UPDATE'
  // ...

// Each message extends BaseMessage
export interface WorkflowUpdateMessage extends BaseMessage {
  type: 'WORKFLOW_UPDATE';
  status: string;
  message: string;
}

// Union type for all messages
export type Message =
  | GetCallingNumberMessage
  | CallingNumberResultMessage
  // ...

// Send messages using MessageService
MessageService.sendToTab<CallingNumberResultMessage>(tabId, {
  type: 'GET_CALLING_NUMBER'
});
```

### Service Layer Abstraction

Services wrap Chrome APIs with Promise-based interfaces:

```typescript
export class MessageService {
  static async sendToTab<TResponse extends Message>(
    tabId: number,
    message: Message
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }
}
```

### Scraper Pattern

DOM extraction logic isolated from business logic:

```typescript
// Scraper returns structured result
export function extractCallingNumber(): CallingNumberResult {
  try {
    // Method 1: Try bold tag
    const phoneNumber = findInBoldTag();
    if (phoneNumber) {
      return { success: true, phoneNumber };
    }

    // Method 2: Fallback to paragraph
    const number = findInParagraph();
    if (number) {
      return { success: true, phoneNumber: number };
    }

    // Return detailed error if all methods fail
    return {
      success: false,
      error: 'Calling number not found. Page may not be fully loaded.'
    };
  } catch (error) {
    return {
      success: false,
      error: `Error extracting calling number: ${formatErrorWithStack(error, true)}`
    };
  }
}
```

### Error Handling Strategy

Custom error classes with context:

```typescript
export class ExtensionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export class ScraperError extends ExtensionError {
  constructor(message: string, details?: unknown) {
    super(message, 'SCRAPER_ERROR', details);
    this.name = 'ScraperError';
  }
}
```

Consistent error formatting:

```typescript
// Use formatErrorWithStack for consistent error messages
import { formatErrorWithStack } from '../utils/error-handler';

try {
  // ...operation
} catch (error) {
  return {
    success: false,
    error: `Error message: ${formatErrorWithStack(error, true)}`
  };
}
```

### TypeScript Conventions

**Strict typing throughout**:
- All functions have explicit return types
- Interfaces for all data structures
- Type guards for runtime type checking
- No `any` types (use `unknown` when type is truly unknown)

**Type guards for safer conditionals**:

```typescript
// Define type guard
export function isSuccessfulCallingNumberResult(
  result: CallingNumberResult
): result is CallingNumberResult & { success: true; phoneNumber: string } {
  return result.success === true && !!result.phoneNumber;
}

// Use in code
const result = await MessageService.getCallingNumber(tabId);
if (!isSuccessfulCallingNumberResult(result)) {
  throw new Error(result.error || 'Failed to get calling number');
}
// TypeScript now knows result.phoneNumber is defined
const phoneNumber = result.phoneNumber;
```

### Async/Promise Patterns

- All async operations use `async`/`await`
- Chrome callback APIs wrapped in Promises
- Errors propagate through Promise chain
- Fire-and-forget messages for sidepanel updates

---

## Core Workflow

### 5-Step Automation Workflow

The workflow executes when the user clicks the extension icon:

**Step 1: Find RingCentral MAX Tab**
```typescript
async function findRingCentralTab(): Promise<number> {
  const tab = await TabManager.findTabByPattern(RINGCENTRAL_PATTERN);
  if (!tab) {
    throw new Error('No RingCentral MAX tab found');
  }
  return tab.id!;
}
```

**Step 2: Extract Calling Number**
```typescript
async function extractCallingNumber(tabId: number): Promise<string> {
  const result = await MessageService.getCallingNumber(tabId);
  if (!isSuccessfulCallingNumberResult(result)) {
    throw new Error(result.error || 'No active call detected');
  }
  return result.phoneNumber;
}
```

**Step 3: Search FreshService**
```typescript
async function searchFreshService(phoneNumber: string): Promise<number> {
  const searchUrl = `${FRESHSERVICE_SEARCH_URL}?query=${phoneNumber}`;
  const searchTab = await TabManager.createTabAndWait(searchUrl);
  return searchTab.id!;
}
```

**Step 4: Process Search Results**
```typescript
async function processSearchResults(
  searchTabId: number,
  phoneNumber: string
): Promise<StoredRequester> {
  const searchResults = await MessageService.scrapeSearchResults(searchTabId);

  if (!searchResults.success || !searchResults.data ||
      !isSuccessfulSingleMatchResult(searchResults.data)) {
    throw new Error('Requester not uniquely identified');
  }

  const requesterData: StoredRequester = {
    requesterName: searchResults.data.name,
    requesterUserId: searchResults.data.userId,
    phoneNumber: phoneNumber,
    timestamp: Date.now()
  };

  await StorageService.setCurrentRequester(requesterData);
  return requesterData;
}
```

**Step 5: Open Requester Tabs**
```typescript
async function openRequesterTabs(requesterData: StoredRequester): Promise<void> {
  await TabManager.createTab(FRESHSERVICE_NEW_TICKET_URL, false);
  await TabManager.createTab(
    FRESHSERVICE_USER_PROFILE_URL(requesterData.requesterUserId),
    false
  );
}
```

### Data Flow

```
User Click → Background Service Worker
                    ↓
         Find RingCentral Tab
                    ↓
         Send GET_CALLING_NUMBER message → RingCentral Content Script
                    ↓                              ↓
         Wait for response              Run scraper, return result
                    ↓                              ↓
         Receive CallingNumberResultMessage ←──────┘
                    ↓
         Create FreshService Search Tab
                    ↓
         Send SCRAPE_SEARCH_RESULTS message → FreshService Content Script
                    ↓                                   ↓
         Wait for response                     Run scraper, return result
                    ↓                                   ↓
         Receive SearchResultsResultMessage ←──────────┘
                    ↓
         Store requester data in Chrome Storage
                    ↓
         Open new ticket tab + user profile tab
                    ↓
         Send WORKFLOW_COMPLETE message → Side Panel
```

### State Management

**Chrome Storage** (chrome.storage.local):
- Stores current requester data
- Persists across extension reloads
- Type-safe access through StorageService

```typescript
interface StoredRequester {
  requesterName: string;
  requesterUserId: string;
  phoneNumber: string;
  timestamp: number;
}
```

### Error Handling & Recovery

**Graceful degradation**:
- If requester not found → Open new ticket tab for manual work
- If multiple requesters found → Show count, open new ticket tab
- If scraping fails → Display detailed error with context

**Error propagation**:
```typescript
try {
  await handleWorkflow();
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  sendWorkflowError('Workflow failed', errorMessage);
}
```

---

## Key Components Deep Dive

### Background Service Worker

**Lifecycle**:
- Persists as long as extension is installed
- Handles action button clicks
- Manages workflow execution
- Coordinates all communication

**Key functions**:
- `handleWorkflow()`: Main workflow orchestrator
- `sendWorkflowUpdate()`, `sendWorkflowComplete()`, `sendWorkflowError()`: Status updates to sidepanel

**Communication pattern**:
```typescript
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'TRIGGER_WORKFLOW') {
    handleWorkflow();
  }
});
```

### Content Scripts

**Injection**: Defined in [manifest.json](manifest.json)
```json
"content_scripts": [
  {
    "matches": ["https://max.niceincontact.com/*"],
    "js": ["dist/content/ringcentral.js"]
  },
  {
    "matches": ["https://support.houseloan.com/*"],
    "js": ["dist/content/freshservice.js"]
  }
]
```

**Generic pattern** ([src/utils/content-message-handler.ts](src/utils/content-message-handler.ts)):
```typescript
export function createMessageHandler<TRequest, TResult>(
  requestType: string,
  handler: () => TResult
): (message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response: Message) => void) => boolean {
  return (message, sender, sendResponse) => {
    if (message.type === requestType) {
      try {
        const result = handler();
        sendResponse(result as unknown as Message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ type: 'ERROR', error: errorMessage } as unknown as Message);
      }
      return true;
    }
    return false;
  };
}
```

### Scraper Implementation

**Multiple fallback strategies** ([src/scrapers/ringcentral-scraper.ts](src/scrapers/ringcentral-scraper.ts)):

1. **Method 1**: Target bold tag with "Calling Number:" text
2. **Method 2**: Search paragraphs for pattern
3. **Method 3**: Check iframe content

**Detailed error context**:
```typescript
return {
  success: false,
  error: `Calling number not found. Found ${boldCount} bold tags, ${pCount} paragraphs. Page may not be fully loaded.`
};
```

### Tab Management

**Tab creation with optional waiting** ([src/services/tab-manager.ts](src/services/tab-manager.ts)):

```typescript
static async createTabAndWait(url: string, timeout: number = TIMEOUTS.tabLoad): Promise<chrome.tabs.Tab> {
  const tab = await chrome.tabs.create({ url, active: false });

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TabError(`Tab load timeout after ${timeout}ms`));
    }, timeout);

    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        setTimeout(() => resolve(tab), TIMEOUTS.contentRender);
      }
    });
  });
}
```

### Side Panel Interaction

**Message listener**:
```typescript
chrome.runtime.onMessage.addListener(handleMessage);

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
```

**Auto-trigger workflow**:
```typescript
function initAndTrigger(): void {
  const LISTENER_SETUP_DELAY = 100;
  init();
  setTimeout(() => triggerWorkflow(), LISTENER_SETUP_DELAY);
}
```

---

## Development Workflow

### Prerequisites

- Node.js 18+ and npm
- Chrome browser
- Git

### Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

### Build Commands

**Production build**:
```bash
npm run build
```
- Minifies code
- Generates source maps
- Outputs to `dist/`

**Development mode** (with watch):
```bash
npm run start
```
- Watches for file changes
- Rebuilds automatically
- Generates unminified code with source maps

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` directory from the project
5. Extension should appear in your extensions list

### Debugging Techniques

**Background Service Worker**:
- Go to `chrome://extensions/`
- Find SD-Bot and click "Inspect views: service worker"
- Use Chrome DevTools console

**Content Scripts**:
- Open the web page (RingCentral or FreshService)
- Open DevTools (F12)
- Check Console tab for content script logs
- Use Sources tab to set breakpoints in content scripts

**Side Panel**:
- Open side panel by clicking extension icon
- Right-click in side panel → "Inspect"
- Use Chrome DevTools

**Console Logging**:
All components use `console.log`, `console.error` for logging. Check appropriate DevTools console.

### Test Mode Configuration

Located in [src/utils/config.ts](src/utils/config.ts):

```typescript
// WARNING: TEST_MODE should be 'false' in production builds!
export const TEST_MODE = false;
export const TEST_PHONE_NUMBER = '7207579434';
```

**When TEST_MODE = true**:
- Skips finding RingCentral tab
- Uses static TEST_PHONE_NUMBER instead of extracting from call
- Useful for testing FreshService integration without active call

**For development**:
1. Set `TEST_MODE = true` in config.ts
2. Rebuild: `npm run build`
3. Reload extension in Chrome
4. Test workflow without needing active RingCentral call

**IMPORTANT**: Always set `TEST_MODE = false` before production deployment!

---

## Configuration & Environment

### Config File Structure

[src/utils/config.ts](src/utils/config.ts) contains all configuration:

```typescript
// Domain and URL configuration
export const RINGCENTRAL_DOMAIN = 'https://max.niceincontact.com';
export const RINGCENTRAL_PATTERN = 'https://max.niceincontact.com/*';

export const FRESHSERVICE_BASE_URL = 'https://support.houseloan.com';
export const FRESHSERVICE_SEARCH_URL = `${FRESHSERVICE_BASE_URL}/search/all`;
export const FRESHSERVICE_NEW_TICKET_URL = `${FRESHSERVICE_BASE_URL}/a/tickets/new`;
export const FRESHSERVICE_USER_PROFILE_URL = (userId: string) =>
  `${FRESHSERVICE_BASE_URL}/users/${userId}`;

// DOM selectors for RingCentral MAX
export const RINGCENTRAL_SELECTORS = {
  callingNumberBold: 'b',
  callingNumberText: 'Calling Number:',
  paragraph: 'p',
  iframe: 'iframe[allow*="camera"]',
} as const;

// DOM selectors for FreshService
export const FRESHSERVICE_SELECTORS = {
  searchResultsContainer: '#search-page-results',
  sectionList: 'ul',
  sectionHeading: 'li.heading',
  requestersHeading: 'Requesters',
  requesterLink: 'a.search-title',
} as const;

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  tabLoad: 10000, // 10 seconds for tab to load
  contentRender: 500, // 500ms additional delay for content rendering
} as const;
```

### URL Patterns and Selectors

**Updating for different instances**:

If your organization uses different URLs:

1. Update `RINGCENTRAL_DOMAIN` and `RINGCENTRAL_PATTERN`
2. Update `FRESHSERVICE_BASE_URL`
3. Update [manifest.json](manifest.json) content_scripts matches and host_permissions

**Updating selectors**:

If UI changes break scraping:

1. Inspect the page DOM
2. Update appropriate selectors in config.ts
3. Rebuild extension

### Timeout Configurations

**Tab load timeout**: 10 seconds
- Waits for tab.status === 'complete'
- Adjustable via `TIMEOUTS.tabLoad`

**Content render delay**: 500ms
- Additional wait after page load for dynamic content
- Adjustable via `TIMEOUTS.contentRender`

---

## Testing & Debugging

### Test Mode Setup

1. Set `TEST_MODE = true` in [src/utils/config.ts](src/utils/config.ts)
2. Optionally update `TEST_PHONE_NUMBER` to test with different number
3. Run `npm run build`
4. Reload extension in Chrome

### Manual Testing Workflow

**With Test Mode** (recommended for development):
1. Enable test mode
2. Rebuild and reload extension
3. Click extension icon
4. Verify it:
   - Skips RingCentral tab search
   - Uses test phone number
   - Searches FreshService
   - Shows results in side panel

**Without Test Mode** (integration testing):
1. Open RingCentral MAX tab
2. Start an active call
3. Open FreshService tab (any page)
4. Click extension icon
5. Verify full workflow

### Common Debugging Scenarios

**"No RingCentral MAX tab found"**:
- Ensure RingCentral tab is open with correct URL pattern
- Check manifest.json matches pattern is correct
- Try test mode to bypass this step

**"Calling number not found"**:
- Ensure call is active (not ringing, not on hold)
- Inspect RingCentral page for DOM structure changes
- Check if "Calling Number:" text is visible on page
- Update selectors in config.ts if needed

**"Requester not uniquely identified"**:
- Check FreshService search results page manually
- Verify phone number exists in requester's profile
- Check if multiple requesters have same phone number

**"Multiple requesters found (N)"**:
- This is expected behavior when N > 1
- Extension opens new ticket tab for manual selection
- Check requester data in FreshService

### Chrome Extension Debugging Tools

**chrome://extensions/** page:
- View extension details
- Check errors
- Inspect service worker
- Reload extension

**Chrome DevTools**:
- Network tab: Monitor API calls
- Console tab: View logs
- Sources tab: Set breakpoints
- Application tab: Check chrome.storage

### Error Message Interpretation

All error messages include context:

**Scraper errors**:
```
"Error scraping search results: Cannot read property 'textContent' of null
Stack: at scrapeSearchResults (freshservice-scraper.ts:67:45)"
```
- Shows exact error and stack trace
- Points to code location

**Tab errors**:
```
"Tab load timeout after 10000ms for URL: https://support.houseloan.com/search/all?query=1234567890"
```
- Shows timeout duration
- Shows URL that failed to load

---

## Extension Points & Customization

### Adding New Scrapers

1. Create scraper file in [src/scrapers/](src/scrapers/):

```typescript
import { MyDataResult } from '../types';
import { formatErrorWithStack } from '../utils/error-handler';

export function scrapeMyData(): MyDataResult {
  try {
    const element = document.querySelector('#my-data');
    if (!element) {
      return {
        success: false,
        error: 'Element not found'
      };
    }

    return {
      success: true,
      data: element.textContent
    };
  } catch (error) {
    return {
      success: false,
      error: `Error scraping: ${formatErrorWithStack(error, true)}`
    };
  }
}
```

2. Create content script in [src/content/](src/content/):

```typescript
import { createMessageHandler } from '../utils/content-message-handler';
import { scrapeMyData } from '../scrapers/my-data-scraper';

chrome.runtime.onMessage.addListener(
  createMessageHandler('GET_MY_DATA', scrapeMyData)
);
```

3. Update [manifest.json](manifest.json):

```json
"content_scripts": [
  {
    "matches": ["https://example.com/*"],
    "js": ["dist/content/my-content.js"]
  }
]
```

4. Add to webpack.config.ts entry points
5. Define types in [src/types/index.ts](src/types/index.ts)

### Extending Message Types

1. Add message type to [src/types/index.ts](src/types/index.ts):

```typescript
export type MessageType =
  | 'GET_CALLING_NUMBER'
  | 'MY_NEW_MESSAGE' // Add here
  // ...

export interface MyNewMessage extends BaseMessage {
  type: 'MY_NEW_MESSAGE';
  myData: string;
}

export type Message =
  | GetCallingNumberMessage
  | MyNewMessage // Add to union
  // ...
```

2. Handle in appropriate listener:

```typescript
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'MY_NEW_MESSAGE') {
    // Handle message
  }
});
```

### Adding New Workflow Steps

Extend `handleWorkflow()` in [src/background/background.ts](src/background/background.ts):

```typescript
async function handleWorkflow(): Promise<void> {
  try {
    sendWorkflowUpdate('Starting workflow...');

    // Existing steps...
    const phoneNumber = await extractCallingNumber(tabId);

    // New step
    sendWorkflowUpdate('Running new step...');
    const newData = await performNewStep(phoneNumber);

    // Continue...
    sendWorkflowComplete(requesterData);
  } catch (error) {
    sendWorkflowError('Workflow failed', errorMessage);
  }
}
```

### Modifying UI Components

Update [src/sidepanel/sidepanel.html](src/sidepanel/sidepanel.html):

```html
<div id="result"></div>
<div id="requester-info">
  <p>Name: <span id="requester-name"></span></p>
  <p>Phone: <span id="phone-number"></span></p>
  <p>New Field: <span id="new-field"></span></p> <!-- Add new field -->
</div>
```

Update [src/sidepanel/sidepanel.ts](src/sidepanel/sidepanel.ts):

```typescript
const newFieldSpan = document.getElementById('new-field');

function handleWorkflowComplete(message: WorkflowCompleteMessage): void {
  if (newFieldSpan) {
    newFieldSpan.textContent = message.requesterData.newField;
  }
}
```

---

## Common Patterns for AI Assistants

### How to Add New Functionality

1. **Identify the layer**: Is it UI, business logic, or data access?
2. **Follow existing patterns**: Look for similar functionality
3. **Update types first**: Add to [src/types/index.ts](src/types/index.ts)
4. **Implement incrementally**: Build, test, iterate
5. **Update this document**: Keep claude.md current

### How to Modify Scrapers Safely

**DO**:
- Read the page first to understand current DOM structure
- Add fallback methods for robustness
- Include detailed error context
- Use type guards for result validation
- Test with multiple page states

**DON'T**:
- Make assumptions about DOM structure
- Use fragile selectors (nth-child, absolute positions)
- Ignore error cases
- Modify scraper without updating types

**Example safe modification**:

```typescript
// Before: Single method
const element = document.querySelector('#my-element');
return element.textContent;

// After: Multiple fallback methods with error handling
export function scrapeData(): DataResult {
  try {
    // Method 1: Try ID
    const byId = document.querySelector('#my-element');
    if (byId?.textContent) {
      return { success: true, data: byId.textContent };
    }

    // Method 2: Try class
    const byClass = document.querySelector('.my-class');
    if (byClass?.textContent) {
      return { success: true, data: byClass.textContent };
    }

    // Detailed error
    return {
      success: false,
      error: `Element not found. Tried ID and class selectors.`
    };
  } catch (error) {
    return {
      success: false,
      error: `Error scraping: ${formatErrorWithStack(error, true)}`
    };
  }
}
```

### How to Extend the Type System

1. **Add interface** to [src/types/index.ts](src/types/index.ts):

```typescript
export interface NewDataStructure {
  field1: string;
  field2?: number; // Optional fields use ?
  field3: boolean;
}
```

2. **Add type guard** if needed:

```typescript
export function isValidNewData(
  data: unknown
): data is NewDataStructure {
  return (
    typeof data === 'object' &&
    data !== null &&
    'field1' in data &&
    typeof (data as NewDataStructure).field1 === 'string'
  );
}
```

3. **Use in code**:

```typescript
const data: NewDataStructure = {
  field1: 'value',
  field3: true
};

// With type guard
if (isValidNewData(unknownData)) {
  // TypeScript knows unknownData is NewDataStructure
  console.log(unknownData.field1);
}
```

### How to Add New Service Methods

Extend service class with consistent patterns:

```typescript
export class MessageService {
  // Existing methods...

  /**
   * New method with full JSDoc
   * @param tabId - The tab ID
   * @param data - The data to send
   * @returns Promise with response
   */
  static async sendNewMessage(
    tabId: number,
    data: string
  ): Promise<NewResponseMessage> {
    const request: NewRequestMessage = {
      type: 'NEW_REQUEST',
      data: data
    };
    return this.sendToTab<NewResponseMessage>(tabId, request);
  }
}
```

### Best Practices for Maintaining Type Safety

1. **Never use `any`**: Use `unknown` if type is truly unknown
2. **Always define return types**: Even if TypeScript can infer
3. **Use type guards**: For runtime type validation
4. **Prefer interfaces over types**: For object shapes
5. **Use `as const`**: For constant objects and arrays
6. **Enable strict mode**: Already enabled in tsconfig.json

```typescript
// Good
function processData(data: unknown): string {
  if (typeof data !== 'string') {
    throw new Error('Expected string');
  }
  return data.toUpperCase();
}

// Bad
function processData(data: any): string {
  return data.toUpperCase(); // No type checking
}
```

---

## Important Considerations

### Chrome Extension Security Model

**Content Security Policy**:
- No inline scripts in HTML
- No eval() or new Function()
- No remote script loading
- All scripts must be in extension package

**Permissions**:
- Request minimal permissions needed
- Declared in manifest.json
- Users can see what extension can access

**Cross-Origin**:
- Content scripts run in isolated world
- Can access page DOM but not JavaScript variables
- Use message passing for communication

### Manifest V3 Limitations

**Service Workers** (vs background pages):
- No persistent state across restarts
- Use chrome.storage for persistence
- May be terminated when idle

**Host Permissions**:
- Must explicitly declare in manifest
- Required for content script injection
- Required for cross-origin requests

**Actions**:
- No background pages
- Use chrome.action instead of chrome.browserAction
- Side panel instead of popup for richer UI

### Cross-Origin Communication

**Content Scripts to Web Page**:
- Cannot directly access page JavaScript
- Must scrape DOM or use postMessage
- Our approach: DOM scraping

**Extension to External APIs**:
- Requires host_permissions in manifest
- Subject to CORS policies
- Consider using background service worker for API calls

### Permission Requirements

Current permissions in [manifest.json](manifest.json):

```json
"permissions": [
  "sidePanel",  // Open side panel
  "storage",    // Store requester data
  "tabs"        // Create and manage tabs
],
"host_permissions": [
  "https://max.niceincontact.com/*",
  "https://support.houseloan.com/*"
]
```

**When adding new features**, consider if new permissions needed:
- Accessing new domains → Add to host_permissions
- Using new Chrome APIs → Add to permissions
- Be conservative: Users see permission requests

### DOM Stability and Selector Reliability

**Challenges**:
- Web apps update frequently
- DOM structure can change without notice
- Selectors may break

**Mitigation strategies**:

1. **Multiple fallback methods**: As seen in RingCentral scraper
2. **Stable selectors**: Prefer IDs and semantic classes over structure
3. **Detailed error messages**: Help diagnose when selectors break
4. **Regular testing**: Test after web app updates
5. **Flexible matching**: Use contains, startsWith instead of exact matches

**Example**:
```typescript
// Fragile: Depends on exact structure
const element = document.querySelector('div > div > span.class1');

// Better: Multiple fallback methods
const element =
  document.querySelector('#stable-id') ||
  document.querySelector('[data-testid="element"]') ||
  Array.from(document.querySelectorAll('span')).find(
    el => el.textContent?.includes('Expected Text')
  );
```

**Monitor for breakage**:
- User reports of failures
- Check browser console for scraper errors
- Test extension after RingCentral or FreshService updates

---

## Version History

**Current Version**: 1.5.2

**Recent Changes**:
- Refactored message sending to use centralized helper
- Added type guards for improved type safety
- Consolidated error handling across scrapers
- Fixed TEST_MODE configuration for production safety
- Removed unused popup files
- Added DOM.Iterable support to tsconfig

---

## Additional Resources

**Chrome Extension Documentation**:
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)

**TypeScript Resources**:
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Type Guards](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)

**Project-Specific**:
- [README.md](README.md) - Project overview and basic setup
- [manifest.json](manifest.json) - Extension configuration
- [webpack.config.ts](webpack.config.ts) - Build configuration

---

*This document was created to provide comprehensive context for AI assistants working on the SD-Bot codebase. Keep it updated as the project evolves.*
