#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
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
  return String(value || 'workday-fill-myinfo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => cleanText(value)).filter(Boolean))];
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

function resolveLocalPath(value) {
  if (!value) return '';
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return value;
  }
  return join(ROOT, value);
}

function inferWorkdayEmployerKey(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.split('.')[0].replace(/[^a-z0-9]+/g, '-');
  } catch {
    return '';
  }
}

function buildSourceOptionCandidates(sourceValue, explicitOption = '') {
  const candidates = [explicitOption, sourceValue];
  const normalized = cleanText(sourceValue).toLowerCase();

  if (/career|careers|company website|company site|company page|employer website/.test(normalized)) {
    candidates.push(
      'Career Page',
      'Careers Page',
      'Career Site',
      'Careers Site',
      'Company Careers Page',
      'Company Career Website',
      'Company Career Site',
      'Company Website',
      'Employer Website',
      'Corporate Website',
      'Internet Search',
    );
  }

  if (/linkedin/.test(normalized)) {
    candidates.push('LinkedIn', 'LinkedIn.com', 'LinkedIn Job Posting');
  }

  if (/referral|employee referral/.test(normalized)) {
    candidates.push('Employee Referral', 'Referral');
  }

  if (/recruiter/.test(normalized)) {
    candidates.push('Recruiter', 'Recruiter Outreach', 'Agency Recruiter');
  }

  if (/indeed/.test(normalized)) {
    candidates.push('Indeed', 'Indeed.com');
  }

  return unique(candidates);
}

function inferSourceQuery(sourceValue, explicitQuery = '') {
  if (cleanText(explicitQuery)) return cleanText(explicitQuery);
  const normalized = cleanText(sourceValue).toLowerCase();
  if (/career|careers|company website|company site|company page|employer website/.test(normalized)) return 'career';
  if (/linkedin/.test(normalized)) return 'linkedin';
  if (/referral|employee referral/.test(normalized)) return 'referral';
  if (/recruiter/.test(normalized)) return 'recruiter';
  if (/indeed/.test(normalized)) return 'indeed';
  return cleanText(sourceValue);
}

function resolveWorkdaySourceConfig(defaults, url) {
  const employerKey = inferWorkdayEmployerKey(url);
  const overrides = get(defaults, 'workday_overrides', {});
  const employerOverride = employerKey ? get(overrides, employerKey, {}) : {};
  const sourceValue = employerOverride.how_did_you_hear || defaults.how_did_you_hear || '';
  const sourceQuery = inferSourceQuery(sourceValue, employerOverride.source_query || get(overrides, 'default_source_query', ''));
  const sourceOption = employerOverride.source_option || '';

  return {
    employerKey,
    sourceValue,
    sourceQuery: cleanText(sourceQuery || sourceOption || sourceValue),
    sourceOption,
    sourceCandidates: buildSourceOptionCandidates(sourceValue, sourceOption),
    overrideApplied: Boolean(employerKey && Object.keys(employerOverride || {}).length),
  };
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
        // Try next locator.
      }
    }
  }
  return null;
}

async function dismissCookieBanner(page) {
  return clickNamed(page, ['Accept Cookies', 'Accept all', 'Accept All', 'Accept']);
}

async function fillSignIn(page, email, password) {
  const fillVisibleTextInput = async (value, preferredMatchers = []) => {
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
  };

  const fillVisiblePassword = async (value) => {
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
  };

  const emailFilled = await fillVisibleTextInput(email, [/email/i, /username/i]);
  const passwordFilled = await fillVisiblePassword(password);
  if (!emailFilled || !passwordFilled) return false;

  await clickNamed(page, ['Sign In']);
  await wait(page, 5000);
  return true;
}

async function fillById(page, id, value) {
  if (value === '' || value === undefined || value === null) return false;
  const locator = page.locator(`#${id}`);
  try {
    if (await locator.isVisible({ timeout: 1000 })) {
      await locator.click({ timeout: 2000 });
      await locator.fill('');
      await locator.type(String(value), { delay: 35 });
      await page.keyboard.press('Tab');
      await wait(page, 250);
      const currentValue = await locator.inputValue().catch(() => '');
      return cleanText(currentValue) === cleanText(String(value));
    }
  } catch {
    // Ignore.
  }
  return false;
}

async function readLocatorSnapshot(locator) {
  try {
    return await locator.evaluate((element) => {
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const field = element instanceof HTMLElement ? element.closest('[data-automation-id], fieldset, section, form, div') : null;
      return {
        value: clean(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.getAttribute('value')),
        text: clean(element.textContent),
        ariaLabel: clean(element.getAttribute('aria-label')),
        nearbyText: clean(field?.textContent),
      };
    });
  } catch {
    return { value: '', text: '', ariaLabel: '', nearbyText: '' };
  }
}

function snapshotMatches(snapshot, candidates) {
  const haystack = cleanText([
    snapshot?.value,
    snapshot?.text,
    snapshot?.ariaLabel,
    snapshot?.nearbyText,
  ].join(' ')).toLowerCase();

  if (!haystack) return false;
  return candidates.some((candidate) => haystack.includes(cleanText(candidate).toLowerCase()));
}

function sourceSnapshotCommitted(snapshot, candidates = []) {
  const haystack = cleanText([
    snapshot?.value,
    snapshot?.text,
    snapshot?.ariaLabel,
    snapshot?.nearbyText,
  ].join(' '));

  if (!haystack) return false;
  if (/0 items selected|error-how did you hear about us\?/i.test(haystack)) return false;
  if (/1 item selected/i.test(haystack)) return true;
  return candidates.some((candidate) => {
    const normalized = cleanText(candidate).toLowerCase();
    return normalized && haystack.includes(normalized);
  });
}

function expandSourceCandidatesFromVisibleOptions(candidates, visibleOptions = [], sourceQuery = '') {
  const normalizedCandidates = unique(candidates).map((candidate) => cleanText(candidate)).filter(Boolean);
  const normalizedQuery = cleanText(sourceQuery).toLowerCase();
  const extras = unique(visibleOptions)
    .map((option) => cleanText(option))
    .filter((option) => option && option.length <= 80)
    .filter((option) => {
      const lower = option.toLowerCase();
      if (/how did you hear about us|expanded|save and continue|back to job posting|follow us|applicant privacy|settings|candidate home|current step|step \d of \d|\* indicates a required field/.test(lower)) {
        return false;
      }
      const candidateHitCount = normalizedCandidates.filter((candidate) => candidate && lower.includes(candidate.toLowerCase())).length;
      if (candidateHitCount > 1) return false;
      return normalizedCandidates.some((candidate) => lower.includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(lower))
        || (normalizedQuery && lower.includes(normalizedQuery));
    })
    .sort((a, b) => b.length - a.length);
  return unique([...extras, ...normalizedCandidates]);
}

async function collectVisibleOptionTexts(page) {
  try {
    return await page.evaluate(() => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };

      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll([
        '[data-automation-id="promptOption"]',
        '[data-automation-id="promptLeafNode"]',
        '[data-automation-id="menuItem"]',
        '[role="option"]',
        '[role="listbox"] [role="button"]',
        'li',
        'button',
      ].join(',')))
        .filter(visible)
        .map((node) => clean(node.textContent))
        .filter((text) => text && text.length < 120)
        .slice(0, 120);
    });
  } catch {
    return [];
  }
}

async function chooseVisibleOption(page, candidates) {
  for (const candidate of unique(candidates)) {
    const handle = await page.evaluateHandle((targetText) => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const target = clean(targetText);
      const selectors = [
        '[data-automation-id="promptOption"]',
        '[data-automation-id="promptLeafNode"]',
        '[role="option"]',
        '[data-automation-id="menuItem"]',
        '[role="button"]',
        'button',
        'li',
      ];
      const nodes = Array.from(document.querySelectorAll(selectors.join(','))).filter(visible);
      return nodes.find((node) => clean(node.textContent) === target) || null;
    }, candidate);
    const exactElement = handle.asElement();
    if (exactElement) {
      try {
        await exactElement.click({ timeout: 3000 });
        await wait(page, 1200);
        return candidate;
      } catch {
        // Try role/text locators next.
      }
    }

    const exactRegex = new RegExp(`^${escapeRegex(candidate)}$`, 'i');
    const containsRegex = new RegExp(escapeRegex(candidate), 'i');
    const optionLocators = [
      page.getByRole('option', { name: exactRegex }),
      page.getByRole('button', { name: exactRegex }),
      page.getByText(exactRegex),
      page.getByRole('option', { name: containsRegex }),
      page.getByRole('button', { name: containsRegex }),
      page.getByText(containsRegex),
    ];

    for (const locatorOption of optionLocators) {
      const target = locatorOption.first();
      try {
        if (await target.isVisible({ timeout: 800 })) {
          await target.click({ timeout: 3000 });
          await wait(page, 1200);
          return candidate;
        }
      } catch {
        // Try next locator.
      }
    }
  }

  return '';
}

async function setWorkdayChipField(page, id, query, optionCandidates = []) {
  const locator = page.locator(`#${id}`);
  const candidates = unique([query, ...optionCandidates]);
  const before = await readLocatorSnapshot(locator);
  const commitSelection = async (matchCandidates = [], pressEnter = false) => {
    try {
      if (pressEnter) {
        await page.keyboard.press('Enter');
        await wait(page, 250);
      }
      await page.keyboard.press('Tab');
      await wait(page, 900);
    } catch {
      // Ignore and inspect whatever state we can read next.
    }
    const after = await readLocatorSnapshot(locator);
    return sourceSnapshotCommitted(after, unique([...matchCandidates, ...candidates]))
      && cleanText(JSON.stringify(after)) !== cleanText(JSON.stringify(before));
  };

  try {
    if (!(await locator.isVisible({ timeout: 1000 }))) return false;
    await locator.click({ timeout: 3000 });
    if (query) {
      await locator.fill(String(query));
    }
    await wait(page, 1200);
  } catch {
    return false;
  }

  let chosenOption = '';
  try {
    await page.keyboard.press('ArrowDown');
    await wait(page, 300);
    if (await commitSelection([], true)) {
      return true;
    }
  } catch {
    // Fall through to click-based option selection.
  }

  for (const exactCandidate of unique(optionCandidates).filter(Boolean)) {
    try {
      await locator.click({ timeout: 3000 });
      await locator.fill('');
      await locator.type(String(exactCandidate), { delay: 30 });
      await wait(page, 400);
      if (await commitSelection([exactCandidate], true)) {
        return true;
      }
    } catch {
      // Try next candidate.
    }
  }

  const visibleCandidates = expandSourceCandidatesFromVisibleOptions(candidates, await collectVisibleOptionTexts(page), query);
  chosenOption = await chooseVisibleOption(page, visibleCandidates);
  if (chosenOption) {
    if (await commitSelection([chosenOption])) {
      return true;
    }
  }

  return false;
}

async function setRadioByLabel(page, labelText) {
  const regex = new RegExp(`^${escapeRegex(labelText)}$`, 'i');
  const targets = [
    page.getByLabel(regex),
    page.getByText(regex),
  ];

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

async function setChoiceNearQuestion(page, questionFragment, choiceText) {
  const handle = await page.evaluateHandle(({ fragment, choice }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetFragment = clean(fragment);
    const targetChoice = clean(choice);
    const nodes = Array.from(document.querySelectorAll('label, span, div, p')).filter(visible);
    const questionNode = nodes.find((node) => clean(node.textContent).includes(targetFragment));
    if (!questionNode) return null;

    let container = questionNode instanceof HTMLElement ? questionNode : null;
    while (container) {
      const candidates = Array.from(container.querySelectorAll('label, button, [role="radio"], [role="button"], span, div')).filter(visible);
      const match = candidates.find((candidate) => clean(candidate.textContent) === targetChoice);
      if (match) return match;
      container = container.parentElement;
    }

    return null;
  }, { fragment: questionFragment, choice: choiceText });

  const target = handle.asElement();
  if (!target) return false;

  try {
    await target.scrollIntoViewIfNeeded();
    await target.click({ timeout: 3000 });
    await wait(page, 800);
    return true;
  } catch {
    return false;
  }
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
    await wait(page, 1200);
  } catch {
    return false;
  }

  const exactRegex = new RegExp(`^${escapeRegex(value)}$`, 'i');
  const containsRegex = new RegExp(escapeRegex(value), 'i');
  const optionLocators = [
    page.getByRole('option', { name: exactRegex }),
    page.getByRole('button', { name: exactRegex }),
    page.getByText(exactRegex),
    page.getByText(containsRegex),
  ];

  for (const locator of optionLocators) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 4000 });
        await wait(page, 1200);
        return true;
      }
    } catch {
      // Try next locator.
    }
  }

  try {
    await page.keyboard.type(String(value));
    await wait(page, 400);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await wait(page, 1200);
    return true;
  } catch {
    return false;
  }
}

async function setWorkdaySource(page, sourceConfig) {
  const label = 'How Did You Hear About Us?';
  const sourceCandidates = unique([
    sourceConfig.sourceOption,
    sourceConfig.sourceValue,
    ...sourceConfig.sourceCandidates,
  ]);
  const result = {
    employerKey: sourceConfig.employerKey,
    sourceQuery: sourceConfig.sourceQuery,
    sourceCandidates,
    overrideApplied: sourceConfig.overrideApplied,
    visibleOptions: [],
    strategy: '',
    matchedOption: '',
    ok: false,
  };

  if (!sourceConfig.sourceQuery && !sourceCandidates.length) {
    return result;
  }

  if (await page.locator('#source--source').isVisible({ timeout: 800 }).catch(() => false)) {
    result.strategy = 'chip-field';
    result.ok = await setWorkdayChipField(page, 'source--source', sourceConfig.sourceQuery, sourceCandidates);
    result.visibleOptions = unique(await collectVisibleOptionTexts(page));
    if (result.ok) {
      const currentBody = await bodyText(page);
      if (!/How Did You Hear About Us\?\*?\s*0 items selected/i.test(currentBody)
        && !/Error-How Did You Hear About Us\?/i.test(currentBody)) {
        return result;
      }
      result.ok = false;
    }
    try {
      await page.keyboard.press('Escape');
      await wait(page, 300);
    } catch {
      // Ignore.
    }
  }

  const pickerHandle = await getPickerHandle(page, label) || await page.evaluateHandle(() => document.querySelector('#source--source')).then((handle) => handle.asElement()).catch(() => null);
  if (!pickerHandle) {
    return result;
  }

  result.strategy = result.strategy || 'label-picker';
  try {
    await pickerHandle.click({ timeout: 4000 });
    await wait(page, 1200);
    if (sourceConfig.sourceQuery) {
      await page.keyboard.type(String(sourceConfig.sourceQuery));
      await wait(page, 600);
    }
    result.visibleOptions = unique(await collectVisibleOptionTexts(page));
    const clickCandidates = expandSourceCandidatesFromVisibleOptions(sourceCandidates, result.visibleOptions, sourceConfig.sourceQuery);
    result.matchedOption = await chooseVisibleOption(page, clickCandidates);
    if (!result.matchedOption) {
      await page.keyboard.press('ArrowDown');
      await wait(page, 300);
      await page.keyboard.press('Enter');
      await wait(page, 1200);
    }
    try {
      await page.keyboard.press('Tab');
      await wait(page, 800);
    } catch {
      // Ignore.
    }

    const snapshot = await readLocatorSnapshot(pickerHandle);
    result.ok = sourceSnapshotCommitted(snapshot, unique([result.matchedOption, ...clickCandidates, ...sourceCandidates]));
  } catch {
    result.ok = false;
  }

  const currentBody = await bodyText(page);
  if (/How Did You Hear About Us\?\*?\s*0 items selected/i.test(currentBody)
    || /Error-How Did You Hear About Us\?/i.test(currentBody)) {
    result.ok = false;
  }

  return result;
}

async function setPickerByPartialLabel(page, labelFragment, value) {
  const handle = await page.evaluateHandle((fragment) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = clean(fragment);
    const labels = Array.from(document.querySelectorAll('label, span, div')).filter(visible);
    const labelNode = labels.find((node) => clean(node.textContent).includes(target));
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
  }, labelFragment);

  const handleElement = handle.asElement();
  if (!handleElement) return false;

  try {
    await handleElement.click({ timeout: 4000 });
    await wait(page, 1200);
  } catch {
    return false;
  }

  const exactRegex = new RegExp(`^${escapeRegex(value)}$`, 'i');
  const containsRegex = new RegExp(escapeRegex(value), 'i');
  const optionLocators = [
    page.getByRole('option', { name: exactRegex }),
    page.getByRole('button', { name: exactRegex }),
    page.getByText(exactRegex),
    page.getByText(containsRegex),
  ];

  for (const locator of optionLocators) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 4000 });
        await wait(page, 1200);
        return true;
      }
    } catch {
      // Try next locator.
    }
  }

  try {
    await page.keyboard.type(String(value));
    await wait(page, 400);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await wait(page, 1200);
    return true;
  } catch {
    return false;
  }
}

async function selectDisclosureOption(page, preferredValue) {
  const candidates = [
    preferredValue,
    /prefer not/i,
    /do not wish/i,
    /choose not/i,
    /decline/i,
    /unknown/i,
    /not identify/i,
  ];

  for (const candidate of candidates) {
    const locators = typeof candidate === 'string'
      ? [
          page.getByRole('option', { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') }),
          page.getByRole('button', { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') }),
          page.getByText(new RegExp(`^${escapeRegex(candidate)}$`, 'i')),
          page.getByText(new RegExp(escapeRegex(candidate), 'i')),
        ]
      : [
          page.getByRole('option', { name: candidate }),
          page.getByRole('button', { name: candidate }),
          page.getByText(candidate),
        ];

    for (const locator of locators) {
      const target = locator.first();
      try {
        if (await target.isVisible({ timeout: 1000 })) {
          await target.click({ timeout: 4000 });
          await wait(page, 1200);
          return true;
        }
      } catch {
        // Try next locator.
      }
    }
  }

  return false;
}

async function setDisclosurePicker(page, label, preferredValue) {
  const handle = await getPickerHandle(page, label);
  if (!handle) return false;

  let beforeText = '';
  try {
    beforeText = ((await handle.textContent()) || '').replace(/\s+/g, ' ').trim();
  } catch {
    // Ignore.
  }

  try {
    await handle.scrollIntoViewIfNeeded();
    await handle.click({ timeout: 4000 });
    await wait(page, 1200);
  } catch {
    return false;
  }

  if (await selectDisclosureOption(page, preferredValue)) {
    await wait(page, 600);
    try {
      const afterText = ((await handle.textContent()) || '').replace(/\s+/g, ' ').trim();
      const changed = afterText && afterText !== beforeText;
      const accepted = /prefer not|do not wish|choose not|decline|unknown|yes|no/i.test(afterText);
      if (changed && accepted) return true;
    } catch {
      // Fall through to false.
    }
  }

  try {
    await page.keyboard.press('Escape');
    await wait(page, 300);
  } catch {
    // Ignore.
  }
  return false;
}

async function setConsentCheckbox(page, labelText) {
  const regex = new RegExp(escapeRegex(labelText), 'i');
  const targets = [
    page.getByLabel(regex),
    page.getByText(regex),
  ];

  for (const locator of targets) {
    const target = locator.first();
    try {
      if (await target.isVisible({ timeout: 1000 })) {
        await target.scrollIntoViewIfNeeded();
        await target.click({ timeout: 3000 });
        await wait(page, 800);
        return true;
      }
    } catch {
      // Try next locator.
    }
  }
  return false;
}

async function setAnyConsentCheckbox(page) {
  const patterns = [
    'I consent',
    'Yes, I have read and consent to the terms and conditions',
    'I have read and consent to the terms and conditions',
    'terms and conditions',
    'Workday Privacy Notice and User Acknowledgement',
  ];

  for (const pattern of patterns) {
    if (await setConsentCheckbox(page, pattern)) {
      return pattern;
    }
  }
  return '';
}

async function uploadFile(page, filePath) {
  if (!filePath || !existsSync(filePath)) return false;
  const filename = basename(filePath);

  const uploadRegistered = async () => {
    const text = await bodyText(page);
    return text.includes(filename);
  };

  const trySetInputFiles = async () => {
    const inputs = page.locator('input[type="file"]');
    const count = await inputs.count();
    for (let index = 0; index < count; index += 1) {
      try {
        await inputs.nth(index).setInputFiles(filePath, { timeout: 5000 });
        await wait(page, 3500);
        if (await uploadRegistered()) return true;
      } catch {
        // Try next file input.
      }
    }
    return false;
  };

  if (await trySetInputFiles()) return true;

  const clickForChooser = async (names) => {
    for (const name of names) {
      const regex = new RegExp(`^${escapeRegex(name)}$`, 'i');
      const locators = [
        page.getByRole('button', { name: regex }),
        page.getByRole('link', { name: regex }),
        page.getByText(regex),
      ];
      for (const locator of locators) {
        const target = locator.first();
        try {
          if (!(await target.isVisible({ timeout: 800 }))) continue;
          const chooserPromise = page.waitForEvent('filechooser', { timeout: 2500 }).catch(() => null);
          await target.click({ timeout: 3000 });
          const chooser = await chooserPromise;
          if (chooser) {
            await chooser.setFiles(filePath);
            await wait(page, 3500);
            if (await uploadRegistered()) return true;
          }
        } catch {
          // Try next locator.
        }
      }
    }
    return false;
  };

  if (await clickForChooser(['Autofill with Resume', 'Select files', 'Upload a file', 'Upload', 'Add'])) {
    return true;
  }

  await clickNamed(page, ['Autofill with Resume', 'Select files', 'Upload a file', 'Upload']);
  await wait(page, 1500);
  if (await trySetInputFiles()) return true;

  return false;
}

function boolToYesNo(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '';
}

function normalizePhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits || String(value || '');
}

function phoneFormatCandidates(value) {
  const raw = String(value || '').trim();
  const digits = normalizePhoneNumber(raw);
  if (!digits) return [];

  const formats = [digits, raw];
  if (digits.length === 10) {
    formats.push(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
    formats.push(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
    formats.push(`${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`);
    formats.push(`+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`);
  }
  return unique(formats);
}

async function fillPhoneNumber(page, id, rawValue) {
  const locator = page.locator(`#${id}`);
  try {
    if (!(await locator.isVisible({ timeout: 1000 }))) return false;
  } catch {
    return false;
  }

  for (const candidate of phoneFormatCandidates(rawValue)) {
    try {
      await locator.click({ timeout: 2000 });
      await locator.fill('');
      await locator.type(candidate, { delay: 35 });
      await page.keyboard.press('Tab');
      await wait(page, 400);
      const currentValue = cleanText(await locator.inputValue().catch(() => ''));
      if (currentValue) return true;
    } catch {
      // Try next format.
    }
  }

  return false;
}

function resolveDisclosureValue(label, preferredValue) {
  const normalized = String(preferredValue || '').trim();
  if (!normalized) return '';

  if (/veteran status/i.test(label) && /prefer not/i.test(normalized)) {
    return 'I do not wish to provide this information';
  }

  if (/race/i.test(label) && /prefer not/i.test(normalized)) {
    return 'Do Not Want to Disclose (United States of America)';
  }

  if (/gender/i.test(label) && /prefer not/i.test(normalized)) {
    return 'Wish To Not Disclose';
  }

  if (/hispanic/i.test(label) && /prefer not/i.test(normalized)) {
    return 'I do not wish to provide this information';
  }

  return normalized;
}

async function fillApplicationQuestions(page, defaults) {
  const questionLog = [];
  const answers = [
    {
      label: 'Are you 18 years of age or older?',
      answer: boolToYesNo(defaults.is_over_18),
    },
    {
      label: 'Are you legally authorized to work in the United States?',
      answer: boolToYesNo(defaults.authorized_to_work_us),
    },
    {
      label: 'Do you have a confidentiality obligation, non-compete clause or any other contractual obligation that could impact your ability to work for the position for which you have applied?',
      answer: boolToYesNo(defaults.confidentiality_obligation),
    },
    {
      label: 'Will you now or in the future require sponsorship for employment visa status (e.g., H-1B status)?',
      answer: boolToYesNo(defaults.future_sponsorship_required),
    },
    {
      label: 'Are you currently working for, or have you ever worked for, Medtronic, Covidien, or any of its subsidiaries?',
      answer: boolToYesNo(Boolean(defaults.prior_medtronic_employment || defaults.prior_covidien_employment)),
    },
  ];

  for (const item of answers) {
    if (!item.answer) continue;
    const filled = item.partial
      ? await setPickerByPartialLabel(page, item.label, item.answer)
      : await setPickerByLabel(page, item.label, item.answer);
    if (filled) {
      questionLog.push(`set:${item.label}=${item.answer}`);
    }
  }

  return questionLog;
}

async function fillDisclosurePages(page, defaults) {
  const disclosureLog = [];
  const selfId = defaults.self_id_defaults || {};
  const mappings = [
    ['Please select the veteran status which most accurately describes how you identify yourself', selfId.veteran_status],
    ['Please select the race which most accurately describes how you identify yourself', selfId.race_ethnicity],
    ['Please select your gender', selfId.gender_identity],
    ['Please select Yes if Hispanic/Latino accurately describes how you identify yourself', selfId.hispanic_latino || selfId.race_ethnicity],
  ];

  for (const [label, value] of mappings) {
    if (!value) continue;
    const resolvedValue = resolveDisclosureValue(label, value);
    if (await setDisclosurePicker(page, label, resolvedValue)) {
      disclosureLog.push(`set:${label}=${resolvedValue}`);
    }
  }

  if (defaults.consent_to_terms) {
    const consentPattern = await setAnyConsentCheckbox(page);
    if (consentPattern) {
      disclosureLog.push(`set:${consentPattern}`);
    }
  }

  return disclosureLog;
}

async function handleLaterWorkdaySteps(page, slug, flowLog, defaults, tabStates, initialState) {
  let currentState = initialState;

  if (stateHasHeading(currentState, /Application Questions/i)) {
    const questionLog = await fillApplicationQuestions(page, defaults);
    flowLog.push(...questionLog);
    tabStates.push({
      stepName: 'Application Questions Filled',
      clicked: false,
      state: await capture(page, slug, 'application-questions-filled', { flowLog, questionLog }),
    });

    const questionsSave = await clickNamed(page, ['Save and Continue']);
    if (questionsSave) flowLog.push(questionsSave);
    await wait(page, 5000);

    currentState = await capture(page, slug, 'after-application-questions', { flowLog });
    tabStates.push({ stepName: 'After Application Questions', clicked: false, state: currentState });
  }

  if (stateHasHeading(currentState, /Voluntary Disclosures/i)) {
    const disclosureLog = await fillDisclosurePages(page, defaults);
    flowLog.push(...disclosureLog);
    tabStates.push({
      stepName: 'Disclosure Pages Filled',
      clicked: false,
      state: await capture(page, slug, 'disclosures-filled', { flowLog, disclosureLog }),
    });

    const disclosuresSave = await clickNamed(page, ['Save and Continue']);
    if (disclosuresSave) flowLog.push(disclosuresSave);
    await wait(page, 5000);

    currentState = await capture(page, slug, 'after-disclosures', { flowLog });
    tabStates.push({ stepName: 'After Disclosures', clicked: false, state: currentState });
  }

  if (stateHasHeading(currentState, /Self Identify/i)) {
    const selfIdentifySave = await clickNamed(page, ['Save and Continue']);
    if (selfIdentifySave) flowLog.push('Save and Continue (self-identify)');
    await wait(page, 5000);

    currentState = await capture(page, slug, 'after-self-identify-save', { flowLog });
    tabStates.push({
      stepName: 'After Self Identify Save Attempt',
      clicked: false,
      state: currentState,
    });
  }

  const steps = ['Voluntary Disclosures', 'Self Identify', 'Review'];
  for (const stepName of steps) {
    const clicked = await clickStep(page, stepName);
    const label = stepName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const state = await capture(page, slug, label, { stepName, clicked, flowLog });
    tabStates.push({ stepName, clicked, state });
  }
}

async function inspectVisibleControls(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };

    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const labelMap = new Map();

    for (const label of Array.from(document.querySelectorAll('label')).filter(visible)) {
      const forId = label.getAttribute('for');
      if (forId) {
        labelMap.set(forId, clean(label.textContent));
      }
    }

    const controls = [];
    for (const element of Array.from(document.querySelectorAll('input, textarea, select, button, [role="button"], [role="combobox"], [role="radio"], [role="checkbox"]'))) {
      if (!visible(element)) continue;

      const id = element.getAttribute('id') || '';
      const type = element.getAttribute('type') || element.getAttribute('role') || element.tagName.toLowerCase();
      const text = clean(element.textContent);
      const value = clean(element.getAttribute('value'));
      const ariaLabel = clean(element.getAttribute('aria-label'));
      const placeholder = clean(element.getAttribute('placeholder'));
      const name = clean(element.getAttribute('name'));
      const checked = element.getAttribute('aria-checked') || (element instanceof HTMLInputElement ? String(Boolean(element.checked)) : '');
      const label = ariaLabel || labelMap.get(id) || '';

      controls.push({
        tag: element.tagName.toLowerCase(),
        type,
        id,
        name,
        label,
        text,
        value,
        placeholder,
        checked,
      });
    }

    return controls.slice(0, 200);
  });
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
      .slice(0, 30);
    return { bodyPreview: bodyText.slice(0, 2000), headings, buttons };
  });
  const controls = await inspectVisibleControls(page);

  return {
    label,
    url: page.url(),
    title: await page.title(),
    screenshot: `output/live-tests/${slug}-${label}.png`,
    controls,
    ...state,
    ...extra,
  };
}

function stateHasHeading(state, pattern) {
  return (state?.headings || []).slice(0, 3).some((heading) => pattern.test(heading));
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
      // Try next locator.
    }
  }
  return false;
}

async function bodyText(page) {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim());
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const slug = slugify(args.slug || `workday-fill-myinfo-${new Date().toISOString().slice(0, 10)}`);
  const continueTabs = args['continue-tabs'] === 'true';
  const forceConsent = args['force-consent'] === 'true';

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-fill-myinfo.mjs --url="https://..." --slug=my-run');
    process.exit(1);
  }

  const profile = parseSimpleYaml(join(ROOT, 'config', 'profile.yml'));
  const defaults = get(profile, 'application_defaults', {});
  const applicationFiles = get(profile, 'application_files', {});
  const candidate = get(profile, 'candidate', {});
  const resumePath = resolveLocalPath(args['resume-path'] || applicationFiles.resume_upload_path || '');
  const sourceConfig = resolveWorkdaySourceConfig(defaults, url);
  const runDefaults = forceConsent ? { ...defaults, consent_to_terms: true } : defaults;

  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 3000);

    const actions = [];
    const cookie = await dismissCookieBanner(page);
    if (cookie) actions.push(`cookie:${cookie}`);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const visiblePassword = page.locator('input[type="password"]').first();
      try {
        if (await visiblePassword.isVisible({ timeout: 1000 })) {
          if (await fillSignIn(page, email, password)) {
            actions.push('authenticated_signin');
          }
        }
      } catch {
        // No visible sign-in form yet.
      }

      const snapshot = await bodyText(page);
      if (/My Information|My Experience|Application Questions/i.test(snapshot)) {
        break;
      }

      const apply = await clickNamed(page, ['Apply']);
      if (apply) actions.push(apply);
      const applyManually = await clickNamed(page, ['Apply Manually', 'Continue']);
      if (applyManually) actions.push('Apply Manually');
      const signIn = await clickNamed(page, ['Sign In']);
      if (signIn) actions.push(signIn);
      await wait(page, 2000);
    }

    const fillLog = [];
    const sourceResult = await setWorkdaySource(page, sourceConfig);
    if (sourceResult.ok) fillLog.push(`set:How Did You Hear About Us?=${sourceResult.matchedOption || sourceConfig.sourceValue || sourceConfig.sourceQuery}`);
    const priorEmploymentChoice = get(defaults, 'company_specific_defaults.current_or_former_employee', undefined) === true
      || defaults.prior_medtronic_employment
      || defaults.prior_covidien_employment
      ? 'Yes'
      : 'No';
    if (
      await setChoiceNearQuestion(page, 'Were you previously employed', priorEmploymentChoice)
      || await setChoiceNearQuestion(page, 'prior employment', priorEmploymentChoice)
      || await setChoiceNearQuestion(page, 'worked for', priorEmploymentChoice)
      || await setRadioByLabel(page, priorEmploymentChoice)
    ) {
      fillLog.push('set:prior employment');
    }
    if (await setPickerByLabel(page, 'Country', defaults.country || candidate.country)) fillLog.push('set:Country');
    if (await fillById(page, 'name--legalName--firstName', defaults.first_name)) fillLog.push('fill:First Name');
    if (await fillById(page, 'name--legalName--middleName', defaults.middle_name || '')) fillLog.push('fill:Middle Name');
    if (await fillById(page, 'name--legalName--lastName', defaults.last_name)) fillLog.push('fill:Last Name');
    if (await fillById(page, 'address--addressLine1', defaults.address_line_1)) fillLog.push('fill:Address Line 1');
    if (await fillById(page, 'address--addressLine2', defaults.address_line_2 || '')) fillLog.push('fill:Address Line 2');
    if (await fillById(page, 'address--city', defaults.city)) fillLog.push('fill:City');
    if (defaults.state && await setPickerByLabel(page, 'State', defaults.state)) fillLog.push('set:State');
    if (await fillById(page, 'address--postalCode', defaults.postal_code)) fillLog.push('fill:Postal Code');
    if (await fillById(page, 'address--regionSubdivision1', defaults.county)) fillLog.push('fill:County');
    if (defaults.phone_device_type && await setPickerByLabel(page, 'Phone Device Type', defaults.phone_device_type)) fillLog.push('set:Phone Device Type');
    if (await setPickerByLabel(page, 'Country Phone Code', 'United States of America (+1)')) fillLog.push('set:Country Phone Code');
    if (await fillPhoneNumber(page, 'phoneNumber--phoneNumber', candidate.phone)) fillLog.push('fill:Phone Number');
    if (await fillById(page, 'phoneNumber--extension', '')) fillLog.push('fill:Phone Extension');

    const beforeSave = await capture(page, slug, 'myinfo-filled', { actions, fillLog });
    const fieldValidation = {
      sourceMissingAfterFill: /How Did You Hear About Us\?\*?\s*0 items selected|Error-How Did You Hear About Us\?/i.test(beforeSave.bodyPreview),
      phoneMissingAfterFill: /Error-Phone Number|The field Phone Number is required and must have a value\./i.test(beforeSave.bodyPreview),
    };
    if (fieldValidation.sourceMissingAfterFill) {
      sourceResult.ok = false;
      const sourceLogIndex = fillLog.findIndex((entry) => entry.startsWith('set:How Did You Hear About Us?='));
      if (sourceLogIndex >= 0) fillLog.splice(sourceLogIndex, 1);
    }
    const saved = await clickNamed(page, ['Save and Continue']);
    if (saved) actions.push(saved);
    await wait(page, 5000);
    let afterSave = await capture(page, slug, 'after-save', { actions, fillLog });

    if (!afterSave.bodyPreview.includes('Errors Found') && /My Information/i.test(afterSave.bodyPreview)) {
      const secondSave = await clickNamed(page, ['Save and Continue']);
      if (secondSave) actions.push('Save and Continue (retry)');
      await wait(page, 5000);
      afterSave = await capture(page, slug, 'after-save-retry', { actions, fillLog });
    }

    let tabStates = [];
    if (continueTabs && stateHasHeading(afterSave, /My Experience|Application Questions|Voluntary Disclosures|Self Identify|Review/i)) {
      const flowLog = [];
      if (stateHasHeading(afterSave, /My Experience/i)) {
        const myExperience = await capture(page, slug, 'my-experience', { flowLog, resumePath });
        tabStates.push({ stepName: 'My Experience', clicked: false, state: myExperience });

        if (await uploadFile(page, resumePath)) {
          flowLog.push('upload:Resume/CV');
          tabStates.push({
            stepName: 'My Experience Upload',
            clicked: false,
            state: await capture(page, slug, 'my-experience-uploaded', { flowLog, resumePath }),
          });
        }

        const experienceSave = await clickNamed(page, ['Save and Continue']);
        if (experienceSave) flowLog.push(experienceSave);
        await wait(page, 5000);

        const afterMyExperience = await capture(page, slug, 'after-my-experience', { flowLog });
        tabStates.push({ stepName: 'After My Experience', clicked: false, state: afterMyExperience });
        await handleLaterWorkdaySteps(page, slug, flowLog, runDefaults, tabStates, afterMyExperience);
      } else {
        await handleLaterWorkdaySteps(page, slug, flowLog, runDefaults, tabStates, afterSave);
      }
    }

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      inputUrl: url,
      actions,
      fillLog,
      resumePath,
      sourceResult,
      fieldValidation,
      beforeSave,
      afterSave,
      tabStates,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      actions,
      fillLog,
      finalUrl: result.finalUrl,
      finalTitle: result.finalTitle,
      sourceResult,
      fieldValidation,
      beforeSave: beforeSave.screenshot,
      afterSave: afterSave.screenshot,
      tabStates: tabStates.map((item) => ({
        stepName: item.stepName,
        clicked: item.clicked,
        screenshot: item.state.screenshot,
        heading: item.state.headings[1] || item.state.headings[0] || '',
      })),
      json: `output/live-tests/${slug}.json`,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday My Information fill failed: ${error.message}`);
  process.exit(1);
});
