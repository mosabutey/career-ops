#!/usr/bin/env node

/**
 * analyze-patterns.mjs
 *
 * Read tracker and report data to surface signal about:
 * - score distribution
 * - status conversion
 * - role-pack and stage concentration
 * - sponsorship / authorization friction
 * - strongest and weakest application patterns
 *
 * Usage:
 *   node scripts/analyze-patterns.mjs
 *   node scripts/analyze-patterns.mjs --json
 *   node scripts/analyze-patterns.mjs --write
 *   node scripts/analyze-patterns.mjs --out reports/patterns-2026-04-08.md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStatusLabel } from './tracker-contract.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const wantsJson = args.has('--json');
const wantsWrite = args.has('--write');
const outIndex = process.argv.indexOf('--out');
const explicitOut = outIndex >= 0 ? process.argv[outIndex + 1] : null;

const applicationsPath = join(ROOT, 'data', 'applications.md');
const reportsDir = join(ROOT, 'reports');
const outPath = explicitOut
  ? join(ROOT, explicitOut)
  : join(ROOT, 'reports', `patterns-${today()}.md`);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeRead(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function parseScore(raw) {
  const match = String(raw).match(/(\d+(?:\.\d+)?)\/5/);
  return match ? Number(match[1]) : null;
}

function average(values) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function percent(part, total) {
  if (!total) return null;
  return (part / total) * 100;
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function parseApplicationsMarkdown(content) {
  const rows = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (/^\|\s*#\s*\|/i.test(line)) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());

    if (cells.length < 9) continue;

    const [num, date, company, role, scoreRaw, statusRaw, pdfRaw, reportRaw, notes] = cells;
    rows.push({
      num,
      date,
      company,
      role,
      score: parseScore(scoreRaw),
      scoreRaw,
      status: normalizeStatusLabel(statusRaw) ?? statusRaw,
      pdf: pdfRaw,
      report: reportRaw,
      notes,
    });
  }

  return rows;
}

function parseReport(content, filename) {
  const getField = (label) => {
    const pattern = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i');
    return content.match(pattern)?.[1]?.trim() ?? null;
  };

  const titleMatch = content.match(/^#\s+Evaluation:\s+(.+?)\s+--\s+(.+)$/m);
  const recommendationMatch = content.match(/^(APPLY NOW|NETWORK FIRST|GOOD STRETCH|MONITOR|SKIP)$/m);

  return {
    filename,
    company: titleMatch?.[1]?.trim() ?? null,
    role: titleMatch?.[2]?.trim() ?? null,
    date: getField('Date'),
    track: getField('Track'),
    careerStage: getField('Career Stage'),
    authorizationSignal: getField('Authorization Signal'),
    workAuthorization: getField('Work Authorization'),
    score: parseScore(getField('Score')),
    url: getField('URL'),
    pdf: getField('PDF'),
    recommendation: recommendationMatch?.[1] ?? null,
  };
}

function loadReports() {
  if (!existsSync(reportsDir)) return [];

  return readdirSync(reportsDir)
    .filter(name => name.endsWith('.md'))
    .map(name => {
      const path = join(reportsDir, name);
      return parseReport(readFileSync(path, 'utf-8'), name);
    });
}

function tokenizeRole(role) {
  return String(role || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/&-]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token =>
      token &&
      token.length > 2 &&
      !['and', 'for', 'the', 'with', 'senior', 'associate', 'manager'].includes(token)
    );
}

function summarizePatterns(applications, reports) {
  const statusCounts = new Map();
  const trackCounts = new Map();
  const stageCounts = new Map();
  const authCounts = new Map();
  const recommendationCounts = new Map();
  const roleWordCounts = new Map();

  for (const row of applications) {
    increment(statusCounts, row.status || 'Unknown');
    for (const token of tokenizeRole(row.role)) {
      increment(roleWordCounts, token);
    }
  }

  for (const report of reports) {
    increment(trackCounts, report.track || 'Unknown');
    increment(stageCounts, report.careerStage || 'Unknown');
    increment(authCounts, report.authorizationSignal || 'unknown');
    increment(recommendationCounts, report.recommendation || 'Unknown');
  }

  const totalApplications = applications.length;
  const totalReports = reports.length;
  const avgScore = average(applications.map(row => row.score));
  const appliedCount = applications.filter(row => row.status === 'Applied').length;
  const interviewCount = applications.filter(row => row.status === 'Interview').length;
  const offerCount = applications.filter(row => row.status === 'Offer').length;
  const rejectedCount = applications.filter(row => row.status === 'Rejected').length;
  const skipCount = applications.filter(row => row.status === 'SKIP').length;
  const generatedPdfCount = applications.filter(row => row.pdf?.includes('✅')).length;

  const highScoreNotApplied = applications
    .filter(row => Number.isFinite(row.score) && row.score >= 4.2 && !['Applied', 'Interview', 'Offer', 'Responded'].includes(row.status))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8);

  const lowScoreApplied = applications
    .filter(row => Number.isFinite(row.score) && row.score < 4.0 && ['Applied', 'Interview', 'Responded', 'Offer'].includes(row.status))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 8);

  const recommendations = [];

  if (highScoreNotApplied.length >= 3) {
    recommendations.push(`You have ${highScoreNotApplied.length} high-scoring roles that did not convert into applications or active processes. Review whether hesitation is coming from timing, outreach, resume variant quality, or avoidable uncertainty.`);
  }

  if (lowScoreApplied.length >= 2) {
    recommendations.push(`You are spending time on lower-scoring roles that converted to active applications. Tighten the minimum apply threshold or require a stronger strategic override before applying.`);
  }

  const unknownAuth = authCounts.get('unknown') ?? 0;
  const closedOrRestrictedAuth = (authCounts.get('closed') ?? 0) + (authCounts.get('restricted') ?? 0);
  if (closedOrRestrictedAuth > 0) {
    recommendations.push(`Sponsorship or authorization friction is appearing in ${closedOrRestrictedAuth} evaluated roles. Consider adjusting scan filters, target employers, or networking-first tactics for companies with unclear policy.`);
  } else if (unknownAuth > 0) {
    recommendations.push(`Most authorization signals are still unknown. Strengthen scan-time capture of sponsorship language and log employer policy when you evaluate roles.`);
  }

  if ((trackCounts.get('life_sciences_consulting') ?? 0) > (trackCounts.get('biopharma_medical') ?? 0) * 2) {
    recommendations.push('Your evaluated mix is heavily tilted toward life sciences consulting. Confirm that this matches your actual target mix or expand biopharma and health-tech discovery.');
  }

  if (!recommendations.length) {
    recommendations.push('The current data does not show a major negative pattern yet. Keep evaluating consistently so the system can learn from stronger signal.');
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      applications: totalApplications,
      reports: totalReports,
      averageScore: avgScore,
      pdfRate: percent(generatedPdfCount, totalApplications),
      appliedRate: percent(appliedCount, totalApplications),
      interviewRate: percent(interviewCount, totalApplications),
      offerRate: percent(offerCount, totalApplications),
      rejectedRate: percent(rejectedCount, totalApplications),
      skipRate: percent(skipCount, totalApplications),
    },
    counts: {
      statuses: topEntries(statusCounts, 20),
      tracks: topEntries(trackCounts, 10),
      stages: topEntries(stageCounts, 10),
      authorizationSignals: topEntries(authCounts, 10),
      recommendations: topEntries(recommendationCounts, 10),
      roleTerms: topEntries(roleWordCounts, 12),
    },
    highlights: {
      highScoreNotApplied,
      lowScoreApplied,
    },
    recommendations,
  };
}

function formatPct(value) {
  return value == null ? 'N/A' : `${value.toFixed(1)}%`;
}

function formatScore(value) {
  return value == null ? 'N/A' : `${value.toFixed(2)}/5`;
}

function formatTable(entries, headers) {
  if (!entries.length) return '_No data yet._';
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];

  for (const entry of entries) {
    lines.push(`| ${entry.join(' | ')} |`);
  }

  return lines.join('\n');
}

function renderMarkdown(summary) {
  const statusTable = formatTable(
    summary.counts.statuses.map(([label, count]) => [label, String(count)]),
    ['Status', 'Count'],
  );

  const trackTable = formatTable(
    summary.counts.tracks.map(([label, count]) => [label, String(count)]),
    ['Track', 'Count'],
  );

  const authTable = formatTable(
    summary.counts.authorizationSignals.map(([label, count]) => [label, String(count)]),
    ['Authorization Signal', 'Count'],
  );

  const roleTermsTable = formatTable(
    summary.counts.roleTerms.map(([term, count]) => [term, String(count)]),
    ['Role Term', 'Count'],
  );

  const highScoreTable = formatTable(
    summary.highlights.highScoreNotApplied.map(row => [
      row.company || 'Unknown',
      row.role || 'Unknown',
      formatScore(row.score),
      row.status || 'Unknown',
    ]),
    ['Company', 'Role', 'Score', 'Current Status'],
  );

  const lowScoreTable = formatTable(
    summary.highlights.lowScoreApplied.map(row => [
      row.company || 'Unknown',
      row.role || 'Unknown',
      formatScore(row.score),
      row.status || 'Unknown',
    ]),
    ['Company', 'Role', 'Score', 'Current Status'],
  );

  return `# Career-Ops LifeSci Patterns Report

**Generated:** ${summary.generatedAt}

## Overview

- Applications tracked: ${summary.totals.applications}
- Reports analyzed: ${summary.totals.reports}
- Average score: ${formatScore(summary.totals.averageScore)}
- PDF generation rate: ${formatPct(summary.totals.pdfRate)}
- Applied rate: ${formatPct(summary.totals.appliedRate)}
- Interview rate: ${formatPct(summary.totals.interviewRate)}
- Offer rate: ${formatPct(summary.totals.offerRate)}
- Rejected rate: ${formatPct(summary.totals.rejectedRate)}
- SKIP rate: ${formatPct(summary.totals.skipRate)}

## Status Distribution

${statusTable}

## Track Mix

${trackTable}

## Authorization Signals

${authTable}

## Frequent Role Terms

${roleTermsTable}

## High-Score Roles Not Yet Converting

${highScoreTable}

## Low-Score Roles That Still Consumed Time

${lowScoreTable}

## Recommendations

${summary.recommendations.map(item => `- ${item}`).join('\n')}
`;
}

function main() {
  const applications = parseApplicationsMarkdown(safeRead(applicationsPath));
  const reports = loadReports();
  const summary = summarizePatterns(applications, reports);

  if (wantsJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(renderMarkdown(summary));
  }

  if (wantsWrite || explicitOut) {
    mkdirSync(join(ROOT, 'reports'), { recursive: true });
    writeFileSync(outPath, renderMarkdown(summary), 'utf-8');
    console.error(`Wrote patterns report to ${outPath}`);
  }
}

main();
