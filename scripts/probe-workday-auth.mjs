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
  return String(value || 'workday-auth')
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

async function capture(page, slug, label, extra = {}) {
  const screenshot = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const bodyText = (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ').trim();
  const diagnostics = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0;
    };

    const errorSelectors = [
      '[role="alert"]',
      '.error',
      '.errors',
      '.validation',
      '.validationError',
      '.css-1f7v6np',
      '[data-automation-id*="error"]',
      '[aria-invalid="true"]',
    ];

    const errorTexts = Array.from(document.querySelectorAll(errorSelectors.join(',')))
      .filter(visible)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);

    const currentStep = Array.from(document.querySelectorAll('*'))
      .filter(visible)
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .find((text) => /^current step \d+ of \d+/i.test(text));

    return {
      inputs: Array.from(document.querySelectorAll('input'))
        .filter(visible)
        .map((input) => ({
          type: input.getAttribute('type') || 'text',
          name: input.getAttribute('name') || '',
          id: input.id || '',
          ariaLabel: input.getAttribute('aria-label') || '',
          placeholder: input.getAttribute('placeholder') || '',
        })),
      buttons: Array.from(document.querySelectorAll('button, a'))
        .filter(visible)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 40),
      errorTexts,
      currentStep: currentStep || '',
    };
  });

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    bodyPreview: bodyText.slice(0, 1600),
    fields: {
      inputs: diagnostics.inputs,
      buttons: diagnostics.buttons,
    },
    diagnostics: {
      errorTexts: diagnostics.errorTexts,
      currentStep: diagnostics.currentStep,
    },
    ...extra,
  };
}

async function fillCreateAccount(page, email, password) {
  const actions = [];

  const emailTargets = [
    page.locator('input[type="email"]').first(),
    page.getByLabel(/email/i).first(),
    page.getByPlaceholder(/email/i).first(),
  ];

  for (const target of emailTargets) {
    try {
      if (await target.isVisible({ timeout: 500 })) {
        await target.fill(email);
        actions.push('filled_email');
        break;
      }
    } catch {
      // Try next target.
    }
  }

  const passwordFields = page.locator('input[type="password"]');
  const count = await passwordFields.count();
  for (let i = 0; i < count; i++) {
    try {
      const field = passwordFields.nth(i);
      if (await field.isVisible({ timeout: 500 })) {
        await field.fill(password);
      }
    } catch {
      // Ignore individual field failure.
    }
  }
  if (count > 0) actions.push(`filled_password_fields:${count}`);

  try {
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 500 }) && !(await checkbox.isChecked())) {
      await checkbox.check();
      actions.push('checked_visible_checkbox');
    }
  } catch {
    // Ignore.
  }

  const next = await clickNamed(page, ['Create Account', 'Continue', 'Next', 'Submit']);
  if (next) actions.push(`clicked:${next}`);

  return actions;
}

function classifyAuthResult(state) {
  const preview = `${state.title} ${state.bodyPreview}`.toLowerCase();
  const errors = (state.diagnostics?.errorTexts || []).join(' ').toLowerCase();

  if (preview.includes('my information') || preview.includes('step 2 of 7')) {
    return 'advanced-past-account-gate';
  }

  if (state.url.includes('/login')) {
    return 'login-redirect-after-create-account';
  }

  if (errors.includes('password must include')) {
    return 'password-policy-rejected';
  }

  if (state.diagnostics?.errorTexts?.length) {
    return 'inline-validation-error';
  }

  if (preview.includes('create account')) {
    return 'remained-on-create-account';
  }

  return 'unknown';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-auth-${new Date().toISOString().slice(0, 10)}`);

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-auth.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 3000);

    const clicked = [];
    const cookie = await dismissCookieBanner(page);
    if (cookie) clicked.push(`cookie:${cookie}`);

    const states = [];
    states.push(await capture(page, slug, 'initial', { clicked }));

    const apply = await clickNamed(page, ['Apply']);
    if (apply) clicked.push(apply);
    const manual = await clickNamed(page, ['Apply Manually', 'Continue']);
    if (manual) clicked.push(manual);

    await wait(page, 4000);
    states.push(await capture(page, slug, 'gate', { clicked }));

    const authActions = await fillCreateAccount(page, email, password);
    await wait(page, 5000);
    const postAuthState = await capture(page, slug, 'post-auth-attempt', { clicked, authActions });
    postAuthState.authResult = classifyAuthResult(postAuthState);
    states.push(postAuthState);

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      clicked,
      states,
      authResult: postAuthState.authResult,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      clicked,
      authResult: result.authResult,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      states: states.map((state) => ({
        label: state.label,
        url: state.url,
        title: state.title,
        screenshot: state.screenshot,
        authResult: state.authResult,
        errors: state.diagnostics?.errorTexts || [],
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday auth probe failed: ${error.message}`);
  process.exit(1);
});
