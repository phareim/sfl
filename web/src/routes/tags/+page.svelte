<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api/client.js';
  import { goto } from '$app/navigation';

  let tags = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const data = await apiFetch('/api/tags');
      tags = data.tags;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  function maxCount() {
    return tags.reduce((m, t) => Math.max(m, t.usage_count), 1);
  }

  function fontSize(count) {
    const min = 0.85, max = 2.2;
    return min + (count / maxCount()) * (max - min);
  }
</script>

<h1>Tags</h1>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if tags.length === 0}
  <p class="muted">No tags yet. Create a tag idea and connect it with label <code>tagged_with</code>.</p>
{:else}
  <div class="cloud">
    {#each tags as tag}
      <button
        class="tag"
        style="font-size: {fontSize(tag.usage_count)}rem"
        on:click={() => goto(`/ideas?tag=${tag.id}`)}
        title="{tag.usage_count} ideas"
      >
        #{tag.title ?? tag.id}
        <span class="count">{tag.usage_count}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  h1 { margin: 0 0 24px; font-size: 1.5rem; font-weight: 800; }
  .cloud { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .tag {
    background: none;
    border: 1px solid var(--stroke);
    border-radius: var(--r);
    cursor: pointer;
    color: var(--accent);
    font-weight: 700;
    padding: 4px 10px;
    transition: border-color 0.1s, box-shadow 0.1s, transform 0.1s;
    line-height: 1;
    box-shadow: var(--shadow);
  }
  .tag:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .count { font-size: 0.65em; color: var(--muted); margin-left: 4px; font-weight: 400; }
  .muted { color: var(--muted); }
  .error { color: #f87171; }
</style>
