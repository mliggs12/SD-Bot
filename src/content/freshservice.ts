import {
  ScrapeSearchResultsMessage,
  SearchResultsResultMessage,
  AutofillTicketMessage,
  AutofillTicketResultMessage,
  GetRequesterAssetsMessage,
  RequesterAssetsResultMessage,
  GetRequesterProfileInfoMessage,
  RequesterProfileInfoResultMessage
} from '../types';
import { scrapeSearchResults, scrapeRequesterProfileInfo } from '../scrapers/freshservice-scraper';
import { autofillNewTicket } from '../scrapers/ticket-form-filler';
import { scrapeRequesterAssets } from '../scrapers/asset-scraper';
import { createContentMessageHandler } from '../utils/content-message-handler';

// Always log on load so any FreshService tab's console proves which build is
// running and that the content script was injected at all
console.log(`[SD-Bot] FreshService content script loaded (build ${__BUILD_INFO__}) on ${location.href}`);

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
      const result = await autofillNewTicket(message.requesterName, message.phoneNumber, message.laptopNumber);
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

// Scrape assigned assets when requested by the background workflow (sent to
// the requester profile tab it opens after a unique requester is identified)
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<GetRequesterAssetsMessage, RequesterAssetsResultMessage>(
    'GET_REQUESTER_ASSETS',
    () => {
      const result = scrapeRequesterAssets();
      return {
        type: 'REQUESTER_ASSETS_RESULT',
        success: result.success,
        data: result,
        error: result.success ? undefined : result.error,
      };
    },
    (errorMessage) => ({
      type: 'REQUESTER_ASSETS_RESULT',
      success: false,
      error: errorMessage,
    })
  )
);

// Scrape the requester's name when requested by the manual continue path
// (sent to whichever profile tab the tech has manually focused)
chrome.runtime.onMessage.addListener(
  createContentMessageHandler<GetRequesterProfileInfoMessage, RequesterProfileInfoResultMessage>(
    'GET_REQUESTER_PROFILE_INFO',
    () => {
      const result = scrapeRequesterProfileInfo();
      return {
        type: 'REQUESTER_PROFILE_INFO_RESULT',
        success: result.success,
        name: result.name,
        error: result.error,
      };
    },
    (errorMessage) => ({
      type: 'REQUESTER_PROFILE_INFO_RESULT',
      success: false,
      error: errorMessage,
    })
  )
);

