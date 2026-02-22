<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { createIdea } from '$lib/api/ideas.js';

  let status = 'Saving…';
  let error = null;

  onMount(async () => {
    const params = $page.url.searchParams;
    const sharedUrl   = params.get('url')   ?? '';
    const sharedTitle = params.get('title') ?? '';
    const sharedText  = params.get('text')  ?? '';

    // Guard: must be configured
    const apiUrl = localStorage.getItem('sfl_api_url');
    const apiKey = localStorage.getItem('sfl_api_key');
    if (!apiUrl || !apiKey) {
      await goto('/settings');
      return;
    }

    // Nothing shared at all — just go home
    if (!sharedUrl && !sharedTitle && !sharedText) {
      await goto('/');
      return;
    }

    try {
      const hasUrl = sharedUrl && /^https?:\/\//.test(sharedUrl);
      const type   = hasUrl ? 'page' : 'note';
      const title  = sharedTitle || null;
      const summary = (sharedText || sharedTitle || sharedUrl).slice(0, 200) || null;

      const data = hasUrl
        ? { url: sharedUrl, selected_text: sharedText }
        : { content: sharedText || sharedTitle };

      const { idea } = await createIdea({
        type,
        title,
        url: hasUrl ? sharedUrl : null,
        summary,
        data,
      });

      await goto(`/ideas/${idea.id}`);
    } catch (e) {
      error = e.message;
      status = '';
    }
  });
</script>

<div class="share-page">
  {#if error}
    <p class="error">{error}</p>
    <a href="/">Go home</a>
  {:else}
    <p class="status">{status}</p>
  {/if}
</div>

<style>
  .share-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 12px;
  }
  .status { color: #555; font-size: 1rem; }
  .error  { color: #d32f2f; font-size: 0.9rem; }
</style>
