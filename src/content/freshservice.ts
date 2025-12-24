import { Message, SearchResultsResultMessage } from '../types';
import { scrapeSearchResults } from '../scrapers/freshservice-scraper';

// Listen for messages from background script
chrome.runtime.onMessage.addListener((
  message: Message,
  sender,
  sendResponse: (response: SearchResultsResultMessage) => void
) => {
  if (message.type === 'SCRAPE_SEARCH_RESULTS') {
    try {
      const result = scrapeSearchResults();
      
      const response: SearchResultsResultMessage = {
        type: 'SEARCH_RESULTS_RESULT',
        success: result.found,
        data: result,
        error: result.found ? undefined : result.reason,
      };
      
      sendResponse(response);
      return true; // Indicates we will send a response asynchronously
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({
        type: 'SEARCH_RESULTS_RESULT',
        success: false,
        error: errorMessage,
      });
      return true;
    }
  }
  
  return false;
});

