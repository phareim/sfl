/**
 * Content script — detects text selection and exposes it to the popup.
 */

let lastSelection = '';

document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    lastSelection = sel.toString().trim();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    sendResponse({ selection: lastSelection });
  }
});
