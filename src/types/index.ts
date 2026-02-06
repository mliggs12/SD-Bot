// Message types for Chrome extension messaging
export type MessageType = 
  | 'GET_CALLING_NUMBER'
  | 'CALLING_NUMBER_RESULT'
  | 'SCRAPE_SEARCH_RESULTS'
  | 'SEARCH_RESULTS_RESULT'
  | 'TRIGGER_WORKFLOW'
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

export interface TriggerWorkflowMessage extends BaseMessage {
  type: 'TRIGGER_WORKFLOW';
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
  | TriggerWorkflowMessage
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

// Storage types
export interface StoredRequester {
  requesterName: string;
  requesterUserId: string;
  phoneNumber: string;
  timestamp: number;
  source?: 'requesters' | 'tickets'; // Where the requester was found
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

