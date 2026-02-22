<script>
  import NoteEditor from './NoteEditor.svelte';
  import MediaGallery from './MediaGallery.svelte';
  import TagEditor from './TagEditor.svelte';

  export let idea;
  export let data = {};
  export let connections = [];
  export let notes = [];
  export let media = [];

  function formatDate(ms) {
    return new Date(ms).toLocaleString();
  }

  // Build editable tag list: { connectionId, tagId, tagTitle }
  $: currentTags = connections
    .filter((c) => c.label === 'tagged_with' && (c.to_type === 'tag' || c.from_type === 'tag'))
    .map((c) =>
      c.to_type === 'tag'
        ? { connectionId: c.id, tagId: c.to_id, tagTitle: c.to_title }
        : { connectionId: c.id, tagId: c.from_id, tagTitle: c.from_title }
    );

  $: relatedConnections = connections.filter((c) => c.label !== 'tagged_with');

  $: youtubeEmbedId = (() => {
    if (idea.type !== 'video') return null;
    if (data?.video_id && data?.platform === 'youtube') return data.video_id;
    // Fallback: parse from url
    const url = idea.url ?? '';
    let m = url.match(/[?&]v=([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/youtu\.be\/([\w-]{11})/);
    if (m) return m[1];
    m = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
    if (m) return m[1];
    return null;
  })();
</script>

<article class="detail">
  <header class="detail-header">
    <div class="meta">
      <span class="type">{idea.type}</span>
      <span class="date">{formatDate(idea.created_at)}</span>
    </div>
    <h1>{idea.title ?? '(untitled)'}</h1>
    {#if idea.url}
      <a class="source-url" href={idea.url} target="_blank" rel="noopener">{idea.url}</a>
    {/if}
    <div class="tags">
      <TagEditor ideaId={idea.id} {currentTags} />
    </div>
  </header>

  {#if youtubeEmbedId}
    <section class="video-embed">
      <iframe
        src="https://www.youtube-nocookie.com/embed/{youtubeEmbedId}"
        title={idea.title ?? 'YouTube video'}
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </section>
  {/if}

  {#if data.content}
    <section class="content">
      <pre>{data.content}</pre>
    </section>
  {:else if data.text}
    <section class="content">
      <blockquote>{data.text}</blockquote>
      {#if data.attribution}<cite>— {data.attribution}</cite>{/if}
    </section>
  {:else if data.selected_text}
    <section class="content">
      <blockquote>{data.selected_text}</blockquote>
    </section>
  {/if}

  {#if Object.keys(data).length > 0}
    <details class="raw-data">
      <summary>Raw data</summary>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </details>
  {/if}

  {#if relatedConnections.length > 0}
    <section class="connections">
      <h4>Connections</h4>
      {#each relatedConnections as conn}
        <div class="conn">
          <a href="/ideas/{conn.from_id === idea.id ? conn.to_id : conn.from_id}">
            {conn.from_id === idea.id ? conn.to_title : conn.from_title}
          </a>
          {#if conn.label}<span class="label">({conn.label})</span>{/if}
        </div>
      {/each}
    </section>
  {/if}

  <NoteEditor ideaId={idea.id} {notes} />
  <MediaGallery ideaId={idea.id} {media} />
</article>

<style>
  .detail { max-width: 720px; }
  .detail-header { margin-bottom: 24px; }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .type { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 600; }
  .date { font-size: 0.75rem; color: #bbb; margin-left: auto; }
  h1 { margin: 0 0 8px; font-size: 1.6rem; line-height: 1.3; }
  .source-url { font-size: 0.82rem; color: #1a73e8; word-break: break-all; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .content { margin: 24px 0; }
  pre { white-space: pre-wrap; font-family: inherit; }
  blockquote { border-left: 3px solid #e0e0e0; margin: 0; padding-left: 16px; font-size: 1.05rem; line-height: 1.6; }
  cite { display: block; margin-top: 8px; font-size: 0.85rem; color: #777; }
  .raw-data { margin: 24px 0; }
  .raw-data summary { cursor: pointer; font-size: 0.85rem; color: #888; }
  .raw-data pre { background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; }
  .connections { margin-top: 24px; }
  h4 { margin: 0 0 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
  .conn { margin-bottom: 6px; font-size: 0.9rem; }
  .conn a { color: #1a73e8; text-decoration: none; }
  .conn a:hover { text-decoration: underline; }
  .label { color: #aaa; font-size: 0.8rem; margin-left: 6px; }
  .video-embed {
    margin: 24px 0;
    position: relative;
    padding-bottom: 56.25%; /* 16:9 */
    height: 0;
    overflow: hidden;
    border-radius: 8px;
    background: #000;
  }
  .video-embed iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    border: 0;
    border-radius: 8px;
  }
</style>
