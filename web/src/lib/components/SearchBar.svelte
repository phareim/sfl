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
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus { border-color: #1a73e8; }
</style>
