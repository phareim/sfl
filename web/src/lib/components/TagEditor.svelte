<script>
  import { createEventDispatcher } from 'svelte';
  import { apiFetch } from '../api/client.js';
  import { createIdea } from '../api/ideas.js';
  import { createConnection, deleteConnection } from '../api/connections.js';

  export let ideaId;
  // Array of { connectionId, tagId, tagTitle }
  export let currentTags = [];

  const dispatch = createEventDispatcher();

  let allTags = [];
  let input = '';
  let suggestions = [];
  let saving = false;
  let showSuggestions = false;

  async function loadAllTags() {
    try {
      const data = await apiFetch('/api/tags');
      allTags = data.tags ?? [];
    } catch {}
  }

  loadAllTags();

  $: {
    const q = input.trim().toLowerCase();
    if (q.length === 0) {
      suggestions = [];
    } else {
      const currentTagIds = new Set(currentTags.map((t) => t.tagId));
      suggestions = allTags
        .filter((t) => !currentTagIds.has(t.id) && (t.title ?? '').toLowerCase().includes(q))
        .slice(0, 6);
    }
  }

  async function addTag(tag) {
    saving = true;
    try {
      const { connection } = await createConnection({
        from_id: ideaId,
        to_id: tag.id,
        label: 'tagged_with',
      });
      currentTags = [...currentTags, { connectionId: connection.id, tagId: tag.id, tagTitle: tag.title }];
      dispatch('change', currentTags);
    } finally {
      saving = false;
      input = '';
      showSuggestions = false;
    }
  }

  async function createAndAddTag(name) {
    saving = true;
    try {
      const { idea: newTag } = await createIdea({ type: 'tag', title: name, data: {} });
      allTags = [...allTags, newTag];
      await addTag(newTag);
    } finally {
      saving = false;
    }
  }

  async function removeTag(entry) {
    await deleteConnection(entry.connectionId);
    currentTags = currentTags.filter((t) => t.connectionId !== entry.connectionId);
    dispatch('change', currentTags);
  }

  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.trim();
      if (!q) return;
      const exact = suggestions.find((t) => (t.title ?? '').toLowerCase() === q.toLowerCase());
      if (exact) {
        addTag(exact);
      } else {
        createAndAddTag(q);
      }
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }
</script>

<div class="tag-editor">
  {#each currentTags as entry (entry.connectionId)}
    <span class="tag-chip">
      #{entry.tagTitle ?? entry.tagId}
      <button class="remove" on:click={() => removeTag(entry)} title="Remove tag">×</button>
    </span>
  {/each}

  <div class="input-wrap">
    <input
      type="text"
      placeholder="+ tag"
      bind:value={input}
      on:keydown={onKeydown}
      on:focus={() => (showSuggestions = true)}
      on:blur={() => setTimeout(() => (showSuggestions = false), 150)}
      disabled={saving}
    />
    {#if showSuggestions && (suggestions.length > 0 || input.trim())}
      <ul class="suggestions">
        {#each suggestions as tag}
          <li>
            <button type="button" on:click={() => addTag(tag)}>#{tag.title}</button>
          </li>
        {/each}
        {#if input.trim() && !suggestions.find((t) => (t.title ?? '').toLowerCase() === input.trim().toLowerCase())}
          <li class="create-new">
            <button type="button" on:click={() => createAndAddTag(input.trim())}>
              Create <strong>#{input.trim()}</strong>
            </button>
          </li>
        {/if}
      </ul>
    {/if}
  </div>
</div>

<style>
  .tag-editor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: var(--r);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .remove {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0;
    opacity: 0.4;
  }
  .remove:hover { opacity: 1; }

  .input-wrap { position: relative; }

  input {
    width: 72px;
    padding: 3px 6px;
    border: 1px dashed var(--stroke);
    border-radius: var(--r);
    background: transparent;
    color: var(--text);
    font-size: 0.82rem;
    outline: none;
    transition: width 0.15s, border-color 0.1s, border-style 0.1s;
  }
  input:focus {
    width: 140px;
    border-style: solid;
    border-color: var(--accent);
  }
  input::placeholder { color: var(--muted); }
  input:disabled { opacity: 0.4; }

  .suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 160px;
    background: var(--surface);
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    box-shadow: var(--shadow-hover);
    list-style: none;
    margin: 0; padding: 4px 0;
    z-index: 50;
  }

  .suggestions li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.88rem;
    color: var(--text);
    font-weight: 500;
  }
  .suggestions li button:hover { background: var(--bg); }

  .create-new button { color: var(--accent); }
</style>
