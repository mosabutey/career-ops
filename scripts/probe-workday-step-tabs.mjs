#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'output', 'live-tests');

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
  return String(value || 'workday-step-tabs')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function wait(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function clickNamed(page, names) {
  for (const name of names) {
    const regex = new RegExp(`^${escapeRegex(name)}$`, 'i');
    const locators = [
      page.getByRole('button', { name: regex }),
      page.getByRole('link', { name: regex }),
      page.locator('button, a').filter({ hasText: regex }),
    ];
    for (const locator of locators) {
      const target = locator.first();
      try {
        if (await target.isVisible({ timeout: 1000 })) {
          await target.click({ timeout: 4000 });
          await wait(page, 2000);
          return name;
        }
      } catch {
        // try next locator
      }
    }
  }
  return null;
}

async function dismissCookieBanner(page) {
  return clickNamed(page, ['Accept Cookies', 'Accept all', 'Accept All', 'Accept']);
}

async function fillSignIn(page, email, password) {
  const passwordCandidates = page.locator('input[type="password"]');
  let modalPasswordBox = null;

  for (let index = await passwordCandidates.count() - 1; index >= 0; index -= 1) {
    const candidate = passwordCandidates.nth(index);
    try {
      if (await candidate.isVisible({ timeout: 500 })) {
        const box = await candidate.boundingBox();
        if (box) {
          modalPasswordBox = box;
          break;
        }
      }
    } catch {
      // try next candidate
    }
  }

  if (modalPasswordBox) {
    const textCandidates = page.locator('input[type="email"], input[type="text"]');
    for (let index = await textCandidates.count() - 1; index >= 0; index -= 1) {
      const candidate = textCandidates.nth(index);
      try {
        if (!(await candidate.isVisible({ timeout: 500 }))) continue;
        const box = await candidate.boundingBox();
        if (!box) continue;
        const alignedX = Math.abs(box.x - modalPasswordBox.x) < 80;
        const abovePassword = box.y < modalPasswordBox.y;
        const closeY = modalPasswordBox.y - box.y < 140;
        const similarWidth = Math.abs(box.width - modalPasswordBox.width) < 120;
        if (alignedX && abovePassword && closeY && similarWidth) {
          await candidate.fill(email);
          break;
        }
      } catch {
        // try next candidate
      }
    }
  }

  const passwordField = page.locator('input[type="password"]').last();
  if (await passwordField.isVisible({ timeout: 1000 })) {
    await passwordField.fill(password);
  }

  await clickNamed(page, ['Sign In']);
  await wait(page, 5000);
}

async function capture(page, slug, label, extra = {}) {
  const screenshot = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const data = await page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const bodyText = clean(document.body?.innerText || '');
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .map((node) => clean(node.textContent))
      .filter(Boolean)
      .slice(0, 20);
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .map((node) => clean(node.textContent))
      .filter(Boolean)
      .slice(0, 30);
    return { bodyPreview: bodyText.slice(0, 1600), headings, buttons };
  });

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    ...data,
    ...extra,
  };
}

async function tryStep(page, stepName) {
  const regex = new RegExp(stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const candidates = [
    page.getByRole('link', { name: regex }),
    page.getByRole('button', { name: regex }),
    page.locator('a, button, div, span').filter({ hasText: regex }),
  ];

  for (const locator of candidates) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 4000 });
        await wait(page, 3000);
        return true;
      }
    } catch {
      // try next locator
    }
  }

  return false;
}

function classifyStepCapture(stepName, state) {
  const text = `${state.title} ${state.bodyPreview}`.toLowerCase();
  const normalized = stepName.toLowerCase();
  if (text.includes(normalized)) return 'visible-after-click';
  if (text.includes('my information')) return 'remained-on-my-information';
  return 'unclear';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-step-tabs-${new Date().toISOString().slice(0, 10)}`);

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-step-tabs.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 3000);

    await dismissCookieBanner(page);
    await clickNamed(page, ['Apply']);
    await clickNamed(page, ['Apply Manually', 'Continue']);
    await wait(page, 3000);
    await clickNamed(page, ['Sign In']);
    await wait(page, 2000);
    await fillSignIn(page, email, password);

    const startState = await capture(page, slug, 'my-information');
    const steps = ['My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review'];
    const results = [];

    for (const stepName of steps) {
      const clicked = await tryStep(page, stepName);
      const label = stepName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const state = await capture(page, slug, label, { stepName, clicked });
      results.push({
        stepName,
        clicked,
        classification: classifyStepCapture(stepName, state),
        state,
      });
    }

    const output = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      startState,
      results,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(output, null, 2));
    console.log(JSON.stringify({
      slug,
      startState: startState.screenshot,
      results: results.map((result) => ({
        stepName: result.stepName,
        clicked: result.clicked,
        classification: result.classification,
        screenshot: result.state.screenshot,
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday step-tabs probe failed: ${error.message}`);
  process.exit(1);
});
