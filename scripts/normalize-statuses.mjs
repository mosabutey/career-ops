#!/usr/bin/env node
/**
 * normalize-statuses.mjs -- Clean non-canonical states in applications.md
 *
 * Maps all non-canonical statuses to the canonical ones from states.yml.
 * Also supports legacy tracker values for backward compatibility.
 *
 * Also strips markdown bold (**) and dates from the status field,
 * moving duplicate/repost info to the notes column.
 *
 * Run: node scripts/normalize-statuses.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStatusLabel } from './tracker-contract.mjs';

const CAREER_OPS = fileURLToPath(new URL('..', import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original)
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const DRY_RUN = process.argv.includes('--dry-run');

function normalizeStatus(raw) {
  const cleaned = raw.replace(/\*\*/g, '').trim();

  if (/^(duplicate|duplicado|dup|repost)/i.test(cleaned)) {
    return { status: 'Discarded', moveToNotes: raw.trim() };
  }

  if (cleaned === '—' || cleaned === 'â€”' || cleaned === '-' || cleaned === '') {
    return { status: 'Discarded' };
  }

  const normalized = normalizeStatusLabel(raw);
  if (normalized) {
    return { status: normalized };
  }

  return { status: null, unknown: true };
}

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to normalize.');
  process.exit(0);
}

const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

let changes = 0;
const unknowns = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const parts = line.split('|').map(s => s.trim());
  // Format: ['', '#', 'date', 'company', 'role', 'score', 'status', 'pdf', 'report', 'notes', '']
  if (parts.length < 9) continue;
  if (parts[1] === '#' || parts[1] === '---' || parts[1] === '') continue;

  const num = parseInt(parts[1], 10);
  if (Number.isNaN(num)) continue;

  const rawStatus = parts[6];
  const result = normalizeStatus(rawStatus);

  if (result.unknown) {
    unknowns.push({ num, rawStatus, line: i + 1 });
    continue;
  }

  if (result.status === rawStatus) continue;

  const oldStatus = rawStatus;
  parts[6] = result.status;

  if (result.moveToNotes && parts[9]) {
    const existing = parts[9] || '';
    if (!existing.includes(result.moveToNotes)) {
      parts[9] = result.moveToNotes + (existing ? '. ' + existing : '');
    }
  } else if (result.moveToNotes && !parts[9]) {
    parts[9] = result.moveToNotes;
  }

  if (parts[5]) {
    parts[5] = parts[5].replace(/\*\*/g, '');
  }

  lines[i] = '| ' + parts.slice(1, -1).join(' | ') + ' |';
  changes++;

  console.log(`#${num}: "${oldStatus}" -> "${result.status}"`);
}

if (unknowns.length > 0) {
  console.log(`\nWarning: ${unknowns.length} unknown statuses:`);
  for (const unknown of unknowns) {
    console.log(`  #${unknown.num} (line ${unknown.line}): "${unknown.rawStatus}"`);
  }
}

console.log(`\n${changes} statuses normalized`);

if (!DRY_RUN && changes > 0) {
  copyFileSync(APPS_FILE, APPS_FILE + '.bak');
  writeFileSync(APPS_FILE, lines.join('\n'));
  console.log('Written to applications.md (backup: applications.md.bak)');
} else if (DRY_RUN) {
  console.log('(dry-run - no changes written)');
} else {
  console.log('No changes needed');
}
