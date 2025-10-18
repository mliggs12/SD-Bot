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
          Opening search...
        </div>
      `;
      resultDiv.className = 'success';
      
      // Open New Incident tab
      await chrome.tabs.create({ url: 'https://support.houseloan.com/a/tickets/new'});
      // Open search in new tab
      const searchUrl = `https://support.houseloan.com/search/all?term=${callingNumber}`;
      await chrome.tabs.create({
        url: searchUrl,
        active: true
      });
      
      resultDiv.innerHTML += '<div style="font-size: 12px; color: #666; margin-top: 5px;">Search opened in new tab</div>';
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
