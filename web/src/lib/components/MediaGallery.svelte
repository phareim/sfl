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
  <label class="upload-btn">
    {uploading ? 'Uploading...' : '+ Upload file'}
    <input type="file" on:change={onFileChange} disabled={uploading} hidden />
  </label>
</section>

<style>
  .gallery { margin-top: 24px; }
  h4 { margin: 0 0 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  .item {
    position: relative;
    width: 120px;
    border: 1px solid #eee;
    border-radius: 6px;
    overflow: hidden;
    background: #f5f5f5;
  }
  .item img { width: 100%; height: 90px; object-fit: cover; display: block; }
  .file-icon { display: flex; align-items: center; justify-content: center; height: 90px; font-size: 2rem; }
  .filename { margin: 0; padding: 4px 6px; font-size: 0.7rem; color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .remove {
    position: absolute;
    top: 4px; right: 4px;
    background: rgba(0,0,0,0.5);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 20px; height: 20px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .upload-btn {
    display: inline-block;
    padding: 6px 14px;
    background: #f0f0f0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    border: 1px dashed #ccc;
  }
  .upload-btn:hover { background: #e8e8e8; }
</style>
