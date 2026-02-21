<script>
  import { page } from '$app/stores';
  import CaptureModal from '$lib/components/CaptureModal.svelte';
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api/client.js';

  let captureOpen = false;
  let tags = [];

  onMount(async () => {
    try {
      const data = await apiFetch('/api/tags');
      tags = data.tags ?? [];
    } catch {
      // Tags are non-critical; ignore errors on first load
    }
  });

  function isActive(path) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }
</script>

<div class="layout">
  <nav class="sidebar">
    <div class="logo">
      <a href="/">SFL</a>
    </div>
    <ul>
      <li class:active={isActive('/') && !isActive('/ideas') && !isActive('/tags') && !isActive('/graph')}>
        <a href="/">Recent</a>
      </li>
      <li class:active={isActive('/ideas')}>
        <a href="/ideas">Ideas</a>
      </li>
      <li class:active={isActive('/tags')}>
        <a href="/tags">Tags</a>
      </li>
      <li class:active={isActive('/graph')}>
        <a href="/graph">Graph</a>
      </li>
      <li class:active={isActive('/settings')}>
        <a href="/settings">Settings</a>
      </li>
    </ul>
    <button class="capture-btn" on:click={() => (captureOpen = true)}>+ Capture</button>
  </nav>

  <main class="content">
    <slot />
  </main>
</div>

<CaptureModal bind:open={captureOpen} {tags} on:saved={() => (captureOpen = false)} />

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafa; color: #1a1a1a; }

  .layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 200px;
    flex-shrink: 0;
    background: #fff;
    border-right: 1px solid #e8e8e8;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .logo a {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    text-decoration: none;
    color: #1a1a1a;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  li a {
    display: block;
    padding: 8px 12px;
    border-radius: 6px;
    text-decoration: none;
    color: #555;
    font-size: 0.9rem;
    transition: background 0.1s;
  }

  li a:hover { background: #f5f5f5; }
  li.active a { background: #e8f0fe; color: #1a73e8; font-weight: 600; }

  .capture-btn {
    margin-top: auto;
    background: #1a73e8;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .capture-btn:hover { background: #1557b0; }

  .content {
    flex: 1;
    padding: 32px;
    max-width: 900px;
  }
</style>
