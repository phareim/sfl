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
  h1 { margin: 0 0 28px; font-size: 1.5rem; font-weight: 800; }
  .settings-form { max-width: 480px; display: flex; flex-direction: column; gap: 20px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; font-weight: 600; }
  input {
    padding: 9px 12px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    background: var(--surface);
    color: var(--text);
    font-size: 0.9rem;
    outline: none;
    box-shadow: var(--shadow);
    transition: border-color 0.1s;
  }
  input:focus { border-color: var(--accent); }
  input::placeholder { color: var(--muted); }
  .hint { font-size: 0.78rem; color: var(--muted); font-weight: 400; }
  button {
    align-self: flex-start;
    padding: 9px 22px;
    background: var(--accent);
    color: #0b0d14;
    border: none;
    border-radius: var(--r);
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow);
    transition: box-shadow 0.1s, transform 0.1s;
  }
  button:hover {
    box-shadow: var(--shadow-hover);
    transform: translate(-1px, -1px);
  }
  button:active {
    box-shadow: 1px 1px 0 #1c1f2c;
    transform: translate(1px, 1px);
  }
</style>
