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
  requesterLink: 'a.search-title',
  // For tickets section - user links within ticket items
  ticketUserLink: 'a.user_name',
  ticketItem: 'li:not(.heading)',
} as const;

// DOM selectors for the FreshService new ticket form
// IDs on the form are Ember-generated (ember13, ember15, ...) and change between
// page loads, so selectors rely on aria-labels and stable component classes
export const FRESHSERVICE_TICKET_SELECTORS = {
  // Shared by every ember-power-select widget on this form (template,
  // requester, agent) — field-specific behavior comes from which trigger's
  // search input is used to find it, not from separate copies of these
  powerSelectTrigger: '.ember-power-select-trigger',
  // Matches both real result options AND, for fields with a status-message
  // li (e.g. requester's "Type to search"/"Loading options..."), that li
  // too — they share this base class. Real options are told apart by text
  // content where needed (see getRequesterResultOptions), not by CSS class,
  // since a status message's modifier class isn't consistent across every
  // status text it's used for
  powerSelectOption: 'li.ember-power-select-option',
  // Screen-reader-only span showing the current selection's text — the
  // signal actually used to verify a pick landed, since it's populated only
  // after a real commit (see getSelectedItemText)
  powerSelectSelectedItem: '.ember-power-select-selected-item',
  templateTrigger: '.ember-power-select-trigger[aria-label="Select template"]',
  templateSearchInput: 'input.ember-power-select-search-input',
  descriptionEditor: '.fr-element.fr-view[contenteditable="true"]',
  // Froala's hidden cursor-position markers, stripped from kept template lines
  editorMarker: 'span.fr-marker',
  // Requester field: no aria-label on its trigger (unlike templateTrigger), so
  // the search input is found by its stable Ember property-name id suffix
  // (the numeric "emberNNN" prefix is regenerated per page load)
  requesterSearchInput: 'input[id$="_requesterId"]',
  requesterStatusMessage: 'li.ember-power-select-option--search-message',
  // Agent field: FreshService's internal name for it is "Responder" (hence
  // the id suffix). Unlike Requester, this list is static and fully
  // populated as soon as the dropdown opens — no async search involved
  agentSearchInput: 'input[id$="_responderId"]',
} as const;

// Text shown in the requester typeahead's status message li while no query has
// been typed yet, or while the debounced search is in flight
export const REQUESTER_SEARCH = {
  typeToSearchText: 'Type to search',
  loadingText: 'Loading options...',
} as const;

// Agent (assignee) to select on every ticket — always the current user;
// matched via startsWith rather than exact equality since the dropdown
// appends a "(Me)" suffix to whichever agent is currently logged in
export const TICKET_AGENT = {
  name: 'Michael Liggins',
} as const;

// DOM selectors for the FreshService requester profile page's Assets tab
// The tab panel's assignment list is rendered server-side into the page on
// load (not fetched via AJAX on tab click), so it can be scraped directly
// without needing to open the Assets tab first
export const FRESHSERVICE_ASSET_SELECTORS = {
  assignmentList: '.assignment-list',
  assignmentItem: '.assignment[data-is-hardware="true"]',
  assetNameLink: 'a.asset-name',
} as const;

// DOM selector for the requester's name on their FreshService profile page
export const FRESHSERVICE_PROFILE_SELECTORS = {
  requesterName: '.agent-name',
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
  // A boilerplate label always discarded when trimming down to the keep
  // lines, and never re-added afterward — its continued presence signals
  // the description hasn't been trimmed yet (still the freshly-applied,
  // full template), distinguishing that one-time destructive step from a
  // later value-only update safe to repeat (e.g. via manual continue)
  trimmedAwayMarker: 'Steps Taken:',
} as const;

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  tabLoad: 10000, // 10 seconds for tab to load
  contentRender: 500, // 500ms additional delay for content rendering
  ticketFormLoad: 30000, // new ticket form (Ember SPA) render wait
  dropdownOpen: 3000, // first wait for options after opening the template dropdown
  templateApply: 10000, // wait for template content to populate the editor
  domPoll: 200, // polling interval for DOM waits
  requesterSearchResults: 8000, // wait for the debounced requester search to settle
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

// Retry configuration for messaging the requester profile tab
// (its content script may not be injected yet while the tab is still loading)
export const ASSET_LOOKUP_RETRY = {
  attempts: 5,
  delayMs: 1000,
} as const;

// Storage keys
export const STORAGE_KEYS = {
  currentRequester: 'currentRequester',
  testModeSettings: 'testModeSettings',
  pendingRun: 'pendingRun',
} as const;

// Test mode is a runtime setting toggled from the sidepanel (persisted in
// chrome.storage.local) — no rebuild required. This is only the default
// phone number seeded into the sidepanel's test number field.
export const DEFAULT_TEST_PHONE_NUMBER = '7207579434';
