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
  return String(value || 'workday-signin')
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
  await page.screenshot({ path: screenshot, fullPage: false });

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

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const inputs = Array.from(document.querySelectorAll('input'))
      .filter(visible)
      .map((input) => ({
        type: input.getAttribute('type') || 'text',
        id: input.id || '',
        name: input.getAttribute('name') || '',
      }))
      .slice(0, 20);
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter(visible)
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 25);
    const errors = Array.from(document.querySelectorAll('[role="alert"], .error, .errors, [data-automation-id*="error"]'))
      .filter(visible)
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 10);

    return { bodyText, inputs, buttons, errors };
  });

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    bodyPreview: diagnostics.bodyText.slice(0, 1600),
    inputs: diagnostics.inputs,
    buttons: diagnostics.buttons,
    errors: diagnostics.errors,
    ...extra,
  };
}

async function fillVisibleTextInput(page, value, preferredMatchers = []) {
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

  const dialog = page.locator('[role="dialog"], [aria-modal="true"], .modal').filter({ hasText: /sign in/i }).last();
  const locators = [];

  for (const pattern of preferredMatchers) {
    locators.push(dialog.getByLabel(pattern).last());
    locators.push(dialog.getByPlaceholder(pattern).last());
  }
  locators.push(dialog.locator('label').filter({ hasText: /email/i }).last());
  locators.push(dialog.locator('input[type="email"]').last());
  locators.push(dialog.locator('input[type="text"]').last());

  for (const pattern of preferredMatchers) {
    locators.push(page.getByLabel(pattern).last());
    locators.push(page.getByPlaceholder(pattern).last());
  }
  locators.push(page.locator('label').filter({ hasText: /email/i }).last());

  locators.push(page.locator('input[type="email"]').last());
  locators.push(page.locator('input[type="text"]').last());

  for (const locator of locators) {
    try {
      if (await locator.isVisible({ timeout: 500 })) {
        const tagName = await locator.evaluate((element) => element.tagName.toLowerCase());
        if (tagName === 'label') {
          await locator.click();
          await page.keyboard.press(process.platform === 'win32' ? 'Control+A' : 'Meta+A');
          await page.keyboard.type(value);
          return true;
        }
        await locator.fill(value);
        return true;
      }
    } catch {
      // Try next locator.
    }
  }

  return false;
}

async function fillVisiblePassword(page, value) {
  const dialog = page.locator('[role="dialog"], [aria-modal="true"], .modal').filter({ hasText: /sign in/i }).last();
  const locators = [
    dialog.locator('input[type="password"]').last(),
    page.locator('input[type="password"]').last(),
  ];

  for (const locator of locators) {
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.fill(value);
        return true;
      }
    } catch {
      // Try next locator.
    }
  }
  return false;
}

function classifyResult(state) {
  const preview = `${state.title} ${state.bodyPreview}`.toLowerCase();
  const errors = state.errors.join(' ').toLowerCase();

  if (preview.includes('my information') && !preview.includes('create account')) {
    return 'advanced-to-my-information';
  }

  if (preview.includes("please enter a valid email") || preview.includes('please enter your password')) {
    return 'signin-modal-validation-error';
  }

  if (preview.includes("don't have an account yet?") && preview.includes('sign in')) {
    return 'signin-modal-still-open';
  }

  if (preview.includes('current step 1 of 7') && preview.includes('create account')) {
    return 'returned-to-create-account';
  }

  if (state.url.includes('/login/error')) {
    return 'login-error-boundary';
  }

  if (state.url.includes('/login')) {
    return 'login-boundary';
  }

  if (errors) {
    return 'inline-signin-error';
  }

  return 'unknown';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-signin-${new Date().toISOString().slice(0, 10)}`);

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-signin.mjs --url="https://..." --slug=my-run');
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

    const initial = await capture(page, slug, 'initial', { clicked });

    const apply = await clickNamed(page, ['Apply']);
    if (apply) clicked.push(apply);
    const manual = await clickNamed(page, ['Apply Manually', 'Continue']);
    if (manual) clicked.push(manual);
    await wait(page, 3000);

    const gate = await capture(page, slug, 'gate', { clicked });

    const signIn = await clickNamed(page, ['Sign In']);
    if (signIn) clicked.push(signIn);
    await wait(page, 3000);

    const signInPage = await capture(page, slug, 'signin', { clicked });

    const authActions = [];
    if (await fillVisibleTextInput(page, email, [/email/i, /username/i])) {
      authActions.push('filled_email');
    }
    if (await fillVisiblePassword(page, password)) {
      authActions.push('filled_password');
    }

    const submit = await clickNamed(page, ['Sign In', 'Submit', 'Continue']);
    if (submit) authActions.push(`clicked:${submit}`);
    await wait(page, 5000);

    const postSignIn = await capture(page, slug, 'post-signin', { clicked, authActions });
    postSignIn.signInResult = classifyResult(postSignIn);

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      clicked,
      states: [initial, gate, signInPage, postSignIn],
      signInResult: postSignIn.signInResult,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      signInResult: result.signInResult,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      states: result.states.map((state) => ({
        label: state.label,
        url: state.url,
        title: state.title,
        screenshot: state.screenshot,
        errors: state.errors,
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday sign-in probe failed: ${error.message}`);
  process.exit(1);
});
