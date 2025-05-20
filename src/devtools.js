// DevTools script (devtools.js)
console.log("Scraper-Eraser DevTools script loaded.");

// Create a variable to keep track of the panel instance
let scraperEraserPanel = null;

// Setup error handling
window.addEventListener('error', function(event) {
  console.error("DevTools Error caught:", event.error);
  
  // Don't do much here as we can't really recover from DevTools script errors
  // Just prevent the default error handling to keep the console cleaner
  if (event.error && event.error.message && 
      event.error.message.includes("Extension context invalidated")) {
    console.warn("DevTools detected extension context invalidated");
    event.preventDefault();
  }
});

// Function to safely access panel window
function safeAccessPanelWindow(panelWindow, callback) {
  try {
    // First check if we can access the window at all
    if (!panelWindow || typeof panelWindow !== 'object') {
      console.warn("Panel window is not accessible");
      return false;
    }
    
    // Try to access a property to check for invalidation
    const test = panelWindow.document;
    
    // If no error was thrown, we should be able to execute the callback
    return callback(panelWindow);
  } catch (err) {
    console.error("Error accessing panel window:", err);
    return false;
  }
}

// Function to initialize panel functionality
function initializePanel(panel) {
  console.log("Scraper-Eraser panel created and being initialized", panel);
  scraperEraserPanel = panel;
  
  // Listen for panel showing/hiding events to manage resources
  panel.onShown.addListener(function(panelWindow) {
    console.log("Scraper-Eraser panel shown");
    
    // Give the panel window a moment to fully load before trying to initialize
    setTimeout(() => {
      safeAccessPanelWindow(panelWindow, (window) => {
        // If the panel window has our initialize function, call it
        if (window.initializeDevToolsPanel) {
          console.log("Calling panel's initializeDevToolsPanel function");
          try {
            window.initializeDevToolsPanel();
            return true;
          } catch (err) {
            console.error("Error calling initializeDevToolsPanel:", err);
            return false;
          }
        } else {
          console.warn("Panel window loaded but initialize function not found");
          
          // Try to add a message to the panel if possible
          try {
            const logContainer = window.document.getElementById('logContainer');
            if (logContainer) {
              const entry = window.document.createElement('div');
              entry.className = 'log-entry';
              entry.innerHTML = '<span style="color:red;">DevTools initialization function not found</span>';
              logContainer.appendChild(entry);
            }
          } catch (innerErr) {
            console.error("Error accessing panel DOM:", innerErr);
          }
          return false;
        }
      });
    }, 500); // Give the panel half a second to load completely
  });

  panel.onHidden.addListener(function() {
    console.log("Scraper-Eraser panel hidden");
    // We could potentially pause some operations when the panel is hidden
  });
}

// Create the DevTools panel
try {
  chrome.devtools.panels.create(
    "Scraper-Eraser", // Title of the panel
    null, // Icon path (optional)
    "panel.html", // HTML page for the panel
    initializePanel
  );
  console.log("DevTools panel creation requested");
} catch (err) {
  console.error("Error creating DevTools panel:", err);
} 