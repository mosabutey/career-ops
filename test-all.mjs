#!/usr/bin/env node

/**
 * Comprehensive test suite for career-ops.
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs
 *   node test-all.mjs --quick
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  [OK] ${msg}`); passed++; }
function fail(msg) { console.log(`  [FAIL] ${msg}`); failed++; }
function warn(msg) { console.log(`  [WARN] ${msg}`); warnings++; }

function runProcess(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30000,
    shell: false,
    windowsHide: true,
    ...opts,
  });
  const blocked = Boolean(result.error && /EPERM/i.test(result.error.message || ''));
  return { ...result, blocked };
}

function runNode(args, opts = {}) {
  return runProcess(process.execPath, args, opts);
}

function fileExists(path) {
  return existsSync(join(ROOT, path));
}

function readFile(path) {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function walkFiles(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = join(dir, entry.name);
    const relPath = relative(ROOT, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }
    results.push({ fullPath, relPath });
  }
  return results;
}

function allowedByPath(relPath, allowedList) {
  return allowedList.some(allowed => relPath === allowed || relPath.startsWith(`${allowed}/`));
}

console.log('\ncareer-ops test suite\n');

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT)
  .filter(file => file.endsWith('.mjs'))
  .sort();

for (const file of mjsFiles) {
  const result = runNode(['--check', file]);
  if (result.blocked) {
    warn(`Subprocess syntax check skipped for ${file} (restricted environment)`);
  } else if (result.status === 0) {
    pass(`${file} syntax OK`);
  } else {
    fail(`${file} has syntax errors`);
  }
}

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { args: ['cv-sync-check.mjs'], expectExit: 1, allowFail: true },
  { args: ['verify-pipeline.mjs'], expectExit: 0 },
  { args: ['normalize-statuses.mjs', '--dry-run'], expectExit: 0 },
  { args: ['dedup-tracker.mjs', '--dry-run'], expectExit: 0 },
  { args: ['merge-tracker.mjs', '--dry-run'], expectExit: 0 },
  { args: ['update-system.mjs', 'check'], expectExit: 0 },
];

for (const { args, expectExit, allowFail } of scripts) {
  const result = runNode(args);
  const name = args.join(' ');
  if (result.blocked) {
    warn(`${name} subprocess check skipped (restricted environment)`);
  } else if (result.status === expectExit) {
    pass(`${name} runs OK`);
  } else if (allowFail && result.status !== 0) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

if (!QUICK) {
  console.log('\n3. Dashboard build');
  const outputName = process.platform === 'win32' ? 'career-dashboard-test.exe' : 'career-dashboard-test';
  const outputPath = join(ROOT, 'dashboard', outputName);
  const goBuild = runProcess('go', ['build', '-o', outputPath, '.'], {
    cwd: join(ROOT, 'dashboard'),
    timeout: 60000,
  });
  if (goBuild.blocked) {
    warn('Dashboard build skipped (restricted environment)');
  } else if (goBuild.status === 0) {
    pass('Dashboard compiles');
    if (existsSync(outputPath)) unlinkSync(outputPath);
  } else {
    fail('Dashboard build failed');
  }
} else {
  console.log('\n3. Dashboard build (skipped --quick)');
}

console.log('\n4. Data contract validation');

const systemFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'VERSION',
  'DATA_CONTRACT.md',
  'tracker-contract.mjs',
  'modes/_shared.md',
  'modes/_profile.template.md',
  'modes/evaluate.md',
  'modes/compare.md',
  'modes/contact.md',
  'modes/oferta.md',
  'modes/pdf.md',
  'modes/scan.md',
  'templates/states.yml',
  'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
  '.agents/skills/career-ops/SKILL.md',
];

for (const file of systemFiles) {
  if (fileExists(file)) {
    pass(`System file exists: ${file}`);
  } else {
    fail(`Missing system file: ${file}`);
  }
}

const userFiles = [
  'config/profile.yml',
  'modes/_profile.md',
  'portals.yml',
];

for (const file of userFiles) {
  const tracked = runProcess('git', ['ls-files', '--error-unmatch', file]);
  if (tracked.status === 0) {
    fail(`User file IS tracked (should be gitignored): ${file}`);
  } else {
    pass(`User file gitignored: ${file}`);
  }
}

console.log('\n5. Personal data leak check');

const leakPatterns = [
  'Santiago',
  'santifer.io',
  'Santifer iRepair',
  'Zinkee',
  'ALMAS',
  'hi@santifer.io',
  '688921377',
  '/Users/santifer/',
];
const scanExtensions = new Set(['.md', '.yml', '.html', '.mjs', '.sh', '.go', '.json']);
const allowedLeakPaths = [
  'README.md',
  'README.es.md',
  'LICENSE',
  'CITATION.cff',
  'CONTRIBUTING.md',
  'package.json',
  '.github/FUNDING.yml',
  'CLAUDE.md',
  'AGENTS.md',
  'test-all.mjs',
  '.github/ISSUE_TEMPLATE',
  'dashboard/internal/ui/screens/pipeline.go',
];

let leakFound = false;
for (const { fullPath, relPath } of walkFiles(ROOT)) {
  if (!scanExtensions.has(extname(relPath))) continue;
  if (allowedByPath(relPath, allowedLeakPaths) || relPath === 'dashboard/go.sum') continue;
  const content = readFileSync(fullPath, 'utf-8');
  for (const pattern of leakPatterns) {
    if (content.includes(pattern)) {
      warn(`Possible personal data in ${relPath}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

console.log('\n6. Absolute path check');

const absPathExtensions = new Set(['.mjs', '.sh', '.md', '.go', '.yml']);
const allowedPathRefs = [
  'README.md',
  'LICENSE',
  'CLAUDE.md',
  'AGENTS.md',
  'test-all.mjs',
];

let absPathFound = false;
for (const { fullPath, relPath } of walkFiles(ROOT)) {
  if (!absPathExtensions.has(extname(relPath))) continue;
  if (allowedByPath(relPath, allowedPathRefs) || relPath === 'dashboard/go.sum') continue;
  const content = readFileSync(fullPath, 'utf-8');
  if (content.includes('/Users/') || content.includes('C:\\Users\\')) {
    fail(`Absolute path found in ${relPath}`);
    absPathFound = true;
  }
}
if (!absPathFound) {
  pass('No absolute paths in code files');
}

console.log('\n7. Mode file integrity');

const expectedModes = [
  '_shared.md',
  '_profile.template.md',
  'evaluate.md',
  'compare.md',
  'contact.md',
  'oferta.md',
  'ofertas.md',
  'contacto.md',
  'pdf.md',
  'scan.md',
  'batch.md',
  'apply.md',
  'auto-pipeline.md',
  'deep.md',
  'interview-prep.md',
  'pipeline.md',
  'project.md',
  'tracker.md',
  'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

console.log('\n8. CLAUDE.md integrity');

const claude = readFile('CLAUDE.md');
const requiredSections = [
  'Data Contract',
  'Update Check',
  'Ethical Use',
  'Offer Verification',
  'Canonical States',
  'TSV Format',
  'First Run',
  'Onboarding',
];

for (const section of requiredSections) {
  if (claude.includes(section)) {
    pass(`CLAUDE.md has section: ${section}`);
  } else {
    fail(`CLAUDE.md missing section: ${section}`);
  }
}

console.log('\n9. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('TESTS FAILED - do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('Tests passed with warnings - review before pushing\n');
  process.exit(0);
} else {
  console.log('All tests passed - safe to push/merge\n');
  process.exit(0);
}
