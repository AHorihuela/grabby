# Grabby (Scraper-Eraser Extension)

This Chrome extension allows you to visually select any element on a webpage, copy its HTML, CSS, and JavaScript to the clipboard, and analyze its structure and behavior.

## Features

- **Visual Element Selection**: Click on any element on a webpage with a crosshair cursor
- **Complete HTML Capture**: Get the full HTML structure of the selected element
- **Comprehensive CSS Extraction**: Capture all computed styles in a CSS-compatible format
- **JavaScript Analysis**:
  - Capture relevant script sources affecting the element
  - Identify inline event handlers (onclick, onmouseover, etc.)
  - Find DOM manipulation code that might interact with the element
  - List all scripts on the page (both inline and external)
- **Event Listener Detection**: Attempt to capture event listeners bound to the element (requires DevTools panel connection)
- **Clipboard Integration**: All captured data is automatically copied to your clipboard in a neatly formatted, CSS-compatible structure
- **React Component Support**: Special handling for React components with dynamically generated class names

## Installation

### Developer Mode (Latest Version)

1. Download the `grabby.zip` file from the releases section
2. Extract the contents to a folder
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top-right corner
5. Click "Load unpacked" and select the extracted folder

## How to Use

1. Click the Grabby icon in your Chrome toolbar to activate selection mode
2. Your cursor will change to a crosshair
3. Hover over elements to see them highlighted with a red dashed outline
4. Click on the element you want to analyze
5. The element's data is automatically copied to your clipboard
6. Paste the data into any text editor or CSS file

### DevTools Panel Integration

For enhanced functionality (including event listener capture):

1. Open Chrome DevTools (F12 or right-click → Inspect)
2. Click on the "Scraper-Eraser" tab in the DevTools panel
3. Ensure it shows "Connected to content script"
4. Use the extension normally - now with event listener detection!

## Output Format

The copied data includes these well-organized sections:

```css
/* --- Scraper-Eraser Element Data --- */
/* Element information and metadata */

/* --- index.html --- */
/* HTML structure of the element */

/* --- styles.css --- */
/* All computed styles in valid CSS format */

/* --- listeners.json --- */
/* Event listeners attached to the element (if available) */

/* --- javascript-data.json --- */
/* Relevant JavaScript affecting this element */

/* --- all-scripts.json --- */
/* Complete list of scripts on the page */

/* --- Additional Info --- */
/* Notes about the captured data */
```

## Build from Source

```bash
# Clone the repository
git clone https://github.com/your-username/grabby.git

# Navigate to the project directory
cd grabby

# Package the extension
zip -r grabby.zip src
```

## Limitations

- Event listener detection requires DevTools panel to be open and connected
- Some elements may not be accessible for event listener detection due to browser security constraints
- Cross-origin stylesheets are limited by CORS restrictions
- Shadow DOM elements have limited support

## License

MIT 