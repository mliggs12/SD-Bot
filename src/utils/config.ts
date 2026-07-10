// Domain and URL configuration
export const RINGCENTRAL_DOMAIN = 'https://max.niceincontact.com';
export const RINGCENTRAL_PATTERN = 'https://max.niceincontact.com/*';

// The generic queue number shown when a caller's ID is unavailable —
// searching FreshService for it is pointless, so the workflow stops early
export const DEFAULT_PHONE_NUMBER = '7136214663';

export const FRESHSERVICE_BASE_URL = 'https://support.houseloan.com';
export const FRESHSERVICE_SEARCH_URL = `${FRESHSERVICE_BASE_URL}/search/all`;
export const FRESHSERVICE_NEW_TICKET_URL = `${FRESHSERVICE_BASE_URL}/a/tickets/new`;
export const FRESHSERVICE_USER_PROFILE_URL = (userId: string) => 
  `${FRESHSERVICE_BASE_URL}/users/${userId}`;

// DOM selectors for RingCentral MAX
export const RINGCENTRAL_SELECTORS = {
  // Method 1: Bold tag containing "Calling Number:"
  callingNumberBold: 'b',
  callingNumberText: 'Calling Number:',
  // Method 2: Paragraph containing the pattern
  paragraph: 'p',
  // Method 3: Iframe fallback
  iframe: 'iframe[allow*="camera"]',
} as const;

// DOM selectors for FreshService
export const FRESHSERVICE_SELECTORS = {
  searchResultsContainer: '#search-page-results',
  sectionList: 'ul',
  sectionHeading: 'li.heading',
  requestersHeading: 'Requesters',
  ticketsHeading: 'Tickets',
  inventoryHeading: 'Inventory',
  requesterLink: 'a.search-title',
  // For tickets section - user links within ticket items
  ticketUserLink: 'a.user_name',
  ticketItem: 'li:not(.heading)',
} as const;

// DOM selectors for the FreshService new ticket form
// IDs on the form are Ember-generated (ember13, ember15, ...) and change between
// page loads, so selectors rely on aria-labels and stable component classes
export const FRESHSERVICE_TICKET_SELECTORS = {
  templateTrigger: '.ember-power-select-trigger[aria-label="Select template"]',
  templateSearchInput: 'input.ember-power-select-search-input',
  templateOption: 'li.ember-power-select-option',
  descriptionEditor: '.fr-element.fr-view[contenteditable="true"]',
  // Froala's hidden cursor-position markers, stripped from kept template lines
  editorMarker: 'span.fr-marker',
} as const;

// Ticket template configuration
export const TICKET_TEMPLATE = {
  name: 'Standard Ticket',
  tmNameLabel: 'TM Name:',
  phoneLabel: 'Ph#:',
  laptopLabel: 'Laptop#:',
  // Line labels to keep from the template, in output order; every other line is deleted
  keepLabels: ['TM Name:', 'Ph#:', 'Laptop#:'],
  // Text whose presence signals the template has populated the description editor
  appliedMarker: 'TM Name:',
} as const;

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  tabLoad: 10000, // 10 seconds for tab to load
  contentRender: 500, // 500ms additional delay for content rendering
  ticketFormLoad: 15000, // new ticket form (Ember SPA) render wait
  dropdownOpen: 3000, // first wait for options after opening the template dropdown
  templateApply: 10000, // wait for template content to populate the editor
  domPoll: 200, // polling interval for DOM waits
} as const;

// Retry configuration for messaging the new ticket tab
// (its content script may not be injected yet while the tab is still loading)
export const AUTOFILL_RETRY = {
  attempts: 5,
  delayMs: 1000,
} as const;

// Retry configuration for extracting the calling number from MAX
// (the call UI may need a moment to render after the window is brought forward)
export const CALLING_NUMBER_RETRY = {
  attempts: 8,
  delayMs: 500,
} as const;

// Retry configuration for scraping the inventory search results
// (the content script re-injects after the search tab is navigated)
export const INVENTORY_RETRY = {
  attempts: 6,
  delayMs: 500,
} as const;

// Storage keys
export const STORAGE_KEYS = {
  currentRequester: 'currentRequester',
  pendingSelection: 'pendingSelection',
} as const;

// How long a pending requester selection stays valid; stale selections are
// discarded so a click in an old sidepanel can't act on the wrong call
export const PENDING_SELECTION_TTL_MS = 15 * 60 * 1000;

// Test mode configuration
// WARNING: TEST_MODE should be 'false' in production builds!
// Set to true only during development to use static test number instead of extracting from RingCentral
export const TEST_MODE = false;
export const TEST_PHONE_NUMBER = '7207579434';
