<script>
  import { createEventDispatcher } from 'svelte';
  import { createIdea } from '../api/ideas.js';
  import { createConnection } from '../api/connections.js';
  import { apiFetch } from '../api/client.js';

  export let open = false;
  export let tags = [];

  const dispatch = createEventDispatcher();

  let type = 'note';
  let title = '';
  let url = '';
  let summary = '';
  let content = '';
  let selectedTags = [];
  let saving = false;
  let savingStatus = '';
  let error = null;
  let imageFile = null;   // File object when user picks a local file
  let metaPriority = 'B';
  let metaStatus = 'draft';
  let metaProject = 'https://github.com/phareim/sfl';

  function onFileChange(e) {
    imageFile = e.target.files[0] ?? null;
    if (imageFile && !title) title = imageFile.name.replace(/\.[^.]+$/, '');
  }

  const TYPES = ['note', 'page', 'quote', 'book', 'tweet', 'image', 'text', 'meta'];

  function buildData() {
    switch (type) {
      case 'note': return { content };
      case 'page': return { url, selected_text: content };
      case 'quote': return { text: content, attribution: title };
      case 'tweet': return { url, text: content };
      case 'book': return { title };
      case 'image': return { source_url: url, caption: content };
      case 'meta': return {
        project: metaProject || 'https://github.com/phareim/sfl',
        priority: metaPriority || 'B',
        status: metaStatus || 'draft',
        git_commit: null,
        implementation_details: '',
      };
      default: return { content };
    }
  }

  async function save() {
    saving = true;
    error = null;
    try {
      savingStatus = 'Saving…';
      const { idea } = await createIdea({
        type,
        title: title || null,
        url: url || null,
        summary: summary || content.slice(0, 200) || null,
        data: buildData(),
      });

      // Upload image to R2 if this is an image type
      if (type === 'image') {
        if (imageFile) {
          savingStatus = 'Uploading image…';
          const form = new FormData();
          form.append('file', imageFile);
          await apiFetch(`/api/ideas/${idea.id}/media`, { method: 'POST', body: form });
        } else if (url) {
          savingStatus = 'Fetching image…';
          await apiFetch(`/api/ideas/${idea.id}/media/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
        }
      }

      // Attach tags
      savingStatus = 'Tagging…';
      for (const tag of selectedTags) {
        await createConnection({ from_id: idea.id, to_id: tag.id, label: 'tagged_with' });
      }

      dispatch('saved', idea);
      reset();
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
      savingStatus = '';
    }
  }

  function reset() {
    type = 'note';
    title = '';
    url = '';
    summary = '';
    content = '';
    selectedTags = [];
    imageFile = null;
    metaPriority = 'B';
    metaStatus = 'draft';
    metaProject = 'https://github.com/phareim/sfl';
    open = false;
  }

  function toggleTag(tag) {
    if (selectedTags.find((t) => t.id === tag.id)) {
      selectedTags = selectedTags.filter((t) => t.id !== tag.id);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  function isSelected(tag) {
    return !!selectedTags.find((t) => t.id === tag.id);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <dialog open class="backdrop" on:click|self={reset} on:keydown={(e) => e.key === 'Escape' && reset()}>
    <div class="modal">
      <h2>Capture idea</h2>

      <label>
        Type
        <select bind:value={type}>
          {#each TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </label>

      <label>
        Title
        <input type="text" bind:value={title} placeholder="Optional title" />
      </label>

      {#if type === 'page' || type === 'tweet' || type === 'image'}
        <label>
          URL
          <input type="url" bind:value={url} placeholder="https://..." />
        </label>
      {/if}

      {#if type === 'image'}
        <label>
          Upload file <span class="optional">(or paste a URL above)</span>
          <input type="file" accept="image/*,video/*" on:change={onFileChange} />
        </label>
        {#if imageFile}
          <p class="file-hint">📎 {imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)</p>
        {/if}
      {/if}

      {#if type === 'meta'}
        <label>
          Priority
          <select bind:value={metaPriority}>
            <option value="A">A — Critical</option>
            <option value="B">B — High</option>
            <option value="C">C — Medium</option>
            <option value="D">D — Low</option>
          </select>
        </label>
        <label>
          Status
          <select bind:value={metaStatus}>
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="in-progress">in-progress</option>
            <option value="done">done</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <label>
          Project
          <input type="text" bind:value={metaProject} placeholder="https://github.com/..." />
        </label>
      {/if}

      {#if type !== 'book' && type !== 'image' && type !== 'meta'}
        <label>
          Content
          <textarea bind:value={content} rows="5" placeholder="Content..."></textarea>
        </label>
      {:else if type === 'image'}
        <label>
          Caption
          <input type="text" bind:value={content} placeholder="Optional caption" />
        </label>
      {/if}

      <label>
        Summary (for search)
        <input type="text" bind:value={summary} placeholder="Short excerpt (auto-filled if blank)" />
      </label>

      {#if tags.length > 0}
        <div class="tag-section">
          <span class="label">Tags</span>
          <div class="tag-list">
            {#each tags as tag}
              <button
                type="button"
                class="tag-btn"
                class:selected={isSelected(tag)}
                on:click={() => toggleTag(tag)}
              >
                #{tag.title ?? tag.id}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="footer">
        <button type="button" on:click={reset}>Cancel</button>
        <button type="button" class="primary" on:click={save} disabled={saving}>
          {saving ? savingStatus : 'Save'}
        </button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  dialog.backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
    border: none;
    padding: 16px;
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
  }
  .modal {
    background: var(--surface, #13161f);
    border: 2px solid var(--stroke, #252836);
    border-radius: var(--r, 4px);
    padding: 28px;
    width: 100%;
    max-width: 520px;
    box-shadow: var(--shadow-strong);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
  }
  h2 { margin: 0 0 20px; font-size: 1.2rem; font-weight: 800; color: var(--text, #efefed); }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--muted, #6b7280); margin-bottom: 14px; }
  input, select, textarea {
    padding: 8px 10px;
    border: 2px solid var(--stroke, #252836);
    border-radius: var(--r, 4px);
    background: var(--bg, #0b0d14);
    color: var(--text, #efefed);
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    transition: border-color 0.1s;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent, #c4f442); }
  input::placeholder, textarea::placeholder { color: var(--muted, #6b7280); }
  textarea { resize: vertical; }
  select option { background: var(--surface, #13161f); }
  .tag-section { margin-bottom: 14px; }
  .label { font-size: 0.85rem; color: var(--muted, #6b7280); display: block; margin-bottom: 6px; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag-btn {
    padding: 3px 10px;
    border-radius: var(--r, 4px);
    border: 1px solid var(--stroke, #252836);
    background: transparent;
    color: var(--muted, #6b7280);
    cursor: pointer;
    font-size: 0.8rem;
    transition: color 0.1s, border-color 0.1s;
  }
  .tag-btn:hover { color: var(--text, #efefed); border-color: var(--text, #efefed); }
  .tag-btn.selected { background: var(--accent, #c4f442); color: var(--ink); border-color: var(--accent, #c4f442); font-weight: 700; }
  .error { color: #f87171; font-size: 0.85rem; margin: 0 0 12px; }
  .footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
  button {
    padding: 8px 18px;
    border-radius: var(--r, 4px);
    border: 2px solid var(--stroke, #252836);
    background: transparent;
    color: var(--text, #efefed);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    transition: border-color 0.1s, color 0.1s;
  }
  button:hover { border-color: var(--text, #efefed); }
  button.primary {
    background: var(--accent, #c4f442);
    color: var(--ink);
    border-color: var(--accent, #c4f442);
    box-shadow: var(--shadow, 3px 3px 0 #1c1f2c);
  }
  button.primary:hover {
    box-shadow: var(--shadow-hover, 5px 5px 0 #1c1f2c);
    transform: translate(-1px, -1px);
  }
  button.primary:active {
    box-shadow: 1px 1px 0 #1c1f2c;
    transform: translate(1px, 1px);
  }
  button:disabled { opacity: 0.4; cursor: default; transform: none !important; box-shadow: none !important; }
  .optional { font-weight: 400; color: var(--muted, #6b7280); }
  .file-hint { margin: -8px 0 6px; font-size: 0.8rem; color: var(--muted, #6b7280); }
</style>
