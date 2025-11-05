// Main execution function
async function main() {
  // Get the result div for user feedback
  const resultDiv = document.getElementById('result');
  resultDiv.textContent = 'Searching for MAX window...';

  try {
    // First, let's confirm we can find the MAX window
    const allTabs = await chrome.tabs.query({});
    const maxTabs = await chrome.tabs.query({
      url: "https://max.niceincontact.com/*"
    });
    
    console.log('Total tabs found:', allTabs.length);
    console.log('MAX tabs found:', maxTabs.length);
    console.log('MAX tab details:', maxTabs.map(t => ({ id: t.id, title: t.title, url: t.url })));
    
    if (maxTabs.length === 0) {
      resultDiv.innerHTML = `
        <div class="error">X No MAX tabs found</div>
        <div style="font-size: 11px; margin-top: 5px;">
          <strong>Debug Info:</strong><br>
          Total browser tabs: ${allTabs.length}<br>
          Looking for: https://max.niceincontact.com/*<br>
          <br>
          <strong>All tabs:</strong><br>
          ${allTabs.slice(0, 5).map(t => `${t.title}: ${t.url}`).join('<br>')}
          ${allTabs.length > 5 ? '<br>...' : ''}
        </div>
      `;
      resultDiv.className = 'error';
      return;
    }
    
    // Use the first MAX tab found (since MAX window is always open)
    const maxTab = maxTabs[0];

    resultDiv.innerHTML = `
      <div style="color: green;">✓ Found MAX window</div>
      <div style="font-size: 11px;">Title: ${maxTab.title}</div>
      <div style="font-size: 11px; margin-bottom: 8px;">URL: ${maxTab.url}</div>
      <div>Checking for call data...</div>
    `;
    
    // Inject content script and scrape number
    const results = await chrome.scripting.executeScript({
      target: { tabId: maxTab.id },
      func: extractCallingNumber
    });
    
    const callingNumber = results[0].result;
    
    if (callingNumber && callingNumber !== 'Calling number not found') {
      resultDiv.innerHTML = `
        <div class="success">Phone: ${callingNumber}</div>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">
          Opening search page...
        </div>
      `;
      resultDiv.className = 'success';
      
      // Open search in new tab and wait for it to load
      const searchUrl = `https://support.houseloan.com/search/all?term=${callingNumber}`;
      const searchTab = await chrome.tabs.create({
        url: searchUrl,
        active: true
      });
      
      // Wait for the tab to finish loading
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === searchTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 10000);
      });
      
      // Small additional delay to ensure content is rendered
      await new Promise(resolve => setTimeout(resolve, 500));
      
      resultDiv.innerHTML += '<div style="font-size: 12px; color: #666;">Searching for requester...</div>';
      
      // Scrape the search results page
      const scrapeResults = await chrome.scripting.executeScript({
        target: { tabId: searchTab.id },
        func: scrapeSearchResults
      });
      
      const requesterData = scrapeResults[0].result;
      
      if (requesterData.found && requesterData.scenario === 1) {
        // Scenario 1: Single requester found
        const dataToStore = {
          requesterName: requesterData.name,
          requesterUserId: requesterData.userId,
          phoneNumber: callingNumber,
          timestamp: Date.now()
        };
        
        // Store in chrome.storage.local
        await chrome.storage.local.set({ currentRequester: dataToStore });
        
        resultDiv.innerHTML = `
          <div class="success">✓ Requester Found</div>
          <div style="margin-top: 8px;">
            <strong>${requesterData.name}</strong><br>
            Phone: ${callingNumber}<br>
            User ID: ${requesterData.userId}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 8px;">
            Opening requester profile and new ticket form...
          </div>
        `;
        resultDiv.className = 'success';
        
        // Open requester page
        await chrome.tabs.create({ 
          url: `https://support.houseloan.com/users/${requesterData.userId}`,
          active: false
        });
        
        // Open New Incident tab
        await chrome.tabs.create({ 
          url: 'https://support.houseloan.com/a/tickets/new',
          active: false
        });
        
        resultDiv.innerHTML += '<div style="font-size: 12px; color: #666; margin-top: 5px;">✓ All tabs opened</div>';
        
      } else {
        // Not scenario 1 - show debug info
        resultDiv.innerHTML = `
          <div style="color: orange; margin-bottom: 8px;">⚠ Requester Status</div>
          <div style="margin-bottom: 8px;">
            Phone: ${callingNumber}
          </div>
          <div style="font-size: 11px; color: #666;">
            <strong>Search Result:</strong> ${requesterData.reason || 'Unknown'}<br>
            ${requesterData.count ? `Found ${requesterData.count} requesters` : ''}
          </div>
          <div style="font-size: 11px; margin-top: 8px; color: #666;">
            → Manual selection may be required
          </div>
        `;
        resultDiv.className = '';
        resultDiv.style.background = '#fff3cd';
        resultDiv.style.borderLeft = '4px solid #ffc107';
        
        // Still open new incident tab for manual work
        await chrome.tabs.create({ 
          url: 'https://support.houseloan.com/a/tickets/new',
          active: false
        });
      }
      
    } else {
      // Show detailed debugging information
      resultDiv.innerHTML = `
        <div style="color: green; margin-bottom: 8px;">✓ MAX window found: ${maxTab.title}</div>
        <div class="error">X No customer number found</div>
        <div style="font-size: 11px; margin-top: 8px; color: #666;">
          <strong>Call Status:</strong><br>
          No active call detected or calling number not available<br>
          <br>
          <strong>→ No active call detected</strong>
        </div>
      `;
      resultDiv.className = 'error';
    }
    
  } catch (error) {
    resultDiv.innerHTML = `
      <div class="error">X Extension Error</div>
      <div style="font-size: 11px; margin-top: 5px; color: #666;">
        Error: ${error.message}<br>
        Stack: ${error.stack?.split('\n')[0] || 'No stack trace'}
      </div>
    `;
    resultDiv.className = 'error';
  }
}

// Execute the main function immediately when popup opens
main();

function extractCallingNumber() {
  // Method 1: Target the <b> tag containing "Calling Number:"
  const callingNumberElements = Array.from(document.querySelectorAll('b'))
    .filter(b => b.textContent.includes('Calling Number:'));
  
  if (callingNumberElements.length > 0) {
    // Get the next text node after the <b> tag
    const nextSibling = callingNumberElements[0].nextSibling;
    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
      return nextSibling.textContent.trim();
    }
  }
  
  // Method 2: Alternative approach - look for the pattern in the paragraph
  const paragraphs = document.querySelectorAll('p');
  for (const p of paragraphs) {
    const text = p.textContent;
    if (text.includes('Calling Number:')) {
      // Extract number after "Calling Number:"
      const match = text.match(/Calling Number:\s*([0-9]+)/);
      if (match) {
        return match[1];
      }
    }
  }
  
  // Method 3: If it's in an iframe, we might need to access iframe content
  const iframe = document.querySelector('iframe[allow*="camera"]');
  if (iframe && iframe.contentDocument) {
    const iframeDoc = iframe.contentDocument;
    const callingNumberInIframe = iframeDoc.querySelector('b');
    if (callingNumberInIframe && callingNumberInIframe.textContent.includes('Calling Number:')) {
      const nextSibling = callingNumberInIframe.nextSibling;
      if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
        return nextSibling.textContent.trim();
      }
    }
  }
  
  return 'Calling number not found';
}

// Scrape search results page for requester information
function scrapeSearchResults() {
  try {
    // Find the main search results container
    const searchResults = document.getElementById('search-page-results');
    if (!searchResults) {
      return { found: false, reason: 'Search results container not found' };
    }

    // Find all section lists (ul elements)
    const sections = searchResults.querySelectorAll('ul');
    let requestersSection = null;

    // Look for the Requesters section
    for (const section of sections) {
      const heading = section.querySelector('li.heading');
      if (heading && heading.textContent.trim() === 'Requesters') {
        requestersSection = section;
        break;
      }
    }

    if (!requestersSection) {
      return { found: false, reason: 'No Requesters section found' };
    }

    // Get all requester links (excluding the heading)
    const requesterLinks = Array.from(requestersSection.querySelectorAll('a.search-title'));
    
    if (requesterLinks.length === 0) {
      return { found: false, reason: 'No requesters found in section' };
    }

    if (requesterLinks.length > 1) {
      return { found: false, reason: `Multiple requesters found (${requesterLinks.length})`, count: requesterLinks.length };
    }

    // Scenario 1: Exactly one requester
    const requesterLink = requesterLinks[0];
    const name = requesterLink.textContent.trim();
    const href = requesterLink.getAttribute('href');
    
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
    return { found: false, reason: `Error: ${error.message}` };
  }
}