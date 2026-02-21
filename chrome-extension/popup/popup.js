/**
 * SFL Popup — quick-save current page with optional tags.
 */

let tags = [];
let selectedTags = new Set();

async function getConfig() {
  return new Promise((res) =>
    chrome.storage.sync.get(['sfl_api_url', 'sfl_api_key'], res)
  );
}

function show(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hide(id) {
  document.getElementById(id).classList.add('hidden');
}

async function init() {
  const { sfl_api_url, sfl_api_key } = await getConfig();

  if (!sfl_api_url || !sfl_api_key) {
    show('not-configured');
    return;
  }

  show('save-form');

  // Pre-fill current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('title').value = tab.title ?? '';
  document.getElementById('url').value = tab.url ?? '';

  // Try to get selected text from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
    if (response?.selection) {
      document.getElementById('type').value = 'quote';
      document.getElementById('content').value = response.selection;
    }
  } catch {
    // Content script may not be injected on restricted pages; ignore
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

  let data;
  switch (type) {
    case 'page': data = { url, title }; break;
    case 'quote': data = { text: content, source_url: url }; break;
    case 'note': data = { content }; break;
    case 'tweet': data = { url, text: content }; break;
    case 'book': data = { title }; break;
    default: data = { content };
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

  // Attach tags
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
