/**
 * SFL Chrome Extension — Service Worker (Manifest V3)
 * Handles context menus and API calls.
 */

import { detectSocialPost, detectVideo } from './social.js';

async function getConfig() {
  return new Promise((resolve) =>
    chrome.storage.sync.get(['sfl_api_url', 'sfl_api_key'], (items) => resolve(items))
  );
}

async function apiPost(path, body) {
  const { sfl_api_url, sfl_api_key } = await getConfig();
  if (!sfl_api_url || !sfl_api_key) {
    throw new Error('SFL not configured. Open the extension options page.');
  }
  const url = `${sfl_api_url.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sfl_api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiGet(path) {
  const { sfl_api_url, sfl_api_key } = await getConfig();
  if (!sfl_api_url || !sfl_api_key) return null;
  const url = `${sfl_api_url.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${sfl_api_key}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Register context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sfl-save-selection',
    title: 'Save selection to SFL',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'sfl-save-page',
    title: 'Save page to SFL',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'sfl-save-image',
    title: 'Save image to SFL',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'sfl-save-selection') {
      await handleSaveSelection(info, tab);
    } else if (info.menuItemId === 'sfl-save-page') {
      await handleSavePage(info, tab);
    } else if (info.menuItemId === 'sfl-save-image') {
      await handleSaveImage(info, tab);
    }
    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);
  } catch (err) {
    console.error('[SFL]', err);
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 3000);
  }
});

async function handleSaveSelection(info, tab) {
  const selectedText = info.selectionText ?? '';
  const { idea } = await apiPost('/api/ideas', {
    type: 'quote',
    title: selectedText.slice(0, 80),
    url: tab.url,
    summary: selectedText.slice(0, 200),
    data: {
      text: selectedText,
      source_url: tab.url,
      page_title: tab.title,
    },
  });
  return idea;
}

/**
 * Extract post text from a social page.
 * First tries the content script (already running); falls back to
 * chrome.scripting.executeScript which works even on pages that were
 * open before the extension was installed or last reloaded.
 */
async function extractPostText(tabId, tabUrl) {
  // Attempt 1: message the content script
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_POST' });
    if (resp?.text) return resp.text;
  } catch { /* content script not ready */ }

  // Attempt 2: inject extraction logic directly into the page
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (host) => {
        if (host === 'x.com' || host === 'twitter.com') {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          for (const a of articles) {
            const t = a.querySelector('[data-testid="tweetText"]');
            if (t) return t.innerText.trim();
          }
        }
        if (host.includes('threads')) {
          const h1 = document.querySelector('h1');
          if (h1?.innerText?.trim()) return h1.innerText.trim();
          for (const el of document.querySelectorAll('[dir="auto"]')) {
            const t = el.innerText?.trim();
            if (t && t.length > 20) return t;
          }
        }
        if (host === 'bsky.app') {
          const el = document.querySelector('[data-testid="postText"]');
          if (el) return el.innerText.trim();
          for (const el of document.querySelectorAll('[dir="auto"]')) {
            const t = el.innerText?.trim();
            if (t && t.length > 20) return t;
          }
        }
        return '';
      },
      args: [new URL(tabUrl).hostname],
    });
    return result ?? '';
  } catch { /* scripting API unavailable (e.g. chrome:// page) */ }

  return '';
}

async function handleSavePage(info, tab) {
  const video = detectVideo(tab.url);

  if (video.isVideo) {
    const title = tab.title.replace(/\s*[-–|]\s*YouTube\s*$/, '').trim() || tab.title;
    const { idea } = await apiPost('/api/ideas', {
      type: 'video',
      title,
      url: tab.url,
      summary: title,
      data: {
        url: tab.url,
        platform: video.platform,
        video_id: video.video_id,
        page_title: tab.title,
      },
    });
    return idea;
  }

  const social = detectSocialPost(tab.url);

  if (social.isSocialPost) {
    const postText = await extractPostText(tab.id, tab.url);

    const { idea } = await apiPost('/api/ideas', {
      type: 'tweet',
      title: postText ? postText.slice(0, 80) : tab.title,
      url: tab.url,
      summary: postText.slice(0, 200) || tab.title,
      data: {
        url: tab.url,
        text: postText,
        author: social.author,
        platform: social.platform,
        post_id: social.postId,
        page_title: tab.title,
      },
    });
    return idea;
  }

  const { idea } = await apiPost('/api/ideas', {
    type: 'page',
    title: tab.title,
    url: tab.url,
    summary: tab.title,
    data: {
      url: tab.url,
      title: tab.title,
    },
  });
  return idea;
}

async function handleSaveImage(info, tab) {
  const imgUrl = info.srcUrl;
  if (!imgUrl) return;

  // Create the idea first
  const { idea } = await apiPost('/api/ideas', {
    type: 'image',
    title: `Image from ${tab.title}`,
    url: imgUrl,
    summary: tab.title,
    data: {
      source_url: imgUrl,
      page_url: tab.url,
      caption: tab.title,
    },
  });

  // Try to upload the image binary to R2
  try {
    const { sfl_api_url, sfl_api_key } = await getConfig();
    const imgRes = await fetch(imgUrl);
    if (imgRes.ok) {
      const blob = await imgRes.blob();
      const filename = imgUrl.split('/').pop().split('?')[0] || 'image.jpg';
      const form = new FormData();
      form.append('file', blob, filename);
      await fetch(`${sfl_api_url.replace(/\/$/, '')}/api/ideas/${idea.id}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sfl_api_key}` },
        body: form,
      });
    }
  } catch (uploadErr) {
    // Non-fatal: the idea is already saved, just without the binary
    console.warn('[SFL] Image upload failed:', uploadErr);
  }

  return idea;
}

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_IDEA') {
    apiPost('/api/ideas', message.payload)
      .then(({ idea }) => sendResponse({ ok: true, idea }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_TAGS') {
    apiGet('/api/tags')
      .then((data) => sendResponse({ ok: true, tags: data?.tags ?? [] }))
      .catch(() => sendResponse({ ok: true, tags: [] }));
    return true;
  }

  if (message.type === 'CREATE_CONNECTION') {
    apiPost('/api/connections', message.payload)
      .then(({ connection }) => sendResponse({ ok: true, connection }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
