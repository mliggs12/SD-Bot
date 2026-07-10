// Message types for Chrome extension messaging
export type MessageType =
  | 'GET_CALLING_NUMBER'
  | 'CALLING_NUMBER_RESULT'
  | 'SCRAPE_SEARCH_RESULTS'
  | 'SEARCH_RESULTS_RESULT'
  | 'SCRAPE_INVENTORY'
  | 'INVENTORY_RESULT'
  | 'AUTOFILL_TICKET'
  | 'AUTOFILL_TICKET_RESULT'
  | 'TRIGGER_WORKFLOW'
  | 'PHONE_NUMBER_IDENTIFIED'
  | 'REQUESTER_SELECTION_REQUIRED'
  | 'SELECT_REQUESTER'
  | 'WORKFLOW_UPDATE'
  | 'WORKFLOW_COMPLETE'
  | 'WORKFLOW_DEFAULT_NUMBER'
  | 'WORKFLOW_NO_MATCH'
  | 'WORKFLOW_ERROR';

export interface BaseMessage {
  type: MessageType;
}

export interface GetCallingNumberMessage extends BaseMessage {
  type: 'GET_CALLING_NUMBER';
}

export interface CallingNumberResultMessage extends BaseMessage {
  type: 'CALLING_NUMBER_RESULT';
  success: boolean;
  phoneNumber?: string;
  error?: string;
}

export interface ScrapeSearchResultsMessage extends BaseMessage {
  type: 'SCRAPE_SEARCH_RESULTS';
}

export interface SearchResultsResultMessage extends BaseMessage {
  type: 'SEARCH_RESULTS_RESULT';
  success: boolean;
  data?: RequesterData;
  error?: string;
}

export interface ScrapeInventoryMessage extends BaseMessage {
  type: 'SCRAPE_INVENTORY';
}

export interface InventoryResultMessage extends BaseMessage {
  type: 'INVENTORY_RESULT';
  success: boolean;
  data?: InventoryData;
  error?: string;
}

export interface AutofillTicketMessage extends BaseMessage {
  type: 'AUTOFILL_TICKET';
  /** Requester name for the TM Name line; empty string leaves it blank */
  requesterName: string;
  /** Caller phone number in raw format for the Ph# line; empty string leaves it blank */
  phoneNumber: string;
  /** Asset identifier for the Laptop# line; empty string leaves it blank */
  laptopSerial?: string;
}

export interface AutofillTicketResultMessage extends BaseMessage {
  type: 'AUTOFILL_TICKET_RESULT';
  success: boolean;
  error?: string;
}

export interface TriggerWorkflowMessage extends BaseMessage {
  type: 'TRIGGER_WORKFLOW';
}

export interface PhoneNumberIdentifiedMessage extends BaseMessage {
  type: 'PHONE_NUMBER_IDENTIFIED';
  phoneNumber: string;
}

export interface RequesterSelectionRequiredMessage extends BaseMessage {
  type: 'REQUESTER_SELECTION_REQUIRED';
  requesters: RequesterInfo[];
  phoneNumber: string;
  source?: 'requesters' | 'tickets';
}

export interface SelectRequesterMessage extends BaseMessage {
  type: 'SELECT_REQUESTER';
  requester: RequesterInfo;
}

export interface WorkflowUpdateMessage extends BaseMessage {
  type: 'WORKFLOW_UPDATE';
  status: string;
  message: string;
}

export interface WorkflowCompleteMessage extends BaseMessage {
  type: 'WORKFLOW_COMPLETE';
  requesterData?: StoredRequester;
  /** Assets scraped from the requester's Inventory search results */
  assets?: AssetInfo[];
}

export interface WorkflowDefaultNumberMessage extends BaseMessage {
  type: 'WORKFLOW_DEFAULT_NUMBER';
  phoneNumber: string;
  /** False when the new ticket could not be prepped with the template */
  ticketPrepped: boolean;
}

export interface WorkflowNoMatchMessage extends BaseMessage {
  type: 'WORKFLOW_NO_MATCH';
  phoneNumber: string;
  reason?: string;
  /** False when the new ticket could not be prepped with the phone number */
  ticketPrepped: boolean;
}

export interface WorkflowErrorMessage extends BaseMessage {
  type: 'WORKFLOW_ERROR';
  error: string;
  details?: string;
}

export type Message =
  | GetCallingNumberMessage
  | CallingNumberResultMessage
  | ScrapeSearchResultsMessage
  | SearchResultsResultMessage
  | ScrapeInventoryMessage
  | InventoryResultMessage
  | AutofillTicketMessage
  | AutofillTicketResultMessage
  | TriggerWorkflowMessage
  | PhoneNumberIdentifiedMessage
  | RequesterSelectionRequiredMessage
  | SelectRequesterMessage
  | WorkflowUpdateMessage
  | WorkflowCompleteMessage
  | WorkflowDefaultNumberMessage
  | WorkflowNoMatchMessage
  | WorkflowErrorMessage;

// Scraper result types
export interface CallingNumberResult {
  success: boolean;
  phoneNumber?: string;
  error?: string;
}

export interface RequesterInfo {
  name: string;
  userId: string;
}

export interface AssetInfo {
  name: string;
  url?: string;
}

export interface InventoryData {
  found: boolean;
  assets: AssetInfo[];
  reason?: string;
}

export interface RequesterData {
  found: boolean;
  scenario?: number;
  name?: string;
  userId?: string;
  reason?: string;
  count?: number;
  requesters?: RequesterInfo[]; // For scenarios with multiple requesters
  source?: 'requesters' | 'tickets'; // Track where the data came from
  // True when the search page rendered but held no usable requester —
  // a genuine "no match" rather than a scrape failure
  noMatch?: boolean;
}

export interface ScrapeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TicketAutofillResult {
  success: boolean;
  error?: string;
}

// Storage types
export interface StoredRequester {
  requesterName: string;
  requesterUserId: string;
  phoneNumber: string;
  timestamp: number;
  source?: 'requesters' | 'tickets'; // Where the requester was found
}

/**
 * Workflow context saved while waiting for the tech to pick a requester
 * in the sidepanel. Persisted to chrome.storage.session because the MV3
 * service worker may unload before the selection arrives.
 */
export interface PendingSelection {
  phoneNumber: string;
  ticketTabId: number;
  /** Search tab reused for the follow-up inventory (asset) search */
  searchTabId: number;
  requesters: RequesterInfo[];
  source?: 'requesters' | 'tickets';
  timestamp: number;
}

// Error types
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

export class TabError extends ExtensionError {
  constructor(message: string, details?: unknown) {
    super(message, 'TAB_ERROR', details);
    this.name = 'TabError';
  }
}

// Type guard functions

/**
 * Type guard to check if CallingNumberResult is successful
 * Narrows the type to ensure phoneNumber is defined
 */
export function isSuccessfulCallingNumberResult(
  result: CallingNumberResult
): result is CallingNumberResult & { success: true; phoneNumber: string } {
  return result.success === true && !!result.phoneNumber;
}

/**
 * Type guard to check if RequesterData represents a single successful match (scenario 1)
 * Narrows the type to ensure name and userId are defined
 */
export function isSuccessfulSingleMatchResult(
  result: RequesterData
): result is RequesterData & { found: true; scenario: 1; name: string; userId: string } {
  return result.found === true && result.scenario === 1 && !!result.name && !!result.userId;
}

/**
 * Type guard to check if RequesterData represents multiple requesters (scenario 2),
 * whether they came from the Requesters section or from tickets
 * Narrows the type to ensure requesters array is defined
 */
export function isMultipleRequestersResult(
  result: RequesterData
): result is RequesterData & { found: true; scenario: 2; requesters: RequesterInfo[]; count: number } {
  return result.found === true && result.scenario === 2 && !!result.requesters && result.requesters.length > 0;
}

/**
 * Type guard to check if RequesterData represents a genuine "no match" (scenario 3):
 * the search page rendered but no requester could be identified from it
 */
export function isNoMatchResult(
  result: RequesterData
): result is RequesterData & { found: false; noMatch: true } {
  return result.found === false && result.noMatch === true;
}

