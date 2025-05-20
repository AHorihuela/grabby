// Content script (picker.js)
console.log("Grabby content script loaded.");

let isSelectionModeActive = false;
let originalBodyCursor = document.body.style.cursor;
let lastHoveredElement = null;

// Global variable to store event listeners while waiting for the selection process
let lastReceivedEventListeners = null;

// Add a debug flag to control verbose logging
const DEBUG = true;

// Create and inject overlay elements for highlighting - more like DevTools
let highlightOverlay = null;
let labelOverlay = null;

// Function to create the overlay elements
function createOverlayElements() {
  if (highlightOverlay) return; // Already created
  
  // Create highlight box
  highlightOverlay = document.createElement('div');
  highlightOverlay.style.position = 'fixed';
  highlightOverlay.style.pointerEvents = 'none'; // Let events pass through
  highlightOverlay.style.boxSizing = 'border-box';
  highlightOverlay.style.border = '2px solid rgba(255, 0, 0, 0.8)';
  highlightOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
  highlightOverlay.style.zIndex = '2147483647'; // Highest z-index
  highlightOverlay.style.display = 'none';
  
  // Create element label
  labelOverlay = document.createElement('div');
  labelOverlay.style.position = 'fixed';
  labelOverlay.style.pointerEvents = 'none';
  labelOverlay.style.padding = '3px 6px';
  labelOverlay.style.backgroundColor = '#333';
  labelOverlay.style.color = '#fff';
  labelOverlay.style.borderRadius = '3px';
  labelOverlay.style.fontSize = '12px';
  labelOverlay.style.fontFamily = 'monospace';
  labelOverlay.style.zIndex = '2147483647';
  labelOverlay.style.display = 'none';
  
  // Append to DOM
  document.body.appendChild(highlightOverlay);
  document.body.appendChild(labelOverlay);
}

// Function to remove overlay elements
function removeOverlayElements() {
  if (highlightOverlay && highlightOverlay.parentNode) {
    highlightOverlay.parentNode.removeChild(highlightOverlay);
    highlightOverlay = null;
  }
  
  if (labelOverlay && labelOverlay.parentNode) {
    labelOverlay.parentNode.removeChild(labelOverlay);
    labelOverlay = null;
  }
}

// Function to log debug messages conditionally
function debug(message, ...args) {
  if (DEBUG) {
    console.log(`[Picker DEBUG] ${message}`, ...args);
  }
}

// New function to collect script sources affecting the page
function collectScriptSources(element) {
  debug("Collecting script sources");
  
  // Collect all script tags on the page
  const scripts = Array.from(document.scripts);
  
  // Group scripts by type (external vs inline)
  const result = {
    externalScripts: [],
    inlineScripts: [],
    relevantScripts: []
  };
  
  // Extract element identifiers for relevance detection
  let elementId = element.id || '';
  let classNames = [];
  if (typeof element.className === 'string') {
    classNames = element.className.split(/\s+/).filter(c => c.trim());
  } else if (element.className && element.className.baseVal) {
    classNames = element.className.baseVal.split(/\s+/).filter(c => c.trim());
  }
  const tagName = element.tagName.toLowerCase();
  
  scripts.forEach((script, index) => {
    if (script.src) {
      // External script
      const scriptInfo = {
        index,
        src: script.src,
        type: script.type || 'text/javascript',
        async: script.async,
        defer: script.defer
      };
      
      result.externalScripts.push(scriptInfo);
    } else if (script.textContent && script.textContent.trim().length > 0) {
      // Inline script (only include if it has content)
      // Limit size to avoid extremely large captures
      const maxContentLength = 500;
      let content = script.textContent.trim();
      const truncated = content.length > maxContentLength;
      
      if (truncated) {
        content = content.substring(0, maxContentLength) + '... [truncated]';
      }
      
      const scriptInfo = {
        index,
        type: script.type || 'text/javascript',
        content: content,
        truncated: truncated,
        originalLength: script.textContent.length
      };
      
      result.inlineScripts.push(scriptInfo);
      
      // Check if script content references any of the element's identifiers
      const scriptText = script.textContent;
      const isRelevant = 
        (elementId && scriptText.includes(elementId)) || 
        classNames.some(className => scriptText.includes(className)) ||
        scriptText.includes(`"${tagName}"`) || 
        scriptText.includes(`'${tagName}'`) ||
        scriptText.includes(`<${tagName}`) ||
        scriptText.includes(`querySelector`) || 
        scriptText.includes(`getElementById`);
      
      if (isRelevant) {
        result.relevantScripts.push({
          ...scriptInfo,
          relevanceReason: [
            elementId && scriptText.includes(elementId) ? `Includes element ID: ${elementId}` : null,
            classNames.some(className => scriptText.includes(className)) ? 
              `Includes class name(s): ${classNames.filter(cn => scriptText.includes(cn)).join(', ')}` : null,
            scriptText.includes(`"${tagName}"`) || scriptText.includes(`'${tagName}'`) || scriptText.includes(`<${tagName}`) ? 
              `References tag name: ${tagName}` : null,
            scriptText.includes(`querySelector`) || scriptText.includes(`getElementById`) ? 
              `Contains DOM selection methods` : null
          ].filter(Boolean)
        });
      }
    }
  });
  
  // Try to fetch relevant external scripts
  if (result.externalScripts.length > 0) {
    // Note: For security reasons, we can't actually fetch the content of external scripts
    // due to CORS restrictions, but we can prioritize them by URL patterns
    
    // Look for URLs that might be relevant to this element
    result.externalScripts.forEach(script => {
      const url = script.src.toLowerCase();
      const relevanceMarkers = [
        ...(elementId ? [elementId.toLowerCase()] : []),
        ...classNames.map(c => c.toLowerCase()),
        tagName
      ];
      
      // Check if URL contains any of our relevance markers
      const matchingMarkers = relevanceMarkers.filter(marker => url.includes(marker));
      if (matchingMarkers.length > 0) {
        result.relevantScripts.push({
          ...script,
          relevanceReason: [`URL matches identifier(s): ${matchingMarkers.join(', ')}`]
        });
      } else if (url.includes('jquery') || url.includes('react') || 
                url.includes('angular') || url.includes('vue')) {
        // Add common frameworks that might be relevant
        result.relevantScripts.push({
          ...script,
          relevanceReason: [`Common JavaScript framework or library`]
        });
      }
    });
  }
  
  return result;
}

// Function to find inline event handlers on an element
function getInlineEventHandlers(element) {
  debug("Getting inline event handlers");
  
  const result = {};
  
  // Check all attributes for "on" event handlers (onclick, onmouseover, etc.)
  Array.from(element.attributes).forEach(attr => {
    if (attr.name.startsWith('on')) {
      const eventType = attr.name.slice(2); // Remove "on" prefix
      result[eventType] = attr.value;
    }
  });
  
  return result;
}

// Function to position the highlight overlay on an element
function positionHighlightOverlay(element) {
  if (!element || !highlightOverlay || !labelOverlay) return;
  
  try {
    // Get element's position and dimensions
    const rect = element.getBoundingClientRect();
    
    // Update highlight box
    highlightOverlay.style.top = rect.top + 'px';
    highlightOverlay.style.left = rect.left + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
    highlightOverlay.style.display = 'block';
    
    // Update label
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    let classes = '';
    
    if (typeof element.className === 'string' && element.className.trim()) {
      classes = '.' + element.className.trim().replace(/\s+/g, '.');
    } else if (element.className && element.className.baseVal && element.className.baseVal.trim()) {
      classes = '.' + element.className.baseVal.trim().replace(/\s+/g, '.');
    }
    
    labelOverlay.textContent = `${tagName}${id}${classes}`;
    labelOverlay.style.top = (rect.top - 20) + 'px';
    labelOverlay.style.left = rect.left + 'px';
    labelOverlay.style.display = 'block';
    
    // If label would go off the top of the screen, position it at the bottom of the element instead
    if (rect.top < 20) {
      labelOverlay.style.top = (rect.bottom + 2) + 'px';
    }
  } catch (error) {
    debug('Error positioning highlight overlay:', error);
  }
}

// Hide the highlight overlay
function hideHighlightOverlay() {
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none';
  }
  
  if (labelOverlay) {
    labelOverlay.style.display = 'none';
  }
}

function applyHoverHighlight(element) {
  if (element && element !== document.body && element !== document.documentElement) {
    lastHoveredElement = element;
    positionHighlightOverlay(element);
    
    // Show info about selected element to help debugging
    debug(`Highlighted element: ${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''} with classes: ${element.className}`);
  }
}

function removeHoverHighlight() {
  lastHoveredElement = null;
  hideHighlightOverlay();
}

// Function to find the best element at the cursor position
function getBestElementAtPoint(x, y) {
  // Standard approach - get element directly at point
  let element = document.elementFromPoint(x, y);
  
  // Ensure we have a valid element
  if (!element || element === document.body || element === document.documentElement) {
    return null;
  }
  
  // If it's a text node, get its parent
  if (element.nodeType === 3) {
    element = element.parentElement;
  }
  
  return element;
}

// Simplified mouse move handler
function handleMouseMove(event) {
  if (!isSelectionModeActive) return;
  
  // Find the best element at the current position
  const element = getBestElementAtPoint(event.clientX, event.clientY);
  
  // Skip if no element found or if it's the same as current
  if (!element || element === lastHoveredElement) return;
  
  // Update highlighting
  removeHoverHighlight();
  applyHoverHighlight(element);
}

// Keep a simple mouseover handler as backup
function handleMouseOver(event) {
  if (!isSelectionModeActive) return;
  
  const element = event.target;
  
  // Skip if it's the same as current
  if (element === lastHoveredElement) return;
  
  removeHoverHighlight();
  applyHoverHighlight(element);
}

function handleMouseOut(event) {
  if (!isSelectionModeActive) return;
  
  // Only remove if we're truly leaving the element
  if (lastHoveredElement && !lastHoveredElement.contains(event.relatedTarget)) {
    removeHoverHighlight();
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.left = "50%";
  toast.style.transform = "translateX(-50%)";
  toast.style.padding = "10px 20px";
  toast.style.backgroundColor = "#333";
  toast.style.color = "white";
  toast.style.borderRadius = "5px";
  toast.style.zIndex = "2147483647"; // Max z-index
  toast.style.opacity = "0";
  toast.style.transition = "opacity 0.5s ease-in-out";

  document.body.appendChild(toast);

  // Fade in
  setTimeout(() => {
    toast.style.opacity = "1";
  }, 10); // Short delay to ensure transition applies

  // Fade out and remove
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 500); // Wait for fade out transition to complete
  }, 2500); // Show toast for 2.5 seconds
}

// Helper function for checking clipboard permissions
async function checkClipboardPermissions() {
  try {
    // Try to get clipboard permissions status
    const permissionStatus = await navigator.permissions.query({ name: 'clipboard-write' });
    console.log(`[Picker DEBUG] Clipboard permission status: ${permissionStatus.state}`);
    return permissionStatus.state === 'granted';
  } catch (error) {
    console.warn("[Picker DEBUG] Unable to query clipboard permissions:", error);
    // Fall back to direct attempt if permissions query not supported
    return true;
  }
}

// Helper function to safely write to clipboard
async function safeClipboardWrite(text) {
  console.log("[Picker DEBUG] Attempting to write to clipboard. Text length:", text.length);
  
  try {
    // First check if Clipboard API is available
    if (!navigator.clipboard) {
      throw new Error("Clipboard API not available in this browser/context");
    }

    // Check permissions if possible
    await checkClipboardPermissions();
    
    // Try to write to clipboard
    await navigator.clipboard.writeText(text);
    console.log("[Picker DEBUG] Successfully wrote to clipboard!");
    return { success: true };
  } catch (error) {
    console.warn("[Picker DEBUG] Clipboard API write failed, falling back to execCommand:", error);
    
    // Try fallback method with execCommand
    try {
      console.log("[Picker DEBUG] Attempting fallback clipboard method...");
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        console.log("[Picker DEBUG] Fallback clipboard method succeeded");
        return { success: true, fallback: true };
      } else {
        console.error("[Picker DEBUG] Fallback clipboard method also failed");
        return { success: false, error: "Both clipboard methods failed", fallback: true };
      }
    } catch (fallbackError) {
      console.error("[Picker DEBUG] Fallback clipboard error:", fallbackError);
      return { success: false, error: error.message, fallbackError: fallbackError.message };
    }
  }
}

// Add this function to explicitly check and request DevTools panel activation
async function ensureDevToolsConnection() {
  debug("Checking DevTools connection status");
  
  try {
    // First try a direct connection check
    const devToolsStatusCheck = await new Promise((resolve) => {
      let hasResponded = false;
      const timeoutId = setTimeout(() => {
        if (!hasResponded) {
          hasResponded = true;
          resolve({ connected: false, timeout: true });
        }
      }, 500); // Short timeout since this is just a quick check
      
      chrome.runtime.sendMessage({ action: "checkDevToolsConnection" }, (response) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!hasResponded) {
          hasResponded = true;
          if (chrome.runtime.lastError) {
            debug("DevTools connection check error:", chrome.runtime.lastError);
            resolve({ connected: false, error: chrome.runtime.lastError.message });
          } else {
            debug("DevTools connection check succeeded:", response);
            resolve({ connected: true, response });
          }
        }
      });
    });
    
    if (!devToolsStatusCheck.connected) {
      // Request the background page to help open DevTools if possible
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "openDevToolsPanel" }, (response) => {
          debug("Open DevTools panel response:", response);
          // Show a message to the user
          showToast(response && response.note ? 
            response.note : 
            "Please open DevTools (F12) and select Grabby panel");
          resolve();
        });
      });
      
      // Wait a moment after showing the message
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return devToolsStatusCheck.connected;
  } catch (err) {
    debug("Error checking DevTools connection:", err);
    return false;
  }
}

// Update the beginning of handleElementClick to include DevTools connection check
async function handleElementClick(event) {
  if (!isSelectionModeActive) return;
  debug("handleElementClick: Entered!");
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const clickedElement = event.target;
  console.log("--- Element Clicked ---");
  let successfullyCopied = false;

  try {
    // First, try to ensure DevTools connection for better listener data
    const devToolsConnected = await ensureDevToolsConnection();
    debug("DevTools connected:", devToolsConnected);
    
    const outerHTML = clickedElement.outerHTML;
    console.log("Outer HTML:", outerHTML);

    // Collect script sources
    const scriptSources = collectScriptSources(clickedElement);
    debug("Collected script sources:", scriptSources);
    
    // Get inline event handlers
    const inlineHandlers = getInlineEventHandlers(clickedElement);
    debug("Inline event handlers:", inlineHandlers);

    const computedStyles = window.getComputedStyle(clickedElement);
    let stylesString = "";
    let classNameString = "";
    if (clickedElement.className) {
      if (typeof clickedElement.className === 'string') {
        classNameString = clickedElement.className.trim().replace(/\s+/g, '.');
      } else if (typeof clickedElement.className === 'object' && clickedElement.className.baseVal !== undefined) {
        classNameString = clickedElement.className.baseVal.trim().replace(/\s+/g, '.');
      }
    }
    const safeClassNameString = classNameString ? '.' + classNameString : '';
    stylesString += `/* Computed styles for element: ${clickedElement.tagName.toLowerCase()}${clickedElement.id ? '#' + clickedElement.id : ''}${safeClassNameString} */\n`;
    stylesString += `element {\n`;
    for (let i = 0; i < computedStyles.length; i++) {
      const propName = computedStyles[i];
      stylesString += `  ${propName}: ${computedStyles.getPropertyValue(propName)};\n`;
    }
    stylesString += `}\n`;
    console.log("Computed CSS Block:\n", stylesString);

    // Reset the global variable before requesting listeners
    lastReceivedEventListeners = null;

    let eventListeners = [];
    let devToolsError = null;
    try {
      console.log("[Picker DEBUG] Picker.js: Sending fetchEventListeners request to DevTools panel...");

      // Skip the redundant check as we already have devToolsConnected from ensureDevToolsConnection
      if (devToolsConnected) {
        // If connected, now request event listeners
        const listenersRequest = await new Promise((resolve) => {
          let hasResponded = false;
          const timeoutId = setTimeout(() => {
            if (!hasResponded) {
              hasResponded = true;
              resolve({ 
                timeout: true, 
                listeners: [{ note: "DevTools response timed out - check DevTools panel is open" }] 
              });
            }
          }, 1500);

          try {
            chrome.runtime.sendMessage({
              action: "fetchEventListeners",
              targetElementInfo: { 
                tagName: clickedElement.tagName, 
                id: clickedElement.id, 
                classes: clickedElement.className 
              }
            }, (response) => {
              if (timeoutId) clearTimeout(timeoutId);
              if (!hasResponded) {
                hasResponded = true;
                if (chrome.runtime.lastError) {
                  resolve({ 
                    error: chrome.runtime.lastError.message,
                    listeners: [{ note: "Error from DevTools: " + chrome.runtime.lastError.message }]
                  });
                } else {
                  resolve(response || { 
                    listeners: [{ note: "Empty response from DevTools panel" }]
                  });
                }
              }
            });
          } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (!hasResponded) {
              hasResponded = true;
              resolve({ 
                error: err.message,
                listeners: [{ note: "Exception requesting listeners: " + err.message }]
              });
            }
          }
        });

        // Check if we received initial listeners
        if (listenersRequest.listeners) {
          eventListeners = listenersRequest.listeners;
          console.log("[Picker DEBUG] Initial event listeners response:", eventListeners);
        }

        // Now wait briefly to see if we get the actual listeners via the separate message
        // Only do this if we received a preliminary response
        if (listenersRequest.preliminary) {
          console.log("[Picker DEBUG] Waiting for full listeners data...");
          
          // Wait up to 1.5 seconds for the full listeners data
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // If we received listeners during the wait, use those
          if (lastReceivedEventListeners) {
            console.log("[Picker DEBUG] Using event listeners received via separate message");
            eventListeners = lastReceivedEventListeners;
          }
        }
      } else {
        // DevTools not connected, provide a helpful message
        eventListeners = [{ 
          note: "DevTools panel not connected. Please open DevTools (F12) and select the Grabby panel to capture event listeners." 
        }];
      }
    } catch (err) {
      devToolsError = err;
      console.warn("[Picker DEBUG] Picker.js: Error in DevTools communication flow:", err.message);
      eventListeners = [{ note: "Exception during listener capture: " + err.message }];
    }

    // Add comment at top of the bundled text to help the user understand the output
    const bundledText = 
`/* --- Grabby Element Data --- */
/* Element: ${clickedElement.tagName.toLowerCase()}${clickedElement.id ? '#' + clickedElement.id : ''}${safeClassNameString} */
/* Captured on: ${new Date().toLocaleString()} */
${devToolsError ? `/* Note: DevTools error - ${devToolsError.message} */\n` : ''}
${devToolsConnected ? '/* DevTools Connected */\n' : '/* DevTools Not Connected */\n'}

/* --- index.html --- */
/*
${outerHTML}
*/

/* --- styles.css --- */
/* Computed styles for element: ${clickedElement.tagName.toLowerCase()}${clickedElement.id ? '#' + clickedElement.id : ''}${safeClassNameString} */

/* CSS-compatible selector */
${clickedElement.tagName.toLowerCase()}${clickedElement.id ? '#' + clickedElement.id : ''}${
  typeof clickedElement.className === 'string' && clickedElement.className.trim() 
  ? '.' + clickedElement.className.trim().replace(/\s+/g, '.') 
  : ''
} {
  ${stylesString.includes('element {') 
    ? stylesString
        .split('element {')[1]
        .replace(/^\s*}\s*$/m, '') // Remove the closing bracket
        .split('\n')
        .filter(line => line.trim())
        .join('\n  ')
    : '/* No computed styles available */'}
}

/* --- listeners.json --- */
/*
${JSON.stringify(eventListeners, null, 2)}
*/

/* --- javascript-data.json --- */
/*
{
  "inlineHandlers": ${JSON.stringify(inlineHandlers, null, 2)},
  "relevantScripts": ${JSON.stringify(scriptSources.relevantScripts || [], null, 2)}
}
*/

/* --- all-scripts.json --- */
/*
{
  "externalScripts": ${JSON.stringify(scriptSources.externalScripts || [], null, 2)},
  "inlineScripts": ${JSON.stringify(scriptSources.inlineScripts || [], null, 2)}
}
*/

/* --- Additional Info --- */
${eventListeners && eventListeners.error ? 
`/* Note: Could not fully retrieve event listeners. This is often due to DevTools security restrictions.
   The element's HTML and CSS have been successfully captured.
   Attempted selectors: ${JSON.stringify(eventListeners.fallbackData?.fallbackSelectors || [])} */` : ''}
${scriptSources.relevantScripts && scriptSources.relevantScripts.length ? 
`/* Note: Found ${scriptSources.relevantScripts.length} JavaScript files/snippets that may be relevant to this element.
   These are included in the javascript-data.json section. */` : 
`/* Note: No relevant JavaScript files detected for this element. */`}
`;

    // Use the enhanced clipboard function
    const clipboardResult = await safeClipboardWrite(bundledText);
    
    if (clipboardResult.success) {
      console.log("Snippet copied to clipboard!");
      if (clipboardResult.fallback) {
        showToast("Snippet copied to clipboard (fallback method)");
      } else {
        showToast("Snippet copied to clipboard!");
      }
      successfullyCopied = true;
    } else {
      console.error("[Picker DEBUG] Failed to copy to clipboard:", clipboardResult);
      
      // Handle permissions policy specifically
      if (clipboardResult.error && clipboardResult.error.includes('permissions policy')) {
        showToast("Clipboard access blocked by site policy. Try a different site.");
      } else {
        showToast("Error copying to clipboard: " + (clipboardResult.error || "Unknown error"));
      }
    }

  } catch (e) {
    // This outer catch is for errors in HTML/CSS capture, not DevTools or Clipboard.
    console.error("Error during HTML/CSS capture (outer try-catch):", e);
    showToast("Error during data capture: " + e.message);
  } finally {
    console.log("[Picker DEBUG] handleElementClick: Entering finally block. SuccessfullyCopied:", successfullyCopied);
    deactivateSelectionMode();
    chrome.runtime.sendMessage({ action: "selectionMade", newPickerState: false });
    console.log("[Picker DEBUG] Selection complete. Mode deactivated message sent from finally block.");
  }
}

function activateSelectionMode() {
  console.log("[Picker DEBUG] activateSelectionMode: Activating. isSelectionModeActive set to true.");
  isSelectionModeActive = true;
  originalBodyCursor = document.body.style.cursor;
  document.body.style.cursor = "crosshair";
  console.log("Selection mode ACTIVATED - Cursor crosshair, hover highlighting active.");
  
  // Create overlay elements
  createOverlayElements();

  // Use mousemove as primary handler - it's more reliable for complex layouts
  document.addEventListener("mousemove", handleMouseMove, true);
  
  // Keep mouseover/out as backups
  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("mouseout", handleMouseOut, true);
  
  // Click handler for selection
  document.addEventListener("click", handleElementClick, true);
  
  // Show simple instructions
  showToast("Element selection mode active. Click on any element to capture it.");
}

function deactivateSelectionMode() {
  console.log("[Picker DEBUG] deactivateSelectionMode: Called. Current isSelectionModeActive before change:", isSelectionModeActive);
  isSelectionModeActive = false;
  console.log("[Picker DEBUG] deactivateSelectionMode: isSelectionModeActive set to false.");

  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("mouseout", handleMouseOut, true);
  document.removeEventListener("click", handleElementClick, true);
  
  console.log("[Picker DEBUG] deactivateSelectionMode: Event listeners removed.");

  document.body.style.cursor = originalBodyCursor;
  removeHoverHighlight();
  removeOverlayElements();
  console.log("[Picker DEBUG] deactivateSelectionMode: Cursor reverted, overlay elements removed.");
}

// Listen for messages from the background script (toolbar icon click)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Picker DEBUG] Received message:", message.action);
  
  if (message.action === "toggleSelectionMode") {
    if (!isSelectionModeActive) {
      activateSelectionMode();
    } else {
      deactivateSelectionMode();
    }
    sendResponse({ status: "selectionModeToggled", isActive: isSelectionModeActive });
    return true;
  } else if (message.action === "devToolsConnectionTest") {
    // Respond to connection tests from the DevTools panel
    console.log("[Picker DEBUG] Received connection test from DevTools panel");
    sendResponse({ success: true, pickerActive: isSelectionModeActive });
    return true;
  } else if (message.action === "checkDevToolsConnection") {
    // Added to allow explicit connection checking
    console.log("[Picker DEBUG] Received DevTools connection check");
    sendResponse({ connected: true, timestamp: new Date().toISOString() });
    return true;
  } else if (message.action === "eventListenersResult") {
    // Handle the separate message with full event listener data
    console.log("[Picker DEBUG] Received event listeners result:", message.listeners);
    
    // Improve error handling for the listeners result
    if (message.listeners && message.listeners.error) {
      console.warn("[Picker DEBUG] Error in listeners result:", message.listeners.error);
      
      // Create a more informative structure that includes the error but is still usable
      lastReceivedEventListeners = {
        error: message.listeners.error,
        note: "Error retrieving event listeners. This might happen if the element cannot be found or if DevTools is not in the right context.",
        fallbackData: {
          selector: message.selector || "unknown",
          fallbackSelectors: message.fallbackSelectors || [],
          timestamp: message.timestamp || new Date().toISOString(),
          partial: true
        }
      };
      
      // If we used a fallback selector and it succeeded, add that info
      if (message.listeners.usedFallback && message.listeners.fallbackSelector) {
        lastReceivedEventListeners.note += ` A fallback selector was tried: ${message.listeners.fallbackSelector}`;
      }
    } else {
      // If we have listener data but it used a fallback, add that info
      if (message.listeners && message.listeners.usedFallback) {
        const enhancedListeners = {
          ...message.listeners,
          note: `Retrieved listeners using fallback selector: ${message.listeners.fallbackSelector || "unknown"}`,
        };
        lastReceivedEventListeners = enhancedListeners;
      } else {
        // Store the listeners normally if no error and no fallback used
        lastReceivedEventListeners = message.listeners;
      }
    }
    
    sendResponse({ received: true });
    return true;
  }
  
  // If we get here, we don't recognize the message
  console.log("[Picker DEBUG] Unhandled message action:", message.action);
  sendResponse({ error: "Unhandled message action: " + message.action });
  return true;
}); 