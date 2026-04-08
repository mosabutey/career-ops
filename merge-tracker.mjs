#!/usr/bin/env node
/**
 * merge-tracker.mjs -- Merge batch tracker additions into applications.md
 *
 * Handles multiple TSV formats:
 * - 9-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes
 * - 8-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport
 * - Pipe-delimited markdown rows
 *
 * Dedup: company normalized + role fuzzy match + report number match.
 * If duplicate with higher score -> update in place, update report link.
 *
 * Run: node career-ops/merge-tracker.mjs [--dry-run] [--verify]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CANONICAL_STATUS_LABELS,
  looksLikeScore,
  looksLikeStatus,
  normalizeStatusLabel,
} from './tracker-contract.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const ADDITIONS_DIR = join(CAREER_OPS, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

function validateStatus(status) {
  const normalized = normalizeStatusLabel(status);
  if (normalized) return normalized;

  console.warn(`Warning: non-canonical status "${status}" -> defaulting to "Evaluated"`);
  return 'Evaluated';
}

function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function roleFuzzyMatch(a, b) {
  const wordsA = a.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const wordsB = b.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const overlap = wordsA.filter(word => wordsB.some(other => other.includes(word) || word.includes(other)));
  return overlap.length >= 2;
}

function extractReportNum(reportStr) {
  const match = reportStr.match(/\[(\d+)\]/);
  return match ? parseInt(match[1], 10) : null;
}

function parseScore(score) {
  const match = score.replace(/\*\*/g, '').match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function parseAppLine(line) {
  const parts = line.split('|').map(part => part.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1], 10);
  if (Number.isNaN(num) || num === 0) return null;

  return {
    num,
    date: parts[2],
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
    pdf: parts[7],
    report: parts[8],
    notes: parts[9] || '',
    raw: line,
  };
}

function parseTsvContent(content, filename) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  let parts;
  let addition;

  if (trimmed.startsWith('|')) {
    parts = trimmed.split('|').map(part => part.trim()).filter(Boolean);
    if (parts.length < 8) {
      console.warn(`Warning: skipping malformed pipe-delimited ${filename}: ${parts.length} fields`);
      return null;
    }

    addition = {
      num: parseInt(parts[0], 10),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      score: parts[4],
      status: validateStatus(parts[5]),
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  } else {
    parts = trimmed.split('\t');
    if (parts.length < 8) {
      console.warn(`Warning: skipping malformed TSV ${filename}: ${parts.length} fields`);
      return null;
    }

    const col4 = parts[4].trim();
    const col5 = parts[5].trim();
    const col4LooksLikeScore = looksLikeScore(col4);
    const col5LooksLikeScore = looksLikeScore(col5);
    const col4LooksLikeStatus = looksLikeStatus(col4);
    const col5LooksLikeStatus = looksLikeStatus(col5);

    let statusCol;
    let scoreCol;

    if (col4LooksLikeStatus && !col4LooksLikeScore) {
      statusCol = col4;
      scoreCol = col5;
    } else if (col4LooksLikeScore && col5LooksLikeStatus) {
      statusCol = col5;
      scoreCol = col4;
    } else if (col5LooksLikeScore && !col4LooksLikeScore) {
      statusCol = col4;
      scoreCol = col5;
    } else {
      statusCol = col4;
      scoreCol = col5;
    }

    addition = {
      num: parseInt(parts[0], 10),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      status: validateStatus(statusCol),
      score: scoreCol,
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  }

  if (Number.isNaN(addition.num) || addition.num === 0) {
    console.warn(`Warning: skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to merge into.');
  process.exit(0);
}

const appContent = readFileSync(APPS_FILE, 'utf-8');
const appLines = appContent.split('\n');
const existingApps = [];
let maxNum = 0;

for (const line of appLines) {
  if (!line.startsWith('|') || line.includes('---')) continue;
  const app = parseAppLine(line);
  if (!app) continue;
  existingApps.push(app);
  if (app.num > maxNum) maxNum = app.num;
}

console.log(`Existing: ${existingApps.length} entries, max #${maxNum}`);

if (!existsSync(ADDITIONS_DIR)) {
  console.log('No tracker-additions directory found.');
  process.exit(0);
}

const tsvFiles = readdirSync(ADDITIONS_DIR).filter(file => file.endsWith('.tsv'));
if (tsvFiles.length === 0) {
  console.log('No pending additions to merge.');
  process.exit(0);
}

tsvFiles.sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
  return numA - numB;
});

console.log(`Found ${tsvFiles.length} pending additions`);

let added = 0;
let updated = 0;
let skipped = 0;
const newLines = [];

for (const file of tsvFiles) {
  const content = readFileSync(join(ADDITIONS_DIR, file), 'utf-8').trim();
  const addition = parseTsvContent(content, file);
  if (!addition) {
    skipped++;
    continue;
  }

  const reportNum = extractReportNum(addition.report);
  let duplicate = null;

  if (reportNum) {
    duplicate = existingApps.find(app => extractReportNum(app.report) === reportNum);
  }

  if (!duplicate) {
    duplicate = existingApps.find(app => app.num === addition.num);
  }

  if (!duplicate) {
    const normalizedCompany = normalizeCompany(addition.company);
    duplicate = existingApps.find(app => {
      if (normalizeCompany(app.company) !== normalizedCompany) return false;
      return roleFuzzyMatch(addition.role, app.role);
    });
  }

  if (duplicate) {
    const newScore = parseScore(addition.score);
    const oldScore = parseScore(duplicate.score);

    if (newScore > oldScore) {
      console.log(`Update: #${duplicate.num} ${addition.company} -- ${addition.role} (${oldScore}->${newScore})`);
      const lineIdx = appLines.indexOf(duplicate.raw);
      if (lineIdx >= 0) {
        const updatedStatus = validateStatus(duplicate.status);
        appLines[lineIdx] = `| ${duplicate.num} | ${addition.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${updatedStatus} | ${duplicate.pdf} | ${addition.report} | Re-eval ${addition.date} (${oldScore}->${newScore}). ${addition.notes} |`;
        updated++;
      }
    } else {
      console.log(`Skip: ${addition.company} -- ${addition.role} (existing #${duplicate.num} ${oldScore} >= new ${newScore})`);
      skipped++;
    }
    continue;
  }

  const entryNum = addition.num > maxNum ? addition.num : ++maxNum;
  if (addition.num > maxNum) maxNum = addition.num;

  const canonicalStatus = CANONICAL_STATUS_LABELS.includes(addition.status)
    ? addition.status
    : validateStatus(addition.status);

  newLines.push(`| ${entryNum} | ${addition.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${canonicalStatus} | ${addition.pdf} | ${addition.report} | ${addition.notes} |`);
  added++;
  console.log(`Add #${entryNum}: ${addition.company} -- ${addition.role} (${addition.score})`);
}

if (newLines.length > 0) {
  let insertIdx = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (appLines[i].includes('---') && appLines[i].startsWith('|')) {
      insertIdx = i + 1;
      break;
    }
  }

  if (insertIdx >= 0) {
    appLines.splice(insertIdx, 0, ...newLines);
  }
}

if (!DRY_RUN) {
  writeFileSync(APPS_FILE, appLines.join('\n'));

  if (!existsSync(MERGED_DIR)) mkdirSync(MERGED_DIR, { recursive: true });
  for (const file of tsvFiles) {
    renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
  }
  console.log(`\nMoved ${tsvFiles.length} TSVs to merged/`);
}

console.log(`\nSummary: +${added} added, ${updated} updated, ${skipped} skipped`);
if (DRY_RUN) console.log('(dry-run - no changes written)');

if (VERIFY && !DRY_RUN) {
  console.log('\n--- Running verification ---');
  const { execSync } = await import('child_process');
  try {
    execSync(`node ${join(CAREER_OPS, 'verify-pipeline.mjs')}`, { stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}
