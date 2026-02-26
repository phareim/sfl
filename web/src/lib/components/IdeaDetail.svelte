<script>
  import NoteEditor from './NoteEditor.svelte';
  import MediaGallery from './MediaGallery.svelte';
  import TagEditor from './TagEditor.svelte';
  import IdeaCard from './IdeaCard.svelte';
  import { marked } from 'marked';
  import { updateNote } from '../api/notes.js';
  import { updateIdea, fetchContent, enrichIdea } from '../api/ideas.js';

  export let idea;
  export let data = {};
  export let connections = [];
  export let notes = [];
  export let media = [];

  const ACCENTS = {
    page: '#60a5fa', tweet: '#34d399', book:  '#fbbf24',
    quote:'#a78bfa', note:  '#fb923c', image: '#fb7185',
    text: '#2dd4bf', video: '#f87171', tag:   '#94a3b8',
    meta: '#818cf8',
  };

  function formatDate(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString();
  }

  $: accent = ACCENTS[idea.type] ?? '#cbd5e1';

  let editingNoteId = null;
  let editingBody = '';

  let editingTitle = false;
  let titleDraft = '';

  function startEditTitle() {
    titleDraft = idea.title ?? '';
    editingTitle = true;
  }

  let fetching = false;
  let enrichingTags = false;
  let enrichingConnections = false;
  let enrichingMarkdown = false;
  $: enriching = enrichingTags || enrichingConnections || enrichingMarkdown;
  let pastingText = false;
  let pasteBuffer = '';

  async function savePastedText() {
    const trimmed = pasteBuffer.trim();
    pastingText = false;
    pasteBuffer = '';
    if (!trimmed) return;
    const result = await updateIdea(idea.id, { data: { ...data, text: trimmed } });
    data = result.data;
  }

  async function doFetchContent() {
    fetching = true;
    try {
      const result = await fetchContent(idea.id);
      data = result.data;
    } finally {
      fetching = false;
    }
  }

  async function saveTitle() {
    const trimmed = titleDraft.trim();
    editingTitle = false;
    if (!trimmed || trimmed === idea.title) return;
    const { idea: updated } = await updateIdea(idea.id, { title: trimmed });
    idea = { ...idea, title: updated.title };
  }

  function startEdit(note) {
    editingNoteId = note.id;
    editingBody = note.body;
  }

  async function saveEdit(note) {
    if (editingBody.trim() === note.body) { editingNoteId = null; return; }
    const { note: updated } = await updateNote(note.id, { body: editingBody.trim() });
    notes = notes.map((n) => (n.id === note.id ? updated : n));
    editingNoteId = null;
  }

  $: currentTags = connections
    .filter((c) => c.label === 'tagged_with' && (c.to_type === 'tag' || c.from_type === 'tag'))
    .map((c) =>
      c.to_type === 'tag'
        ? { connectionId: c.id, tagId: c.to_id, tagTitle: c.to_title }
        : { connectionId: c.id, tagId: c.from_id, tagTitle: c.from_title }
    );

  $: relatedConnections = connections.filter((c) => c.label !== 'tagged_with');

  // For tag ideas: all ideas tagged with this tag
  $: taggedIdeas = idea.type === 'tag'
    ? connections
        .filter((c) => c.label === 'tagged_with')
        .map((c) =>
          c.to_type === 'tag'
            ? { id: c.from_id, type: c.from_type, title: c.from_title }
            : { id: c.to_id,   type: c.to_type,   title: c.to_title   }
        )
        .filter((i) => i.type !== 'tag')
    : [];

  async function doEnrichTags() {
    enrichingTags = true;
    try {
      const result = await enrichIdea(idea.id, 'tags');
      connections = result.connections;
      data = result.data;
    } finally {
      enrichingTags = false;
    }
  }

  async function doEnrichConnections() {
    enrichingConnections = true;
    try {
      const result = await enrichIdea(idea.id, 'connections');
      connections = result.connections;
      data = result.data;
    } finally {
      enrichingConnections = false;
    }
  }

  async function doEnrichMarkdown() {
    enrichingMarkdown = true;
    try {
      const result = await enrichIdea(idea.id, 'markdown');
      connections = result.connections;
      data = result.data;
    } finally {
      enrichingMarkdown = false;
    }
  }

  async function saveMetaField(field, value) {
    const updated = await updateIdea(idea.id, { data: { ...data, [field]: value } });
    data = updated.data;
  }

  $: videoEmbed = (() => {
    if (idea.type !== 'video') return null;
    if (data?.video_id && data?.platform) return { platform: data.platform, video_id: data.video_id };
    const url = idea.url ?? '';
    let m = url.match(/[?&]v=([\w-]{11})/);
    if (m) return { platform: 'youtube', video_id: m[1] };
    m = url.match(/youtu\.be\/([\w-]{11})/);
    if (m) return { platform: 'youtube', video_id: m[1] };
    m = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
    if (m) return { platform: 'youtube', video_id: m[1] };
    m = url.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
    if (m) return { platform: 'tiktok', video_id: m[1] };
    return null;
  })();
</script>

{#if idea.type === 'tag'}
  <!-- ── TAG DETAIL ── -->
  <article class="detail">
    <header class="tag-hero">
      {#if editingTitle}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="tag-title-input"
          bind:value={titleDraft}
          autofocus
          on:blur={saveTitle}
          on:keydown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') (editingTitle = false); }}
        />
      {:else}
        <h1 class="tag-title" title="Click to edit" role="button" tabindex="0" on:click={startEditTitle} on:keydown={(e) => e.key === 'Enter' && startEditTitle()}>
          <span class="tag-hash">#</span>{idea.title ?? 'tag'}
        </h1>
      {/if}
    </header>

    {#if notes.length > 0}
      <section class="compact-notes">
        {#each notes as note (note.id)}
          {#if editingNoteId === note.id}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea
              class="note-edit"
              bind:value={editingBody}
              autofocus
              on:blur={() => saveEdit(note)}
              on:keydown={(e) => e.key === 'Escape' && (editingNoteId = null)}
            ></textarea>
          {:else}
            <p
              class="compact-note"
              title="Click to edit"
              role="button"
              tabindex="0"
              on:click={() => startEdit(note)}
              on:keydown={(e) => e.key === 'Enter' && startEdit(note)}
            >{note.body}</p>
          {/if}
        {/each}
      </section>
    {/if}

    <section class="section">
      <h2 class="section-label">
        {taggedIdeas.length} {taggedIdeas.length === 1 ? 'idea' : 'ideas'}
      </h2>
      {#if taggedIdeas.length > 0}
        <div class="grid">
          {#each taggedIdeas as tidea (tidea.id)}
            <IdeaCard idea={tidea} />
          {/each}
        </div>
      {:else}
        <p class="muted">Nothing tagged with #{idea.title} yet.</p>
      {/if}
    </section>
  </article>

{:else}
  <!-- ── GENERAL DETAIL ── -->
  <article class="detail">
    <header class="detail-header" style="border-left-color: {accent};">
      <div class="meta-row">
        <span class="type-badge" style="color: {accent}; border-color: {accent};">{idea.type}</span>
        <span class="date">{formatDate(idea.created_at)}</span>
      </div>
      {#if editingTitle}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="title-input"
          bind:value={titleDraft}
          autofocus
          on:blur={saveTitle}
          on:keydown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') (editingTitle = false); }}
        />
      {:else}
        <h1 class="editable-title" title="Click to edit" role="button" tabindex="0" on:click={startEditTitle} on:keydown={(e) => e.key === 'Enter' && startEditTitle()}>
          {idea.title ?? '(untitled)'}
        </h1>
      {/if}
      {#if idea.url}
        <a class="source-url" href={idea.url} target="_blank" rel="noopener">{idea.url}</a>
      {/if}
      <div class="tags-row">
        <TagEditor ideaId={idea.id} {currentTags} />
      </div>
      <div class="enrich-row">
        <button class="enrich-btn" on:click={doEnrichTags} disabled={enriching}>
          {enrichingTags ? 'Tagging…' : 'Auto-tag'}
        </button>
        <button class="enrich-btn" on:click={doEnrichConnections} disabled={enriching}>
          {enrichingConnections ? 'Connecting…' : 'Find connections'}
        </button>
        {#if data.text && idea.type !== 'page'}
          <button class="enrich-btn" on:click={doEnrichMarkdown} disabled={enriching}>
            {enrichingMarkdown ? 'Formatting…' : data.markdown ? 'Re-format markdown' : 'Format as markdown'}
          </button>
        {/if}
      </div>
    </header>

    {#if idea.type === 'meta'}
      <section class="meta-fields">
        <div class="meta-badges">
          <select
            class="meta-status-badge"
            style="--status-color: {
              data.status === 'done' ? '#4ade80'
              : data.status === 'in-progress' ? '#fbbf24'
              : data.status === 'ready' ? '#60a5fa'
              : data.status === 'rejected' ? '#f87171'
              : '#94a3b8'
            };"
            value={data.status ?? 'draft'}
            on:change={(e) => saveMetaField('status', e.target.value)}
          >
            <option value="draft">draft</option>
            <option value="ready">ready</option>
            <option value="in-progress">in-progress</option>
            <option value="done">done</option>
            <option value="rejected">rejected</option>
          </select>
          <select
            class="meta-priority-badge"
            style="--priority-color: {
              data.priority === 'A' ? '#f87171'
              : data.priority === 'B' ? '#fb923c'
              : data.priority === 'C' ? '#fbbf24'
              : '#94a3b8'
            };"
            value={data.priority ?? 'B'}
            on:change={(e) => saveMetaField('priority', e.target.value)}
          >
            <option value="A">P-A</option>
            <option value="B">P-B</option>
            <option value="C">P-C</option>
            <option value="D">P-D</option>
          </select>
        </div>
        {#if data.project}
          <a class="meta-project" href={data.project} target="_blank" rel="noopener">{data.project}</a>
        {/if}
        {#if data.git_commit}
          <div class="meta-commit">
            <span class="meta-label">Commit</span>
            <code class="meta-commit-hash">{data.git_commit}</code>
          </div>
        {/if}
        {#if data.implementation_details}
          <div class="meta-impl">
            <span class="meta-label">Implementation details</span>
            <pre class="meta-impl-pre">{data.implementation_details}</pre>
          </div>
        {/if}
      </section>
    {/if}

    {#if videoEmbed?.platform === 'youtube'}
      <section class="video-embed landscape">
        <iframe
          src="https://www.youtube-nocookie.com/embed/{videoEmbed.video_id}"
          title={idea.title ?? 'YouTube video'}
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </section>
    {:else if videoEmbed?.platform === 'tiktok'}
      <section class="video-embed portrait">
        <iframe
          src="https://www.tiktok.com/embed/v2/{videoEmbed.video_id}"
          title={idea.title ?? 'TikTok video'}
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </section>
    {/if}

    {#if idea.type === 'page' && data.text}
      <section class="reader" style="--article-accent: {accent}">
        {#each data.text.split('\n\n').filter(Boolean) as para}
          <p>{para}</p>
        {/each}
      </section>
    {:else if data.content}
      <section class="content">
        <pre>{data.content}</pre>
      </section>
    {:else if data.text}
      <section class="content">
        {#if data.markdown}
          <div class="markdown-body">{@html marked.parse(data.text)}</div>
        {:else}
          <blockquote style="border-left-color: {accent};">{data.text}</blockquote>
        {/if}
        {#if data.attribution}<cite>— {data.attribution}</cite>{/if}
      </section>
    {:else if data.selected_text}
      <section class="content">
        <blockquote style="border-left-color: {accent};">{data.selected_text}</blockquote>
      </section>
    {/if}

    {#if idea.type === 'page' && !data.text}
      {#if data.article === false}
        <div class="not-article-row">
          <span class="not-article">Not an article</span>
          {#if pastingText}
            <div class="paste-box">
              <!-- svelte-ignore a11y_autofocus -->
              <textarea
                class="paste-area"
                bind:value={pasteBuffer}
                autofocus
                placeholder="Paste text here…"
                rows="6"
              ></textarea>
              <div class="paste-actions">
                <button class="fetch-btn" on:click={savePastedText} disabled={!pasteBuffer.trim()}>Save</button>
                <button class="fetch-btn" on:click={() => { pastingText = false; pasteBuffer = ''; }}>Cancel</button>
              </div>
            </div>
          {:else}
            <button class="paste-btn" on:click={() => (pastingText = true)}>Paste text</button>
          {/if}
        </div>
      {:else}
        <button class="fetch-btn" on:click={doFetchContent} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Fetch full article'}
        </button>
      {/if}
    {/if}

    {#if relatedConnections.length > 0}
      <section class="section">
        <h2 class="section-label">Connections</h2>
        {#each relatedConnections as conn}
          <a
            class="conn-link"
            href="/ideas/{conn.from_id === idea.id ? conn.to_id : conn.from_id}"
          >
            <span class="conn-title">{conn.from_id === idea.id ? conn.to_title : conn.from_title}</span>
            {#if conn.label}<span class="conn-label">{conn.label}</span>{/if}
          </a>
        {/each}
      </section>
    {/if}

    {#if Object.keys(data).length > 0}
      <details class="raw-data">
        <summary>Raw data</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    {/if}

    <NoteEditor ideaId={idea.id} {notes} />
    <MediaGallery ideaId={idea.id} items={media} />
  </article>
{/if}

<style>
  .detail { max-width: 720px; }

  /* ── TAG HERO ── */
  .tag-hero {
    padding: 32px 28px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    background: var(--tag-surface, #1c2033);
    box-shadow: var(--shadow-strong);
    margin-bottom: 28px;
  }
  .tag-title {
    margin: 0 0 4px;
    font-size: 3rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    cursor: text;
  }
  .tag-hash { color: #475569; }
  .tag-title-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--accent);
    border-radius: 0;
    color: #eeedf0;
    font-size: 3rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    padding: 0 0 4px;
    outline: none;
    font-family: inherit;
    margin-bottom: 4px;
  }

  .compact-notes {
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    padding: 16px 20px;
    margin-bottom: 24px;
    box-shadow: var(--shadow);
    background: var(--surface);
  }
  .compact-note {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--muted);
    white-space: pre-wrap;
    cursor: text;
  }
  .compact-note:hover { color: var(--text); }
  .compact-note + .compact-note,
  .note-edit + .compact-note,
  .compact-note + .note-edit {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--stroke);
  }
  .note-edit {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--accent);
    border-radius: 0;
    color: var(--text);
    font-size: 0.92rem;
    font-family: inherit;
    line-height: 1.6;
    padding: 2px 0;
    resize: none;
    outline: none;
    min-height: 4em;
  }

  /* ── GENERAL DETAIL HEADER ── */
  .detail-header {
    border-left: 4px solid transparent;
    padding-left: 20px;
    margin-bottom: 32px;
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .type-badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
    border: 2px solid;
    padding: 2px 8px;
    border-radius: var(--r);
  }
  .date { font-size: 0.75rem; color: var(--muted); margin-left: auto; }
  h1 { margin: 0 0 10px; font-size: 2rem; font-weight: 900; line-height: 1.2; letter-spacing: -0.02em; }
  .editable-title { cursor: text; }
  .title-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--accent);
    border-radius: 0;
    color: var(--text);
    font-size: 2rem;
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: -0.02em;
    padding: 0 0 4px;
    margin-bottom: 10px;
    outline: none;
    font-family: inherit;
    display: block;
    box-sizing: border-box;
  }
  .source-url { font-size: 0.8rem; color: var(--muted); word-break: break-all; text-decoration: none; display: block; }
  .source-url:hover { color: var(--text); }
  .tags-row { margin-top: 14px; }
  .enrich-row { margin-top: 10px; display: flex; gap: 8px; }
  .enrich-btn {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--muted);
    background: transparent;
    border: 1px dashed var(--stroke);
    border-radius: var(--r);
    padding: 3px 10px;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }
  .enrich-btn:hover:not(:disabled) { color: var(--text); border-color: var(--text); border-style: solid; }
  .enrich-btn:disabled { opacity: 0.4; cursor: default; }

  /* ── CONTENT ── */
  .content { margin: 28px 0; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 0.95rem; line-height: 1.6; }
  blockquote {
    border-left: 4px solid;
    margin: 0;
    padding: 12px 20px;
    font-size: 1.1rem;
    line-height: 1.65;
    background: var(--surface);
    border-radius: 0 var(--r) var(--r) 0;
  }
  cite { display: block; margin-top: 10px; font-size: 0.85rem; color: var(--muted); font-style: normal; }

  /* ── MARKDOWN BODY ── */
  .markdown-body {
    padding: 20px 24px;
    background: var(--surface);
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    font-size: 0.97rem;
    line-height: 1.7;
  }
  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3) {
    margin: 1.2em 0 0.4em;
    font-weight: 800;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }
  .markdown-body :global(h1) { font-size: 1.5rem; }
  .markdown-body :global(h2) { font-size: 1.2rem; }
  .markdown-body :global(h3) { font-size: 1rem; }
  .markdown-body :global(p) { margin: 0 0 1em; }
  .markdown-body :global(p:last-child) { margin-bottom: 0; }
  .markdown-body :global(ul),
  .markdown-body :global(ol) { margin: 0 0 1em 1.4em; padding: 0; }
  .markdown-body :global(li) { margin-bottom: 0.3em; }
  .markdown-body :global(strong) { font-weight: 700; }
  .markdown-body :global(em) { font-style: italic; }
  .markdown-body :global(code) {
    font-family: monospace;
    font-size: 0.88em;
    background: var(--bg);
    border: 1px solid var(--stroke);
    border-radius: 3px;
    padding: 1px 5px;
  }
  .markdown-body :global(pre) {
    background: var(--bg);
    border: 1px solid var(--stroke);
    border-radius: var(--r);
    padding: 12px 16px;
    overflow-x: auto;
    margin: 0 0 1em;
  }
  .markdown-body :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85rem;
  }
  .markdown-body :global(blockquote) {
    border-left: 3px solid var(--stroke);
    margin: 0 0 1em;
    padding: 8px 16px;
    color: var(--muted);
    font-style: italic;
  }
  .markdown-body :global(a) { color: var(--accent); text-decoration: underline; }
  .markdown-body :global(hr) { border: none; border-top: 1px solid var(--stroke); margin: 1.2em 0; }

  /* ── SECTIONS ── */
  .section { margin-top: 32px; }
  .section-label {
    margin: 0 0 16px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 800;
    color: var(--muted);
    padding-bottom: 8px;
    border-bottom: 2px solid var(--stroke);
  }

  /* ── CONNECTIONS ── */
  .conn-link {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 10px 14px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    text-decoration: none;
    color: var(--text);
    margin-bottom: 8px;
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .conn-link:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  .conn-title { font-weight: 600; font-size: 0.92rem; }
  .conn-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-left: auto;
  }

  /* ── RAW DATA ── */
  .raw-data { margin-top: 28px; }
  .raw-data summary {
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .raw-data pre {
    background: var(--surface);
    border: 1px solid var(--stroke);
    border-radius: var(--r);
    padding: 14px;
    font-size: 0.78rem;
    overflow-x: auto;
    margin-top: 8px;
  }

  /* ── GRID (tag view) ── */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .muted { color: var(--muted); }

  /* ── READER VIEW ── */
  .reader {
    margin: 28px 0;
    padding: 28px 32px;
    border: 2px solid var(--stroke);
    border-left: 4px solid var(--article-accent, var(--stroke));
    border-radius: var(--r);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .reader p {
    margin: 0 0 1.4em;
    font-size: 1.05rem;
    line-height: 1.75;
    color: var(--text);
  }
  .reader p:last-child { margin-bottom: 0; }

  .fetch-btn {
    margin-top: 20px;
    padding: 9px 20px;
    background: transparent;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    color: var(--text);
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .fetch-btn:hover { box-shadow: var(--shadow-hover); transform: translate(-1px, -1px); }
  .fetch-btn:active { box-shadow: none; transform: translate(1px, 1px); }
  .fetch-btn:disabled { opacity: 0.5; cursor: default; transform: none !important; box-shadow: none !important; }

  .not-article-row {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  .not-article {
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .paste-btn {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--muted);
    background: transparent;
    border: 1px dashed var(--stroke);
    border-radius: var(--r);
    padding: 3px 10px;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }
  .paste-btn:hover { color: var(--text); border-color: var(--text); border-style: solid; }
  .paste-box { width: 100%; display: flex; flex-direction: column; gap: 8px; }
  .paste-area {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface);
    border: 2px solid var(--accent);
    border-radius: var(--r);
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    line-height: 1.6;
    padding: 10px 12px;
    resize: vertical;
    outline: none;
  }
  .paste-area::placeholder { color: var(--muted); }
  .paste-actions { display: flex; gap: 8px; }

  /* ── VIDEO ── */
  .video-embed {
    margin: 24px 0;
    position: relative;
    height: 0;
    overflow: hidden;
    border-radius: var(--r);
    background: #000;
    border: 2px solid var(--stroke);
  }
  .video-embed.landscape { padding-bottom: 56.25%; }
  .video-embed.portrait  { width: 325px; max-width: 100%; padding-bottom: min(578px, 177%); }
  .video-embed iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    border: 0;
  }

  /* ── META ── */
  .meta-fields { margin: 24px 0; display: flex; flex-direction: column; gap: 14px; }
  .meta-badges { display: flex; gap: 8px; flex-wrap: wrap; }
  .meta-status-badge, .meta-priority-badge {
    padding: 3px 12px;
    border-radius: var(--r);
    border: 2px solid var(--status-color, var(--stroke));
    background: transparent;
    color: var(--status-color, var(--text));
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    outline: none;
  }
  .meta-priority-badge {
    border-color: var(--priority-color, var(--stroke));
    color: var(--priority-color, var(--text));
  }
  .meta-project {
    font-size: 0.82rem;
    color: var(--muted);
    word-break: break-all;
    text-decoration: none;
  }
  .meta-project:hover { color: var(--text); }
  .meta-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 800;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .meta-commit { }
  .meta-commit-hash {
    font-family: monospace;
    font-size: 0.88rem;
    background: var(--surface);
    border: 1px solid var(--stroke);
    border-radius: var(--r);
    padding: 3px 8px;
    cursor: pointer;
    user-select: all;
  }
  .meta-impl-pre {
    background: var(--surface);
    border: 1px solid var(--stroke);
    border-radius: var(--r);
    padding: 14px;
    font-size: 0.85rem;
    line-height: 1.6;
    overflow-x: auto;
    white-space: pre-wrap;
    font-family: inherit;
    margin: 0;
  }
</style>
