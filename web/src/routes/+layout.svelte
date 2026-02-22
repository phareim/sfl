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

  /* Shared tokens — don't change with theme */
  :global(:root) {
    --accent: #c4f442;
    --ink: #14161e;   /* always-dark text on accent bg */
    --r: 4px;
  }

  @media (prefers-color-scheme: light) {
    :global(:root) {
      --bg: #f4f2ee;
      --surface: #ffffff;
      --stroke: #14161e;
      --text: #14161e;
      --muted: #7c7c8a;
      --shadow: 3px 3px 0 #14161e;
      --shadow-hover: 5px 5px 0 #14161e;
      --shadow-strong: 8px 8px 0 #14161e;
      --tag-surface: #1c2033;
      --tag-stroke: #3a4460;
    }
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #1c2033;
      --surface: #252d42;
      --stroke: #3a4460;
      --text: #eeedf0;
      --muted: #8891a8;
      --shadow: 3px 3px 0 #141826;
      --shadow-hover: 5px 5px 0 #141826;
      --shadow-strong: 8px 8px 0 #141826;
      --tag-surface: #131829;
      --tag-stroke: #2a3050;
    }
  }

  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
  }

  .content {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 100px;
  }

  .fab-wrap {
    position: fixed;
    z-index: 200;
    bottom: 20px;
    left: 20px;
  }

  .fab {
    width: 52px;
    height: 52px;
    border-radius: var(--r);
    background: var(--accent);
    color: var(--ink);
    border: 2px solid var(--ink);
    font-size: 1.4rem;
    font-weight: 900;
    line-height: 1;
    cursor: pointer;
    box-shadow: var(--shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .fab:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .fab:active {
    box-shadow: 1px 1px 0 #1c1f2c;
    transform: translate(1px, 1px);
  }

  /* Nav panel: opens upward on mobile */
  .nav-panel {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 0;
    background: var(--surface);
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    box-shadow: var(--shadow-hover);
    padding: 14px;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .logo {
    font-size: 1.4rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    text-decoration: none;
    color: var(--accent);
    padding: 0 4px 8px;
    border-bottom: 1px solid var(--stroke);
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
    padding: 7px 10px;
    border-radius: var(--r);
    text-decoration: none;
    color: var(--muted);
    font-size: 0.92rem;
    font-weight: 500;
    transition: color 0.1s;
  }
  li a:hover { color: var(--text); }
  li.active a { background: var(--accent); color: var(--ink); font-weight: 700; }

  .capture-btn {
    background: var(--accent);
    color: var(--ink);
    border: none;
    border-radius: var(--r);
    padding: 10px 14px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
    text-align: center;
  }
  .capture-btn:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .capture-btn:active {
    box-shadow: 1px 1px 0 #1c1f2c;
    transform: translate(1px, 1px);
  }

  @media (min-width: 700px) {
    .fab-wrap {
      bottom: auto;
      top: 20px;
      left: 20px;
    }
    .nav-panel {
      bottom: auto;
      top: calc(100% + 10px);
    }
    .content {
      padding: 40px 32px 40px;
    }
  }
</style>
