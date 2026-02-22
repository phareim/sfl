<script>
  import { createEventDispatcher } from 'svelte';

  export let value = '';

  const dispatch = createEventDispatcher();

  let timer;

  function onInput(e) {
    value = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => dispatch('search', value), 300);
  }

  function onSubmit(e) {
    e.preventDefault();
    clearTimeout(timer);
    dispatch('search', value);
  }
</script>

<form class="search-bar" on:submit={onSubmit}>
  <input
    type="search"
    placeholder="Search ideas..."
    {value}
    on:input={onInput}
  />
</form>

<style>
  .search-bar { display: flex; }
  input {
    flex: 1;
    padding: 8px 14px;
    border: 2px solid var(--stroke, #252836);
    border-radius: var(--r, 4px);
    background: var(--surface, #13161f);
    color: var(--text, #efefed);
    font-size: 0.9rem;
    outline: none;
    box-shadow: var(--shadow, 3px 3px 0 #1c1f2c);
    transition: border-color 0.1s, box-shadow 0.1s;
  }
  input::placeholder { color: var(--muted, #6b7280); }
  input:focus {
    border-color: var(--accent, #c4f442);
    box-shadow: var(--shadow-hover, 5px 5px 0 #1c1f2c);
  }
</style>
