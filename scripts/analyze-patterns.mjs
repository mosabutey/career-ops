#!/usr/bin/env node

/**
 * analyze-patterns.mjs
 *
 * Read tracker and report data to surface signal about:
 * - conversion funnel and score quality
 * - role-pack and career-stage concentration
 * - sponsorship / authorization friction
 * - blocker patterns from report gaps
 * - where strong-fit roles are not converting
 *
 * Usage:
 *   node scripts/analyze-patterns.mjs
 *   node scripts/analyze-patterns.mjs --json
 *   node scripts/analyze-patterns.mjs --write
 *   node scripts/analyze-patterns.mjs --out reports/pattern-analysis-2026-04-09.md
 *   node scripts/analyze-patterns.mjs --min-threshold 5
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeStatusId, normalizeStatusLabel } from './tracker-contract.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const argSet = new Set(args);

const wantsJson = argSet.has('--json');
const wantsWrite = argSet.has('--write');
const outIndex = args.indexOf('--out');
const thresholdIndex = args.indexOf('--min-threshold');
const explicitOut = outIndex >= 0 ? args[outIndex + 1] : null;
const minThreshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) || 5 : 5;

const applicationsPath = join(ROOT, 'data', 'applications.md');
const reportsDir = join(ROOT, 'reports');
const outPath = explicitOut
  ? join(ROOT, explicitOut)
  : join(ROOT, 'reports', `pattern-analysis-${today()}.md`);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeRead(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function parseScore(raw) {
  const match = String(raw || '').match(/(\d+(?:\.\d+)?)\/5/);
  return match ? Number(match[1]) : null;
}

function average(values) {
  const nums = values.filter(value => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function percentage(part, total) {
  if (!total) return null;
  return (part / total) * 100;
}

function round1(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map, limit = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function parseMarkdownLinkTarget(cell) {
  const match = String(cell || '').match(/\[[^\]]+\]\(([^)]+)\)/);
  return match ? match[1] : null;
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
    const statusId = normalizeStatusId(statusRaw);
    const reportPath = parseMarkdownLinkTarget(reportRaw);
    const reportFilename = reportPath ? reportPath.split('/').pop() : null;

    rows.push({
      num,
      date,
      company,
      role,
      score: parseScore(scoreRaw),
      scoreRaw,
      statusId,
      status: normalizeStatusLabel(statusRaw) ?? statusRaw,
      pdf: pdfRaw,
      report: reportRaw,
      reportPath,
      reportFilename,
      notes,
    });
  }

  return rows;
}

function parseTable(lines, startIndex) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!headerLine?.startsWith('|') || !separatorLine?.startsWith('|')) return null;
  if (!separatorLine.includes('---')) return null;

  const headers = headerLine
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
  const rows = [];

  let index = startIndex + 2;
  while (index < lines.length && lines[index].startsWith('|')) {
    const values = lines[index]
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (values.length === headers.length) {
      rows.push(Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]])));
    }
    index += 1;
  }

  return { headers, rows, nextIndex: index };
}

function extractTables(content) {
  const lines = content.split(/\r?\n/);
  const tables = [];

  for (let index = 0; index < lines.length; index += 1) {
    const table = parseTable(lines, index);
    if (!table) continue;
    tables.push({ headers: table.headers, rows: table.rows });
    index = table.nextIndex - 1;
  }

  return tables;
}

function findTable(tables, headers) {
  return tables.find(table => headers.every(header => table.headers.includes(header))) ?? null;
}

function normalizeCellText(value) {
  return String(value || '')
    .replace(/`/g, '')
    .trim();
}

function tableToKeyValueMap(table, keyHeader, valueHeader) {
  const result = new Map();
  if (!table) return result;
  for (const row of table.rows) {
    result.set(normalizeCellText(row[keyHeader]), normalizeCellText(row[valueHeader]));
  }
  return result;
}

function extractField(content, label) {
  const pattern = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i');
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function extractRecommendation(content) {
  const headingMatch = content.match(/## Final Recommendation\s+`([^`]+)`/i);
  if (headingMatch) return headingMatch[1].trim();

  const lineMatch = content.match(/^(APPLY NOW|NETWORK FIRST|GOOD STRETCH|MONITOR|SKIP)$/m);
  return lineMatch?.[1] ?? null;
}

function extractReportTitle(content) {
  const match = content.match(/^#\s+Evaluation:\s+(.+?)\s+--\s+(.+)$/m);
  return {
    company: match?.[1]?.trim() ?? null,
    role: match?.[2]?.trim() ?? null,
  };
}

function parseReport(content, filename) {
  const title = extractReportTitle(content);
  const tables = extractTables(content);
  const roleSummaryTable = findTable(tables, ['Field', 'Value']);
  const gapsTable = findTable(tables, ['Gap', 'Blocker?', 'Adjacent coverage', 'Honest mitigation plan']);
  const authTable = findTable(tables, ['Item', 'Value']);

  const roleSummary = tableToKeyValueMap(roleSummaryTable, 'Field', 'Value');
  const authorization = tableToKeyValueMap(authTable, 'Item', 'Value');

  return {
    filename,
    company: title.company,
    role: title.role,
    date: extractField(content, 'Date'),
    track: extractField(content, 'Track') ?? roleSummary.get('Primary role pack') ?? null,
    secondaryTrack: roleSummary.get('Secondary pack') ?? null,
    careerStage: extractField(content, 'Career Stage') ?? roleSummary.get('Career stage fit') ?? null,
    authorizationSignal: extractField(content, 'Authorization Signal') ?? roleSummary.get('Authorization signal') ?? null,
    workAuthorization: extractField(content, 'Work Authorization') ?? authorization.get('Candidate work authorization summary') ?? null,
    score: parseScore(extractField(content, 'Score')),
    url: extractField(content, 'URL'),
    pdf: extractField(content, 'PDF'),
    verification: extractField(content, 'Verification'),
    recommendation: extractRecommendation(content),
    companyClass: roleSummary.get('Company class') ?? null,
    functionSummary: roleSummary.get('Function') ?? null,
    seniority: roleSummary.get('Seniority') ?? null,
    workModel: roleSummary.get('Work model') ?? null,
    sponsorshipFitSummary: roleSummary.get('Sponsorship fit summary') ?? null,
    recommendedAction: authorization.get('Recommended action') ?? null,
    gaps: gapsTable
      ? gapsTable.rows.map(row => ({
          gap: normalizeCellText(row.Gap),
          blocker: normalizeCellText(row['Blocker?']),
          adjacentCoverage: normalizeCellText(row['Adjacent coverage']),
          mitigation: normalizeCellText(row['Honest mitigation plan']),
        }))
      : [],
  };
}

function loadReports() {
  if (!existsSync(reportsDir)) return [];

  return readdirSync(reportsDir)
    .filter(name => name.endsWith('.md') && name !== '.gitkeep')
    .map(name => parseReport(readFileSync(join(reportsDir, name), 'utf-8'), name));
}

function classifyOutcome(statusId) {
  if (['applied', 'responded', 'interview', 'offer'].includes(statusId)) return 'positive';
  if (['rejected', 'discarded'].includes(statusId)) return 'negative';
  if (statusId === 'skip') return 'self_filtered';
  return 'pending';
}

function classifyWorkModel(workModel) {
  const value = String(workModel || '').toLowerCase();
  if (!value) return 'unknown';
  if (/\b(us only|usa only|canada only|citizenship|clearance)\b/.test(value)) return 'geo_restricted';
  if (/\bworldwide|global|anywhere\b/.test(value) && /\bremote\b/.test(value)) return 'global_remote';
  if (/\bremote\b/.test(value)) return 'remote';
  if (/\bhybrid\b/.test(value)) return 'hybrid';
  if (/\btravel|field\b/.test(value)) return 'travel_heavy';
  if (/\bboston|cambridge|new york|san francisco|seattle|onsite|on-site\b/.test(value)) return 'local_cluster_or_onsite';
  return 'unknown';
}

function classifyGapTheme(gap) {
  const text = `${gap.gap} ${gap.mitigation}`.toLowerCase();
  if (/\bvisa|sponsorship|authorization|work permit\b/.test(text)) return 'sponsorship_friction';
  if (/\blocation|relocation|remote|travel|onsite|on-site|geo\b/.test(text)) return 'location_friction';
  if (/\bventure|investment banking|investor|fundraising|capital markets|finance|underwriting\b/.test(text)) return 'finance_and_investing_gap';
  if (/\bbusiness development|sales|commercial\b/.test(text)) return 'commercial_execution_gap';
  if (/\bpitchbook|evaluate pharma|salesforce|tableau|excel|crm|tool\b/.test(text)) return 'tooling_gap';
  if (/\breal estate|tenant\b/.test(text)) return 'domain_context_gap';
  if (/\bsenior|staff|lead|principal|director|manager\b/.test(text)) return 'seniority_gap';
  if (/\btherapeutic|disease area|oncology|immunology|clinical\b/.test(text)) return 'functional_or_domain_gap';
  return 'general_transition_gap';
}

function formatPct(value) {
  return value == null ? 'N/A' : `${value.toFixed(1)}%`;
}

function formatScore(value) {
  return value == null ? 'N/A' : `${value.toFixed(1)}/5`;
}

function dateRange(applications, reports) {
  const dates = [...applications.map(item => item.date), ...reports.map(item => item.date)]
    .filter(Boolean)
    .sort();
  return {
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

function buildThresholdAnalysis(applications) {
  const scored = applications.filter(item => Number.isFinite(item.score));
  const positive = scored.filter(item => item.outcome === 'positive');
  const negativeLike = scored.filter(item => ['negative', 'self_filtered'].includes(item.outcome));

  if (positive.length === 0) {
    return {
      recommendedMinimumScore: 4.0,
      positiveMin: null,
      positiveMax: null,
      negativeMax: negativeLike.length ? Math.max(...negativeLike.map(item => item.score)) : null,
      reasoning: 'No positive outcomes are recorded yet, so the default floor stays at 4.0/5 until more data arrives.',
    };
  }

  const positiveScores = positive.map(item => item.score);
  const positiveMin = Math.min(...positiveScores);
  const positiveMax = Math.max(...positiveScores);
  const negativeMax = negativeLike.length ? Math.max(...negativeLike.map(item => item.score)) : null;
  const recommended = round1(positiveMin);
  const overlap = negativeMax != null && negativeMax >= recommended;

  return {
    recommendedMinimumScore: recommended,
    positiveMin: round1(positiveMin),
    positiveMax: round1(positiveMax),
    negativeMax: round1(negativeMax),
    reasoning: overlap
      ? `Positive outcomes begin at ${formatScore(positiveMin)}, but lower-quality outcomes still overlap near that range. Keep ${formatScore(recommended)} as the floor and require a stronger override when scores land near the overlap zone.`
      : `Every positive outcome so far is at or above ${formatScore(positiveMin)}. That makes ${formatScore(recommended)} a defensible evidence-based floor for future applications.`,
  };
}

function breakdownFromMap(map, label) {
  return [...map.entries()]
    .map(([key, stats]) => ({
      [label]: key,
      total: stats.total,
      positive: stats.positive,
      negative: stats.negative,
      selfFiltered: stats.self_filtered,
      pending: stats.pending,
      conversionRate: round1(percentage(stats.positive, stats.total)),
    }))
    .sort((a, b) => b.total - a.total);
}

function summarizePatterns(applications, reports) {
  const reportByFilename = new Map(reports.map(report => [report.filename, report]));

  const enrichedApplications = applications.map(application => {
    const report = application.reportFilename ? reportByFilename.get(application.reportFilename) ?? null : null;
    const outcome = classifyOutcome(application.statusId);
    const score = Number.isFinite(application.score) ? application.score : report?.score ?? null;
    return {
      ...application,
      report,
      score,
      outcome,
      track: report?.track ?? null,
      careerStage: report?.careerStage ?? null,
      authorizationSignal: report?.authorizationSignal ?? null,
      workModelBucket: classifyWorkModel(report?.workModel),
      companyClass: report?.companyClass ?? null,
    };
  });

  const total = enrichedApplications.length;
  const progressed = enrichedApplications.filter(item => item.outcome !== 'pending').length;
  const range = dateRange(enrichedApplications, reports);

  const funnelCounts = new Map();
  const outcomeCounts = new Map();
  const trackStats = new Map();
  const stageStats = new Map();
  const authStats = new Map();
  const workModelStats = new Map();
  const companyClassStats = new Map();
  const blockerStats = new Map();
  const blockerOutcomeStats = new Map();
  const recommendationCounts = new Map();
  const roleTermCounts = new Map();

  for (const item of enrichedApplications) {
    increment(funnelCounts, item.status ?? 'Unknown');
    increment(outcomeCounts, item.outcome);

    for (const term of String(item.role || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s/&-]/g, ' ')
      .split(/\s+/)
      .filter(token => token && token.length > 2 && !['and', 'for', 'the', 'with', 'senior', 'associate', 'manager'].includes(token))) {
      increment(roleTermCounts, term);
    }

    const breakdownTargets = [
      [trackStats, item.track ?? 'unknown'],
      [stageStats, item.careerStage ?? 'unknown'],
      [authStats, item.authorizationSignal ?? 'unknown'],
      [workModelStats, item.workModelBucket ?? 'unknown'],
      [companyClassStats, item.companyClass ?? 'unknown'],
    ];

    for (const [map, key] of breakdownTargets) {
      const current = map.get(key) ?? { total: 0, positive: 0, negative: 0, self_filtered: 0, pending: 0 };
      current.total += 1;
      current[item.outcome] += 1;
      map.set(key, current);
    }

    if (item.report?.recommendation) {
      increment(recommendationCounts, item.report.recommendation);
    }

    const seenThemes = new Set();
    for (const gap of item.report?.gaps ?? []) {
      const theme = classifyGapTheme(gap);
      if (seenThemes.has(theme)) continue;
      seenThemes.add(theme);
      increment(blockerStats, theme);
      const outcomeMap = blockerOutcomeStats.get(theme) ?? new Map();
      increment(outcomeMap, item.outcome);
      blockerOutcomeStats.set(theme, outcomeMap);
    }
  }

  const scoreComparison = ['positive', 'negative', 'self_filtered', 'pending'].map(outcome => {
    const scores = enrichedApplications
      .filter(item => item.outcome === outcome)
      .map(item => item.score)
      .filter(Number.isFinite);
    return {
      outcome,
      count: scores.length,
      avgScore: round1(average(scores)),
      minScore: scores.length ? round1(Math.min(...scores)) : null,
      maxScore: scores.length ? round1(Math.max(...scores)) : null,
    };
  });

  const scoreThreshold = buildThresholdAnalysis(enrichedApplications);

  const highScoreNotApplied = enrichedApplications
    .filter(item => Number.isFinite(item.score) && item.score >= scoreThreshold.recommendedMinimumScore && item.outcome === 'pending')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 8)
    .map(item => ({
      company: item.company,
      role: item.role,
      score: round1(item.score),
      status: item.status,
      track: item.track,
    }));

  const lowScoreApplied = enrichedApplications
    .filter(item => Number.isFinite(item.score) && item.score < 4.0 && item.outcome === 'positive')
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 8)
    .map(item => ({
      company: item.company,
      role: item.role,
      score: round1(item.score),
      status: item.status,
      track: item.track,
    }));

  const blockerAnalysis = topEntries(blockerStats, 10).map(([theme, count]) => {
    const outcomes = blockerOutcomeStats.get(theme) ?? new Map();
    return {
      blocker: theme,
      count,
      percent: round1(percentage(count, total)),
      positive: outcomes.get('positive') ?? 0,
      negative: outcomes.get('negative') ?? 0,
      selfFiltered: outcomes.get('self_filtered') ?? 0,
      pending: outcomes.get('pending') ?? 0,
    };
  });

  const recommendations = [];

  if (progressed < minThreshold) {
    recommendations.push({
      impact: 'medium',
      action: `Keep collecting data until at least ${minThreshold} applications move beyond evaluation before treating these findings as policy.`,
      reasoning: `Only ${progressed} applications have progressed beyond evaluation, so the sample is directionally useful but still small.`,
    });
  }

  if (highScoreNotApplied.length >= 2) {
    recommendations.push({
      impact: 'high',
      action: 'Create a fast-review lane for high-scoring roles that are still stuck in Evaluated status.',
      reasoning: `${highScoreNotApplied.length} strong-fit roles are not converting into active applications even though they already cleared the current score floor.`,
    });
  }

  if (lowScoreApplied.length >= 2) {
    recommendations.push({
      impact: 'high',
      action: 'Raise the application bar or require an explicit override for roles below 4.0/5.',
      reasoning: `${lowScoreApplied.length} lower-scoring roles still consumed application effort, which suggests drift or overly optimistic overrides.`,
    });
  }

  const sponsorshipFriction = blockerAnalysis.find(item => item.blocker === 'sponsorship_friction');
  const authRestricted = authStats.get('restricted')?.total ?? 0;
  const authClosed = authStats.get('closed')?.total ?? 0;
  if ((sponsorshipFriction?.count ?? 0) > 0 || authRestricted + authClosed > 0) {
    recommendations.push({
      impact: 'high',
      action: 'Tighten sponsorship and authorization filters in discovery, and flag networking-first handling for ambiguous employers.',
      reasoning: 'Authorization friction is showing up both in structured report fields and in repeated blocker themes.',
    });
  }

  const trackBreakdown = breakdownFromMap(trackStats, 'track');
  if (trackBreakdown.length >= 2 && trackBreakdown[0].total >= trackBreakdown[1].total * 2) {
    recommendations.push({
      impact: 'medium',
      action: `Rebalance discovery if the current mix is unintentionally over-weighting ${trackBreakdown[0].track}.`,
      reasoning: 'The tracker is heavily concentrated in one track, which can hide better opportunities in the other enabled role packs.',
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      impact: 'medium',
      action: 'Keep the current search strategy and continue collecting reports.',
      reasoning: 'The current dataset does not show a clear negative pattern that justifies a major workflow change yet.',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    metadata: {
      totalApplications: total,
      totalReports: reports.length,
      progressedApplications: progressed,
      minimumProgressedThreshold: minThreshold,
      enoughData: progressed >= minThreshold,
      dateRange: range,
      outcomeCounts: {
        positive: outcomeCounts.get('positive') ?? 0,
        negative: outcomeCounts.get('negative') ?? 0,
        selfFiltered: outcomeCounts.get('self_filtered') ?? 0,
        pending: outcomeCounts.get('pending') ?? 0,
      },
    },
    totals: {
      averageScore: round1(average(enrichedApplications.map(item => item.score))),
      pdfRate: round1(percentage(enrichedApplications.filter(item => String(item.pdf || '').includes('✅')).length, total)),
      appliedRate: round1(percentage(enrichedApplications.filter(item => item.statusId === 'applied').length, total)),
      interviewRate: round1(percentage(enrichedApplications.filter(item => item.statusId === 'interview').length, total)),
      offerRate: round1(percentage(enrichedApplications.filter(item => item.statusId === 'offer').length, total)),
      rejectedRate: round1(percentage(enrichedApplications.filter(item => item.statusId === 'rejected').length, total)),
      skipRate: round1(percentage(enrichedApplications.filter(item => item.statusId === 'skip').length, total)),
    },
    funnel: [...funnelCounts.entries()].map(([status, count]) => ({
      status,
      count,
      percent: round1(percentage(count, total)),
    })),
    scoreComparison,
    trackBreakdown,
    stageBreakdown: breakdownFromMap(stageStats, 'careerStage'),
    authorizationBreakdown: breakdownFromMap(authStats, 'authorizationSignal'),
    remotePolicy: breakdownFromMap(workModelStats, 'workModel'),
    companyClassBreakdown: breakdownFromMap(companyClassStats, 'companyClass'),
    blockerAnalysis,
    scoreThreshold,
    recommendationBreakdown: topEntries(recommendationCounts, 10).map(([recommendation, count]) => ({ recommendation, count })),
    roleTerms: topEntries(roleTermCounts, 12).map(([term, count]) => ({ term, count })),
    highlights: {
      highScoreNotApplied,
      lowScoreApplied,
    },
    recommendations,
  };
}

function formatTable(rows, headers) {
  if (!rows.length) return '_No data yet._';
  const headerLine = `| ${headers.join(' | ')} |`;
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map(row => `| ${headers.map(header => row[header] ?? 'N/A').join(' | ')} |`);
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

function renderMarkdown(summary) {
  if (summary.metadata.totalApplications === 0) {
    return `# Pattern Analysis - ${today()}

No tracker data was found yet. Add evaluations and application outcomes, then rerun the analysis.
`;
  }

  const funnelRows = summary.funnel.map(item => ({
    Stage: item.status,
    Count: String(item.count),
    '%': formatPct(item.percent),
  }));

  const scoreRows = summary.scoreComparison.map(item => ({
    Outcome: item.outcome,
    'Avg Score': formatScore(item.avgScore),
    Min: formatScore(item.minScore),
    Max: formatScore(item.maxScore),
    Count: String(item.count),
  }));

  const trackRows = summary.trackBreakdown.map(item => ({
    Track: item.track,
    Total: String(item.total),
    Positive: String(item.positive),
    'Conversion %': formatPct(item.conversionRate),
  }));

  const stageRows = summary.stageBreakdown.map(item => ({
    'Career Stage': item.careerStage,
    Total: String(item.total),
    Positive: String(item.positive),
    'Conversion %': formatPct(item.conversionRate),
  }));

  const authRows = summary.authorizationBreakdown.map(item => ({
    'Authorization Signal': item.authorizationSignal,
    Total: String(item.total),
    Positive: String(item.positive),
    'Conversion %': formatPct(item.conversionRate),
  }));

  const blockerRows = summary.blockerAnalysis.map(item => ({
    Blocker: item.blocker,
    Count: String(item.count),
    '%': formatPct(item.percent),
    Positive: String(item.positive),
    Negative: String(item.negative),
    'Self-filtered': String(item.selfFiltered),
  }));

  const highScoreRows = summary.highlights.highScoreNotApplied.map(item => ({
    Company: item.company || 'Unknown',
    Role: item.role || 'Unknown',
    Score: formatScore(item.score),
    Status: item.status || 'Unknown',
    Track: item.track || 'Unknown',
  }));

  const lowScoreRows = summary.highlights.lowScoreApplied.map(item => ({
    Company: item.company || 'Unknown',
    Role: item.role || 'Unknown',
    Score: formatScore(item.score),
    Status: item.status || 'Unknown',
    Track: item.track || 'Unknown',
  }));

  const recommendationLines = summary.recommendations.map((item, index) => (
    `${index + 1}. **[${item.impact.toUpperCase()}]** ${item.action}\n   ${item.reasoning}`
  ));

  const sampleSizeNote = summary.metadata.enoughData
    ? ''
    : `\n> Sample-size note: only ${summary.metadata.progressedApplications}/${summary.metadata.minimumProgressedThreshold} applications have progressed beyond evaluation. Treat these findings as directional for now.\n`;

  return `# Pattern Analysis - ${today()}

**Applications analyzed:** ${summary.metadata.totalApplications}
**Reports analyzed:** ${summary.metadata.totalReports}
**Date range:** ${summary.metadata.dateRange.from ?? 'N/A'} to ${summary.metadata.dateRange.to ?? 'N/A'}
**Outcomes:** ${summary.metadata.outcomeCounts.positive} positive, ${summary.metadata.outcomeCounts.negative} negative, ${summary.metadata.outcomeCounts.selfFiltered} self-filtered, ${summary.metadata.outcomeCounts.pending} pending
${sampleSizeNote}
## Conversion Funnel

${formatTable(funnelRows, ['Stage', 'Count', '%'])}

## Score vs Outcome

${formatTable(scoreRows, ['Outcome', 'Avg Score', 'Min', 'Max', 'Count'])}

## Track Performance

${formatTable(trackRows, ['Track', 'Total', 'Positive', 'Conversion %'])}

## Career Stage Alignment

${formatTable(stageRows, ['Career Stage', 'Total', 'Positive', 'Conversion %'])}

## Authorization Patterns

${formatTable(authRows, ['Authorization Signal', 'Total', 'Positive', 'Conversion %'])}

## Top Blockers

${formatTable(blockerRows, ['Blocker', 'Count', '%', 'Positive', 'Negative', 'Self-filtered'])}

## Recommended Score Threshold

- Recommended floor: ${formatScore(summary.scoreThreshold.recommendedMinimumScore)}
- Positive range: ${formatScore(summary.scoreThreshold.positiveMin)} to ${formatScore(summary.scoreThreshold.positiveMax)}
- Highest negative or self-filtered score: ${formatScore(summary.scoreThreshold.negativeMax)}
- Reasoning: ${summary.scoreThreshold.reasoning}

## High-Score Roles Not Yet Converting

${formatTable(highScoreRows, ['Company', 'Role', 'Score', 'Status', 'Track'])}

## Low-Score Roles That Still Consumed Time

${formatTable(lowScoreRows, ['Company', 'Role', 'Score', 'Status', 'Track'])}

## Recommendations

${recommendationLines.join('\n\n')}
`;
}

function main() {
  const applications = parseApplicationsMarkdown(safeRead(applicationsPath));
  const reports = loadReports();
  const summary = summarizePatterns(applications, reports);
  const markdown = renderMarkdown(summary);

  if (wantsJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(markdown);
  }

  if (wantsWrite || explicitOut) {
    mkdirSync(join(ROOT, 'reports'), { recursive: true });
    writeFileSync(outPath, markdown, 'utf-8');
    console.error(`Wrote patterns report to ${outPath}`);
  }
}

main();
