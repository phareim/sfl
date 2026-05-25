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

async function resolveTag(config, ref) {
  // Accept either an exact id or a title. Title resolution: exact match first,
  // then case-insensitive. Ambiguous case-insensitive matches bail.
  const { tags } = await api(config, '/api/tags');
  const byId = tags.find((t) => t.id === ref);
  if (byId) return byId;
  const exact = tags.find((t) => t.title === ref);
  if (exact) return exact;
  const ci = tags.filter((t) => t.title.toLowerCase() === ref.toLowerCase());
  if (ci.length === 1) return ci[0];
  if (ci.length > 1) {
    throw new Error(`ambiguous tag "${ref}" — matches: ${ci.map((t) => t.title).join(', ')}`);
  }
  throw new Error(`tag "${ref}" not found`);
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

// --- tags commands ---

async function cmdTagsList(config) {
  const { tags } = await api(config, '/api/tags');
  if (!tags.length) {
    console.log('No tags.');
    return;
  }
  const sorted = [...tags].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));
  console.log(`\nTags (${tags.length} total)\n`);
  const idW = 12;
  const countW = 6;
  console.log(`  ${'ID'.padEnd(idW)} ${'COUNT'.padEnd(countW)} TITLE`);
  for (const t of sorted) {
    const id = String(t.id).slice(0, idW).padEnd(idW);
    const count = String(t.usage_count ?? 0).padEnd(countW);
    console.log(`  ${id} ${count} ${t.title}`);
  }
  console.log();
}

async function cmdTagsRename(config, args) {
  const { positional } = parseArgs(args);
  const ref = positional[0];
  const newTitle = positional.slice(1).join(' ');
  if (!ref || !newTitle) {
    console.error('Usage: sfl tags rename <id-or-title> <new-title>');
    process.exit(1);
  }
  const tag = await resolveTag(config, ref);
  const res = await apiPut(config, `/api/tags/${tag.id}`, { title: newTitle });
  console.log(`Renamed: ${tag.title} → ${res.title}`);
}

async function cmdTagsMerge(config, args) {
  const { positional } = parseArgs(args);
  const sourceRef = positional[0];
  const intoRef = positional[1];
  if (!sourceRef || !intoRef) {
    console.error('Usage: sfl tags merge <source-id-or-title> <into-id-or-title>');
    process.exit(1);
  }
  const source = await resolveTag(config, sourceRef);
  const into = await resolveTag(config, intoRef);
  const before = { source: source.usage_count ?? 0, into: into.usage_count ?? 0 };
  const res = await apiPost(config, `/api/tags/${source.id}/merge`, { into: into.id });
  // Re-fetch to confirm new usage count.
  const after = await api(config, '/api/tags');
  const intoAfter = after.tags.find((t) => t.id === into.id);
  console.log(
    `Merged ${source.title} (${before.source}) → ${into.title} (${before.into} → ${intoAfter?.usage_count ?? '?'})`,
  );
  console.log(`  rewired=${res.rewired}  deduped=${res.deduped}`);
}

// --- meta board / stale commands ---

function truncate(s, n) {
  s = String(s ?? '');
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function projectShort(p) {
  if (!p) return '-';
  return String(p)
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '');
}

async function cmdMetaBoard(config) {
  const { ideas } = await api(config, '/api/ideas?type=meta');
  if (!ideas.length) {
    console.log('No meta ideas.');
    return;
  }
  const full = await Promise.all(ideas.map((idea) => api(config, `/api/ideas/${idea.id}`)));

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const byProject = new Map();
  for (const item of full) {
    const project = projectShort(item.data?.project ?? item.idea?.url ?? '(no project)');
    const status = item.data?.status ?? 'draft';
    const updatedAt = item.idea?.updated_at ?? 0;
    if (status === 'done' && updatedAt < now - SEVEN_DAYS_MS) continue;
    if (!byProject.has(project)) {
      byProject.set(project, { draft: [], in_progress: [], done: [], lastUpdated: 0 });
    }
    const bucket = byProject.get(project);
    const col = status === 'in_progress' ? 'in_progress' : status === 'done' ? 'done' : 'draft';
    bucket[col].push({ title: item.idea?.title ?? '(untitled)', updated_at: updatedAt });
    if (updatedAt > bucket.lastUpdated) bucket.lastUpdated = updatedAt;
  }

  const rows = [...byProject.entries()].sort((a, b) => b[1].lastUpdated - a[1].lastUpdated);

  // Layout: 120 cols total → project 28, three columns of 30 each = 118.
  const projW = 28;
  const colW = 30;
  const header = `  ${'PROJECT'.padEnd(projW)} ${'DRAFT'.padEnd(colW)} ${'IN_PROGRESS'.padEnd(colW)} DONE(7d)`;
  console.log(`\nMeta board (${rows.length} projects)\n`);
  console.log(header);
  console.log(`  ${'-'.repeat(projW)} ${'-'.repeat(colW)} ${'-'.repeat(colW)} ${'-'.repeat(colW)}`);

  function renderCell(items) {
    const count = items.length;
    if (count === 0) return '.';
    const sorted = [...items].sort((a, b) => b.updated_at - a.updated_at);
    const top = truncate(sorted[0].title, colW - 6);
    if (count === 1) return `${count}  ${top}`;
    return `${count}  ${top}`;
  }

  for (const [project, bucket] of rows) {
    const p = truncate(project, projW).padEnd(projW);
    const c1 = renderCell(bucket.draft).padEnd(colW);
    const c2 = renderCell(bucket.in_progress).padEnd(colW);
    const c3 = renderCell(bucket.done).padEnd(colW);
    console.log(`  ${p} ${c1} ${c2} ${c3}`);
    // Second line for projects that have a second active title in any column
    const secondLine = ['draft', 'in_progress', 'done'].map((k) => {
      const items = [...bucket[k]].sort((a, b) => b.updated_at - a.updated_at);
      return items.length >= 2 ? truncate(items[1].title, colW - 3) : '';
    });
    if (secondLine.some((s) => s)) {
      console.log(
        `  ${' '.repeat(projW)} ${secondLine[0].padEnd(colW)} ${secondLine[1].padEnd(colW)} ${secondLine[2]}`,
      );
    }
  }
  console.log();
}

async function cmdMetaStale(config, args) {
  const { flags } = parseArgs(args);
  const days = Number(flags.days ?? 30);
  if (!Number.isFinite(days) || days <= 0) {
    console.error('Usage: sfl meta stale [--days N]');
    process.exit(1);
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const { ideas } = await api(config, '/api/ideas?type=meta');
  if (!ideas.length) {
    console.log('nothing stale');
    return;
  }
  const full = await Promise.all(ideas.map((idea) => api(config, `/api/ideas/${idea.id}`)));

  const stale = full
    .filter((item) => {
      const status = item.data?.status ?? 'draft';
      if (status !== 'draft' && status !== 'in_progress') return false;
      const updatedAt = item.idea?.updated_at ?? 0;
      return updatedAt < cutoff;
    })
    .map((item) => ({
      wordly_id: item.data?.wordly_id ?? item.idea?.id?.slice(0, 8) ?? '?',
      project: projectShort(item.data?.project ?? item.idea?.url),
      status: item.data?.status ?? 'draft',
      age_days: Math.floor((Date.now() - (item.idea?.updated_at ?? 0)) / (24 * 60 * 60 * 1000)),
      title: item.idea?.title ?? '(untitled)',
    }))
    .sort((a, b) => b.age_days - a.age_days);

  if (!stale.length) {
    console.log('nothing stale');
    return;
  }

  const idW = 24;
  const projW = 28;
  const statusW = 12;
  for (const row of stale) {
    console.log(
      `  ${truncate(row.wordly_id, idW).padEnd(idW)} ${truncate(row.project, projW).padEnd(projW)} ${row.status.padEnd(statusW)} ${String(row.age_days).padStart(3)}d  ${row.title}`,
    );
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
} else if (cmd === 'meta' && sub === 'board') {
  const config = loadConfig();
  cmdMetaBoard(config).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'meta' && sub === 'stale') {
  const config = loadConfig();
  cmdMetaStale(config, process.argv.slice(4)).catch((err) => {
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
} else if (cmd === 'tags' && (sub === undefined || sub === 'list')) {
  const config = loadConfig();
  cmdTagsList(config).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'tags' && sub === 'rename') {
  const config = loadConfig();
  cmdTagsRename(config, process.argv.slice(4)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else if (cmd === 'tags' && sub === 'merge') {
  const config = loadConfig();
  cmdTagsMerge(config, process.argv.slice(4)).catch((err) => {
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
  console.log('  meta board       Project × status grid (draft / in_progress / done-7d)');
  console.log('  meta stale       List stale draft/in_progress metas [--days N, default 30]');
  console.log('  meta add         Create a new meta idea for the current git project');
  console.log('  meta update <id> Update a meta idea (--title, --priority, --status, --summary)');
  console.log('  tags             List all tags with usage counts (alias: tags list)');
  console.log('  tags rename <ref> <title>  Rename a tag (id or title accepted)');
  console.log('  tags merge <src> <into>    Merge src tag into into tag');
  console.log('  ideas            List ideas [--type TYPE] [--tag TAG] [--limit N] [--status STATUS] [--cursor TS]');
  console.log('  ideas search <q> Full-text search [--type TYPE] [--limit N]');
}
