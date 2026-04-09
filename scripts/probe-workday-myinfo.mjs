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
  return String(value || 'workday-myinfo')
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
        // Try next locator.
      }
    }
  }
  return null;
}

async function dismissCookieBanner(page) {
  return clickNamed(page, ['Accept Cookies', 'Accept all', 'Accept All', 'Accept']);
}

async function fillVisibleTextInput(page, value) {
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
      // Try next candidate.
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
          await candidate.fill(value);
          return true;
        }
      } catch {
        // Try next candidate.
      }
    }
  }

  return false;
}

async function fillVisiblePassword(page, value) {
  const locator = page.locator('input[type="password"]').last();
  try {
    if (await locator.isVisible({ timeout: 1000 })) {
      await locator.fill(value);
      return true;
    }
  } catch {
    // Ignore.
  }
  return false;
}

async function capture(page, slug, label, extra = {}) {
  const screenshot = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });

  const state = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };

    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const bodyText = clean(document.body?.innerText || '');

    const stepText = Array.from(document.querySelectorAll('*'))
      .filter(visible)
      .map((el) => clean(el.textContent))
      .find((text) => /^my information$/i.test(text) || /^current step \d+ of \d+/i.test(text));

    const controls = [];
    const seen = new Set();

    const inferLabel = (element) => {
      const aria = clean(element.getAttribute('aria-label'));
      if (aria) return aria;

      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/).filter(Boolean);
        const text = ids
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((node) => clean(node.textContent))
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      }

      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label) return clean(label.textContent);
      }

      const labelish = element.closest('label, [data-automation-id="formField"], fieldset, [role="group"], [data-automation-id="promptOption"]');
      if (labelish) {
        const labelText = clean(labelish.textContent);
        if (labelText) return labelText;
      }

      const row = element.closest('[data-automation-id], .css-175oi2r, .WQ4Jod');
      if (row) {
        const texts = Array.from(row.querySelectorAll('label, legend, span, div'))
          .filter(visible)
          .map((node) => clean(node.textContent))
          .filter(Boolean)
          .slice(0, 6);
        if (texts.length) return texts.join(' ');
      }

      return '';
    };

    const pushControl = (element, type) => {
      const id = element.id || '';
      const name = element.getAttribute('name') || '';
      const key = `${type}:${id}:${name}:${clean(element.getAttribute('aria-label'))}`;
      if (seen.has(key)) return;
      seen.add(key);

      const label = inferLabel(element);
      const value = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? clean(element.value)
        : clean(element.textContent);
      const required = element.matches('[required], [aria-required="true"]')
        || /\*/.test(label)
        || /required field/i.test(label);

      controls.push({
        type,
        id,
        name,
        label,
        required,
        value,
      });
    };

    for (const input of document.querySelectorAll('input')) {
      if (!visible(input)) continue;
      const type = input.getAttribute('type') || 'text';
      pushControl(input, `input:${type}`);
    }

    for (const select of document.querySelectorAll('select')) {
      if (!visible(select)) continue;
      pushControl(select, 'select');
    }

    for (const textarea of document.querySelectorAll('textarea')) {
      if (!visible(textarea)) continue;
      pushControl(textarea, 'textarea');
    }

    for (const combo of document.querySelectorAll('[role="combobox"]')) {
      if (!visible(combo)) continue;
      pushControl(combo, 'combobox');
    }

    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter(visible)
      .map((element) => clean(element.textContent))
      .filter(Boolean)
      .slice(0, 30);

    return {
      bodyPreview: bodyText.slice(0, 2000),
      stepText: stepText || '',
      controls,
      buttons,
    };
  });

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    ...state,
    ...extra,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-myinfo-${new Date().toISOString().slice(0, 10)}`);

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-myinfo.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 3000);

    const clicked = [];
    const cookie = await dismissCookieBanner(page);
    if (cookie) clicked.push(`cookie:${cookie}`);

    const apply = await clickNamed(page, ['Apply']);
    if (apply) clicked.push(apply);
    const manual = await clickNamed(page, ['Apply Manually', 'Continue']);
    if (manual) clicked.push(manual);
    await wait(page, 3000);

    const signIn = await clickNamed(page, ['Sign In']);
    if (signIn) clicked.push(signIn);
    await wait(page, 2000);

    const authActions = [];
    if (await fillVisibleTextInput(page, email)) authActions.push('filled_email');
    if (await fillVisiblePassword(page, password)) authActions.push('filled_password');
    const submit = await clickNamed(page, ['Sign In']);
    if (submit) authActions.push(`clicked:${submit}`);
    await wait(page, 5000);

    const myInfo = await capture(page, slug, 'myinfo', { clicked, authActions });

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      clicked,
      authActions,
      myInfo,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      stepText: myInfo.stepText,
      controlCount: myInfo.controls.length,
      screenshot: myInfo.screenshot,
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday My Information probe failed: ${error.message}`);
  process.exit(1);
});
