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
    page:   '#60a5fa',
    tweet:  '#34d399',
    book:   '#fbbf24',
    quote:  '#a78bfa',
    note:   '#fb923c',
    image:  '#fb7185',
    text:   '#2dd4bf',
    video:  '#f87171',
    tag:    '#94a3b8',
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
  $: accent = CARD_COLORS[idea.type] ?? '#cbd5e1';

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
    style="border-left-color: {accent};"
  >
    <div class="card-header">
      <span class="type-icon">{TYPE_ICONS[idea.type] ?? '💡'}</span>
      <span class="type-label" style="color: {accent}">{idea.type}</span>
      {#if idea.created_at}<span class="date">{formatDate(idea.created_at)}</span>{/if}
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
    background: var(--surface);
    border: 1px solid var(--stroke);
    border-left: 3px solid transparent;
    border-radius: var(--r, 4px);
    padding: 16px 16px 14px;
    text-decoration: none;
    color: var(--text);
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .card:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .card:active {
    box-shadow: none;
    transform: translate(2px, 2px);
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
    color: var(--muted);
  }

  .title {
    margin: 0 0 6px;
    font-size: 0.97rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text);
  }

  .summary {
    margin: 0 0 6px;
    font-size: 0.83rem;
    color: var(--muted);
    line-height: 1.45;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .url {
    margin: 0 0 8px;
    font-size: 0.72rem;
    color: var(--muted);
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
    background: var(--tag-surface);
    border: 2px solid var(--tag-stroke);
    border-radius: var(--r, 4px);
    padding: 24px 20px;
    word-break: break-word;
    text-align: center;
    box-shadow: 4px 4px 0 var(--tag-stroke);
  }
  .tag-card:hover {
    box-shadow: 6px 6px 0 var(--tag-stroke);
    transform: translate(-1px, -1px);
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
    color: #eeedf0;
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
