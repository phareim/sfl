#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// --- Config ---

function loadConfig() {
  const url = process.env.SFL_API_URL;
  const key = process.env.SFL_API_KEY;
  if (url && key) return { url, key };

  const configPath = join(homedir(), '.config', 'sfl', 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg.SFL_API_URL && cfg.SFL_API_KEY) return { url: cfg.SFL_API_URL, key: cfg.SFL_API_KEY };
  } catch {}

  console.error('Error: SFL_API_URL and SFL_API_KEY must be set via env vars or ~/.config/sfl/config.json');
  process.exit(1);
}

// --- API client ---

async function api(config, path) {
  const res = await fetch(`${config.url}${path}`, {
    headers: { Authorization: `Bearer ${config.key}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(config, path, body) {
  const res = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPut(config, path, body) {
  const res = await fetch(`${config.url}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- Git detection ---

function getProjectUrl() {
  try {
    const raw = execSync('git remote get-url origin', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
    // Normalize SSH → HTTPS style
    return raw.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  } catch {
    console.error('Error: not inside a git repository (or no remote "origin")');
    process.exit(1);
  }
}

// --- meta command ---

const PRIORITY_ORDER = ['A', 'B', 'C', 'D'];

function priorityRank(p) {
  const i = PRIORITY_ORDER.indexOf(p);
  return i === -1 ? PRIORITY_ORDER.length : i;
}

async function cmdMeta(config, args = []) {
  const { flags } = parseArgs(args);
  const statusFilter = flags.status;

  const projectUrl = getProjectUrl();

  const { ideas } = await api(config, `/api/ideas?type=meta&project=${encodeURIComponent(projectUrl)}`);
  if (!ideas.length) {
    console.log(`No meta ideas for ${projectUrl}`);
    return;
  }

  // Fetch full data for each idea in parallel
  let full = await Promise.all(ideas.map((idea) => api(config, `/api/ideas/${idea.id}`)));

  if (statusFilter === 'all') {
    // no filter
  } else if (statusFilter) {
    full = full.filter((idea) => idea.data?.status === statusFilter);
  } else {
    full = full.filter((idea) => idea.data?.status !== 'done');
  }

  full.sort((a, b) => {
    const pa = priorityRank(a.data?.priority);
    const pb = priorityRank(b.data?.priority);
    return pa - pb;
  });

  const host = projectUrl.replace(/^https?:\/\//, '');
  console.log(`\nMeta ideas for ${host}\n`);

  const priW = 4;
  const statusW = 14;
  console.log(`  ${'PRI'.padEnd(priW)} ${'STATUS'.padEnd(statusW)} TITLE`);

  if (!full.length) {
    console.log('  (none)');
  } else {
    for (const idea of full) {
      const pri = (idea.data?.priority ?? '-').padEnd(priW);
      const status = (idea.data?.status ?? '-').padEnd(statusW);
      console.log(`  ${pri} ${status} ${idea.idea.title}`);
    }
  }
  console.log();
}

// --- meta all command ---

async function cmdMetaAll(config, args = []) {
  const { flags } = parseArgs(args);
  const statusFilter = flags.status;

  const { ideas } = await api(config, `/api/ideas?type=meta`);
  if (!ideas.length) {
    console.log('No meta ideas found.');
    return;
  }

  let full = await Promise.all(ideas.map((idea) => api(config, `/api/ideas/${idea.id}`)));

  if (statusFilter === 'all') {
    // no filter
  } else if (statusFilter) {
    full = full.filter((idea) => idea.data?.status === statusFilter);
  } else {
    full = full.filter((idea) => idea.data?.status !== 'done');
  }

  full.sort((a, b) => {
    const pa = (a.data?.project ?? '').localeCompare(b.data?.project ?? '');
    if (pa !== 0) return pa;
    return priorityRank(a.data?.priority) - priorityRank(b.data?.priority);
  });

  console.log('\nAll meta ideas\n');

  const priW = 4;
  const statusW = 14;
  const projW = 30;
  console.log(`  ${'PRI'.padEnd(priW)} ${'STATUS'.padEnd(statusW)} ${'PROJECT'.padEnd(projW)} TITLE`);

  if (!full.length) {
    console.log('  (none)');
  } else {
    for (const idea of full) {
      const pri = (idea.data?.priority ?? '-').padEnd(priW);
      const status = (idea.data?.status ?? '-').padEnd(statusW);
      const rawProj = idea.data?.project ?? '-';
      const proj = rawProj.replace(/^https?:\/\//, '').padEnd(projW);
      console.log(`  ${pri} ${status} ${proj} ${idea.idea.title}`);
    }
  }
  console.log();
}

// --- meta add command ---

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1];
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  return { flags, positional };
}

async function cmdMetaAdd(config, args) {
  const { flags, positional } = parseArgs(args);
  const title = positional.join(' ');
  if (!title) {
    console.error(
      'Usage: sfl meta add <title> [--priority A|B|C|D] [--status draft|in_progress|done] [--summary <text>]',
    );
    process.exit(1);
  }

  const projectUrl = getProjectUrl();
  const data = { project: projectUrl };
  if (flags.priority) data.priority = flags.priority.toUpperCase();
  if (flags.status) data.status = flags.status;

  const { idea } = await apiPost(config, '/api/ideas', {
    type: 'meta',
    title,
    summary: flags.summary,
    data,
  });

  console.log(`Created: [${idea.id}] ${idea.title}`);
}

// --- meta update command ---

async function cmdMetaUpdate(config, args) {
  const { flags, positional } = parseArgs(args);
  const id = positional[0];
  if (!id) {
    console.error(
      'Usage: sfl meta update <id> [--title <text>] [--priority A|B|C|D] [--status draft|in_progress|done] [--summary <text>]',
    );
    process.exit(1);
  }

  // Fetch existing idea to merge data
  const existing = await api(config, `/api/ideas/${id}`);

  const body = {};
  if (flags.title) body.title = flags.title;
  if (flags.summary) body.summary = flags.summary;

  const dataPatch = {};
  if (flags.priority) dataPatch.priority = flags.priority.toUpperCase();
  if (flags.status) dataPatch.status = flags.status;

  if (Object.keys(dataPatch).length > 0) {
    body.data = { ...existing.data, ...dataPatch };
  }

  if (Object.keys(body).length === 0) {
    console.error('Nothing to update. Provide at least one flag.');
    process.exit(1);
  }

  const result = await apiPut(config, `/api/ideas/${id}`, body);
  console.log(`Updated: [${result.idea.id}] ${result.idea.title}`);
  if (result.data?.priority || result.data?.status) {
    console.log(`  priority=${result.data.priority ?? '-'}  status=${result.data.status ?? '-'}`);
  }
}

// --- ideas command ---

async function cmdIdeas(config, args = []) {
  const { flags } = parseArgs(args);
  const limit = flags.limit ?? '20';
  const type = flags.type;
  const tag = flags.tag;
  const cursor = flags.cursor;
  const statusFilter = flags.status;

  let path = `/api/ideas?limit=${limit}`;
  if (type) path += `&type=${encodeURIComponent(type)}`;
  if (tag) path += `&tag=${encodeURIComponent(tag)}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

  const { ideas } = await api(config, path);
  if (!ideas.length) {
    console.log('No ideas found.');
    return;
  }

  let filtered = ideas;
  if (statusFilter) {
    filtered = ideas.filter((idea) => idea.status === statusFilter);
  }

  console.log('\nIdeas\n');
  const idW = 9;
  const typeW = 10;
  console.log(`  ${'ID'.padEnd(idW)} ${'TYPE'.padEnd(typeW)} TITLE`);

  if (!filtered.length) {
    console.log('  (none)');
  } else {
    for (const idea of filtered) {
      const id = idea.id.slice(0, 8).padEnd(idW);
      const t = (idea.type ?? '-').padEnd(typeW);
      const title = idea.title ?? idea.url ?? '(untitled)';
      console.log(`  ${id} ${t} ${title}`);
    }
  }
  console.log();
}

async function cmdIdeasSearch(config, args = []) {
  const { flags, positional } = parseArgs(args);
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: sfl ideas search <query> [--type TYPE] [--limit N]');
    process.exit(1);
  }

  const limit = flags.limit ?? '20';
  const type = flags.type;

  let path = `/api/ideas/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  if (type) path += `&type=${encodeURIComponent(type)}`;

  const { ideas } = await api(config, path);
  if (!ideas.length) {
    console.log(`No results for "${query}".`);
    return;
  }

  console.log(`\nSearch: "${query}"\n`);
  const idW = 9;
  const typeW = 10;
  console.log(`  ${'ID'.padEnd(idW)} ${'TYPE'.padEnd(typeW)} TITLE`);

  for (const idea of ideas) {
    const id = idea.id.slice(0, 8).padEnd(idW);
    const t = (idea.type ?? '-').padEnd(typeW);
    const title = idea.title ?? idea.url ?? '(untitled)';
    console.log(`  ${id} ${t} ${title}`);
  }
  console.log();
}

// --- Dispatch ---

const cmd = process.argv[2];
const sub = process.argv[3];

if (cmd === 'meta' && sub === 'all') {
  const config = loadConfig();
  cmdMetaAll(config, process.argv.slice(4)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'meta' && sub === 'add') {
  const config = loadConfig();
  cmdMetaAdd(config, process.argv.slice(4)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'meta' && sub === 'update') {
  const config = loadConfig();
  cmdMetaUpdate(config, process.argv.slice(4)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'meta') {
  const config = loadConfig();
  cmdMeta(config, process.argv.slice(3)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'ideas' && sub === 'search') {
  const config = loadConfig();
  cmdIdeasSearch(config, process.argv.slice(4)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'ideas') {
  const config = loadConfig();
  cmdIdeas(config, process.argv.slice(3)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.log('Usage: sfl <command>');
  console.log('');
  console.log('Commands:');
  console.log('  meta             List meta ideas for the current git project');
  console.log('  meta all         List all meta ideas across all projects');
  console.log('  meta add         Create a new meta idea for the current git project');
  console.log('  meta update <id> Update a meta idea (--title, --priority, --status, --summary)');
  console.log('  ideas            List ideas [--type TYPE] [--tag TAG] [--limit N] [--status STATUS] [--cursor TS]');
  console.log('  ideas search <q> Full-text search [--type TYPE] [--limit N]');
}
