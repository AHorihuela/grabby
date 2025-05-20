// Background service worker (bg.js)
console.log("Grabby background script loaded.");

const BADGE_ON_TEXT = "ON";
const BADGE_ON_COLOR = "#008800"; // Green
const BADGE_OFF_TEXT = ""; // Clears the badge

// Function to update the action icon's badge
async function updateActionBadge(tabId, isActive) {
  if (!tabId) {
    console.warn("updateActionBadge called without tabId");
    return;
  }
  if (isActive) {
    await chrome.action.setBadgeText({ text: BADGE_ON_TEXT, tabId: tabId });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_ON_COLOR, tabId: tabId });
  } else {
    await chrome.action.setBadgeText({ text: BADGE_OFF_TEXT, tabId: tabId });
  }
}

// Function to send a message to a tab, attempting to inject script if necessary
async function sendMessageToTab(tabId, message) {
  try {
    console.log(`Attempting to send message to tab ${tabId}:`, message);
    const response = await chrome.tabs.sendMessage(tabId, message);
    console.log("Message sent successfully, response:", response);
    if (response && typeof response.isActive !== 'undefined') {
      await updateActionBadge(tabId, response.isActive);
    }
    return response;
  } catch (error) {
    console.warn("Failed to send message to tab, content script might not be injected yet:", error.message);
    if (error.message.includes("Could not establish connection. Receiving end does not exist")) {
      console.log(`Attempting to inject content script into tab ${tabId} and retry sending message.`);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["picker.js"],
        });
        console.log("Content script injected successfully. Retrying message...");
        await new Promise(resolve => setTimeout(resolve, 100));
        const retryResponse = await chrome.tabs.sendMessage(tabId, message);
        console.log("Message sent successfully on retry, response:", retryResponse);
        if (retryResponse && typeof retryResponse.isActive !== 'undefined') {
          await updateActionBadge(tabId, retryResponse.isActive);
        }
        return retryResponse;
      } catch (injectionError) {
        console.error("Failed to inject script or send message on retry:", injectionError);
        throw injectionError;
      }
    } else {
      throw error;
    }
  }
}

// Listen for the extension's toolbar icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.id) {
    try {
      await sendMessageToTab(tab.id, { action: "toggleSelectionMode" });
    } catch (error) {
      console.error("Error processing action click:", error);
      await chrome.action.setBadgeText({ text: "ERR", tabId: tab.id });
      await chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId: tab.id });
    }
  } else {
    console.error("Clicked action but tab or tab.id is missing:", tab);
  }
});

// Listen for messages from content scripts (e.g., picker.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "selectionMade") {
    console.log("Background: selectionMade message received from tab", sender.tab ? sender.tab.id : "unknown");
    if (sender.tab && sender.tab.id) {
      // The newPickerState should be false, as selection mode deactivates after selection.
      updateActionBadge(sender.tab.id, message.newPickerState); 
    }
    // No response needed for this message from background to content script
  } else if (message.action === "openDevToolsPanel") {
    // This could be used to help users open the DevTools panel
    if (sender.tab && sender.tab.id) {
      try {
        // We can't directly open DevTools programmatically, but we can suggest it
        console.log("Background: openDevToolsPanel requested for tab", sender.tab.id);
        sendResponse({ 
          success: false, 
          note: "Cannot open DevTools programmatically. Please open DevTools manually (F12) and select the Grabby panel."
        });
      } catch (error) {
        console.error("Error in openDevToolsPanel:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else {
      sendResponse({ success: false, error: "No tab information available" });
    }
    return true;
  } else if (message.action === "devToolsStatus") {
    // Allow querying if DevTools is connected
    // Note: There's no direct API to check if DevTools is open, but we can try to relay
    // messages through the DevTools panel
    sendResponse({ devToolsApiAvailable: true });
    return true;
  }
  return true; // Keep message channel open for potential async response (good practice)
});

// Optional: Clear badge when a tab is updated or closed if selection is tab-specific
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // If a tab reloads or navigates, its selection mode state is effectively reset
  // We can clear the badge here, or rely on the user re-activating.
  // For now, let's clear it if the URL changes to avoid stale badge.
  if (changeInfo.url) { // Check if URL changed
    await updateActionBadge(tabId, false); // Assume selection mode is off for new URL
  }
});

// Clear badge if tab is closed, and it had a badge
// This is harder to track if the badge was ON without knowing the tab's state.
// For simplicity, we can just ensure no badges linger for closed tabs.
// However, chrome.action.setBadgeText({text: '', tabId: tabId}) on a closed tabId might error.
// This part is less critical for now. 