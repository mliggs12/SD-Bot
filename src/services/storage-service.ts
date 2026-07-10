import { PendingSelection, StoredRequester } from '../types';
import { PENDING_SELECTION_TTL_MS, STORAGE_KEYS } from '../utils/config';

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
   * Store the workflow context awaiting a manual requester selection
   * Kept in session storage: it survives service worker restarts but not
   * a browser restart, after which the selection would be meaningless
   */
  static async setPendingSelection(data: PendingSelection): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEYS.pendingSelection]: data });
  }

  /**
   * Get the pending requester selection context, discarding stale entries
   */
  static async getPendingSelection(): Promise<PendingSelection | null> {
    const result = await chrome.storage.session.get(STORAGE_KEYS.pendingSelection);
    const pending: PendingSelection | undefined = result[STORAGE_KEYS.pendingSelection];
    if (!pending) {
      return null;
    }
    if (Date.now() - pending.timestamp > PENDING_SELECTION_TTL_MS) {
      await this.clearPendingSelection();
      return null;
    }
    return pending;
  }

  /**
   * Clear the pending requester selection context
   */
  static async clearPendingSelection(): Promise<void> {
    await chrome.storage.session.remove(STORAGE_KEYS.pendingSelection);
  }
}

