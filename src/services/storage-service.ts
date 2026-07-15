import { StoredRequester, TestModeSettings } from '../types';
import { STORAGE_KEYS, DEFAULT_TEST_PHONE_NUMBER } from '../utils/config';

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

  /**
   * Get test mode settings (disabled with the default number if never set)
   */
  static async getTestModeSettings(): Promise<TestModeSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.testModeSettings);
    const stored = result[STORAGE_KEYS.testModeSettings] as Partial<TestModeSettings> | undefined;
    return {
      enabled: stored?.enabled === true,
      phoneNumber: stored?.phoneNumber ?? DEFAULT_TEST_PHONE_NUMBER,
    };
  }

  /**
   * Store test mode settings
   */
  static async setTestModeSettings(settings: TestModeSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.testModeSettings]: settings });
  }
}

