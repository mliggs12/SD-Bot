import { TabError } from '../types';
import { TIMEOUTS } from '../utils/config';

/**
 * Service for managing browser tabs
 */
export class TabManager {
  /**
   * Find a tab by URL pattern
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
   */
  static async createTabAndWait(url: string, active: boolean = false): Promise<chrome.tabs.Tab> {
    const tab = await chrome.tabs.create({ url, active });
    
    if (!tab.id) {
      throw new TabError('Tab created but has no ID');
    }
    
    // Wait for the tab to finish loading
    await new Promise<void>((resolve, reject) => {
      const listener = (tabId: number, changeInfo: { status?: string }) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after specified duration
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        // Still resolve - tab might be loaded but status not updated
        resolve();
      }, TIMEOUTS.tabLoad);
    });
    
    // Small additional delay to ensure content is rendered
    await new Promise<void>(resolve => setTimeout(resolve, TIMEOUTS.contentRender));
    
    return tab;
  }

  /**
   * Create a tab without waiting
   */
  static async createTab(url: string, active: boolean = false): Promise<chrome.tabs.Tab> {
    return chrome.tabs.create({ url, active });
  }
}

