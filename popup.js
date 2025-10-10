const tabs = await chrome.tabs.query({
  url: [
    "https://max.niceincontact.com/index.html"
  ]
})

const maxTab = tabs[0]
console.log(maxTab.id)

const results = await chrome.scripting.executeScript({
  target: { tabId: maxTab.id },
  func: extractCallingNumber
});

if (results && results[0] && results[0].result) {
  const callingNumber = results[0].result;
  console.log('Calling number:', callingNumber);

  if (callingNumber !== 'Calling number not found') {
    const searchUrl = `https://support.houseloan.com/search/all?term=${callingNumber}`

    const newTab = await chrome.tabs.create({
      url: searchUrl,
      active: true
    })
  }
}

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

// document.getElementById('findNumber').addEventListener('click', async () => {
//   const resultDiv = document.getElementById('result');
//   resultDiv.textContent = 'Searching for MAX window...';
  
//   try {
//     // First, let's confirm we can find the MAX window
//     const allTabs = await chrome.tabs.query({});
//     const maxTabs = await chrome.tabs.query({
//       url: "https://max.niceincontact.com/*"
//     });
    
//     console.log('Total tabs found:', allTabs.length);
//     console.log('MAX tabs found:', maxTabs.length);
//     console.log('MAX tab details:', maxTabs.map(t => ({ id: t.id, title: t.title, url: t.url })));
    
//     if (maxTabs.length === 0) {
//       resultDiv.innerHTML = `
//         <div class="error">X No MAX tabs found</div>
//         <div style="font-size: 11px; margin-top: 5px;">
//           <strong>Debug Info:</strong><br>
//           Total browser tabs: ${allTabs.length}<br>
//           Looking for: https://max.niceincontact.com/*<br>
//           <br>
//           <strong>All tabs:</strong><br>
//           ${allTabs.slice(0, 5).map(t => `${t.title}: ${t.url}`).join('<br>')}
//           ${allTabs.length > 5 ? '<br>...' : ''}
//         </div>
//       `;
//       resultDiv.className = 'error';
//       return;
//     }
    
//     // Use the first MAX tab found (since MAX window is always open)
//     const maxTab = maxTabs[0];
    
//     resultDiv.innerHTML = `
//       <div style="color: green;">✓ Found MAX window</div>
//       <div style="font-size: 11px;">Title: ${maxTab.title}</div>
//       <div style="font-size: 11px; margin-bottom: 8px;">URL: ${maxTab.url}</div>
//       <div>Checking for call data...</div>
//     `;
    
//     // Inject content script and scrape number
//     const results = await chrome.scripting.executeScript({
//       target: { tabId: maxTab.id },
//       function: scrapeCallingNumberWithDebug
//     });
    
//     const phoneData = results[0].result;
    
//     if (phoneData.number) {
//       resultDiv.innerHTML = `
//         <div class="success">Phone: ${phoneData.number}</div>
//         <div style="font-size: 12px; color: #666; margin-top: 5px;">
//           Contact ID: ${phoneData.contactId || 'N/A'}
//         </div>
//       `;
//       resultDiv.className = 'success';
//     } else {
//       // Show detailed debugging information
//       resultDiv.innerHTML = `
//         <div style="color: green; margin-bottom: 8px;">✓ MAX window found: ${maxTab.title}</div>
//         <div class="error">X No customer number found</div>
//         <div style="font-size: 11px; margin-top: 8px; color: #666;">
//           <strong>Call Status:</strong><br>
//           Contact ID: ${phoneData.contactId ? '✓ ' + phoneData.contactId : 'X None (no active call)'}<br>
//           Bold elements: ${phoneData.boldCount || 0}<br>
//           "Calling Number:" label: ${phoneData.foundLabel ? '✓ Found' : 'X Not found'}<br>
//           ${phoneData.foundLabel ? `Next element: "${phoneData.nextElementText}"<br>` : ''}
//           Iframe present: ${phoneData.iframe ? '✓ Yes' : 'X No'}<br>
//           <br>
//           <strong>First 5 bold elements:</strong><br>
//           ${phoneData.firstFiveBold || 'None found'}
//           <br><br>
//           ${!phoneData.contactId ? '<strong>→ No active call detected</strong>' : ''}
//           ${phoneData.foundLabel && !phoneData.number ? '<strong>→ Found label but no valid phone number</strong>' : ''}
//           ${!phoneData.foundLabel && phoneData.contactId ? '<strong>→ Active call but "Calling Number:" not found</strong>' : ''}
//         </div>
//       `;
//       resultDiv.className = 'error';
//     }
    
//   } catch (error) {
//     resultDiv.innerHTML = `
//       <div class="error">X Extension Error</div>
//       <div style="font-size: 11px; margin-top: 5px; color: #666;">
//         Error: ${error.message}<br>
//         Stack: ${error.stack?.split('\n')[0] || 'No stack trace'}
//       </div>
//     `;
//     resultDiv.className = 'error';
//   }
// });

// Enhanced scraper with focused debugging
// function scrapeCallingNumberWithDebug() {
//   try {
//     const pageUrl = window.location.href;
//     const contactId = document.querySelector('input[name="contactId"]')?.value;
//     const allBoldElements = document.querySelectorAll('b');
//     const hasIframe = document.querySelector('iframe') ? true : false;
    
//     // Get first 5 bold elements for debugging (not all, to keep popup readable)
//     const firstFiveBold = Array.from(allBoldElements)
//       .slice(0, 5)
//       .map((el, i) => `${i}: "${el.textContent.trim()}"`)
//       .join('<br>');
    
//     console.log('=== MAX CLIENT SCRAPING DEBUG ===');
//     console.log('Page URL:', pageUrl);
//     console.log('Contact ID found:', contactId);
//     console.log('Bold elements count:', allBoldElements.length);
//     console.log('Has iframe:', hasIframe);
//     console.log('All bold text:', Array.from(allBoldElements).map(el => el.textContent.trim()));
    
//     // Look for "Calling Number:" label
//     let foundCallingNumberIndex = -1;
//     for (let i = 0; i < allBoldElements.length; i++) {
//       const boldEl = allBoldElements[i];
//       const boldText = boldEl.textContent.trim();
      
//       console.log(`Bold element ${i}: "${boldText}"`);
      
//       if (boldText === 'Calling Number:') {
//         foundCallingNumberIndex = i;
//         console.log('*** Found "Calling Number:" at index', i);
//         break;
//       }
//     }
    
//     if (foundCallingNumberIndex >= 0) {
//       // Found the label, now look for the number in the next <b> element
//       const numberElement = allBoldElements[foundCallingNumberIndex + 1];
//       const nextElementText = numberElement ? numberElement.textContent.trim() : 'No next element';
      
//       console.log('Next element after "Calling Number:":', nextElementText);
      
//       if (numberElement) {
//         const phoneNumber = numberElement.textContent.trim();
//         const cleanNumber = phoneNumber.replace(/\D/g, '');
        
//         console.log('Raw phone text:', phoneNumber);
//         console.log('Clean number:', cleanNumber);
//         console.log('Clean number length:', cleanNumber.length);
        
//         if (cleanNumber.length >= 10) {
//           console.log('*** SUCCESS: Valid phone number found');
//           return {
//             number: cleanNumber,
//             contactId: contactId,
//             foundLabel: true,
//             pageUrl: pageUrl
//           };
//         }
//       }
      
//       // Found "Calling Number:" but no valid number after it
//       console.log('*** Found label but no valid number');
//       return {
//         number: null,
//         contactId: contactId,
//         foundLabel: true,
//         nextElementText: nextElementText,
//         boldCount: allBoldElements.length,
//         firstFiveBold: firstFiveBold,
//         iframe: hasIframe,
//         pageUrl: pageUrl
//       };
//     }
    
//     // Didn't find "Calling Number:" label
//     console.log('*** "Calling Number:" label not found');
//     return {
//       number: null,
//       contactId: contactId,
//       foundLabel: false,
//       boldCount: allBoldElements.length,
//       firstFiveBold: firstFiveBold,
//       iframe: hasIframe,
//       pageUrl: pageUrl
//     };
    
//   } catch (error) {
//     console.error('Scraping error:', error);
//     return {
//       number: null,
//       contactId: null,
//       foundLabel: false,
//       error: error.message,
//       pageUrl: window.location.href
//     };
//   }
// }