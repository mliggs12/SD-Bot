import { ScrapeSearchResultsMessage, SearchResultsResultMessage } from '../types';
import { scrapeSearchResults } from '../scrapers/freshservice-scraper';
import { createContentMessageHandler } from '../utils/content-message-handler';

// Listen for messages from background script
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<ScrapeSearchResultsMessage, SearchResultsResultMessage>(
    'SCRAPE_SEARCH_RESULTS',
    () => {
      const result = scrapeSearchResults();
      return {
        type: 'SEARCH_RESULTS_RESULT',
        success: result.found,
        data: result,
        error: result.found ? undefined : result.reason,
      };
    },
    (errorMessage) => ({
      type: 'SEARCH_RESULTS_RESULT',
      success: false,
      error: errorMessage,
    })
  )
);

