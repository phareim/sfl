/**
 * Content script — detects text selection and extracts social post content.
 */

let lastSelection = '';

document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (sel && sel.toString().trim()) {
    lastSelection = sel.toString().trim();
  }
});

/**
 * Try to extract the primary post text from the current page.
 * Returns an empty string if nothing useful is found.
 */
function extractPostText() {
  const host = location.hostname;

  // X / Twitter
  if (host === 'x.com' || host === 'twitter.com') {
    // The article closest to the status URL is the original tweet, not a reply
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      const textEl = article.querySelector('[data-testid="tweetText"]');
      if (textEl) return textEl.innerText.trim();
    }
  }

  // Threads
  if (host === 'www.threads.com' || host === 'threads.net' || host === 'www.threads.net') {
    // Threads renders post text in an <h1> for the main post, or a <p> inside the post area
    const h1 = document.querySelector('h1');
    if (h1?.innerText?.trim()) return h1.innerText.trim();
    // Fallback: grab the first meaningful paragraph in the post container
    const spans = document.querySelectorAll('[dir="auto"]');
    for (const el of spans) {
      const text = el.innerText?.trim();
      if (text && text.length > 20) return text;
    }
  }

  // Bluesky
  if (host === 'bsky.app') {
    // Bluesky puts post text in a div with data-testid="postText" (relatively stable)
    const postText = document.querySelector('[data-testid="postText"]');
    if (postText) return postText.innerText.trim();
    // Fallback
    const divs = document.querySelectorAll('[dir="auto"]');
    for (const el of divs) {
      const text = el.innerText?.trim();
      if (text && text.length > 20) return text;
    }
  }

  return '';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    sendResponse({ selection: lastSelection });
  }
  if (message.type === 'EXTRACT_POST') {
    sendResponse({ text: extractPostText() });
  }
});
