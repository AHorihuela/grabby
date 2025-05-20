// Panel UI functionality
console.log("Panel UI script loading");

// Simple logging system
function addLogEntry(message) {
  const container = document.getElementById('logContainer');
  if (!container) {
    console.error("Log container not found");
    return;
  }
  
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  const now = new Date();
  timeSpan.textContent = `[${now.toLocaleTimeString()}]`;
  
  entry.appendChild(timeSpan);
  entry.appendChild(document.createTextNode(' ' + message));
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// Update connection status UI
function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connectionStatus');
  if (!statusEl) {
    console.error("Status element not found");
    return;
  }
  
  if (connected) {
    statusEl.className = 'status connected';
    statusEl.textContent = 'Connected to content script';
  } else {
    statusEl.className = 'status disconnected';
    statusEl.textContent = 'Not connected to content script';
  }
}

// Initialize function called by devtools.js
window.initializeDevToolsPanel = function() {
  addLogEntry('DevTools panel initialization called from devtools.js');
  // Trigger a connection check
  if (window.checkContentScriptConnection) {
    window.checkContentScriptConnection();
    addLogEntry('Connection check initiated');
  } else {
    addLogEntry('checkContentScriptConnection function not available');
  }
};

// Setup button handlers
function setupEventListeners() {
  // Test clipboard access
  const testClipboardBtn = document.getElementById('testClipboardBtn');
  if (testClipboardBtn) {
    testClipboardBtn.addEventListener('click', async () => {
      try {
        addLogEntry('Testing clipboard access in panel context...');
        const text = "Grabby clipboard test";
        await navigator.clipboard.writeText(text);
        addLogEntry('Successfully wrote to clipboard: "' + text + '"');
        
        // Also notify the panel.js script to test clipboard in the inspected window context
        window.postMessage({ type: 'testClipboard' }, '*');
      } catch (err) {
        addLogEntry('Clipboard error in panel context: ' + err.message);
        
        // Handle permissions policy error specifically
        if (err.message && err.message.includes('permissions policy')) {
          addLogEntry('Note: Clipboard access is restricted in DevTools panels due to Chrome security restrictions.');
          addLogEntry('This is normal and does not affect the main extension functionality.');
          addLogEntry('The clipboard operations run in a different context when using the extension normally.');
          
          // Try the fallback method for clipboard
          try {
            const textArea = document.createElement("textarea");
            textArea.value = "Grabby clipboard test (fallback)";
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (success) {
              addLogEntry('Fallback clipboard method succeeded in panel context');
            } else {
              addLogEntry('Fallback clipboard method also failed in panel context');
            }
          } catch (fallbackErr) {
            addLogEntry('Fallback clipboard error: ' + fallbackErr.message);
          }
          
          // Try the indirect clipboard test through the inspected window
          window.postMessage({ type: 'testClipboard', bypassPanel: true }, '*');
          addLogEntry('Testing clipboard in inspected window context instead...');
        }
      }
    });
  }

  // Clear logs
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      const container = document.getElementById('logContainer');
      if (container) {
        container.innerHTML = '';
        addLogEntry('Logs cleared');
      }
    });
  }

  // Reconnect button
  const reconnectBtn = document.getElementById('reconnectBtn');
  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', () => {
      addLogEntry('Manual reconnection requested');
      if (window.checkContentScriptConnection) {
        window.checkContentScriptConnection();
      } else {
        addLogEntry('checkContentScriptConnection function not available');
      }
    });
  }
}

// Setup debug checkboxes
function setupDebugOptions() {
  const useSimpleSelectorsCheckbox = document.getElementById('useSimpleSelectors');
  const tryFallbackSelectorsCheckbox = document.getElementById('tryFallbackSelectors');
  
  if (useSimpleSelectorsCheckbox) {
    // Load saved setting or default to checked
    useSimpleSelectorsCheckbox.checked = localStorage.getItem('useSimpleSelectors') !== 'false';
    
    useSimpleSelectorsCheckbox.addEventListener('change', () => {
      localStorage.setItem('useSimpleSelectors', useSimpleSelectorsCheckbox.checked);
      addLogEntry(`Simple selectors for React ${useSimpleSelectorsCheckbox.checked ? 'enabled' : 'disabled'}`);
      
      // Notify panel.js about the setting change
      window.postMessage({
        type: 'updateDebugSetting',
        setting: 'useSimpleSelectors',
        value: useSimpleSelectorsCheckbox.checked
      }, '*');
    });
  }
  
  if (tryFallbackSelectorsCheckbox) {
    // Load saved setting or default to checked
    tryFallbackSelectorsCheckbox.checked = localStorage.getItem('tryFallbackSelectors') !== 'false';
    
    tryFallbackSelectorsCheckbox.addEventListener('change', () => {
      localStorage.setItem('tryFallbackSelectors', tryFallbackSelectorsCheckbox.checked);
      addLogEntry(`Fallback selectors ${tryFallbackSelectorsCheckbox.checked ? 'enabled' : 'disabled'}`);
      
      // Notify panel.js about the setting change
      window.postMessage({
        type: 'updateDebugSetting',
        setting: 'tryFallbackSelectors',
        value: tryFallbackSelectorsCheckbox.checked
      }, '*');
    });
  }
}

// Setup UI when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log("Panel UI: DOM content loaded");
  setupEventListeners();
  setupDebugOptions();
  addLogEntry('Panel UI initialized');
  
  // Notify panel.js that UI is ready
  if (window.panelUiLoaded) {
    window.panelUiLoaded();
  }
});

// Listen for messages from panel.js
window.addEventListener('message', (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;
  
  if (event.data.type === 'connectionStatus') {
    updateConnectionStatus(event.data.connected);
    addLogEntry('Connection status: ' + (event.data.connected ? 'Connected' : 'Disconnected'));
  } else if (event.data.type === 'logEntry') {
    addLogEntry(event.data.message);
  } else if (event.data.type === 'updateDebugSettingsUI') {
    // Update UI based on settings from panel.js
    const useSimpleSelectorsCheckbox = document.getElementById('useSimpleSelectors');
    if (useSimpleSelectorsCheckbox && event.data.useSimpleSelectors !== undefined) {
      useSimpleSelectorsCheckbox.checked = event.data.useSimpleSelectors;
    }
    
    const tryFallbackSelectorsCheckbox = document.getElementById('tryFallbackSelectors');
    if (tryFallbackSelectorsCheckbox && event.data.tryFallbackSelectors !== undefined) {
      tryFallbackSelectorsCheckbox.checked = event.data.tryFallbackSelectors;
    }
  }
});

// Log startup
console.log("Panel UI script loaded");

// Setup error handling
window.addEventListener('error', function(event) {
  console.error("UI Error caught:", event.error);
  
  // Check if this is an extension context invalidated error
  if (event.error && event.error.message && 
      event.error.message.includes("Extension context invalidated")) {
    
    console.warn("UI detected extension context invalidated");
    
    // Try to show an error message in the UI
    try {
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
        
        // Update connection status if possible
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
          statusEl.className = 'status disconnected';
          statusEl.textContent = 'Extension context invalidated - Please reload';
        }
      }
    } catch (err) {
      console.error("Error handling UI context invalidation:", err);
    }
    
    // Prevent the default error handling
    event.preventDefault();
  }
}); 