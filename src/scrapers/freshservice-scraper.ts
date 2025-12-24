import { RequesterData } from '../types';
import { FRESHSERVICE_SELECTORS } from '../utils/config';

/**
 * Scrapes search results page for requester information
 * Returns structured data about found requesters
 */
export function scrapeSearchResults(): RequesterData {
  try {
    // Find the main search results container
    const searchResults = document.querySelector(FRESHSERVICE_SELECTORS.searchResultsContainer);
    if (!searchResults) {
      return { found: false, reason: 'Search results container not found' };
    }

    // Find all section lists (ul elements)
    const sections = searchResults.querySelectorAll(FRESHSERVICE_SELECTORS.sectionList);
    let requestersSection: Element | null = null;

    // Look for the Requesters section
    for (const section of sections) {
      const heading = section.querySelector(FRESHSERVICE_SELECTORS.sectionHeading);
      if (heading && heading.textContent?.trim() === FRESHSERVICE_SELECTORS.requestersHeading) {
        requestersSection = section;
        break;
      }
    }

    if (!requestersSection) {
      return { found: false, reason: 'No Requesters section found' };
    }

    // Get all requester links (excluding the heading)
    const requesterLinks = Array.from(requestersSection.querySelectorAll<HTMLAnchorElement>(FRESHSERVICE_SELECTORS.requesterLink));
    
    if (requesterLinks.length === 0) {
      return { found: false, reason: 'No requesters found in section' };
    }

    if (requesterLinks.length > 1) {
      return { 
        found: false, 
        reason: `Multiple requesters found (${requesterLinks.length})`, 
        count: requesterLinks.length 
      };
    }

    // Scenario 1: Exactly one requester
    const requesterLink = requesterLinks[0];
    const name = requesterLink.textContent?.trim() || '';
    const href = requesterLink.getAttribute('href');
    
    if (!href) {
      return { found: false, reason: 'Requester link has no href attribute' };
    }
    
    // Extract user ID from href (e.g., /users/21004338789)
    const userIdMatch = href.match(/\/users\/(\d+)/);
    if (!userIdMatch) {
      return { found: false, reason: 'Could not extract user ID from link' };
    }

    const userId = userIdMatch[1];

    return {
      found: true,
      scenario: 1,
      name: name,
      userId: userId
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { found: false, reason: `Error: ${errorMessage}` };
  }
}

