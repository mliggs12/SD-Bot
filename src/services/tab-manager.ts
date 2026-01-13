import { TabError } from '../types';
import { TIMEOUTS } from '../utils/config';

/**
 * Options for createTabAndWait
 */
export interface CreateTabAndWaitOptions {
  /** Whether to reject on timeout instead of resolving (default: false) */
  rejectOnTimeout?: boolean;
  /** Custom timeout in milliseconds (default: TIMEOUTS.tabLoad) */
  timeout?: number;
}

/**
 * Service for managing browser tabs
 */
export class TabManager {
  /**
   * Find a tab by URL pattern
   * @param pattern - URL pattern to match (e.g., "https://example.com/*")
   * @returns The first matching tab
   * @throws TabError if no matching tab is found
   */
  static async findTabByUrl(pattern: string): Promise<chrome.tabs.Tab> {
    const tabs = await chrome.tabs.query({ url: pattern });
    
    if (tabs.length === 0) {
      throw new TabError(`No tab found matching pattern: ${pattern}`);
    }
    
    const tab = tabs[0];
    if (!tab.id) {
      throw new TabError('Tab found but has no ID');
    }
    
    return tab;
  }

  /**
   * Create a new tab and wait for it to load
   * @param url - URL to navigate to
   * @param active - Whether to make the tab active (default: false)
   * @param options - Additional options for timeout handling
   * @returns The created tab
   * @throws TabError if tab creation fails or timeout occurs with rejectOnTimeout=true
   */
  static async createTabAndWait(
    url: string, 
    active: boolean = false,
    options: CreateTabAndWaitOptions = {}
  ): Promise<chrome.tabs.Tab> {
    const { rejectOnTimeout = false, timeout = TIMEOUTS.tabLoad } = options;
    
    const tab = await chrome.tabs.create({ url, active });
    
    if (!tab.id) {
      throw new TabError('Tab created but has no ID');
    }
    
    let timedOut = false;
    
    // Wait for the tab to finish loading
    await new Promise<void>((resolve, reject) => {
      const listener = (tabId: number, changeInfo: { status?: string }) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeoutId);
          resolve();
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after specified duration
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        timedOut = true;
        
        if (rejectOnTimeout) {
          reject(new TabError(`Tab load timeout after ${timeout}ms for URL: ${url}`));
        } else {
          // Log warning but still resolve - tab might be loaded but status not updated
          console.warn(`Tab load timeout after ${timeout}ms for URL: ${url}. Resolving anyway.`);
          resolve();
        }
      }, timeout);
    });
    
    // Small additional delay to ensure content is rendered
    await new Promise<void>(resolve => setTimeout(resolve, TIMEOUTS.contentRender));
    
    // Log if timeout occurred (for debugging)
    if (timedOut && !rejectOnTimeout) {
      console.warn(`Tab created but may not be fully loaded: ${url}`);
    }
    
    return tab;
  }

  /**
   * Create a tab without waiting for it to load
   * @param url - URL to navigate to
   * @param active - Whether to make the tab active (default: false)
   * @returns The created tab
   */
  static async createTab(url: string, active: boolean = false): Promise<chrome.tabs.Tab> {
    return chrome.tabs.create({ url, active });
  }
}

