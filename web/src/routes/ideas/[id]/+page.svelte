<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { getIdea, deleteIdea } from '$lib/api/ideas.js';
  import IdeaDetail from '$lib/components/IdeaDetail.svelte';
  import { goto } from '$app/navigation';

  let idea = null;
  let data = {};
  let connections = [];
  let notes = [];
  let media = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const id = $page.params.id;
      const result = await getIdea(id);
      idea = result.idea;
      data = result.data;
      connections = result.connections;
      notes = result.notes;
      media = result.media;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  async function handleDelete() {
    if (!confirm('Delete this idea?')) return;
    await deleteIdea(idea.id);
    goto('/ideas');
  }
</script>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if idea}
  <div class="header-actions">
    <a href="/ideas" class="back">← All ideas</a>
    <button class="delete-btn" on:click={handleDelete}>Delete</button>
  </div>
  <IdeaDetail {idea} {data} {connections} {notes} {media} />
{/if}

<style>
  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 28px;
  }
  .back {
    color: var(--text);
    text-decoration: none;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 6px 14px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .back:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .delete-btn {
    padding: 6px 14px;
    border: 2px solid #ef4444;
    border-radius: var(--r);
    color: #ef4444;
    background: transparent;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    box-shadow: 3px 3px 0 #ef4444;
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .delete-btn:hover {
    box-shadow: 5px 5px 0 #ef4444;
    transform: translate(-1px, -1px);
  }
  .muted { color: var(--muted); }
  .error { color: #f87171; }
</style>
