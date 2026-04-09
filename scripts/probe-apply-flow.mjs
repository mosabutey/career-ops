#!/usr/bin/env node

/**
 * probe-apply-flow.mjs
 *
 * Lightweight Playwright probe for real ATS application flows.
 *
 * Purpose:
 * - validate live apply-surface behavior without submitting
 * - capture screenshots and a structured JSON summary
 * - stop at account creation, sign-in, or inaccessible handoff boundaries
 *
 * Usage:
 *   node scripts/probe-apply-flow.mjs --platform=workday --url="https://..." --slug=my-run
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'output', 'live-tests');

const STEP_PATTERNS = [
  /create account/i,
  /sign in/i,
  /my information/i,
  /my experience/i,
  /application questions/i,
  /voluntary disclosures/i,
  /self identify/i,
  /review\b/i,
];

const GATE_PATTERNS = [
  /create account/i,
  /already have an account/i,
  /sign in to apply/i,
  /log in to apply/i,
  /continue with email/i,
  /create your account/i,
];

const CTA_TEXTS = {
  ashby: ['Apply for this job', 'Apply', 'Application'],
  greenhouse: ['Apply', 'Apply Now', 'Apply for this job'],
  icims: ['Apply for this job', 'Apply Now', 'Apply'],
  lever: ['Apply for this job', 'Apply', 'Easy Apply'],
  workable: ['Apply for this job', 'Apply now', 'Apply'],
  workday: ['Apply', 'Apply Manually', 'Continue'],
  smartrecruiters: ["I'm interested", 'Apply', 'Apply now', 'Apply for this job'],
};

const WORKDAY_FOLLOW_UP_TEXTS = ['Apply Manually', 'Autofill with Resume', 'Use My Last Application', 'Continue'];

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    parsed[key] = rest.length ? rest.join('=') : 'true';
  }
  return parsed;
}

function slugify(value) {
  return String(value || 'probe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function summarizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function waitForSettled(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function dismissCookieBanner(page) {
  const labels = ['Accept all', 'Accept All', 'Accept', 'Agree', 'Allow all', 'Decline all', 'Decline All'];
  for (const label of labels) {
    const regex = new RegExp(`^${escapeRegex(label)}$`, 'i');
    const locators = [
      page.getByRole('button', { name: regex }),
      page.locator('button').filter({ hasText: regex }),
    ];
    for (const locator of locators) {
      const target = locator.first();
      try {
        if (await target.isVisible({ timeout: 500 })) {
          await target.click({ timeout: 2000 });
          await waitForSettled(page, 1000);
          return label;
        }
      } catch {
        // Ignore cookie banner dismissal failures.
      }
    }
  }
  return null;
}

async function clickLocatorAndFollow(locator, page, clicked, label) {
  const context = page.context();
  try {
    const popupPromise = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
    await locator.click({ timeout: 3000 });
    clicked.push(label);

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await waitForSettled(popup);
      return popup;
    }

    await waitForSettled(page);
    return page;
  } catch {
    return null;
  }
}

async function captureState(page, platform, slug, label, diagnostics) {
  const screenshotPath = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const bodyText = summarizeText(await page.evaluate(() => document.body?.innerText ?? ''));
  const html = await page.content();
  const title = await page.title();
  const url = page.url();
  const readyState = await page.evaluate(() => document.readyState);
  const frameUrls = page.frames().map((frame) => frame.url()).filter(Boolean);

  const controls = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };

    const bySelector = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible).length;
    const byRole = (role) => Array.from(document.querySelectorAll(`[role="${role}"]`)).filter(visible).length;
    const visibleCtas = Array.from(document.querySelectorAll('button, a'))
      .filter(visible)
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 30);

    return {
      textInputs: bySelector('input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="search"]'),
      textareas: bySelector('textarea'),
      nativeSelects: bySelector('select'),
      fileInputs: bySelector('input[type="file"]'),
      checkboxes: bySelector('input[type="checkbox"]') + byRole('checkbox'),
      radios: bySelector('input[type="radio"]') + byRole('radio'),
      comboboxes: byRole('combobox'),
      listboxes: byRole('listbox'),
      buttonsAndLinks: visibleCtas,
    };
  });

  const steps = unique(
    bodyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => STEP_PATTERNS.some((pattern) => pattern.test(line)))
  );

  const gateDetected = /\/login\b/i.test(url) || GATE_PATTERNS.some((pattern) => pattern.test(bodyText));
  const liveness = inferLiveness(bodyText, url);
  const handoffCategory = inferHandoffCategory({ platform, gateDetected, controls, bodyText, url });

  return {
    label,
    title,
    url,
      screenshot: `output/live-tests/${slug}-${label}.png`,
      contentChars: bodyText.length,
      htmlChars: html.length,
      readyState,
      liveness,
      controls,
      steps,
      gateDetected,
      handoffCategory,
      frameUrls,
      diagnostics,
      bodyPreview: bodyText.slice(0, 1200),
    };
}

function inferLiveness(bodyText, url) {
  if (/[?&]error=true/i.test(url)) return 'expired_or_redirected';
  if (/job not found/i.test(bodyText) || /\/notfound\//i.test(url)) return 'expired_or_redirected';
  if (/job (is )?no longer available|position has been filled|this job has expired|no longer accepting applications|page you are looking for doesn.t exist/i.test(bodyText)) {
    return 'expired_or_redirected';
  }
  if (/\bapply\b|i'm interested|apply now|start application|submit application/i.test(bodyText)) {
    return 'active';
  }
  if (bodyText.length < 300) {
    return 'uncertain_low_content';
  }
  return 'uncertain';
}

function inferHandoffCategory({ platform, gateDetected, controls, bodyText, url }) {
  if (/\/login\b/i.test(url)) {
    return 'account_gate';
  }
  if (/start your application today|autofill with resume|apply manually|use my last application/i.test(bodyText)) {
    return 'apply_launcher';
  }
  if (gateDetected) return 'account_gate';
  if (controls.fileInputs > 0 || controls.textInputs + controls.textareas + controls.nativeSelects + controls.comboboxes >= 3) {
    return 'inspectable_form';
  }
  if (platform === 'smartrecruiters' && bodyText.length < 500) {
    return 'blank_or_inaccessible_handoff';
  }
  if (/apply|i'm interested|start application/i.test(bodyText) && bodyText.length < 1200) {
    return 'posting_or_handoff_surface';
  }
  return 'unknown_surface';
}

async function clickBestCta(page, platform, clicked) {
  const candidates = CTA_TEXTS[platform] || CTA_TEXTS.greenhouse;

  for (const text of candidates) {
    const regex = new RegExp(`^${escapeRegex(text)}$`, 'i');
    const locators = [
      page.getByRole('button', { name: regex }),
      page.getByRole('link', { name: regex }),
      page.locator('button, a').filter({ hasText: regex }),
    ];

    for (const locator of locators) {
      const target = locator.first();
      try {
        if (await target.isVisible({ timeout: 1000 })) {
          const nextPage = await clickLocatorAndFollow(target, page, clicked, text);
          if (nextPage) return nextPage;
        }
      } catch {
        // Try next locator.
      }
    }
  }

  return null;
}

async function clickByCandidateTexts(page, texts, clicked) {
  for (const text of texts) {
    const regex = new RegExp(`^${escapeRegex(text)}$`, 'i');
    const locators = [
      page.getByRole('button', { name: regex }),
      page.getByRole('link', { name: regex }),
      page.locator('button, a').filter({ hasText: regex }),
    ];

    for (const locator of locators) {
      const target = locator.first();
      try {
        if (await target.isVisible({ timeout: 1000 })) {
          const nextPage = await clickLocatorAndFollow(target, page, clicked, text);
          if (nextPage) return nextPage;
        }
      } catch {
        // Try next locator.
      }
    }
  }
  return null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const platform = String(args.platform || '').toLowerCase();
  const url = args.url;
  const slug = slugify(args.slug || `${platform}-${new Date().toISOString().slice(0, 10)}`);

  if (!platform || !url) {
    console.error('Usage: node scripts/probe-apply-flow.mjs --platform=workday --url="https://..." --slug=my-run');
    process.exit(1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1600 },
  });
  let activePage = page;

  const clicked = [];
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'request failed'}`);
  });

  try {
    const response = await activePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForSettled(activePage, 3500);

    const states = [];
    states.push(await captureState(activePage, platform, slug, 'initial', {
      responseStatus: response?.status() ?? null,
      consoleMessages: consoleMessages.slice(0, 10),
      pageErrors: pageErrors.slice(0, 10),
      requestFailures: requestFailures.slice(0, 10),
    }));

    const cookieAction = await dismissCookieBanner(activePage);
    if (cookieAction) {
      clicked.push(`cookie:${cookieAction}`);
    }

    const postPrimaryPage = await clickBestCta(activePage, platform, clicked);
    if (postPrimaryPage) {
      activePage = postPrimaryPage;
      if (platform === 'workday') {
        const postFollowUpPage = await clickByCandidateTexts(activePage, WORKDAY_FOLLOW_UP_TEXTS, clicked);
        if (postFollowUpPage) {
          activePage = postFollowUpPage;
        }
      }
      states.push(await captureState(activePage, platform, slug, 'after-cta', {
        responseStatus: response?.status() ?? null,
        consoleMessages: consoleMessages.slice(0, 10),
        pageErrors: pageErrors.slice(0, 10),
        requestFailures: requestFailures.slice(0, 10),
      }));
    }

    const result = {
      date: new Date().toISOString().slice(0, 10),
      platform,
      inputUrl: url,
      slug,
      clickedCtas: clicked,
      states,
      finalUrl: activePage.url(),
      finalTitle: await activePage.title(),
    };

    const jsonPath = join(ARTIFACT_DIR, `${slug}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    console.log(JSON.stringify({
      platform,
      slug,
      clickedCtas: clicked,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      states: result.states.map((state) => ({
        label: state.label,
        liveness: state.liveness,
        handoffCategory: state.handoffCategory,
        gateDetected: state.gateDetected,
        steps: state.steps,
        controls: {
          textInputs: state.controls.textInputs,
          textareas: state.controls.textareas,
          nativeSelects: state.controls.nativeSelects,
          fileInputs: state.controls.fileInputs,
          checkboxes: state.controls.checkboxes,
          radios: state.controls.radios,
          comboboxes: state.controls.comboboxes,
          listboxes: state.controls.listboxes,
        },
        screenshot: state.screenshot,
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Probe failed: ${error.message}`);
  process.exit(1);
});
