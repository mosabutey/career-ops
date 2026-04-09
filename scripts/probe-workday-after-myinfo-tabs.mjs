#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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
  return String(value || 'workday-after-myinfo-tabs')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSimpleYaml(path) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('- ')) continue;
    const match = line.match(/^(\s*)([A-Za-z0-9_]+):(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const key = match[2];
    const rest = match[3];
    while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.at(-1).node;
    const trimmed = rest.trim();
    if (!trimmed) {
      parent[key] = {};
      stack.push({ indent, node: parent[key] });
    } else {
      parent[key] = parseScalar(trimmed);
    }
  }
  return root;
}

function get(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj) ?? fallback;
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
          await wait(page, 1500);
          return name;
        }
      } catch {
        // Try next.
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
      // Try next.
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
        // Try next.
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

async function fillById(page, id, value) {
  if (value === '' || value === undefined || value === null) return false;
  const locator = page.locator(`#${id}`);
  try {
    if (await locator.isVisible({ timeout: 1000 })) {
      await locator.fill(String(value));
      return true;
    }
  } catch {
    // Ignore.
  }
  return false;
}

async function setRadioByLabel(page, labelText) {
  const regex = new RegExp(`^${escapeRegex(labelText)}$`, 'i');
  const targets = [page.getByLabel(regex), page.getByText(regex)];
  for (const locator of targets) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        await wait(page, 800);
        return true;
      }
    } catch {
      // Ignore.
    }
  }
  return false;
}

async function getPickerHandle(page, label) {
  const handle = await page.evaluateHandle((targetLabel) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const labels = Array.from(document.querySelectorAll('label, span, div')).filter(visible);
    const labelNode = labels.find((node) => clean(node.textContent) === targetLabel || clean(node.textContent) === `${targetLabel}*`);
    if (!labelNode) return null;
    const labelBox = labelNode.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], [role="combobox"]')).filter(visible);
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect();
      const dx = Math.abs(box.left - labelBox.left);
      const dy = box.top - labelBox.bottom;
      if (dy < -20 || dy > 140) continue;
      const score = dx + Math.abs(dy);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }, label);
  return handle.asElement();
}

async function setPickerByLabel(page, label, value) {
  const handle = await getPickerHandle(page, label);
  if (!handle) return false;
  try {
    await handle.click({ timeout: 4000 });
    await wait(page, 1000);
  } catch {
    return false;
  }
  const locators = [
    page.getByRole('option', { name: new RegExp(`^${escapeRegex(value)}$`, 'i') }),
    page.getByText(new RegExp(`^${escapeRegex(value)}$`, 'i')),
  ];
  for (const locator of locators) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        await wait(page, 1000);
        return true;
      }
    } catch {
      // Try next.
    }
  }
  return false;
}

async function setWorkdaySource(page) {
  const locator = page.locator('#source--source');
  if (!(await locator.isVisible({ timeout: 1000 }))) return false;
  try {
    await page.keyboard.press('Escape');
  } catch {
    // Ignore.
  }
  await locator.focus();
  await locator.fill('Career');
  await wait(page, 1200);
  await page.keyboard.press('ArrowDown');
  await wait(page, 300);
  await page.keyboard.press('Enter');
  await wait(page, 800);
  const leaf = page.getByText(/^Medtronic Career Site$/i).first();
  if (await leaf.isVisible({ timeout: 1000 })) {
    await leaf.click({ timeout: 3000 });
    await wait(page, 1000);
    return true;
  }
  return false;
}

async function capture(page, slug, label, extra = {}) {
  const screenshot = join(ARTIFACT_DIR, `${slug}-${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const state = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40);
    return { bodyPreview: bodyText.slice(0, 2200), headings, buttons };
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

async function clickStep(page, stepName) {
  const regex = new RegExp(`^${escapeRegex(stepName)}$`, 'i');
  const locators = [
    page.getByRole('link', { name: regex }),
    page.getByRole('button', { name: regex }),
    page.getByText(regex),
  ];
  for (const locator of locators) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        await wait(page, 3000);
        return true;
      }
    } catch {
      // Try next.
    }
  }
  return false;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-after-myinfo-tabs-${new Date().toISOString().slice(0, 10)}`);
  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-after-myinfo-tabs.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  const profile = parseSimpleYaml(join(ROOT, 'config', 'profile.yml'));
  const defaults = get(profile, 'application_defaults', {});
  const candidate = get(profile, 'candidate', {});
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 3000);
    await dismissCookieBanner(page);
    await clickNamed(page, ['Apply']);
    await clickNamed(page, ['Apply Manually', 'Continue']);
    await wait(page, 2000);
    await clickNamed(page, ['Sign In']);
    await wait(page, 1500);
    await fillSignIn(page, email, password);

    await setWorkdaySource(page);
    await setRadioByLabel(page, defaults.prior_medtronic_employment ? 'Yes' : 'No');
    await setPickerByLabel(page, 'Country', defaults.country || candidate.country);
    await fillById(page, 'name--legalName--firstName', defaults.first_name);
    await fillById(page, 'name--legalName--lastName', defaults.last_name);
    await fillById(page, 'address--addressLine1', defaults.address_line_1);
    await fillById(page, 'address--city', defaults.city);
    await setPickerByLabel(page, 'State', defaults.state);
    await fillById(page, 'address--postalCode', defaults.postal_code);
    await fillById(page, 'address--regionSubdivision1', defaults.county);
    await setPickerByLabel(page, 'Phone Device Type', defaults.phone_device_type);
    await setPickerByLabel(page, 'Country Phone Code', 'United States of America (+1)');
    await fillById(page, 'phoneNumber--phoneNumber', candidate.phone);

    await clickNamed(page, ['Save and Continue']);
    await wait(page, 5000);
    const current = await capture(page, slug, 'myexperience');
    if (!/My Experience/i.test(current.bodyPreview)) {
      await clickNamed(page, ['Save and Continue']);
      await wait(page, 5000);
    }

    const steps = ['My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review'];
    const results = [];
    for (const stepName of steps) {
      if (stepName !== 'My Experience') {
        await clickStep(page, stepName);
      }
      const label = stepName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const state = await capture(page, slug, label, { stepName });
      results.push({ stepName, state });
    }

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      results,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      results: results.map((item) => ({
        stepName: item.stepName,
        heading: item.state.headings[1] || item.state.headings[0] || '',
        screenshot: item.state.screenshot,
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday post-MyInformation tab probe failed: ${error.message}`);
  process.exit(1);
});
