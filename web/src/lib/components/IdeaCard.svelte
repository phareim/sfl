<script>
  import { createEventDispatcher } from 'svelte';
  import TagPill from './TagPill.svelte';

  export let idea;
  export let tags = [];

  const dispatch = createEventDispatcher();

  const TYPE_ICONS = {
    page: '🔗',
    tweet: '🐦',
    book: '📚',
    quote: '💬',
    note: '📝',
    image: '🖼️',
    tag: '🏷️',
    text: '📄',
    video: '▶️',
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

  function icon(type) {
    return TYPE_ICONS[type] ?? '💡';
  }

  function formatDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
</script>

<a href="/ideas/{idea.id}" class="card">
  <div class="card-header">
    <span class="type-icon" title={idea.type}>{icon(idea.type)}</span>
    <span class="type-label">{idea.type}</span>
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

<style>
  .card {
    display: block;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 16px;
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .card:hover {
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    border-color: #bdbdbd;
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
  .type-icon { font-size: 1rem; }
  .type-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #888;
    font-weight: 600;
  }
  .date {
    margin-left: auto;
    font-size: 0.72rem;
    color: #bbb;
  }
  .title {
    margin: 0 0 6px;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.3;
  }
  .summary {
    margin: 0 0 6px;
    font-size: 0.85rem;
    color: #555;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .url {
    margin: 0 0 8px;
    font-size: 0.75rem;
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
    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
    pointer-events: none;
  }
</style>
