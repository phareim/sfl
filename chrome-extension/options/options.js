const form = document.getElementById('options-form');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const status = document.getElementById('status');

chrome.storage.sync.get(['sfl_api_url', 'sfl_api_key'], (items) => {
  apiUrlInput.value = items.sfl_api_url ?? '';
  apiKeyInput.value = items.sfl_api_key ?? '';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  chrome.storage.sync.set(
    {
      sfl_api_url: apiUrlInput.value.trim(),
      sfl_api_key: apiKeyInput.value.trim(),
    },
    () => {
      status.textContent = '✓ Saved!';
      setTimeout(() => (status.textContent = ''), 2000);
    }
  );
});
