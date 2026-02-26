<script>
  import { onMount, onDestroy } from 'svelte';
  import Graph from 'graphology';
  import { goto } from '$app/navigation';

  export let nodes = [];
  export let edges = [];

  let container;
  let sigma;
  let renderer;

  const TYPE_COLORS = {
    page: '#4285f4',
    tweet: '#1da1f2',
    book: '#e91e63',
    quote: '#ff9800',
    note: '#9c27b0',
    image: '#00bcd4',
    tag: '#4caf50',
    text: '#607d8b',
  };

  function colorFor(type) {
    return TYPE_COLORS[type] ?? '#aaa';
  }

  onMount(async () => {
    // Dynamic import to avoid SSR issues
    const [{ default: Sigma }, { circular }] = await Promise.all([
      import('sigma'),
      import('graphology-layout'),
    ]);

    const graph = new Graph({ multi: false, type: 'directed' });

    for (const node of nodes) {
      graph.addNode(node.id, {
        label: node.title ?? node.id,
        size: 8,
        color: colorFor(node.type),
        x: Math.random(),
        y: Math.random(),
      });
    }

    for (const edge of edges) {
      if (graph.hasNode(edge.from_id) && graph.hasNode(edge.to_id)) {
        try {
          graph.addEdge(edge.from_id, edge.to_id, {
            label: edge.label ?? '',
            size: 1,
            color: '#ccc',
          });
        } catch {
          // ignore duplicate edges
        }
      }
    }

    // Apply circular layout as initial positions
    circular.assign(graph);

    // Run ForceAtlas2 in a web worker if available
    try {
      const { default: FA2Layout } = await import('graphology-layout-forceatlas2/worker');
      const layout = new FA2Layout(graph, {
        settings: { gravity: 1, scalingRatio: 2 },
      });
      layout.start();
      setTimeout(() => layout.stop(), 3000);
    } catch {
      // Fall back to static circular layout
    }

    renderer = new Sigma(graph, container, {
      renderEdgeLabels: true,
    });

    renderer.on('clickNode', ({ node }) => {
      goto(`/ideas/${node}`);
    });

    sigma = renderer;
  });

  onDestroy(() => {
    renderer?.kill();
  });
</script>

<div class="graph-container" bind:this={container}></div>

<style>
  .graph-container {
    width: 100%;
    height: 100%;
    min-height: 500px;
  }
</style>
