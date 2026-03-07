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

async function cmdMeta(config) {
  const projectUrl = getProjectUrl();

  const ideas = await api(config, `/api/ideas?type=meta&project=${encodeURIComponent(projectUrl)}`);
  if (!ideas.length) {
    console.log(`No meta ideas for ${projectUrl}`);
    return;
  }

  // Fetch full data for each idea in parallel
  const full = await Promise.all(ideas.map((idea) => api(config, `/api/ideas/${idea.id}`)));

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

  for (const idea of full) {
    const pri = (idea.data?.priority ?? '-').padEnd(priW);
    const status = (idea.data?.status ?? '-').padEnd(statusW);
    console.log(`  ${pri} ${status} ${idea.title}`);
  }
  console.log();
}

// --- Dispatch ---

const cmd = process.argv[2];

if (cmd === 'meta') {
  const config = loadConfig();
  cmdMeta(config).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.log('Usage: sfl <command>');
  console.log('');
  console.log('Commands:');
  console.log('  meta    List meta ideas for the current git project');
}
