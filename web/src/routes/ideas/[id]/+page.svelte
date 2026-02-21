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
    margin-bottom: 24px;
  }
  .back { color: #1a73e8; text-decoration: none; font-size: 0.9rem; }
  .back:hover { text-decoration: underline; }
  .delete-btn {
    padding: 6px 14px;
    border: 1px solid #d32f2f;
    border-radius: 6px;
    color: #d32f2f;
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .delete-btn:hover { background: #fdecea; }
  .muted { color: #aaa; }
  .error { color: #d32f2f; }
</style>
