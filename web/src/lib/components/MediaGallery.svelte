<script>
  import { createEventDispatcher } from 'svelte';
  import { uploadMedia, deleteMedia } from '../api/media.js';

  export let ideaId;
  export let items = [];

  const dispatch = createEventDispatcher();

  let uploading = false;

  function mediaUrl(item) {
    const apiUrl = (localStorage.getItem('sfl_api_url') ?? '').replace(/\/$/, '');
    const apiKey = localStorage.getItem('sfl_api_key') ?? '';
    return `${apiUrl}/api/media/${item.id}/url`;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('sfl_api_key') ?? ''}` };
  }

  async function onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    uploading = true;
    try {
      const { media } = await uploadMedia(ideaId, file);
      items = [...items, media];
      dispatch('change', items);
    } finally {
      uploading = false;
      e.target.value = '';
    }
  }

  async function remove(id) {
    await deleteMedia(id);
    items = items.filter((m) => m.id !== id);
    dispatch('change', items);
  }

  function isImage(mime) {
    return mime.startsWith('image/');
  }
</script>

<section class="gallery">
  <h4>Media</h4>
  <div class="grid">
    {#each items as item (item.id)}
      <div class="item">
        {#if isImage(item.mime_type)}
          <img src={mediaUrl(item)} alt={item.filename} loading="lazy" />
        {:else}
          <div class="file-icon">📄</div>
        {/if}
        <p class="filename">{item.filename}</p>
        <button class="remove" on:click={() => remove(item.id)}>×</button>
      </div>
    {/each}
  </div>
  <label class="upload-btn" class:busy={uploading}>
    {uploading ? 'Uploading…' : '+ Upload file'}
    <input type="file" on:change={onFileChange} disabled={uploading} hidden />
  </label>
</section>

<style>
  .gallery { margin-top: 32px; }
  h4 {
    margin: 0 0 14px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 800;
    color: var(--muted);
    padding-bottom: 8px;
    border-bottom: 2px solid var(--stroke);
  }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
  .item {
    position: relative;
    width: 120px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    overflow: hidden;
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .item:hover { box-shadow: var(--shadow-hover); transform: translate(-1px, -1px); }
  .item img { width: 100%; height: 90px; object-fit: cover; display: block; }
  .file-icon {
    display: flex; align-items: center; justify-content: center;
    height: 90px; font-size: 2rem;
    color: var(--muted);
  }
  .filename {
    margin: 0;
    padding: 5px 7px;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-top: 1px solid var(--stroke);
  }
  .remove {
    position: absolute;
    top: 4px; right: 4px;
    background: var(--bg);
    color: #ef4444;
    border: 1px solid #ef4444;
    border-radius: var(--r);
    width: 20px; height: 20px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .item:hover .remove { opacity: 1; }
  .upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: transparent;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text);
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .upload-btn:hover { box-shadow: var(--shadow-hover); transform: translate(-1px, -1px); }
  .upload-btn:active { box-shadow: none; transform: translate(1px, 1px); }
  .upload-btn.busy { opacity: 0.5; cursor: default; transform: none !important; box-shadow: none !important; }
</style>
