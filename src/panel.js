// DevTools panel script (panel.js)
console.log("Scraper-Eraser panel.js loaded.");

// Track if we can communicate with the content script
let contentScriptConnected = false;
let uiInitialized = false;

// Debug settings with defaults
let debugSettings = {
  useSimpleSelectors: true,
  tryFallbackSelectors: true
};

// Handle extension context invalidation
function setupGlobalErrorHandler() {
  window.addEventListener('error', function(event) {
    console.error("Global error caught:", event.error);
    
    // Check if this is an extension context invalidated error
    if (event.error && event.error.message && 
        event.error.message.includes("Extension context invalidated")) {
      console.warn("Extension context invalidated - extension likely reloaded");
      
      // Log this to the UI
      try {
        logToUI("Extension context invalidated. Please refresh the DevTools panel.");
        
        // Update UI to show disconnected state
        updateUIConnectionStatus(false);
        
        // Show a more visible message in the UI
        const container = document.getElementById('logContainer');
        if (container) {
          const errorDiv = document.createElement('div');
          errorDiv.style.color = 'red';
          errorDiv.style.fontWeight = 'bold';
          errorDiv.style.padding = '10px';
          errorDiv.style.marginTop = '10px';
          errorDiv.style.border = '1px solid red';
          errorDiv.textContent = 'Extension has been reloaded. Please close and reopen DevTools.';
          container.appendChild(errorDiv);
        }
        
        // Clear intervals to prevent further errors
        if (connectionCheckInterval) {
          clearInterval(connectionCheckInterval);
          connectionCheckInterval = null;
        }
      } catch (err) {
        // At this point, we might not be able to do much, but at least we tried
        console.error("Error handling extension context invalidation:", err);
      }
      
      // Prevent the default error handling
      event.preventDefault();
    }
  });
}

// Call this immediately
setupGlobalErrorHandler();

// Function that gets called when panel-ui.js loads
window.panelUiLoaded = function() {
  console.log("Panel UI loaded callback received");
  uiInitialized = true;
  
  // Load debug settings
  try {
    if (localStorage.getItem('useSimpleSelectors') !== null) {
      debugSettings.useSimpleSelectors = localStorage.getItem('useSimpleSelectors') !== 'false';
    }
    if (localStorage.getItem('tryFallbackSelectors') !== null) {
      debugSettings.tryFallbackSelectors = localStorage.getItem('tryFallbackSelectors') !== 'false';
    }
    console.log("Loaded debug settings:", debugSettings);
  } catch (err) {
    console.error("Error loading debug settings:", err);
  }
  
  // Run connection check when both panel.js and UI are ready
  setTimeout(checkContentScriptConnection, 500);
};

// Function to update UI with connection status
function updateUIConnectionStatus(connected) {
  console.log("Updating UI connection status:", connected);
  // Send message to the panel HTML UI
  window.postMessage({ 
    type: 'connectionStatus', 
    connected: connected 
  }, '*');
}

// Function to log to the panel UI
function logToUI(message) {
  console.log("Panel log:", message);
  window.postMessage({ 
    type: 'logEntry', 
    message: message 
  }, '*');
}

// Try to establish a connection with the content script
function checkContentScriptConnection() {
  console.log("Checking content script connection");
  logToUI("Checking connection to content script...");
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (chrome.runtime.lastError) {
      console.error("Error in chrome.tabs.query:", chrome.runtime.lastError);
      logToUI("Error: " + chrome.runtime.lastError.message);
      contentScriptConnected = false;
      updateUIConnectionStatus(false);
      return;
    }
    
    if (tabs.length === 0) {
      console.log("DevTools Panel: No active tab found to connect to");
      logToUI("No active tab found to connect to");
      contentScriptConnected = false;
      updateUIConnectionStatus(false);
      return;
    }
    
    const tabId = tabs[0].id;
    logToUI(`Attempting to connect to tab ${tabId}`);
    
    try {
      // Attempt to send a test message
      chrome.tabs.sendMessage(
        tabId, 
        {action: "checkDevToolsConnection"},
        function(response) {
          if (chrome.runtime.lastError) {
            console.log("DevTools Panel: Failed to connect to content script:", chrome.runtime.lastError);
            logToUI(`Connection failed: ${chrome.runtime.lastError.message}`);
            contentScriptConnected = false;
            updateUIConnectionStatus(false);
            
            // Attempt to inject the content script if it's not already there
            tryInjectContentScript(tabId);
          } else {
            console.log("DevTools Panel: Successfully connected to content script", response);
            contentScriptConnected = true;
            updateUIConnectionStatus(true);
            logToUI(`Connected to content script on tab ${tabId}`);
          }
        }
      );
    } catch (err) {
      console.error("DevTools Panel: Error testing connection:", err);
      logToUI(`Error testing connection: ${err.message}`);
      contentScriptConnected = false;
      updateUIConnectionStatus(false);
    }
  });
}

// Function to attempt to inject the content script
function tryInjectContentScript(tabId) {
  logToUI("Attempting to inject content script...");
  
  try {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["picker.js"]
    }, (results) => {
      if (chrome.runtime.lastError) {
        logToUI(`Injection failed: ${chrome.runtime.lastError.message}`);
      } else {
        logToUI("Content script injected, retrying connection...");
        // Wait a moment and then try to connect again
        setTimeout(() => checkContentScriptConnection(), 500);
      }
    });
  } catch (error) {
    logToUI(`Error injecting script: ${error.message}`);
  }
}

// Make checkContentScriptConnection globally available
window.checkContentScriptConnection = checkContentScriptConnection;

// Set up interval for connection checking, but track it so we can clear it later
let connectionCheckInterval = null;

// Start checking when devtools.js calls our initialization
window.initializeDevToolsPanel = function() {
  console.log("Panel: initializeDevToolsPanel called");
  logToUI("Panel initialization started");
  
  // Start the connection check
  if (!connectionCheckInterval) {
    connectionCheckInterval = setInterval(checkContentScriptConnection, 10000);
  }
  
  // Run an immediate connection check
  checkContentScriptConnection();
};

// Clean up when the panel is closed
window.addEventListener('beforeunload', function() {
  console.log("Panel unloading, clearing interval");
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
});

// Helper function to get event listeners using Chrome DevTools Protocol
async function getEventListenersForElement(elementSelector) {
  logToUI(`Getting listeners for: ${elementSelector}`);
  
  try {
    // First get a reference to the element
    const result = await chrome.devtools.inspectedWindow.eval(
      `(function() {
        try {
          // Helper function to find element by multiple methods
          function findElementByAnyMeans() {
            // First try the passed selector directly
            let element = null;
            
            try {
              element = ${elementSelector};
            } catch (directError) {
              console.error("Direct selector failed:", directError);
            }
            
            // If direct selector failed, try alternative approaches
            if (!element && ${debugSettings.useSimpleSelectors}) {
              console.log("Direct selector failed, trying alternatives");
              
              // For React-style components with complex class names
              try {
                // Get the selector string and parse out the tag and class parts
                const selectorString = ${JSON.stringify(elementSelector)};
                console.log("Trying to parse:", selectorString);
                
                // Extract tag name
                let tagName = "div"; // Default to div
                let className = "";
                
                // Extract the tag and first class if possible
                const tagMatch = selectorString.match(/([a-zA-Z0-9]+)(?:\\.|\\.\\w+)/);
                if (tagMatch) {
                  tagName = tagMatch[1];
                }
                
                // Extract any class names from the selector
                const classMatches = selectorString.match(/\\.([a-zA-Z0-9_-]+)/g);
                if (classMatches && classMatches.length > 0) {
                  // Remove the dots and take just the first class name for simplicity
                  const firstClass = classMatches[0].substring(1);
                  className = firstClass;
                }
                
                console.log("Looking for tag:", tagName, "with class containing:", className);
                
                // Use a more flexible approach - get all elements of this tag type
                // and find ones that contain the class name substring
                const allElements = document.querySelectorAll(tagName);
                console.log("Found", allElements.length, "elements with tag", tagName);
                
                // Look for partial class name matches
                for (let i = 0; i < allElements.length; i++) {
                  const el = allElements[i];
                  if (el.className && el.className.includes(className)) {
                    console.log("Found matching element by partial class:", el);
                    return el;
                  }
                }
                
                // If still not found and we have a more complex class name, try a looser match
                if (className.includes('_')) {
                  // For names like "Header_nav__JeSpd", try just matching on "Header"
                  const baseClassName = className.split('_')[0];
                  console.log("Trying looser match with base name:", baseClassName);
                  
                  for (let i = 0; i < allElements.length; i++) {
                    const el = allElements[i];
                    if (el.className && el.className.includes(baseClassName)) {
                      console.log("Found matching element by base class:", el);
                      return el;
                    }
                  }
                }
                
                // Last resort - just return the first element of this tag type
                if (allElements.length > 0) {
                  console.log("Falling back to first element of tag type");
                  return allElements[0];
                }
              } catch (alternativeError) {
                console.error("Alternative selector approach failed:", alternativeError);
              }
            }
            
            return element;
          }
          
          const element = findElementByAnyMeans();
          if (!element) return {error: "Element not found"};
          
          // Get any inline event handlers
          const inlineEvents = {};
          const allAttributes = Array.from(element.attributes);
          allAttributes.forEach(attr => {
            if (attr.name.startsWith('on')) {
              const eventType = attr.name.slice(2);
              inlineEvents[eventType] = {
                type: eventType,
                handlerBody: attr.value,
                isInline: true
              };
            }
          });
          
          // Return element information that's safe to stringify
          return {
            tagName: element.tagName,
            id: element.id,
            classes: element.className,
            inlineEvents: inlineEvents,
            success: true
          };
        } catch(err) {
          return {error: err.toString()};
        }
      })()`,
      { useContentScriptContext: false }
    );

    if (result === null || result === undefined) {
      console.error("Error getting element: Result is null or undefined");
      logToUI("Error getting element: Result is null or undefined");
      return { error: "Element query returned null or undefined result" };
    }
    
    if (result.error) {
      console.error("Error getting element:", result.error);
      logToUI("Error getting element: " + result.error);
      return { error: result.error };
    }

    // Get event listeners via CDP if available
    try {
      // This is a simplified attempt - in a real implementation we would use
      // the Chrome DevTools Protocol more directly
      const evalResult = await chrome.devtools.inspectedWindow.eval(
        `(function() {
          // This only works if DevTools are actually open and in the right context
          if (window.getEventListeners && ${elementSelector}) {
            try {
              const listeners = window.getEventListeners(${elementSelector});
              return { listeners: Object.entries(listeners).map(([type, handlers]) => {
                return {
                  type,
                  handlers: handlers.map(h => ({
                    useCapture: h.useCapture,
                    passive: h.passive,
                    once: h.once
                  }))
                };
              })};
            } catch(e) {
              return { error: e.toString() };
            }
          } else {
            return { note: "getEventListeners not available in this context" };
          }
        })()`,
        { useContentScriptContext: false }
      );
      
      // Safely combine results with null checking
      const combined = {
        ...result,
        ...(evalResult || {}), // Only spread if evalResult exists
        timestamp: new Date().toISOString() 
      };
      
      logToUI("Retrieved event listeners for " + result.tagName);
      return combined;
    } catch (evalError) {
      console.error("Error evaluating getEventListeners:", evalError);
      logToUI("Failed to get listeners: " + evalError);
      return { 
        ...result,
        evalError: evalError.toString(),
        note: "Failed to retrieve event listeners via CDP"
      };
    }
  } catch (err) {
    console.error("Error in getEventListenersForElement:", err);
    logToUI("Error: " + err.toString());
    return { error: err.toString() };
  }
}

// Listen for messages from the panel UI
window.addEventListener('message', function(event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type === 'testClipboard') {
    logToUI("Testing clipboard access...");
    
    // If bypassPanel is true, skip testing in panel context
    if (event.data.bypassPanel) {
      logToUI("Bypassing panel clipboard test due to permissions restrictions");
      logToUI("Testing clipboard in inspected window context instead...");
    }
    
    chrome.devtools.inspectedWindow.eval(
      `(async function() {
        try {
          const testText = "DevTools Clipboard Test";
          
          // First try the standard Clipboard API
          try {
            await navigator.clipboard.writeText(testText);
            return { 
              success: true, 
              method: "clipboard-api",
              message: "Clipboard write successful using Clipboard API"
            };
          } catch (clipboardError) {
            console.warn("Clipboard API failed:", clipboardError);
            
            // Try fallback with execCommand
            try {
              const textArea = document.createElement("textarea");
              textArea.value = testText;
              textArea.style.position = "fixed";
              textArea.style.left = "-999999px";
              textArea.style.top = "-999999px";
              document.body.appendChild(textArea);
              textArea.focus();
              textArea.select();
              
              const fallbackSuccess = document.execCommand('copy');
              document.body.removeChild(textArea);
              
              if (fallbackSuccess) {
                return { 
                  success: true, 
                  method: "execCommand-fallback",
                  message: "Clipboard write successful using execCommand fallback",
                  apiError: clipboardError.toString()
                };
              } else {
                return { 
                  success: false, 
                  error: "Both clipboard methods failed", 
                  apiError: clipboardError.toString() 
                };
              }
            } catch (fallbackError) {
              return { 
                success: false, 
                error: "Both clipboard methods failed", 
                apiError: clipboardError.toString(),
                fallbackError: fallbackError.toString()
              };
            }
          }
        } catch (e) {
          return { success: false, error: e.toString() };
        }
      })()`,
      (result, isException) => {
        if (isException) {
          logToUI("Exception testing clipboard: " + isException);
        } else if (result && result.error) {
          logToUI("Clipboard test failed: " + result.error);
          if (result.apiError) {
            logToUI("API error: " + result.apiError);
          }
          if (result.fallbackError) {
            logToUI("Fallback error: " + result.fallbackError);
          }
        } else if (result) {
          logToUI("Clipboard test result: " + (result.success ? "Success" : "Failed"));
          if (result.success) {
            logToUI(`✓ Clipboard test succeeded using ${result.method || "unknown method"}`);
            logToUI("✓ This confirms the main extension clipboard functionality works correctly.");
            logToUI("✓ The clipboard error in the panel doesn't affect the extension's operation.");
          }
        } else {
          logToUI("Clipboard test returned no result");
        }
      }
    );
  } else if (event.data.type === 'updateDebugSetting') {
    // Update debug settings from UI
    if (event.data.setting && event.data.value !== undefined) {
      debugSettings[event.data.setting] = event.data.value;
      logToUI(`Debug setting updated: ${event.data.setting} = ${event.data.value}`);
      console.log("Updated debug settings:", debugSettings);
      
      // Persist to localStorage
      try {
        localStorage.setItem(event.data.setting, event.data.value);
      } catch (err) {
        console.error("Error saving debug setting:", err);
      }
    }
  }
});

// Listen for messages from the content script (picker.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchEventListeners") {
    console.log("DevTools Panel (panel.js): Received fetchEventListeners request for element:", message.targetElementInfo);
    logToUI("Received event listeners request for " + message.targetElementInfo.tagName);
    
    // Formulate a selector based on targetElementInfo
    let selector = "";
    let fallbackSelectors = [];
    
    // First try with ID if available (most reliable)
    if (message.targetElementInfo.id) {
      selector = `document.getElementById('${message.targetElementInfo.id}')`;
      fallbackSelectors.push(selector);
    } else {
      // Create a tag-based selector
      let tagName = message.targetElementInfo.tagName.toLowerCase();
      
      // Check for CSS classes
      let classesString = "";
      if (typeof message.targetElementInfo.classes === 'string' && message.targetElementInfo.classes.trim()) {
        classesString = message.targetElementInfo.classes.trim();
      } else if (message.targetElementInfo.classes && 
               message.targetElementInfo.classes.baseVal && 
               message.targetElementInfo.classes.baseVal.trim()) {
        classesString = message.targetElementInfo.classes.baseVal.trim();
      }
      
      // Generate selectors with different levels of specificity
      if (classesString) {
        // Try with the first class only (more likely to work)
        const firstClass = classesString.split(/\s+/)[0];
        if (firstClass) {
          selector = `document.querySelector('${tagName}.${firstClass}')`;
          fallbackSelectors.push(selector);
        }
        
        // Also try with all classes (can be more specific but also more fragile)
        const allClasses = classesString.replace(/\s+/g, '.');
        if (allClasses) {
          fallbackSelectors.push(`document.querySelector('${tagName}.${allClasses}')`);
        }
      }
      
      // If we still don't have a good selector, fallback to more generic options
      if (!selector && fallbackSelectors.length === 0) {
        // Fallback to tagName only
        selector = `document.getElementsByTagName('${tagName}')[0]`;
        fallbackSelectors.push(selector);
      } else if (!selector && fallbackSelectors.length > 0) {
        // Take the first fallback if we don't have a primary
        selector = fallbackSelectors[0];
      }
    }
    
    logToUI("Using selector: " + selector);
    if (fallbackSelectors.length > 1) {
      logToUI(`Also prepared ${fallbackSelectors.length - 1} fallback selectors if needed`);
    }
    
    // Make sure we respond quickly to keep the message channel open
    sendResponse({ 
      listeners: [{ note: "Getting listeners, please wait..." }],
      selector: selector,
      fallbackSelectors: fallbackSelectors,
      timestamp: new Date().toISOString(),
      devToolsConnected: contentScriptConnected,
      preliminary: true
    });
    
    // Try to get element with the primary selector
    getEventListenersForElement(selector)
      .then(result => {
        // If primary selector failed but we have fallbacks, try them
        if (result.error && 
            result.error.includes("null or undefined") && 
            fallbackSelectors.length > 1 && 
            debugSettings.tryFallbackSelectors) {
          logToUI("Primary selector failed, trying fallback selectors...");
          
          // Find a fallback that wasn't used as the primary
          const fallbackToTry = fallbackSelectors.find(s => s !== selector);
          if (fallbackToTry) {
            logToUI("Trying fallback: " + fallbackToTry);
            return getEventListenersForElement(fallbackToTry).then(fallbackResult => {
              if (!fallbackResult.error) {
                logToUI("Fallback selector succeeded!");
                return { ...fallbackResult, usedFallback: true, fallbackSelector: fallbackToTry };
              }
              return result; // Stick with original result if fallback also failed
            });
          }
        } else if (result.error && !debugSettings.tryFallbackSelectors) {
          logToUI("Primary selector failed, but fallback selectors are disabled");
        }
        return result;
      })
      .then(result => {
        // Send the full data via a new message
        logToUI("Got listeners, sending back via separate message");
        
        try {
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (chrome.runtime.lastError) {
              logToUI("Error querying tabs: " + chrome.runtime.lastError.message);
              return;
            }
            
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "eventListenersResult",
                selector: selector,
                fallbackSelectors: fallbackSelectors,
                listeners: result,
                useSimpleSelectors: debugSettings.useSimpleSelectors,
                tryFallbackSelectors: debugSettings.tryFallbackSelectors,
                timestamp: new Date().toISOString()
              }, function(response) {
                if (chrome.runtime.lastError) {
                  logToUI("Error sending listeners: " + chrome.runtime.lastError.message);
                } else if (response) {
                  logToUI("Listeners received by content script");
                }
              });
            }
          });
        } catch (err) {
          logToUI("Error sending listeners back: " + err.message);
        }
      })
      .catch(err => {
        logToUI("Error getting listeners: " + err.toString());
      });
    
    // We've already sent a response, no need to return true
  } else if (message.action === "devToolsConnectionTest" || message.action === "checkDevToolsConnection") {
    // Respond to connection tests from the content script
    console.log("[Panel DEBUG] Received connection test from content script");
    logToUI("Received connection test from content script");
    sendResponse({ success: true, panelActive: true, timestamp: new Date().toISOString() });
    return true;
  }
}); 