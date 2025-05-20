// Content script (picker.js)
console.log("Scraper-Eraser content script loaded.");

let isSelectionModeActive = false;
let originalBodyCursor = document.body.style.cursor;
let lastHoveredElement = null;

const HIGHLIGHT_STYLE_PROPERTY = "outline";
const HIGHLIGHT_STYLE_VALUE = "2px dashed red";
let originalElementStyle = "";

// Global variable to store event listeners while waiting for the selection process
let lastReceivedEventListeners = null;

// Add a debug flag to control verbose logging
const DEBUG = true;

// Function to log debug messages conditionally
function debug(message, ...args) {
  if (DEBUG) {
    console.log(`[Picker DEBUG] ${message}`, ...args);
  }
}

function applyHoverHighlight(element) {
  if (element && element !== document.body && element !== document.documentElement) {
    originalElementStyle = element.style.getPropertyValue(HIGHLIGHT_STYLE_PROPERTY);
    element.style.setProperty(HIGHLIGHT_STYLE_PROPERTY, HIGHLIGHT_STYLE_VALUE, "important");
    lastHoveredElement = element;
  }
}

function removeHoverHighlight() {
  console.log("[Picker DEBUG] removeHoverHighlight: Called. lastHoveredElement:", lastHoveredElement, "Original style to restore:", originalElementStyle);
  if (lastHoveredElement) {
    lastHoveredElement.style.setProperty(HIGHLIGHT_STYLE_PROPERTY, originalElementStyle);
    console.log("[Picker DEBUG] removeHoverHighlight: Restored style on", lastHoveredElement);
    lastHoveredElement = null;
    originalElementStyle = "";
  } else {
    console.log("[Picker DEBUG] removeHoverHighlight: No lastHoveredElement to remove highlight from.");
  }
}

function handleMouseOver(event) {
  if (!isSelectionModeActive) return;
  removeHoverHighlight();
  applyHoverHighlight(event.target);
}

function handleMouseOut(event) {
  if (!isSelectionModeActive) return;
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
            "Please open DevTools (F12) and select Scraper-Eraser panel");
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
          note: "DevTools panel not connected. Please open DevTools (F12) and select the Scraper-Eraser panel to capture event listeners." 
        }];
      }
    } catch (err) {
      devToolsError = err;
      console.warn("[Picker DEBUG] Picker.js: Error in DevTools communication flow:", err.message);
      eventListeners = [{ note: "Exception during listener capture: " + err.message }];
    }

    // Add comment at top of the bundled text to help the user understand the output
    const bundledText = 
`/* --- Scraper-Eraser Element Data --- */
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

/* --- Additional Info --- */
${eventListeners && eventListeners.error ? 
`/* Note: Could not fully retrieve event listeners. This is often due to DevTools security restrictions.
   The element's HTML and CSS have been successfully captured.
   Attempted selectors: ${JSON.stringify(eventListeners.fallbackData?.fallbackSelectors || [])} */` : ''}
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

  document.addEventListener("mouseover", handleMouseOver, true);
  document.addEventListener("mouseout", handleMouseOut, true);
  document.addEventListener("click", handleElementClick, true);
}

function deactivateSelectionMode() {
  console.log("[Picker DEBUG] deactivateSelectionMode: Called. Current isSelectionModeActive before change:", isSelectionModeActive);
  isSelectionModeActive = false;
  console.log("[Picker DEBUG] deactivateSelectionMode: isSelectionModeActive set to false.");

  document.removeEventListener("mouseover", handleMouseOver, true);
  document.removeEventListener("mouseout", handleMouseOut, true);
  document.removeEventListener("click", handleElementClick, true);
  console.log("[Picker DEBUG] deactivateSelectionMode: Event listeners removed.");

  document.body.style.cursor = originalBodyCursor;
  removeHoverHighlight();
  console.log("[Picker DEBUG] deactivateSelectionMode: Cursor reverted, highlight removal attempted.");
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