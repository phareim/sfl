<script>
  import { onMount } from 'svelte';
  import { listIdeas, searchIdeas } from '$lib/api/ideas.js';
  import IdeaCard from '$lib/components/IdeaCard.svelte';
  import SearchBar from '$lib/components/SearchBar.svelte';

  let ideas = [];
  let loading = true;
  let error = null;
  let nextCursor = null;
  let searchQuery = '';
  let filterType = '';

  const TYPES = ['', 'page', 'tweet', 'book', 'quote', 'note', 'image', 'text', 'tag'];

  async function load(reset = true) {
    loading = true;
    error = null;
    try {
      if (searchQuery) {
        const data = await searchIdeas(searchQuery);
        ideas = data.ideas;
        nextCursor = null;
      } else {
        const params = {};
        if (filterType) params.type = filterType;
        if (!reset && nextCursor) params.cursor = nextCursor;
        const data = await listIdeas(params);
        ideas = reset ? data.ideas : [...ideas, ...data.ideas];
        nextCursor = data.nextCursor;
      }
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => load());

  function onSearch(e) {
    searchQuery = e.detail;
    load();
  }

  function onTypeChange() {
    searchQuery = '';
    load();
  }
</script>

<div class="toolbar">
  <h1>Ideas</h1>
  <SearchBar on:search={onSearch} />
  <select bind:value={filterType} on:change={onTypeChange}>
    {#each TYPES as t}
      <option value={t}>{t || 'All types'}</option>
    {/each}
  </select>
</div>

{#if loading && ideas.length === 0}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if ideas.length === 0}
  <p class="muted">No ideas found.</p>
{:else}
  <div class="grid">
    {#each ideas as idea (idea.id)}
      <IdeaCard {idea} />
    {/each}
  </div>

  {#if nextCursor}
    <button class="load-more" on:click={() => load(false)} disabled={loading}>
      {loading ? 'Loading...' : 'Load more'}
    </button>
  {/if}
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  h1 { margin: 0; font-size: 1.5rem; flex: 0 0 auto; }
  select { padding: 7px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .muted { color: #aaa; }
  .error { color: #d32f2f; }
  .load-more {
    display: block;
    margin: 24px auto 0;
    padding: 10px 28px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
</style>
