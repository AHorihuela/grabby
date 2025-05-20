Scraper‑Eraser Extension – Engineering Brief
Date: 19 May 2025

## 1  Objective

Build a browser extension that lets users visually pick any element on a webpage, copies everything required to recreate that element (HTML, matched CSS, inline/computed styles, and JavaScript event listeners) into the clipboard as a clearly‑sectioned text bundle, and optionally removes the element from the live DOM with an undo option.

## 2  Key User Flow

1. **Activate extension** (toolbar click or keyboard shortcut).
2. Page enters **selection mode**

   * Cursor switches to cross‑hair.
   * Hovering outlines elements with a dashed red border.
3. **Click element** → extension:

   * Captures

     * `outerHTML`.
     * All matching author CSS rules + inline/computed styles.
     * Inline `on*` attributes.
     * `addEventListener` hooks (via Chrome DevTools Protocol).
   * Bundles text:

     ```
     /* --- index.html --- */
     …
     /* --- styles.css --- */
     …
     /* --- listeners.json --- */
     …
     ```
   * Writes to clipboard (`navigator.clipboard.writeText`).
   * Removes node from DOM and logs it for **undo**.
   * Shows toast: “Snippet copied”.

## 3  Technical Approach

| Layer             | Tech            | Purpose                                           |
| ----------------- | --------------- | ------------------------------------------------- |
| Manifest          | Chrome MV3      | Base extension format                             |
| Background SW     | `bg.js`         | Toggles selection mode                            |
| Content script    | `picker.js`     | Draw outline, collect HTML/CSS, request listeners |
| DevTools page     | `devtools.html` | Uses CDP `getEventListeners($0)`                  |
| Clipboard bundler | Shared          | Builds tagged text block                          |

**Permissions:** `"activeTab", "scripting", "clipboardWrite"`, host permissions `"<all_urls>"`.

## 4  Implementation Milestones

| # | Task                               | Est.  | Notes                |
| - | ---------------------------------- | ----- | -------------------- |
| 1 | Fork SnappySnippet; upgrade to MV3 | 0.5 d | baseline CSS capture |
| 2 | Hover outline & selection mode     | 0.5 d | visual UX            |
| 3 | DevTools channel for listeners     | 1 d   | CDP integration      |
| 4 | Bundle + clipboard tagging         | 0.5 d | deliver MVP          |
| 5 | Delete & undo stack                | 0.5 d | optional but easy    |
| 6 | Edge‑case QA (shadow DOM, CORS)    | 1 d   |                      |
| 7 | Packaging, README, demo GIF        | 0.5 d |                      |

## 5  Edge Cases & Limits

* Cross‑origin stylesheets blocked by CORS → fall back to computed styles only.
* Delegated JS listeners (e.g., jQuery on `document`) not element‑specific.
* Shadow DOM elements handled via `e.composedPath()[0]` but slot styles still subject to CORS.

## 6  Deliverables

* `/src` extension code (MIT‑licensed).
* README with build & install steps.
* 30‑sec demo GIF showing capture & undo.

## 7  References

* SnappySnippet – github.com/kdzwinel/SnappySnippet
* Chrome DevTools Protocol – `DOMDebugger.getEventListeners`, `Runtime.evaluate`

