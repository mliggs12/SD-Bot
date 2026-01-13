import { GetCallingNumberMessage, CallingNumberResultMessage } from '../types';
import { extractCallingNumber } from '../scrapers/ringcentral-scraper';
import { createContentMessageHandler } from '../utils/content-message-handler';

// Listen for messages from background script
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<GetCallingNumberMessage, CallingNumberResultMessage>(
    'GET_CALLING_NUMBER',
    () => {
      const result = extractCallingNumber();
      return {
        type: 'CALLING_NUMBER_RESULT',
        success: result.success,
        phoneNumber: result.phoneNumber,
        error: result.error,
      };
    },
    (errorMessage) => ({
      type: 'CALLING_NUMBER_RESULT',
      success: false,
      error: errorMessage,
    })
  )
);

