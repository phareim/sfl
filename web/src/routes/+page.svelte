<script>
  import { onMount } from 'svelte';
  import { listIdeas } from '$lib/api/ideas.js';
  import IdeaCard from '$lib/components/IdeaCard.svelte';

  let ideas = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const data = await listIdeas({ limit: 24 });
      ideas = data.ideas;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<h1>Recent</h1>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if ideas.length === 0}
  <p class="muted">No ideas yet. Open the menu and hit <strong>+ Capture</strong> to save your first one.</p>
{:else}
  <div class="grid">
    {#each ideas as idea (idea.id)}
      <IdeaCard {idea} />
    {/each}
  </div>
{/if}

<style>
  h1 {
    margin: 0 0 24px;
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .muted { color: var(--muted); }
  .error { color: #f87171; }
</style>
