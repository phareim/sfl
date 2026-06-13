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
    let idea;
    if (info.menuItemId === 'sfl-save-selection') {
      idea = await handleSaveSelection(info, tab);
    } else if (info.menuItemId === 'sfl-save-page') {
      idea = await handleSavePage(info, tab);
    } else if (info.menuItemId === 'sfl-save-image') {
      idea = await handleSaveImage(info, tab);
    }
    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 2000);

    // Offer suggested tags in an in-page toast (best-effort, non-blocking).
    if (idea?.id) suggestTagsToast(tab.id, idea.id).catch(() => {});
  } catch (err) {
    console.error('[SFL]', err);
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 3000);
  }
});

/**
 * Ask the API for two tag suggestions and render them as an in-page toast
 * the user can one-click to apply. Injected via scripting so it works even
 * on tabs opened before the extension loaded.
 */
async function suggestTagsToast(tabId, ideaId) {
  let suggestions = [];
  try {
    const resp = await apiPost(`/api/ideas/${ideaId}/suggest-tags`, { count: 2 });
    suggestions = resp?.suggestions ?? [];
  } catch {
    return; // no suggestions, no toast
  }
  if (suggestions.length === 0) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderTagToast,
      args: [ideaId, suggestions],
    });
  } catch {
    // Page disallows injection (chrome://, store pages); skip silently.
  }
}

/**
 * Runs in the page. Renders a shadow-DOM toast with clickable tag chips;
 * each click messages the service worker to apply the tag.
 */
function renderTagToast(ideaId, suggestions) {
  document.getElementById('sfl-tag-toast')?.remove();

  const host = document.createElement('div');
  host.id = 'sfl-tag-toast';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .box {
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        background: #fff; color: #1a1a1a; border: 1px solid #e0e0e0;
        border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.18);
        padding: 12px 14px; width: 260px;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: slide 0.18s ease-out;
      }
      @keyframes slide { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .title { font-weight: 600; }
      .x { cursor: pointer; color: #aaa; font-size: 15px; line-height: 1; }
      .x:hover { color: #555; }
      .hint { color: #888; font-size: 11px; margin-bottom: 8px; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip {
        cursor: pointer; border: 1px solid #1a73e8; color: #1a73e8; background: #fff;
        border-radius: 999px; padding: 3px 11px; font-size: 12px; transition: all 0.12s;
      }
      .chip.new { border-style: dashed; }
      .chip:hover { background: #1a73e8; color: #fff; }
      .chip.applied { background: #2e7d32; border-color: #2e7d32; color: #fff; cursor: default; }
    </style>
    <div class="box">
      <div class="head">
        <span class="title">✓ Saved to SFL</span>
        <span class="x">✕</span>
      </div>
      <div class="hint">Add a tag:</div>
      <div class="chips"></div>
    </div>
  `;

  const chips = root.querySelector('.chips');
  for (const s of suggestions) {
    const chip = document.createElement('button');
    chip.className = 'chip' + (s.existing ? '' : ' new');
    chip.textContent = '#' + s.title;
    chip.addEventListener('click', () => {
      if (chip.classList.contains('applied')) return;
      chip.classList.add('applied');
      chip.textContent = '✓ #' + s.title;
      chrome.runtime.sendMessage({ type: 'APPLY_TAG', ideaId, tag: s });
    });
    chips.appendChild(chip);
  }

  const dismiss = () => host.remove();
  root.querySelector('.x').addEventListener('click', dismiss);
  const timer = setTimeout(dismiss, 9000);
  host.addEventListener('mouseenter', () => clearTimeout(timer));

  document.documentElement.appendChild(host);
}

async function handleSaveSelection(info, tab) {
  const selectedText = info.selectionText ?? '';
  // No top-level url: it would trigger URL dedup and silently discard
  // every quote after the first from the same page. Source lives in data.
  const { idea } = await apiPost('/api/ideas', {
    type: 'quote',
    title: selectedText.slice(0, 80),
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

/**
 * Extract page metadata (description, og:* tags, author, canonical) by
 * injecting into the page. Returns {} when extraction is impossible
 * (e.g. chrome:// pages).
 */
async function extractPageMeta(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel) => document.querySelector(sel)?.content?.trim() || null;
        const out = {
          description: meta('meta[property="og:description"]') ?? meta('meta[name="description"]'),
          image: meta('meta[property="og:image"]'),
          site_name: meta('meta[property="og:site_name"]'),
          author: meta('meta[name="author"]') ?? meta('meta[property="article:author"]'),
          published_at: meta('meta[property="article:published_time"]') ?? meta('meta[name="date"]'),
          canonical_url: document.querySelector('link[rel="canonical"]')?.href || null,
          lang: document.documentElement.lang || null,
        };
        for (const k of Object.keys(out)) if (!out[k]) delete out[k];
        return out;
      },
    });
    return result ?? {};
  } catch {
    return {};
  }
}

async function handleSavePage(info, tab) {
  const video = detectVideo(tab.url);
  const meta = await extractPageMeta(tab.id);

  if (video.isVideo) {
    const title = tab.title.replace(/\s*[-–|]\s*(YouTube|TikTok)\s*$/, '').trim() || tab.title;
    const { idea } = await apiPost('/api/ideas', {
      type: 'video',
      title,
      url: tab.url,
      summary: meta.description?.slice(0, 200) ?? title,
      data: {
        url: tab.url,
        platform: video.platform,
        video_id: video.video_id,
        page_title: tab.title,
        description: meta.description ?? null,
        thumbnail: meta.image ?? null,
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
    summary: meta.description?.slice(0, 200) ?? tab.title,
    data: {
      url: tab.url,
      title: tab.title,
      ...meta,
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

/**
 * Find a tag by title (case-insensitive) or create it.
 * Returns the tag idea row.
 */
async function ensureTag(title) {
  const wanted = title.trim();
  const data = await apiGet('/api/tags');
  const existing = (data?.tags ?? []).find((t) => t.title?.toLowerCase() === wanted.toLowerCase());
  if (existing) return existing;
  const { idea } = await apiPost('/api/ideas', { type: 'tag', title: wanted });
  return idea;
}

/**
 * Apply a tag suggestion to an idea: resolve/create the tag, then connect it.
 * Treats an existing connection as success.
 */
async function applyTagToIdea(ideaId, tag) {
  const tagId = tag.id ?? (await ensureTag(tag.title)).id;
  try {
    await apiPost('/api/connections', { from_id: ideaId, to_id: tagId, label: 'tagged_with' });
  } catch (err) {
    if (!/already exists/i.test(err.message)) throw err;
  }
}

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_IDEA') {
    apiPost('/api/ideas', message.payload)
      .then((resp) => sendResponse({ ok: true, idea: resp.idea, existing: !!resp.existing }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_TAGS') {
    apiGet('/api/tags')
      .then((data) => sendResponse({ ok: true, tags: data?.tags ?? [] }))
      .catch(() => sendResponse({ ok: true, tags: [] }));
    return true;
  }

  if (message.type === 'GET_PAGE_META') {
    extractPageMeta(message.tabId)
      .then((meta) => sendResponse({ ok: true, meta }))
      .catch(() => sendResponse({ ok: true, meta: {} }));
    return true;
  }

  if (message.type === 'ENSURE_TAG') {
    ensureTag(message.title)
      .then((tag) => sendResponse({ ok: true, tag }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'APPLY_TAG') {
    applyTagToIdea(message.ideaId, message.tag)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_META_PROJECTS') {
    apiGet('/api/ideas?type=meta&limit=100')
      .then((data) => {
        const urls = (data?.ideas ?? []).map((i) => i.url).filter(Boolean);
        const unique = [...new Set(urls)];
        sendResponse({ ok: true, projects: unique });
      })
      .catch(() => sendResponse({ ok: true, projects: [] }));
    return true;
  }

  if (message.type === 'CREATE_CONNECTION') {
    apiPost('/api/connections', message.payload)
      .then(({ connection }) => sendResponse({ ok: true, connection }))
      .catch((err) => {
        // Re-tagging an already-saved idea is a no-op, not a failure.
        if (/already exists/i.test(err.message)) {
          sendResponse({ ok: true, connection: null });
        } else {
          sendResponse({ ok: false, error: err.message });
        }
      });
    return true;
  }
});
