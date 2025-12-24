import { Message, CallingNumberResultMessage } from '../types';
import { extractCallingNumber } from '../scrapers/ringcentral-scraper';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((
  message: Message,
  sender,
  sendResponse: (response: CallingNumberResultMessage) => void
) => {
  if (message.type === 'GET_CALLING_NUMBER') {
    try {
      const result = extractCallingNumber();
      
      const response: CallingNumberResultMessage = {
        type: 'CALLING_NUMBER_RESULT',
        success: result.success,
        phoneNumber: result.phoneNumber,
        error: result.error,
      };
      
      sendResponse(response);
      return true; // Indicates we will send a response asynchronously
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({
        type: 'CALLING_NUMBER_RESULT',
        success: false,
        error: errorMessage,
      });
      return true;
    }
  }
  
  return false;
});

