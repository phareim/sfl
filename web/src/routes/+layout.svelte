<script>
  import { page } from '$app/stores';
  import CaptureModal from '$lib/components/CaptureModal.svelte';
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api/client.js';

  let captureOpen = false;
  let navOpen = false;
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
    if (path === '/') {
      return $page.url.pathname === '/' ;
    }
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }

  function navigate() {
    navOpen = false;
  }

  function openCapture() {
    navOpen = false;
    captureOpen = true;
  }
</script>

<svelte:window
  on:click={() => (navOpen = false)}
  on:keydown={(e) => e.key === 'Escape' && (navOpen = false)}
/>

<main class="content">
  <slot />
</main>

<div class="fab-wrap">
  <button class="fab" on:click|stopPropagation={() => (navOpen = !navOpen)} aria-label="Menu" aria-expanded={navOpen}>
    {#if navOpen}✕{:else}≡{/if}
  </button>

  {#if navOpen}
    <nav class="nav-panel" on:click|stopPropagation>
      <a href="/" class="logo" on:click={navigate}>SFL</a>
      <ul>
        <li class:active={isActive('/')}>
          <a href="/" on:click={navigate}>Recent</a>
        </li>
        <li class:active={isActive('/ideas')}>
          <a href="/ideas" on:click={navigate}>Ideas</a>
        </li>
        <li class:active={isActive('/tags')}>
          <a href="/tags" on:click={navigate}>Tags</a>
        </li>
        <li class:active={isActive('/graph')}>
          <a href="/graph" on:click={navigate}>Graph</a>
        </li>
        <li class:active={isActive('/settings')}>
          <a href="/settings" on:click={navigate}>Settings</a>
        </li>
      </ul>
      <button class="capture-btn" on:click={openCapture}>+ Capture</button>
    </nav>
  {/if}
</div>

<CaptureModal bind:open={captureOpen} {tags} on:saved={() => (captureOpen = false)} />

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f7f7f5;
    color: #1a1a1a;
  }

  .content {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 100px; /* bottom pad clears mobile FAB */
  }

  /* FAB */
  .fab-wrap {
    position: fixed;
    z-index: 200;
    /* Mobile: bottom-left */
    bottom: 20px;
    left: 20px;
  }

  .fab {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #1a1a1a;
    color: #fff;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 3px 16px rgba(0, 0, 0, 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, transform 0.12s;
  }
  .fab:hover {
    background: #333;
    transform: scale(1.06);
  }

  /* Nav panel: opens upward on mobile */
  .nav-panel {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 6px 32px rgba(0, 0, 0, 0.14);
    padding: 16px;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .logo {
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: -0.04em;
    text-decoration: none;
    color: #1a1a1a;
    padding: 0 4px 4px;
    border-bottom: 1px solid #eee;
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
    padding: 8px 10px;
    border-radius: 8px;
    text-decoration: none;
    color: #444;
    font-size: 0.92rem;
    font-weight: 500;
    transition: background 0.1s;
  }
  li a:hover { background: #f5f5f5; color: #1a1a1a; }
  li.active a { background: #1a1a1a; color: #fff; }

  .capture-btn {
    background: #1a73e8;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    text-align: center;
  }
  .capture-btn:hover { background: #1557b0; }

  /* Desktop: move FAB to top-left, panel opens downward */
  @media (min-width: 700px) {
    .fab-wrap {
      bottom: auto;
      top: 20px;
      left: 20px;
    }

    .nav-panel {
      bottom: auto;
      top: calc(100% + 12px);
    }

    .content {
      padding: 40px 32px 40px;
    }
  }
</style>
