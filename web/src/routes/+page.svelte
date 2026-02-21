<script>
  import { onMount } from 'svelte';
  import { listIdeas } from '$lib/api/ideas.js';
  import IdeaCard from '$lib/components/IdeaCard.svelte';

  let ideas = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const data = await listIdeas({ limit: 20 });
      ideas = data.ideas;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<h1>Recent ideas</h1>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if ideas.length === 0}
  <p class="muted">No ideas yet. Hit <strong>+ Capture</strong> to save your first one.</p>
{:else}
  <div class="grid">
    {#each ideas as idea (idea.id)}
      <IdeaCard {idea} />
    {/each}
  </div>
{/if}

<style>
  h1 { margin: 0 0 24px; font-size: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .muted { color: #aaa; }
  .error { color: #d32f2f; }
</style>
