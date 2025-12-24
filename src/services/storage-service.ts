import { StoredRequester } from '../types';
import { STORAGE_KEYS } from '../utils/config';

/**
 * Service for managing Chrome storage with type safety
 */
export class StorageService {
  /**
   * Store current requester data
   */
  static async setCurrentRequester(data: StoredRequester): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.currentRequester]: data });
  }

  /**
   * Get current requester data
   */
  static async getCurrentRequester(): Promise<StoredRequester | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.currentRequester);
    return result[STORAGE_KEYS.currentRequester] || null;
  }

  /**
   * Clear current requester data
   */
  static async clearCurrentRequester(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.currentRequester);
  }
}

