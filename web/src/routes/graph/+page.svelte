<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api/client.js';
  import GraphView from '$lib/components/GraphView.svelte';

  let nodes = [];
  let edges = [];
  let loading = true;
  let error = null;

  onMount(async () => {
    try {
      const data = await apiFetch('/api/graph');
      nodes = data.nodes;
      edges = data.edges;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="graph-page">
  <h1>Graph</h1>
  {#if loading}
    <p class="muted">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <p class="stats">{nodes.length} ideas · {edges.length} connections</p>
    <div class="graph-wrap">
      <GraphView {nodes} {edges} />
    </div>
  {/if}
</div>

<style>
  .graph-page { height: 100%; display: flex; flex-direction: column; }
  h1 { margin: 0 0 8px; font-size: 1.5rem; }
  .stats { margin: 0 0 16px; font-size: 0.85rem; color: #aaa; }
  .graph-wrap { flex: 1; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; min-height: 500px; }
  .muted { color: #aaa; }
  .error { color: #d32f2f; }
</style>
