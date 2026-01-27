import { RequesterData } from '../types';
import { FRESHSERVICE_SELECTORS } from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

/**
 * Scrapes search results page for requester information
 * Returns structured data about found requesters
 */
export function scrapeSearchResults(): RequesterData {
  try {
    // Find the main search results container
    const searchResults = document.querySelector(FRESHSERVICE_SELECTORS.searchResultsContainer);
    if (!searchResults) {
      const containerExists = document.querySelector('#search-page-results') !== null;
      const pageTitle = document.title || 'Unknown';
      return { 
        found: false, 
        reason: `Search results container (#${FRESHSERVICE_SELECTORS.searchResultsContainer.replace('#', '')}) not found. Page title: "${pageTitle}". Container exists: ${containerExists}.` 
      };
    }

    // Find all section lists (ul elements)
    const sections = searchResults.querySelectorAll(FRESHSERVICE_SELECTORS.sectionList);
    let requestersSection: Element | null = null;
    const sectionHeadings: string[] = [];

    // Look for the Requesters section
    for (const section of sections) {
      const heading = section.querySelector(FRESHSERVICE_SELECTORS.sectionHeading);
      if (heading) {
        const headingText = heading.textContent?.trim() || '';
        sectionHeadings.push(headingText);
        if (headingText === FRESHSERVICE_SELECTORS.requestersHeading) {
          requestersSection = section;
          break;
        }
      }
    }

    if (!requestersSection) {
      return { 
        found: false, 
        reason: `No Requesters section found. Found ${sections.length} section(s) with headings: ${sectionHeadings.length > 0 ? sectionHeadings.join(', ') : 'none'}` 
      };
    }

    // Get all requester links (excluding the heading)
    const requesterLinks = Array.from(requestersSection.querySelectorAll<HTMLAnchorElement>(FRESHSERVICE_SELECTORS.requesterLink));
    
    if (requesterLinks.length === 0) {
      const allLinks = requestersSection.querySelectorAll('a');
      return { 
        found: false, 
        reason: `No requester links found in Requesters section. Found ${allLinks.length} total link(s) in section.` 
      };
    }

    if (requesterLinks.length > 1) {
      const requesterNames = requesterLinks.map(link => link.textContent?.trim() || 'unnamed').slice(0, 5);
      return { 
        found: false, 
        reason: `Multiple requesters found (${requesterLinks.length}): ${requesterNames.join(', ')}${requesterLinks.length > 5 ? '...' : ''}`, 
        count: requesterLinks.length 
      };
    }

    // Scenario 1: Exactly one requester
    const requesterLink = requesterLinks[0];
    const name = requesterLink.textContent?.trim() || '';
    const href = requesterLink.getAttribute('href');
    
    if (!href) {
      return { 
        found: false, 
        reason: `Requester link has no href attribute. Link text: "${name}"` 
      };
    }
    
    // Extract user ID from href (e.g., /users/21004338789)
    const userIdMatch = href.match(/\/users\/(\d+)/);
    if (!userIdMatch) {
      return { 
        found: false, 
        reason: `Could not extract user ID from link. Href: "${href}", Expected format: /users/{number}` 
      };
    }

    const userId = userIdMatch[1];

    return {
      found: true,
      scenario: 1,
      name: name,
      userId: userId
    };

  } catch (error) {
    return {
      found: false,
      reason: `Error scraping search results: ${formatErrorWithStack(error, true)}`
    };
  }
}

