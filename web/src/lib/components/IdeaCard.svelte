<script>
  import TagPill from './TagPill.svelte';

  export let idea;
  export let tags = [];

  const TYPE_ICONS = {
    page:   '🔗',
    tweet:  '🐦',
    book:   '📚',
    quote:  '💬',
    note:   '📝',
    image:  '🖼️',
    tag:    '🏷️',
    text:   '📄',
    video:  '▶️',
  };

  const CARD_COLORS = {
    page:   { bg: '#eef5ff', accent: '#3b82f6' },
    tweet:  { bg: '#edfaf4', accent: '#10b981' },
    book:   { bg: '#fffbeb', accent: '#f59e0b' },
    quote:  { bg: '#f6f0ff', accent: '#8b5cf6' },
    note:   { bg: '#fefce8', accent: '#d97706' },
    image:  { bg: '#fff0f3', accent: '#f43f5e' },
    text:   { bg: '#f0fdfa', accent: '#0d9488' },
    video:  { bg: '#fef2f2', accent: '#ef4444' },
    tag:    { bg: '#f8fafc', accent: '#64748b' },
  };

  function youtubeId(url) {
    if (!url) return null;
    let m = url.match(/[?&]v=([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/youtu\.be\/([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
    if (m) return m[1];
    return null;
  }

  $: videoId = idea.type === 'video' ? youtubeId(idea.url) : null;
  $: colors = CARD_COLORS[idea.type] ?? { bg: '#f8f8f8', accent: '#cbd5e1' };

  function formatDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

{#if idea.type === 'tag'}
  <a href="/ideas/{idea.id}" class="card tag-card">
    <span class="tag-hash">#</span><span class="tag-word">{idea.title ?? 'tag'}</span>
  </a>
{:else}
  <a
    href="/ideas/{idea.id}"
    class="card"
    style="background: {colors.bg}; border-left-color: {colors.accent};"
  >
    <div class="card-header">
      <span class="type-icon">{TYPE_ICONS[idea.type] ?? '💡'}</span>
      <span class="type-label" style="color: {colors.accent}">{idea.type}</span>
      <span class="date">{formatDate(idea.created_at)}</span>
    </div>
    <h3 class="title">{idea.title ?? '(untitled)'}</h3>
    {#if videoId}
      <div class="thumbnail">
        <img
          src="https://img.youtube.com/vi/{videoId}/hqdefault.jpg"
          alt={idea.title ?? ''}
          loading="lazy"
        />
        <span class="play-badge">▶</span>
      </div>
    {/if}
    {#if idea.summary}
      <p class="summary">{idea.summary}</p>
    {/if}
    {#if idea.url}
      <p class="url">{idea.url}</p>
    {/if}
    {#if tags.length > 0}
      <div class="tags">
        {#each tags as tag}
          <TagPill {tag} />
        {/each}
      </div>
    {/if}
  </a>
{/if}

<style>
  .card {
    display: block;
    border-left: 4px solid transparent;
    border-radius: 10px;
    padding: 16px 16px 14px;
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.15s, transform 0.12s;
  }
  .card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .type-icon { font-size: 1rem; }
  .type-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-weight: 700;
  }
  .date {
    margin-left: auto;
    font-size: 0.7rem;
    color: #aaa;
  }

  .title {
    margin: 0 0 6px;
    font-size: 0.97rem;
    font-weight: 600;
    line-height: 1.35;
    color: #111;
  }

  .summary {
    margin: 0 0 6px;
    font-size: 0.83rem;
    color: #555;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .url {
    margin: 0 0 8px;
    font-size: 0.72rem;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }

  .tag-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100px;
    background: #0f172a;
    border-left: none;
    border-radius: 10px;
    padding: 24px 20px;
    word-break: break-word;
    text-align: center;
  }
  .tag-hash {
    font-size: 2rem;
    font-weight: 900;
    color: #475569;
    line-height: 1;
  }
  .tag-word {
    font-size: 2rem;
    font-weight: 900;
    color: #f8fafc;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .thumbnail {
    position: relative;
    margin: 8px 0;
    border-radius: 6px;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    background: #000;
  }
  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .play-badge {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
</style>
