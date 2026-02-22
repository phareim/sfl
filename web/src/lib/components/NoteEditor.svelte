<script>
  import { createEventDispatcher } from 'svelte';
  import { createNote, updateNote, deleteNote } from '../api/notes.js';

  export let ideaId;
  export let notes = [];

  const dispatch = createEventDispatcher();

  let newBody = '';
  let saving = false;
  let editingId = null;
  let editingBody = '';

  async function addNote() {
    if (!newBody.trim()) return;
    saving = true;
    try {
      const { note } = await createNote(ideaId, { body: newBody });
      notes = [...notes, note];
      newBody = '';
      dispatch('change', notes);
    } finally {
      saving = false;
    }
  }

  async function saveEdit(id) {
    saving = true;
    try {
      const { note } = await updateNote(id, { body: editingBody });
      notes = notes.map((n) => (n.id === id ? note : n));
      editingId = null;
      dispatch('change', notes);
    } finally {
      saving = false;
    }
  }

  async function removeNote(id) {
    await deleteNote(id);
    notes = notes.filter((n) => n.id !== id);
    dispatch('change', notes);
  }

  function startEdit(note) {
    editingId = note.id;
    editingBody = note.body;
  }
</script>

<section class="notes">
  <h4>Notes</h4>
  {#each notes as note (note.id)}
    <div class="note">
      {#if editingId === note.id}
        <textarea bind:value={editingBody} rows="3"></textarea>
        <div class="actions">
          <button on:click={() => saveEdit(note.id)} disabled={saving}>Save</button>
          <button on:click={() => (editingId = null)}>Cancel</button>
        </div>
      {:else}
        <p class="note-body">{note.body}</p>
        <div class="actions">
          <button on:click={() => startEdit(note)}>Edit</button>
          <button class="danger" on:click={() => removeNote(note.id)}>Delete</button>
        </div>
      {/if}
    </div>
  {/each}

  <div class="add-note">
    <textarea bind:value={newBody} placeholder="Add a note..." rows="3"></textarea>
    <button on:click={addNote} disabled={saving || !newBody.trim()}>Add note</button>
  </div>
</section>

<style>
  .notes { margin-top: 32px; }
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
  .note {
    background: var(--surface);
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    padding: 14px;
    margin-bottom: 10px;
    box-shadow: var(--shadow);
  }
  .note-body { margin: 0 0 10px; font-size: 0.9rem; white-space: pre-wrap; line-height: 1.55; }
  .actions { display: flex; gap: 8px; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    background: var(--bg);
    color: var(--text);
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 8px;
    outline: none;
    transition: border-color 0.1s;
  }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--muted); }
  button {
    padding: 5px 12px;
    border: 2px solid var(--stroke);
    border-radius: var(--r);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
    transition: box-shadow 0.1s, transform 0.1s;
    box-shadow: var(--shadow);
  }
  button:hover { box-shadow: var(--shadow-hover); transform: translate(-1px, -1px); }
  button:active { box-shadow: none; transform: translate(1px, 1px); }
  button:disabled { opacity: 0.4; cursor: default; transform: none !important; box-shadow: none !important; }
  button.danger { color: #ef4444; border-color: #ef4444; box-shadow: 2px 2px 0 #ef4444; }
  button.danger:hover { box-shadow: 4px 4px 0 #ef4444; }
  .add-note { margin-top: 14px; }
</style>
