/**
 * SFL Popup — quick-save current page with optional tags.
 */

// Inline video detection
function detectVideo(url) {
  let m = url?.match(/[?&]v=([\w-]{11})/);
  if (m && url.includes('youtube.com')) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  m = url?.match(/youtu\.be\/([\w-]{11})/);
  if (m) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  m = url?.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (m) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  return { isVideo: false };
}

// Inline social detection (can't import modules in non-module popup scripts)
const SOCIAL_PATTERNS = [
  { platform: 'twitter',  re: /^https?:\/\/(?:x\.com|twitter\.com)\/@?([\w]+)\/status\/(\d+)/, author: (m) => '@' + m[1] },
  { platform: 'threads',  re: /^https?:\/\/(?:www\.)?threads\.(?:com|net)\/@([\w.]+)\/post\/([\w]+)/, author: (m) => '@' + m[1] },
  { platform: 'bluesky',  re: /^https?:\/\/bsky\.app\/profile\/([\w.@]+)\/post\/([\w]+)/, author: (m) => m[1] },
];

function detectSocialPost(url) {
  for (const { platform, re, author } of SOCIAL_PATTERNS) {
    const m = url?.match(re);
    if (m) return { isSocialPost: true, platform, author: author(m) };
  }
  return { isSocialPost: false };
}

let tags = [];
let selectedTags = new Set();

async function getConfig() {
  return new Promise((res) =>
    chrome.storage.sync.get(['sfl_api_url', 'sfl_api_key'], res)
  );
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

async function init() {
  const { sfl_api_url, sfl_api_key } = await getConfig();

  if (!sfl_api_url || !sfl_api_key) {
    show('not-configured');
    return;
  }

  show('save-form');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab.title ?? '';
  document.getElementById('url').value = tab.url ?? '';

  const video = detectVideo(tab.url);
  const social = detectSocialPost(tab.url);

  if (video.isVideo) {
    document.getElementById('type').value = 'video';
    document.getElementById('title').value =
      tab.title.replace(/\s*[-–|]\s*YouTube\s*$/, '').trim() || tab.title;
  } else if (social.isSocialPost) {
    // Auto-select tweet type
    document.getElementById('type').value = 'tweet';

    // Try to extract post text from the page
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_POST' });
      if (resp?.text) {
        document.getElementById('content').value = resp.text;
        document.getElementById('title').value = resp.text.slice(0, 80);
      }
    } catch { /* content script unavailable */ }

    // Show author hint
    const hint = document.createElement('p');
    hint.className = 'social-hint';
    hint.textContent = `${social.platform} · ${social.author}`;
    document.getElementById('save-form').insertBefore(hint, document.getElementById('save-form').firstChild);

  } else {
    // Try to get selected text — if found, switch to quote
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
      if (response?.selection) {
        document.getElementById('type').value = 'quote';
        document.getElementById('content').value = response.selection;
      }
    } catch { /* ignore */ }
  }

  // Load tags
  const tagsResp = await new Promise((res) =>
    chrome.runtime.sendMessage({ type: 'GET_TAGS' }, res)
  );
  tags = tagsResp?.tags ?? [];
  renderTags();
}

function renderTags() {
  const list = document.getElementById('tag-list');
  list.innerHTML = '';
  for (const tag of tags) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn' + (selectedTags.has(tag.id) ? ' selected' : '');
    btn.textContent = '#' + (tag.title ?? tag.id);
    btn.addEventListener('click', () => {
      if (selectedTags.has(tag.id)) {
        selectedTags.delete(tag.id);
      } else {
        selectedTags.add(tag.id);
      }
      btn.classList.toggle('selected', selectedTags.has(tag.id));
    });
    list.appendChild(btn);
  }
}

document.getElementById('save-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  const errEl = document.getElementById('error');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  errEl.classList.add('hidden');

  const type = document.getElementById('type').value;
  const title = document.getElementById('title').value;
  const url = document.getElementById('url').value;
  const content = document.getElementById('content').value;
  const social = detectSocialPost(url);

  const video = detectVideo(url);
  let data;
  switch (type) {
    case 'page':  data = { url, title }; break;
    case 'video': data = {
      url,
      platform: video.platform ?? 'youtube',
      video_id: video.video_id ?? null,
      page_title: title,
    }; break;
    case 'quote': data = { text: content, source_url: url }; break;
    case 'note':  data = { content }; break;
    case 'tweet': data = {
      url, text: content,
      author: social.author ?? null,
      platform: social.platform ?? null,
    }; break;
    case 'book':  data = { title }; break;
    default:      data = { content };
  }

  const resp = await new Promise((res) =>
    chrome.runtime.sendMessage({
      type: 'SAVE_IDEA',
      payload: {
        type,
        title: title || null,
        url: url || null,
        summary: content.slice(0, 200) || title || null,
        data,
      },
    }, res)
  );

  if (!resp.ok) {
    errEl.textContent = resp.error;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Save to SFL';
    return;
  }

  for (const tagId of selectedTags) {
    await new Promise((res) =>
      chrome.runtime.sendMessage({
        type: 'CREATE_CONNECTION',
        payload: { from_id: resp.idea.id, to_id: tagId, label: 'tagged_with' },
      }, res)
    );
  }

  hide('save-form');
  show('success');
  setTimeout(() => window.close(), 1200);
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('go-options')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init().catch(console.error);
