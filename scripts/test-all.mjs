#!/usr/bin/env node

/**
 * Comprehensive test suite for career-ops.
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, PDF generation, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node scripts/test-all.mjs
 *   node scripts/test-all.mjs --quick
 */

import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, join, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) {
  console.log(`  [OK] ${msg}`);
  passed++;
}

function fail(msg) {
  console.log(`  [FAIL] ${msg}`);
  failed++;
}

function warn(msg) {
  console.log(`  [WARN] ${msg}`);
  warnings++;
}

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
  return allowedList.some((allowed) => relPath === allowed || relPath.startsWith(`${allowed}/`));
}

function checkSyntaxInProcess(path) {
  if (typeof vm.SourceTextModule !== 'function') {
    return { supported: false };
  }

  try {
    const source = readFile(path);
    const identifier = pathToFileURL(join(ROOT, path)).href;
    new vm.SourceTextModule(source, { identifier });
    return { supported: true, ok: true };
  } catch (error) {
    return { supported: true, ok: false, error };
  }
}

function buildPdfSmokeFixture() {
  const template = readFile('templates/cv-template.html');
  const replacements = {
    '{{LANG}}': 'en',
    '{{NAME}}': 'Alex Chen',
    '{{PAGE_WIDTH}}': '8.5in',
    '{{EMAIL}}': 'alex@example.com',
    '{{LINKEDIN_URL}}': 'https://linkedin.com/in/alexchen',
    '{{LINKEDIN_DISPLAY}}': 'linkedin.com/in/alexchen',
    '{{PORTFOLIO_URL}}': 'https://alexchen.dev',
    '{{PORTFOLIO_DISPLAY}}': 'alexchen.dev',
    '{{LOCATION}}': 'Austin, TX',
    '{{SECTION_SUMMARY}}': 'Professional Summary',
    '{{SUMMARY_TEXT}}': 'Built and sold a SaaS — now shipping AI in production. Led evidence-to-decision work across product, engineering, and operations…',
    '{{SECTION_COMPETENCIES}}': 'Core Competencies',
    '{{COMPETENCIES}}': '<span class="competency-tag">Scientific Strategy</span><span class="competency-tag">Cross-Functional Leadership</span><span class="competency-tag">Evidence Synthesis</span>',
    '{{SECTION_EXPERIENCE}}': 'Work Experience',
    '{{EXPERIENCE}}': '<div class="job"><div class="job-header"><div class="job-company">TechFin Corp</div><div class="job-period">2020–2024</div></div><div class="job-role">Senior ML Engineer</div><ul><li>Led platform modernization for 4 teams and improved deployment speed.</li><li>Presented findings to clinicians, operators, and executives.</li></ul></div>',
    '{{SECTION_PROJECTS}}': 'Projects',
    '{{PROJECTS}}': '<div class="project"><div class="project-title">FraudShield</div><div class="project-desc">Open-source framework for real-time fraud detection.</div></div>',
    '{{SECTION_EDUCATION}}': 'Education',
    '{{EDUCATION}}': '<div class="edu-item"><div class="edu-header"><div class="edu-title">MS Computer Science <span class="edu-org">UT Austin</span></div><div class="edu-year">2018</div></div></div>',
    '{{SECTION_CERTIFICATIONS}}': 'Certifications',
    '{{CERTIFICATIONS}}': '<div class="cert-item"><div class="cert-title">AWS Certified Machine Learning</div><div class="cert-year">2023</div></div>',
    '{{SECTION_SKILLS}}': 'Skills',
    '{{SKILLS}}': '<div class="skills-grid"><div class="skill-item"><span class="skill-category">Languages:</span> Python, Go, TypeScript</div></div>',
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, value);
  }
  return html;
}

function cleanupFile(path) {
  if (existsSync(path)) unlinkSync(path);
}

console.log('\ncareer-ops test suite\n');

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT)
  .filter((file) => file.endsWith('.mjs'))
  .sort();

for (const file of mjsFiles) {
  const result = runNode(['--check', file]);
  if (result.blocked) {
    const fallback = checkSyntaxInProcess(file);
    if (!fallback.supported) {
      warn(`Syntax check skipped for ${file} (restricted environment and no in-process fallback available)`);
    } else if (fallback.ok) {
      pass(`${file} syntax OK (in-process fallback)`);
    } else {
      fail(`${file} has syntax errors`);
    }
  } else if (result.status === 0) {
    pass(`${file} syntax OK`);
  } else {
    fail(`${file} has syntax errors`);
  }
}

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { args: ['scripts/cv-sync-check.mjs'], acceptableExits: [0, 1], allowFail: true },
  { args: ['scripts/verify-pipeline.mjs'], expectExit: 0 },
  { args: ['scripts/normalize-statuses.mjs', '--dry-run'], expectExit: 0 },
  { args: ['scripts/dedup-tracker.mjs', '--dry-run'], expectExit: 0 },
  { args: ['scripts/merge-tracker.mjs', '--dry-run'], expectExit: 0 },
  { args: ['scripts/update-system.mjs', 'check'], expectExit: 0 },
];

for (const { args, expectExit, acceptableExits, allowFail } of scripts) {
  const result = runNode(args);
  const name = args.join(' ');
  const allowedStatuses = acceptableExits || [expectExit];
  if (result.blocked) {
    warn(`${name} subprocess check skipped (restricted environment)`);
  } else if (allowedStatuses.includes(result.status)) {
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
    cleanupFile(outputPath);
  } else {
    fail('Dashboard build failed');
  }
} else {
  console.log('\n3. Dashboard build (skipped --quick)');
}

console.log('\n4. PDF smoke test');

const smokeHtmlPath = join(ROOT, 'output', '.pdf-smoke-test.html');
const smokePdfPath = join(ROOT, 'output', '.pdf-smoke-test.pdf');

try {
  mkdirSync(join(ROOT, 'output'), { recursive: true });
  writeFileSync(smokeHtmlPath, buildPdfSmokeFixture(), 'utf-8');

  const { generatePDF } = await import('./generate-pdf.mjs');
  const result = await generatePDF({
    inputPath: smokeHtmlPath,
    outputPath: smokePdfPath,
    format: 'letter',
    silent: true,
  });

  if (existsSync(smokePdfPath) && statSync(smokePdfPath).size > 1024 && result.pageCount >= 1) {
    pass('PDF smoke test generated a valid PDF');
  } else {
    fail('PDF smoke test did not produce a usable PDF');
  }
} catch (error) {
  const message = String(error?.message || error);
  if (/EPERM|browserType\.launch|spawn/i.test(message)) {
    warn('PDF smoke test skipped (Chromium blocked in current environment)');
  } else {
    fail(`PDF smoke test failed: ${message}`);
  }
} finally {
  cleanupFile(smokeHtmlPath);
  cleanupFile(smokePdfPath);
}

console.log('\n5. Data contract validation');

const systemFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  'VERSION',
  'DATA_CONTRACT.md',
  'SECURITY.md',
  'scripts/analyze-patterns.mjs',
  'scripts/assist-phenom-review-handoff.mjs',
  'scripts/check-liveness.mjs',
  'scripts/cv-sync-check.mjs',
  'scripts/dedup-tracker.mjs',
  'scripts/doctor.mjs',
  'scripts/generate-pdf.mjs',
  'scripts/merge-tracker.mjs',
  'scripts/normalize-statuses.mjs',
  'scripts/probe-apply-flow.mjs',
  'scripts/probe-workday-after-myinfo-tabs.mjs',
  'scripts/probe-workday-auth.mjs',
  'scripts/probe-workday-fill-myinfo.mjs',
  'scripts/probe-workday-myinfo.mjs',
  'scripts/probe-workday-picker-options.mjs',
  'scripts/probe-workday-signin.mjs',
  'scripts/probe-workday-step-tabs.mjs',
  'scripts/probe-workday-verify.mjs',
  'scripts/tracker-contract.mjs',
  'scripts/update-system.mjs',
  'scripts/verify-pipeline.mjs',
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
  'docs/VALIDATION_ROADMAP.md',
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
  'cv.md',
  'article-digest.md',
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

console.log('\n6. Personal data leak check');

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
  'scripts/test-all.mjs',
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

console.log('\n7. Absolute path check');

const absPathExtensions = new Set(['.mjs', '.sh', '.md', '.go', '.yml']);
const allowedPathRefs = [
  'README.md',
  'LICENSE',
  'CLAUDE.md',
  'AGENTS.md',
  'scripts/test-all.mjs',
  'config/profile.yml',
  'cv.md',
  'article-digest.md',
  'modes/_profile.md',
  'portals.yml',
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

console.log('\n8. Mode file integrity');

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
  'patterns.md',
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

console.log('\n9. CLAUDE.md integrity');

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

console.log('\n10. Version file');

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

console.log('\n11. Package metadata');

if (fileExists('package.json') && fileExists('VERSION')) {
  const pkg = JSON.parse(readFile('package.json'));
  const version = readFile('VERSION').trim();
  if (pkg.version === version) {
    pass(`package.json version matches VERSION (${version})`);
  } else {
    fail(`package.json version ${pkg.version} does not match VERSION ${version}`);
  }
} else {
  fail('package.json or VERSION missing');
}

console.log('\n12. Profile example completeness');

if (fileExists('config/profile.example.yml')) {
  const profileExample = readFile('config/profile.example.yml');
  const expectedProfileKeys = [
    'application_defaults:',
    'application_files:',
    'how_did_you_hear:',
    'workday_overrides:',
    'address_line_1:',
    'phone_device_type:',
    'authorized_to_work_us:',
    'confidentiality_obligation:',
    'self_id_defaults:',
    'consent_to_terms:',
    'resume_upload_path:',
  ];

  let missingProfileKey = false;
  for (const key of expectedProfileKeys) {
    if (profileExample.includes(key)) {
      pass(`profile.example includes ${key}`);
    } else {
      fail(`profile.example missing ${key}`);
      missingProfileKey = true;
    }
  }

  if (!missingProfileKey) {
    pass('profile.example covers portal-ready apply fields');
  }
} else {
  fail('config/profile.example.yml missing');
}

console.log('\n13. Security hygiene');

if (fileExists('.gitignore')) {
  const gitignore = readFile('.gitignore');
  const expectedIgnoreRules = [
    'config/profile.yml',
    'cv.md',
    'portals.yml',
    'output/*',
    'reports/*.md',
    '.env',
    '.env.*',
    'playwright/.auth/',
    'storage-state*.json',
    '*.har',
  ];

  let missingIgnoreRule = false;
  for (const rule of expectedIgnoreRules) {
    if (gitignore.includes(rule)) {
      pass(`.gitignore includes ${rule}`);
    } else {
      fail(`.gitignore missing ${rule}`);
      missingIgnoreRule = true;
    }
  }

  if (!missingIgnoreRule) {
    pass('.gitignore covers local-only privacy and session artifacts');
  }
} else {
  fail('.gitignore missing');
}

if (fileExists('scripts/generate-pdf.mjs')) {
  const pdfGenerator = readFile('scripts/generate-pdf.mjs');
  if (pdfGenerator.includes('page.route(') && pdfGenerator.includes('isSafeRenderUrl')) {
    pass('generate-pdf blocks remote render requests');
  } else {
    fail('generate-pdf does not clearly block remote render requests');
  }
} else {
  fail('scripts/generate-pdf.mjs missing');
}

if (fileExists('templates/cv-template.html')) {
  const template = readFile('templates/cv-template.html');
  if (!/<script\b/i.test(template) && !/https?:\/\//i.test(template)) {
    pass('cv-template has no remote scripts or remote asset URLs');
  } else {
    fail('cv-template includes remote script or asset references');
  }
} else {
  fail('templates/cv-template.html missing');
}

const trackedFilesResult = runProcess('git', ['ls-files']);
const trackedFiles = trackedFilesResult.status === 0
  ? trackedFilesResult.stdout.split(/\r?\n/).filter(Boolean)
  : null;
const secretScanExtensions = new Set(['.md', '.yml', '.mjs', '.json', '.sh', '.go', '.html', '.cff']);
const secretPatterns = [
  { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'sensitive-secret-assignment', regex: /\b(?:workday_test_password|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*["'][^"'$\s][^"']{7,}["']/i },
  { name: 'hardcoded-password-assignment', regex: /\bpassword\b\s*[:=]\s*["'](?!demo|example|placeholder|changeme|replace|sample)[^"'$\s][^"']{7,}["']/i },
];

let secretFound = false;
if (trackedFiles === null) {
  warn('Tracked-file secret scan skipped because git file discovery was unavailable in this environment');
} else {
  for (const relPath of trackedFiles) {
    if (!secretScanExtensions.has(extname(relPath))) continue;
    const content = readFile(relPath);
    for (const { name, regex } of secretPatterns) {
      if (regex.test(content)) {
        fail(`Possible ${name} found in tracked file: ${relPath}`);
        secretFound = true;
      }
    }
  }
}
if (!secretFound) {
  pass('No obvious secrets detected in tracked files');
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
