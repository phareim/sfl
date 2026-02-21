import { writable } from 'svelte/store';

export const graphStore = writable({ nodes: [], edges: [], loading: false, error: null });
