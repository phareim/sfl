<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { apiFetch } from '../api/client.js';

  // value is the full GitHub URL, e.g. https://github.com/owner/repo
  export let value = '';

  const dispatch = createEventDispatcher();

  let query = '';
  let suggestions = [];
  let loading = false;
  let showDropdown = false;
  let debounceTimer;
  let inputEl;

  $: displayName = urlToName(value);

  function urlToName(url) {
    if (!url) return '';
    const m = url.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/.*)?$/);
    return m ? m[1] : url;
  }

  async function search(q) {
    if (!q || q.length < 2) {
      suggestions = [];
      showDropdown = false;
      return;
    }
    loading = true;
    try {
      const data = await apiFetch(`/api/github/repos?q=${encodeURIComponent(q)}`);
      suggestions = data.items ?? [];
      showDropdown = suggestions.length > 0;
    } catch {
      suggestions = [];
      showDropdown = false;
    } finally {
      loading = false;
    }
  }

  function onInput(e) {
    query = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(query), 300);
  }

  function select(repo) {
    value = repo.html_url;
    query = '';
    suggestions = [];
    showDropdown = false;
    dispatch('change', value);
  }

  function clear() {
    value = '';
    query = '';
    suggestions = [];
    showDropdown = false;
    dispatch('change', '');
    // Focus input after clearing so user can type immediately
    setTimeout(() => inputEl?.focus(), 0);
  }

  function onBlur() {
    setTimeout(() => { showDropdown = false; }, 150);
  }

  onDestroy(() => clearTimeout(debounceTimer));
</script>

<div class="repo-picker">
  {#if value}
    <div class="selected-repo">
      <span class="repo-name">{displayName}</span>
      <button type="button" class="clear-btn" on:click={clear} aria-label="Clear">×</button>
    </div>
  {:else}
    <div class="input-wrap">
      <input
        bind:this={inputEl}
        type="text"
        value={query}
        on:input={onInput}
        on:blur={onBlur}
        placeholder="Search GitHub repos…"
        autocomplete="off"
        spellcheck="false"
      />
      {#if loading}
        <span class="spinner">…</span>
      {/if}
    </div>
    {#if showDropdown}
      <ul class="suggestions" role="listbox">
        {#each suggestions as repo}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li role="option" aria-selected="false" on:click={() => select(repo)}>
            <span class="repo-full-name">
              {repo.full_name}
              {#if repo.private}<span class="private-badge">private</span>{/if}
            </span>
            {#if repo.description}
              <span class="repo-desc">{repo.description}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .repo-picker { position: relative; }

  .input-wrap { position: relative; }
  .input-wrap input {
    width: 100%;
    box-sizing: border-box;
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
  .input-wrap input:focus { border-color: var(--accent, #c4f442); }
  .input-wrap input::placeholder { color: var(--muted, #6b7280); }

  .spinner {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted, #6b7280);
    font-size: 0.85rem;
    pointer-events: none;
  }

  .selected-repo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 2px solid var(--stroke, #252836);
    border-radius: var(--r, 4px);
    background: var(--bg, #0b0d14);
    font-size: 0.9rem;
  }
  .selected-repo .repo-name { color: var(--text, #efefed); flex: 1; }
  .clear-btn {
    background: none;
    border: none;
    color: var(--muted, #6b7280);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.1s;
  }
  .clear-btn:hover { color: var(--text, #efefed); }

  .suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--surface, #13161f);
    border: 2px solid var(--stroke, #252836);
    border-radius: var(--r, 4px);
    list-style: none;
    margin: 0;
    padding: 4px 0;
    z-index: 200;
    max-height: 240px;
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }
  .suggestions li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.1s;
  }
  .suggestions li:hover { background: var(--bg, #0b0d14); }

  .repo-full-name {
    font-size: 0.88rem;
    color: var(--text, #efefed);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .private-badge {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--muted, #6b7280);
    border: 1px solid var(--stroke, #252836);
    border-radius: 3px;
    padding: 1px 5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .repo-desc {
    font-size: 0.78rem;
    color: var(--muted, #6b7280);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
