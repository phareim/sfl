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
  .notes { margin-top: 24px; }
  h4 { margin: 0 0 12px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
  .note {
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 10px;
  }
  .note-body { margin: 0 0 8px; font-size: 0.9rem; white-space: pre-wrap; }
  .actions { display: flex; gap: 8px; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
    resize: vertical;
    margin-bottom: 6px;
  }
  button {
    padding: 5px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  button.danger { color: #d32f2f; border-color: #d32f2f; }
  .add-note { margin-top: 12px; }
</style>
