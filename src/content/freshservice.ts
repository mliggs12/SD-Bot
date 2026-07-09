import {
  ScrapeSearchResultsMessage,
  SearchResultsResultMessage,
  AutofillTicketMessage,
  AutofillTicketResultMessage
} from '../types';
import { scrapeSearchResults } from '../scrapers/freshservice-scraper';
import { autofillNewTicket } from '../scrapers/ticket-form-filler';
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

// Autofill the new ticket form when requested by the background workflow
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<AutofillTicketMessage, AutofillTicketResultMessage>(
    'AUTOFILL_TICKET',
    async (message) => {
      const result = await autofillNewTicket(message.requesterName, message.phoneNumber);
      return {
        type: 'AUTOFILL_TICKET_RESULT',
        success: result.success,
        error: result.error,
      };
    },
    (errorMessage) => ({
      type: 'AUTOFILL_TICKET_RESULT',
      success: false,
      error: errorMessage,
    })
  )
);

