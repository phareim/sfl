<script>
  export let tag;
  export let onClick = null;
</script>

<button
  type="button"
  class="tag-pill"
  on:click={() => onClick && onClick(tag)}
>
  #{tag.title ?? tag.id}
</button>

<style>
  .tag-pill {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: #e8f0fe;
    color: #1a73e8;
    font-size: 0.78rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  .tag-pill:hover {
    background: #d2e3fc;
  }
</style>
