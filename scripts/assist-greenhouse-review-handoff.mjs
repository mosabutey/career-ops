#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACT_DIR = join(ROOT, 'output', 'live-tests');
const SESSION_ROOT = join(ROOT, 'output', 'browser-sessions');

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    parsed[key] = rest.length ? rest.join('=') : 'true';
  }
  return parsed;
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

    while (stack.length > 1 && stack.at(-1).indent >= indent) {
      stack.pop();
    }

    const parent = stack.at(-1).node;
    const trimmed = rest.trim();
    if (!trimmed) {
      parent[key] = {};
      stack.push({ indent, node: parent[key] });
      continue;
    }

    parent[key] = parseScalar(trimmed);
  }

  return root;
}

function get(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj) ?? fallback;
}

function mergeObjects(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
      output[key] = mergeObjects(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return String(value || 'greenhouse-review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveLocalPath(value) {
  if (!value) return '';
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return value;
  }
  return join(ROOT, value);
}

function byIdSelector(id) {
  return `[id="${String(id).replace(/"/g, '\\"')}"]`;
}

async function wait(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function dismissCookieBanner(page) {
  for (const label of ['Allow', 'Accept', 'Accept all', 'Accept All']) {
    try {
      const target = page.getByRole('button', { name: new RegExp(`^${escapeRegex(label)}$`, 'i') }).first();
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        await wait(page, 1000);
        return label;
      }
    } catch {
      // Ignore cookie banner failures.
    }
  }
  return '';
}

async function collectVisibleLabels(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    return Array.from(document.querySelectorAll('label'))
      .filter(visible)
      .map((label) => ({
        text: (label.textContent || '').replace(/\s+/g, ' ').trim(),
        htmlFor: label.getAttribute('for') || '',
      }));
  });
}

async function findLabel(page, patterns) {
  const labels = await collectVisibleLabels(page);
  for (const pattern of patterns) {
    const match = labels.find((label) => pattern.test(label.text));
    if (match) return match;
  }
  return null;
}

async function findTextControl(page, patterns) {
  const label = await findLabel(page, patterns);
  if (!label) return null;

  if (label.htmlFor) {
    const direct = page.locator(byIdSelector(label.htmlFor));
    if (await direct.count()) return { label, locator: direct.first() };
  }

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (await labelLocator.count()) {
      const wrapped = labelLocator.locator('input, textarea').first();
      if (await wrapped.count()) return { label, locator: wrapped };

      const nearby = labelLocator.locator('xpath=following::*[self::input or self::textarea][1]').first();
      if (await nearby.count()) return { label, locator: nearby };
    }
  }

  return null;
}

async function fillTextField(page, patterns, value) {
  const target = await findTextControl(page, patterns);
  if (!target || value === undefined || value === null) return false;
  await target.locator.scrollIntoViewIfNeeded().catch(() => {});
  await target.locator.fill('');
  await target.locator.fill(String(value));
  await target.locator.blur().catch(() => {});
  return true;
}

async function fillDirectField(page, selectors, value) {
  if (value === undefined || value === null) return false;
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.count()) {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.fill('');
      await target.fill(String(value));
      await target.blur().catch(() => {});
      return true;
    }
  }
  return false;
}

async function uploadFileField(page, patterns, filePath, options = {}) {
  if (!filePath) return false;
  const filename = basename(filePath);
  if (typeof options.attachButtonIndex === 'number') {
    const attachButton = page.getByRole('button', { name: /^Attach$/i }).nth(options.attachButtonIndex);
    if (await attachButton.count()) {
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }),
          attachButton.click({ timeout: 3000 }),
        ]);
          await chooser.setFiles(filePath);
          await wait(page, 600);
          if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
          return true;
        } catch {
          // Fall back to direct selectors.
        }
      }
    }

  const directSelectors = options.directSelectors || [];
  for (const selector of directSelectors) {
    const input = page.locator(selector).first();
    if (await input.count()) {
      await input.setInputFiles(filePath);
      await wait(page, 300);
      const uploaded = await input.evaluate((node) => (node instanceof HTMLInputElement ? node.files?.length || 0 : 0)).catch(() => 0);
      if (uploaded > 0) return true;
      if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
    }
  }

  if (typeof options.fileIndex === 'number') {
    const indexed = page.locator('input[type="file"]').nth(options.fileIndex);
    if (await indexed.count()) {
      await indexed.setInputFiles(filePath);
      await wait(page, 300);
      const uploaded = await indexed.evaluate((node) => (node instanceof HTMLInputElement ? node.files?.length || 0 : 0)).catch(() => 0);
      if (uploaded > 0) return true;
      if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
    }
  }

  const label = await findLabel(page, patterns);
  if (!label) return false;

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (await labelLocator.count()) {
      const localAttach = labelLocator.locator('xpath=following::button[normalize-space()="Attach"][1]').first();
      if (await localAttach.count()) {
        try {
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            localAttach.click({ timeout: 3000 }),
          ]);
          await chooser.setFiles(filePath);
          await wait(page, 600);
          if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
          return true;
        } catch {
          // Continue to other strategies.
        }
      }
    }
  }

  if (label.htmlFor) {
    const input = page.locator(byIdSelector(label.htmlFor));
    if (await input.count()) {
      await input.setInputFiles(filePath);
      await wait(page, 300);
      const uploaded = await input.evaluate((node) => (node instanceof HTMLInputElement ? node.files?.length || 0 : 0)).catch(() => 0);
      if (uploaded > 0) return true;
      if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
    }
  }

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (await labelLocator.count()) {
      const input = labelLocator.locator('xpath=following::*[self::input and @type="file"][1]').first();
      if (await input.count()) {
        await input.setInputFiles(filePath);
        await wait(page, 300);
        const uploaded = await input.evaluate((node) => (node instanceof HTMLInputElement ? node.files?.length || 0 : 0)).catch(() => 0);
        if (uploaded > 0) return true;
        if (await page.getByText(new RegExp(escapeRegex(filename), 'i')).count().catch(() => 0)) return true;
      }
    }
  }

  return false;
}

async function commitActiveOption(page, locator) {
  const activeDescendant = await locator.getAttribute('aria-activedescendant').catch(() => '');
  if (!activeDescendant) return false;

  const activeOption = page.locator(byIdSelector(activeDescendant)).first();
  if (await activeOption.count()) {
    await activeOption.click({ timeout: 3000 }).catch(() => {});
    await wait(page, 250);
    return true;
  }

  await page.keyboard.press('Enter').catch(() => {});
  await wait(page, 250);
  return true;
}

async function chooseOption(page, optionText) {
  const exact = page.getByRole('option', { name: new RegExp(`^${escapeRegex(optionText)}$`, 'i') }).first();
  if (await exact.count()) {
    await exact.click({ timeout: 3000 });
    return true;
  }

  const partial = page.getByRole('option', { name: new RegExp(escapeRegex(optionText), 'i') }).first();
  if (await partial.count()) {
    await partial.click({ timeout: 3000 });
    return true;
  }

  const fallback = page.locator('[role="option"], [id*="-option-"]').filter({ hasText: new RegExp(escapeRegex(optionText), 'i') }).first();
  if (await fallback.count()) {
    await fallback.click({ timeout: 3000 });
    return true;
  }

  return false;
}

async function findCombobox(page, patterns) {
  const label = await findLabel(page, patterns);
  if (!label) return null;

  if (label.htmlFor) {
    const direct = page.locator(byIdSelector(label.htmlFor));
    if (await direct.count()) return { label, locator: direct.first() };
  }

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (!await labelLocator.count()) continue;

    const input = labelLocator.locator('xpath=following::*[(self::input and (@role="combobox" or @aria-autocomplete="list")) or self::*[@role="combobox"]][1]').first();
    if (await input.count()) return { label, locator: input };

    const sibling = labelLocator.locator('xpath=..//*[(@role="combobox") or (self::input and @aria-autocomplete="list")]').first();
    if (await sibling.count()) return { label, locator: sibling };
  }

  return null;
}

async function selectComboboxValue(page, patterns, value) {
  if (!cleanText(value)) return false;
  const target = await findCombobox(page, patterns);
  if (!target) return false;

  await target.locator.scrollIntoViewIfNeeded().catch(() => {});
  await target.locator.click({ timeout: 3000 });
  await wait(page, 250);

  try {
    await target.locator.fill('');
    await target.locator.fill(String(value));
  } catch {
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.type(String(value), { delay: 20 });
  }

  await wait(page, 500);
  if (await commitActiveOption(page, target.locator)) {
    return true;
  }
  if (await chooseOption(page, String(value))) {
    await wait(page, 250);
    return true;
  }

  await page.keyboard.press('ArrowDown').catch(() => {});
  await wait(page, 150);
  await page.keyboard.press('Enter').catch(() => {});
  await wait(page, 250);
  return true;
}

async function selectComboboxFromCandidates(page, patterns, candidates) {
  for (const candidate of candidates.map(cleanText).filter(Boolean)) {
    if (await selectComboboxValue(page, patterns, candidate)) {
      return candidate;
    }
  }
  return '';
}

async function selectFieldValue(page, patterns, candidates) {
  const label = await findLabel(page, patterns);
  if (label?.htmlFor) {
    const direct = page.locator(byIdSelector(label.htmlFor)).first();
    if (await direct.count()) {
      const tag = await direct.evaluate((node) => node.tagName.toLowerCase()).catch(() => '');
      if (tag === 'select') {
        const options = await direct.locator('option').allTextContents().catch(() => []);
        for (const candidate of candidates.map(cleanText).filter(Boolean)) {
          const exact = options.find((option) => option.trim().toLowerCase() === candidate.toLowerCase());
          if (exact) {
            await direct.selectOption({ label: exact });
            return exact;
          }
          const partial = options.find((option) => option.trim().toLowerCase().includes(candidate.toLowerCase()));
          if (partial) {
            await direct.selectOption({ label: partial });
            return partial;
          }
        }
      }
    }
  }

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (await labelLocator.count()) {
      const nearbySelect = labelLocator.locator('xpath=following::*[self::select][1]').first();
      if (await nearbySelect.count()) {
        const options = await nearbySelect.locator('option').allTextContents().catch(() => []);
        for (const candidate of candidates.map(cleanText).filter(Boolean)) {
          const exact = options.find((option) => option.trim().toLowerCase() === candidate.toLowerCase());
          if (exact) {
            await nearbySelect.selectOption({ label: exact });
            return exact;
          }
          const partial = options.find((option) => option.trim().toLowerCase().includes(candidate.toLowerCase()));
          if (partial) {
            await nearbySelect.selectOption({ label: partial });
            return partial;
          }
        }
      }
    }
  }

  return selectComboboxFromCandidates(page, patterns, candidates);
}

async function clickVisibleText(page, text) {
  const regex = new RegExp(`^${escapeRegex(text)}$`, 'i');
  const targets = [
    page.getByLabel(regex).first(),
    page.getByText(regex).first(),
    page.locator('label').filter({ hasText: regex }).first(),
  ];

  for (const target of targets) {
    try {
      if (await target.count() && await target.isVisible({ timeout: 500 })) {
        await target.click({ timeout: 3000 });
        return true;
      }
    } catch {
      // Try next target.
    }
  }

  return false;
}

async function setChoiceByLabel(page, text) {
  const regex = new RegExp(`^${escapeRegex(text)}$`, 'i');
  const control = page.getByLabel(regex).first();
  try {
    if (await control.count()) {
      await control.check({ force: true, timeout: 3000 }).catch(async () => {
        await control.click({ force: true, timeout: 3000 });
      });
      return true;
    }
  } catch {
    // Fall through to label click.
  }

  const labelNode = page.locator('label').filter({ hasText: regex }).first();
  if (await labelNode.count()) {
    await labelNode.click({ force: true, timeout: 3000 }).catch(() => {});
    return true;
  }

  return clickVisibleText(page, text);
}

async function ensureCheckbox(page, patterns, desired = true) {
  const label = await findLabel(page, patterns);
  if (label?.htmlFor) {
    const checkbox = page.locator(byIdSelector(label.htmlFor)).first();
    if (await checkbox.count()) {
      const checked = await checkbox.isChecked().catch(() => false);
      if (checked !== desired) {
        await checkbox.click({ timeout: 3000 });
      }
      return true;
    }
  }

  for (const pattern of patterns) {
    const labelLocator = page.locator('label').filter({ hasText: pattern }).first();
    if (await labelLocator.count()) {
      const checkbox = labelLocator.locator('input[type="checkbox"]').first();
      if (await checkbox.count()) {
        const checked = await checkbox.isChecked().catch(() => false);
        if (checked !== desired) {
          await checkbox.click({ timeout: 3000 });
        }
        return true;
      }

      const nearby = labelLocator.locator('xpath=preceding::*[self::input[@type="checkbox"]][1] | following::*[self::input[@type="checkbox"]][1]').first();
      if (await nearby.count()) {
        const checked = await nearby.isChecked().catch(() => false);
        if (checked !== desired) {
          await nearby.click({ timeout: 3000 });
        }
        return true;
      }
    }
  }

  return false;
}

async function setPhone(page, phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  const countryInput = page.locator('#phone_country').first();
  if (await countryInput.count()) {
    await countryInput.selectOption({ label: /United States/i }).catch(() => {});
  }
  const countryCombobox = page.locator('#country').first();
  if (await countryCombobox.count()) {
    await countryCombobox.click({ timeout: 3000 }).catch(() => {});
    await countryCombobox.fill('United States').catch(() => {});
    await wait(page, 400);
    await commitActiveOption(page, countryCombobox);
  }
  if (!await fillDirectField(page, ['#phone', 'input[name="phone"]', 'input[type="tel"]'], digits)) {
    await fillTextField(page, [/^Phone\*?$/i], digits);
  }
}

async function injectHandoffBanner(page, titleText) {
  await page.evaluate((title) => {
    const existing = document.getElementById('codex-greenhouse-handoff-helper');
    if (existing) existing.remove();

    const helper = document.createElement('div');
    helper.id = 'codex-greenhouse-handoff-helper';
    helper.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Career-Ops handoff</div>
      <div style="font-size:12px;line-height:1.4;margin-bottom:8px;">This application is filled and parked at the final Greenhouse form. Review answers, then use the page's own Submit application button.</div>
      <div style="font-size:11px;opacity:0.9;">${title}</div>
    `;
    Object.assign(helper.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: '300px',
      maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(17, 24, 39, 0.96)',
      color: '#fff',
      borderRadius: '12px',
      padding: '12px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
      fontFamily: 'Segoe UI, Arial, sans-serif',
    });
    document.body.appendChild(helper);
  }, titleText).catch(() => {});
}

async function captureSummary(page, sessionDir, slug, options = {}) {
  let screenshot = null;
  if (options.skipScreenshot !== true) {
    const screenshotName = `${slug}-handoff.png`;
    const screenshotPath = join(ARTIFACT_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshot = `output/live-tests/${screenshotName}`;
  }
  const submitVisible = await page.getByRole('button', { name: /submit application/i }).first().isVisible().catch(() => false);
  return {
    finalUrl: page.url(),
    finalTitle: await page.title(),
    submitVisible,
    screenshot,
    sessionDir,
  };
}

async function collectFormDiagnostics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const labelFor = new Map();
    for (const label of Array.from(document.querySelectorAll('label'))) {
      const key = label.getAttribute('for');
      if (!key || !visible(label)) continue;
      labelFor.set(key, (label.textContent || '').replace(/\s+/g, ' ').trim());
    }

    const controls = Array.from(document.querySelectorAll('input, textarea, select, [role="combobox"]'))
      .filter(visible)
      .map((element) => {
        const id = element.getAttribute('id') || '';
        const required = element.hasAttribute('required') || element.getAttribute('aria-required') === 'true';
        const invalidByAria = element.getAttribute('aria-invalid') === 'true';
        const displayValue = element.closest('.select__value-container')?.querySelector('.select__single-value')?.textContent || '';
        const value = displayValue.trim() || ('value' in element ? String(element.value || '').trim() : String(element.textContent || '').trim());
        const label = labelFor.get(id) || element.getAttribute('aria-label') || element.getAttribute('name') || id || element.getAttribute('placeholder') || element.getAttribute('data-testid') || '';
        return { id, label, required, invalid: invalidByAria, value, type: element.getAttribute('type') || '', name: element.getAttribute('name') || '' };
      });

    const checkboxGroups = new Map();
    for (const control of controls.filter((control) => control.type === 'checkbox' && control.name)) {
      if (!checkboxGroups.has(control.name)) checkboxGroups.set(control.name, []);
      checkboxGroups.get(control.name).push(control);
    }

    const unresolved = controls
      .filter((control) => {
        if (control.type === 'checkbox' && control.name && checkboxGroups.has(control.name)) {
          const group = checkboxGroups.get(control.name);
          const anyChecked = Array.from(document.querySelectorAll(`input[name="${control.name}"]`)).some((node) => node.checked);
          return !anyChecked && control.required && /personalis careers website|i agree/i.test(control.label);
        }
        return (control.required && !control.value) || control.invalid;
      })
      .map(({ id, label, required, invalid, value }) => ({ id, label, required, invalid, value }))
      .slice(0, 40);

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'))
      .map((element, index) => ({
        index,
        id: element.getAttribute('id') || '',
        name: element.getAttribute('name') || '',
        files: element.files?.length || 0,
        hidden: element instanceof HTMLElement ? (getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden') : false,
      }));

    return {
      unresolved,
      unresolvedLabels: unresolved.map((item) => item.label || item.id).filter(Boolean),
      fileInputs,
      visibleBodyPreview: (document.body?.innerText || '').slice(0, 4000),
    };
  });
}

async function fillPersonalis(page, profile, files, args) {
  const defaults = get(profile, 'application_defaults', {});
  const candidate = get(profile, 'candidate', {});
  const selfId = get(defaults, 'self_id_defaults', {});
  const appKey = `greenhouse_${String(args.application || '').replace(/-/g, '_')}`;
  const greenhouseDefaults = mergeObjects(
    get(defaults, 'greenhouse_defaults', {}),
    get(defaults, appKey, {}),
  );
  const desiredComp = get(greenhouseDefaults, 'desired_compensation', 'Open to discussing compensation based on role scope, territory, and total package.');

  await selectFieldValue(page, [/^Country/i], ['United States', 'United States of America']);
  await fillDirectField(page, ['#first_name', 'input[name="first_name"]'], defaults.first_name || get(candidate, 'full_name', '').split(' ')[0] || '');
  await fillDirectField(page, ['#last_name', 'input[name="last_name"]'], defaults.last_name || '');
  await fillDirectField(page, ['#email', 'input[name="email"]'], get(candidate, 'email', ''));
  await setPhone(page, get(candidate, 'phone', ''));
  const locationCandidates = [get(greenhouseDefaults, 'location_city', '')].filter(Boolean);
  if (locationCandidates.length) {
    await selectFieldValue(page, [/Location \(City\)/i, /^Location/i], locationCandidates);
  }
  const resumeUploaded = await uploadFileField(page, [/Resume\/CV/i], files.resumePath, {
    directSelectors: ['#resume', 'input[name="resume"]'],
    fileIndex: 0,
    attachButtonIndex: 0,
  });
  const coverUploaded = await uploadFileField(page, [/Cover Letter/i], files.coverLetterPath, {
    directSelectors: ['#cover_letter', 'input[name="cover_letter"]'],
    fileIndex: 1,
    attachButtonIndex: 1,
  });

  const schoolCandidates = [get(greenhouseDefaults, 'school', '')].filter(Boolean);
  if (schoolCandidates.length) {
    await selectFieldValue(page, [/^School$/i], schoolCandidates);
  }
  const degreeCandidates = [get(greenhouseDefaults, 'degree', '')].filter(Boolean);
  if (degreeCandidates.length) {
    await selectFieldValue(page, [/^Degree/i], degreeCandidates);
  }
  const disciplineCandidates = [get(greenhouseDefaults, 'discipline', '')].filter(Boolean);
  if (disciplineCandidates.length) {
    await selectFieldValue(page, [/^Discipline/i], disciplineCandidates);
  }
  await fillTextField(page, [/official documents/i], get(candidate, 'full_name', ''));
  await selectFieldValue(page, [/visa sponsorship or renewal/i], ['No']);
  await selectFieldValue(page, [/at least 1 years? of experience as a MSL in oncology/i], ['No']);
  await selectFieldValue(page, [/working knowledge and experience with ctDNA/i], ['General understanding']);
  const startDate = get(greenhouseDefaults, 'start_date', '');
  if (startDate) {
    await fillTextField(page, [/what date could you start/i], startDate);
  }
  await fillTextField(page, [/desired compensation/i], desiredComp);

  const sourceLabel = get(greenhouseDefaults, 'source_label', 'Personalis Careers Website');
  await ensureCheckbox(page, [new RegExp(`^${escapeRegex(sourceLabel)}$`, 'i')], true);
  await fillTextField(page, [/LinkedIn Profile/i], get(candidate, 'linkedin', ''));
  await ensureCheckbox(page, [/^I agree$/i], true);

  await selectFieldValue(page, [/^Gender/i], ['Decline To Self Identify']);
  await selectFieldValue(page, [/Hispanic\/Latino/i], ['Decline To Self Identify']);
  await selectFieldValue(page, [/Veteran Status/i], ["I don't wish to answer", 'I do not wish to answer']);
  await selectFieldValue(page, [/Disability Status/i], ['I do not want to answer', 'Decline To Self Identify']);

  return {
    applicationType: args.application,
    selfIdDefaults: selfId,
    uploads: {
      resumeUploaded,
      coverUploaded,
    },
  };
}

async function fillLegend(page, profile, files, args) {
  const defaults = get(profile, 'application_defaults', {});
  const candidate = get(profile, 'candidate', {});
  const appKey = `greenhouse_${String(args.application || '').replace(/-/g, '_')}`;
  const greenhouseDefaults = mergeObjects(
    get(defaults, 'greenhouse_defaults', {}),
    get(defaults, appKey, {}),
  );
  const currentEmployer = get(greenhouseDefaults, 'current_employer', '');
  const currentTitle = get(greenhouseDefaults, 'current_title', '');
  const desiredSalary = get(greenhouseDefaults, 'desired_salary', 'Open to discussing compensation based on role scope, territory expectations, and total package.');
  const preferredFirstName = defaults.first_name || get(candidate, 'full_name', '').split(' ')[0] || '';
  const permanentAddress = [defaults.address_line_1, defaults.city, defaults.state, defaults.postal_code].filter(Boolean).join(', ').replace(/, ([A-Z]{2}), (\d{5}(?:-\d{4})?)$/, ' $1 $2');

  await fillDirectField(page, ['#first_name', 'input[name="first_name"]'], defaults.first_name || get(candidate, 'full_name', '').split(' ')[0] || '');
  await fillDirectField(page, ['#last_name', 'input[name="last_name"]'], defaults.last_name || '');
  await fillDirectField(page, ['#email', 'input[name="email"]'], get(candidate, 'email', ''));
  await setPhone(page, get(candidate, 'phone', ''));
  const resumeUploaded = await uploadFileField(page, [/Resume\/CV/i], files.resumePath, {
    directSelectors: ['#resume', 'input[name="resume"]'],
    fileIndex: 0,
    attachButtonIndex: 0,
  });
  const coverUploaded = await uploadFileField(page, [/Cover Letter/i], files.coverLetterPath, {
    directSelectors: ['#cover_letter', 'input[name="cover_letter"]'],
    fileIndex: 1,
    attachButtonIndex: 1,
  });

  await selectFieldValue(page, [/^Country/i], ['United States', 'United States of America']);
  await selectFieldValue(page, [/authorized to work lawfully in the United States/i], ['Yes']);
  await selectFieldValue(page, [/require sponsorship for employment visa status/i], ['No']);
  await selectFieldValue(page, [/referred by an internal employee/i], ['No']);
  await selectFieldValue(page, [/relative of any employee/i], ['No']);
  await fillTextField(page, [/desired salary/i], desiredSalary);
  if (permanentAddress) {
    await fillTextField(page, [/Permanent Address/i], permanentAddress);
  }
  await selectFieldValue(page, [/open to relocation/i], ['Yes']);
  await selectFieldValue(page, [/How did you hear about us/i], ['Company Website', 'Career Website', 'Company Careers Website']);
  if (currentEmployer) {
    await fillTextField(page, [/Current\/Most Recent Employer/i], currentEmployer);
  }
  if (currentTitle) {
    await fillTextField(page, [/Current\/Most Recent Title/i], currentTitle);
  }
  await fillTextField(page, [/LinkedIn Profile/i], get(candidate, 'linkedin', ''));
  if (preferredFirstName) {
    await fillTextField(page, [/Preferred First Name/i], preferredFirstName);
  }
  await selectFieldValue(page, [/contractual obligations/i], ['No']);
  await selectFieldValue(page, [/currently or previously an employee of Legend Biotech/i], ['No']);
  await selectFieldValue(page, [/Applicant Non-Disclosure Agreement/i], ['Yes', 'I Agree']);
  await fillTextField(page, [/print your name/i], get(candidate, 'full_name', ''));
  await selectFieldValue(page, [/Government Official/i], ['No']);

  return {
    applicationType: args.application,
    currentEmployer,
    currentTitle,
    uploads: {
      resumeUploaded,
      coverUploaded,
    },
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/assist-greenhouse-review-handoff.mjs --application=personalis-senior --url="https://job-boards.greenhouse.io/..."

Options:
  --application=...        Required: personalis-senior | personalis-junior | legend
  --url=...                Required Greenhouse application URL
  --slug=...               Artifact/session slug
  --profile=...            Profile YAML path (default: config/profile.yml)
  --headless=true|false    Default false
  --keep-open=true|false   Keep headed browser open for user handoff (default true)
  --skip-screenshot=true   Skip full-page screenshot artifact for low-disk relaunches
  --reset-session=true     Clear prior persistent session directory before launch
  --resume-path=...        Override resume path
  --cover-letter-path=...  Override cover letter path

This helper fills known Greenhouse application fields and leaves the live
browser open at the final Submit application surface for manual review.`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.url || !args.application) {
    printHelp();
    process.exit(args.url && args.application ? 0 : 1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(SESSION_ROOT, { recursive: true });

  const slug = slugify(args.slug || `${args.application}-${new Date().toISOString().slice(0, 10)}`);
  const profilePath = resolveLocalPath(args.profile || 'config/profile.yml');
  let profile = parseSimpleYaml(profilePath);
  const localOverridePath = resolveLocalPath('.career-ops-local/platform-overrides.yml');
  if (existsSync(localOverridePath)) {
    profile = mergeObjects(profile, parseSimpleYaml(localOverridePath));
  }
  const sessionDir = join(SESSION_ROOT, slug);

  if (args['reset-session'] === 'true' && existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }

  const files = {
    resumePath: resolveLocalPath(args['resume-path'] || ''),
    coverLetterPath: resolveLocalPath(args['cover-letter-path'] || ''),
  };

  const headless = args.headless === 'true';
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless,
    viewport: headless ? { width: 1440, height: 1800 } : null,
    args: headless ? [] : ['--start-maximized'],
  });

  const page = browser.pages()[0] || await browser.newPage();
  const result = {
    date: new Date().toISOString().slice(0, 10),
    slug,
    application: args.application,
    inputUrl: args.url,
    notes: [],
    errors: [],
    sessionDir,
  };

  try {
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(page, 2500);
    const cookieAction = await dismissCookieBanner(page);
    if (cookieAction) result.notes.push(`dismissed_cookie_banner:${cookieAction}`);

    let details = {};
    if (args.application === 'personalis-senior' || args.application === 'personalis-junior') {
      details = await fillPersonalis(page, profile, files, args);
    } else if (args.application === 'legend') {
      details = await fillLegend(page, profile, files, args);
    } else {
      throw new Error(`Unsupported application type: ${args.application}`);
    }

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' })).catch(() => {});
    await wait(page, 1200);
    const diagnostics = await collectFormDiagnostics(page);
    result.diagnostics = diagnostics;
    if (diagnostics.unresolvedLabels.length) {
      result.errors.push(`Unresolved fields: ${diagnostics.unresolvedLabels.join(' | ')}`);
    }
    await injectHandoffBanner(page, `${cleanText(await page.title())} ready for final review`);
    const summary = await captureSummary(page, sessionDir, slug, {
      skipScreenshot: args['skip-screenshot'] === 'true',
    });

    Object.assign(result, summary, details, {
      resumePath: files.resumePath,
      coverLetterPath: files.coverLetterPath,
    });
    if (details.uploads?.resumeUploaded === false) {
      result.errors.push('Resume upload did not persist.');
    }
    if (details.uploads?.coverUploaded === false) {
      result.errors.push('Cover letter upload did not persist.');
    }
    if (!summary.submitVisible) {
      result.errors.push('Submit application button was not visible at handoff.');
    }

    const jsonPath = join(ARTIFACT_DIR, `${slug}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    console.log(JSON.stringify({
      application: result.application,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      submitVisible: result.submitVisible,
      screenshot: result.screenshot,
      json: `output/live-tests/${slug}.json`,
      sessionDir: result.sessionDir,
      errors: result.errors,
    }, null, 2));

    const keepOpen = args['keep-open'] !== 'false' && args.headless !== 'true';
    if (keepOpen) {
      console.log(`Visible browser handoff is active for ${result.application}. Review the live form and use Greenhouse's own Submit application button when ready.`);
      await new Promise((resolve) => {
        browser.browser()?.once('disconnected', resolve);
      });
    } else {
      await browser.close();
    }
  } catch (error) {
    result.errors.push(error.message);
    const jsonPath = join(ARTIFACT_DIR, `${slug}.json`);
    writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    await browser.close().catch(() => {});
    throw error;
  }
}

run().catch((error) => {
  console.error(`Greenhouse handoff failed: ${error.message}`);
  process.exit(1);
});
