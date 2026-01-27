import { 
  Message, 
  CallingNumberResultMessage, 
  SearchResultsResultMessage,
  GetCallingNumberMessage,
  ScrapeSearchResultsMessage
} from '../types';

/**
 * Service for Chrome extension messaging with type safety
 */
export class MessageService {
  /**
   * Send a message to a content script in a specific tab
   * @param tabId - The ID of the tab containing the content script
   * @param message - The message to send (must match the request message type)
   * @returns Promise that resolves with the response message
   * @throws Error if the message cannot be sent or if chrome.runtime.lastError is set
   * 
   * @example
   * ```typescript
   * const response = await MessageService.sendToTab<CallingNumberResultMessage>(
   *   tabId,
   *   { type: 'GET_CALLING_NUMBER' }
   * );
   * ```
   */
  static async sendToTab<TResponse extends Message>(
    tabId: number,
    message: Message
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response: TResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response received from content script'));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * Send a message to the background script
   * @param message - The message to send
   * @returns Promise that resolves with the response message
   * @throws Error if the message cannot be sent or if chrome.runtime.lastError is set
   * 
   * @example
   * ```typescript
   * const response = await MessageService.sendToBackground<WorkflowCompleteMessage>(
   *   { type: 'TRIGGER_WORKFLOW' }
   * );
   * ```
   */
  static async sendToBackground<TResponse extends Message>(
    message: Message
  ): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response received from background script'));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * Request calling number from RingCentral content script
   * @param tabId - The ID of the tab containing the RingCentral MAX page
   * @returns Promise that resolves with the calling number result
   * @throws Error if the message cannot be sent or if no response is received
   */
  static async getCallingNumber(tabId: number): Promise<CallingNumberResultMessage> {
    const request: GetCallingNumberMessage = {
      type: 'GET_CALLING_NUMBER',
    };
    return this.sendToTab<CallingNumberResultMessage>(tabId, request);
  }

  /**
   * Request search results scraping from FreshService content script
   * @param tabId - The ID of the tab containing the FreshService search results page
   * @returns Promise that resolves with the search results
   * @throws Error if the message cannot be sent or if no response is received
   */
  static async scrapeSearchResults(tabId: number): Promise<SearchResultsResultMessage> {
    const request: ScrapeSearchResultsMessage = {
      type: 'SCRAPE_SEARCH_RESULTS',
    };
    return this.sendToTab<SearchResultsResultMessage>(tabId, request);
  }

  /**
   * Send a message to the sidepanel (fire-and-forget)
   * @param message - The message to send to the sidepanel
   * @returns void - This method doesn't wait for a response
   *
   * Note: If the sidepanel is not ready, chrome.runtime.lastError will be set,
   * but this is expected and handled gracefully.
   *
   * @example
   * ```typescript
   * MessageService.sendToSidepanel({
   *   type: 'WORKFLOW_UPDATE',
   *   status: 'Starting workflow...'
   * });
   * ```
   */
  static sendToSidepanel<T extends Message>(message: T): void {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Sidepanel might not be ready - this is expected and OK
        return;
      }
    });
  }
}

