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
    padding: 2px 8px;
    border-radius: var(--r, 4px);
    background: transparent;
    color: var(--muted, #6b7280);
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid var(--stroke, #252836);
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }
  .tag-pill:hover {
    color: var(--accent, #c4f442);
    border-color: var(--accent, #c4f442);
  }
</style>
