import { CallingNumberResult } from '../types';
import { RINGCENTRAL_SELECTORS } from '../utils/config';
import { formatErrorWithStack } from '../utils/error-handler';

/**
 * Extracts the calling number from RingCentral MAX page DOM
 * Uses multiple fallback strategies to find the phone number
 */
export function extractCallingNumber(): CallingNumberResult {
  try {
    // Method 1: Target the <b> tag containing "Calling Number:"
    const allBoldTags = document.querySelectorAll(RINGCENTRAL_SELECTORS.callingNumberBold);
    const callingNumberElements = Array.from(allBoldTags)
      .filter(b => b.textContent?.includes(RINGCENTRAL_SELECTORS.callingNumberText));
    
    if (callingNumberElements.length > 0) {
      // Get the next text node after the <b> tag
      const nextSibling = callingNumberElements[0].nextSibling;
      if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent) {
        const phoneNumber = nextSibling.textContent.trim();
        if (phoneNumber) {
          return { success: true, phoneNumber };
        }
      }
      // Found the element but no valid phone number in next sibling
      return { 
        success: false, 
        error: `Found "Calling Number:" label but no phone number in adjacent text node. Found ${allBoldTags.length} bold tags total.` 
      };
    }
    
    // Method 2: Alternative approach - look for the pattern in the paragraph
    const paragraphs = document.querySelectorAll(RINGCENTRAL_SELECTORS.paragraph);
    let paragraphsWithText = 0;
    for (const p of paragraphs) {
      const text = p.textContent;
      if (text?.includes(RINGCENTRAL_SELECTORS.callingNumberText)) {
        paragraphsWithText++;
        // Extract number after "Calling Number:"
        const match = text.match(/Calling Number:\s*([0-9]+)/);
        if (match && match[1]) {
          return { success: true, phoneNumber: match[1] };
        }
      }
    }
    
    // Method 3: If it's in an iframe, we might need to access iframe content
    const iframe = document.querySelector(RINGCENTRAL_SELECTORS.iframe) as HTMLIFrameElement;
    if (iframe) {
      if (iframe.contentDocument) {
        const iframeDoc = iframe.contentDocument;
        const callingNumberInIframe = iframeDoc.querySelector(RINGCENTRAL_SELECTORS.callingNumberBold);
        if (callingNumberInIframe && callingNumberInIframe.textContent?.includes(RINGCENTRAL_SELECTORS.callingNumberText)) {
          const nextSibling = callingNumberInIframe.nextSibling;
          if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent) {
            const phoneNumber = nextSibling.textContent.trim();
            if (phoneNumber) {
              return { success: true, phoneNumber };
            }
          }
        }
      } else {
        return { 
          success: false, 
          error: `Found iframe but cannot access contentDocument (cross-origin or not loaded). Found ${allBoldTags.length} bold tags, ${paragraphs.length} paragraphs.` 
        };
      }
    }
    
    // Provide detailed context about what was found
    const context = [
      `Found ${allBoldTags.length} bold tag(s)`,
      `Found ${paragraphs.length} paragraph(s)`,
      paragraphsWithText > 0 ? `${paragraphsWithText} paragraph(s) contain "Calling Number:" text` : 'No paragraphs contain "Calling Number:" text',
      iframe ? 'Found iframe element' : 'No iframe element found'
    ].join(', ');
    
    return { 
      success: false, 
      error: `Calling number not found. ${context}. Page may not be fully loaded or call may not be active.` 
    };
  } catch (error) {
    return {
      success: false,
      error: `Error extracting calling number: ${formatErrorWithStack(error, true)}`
    };
  }
}

