#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const LOCAL_ONLY_PATH_RULES = [
  { regex: /^cv\.md$/i, reason: 'personal CV' },
  { regex: /^config\/profile\.yml$/i, reason: 'local profile data' },
  { regex: /^modes\/_profile\.md$/i, reason: 'local narrative and strategy' },
  { regex: /^article-digest\.md$/i, reason: 'local proof points' },
  { regex: /^portals\.yml$/i, reason: 'local portal configuration' },
  { regex: /^data\/(?!\.gitkeep$).+/i, reason: 'user tracker or pipeline data' },
  { regex: /^reports\/(?!\.gitkeep$).+/i, reason: 'local evaluation reports' },
  { regex: /^output\/(?!\.gitkeep$).+/i, reason: 'generated local outputs' },
  { regex: /^jds\/(?!\.gitkeep$).+/i, reason: 'saved job descriptions' },
  { regex: /^batch\/tracker-additions\/(?!\.gitkeep$).+\.tsv$/i, reason: 'tracker addition artifacts' },
  { regex: /^batch\/tracker-additions\/merged\/(?!\.gitkeep$).+\.tsv$/i, reason: 'merged tracker artifacts' },
  { regex: /^\.career-ops-local\//i, reason: 'private operator layer' },
  { regex: /^\.env(\..+)?$/i, reason: 'environment secrets' },
  { regex: /^playwright\/\.auth\//i, reason: 'browser auth artifacts' },
  { regex: /^storage-state.*\.json$/i, reason: 'browser storage-state artifact' },
  { regex: /^.+\.har$/i, reason: 'network capture artifact' },
];

const CONTENT_RULES = [
  {
    regex: /(?:^|[^A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|icloud)\.com(?:[^A-Za-z0-9._%+-]|$)/i,
    reason: 'personal webmail address',
  },
  {
    regex: /C:\\Users\\|C:\/Users\/|\/Users\/|\/home\//,
    reason: 'local absolute filesystem path',
    allowPaths: [/^scripts\/test-all\.mjs$/i],
  },
];

function runGit(command) {
  const parts = command.split(' ').filter(Boolean);
  return execFileSync('git', parts, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function listPaths(command) {
  const output = runGit(command);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function normalize(path) {
  return path.replace(/\\/g, '/');
}

function matchesLocalOnly(path) {
  const normalized = normalize(path);
  return LOCAL_ONLY_PATH_RULES.find((rule) => rule.regex.test(normalized)) || null;
}

function isProbablyText(path) {
  const lower = path.toLowerCase();
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.woff2', '.woff', '.mov', '.mp4', '.ico'];
  return !binaryExts.some((ext) => lower.endsWith(ext));
}

function scanContent(path) {
  const fullPath = join(ROOT, path);
  if (!existsSync(fullPath) || !isProbablyText(path)) return [];

  let content = '';
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    return [];
  }

  return CONTENT_RULES
    .filter((rule) => {
      if (rule.allowPaths?.some((allowed) => allowed.test(path))) return false;
      return rule.regex.test(content);
    })
    .map((rule) => rule.reason);
}

function walkFiles(dir, prefix = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = normalize(prefix ? `${prefix}/${entry.name}` : entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      files.push(...walkFiles(join(dir, entry.name), relativePath));
      continue;
    }

    if (!statSync(join(dir, entry.name)).isFile()) continue;
    files.push(relativePath);
  }

  return files;
}

function main() {
  let tracked = [];
  let untracked = [];
  let usedFallback = false;

  try {
    tracked = listPaths('ls-files');
    untracked = listPaths('ls-files --others --exclude-standard');
  } catch {
    usedFallback = true;
    const allFiles = walkFiles(ROOT);
    tracked = allFiles.filter((path) => !matchesLocalOnly(path));
    untracked = allFiles.filter((path) => matchesLocalOnly(path));
  }

  const failures = [];
  const warnings = [];
  const warningCounts = new Map();

  for (const path of tracked) {
    const match = matchesLocalOnly(path);
    if (match) {
      failures.push(`Tracked local-only path: ${path} (${match.reason})`);
    }
    for (const reason of scanContent(path)) {
      failures.push(`Sensitive content pattern in tracked file: ${path} (${reason})`);
    }
  }

  for (const path of untracked) {
    const match = matchesLocalOnly(path);
    if (match) {
      const key = `${match.reason}`;
      warningCounts.set(key, (warningCounts.get(key) || 0) + 1);
    }
  }

  if (usedFallback) {
    warnings.push('Git subprocess unavailable; privacy-check used filesystem fallback mode.');
  }

  for (const [reason, count] of warningCounts.entries()) {
    warnings.push(`Local-only files present in worktree: ${count} (${reason})`);
  }

  if (failures.length === 0 && warnings.length === 0) {
    console.log('privacy-check: PASS');
    process.exit(0);
  }

  if (failures.length) {
    console.log('privacy-check: FAIL');
    for (const failure of failures) console.log(`- ${failure}`);
  } else {
    console.log('privacy-check: WARN');
  }

  if (warnings.length) {
    console.log('Warnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  process.exit(failures.length ? 1 : 0);
}

main();
