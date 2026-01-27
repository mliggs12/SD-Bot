import { RequesterData, RequesterInfo } from '../types';
import { FRESHSERVICE_SELECTORS } from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

/**
 * Extracts requester information from tickets section
 * Returns array of unique requesters found in tickets
 */
function extractRequestersFromTickets(ticketsSection: Element): RequesterInfo[] {
  const requesters = new Map<string, RequesterInfo>();

  // Find all user links within ticket items
  const userLinks = ticketsSection.querySelectorAll<HTMLAnchorElement>(FRESHSERVICE_SELECTORS.ticketUserLink);

  for (const userLink of userLinks) {
    const href = userLink.getAttribute('href');
    if (!href) continue;

    // Extract user ID from href (e.g., /users/21004338789)
    const userIdMatch = href.match(/\/users\/(\d+)/);
    if (!userIdMatch) continue;

    const userId = userIdMatch[1];
    const name = userLink.textContent?.trim() || '';

    if (name && userId && !requesters.has(userId)) {
      requesters.set(userId, { name, userId });
    }
  }

  return Array.from(requesters.values());
}

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
    let ticketsSection: Element | null = null;
    const sectionHeadings: string[] = [];

    // Look for the Requesters and Tickets sections
    for (const section of sections) {
      const heading = section.querySelector(FRESHSERVICE_SELECTORS.sectionHeading);
      if (heading) {
        const headingText = heading.textContent?.trim() || '';
        sectionHeadings.push(headingText);
        if (headingText === FRESHSERVICE_SELECTORS.requestersHeading) {
          requestersSection = section;
        } else if (headingText === FRESHSERVICE_SELECTORS.ticketsHeading) {
          ticketsSection = section;
        }
      }
    }

    // Try Requesters section first (existing logic)
    if (!requestersSection && !ticketsSection) {
      return {
        found: false,
        reason: `No Requesters or Tickets section found. Found ${sections.length} section(s) with headings: ${sectionHeadings.length > 0 ? sectionHeadings.join(', ') : 'none'}`
      };
    }

    // Process Requesters section if available
    if (requestersSection) {
      const requesterLinks = Array.from(requestersSection.querySelectorAll<HTMLAnchorElement>(FRESHSERVICE_SELECTORS.requesterLink));

      if (requesterLinks.length === 0) {
        const allLinks = requestersSection.querySelectorAll('a');
        // No requesters in Requesters section, fall through to try Tickets section
        if (!ticketsSection) {
          return {
            found: false,
            reason: `No requester links found in Requesters section. Found ${allLinks.length} total link(s) in section.`
          };
        }
      } else if (requesterLinks.length > 1) {
        const requesterNames = requesterLinks.map(link => link.textContent?.trim() || 'unnamed').slice(0, 5);
        return {
          found: false,
          reason: `Multiple requesters found (${requesterLinks.length}): ${requesterNames.join(', ')}${requesterLinks.length > 5 ? '...' : ''}`,
          count: requesterLinks.length,
          source: 'requesters'
        };
      } else {
        // Scenario 1: Exactly one requester from Requesters section
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
          userId: userId,
          source: 'requesters'
        };
      }
    }

    // Process Tickets section if Requesters section didn't yield results
    if (ticketsSection) {
      const requestersFromTickets = extractRequestersFromTickets(ticketsSection);

      if (requestersFromTickets.length === 0) {
        return {
          found: false,
          reason: 'No requester information found in Tickets section.',
          source: 'tickets'
        };
      }

      if (requestersFromTickets.length === 1) {
        // Scenario 1: Single unique requester from tickets
        const requester = requestersFromTickets[0];
        return {
          found: true,
          scenario: 1,
          name: requester.name,
          userId: requester.userId,
          source: 'tickets'
        };
      }

      // Scenario 2: Multiple unique requesters from tickets
      const requesterNames = requestersFromTickets.map(r => r.name).slice(0, 5);
      return {
        found: true,
        scenario: 2,
        reason: `Multiple requesters found in tickets (${requestersFromTickets.length}): ${requesterNames.join(', ')}${requestersFromTickets.length > 5 ? '...' : ''}`,
        count: requestersFromTickets.length,
        requesters: requestersFromTickets,
        source: 'tickets'
      };
    }

    // Shouldn't reach here, but just in case
    return {
      found: false,
      reason: 'No valid data found in search results.'
    };

  } catch (error) {
    return {
      found: false,
      reason: `Error scraping search results: ${formatErrorWithStack(error, true)}`
    };
  }
}

