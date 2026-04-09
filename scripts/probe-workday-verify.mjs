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
  return String(value || 'workday-verify')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function wait(page, ms = 2500) {
  await page.waitForTimeout(ms);
}

async function capture(page, slug, label) {
  const screenshot = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const snapshot = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const inputs = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || '',
        id: element.id || '',
        name: element.getAttribute('name') || '',
        placeholder: element.getAttribute('placeholder') || '',
      }))
      .slice(0, 40);
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter(visible)
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40);

    return { bodyText, inputs, buttons };
  });

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    bodyPreview: snapshot.bodyText.slice(0, 1600),
    inputs: snapshot.inputs,
    buttons: snapshot.buttons,
  };
}

function classify(state) {
  const preview = `${state.title} ${state.bodyPreview}`.toLowerCase();

  if (preview.includes('my information') || preview.includes('application questions')) {
    return 'advanced-into-application';
  }

  if (state.url.includes('/login')) {
    return 'login-boundary';
  }

  if (preview.includes('verify') && preview.includes('email')) {
    return 'verification-still-pending';
  }

  if (preview.includes('create account')) {
    return 'returned-to-create-account';
  }

  if (state.inputs.length > 0) {
    return 'interactive-page';
  }

  return 'unknown';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.url;
  const slug = slugify(args.slug || `workday-verify-${new Date().toISOString().slice(0, 10)}`);

  if (!url) {
    console.error('Usage: node scripts/probe-workday-verify.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 5000);

    const state = await capture(page, slug, 'activation');
    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      activationResult: classify(state),
      state,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      activationResult: result.activationResult,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      screenshot: state.screenshot,
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday verification probe failed: ${error.message}`);
  process.exit(1);
});
