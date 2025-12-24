import { Message, CallingNumberResultMessage, SearchResultsResultMessage } from '../types';

/**
 * Service for Chrome extension messaging with type safety
 */
export class MessageService {
  /**
   * Send a message to a content script in a specific tab
   */
  static async sendToTab<T extends Message>(
    tabId: number,
    message: Message
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response: T) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * Send a message to the background script
   */
  static async sendToBackground<T extends Message>(
    message: Message
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: T) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * Request calling number from RingCentral content script
   */
  static async getCallingNumber(tabId: number): Promise<CallingNumberResultMessage> {
    return this.sendToTab<CallingNumberResultMessage>(tabId, {
      type: 'GET_CALLING_NUMBER',
    });
  }

  /**
   * Request search results scraping from FreshService content script
   */
  static async scrapeSearchResults(tabId: number): Promise<SearchResultsResultMessage> {
    return this.sendToTab<SearchResultsResultMessage>(tabId, {
      type: 'SCRAPE_SEARCH_RESULTS',
    });
  }
}

