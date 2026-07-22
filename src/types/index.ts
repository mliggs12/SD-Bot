// Message types for Chrome extension messaging
export type MessageType =
  | 'GET_CALLING_NUMBER'
  | 'CALLING_NUMBER_RESULT'
  | 'SCRAPE_SEARCH_RESULTS'
  | 'SEARCH_RESULTS_RESULT'
  | 'AUTOFILL_TICKET'
  | 'AUTOFILL_TICKET_RESULT'
  | 'GET_REQUESTER_ASSETS'
  | 'REQUESTER_ASSETS_RESULT'
  | 'GET_REQUESTER_PROFILE_INFO'
  | 'REQUESTER_PROFILE_INFO_RESULT'
  | 'TRIGGER_WORKFLOW'
  | 'CONTINUE_WITH_MANUAL_REQUESTER'
  | 'SELECT_LAPTOP'
  | 'PHONE_NUMBER_IDENTIFIED'
  | 'WORKFLOW_UPDATE'
  | 'WORKFLOW_COMPLETE'
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

export interface AutofillTicketMessage extends BaseMessage {
  type: 'AUTOFILL_TICKET';
  /** Requester name for the TM Name line; empty string leaves it blank */
  requesterName: string;
  /** Caller phone number in raw format for the Ph# line */
  phoneNumber: string;
  /** Asset tag for the Laptop# line; empty string leaves it blank (none or multiple found) */
  laptopNumber: string;
}

export interface AutofillTicketResultMessage extends BaseMessage {
  type: 'AUTOFILL_TICKET_RESULT';
  success: boolean;
  error?: string;
  /** True when the Requester field's typeahead was resolved to a single match and clicked */
  requesterAutoSelected: boolean;
  /** Reason the Requester field was left blank; present only when requesterAutoSelected is false */
  requesterSelectionNote?: string;
}

export interface GetRequesterAssetsMessage extends BaseMessage {
  type: 'GET_REQUESTER_ASSETS';
}

export interface RequesterAssetsResultMessage extends BaseMessage {
  type: 'REQUESTER_ASSETS_RESULT';
  success: boolean;
  data?: RequesterAssetsData;
  error?: string;
}

export interface GetRequesterProfileInfoMessage extends BaseMessage {
  type: 'GET_REQUESTER_PROFILE_INFO';
}

export interface RequesterProfileInfoResultMessage extends BaseMessage {
  type: 'REQUESTER_PROFILE_INFO_RESULT';
  success: boolean;
  name?: string;
  error?: string;
}

export interface TriggerWorkflowMessage extends BaseMessage {
  type: 'TRIGGER_WORKFLOW';
}

export interface ContinueWithManualRequesterMessage extends BaseMessage {
  type: 'CONTINUE_WITH_MANUAL_REQUESTER';
}

/**
 * Sent from the sidepanel when the tech picks the correct laptop from a
 * "multiple assets found" list; the background re-autofills the ticket's
 * Laptop# line with this tag
 */
export interface SelectLaptopMessage extends BaseMessage {
  type: 'SELECT_LAPTOP';
  assetTag: string;
}

export interface PhoneNumberIdentifiedMessage extends BaseMessage {
  type: 'PHONE_NUMBER_IDENTIFIED';
  phoneNumber: string;
}

export interface WorkflowUpdateMessage extends BaseMessage {
  type: 'WORKFLOW_UPDATE';
  status: string;
  message: string;
}

export interface WorkflowCompleteMessage extends BaseMessage {
  type: 'WORKFLOW_COMPLETE';
  requesterData?: StoredRequester;
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
  | AutofillTicketMessage
  | AutofillTicketResultMessage
  | GetRequesterAssetsMessage
  | RequesterAssetsResultMessage
  | GetRequesterProfileInfoMessage
  | RequesterProfileInfoResultMessage
  | TriggerWorkflowMessage
  | ContinueWithManualRequesterMessage
  | SelectLaptopMessage
  | PhoneNumberIdentifiedMessage
  | WorkflowUpdateMessage
  | WorkflowCompleteMessage
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

export interface RequesterData {
  found: boolean;
  scenario?: number;
  name?: string;
  userId?: string;
  reason?: string;
  count?: number;
  requesters?: RequesterInfo[]; // For tickets scenario with multiple requesters
  source?: 'requesters' | 'tickets'; // Track where the data came from
}

export interface ScrapeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AssetInfo {
  assetTag: string;
  assetId: string;
}

export interface RequesterAssetsData {
  success: boolean;
  assets: AssetInfo[];
  error?: string;
}

export interface TicketAutofillResult {
  success: boolean;
  error?: string;
  /** True when the Requester field's typeahead was resolved to a single match and clicked */
  requesterAutoSelected: boolean;
  /** Reason the Requester field was left blank; present only when requesterAutoSelected is false */
  requesterSelectionNote?: string;
}

// Storage types

/**
 * Runtime test mode settings, toggled from the sidepanel
 * When enabled, the workflow skips MAX call detection and uses phoneNumber
 */
export interface TestModeSettings {
  enabled: boolean;
  phoneNumber: string;
}

export interface StoredRequester {
  requesterName: string;
  requesterUserId: string;
  phoneNumber: string;
  timestamp: number;
  source?: 'requesters' | 'tickets' | 'manual'; // Where the requester was found
  laptopNumber?: string; // Asset tag, set only when exactly one asset was found
  assetTags?: string[]; // All asset tags found on the requester's profile (0, 1, or many)
  requesterAutoSelected?: boolean; // True when the ticket's Requester field was auto-selected
  requesterSelectionNote?: string; // Reason it was left blank, when requesterAutoSelected is false
  ticketTabId?: number; // The new ticket tab opened for this run, so a later laptop selection can re-autofill it
}

/**
 * Persisted across a failed identification so the sidepanel's manual
 * continue action can resume the same run (same ticket tab, same phone
 * number) after the tech manually finds the correct requester
 */
export interface PendingRun {
  ticketTabId: number;
  phoneNumber: string;
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
 * Type guard to check if RequesterData represents multiple requesters from tickets (scenario 2)
 * Narrows the type to ensure requesters array is defined
 */
export function isMultipleRequestersResult(
  result: RequesterData
): result is RequesterData & { found: true; scenario: 2; requesters: RequesterInfo[]; count: number } {
  return result.found === true && result.scenario === 2 && !!result.requesters && result.requesters.length > 0;
}

