import { writable } from 'svelte/store';

export const ideasStore = writable({ ideas: [], nextCursor: null, loading: false, error: null });
