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
    page:   { bg: '#13161f', accent: '#60a5fa' },
    tweet:  { bg: '#13161f', accent: '#34d399' },
    book:   { bg: '#13161f', accent: '#fbbf24' },
    quote:  { bg: '#13161f', accent: '#a78bfa' },
    note:   { bg: '#13161f', accent: '#fb923c' },
    image:  { bg: '#13161f', accent: '#fb7185' },
    text:   { bg: '#13161f', accent: '#2dd4bf' },
    video:  { bg: '#13161f', accent: '#f87171' },
    tag:    { bg: '#0f172a', accent: '#94a3b8' },
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
    border: 1px solid var(--stroke, #252836);
    border-left: 3px solid transparent;
    border-radius: var(--r, 4px);
    padding: 16px 16px 14px;
    text-decoration: none;
    color: var(--text, #efefed);
    box-shadow: var(--shadow, 3px 3px 0 #1c1f2c);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .card:hover {
    box-shadow: var(--shadow-hover, 5px 5px 0 #1c1f2c);
    transform: translate(-1px, -1px);
  }
  .card:active {
    box-shadow: 1px 1px 0 #1c1f2c;
    transform: translate(1px, 1px);
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
    color: var(--muted, #6b7280);
  }

  .title {
    margin: 0 0 6px;
    font-size: 0.97rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text, #efefed);
  }

  .summary {
    margin: 0 0 6px;
    font-size: 0.83rem;
    color: var(--muted, #6b7280);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .url {
    margin: 0 0 8px;
    font-size: 0.72rem;
    color: var(--muted, #6b7280);
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
    border: 2px solid #1e293b;
    border-radius: var(--r, 4px);
    padding: 24px 20px;
    word-break: break-word;
    text-align: center;
    box-shadow: 4px 4px 0 #0c0f1a;
  }
  .tag-card:hover {
    box-shadow: 6px 6px 0 #0c0f1a;
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
