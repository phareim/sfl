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
  m = url?.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
  if (m) return { isVideo: true, platform: 'tiktok', video_id: m[1] };
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
let metaProjects = [];

async function getConfig() {
  return new Promise((res) =>
    chrome.storage.sync.get(['sfl_api_url', 'sfl_api_key'], res)
  );
}

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// Field visibility per type
const TYPE_FIELDS = {
  page:  { url: true, content: false, author: false, attribution: false, caption: false, meta: false },
  video: { url: true, content: false, author: false, attribution: false, caption: false, meta: false },
  quote: { url: true, content: true, author: false, attribution: true, caption: false, meta: false },
  note:  { url: false, content: true, author: false, attribution: false, caption: false, meta: false },
  book:  { url: false, content: false, author: true, attribution: false, caption: false, meta: false },
  tweet: { url: true, content: true, author: false, attribution: false, caption: false, meta: false },
  image: { url: true, content: false, author: false, attribution: false, caption: true, meta: false },
  meta:  { url: false, content: true, author: false, attribution: false, caption: false, meta: true },
};

function updateFieldVisibility(type) {
  const fields = TYPE_FIELDS[type] ?? TYPE_FIELDS.page;
  const toggle = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  };
  toggle('url-label', fields.url);
  toggle('content-label', fields.content);
  toggle('author-label', fields.author);
  toggle('attribution-label', fields.attribution);
  toggle('caption-label', fields.caption);
  toggle('meta-fields', fields.meta);

  // Update content placeholder
  const contentEl = document.getElementById('content');
  if (type === 'meta') contentEl.placeholder = 'Implementation details...';
  else if (type === 'note') contentEl.placeholder = 'Write your note...';
  else if (type === 'quote') contentEl.placeholder = 'Quote text...';
  else contentEl.placeholder = 'Content or note...';
}

async function loadMetaProjects() {
  const resp = await new Promise((res) =>
    chrome.runtime.sendMessage({ type: 'GET_META_PROJECTS' }, res)
  );
  metaProjects = resp?.projects ?? [];

  const select = document.getElementById('meta-project');
  select.innerHTML = '';

  if (metaProjects.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No projects found';
    select.appendChild(opt);
  } else {
    for (const project of metaProjects) {
      const opt = document.createElement('option');
      opt.value = project;
      // Show short name: owner/repo
      const short = project.replace(/^https?:\/\/github\.com\//, '');
      opt.textContent = short;
      select.appendChild(opt);
    }
  }

  // Allow typing a new project URL
  const opt = document.createElement('option');
  opt.value = '__custom__';
  opt.textContent = '+ Custom URL...';
  select.appendChild(opt);
}

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
      tab.title.replace(/\s*[-–|]\s*(YouTube|TikTok)\s*$/, '').trim() || tab.title;
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

  // Set initial field visibility
  updateFieldVisibility(document.getElementById('type').value);

  // Listen for type changes
  document.getElementById('type').addEventListener('change', (e) => {
    updateFieldVisibility(e.target.value);
    if (e.target.value === 'meta') loadMetaProjects();
  });

  // Handle custom project URL
  document.getElementById('meta-project').addEventListener('change', (e) => {
    if (e.target.value === '__custom__') {
      const url = prompt('Enter GitHub project URL:');
      if (url) {
        const opt = document.createElement('option');
        opt.value = url;
        opt.textContent = url.replace(/^https?:\/\/github\.com\//, '');
        e.target.insertBefore(opt, e.target.lastElementChild);
        e.target.value = url;
      } else {
        e.target.value = metaProjects[0] ?? '';
      }
    }
  });

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
  let ideaUrl = url || null;

  switch (type) {
    case 'page':  data = { url, title }; break;
    case 'video': data = {
      url,
      platform: video.platform ?? 'youtube',
      video_id: video.video_id ?? null,
      page_title: title,
    }; break;
    case 'quote': data = {
      text: content,
      source_url: url,
      attribution: document.getElementById('attribution').value || null,
    }; break;
    case 'note':  data = { content }; break;
    case 'tweet': data = {
      url, text: content,
      author: social.author ?? null,
      platform: social.platform ?? null,
    }; break;
    case 'book':  data = {
      title,
      author: document.getElementById('author').value || null,
    }; break;
    case 'image': data = {
      source_url: url,
      caption: document.getElementById('caption').value || null,
    }; break;
    case 'meta': {
      const project = document.getElementById('meta-project').value;
      data = {
        project: project || null,
        priority: document.getElementById('meta-priority').value,
        status: document.getElementById('meta-status').value,
        implementation_details: content || null,
      };
      ideaUrl = project || null;
      break;
    }
    default: data = { content };
  }

  const resp = await new Promise((res) =>
    chrome.runtime.sendMessage({
      type: 'SAVE_IDEA',
      payload: {
        type,
        title: title || null,
        url: ideaUrl,
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
