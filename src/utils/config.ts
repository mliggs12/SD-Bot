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

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  tabLoad: 10000, // 10 seconds for tab to load
  contentRender: 500, // 500ms additional delay for content rendering
} as const;

// Storage keys
export const STORAGE_KEYS = {
  currentRequester: 'currentRequester',
} as const;

// Test mode configuration
// WARNING: TEST_MODE should be 'false' in production builds!
// Set to true only during development to use static test number instead of extracting from RingCentral
export const TEST_MODE = false;
export const TEST_PHONE_NUMBER = '7207579434';
