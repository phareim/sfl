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
let newTagTitles = new Set();
let metaProjects = [];
let pageMeta = {};

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

  // Load tags and page metadata in parallel
  const [tagsResp, metaResp] = await Promise.all([
    new Promise((res) => chrome.runtime.sendMessage({ type: 'GET_TAGS' }, res)),
    new Promise((res) => chrome.runtime.sendMessage({ type: 'GET_PAGE_META', tabId: tab.id }, res)),
  ]);
  tags = tagsResp?.tags ?? [];
  pageMeta = metaResp?.meta ?? {};
  renderTags();

  const filterEl = document.getElementById('tag-filter');
  filterEl.addEventListener('input', () => renderTags(filterEl.value));
  filterEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const wanted = filterEl.value.trim().replace(/^#/, '');
    if (!wanted) return;
    const match = tags.find((t) => t.title?.toLowerCase() === wanted.toLowerCase());
    if (match) {
      selectedTags.add(match.id);
    } else {
      newTagTitles.add(wanted);
    }
    filterEl.value = '';
    renderTags();
  });
}

const TAG_DISPLAY_CAP = 24;

function renderTags(filter = '') {
  const list = document.getElementById('tag-list');
  list.innerHTML = '';
  const needle = filter.trim().replace(/^#/, '').toLowerCase();

  // Pending new tags first, shown selected; click removes them
  for (const title of newTagTitles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn selected new';
    btn.textContent = '#' + title;
    btn.title = 'New tag — will be created on save';
    btn.addEventListener('click', () => {
      newTagTitles.delete(title);
      renderTags(document.getElementById('tag-filter').value);
    });
    list.appendChild(btn);
  }

  // Existing tags arrive usage-sorted from the API; cap the unfiltered list,
  // but always show every selected tag
  const visible = tags.filter(
    (t) => !needle || t.title?.toLowerCase().includes(needle)
  );
  let shown = 0;
  for (const tag of visible) {
    const isSelected = selectedTags.has(tag.id);
    if (!needle && shown >= TAG_DISPLAY_CAP && !isSelected) continue;
    shown++;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn' + (isSelected ? ' selected' : '');
    btn.textContent = '#' + (tag.title ?? tag.id);
    if (tag.usage_count) btn.title = `${tag.usage_count} idea${tag.usage_count === 1 ? '' : 's'}`;
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

  if (!needle && tags.length > shown) {
    const more = document.createElement('span');
    more.className = 'tag-more';
    more.textContent = `+${tags.length - shown} more — type to filter`;
    list.appendChild(more);
  }

  // Offer to create the typed tag when nothing matches it exactly
  const exact =
    !needle ||
    tags.some((t) => t.title?.toLowerCase() === needle) ||
    [...newTagTitles].some((t) => t.toLowerCase() === needle);
  if (!exact) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-btn create';
    btn.textContent = `+ create #${filter.trim().replace(/^#/, '')}`;
    btn.addEventListener('click', () => {
      newTagTitles.add(filter.trim().replace(/^#/, ''));
      document.getElementById('tag-filter').value = '';
      renderTags();
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
    case 'page':  data = { url, title, ...pageMeta }; break;
    case 'video': data = {
      url,
      platform: video.platform ?? 'youtube',
      video_id: video.video_id ?? null,
      page_title: title,
      description: pageMeta.description ?? null,
      thumbnail: pageMeta.image ?? null,
    }; break;
    case 'quote':
      data = {
        text: content,
        source_url: url,
        page_title: title || null,
        attribution: document.getElementById('attribution').value || null,
      };
      // No top-level url: URL dedup would return the existing idea for this
      // page and silently discard the quote text.
      ideaUrl = null;
      break;
    case 'note':  data = { text: content }; break;
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
    default: data = { text: content };
  }

  const resp = await new Promise((res) =>
    chrome.runtime.sendMessage({
      type: 'SAVE_IDEA',
      payload: {
        type,
        title: title || null,
        url: ideaUrl,
        summary: content.slice(0, 200) || pageMeta.description?.slice(0, 200) || title || null,
        data,
      },
    }, res)
  );

  if (!resp?.ok) {
    errEl.textContent = resp?.error ?? 'Save failed — is the API reachable?';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Save to SFL';
    return;
  }

  // Create any new tags, then connect everything; count failures instead of
  // swallowing them
  let tagFailures = 0;
  const tagIds = [...selectedTags];

  for (const tagTitle of newTagTitles) {
    const ensured = await new Promise((res) =>
      chrome.runtime.sendMessage({ type: 'ENSURE_TAG', title: tagTitle }, res)
    );
    if (ensured?.ok) tagIds.push(ensured.tag.id);
    else tagFailures++;
  }

  for (const tagId of tagIds) {
    const conn = await new Promise((res) =>
      chrome.runtime.sendMessage({
        type: 'CREATE_CONNECTION',
        payload: { from_id: resp.idea.id, to_id: tagId, label: 'tagged_with' },
      }, res)
    );
    if (!conn?.ok) tagFailures++;
  }

  hide('save-form');
  const msgEl = document.querySelector('#success .success-msg');
  if (tagFailures > 0) {
    msgEl.textContent = `✓ Saved, but ${tagFailures} tag${tagFailures === 1 ? '' : 's'} failed`;
  } else if (resp.existing) {
    msgEl.textContent = tagIds.length > 0 ? '✓ Already saved — tags updated' : '✓ Already saved';
  } else {
    msgEl.textContent = '✓ Saved!';
  }
  show('success');
  setTimeout(() => window.close(), tagFailures > 0 ? 2500 : 1200);
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
