import {
  ScrapeSearchResultsMessage,
  SearchResultsResultMessage,
  ScrapeInventoryMessage,
  InventoryResultMessage,
  AutofillTicketMessage,
  AutofillTicketResultMessage
} from '../types';
import { scrapeSearchResults, scrapeInventoryAssets } from '../scrapers/freshservice-scraper';
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

// Scrape the Inventory section after the search tab is re-searched by requester name
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<ScrapeInventoryMessage, InventoryResultMessage>(
    'SCRAPE_INVENTORY',
    () => {
      const result = scrapeInventoryAssets();
      return {
        type: 'INVENTORY_RESULT',
        success: result.found,
        data: result,
        error: result.found ? undefined : result.reason,
      };
    },
    (errorMessage) => ({
      type: 'INVENTORY_RESULT',
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
      const result = await autofillNewTicket(
        message.requesterName,
        message.phoneNumber,
        message.laptopSerial ?? ''
      );
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

