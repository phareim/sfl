<script>
  import { onMount } from 'svelte';

  let apiUrl = '';
  let apiKey = '';
  let saved = false;

  onMount(() => {
    apiUrl = localStorage.getItem('sfl_api_url') ?? '';
    apiKey = localStorage.getItem('sfl_api_key') ?? '';
  });

  function save() {
    localStorage.setItem('sfl_api_url', apiUrl.trim());
    localStorage.setItem('sfl_api_key', apiKey.trim());
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<h1>Settings</h1>

<form class="settings-form" on:submit|preventDefault={save}>
  <label>
    API URL
    <input
      type="url"
      bind:value={apiUrl}
      placeholder="https://sfl-api.your-worker.workers.dev"
      required
    />
    <span class="hint">The URL of your deployed Cloudflare Worker.</span>
  </label>

  <label>
    API Key
    <input
      type="password"
      bind:value={apiKey}
      placeholder="Your API_KEY secret"
      required
    />
    <span class="hint">Set via <code>wrangler secret put API_KEY</code>.</span>
  </label>

  <button type="submit">{saved ? 'Saved!' : 'Save settings'}</button>
</form>

<style>
  h1 { margin: 0 0 28px; font-size: 1.5rem; }
  .settings-form { max-width: 480px; display: flex; flex-direction: column; gap: 20px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 500; }
  input {
    padding: 9px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus { border-color: #1a73e8; }
  .hint { font-size: 0.78rem; color: #aaa; font-weight: 400; }
  button {
    align-self: flex-start;
    padding: 9px 22px;
    background: #1a73e8;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: #1557b0; }
</style>
