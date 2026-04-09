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
  return String(value || 'workday-picker-options')
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
          await candidate.fill(email);
          break;
        }
      } catch {
        // Try next candidate.
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
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], [role="combobox"], input[type="text"]')).filter(visible);
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

  const element = handle.asElement();
  if (element) return element;

  if (/how did you hear about us/i.test(label)) {
    const fallback = await page.locator('#source--source').elementHandle();
    return fallback;
  }

  return null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const email = process.env.WORKDAY_TEST_EMAIL;
  const password = process.env.WORKDAY_TEST_PASSWORD;
  const url = args.url;
  const label = args.label || 'How Did You Hear About Us?';
  const selectText = args.select || '';
  const query = args.query || '';
  const slug = slugify(args.slug || `workday-picker-options-${new Date().toISOString().slice(0, 10)}`);

  if (!email || !password || !url) {
    console.error('Usage: WORKDAY_TEST_EMAIL=... WORKDAY_TEST_PASSWORD=... node scripts/probe-workday-picker-options.mjs --url="https://..." --label="How Did You Hear About Us?" --slug=my-run');
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
    await wait(page, 2000);
    await clickNamed(page, ['Sign In']);
    await wait(page, 1500);
    await fillSignIn(page, email, password);

    const picker = await getPickerHandle(page, label);
    if (!picker) throw new Error(`Picker not found for label: ${label}`);
    await picker.click({ timeout: 4000 });
    if (query) {
      await picker.fill(query);
      await wait(page, 1200);
    } else if (/how did you hear about us/i.test(label)) {
      await picker.fill('Career');
      await wait(page, 1200);
    }
    await wait(page, 1500);

    if (selectText) {
      const exactRegex = new RegExp(`^${escapeRegex(selectText)}$`, 'i');
      const containsRegex = new RegExp(escapeRegex(selectText), 'i');
      const selectLocators = [
        page.getByRole('option', { name: exactRegex }),
        page.getByRole('button', { name: exactRegex }),
        page.getByText(exactRegex),
        page.getByRole('option', { name: containsRegex }),
        page.getByRole('button', { name: containsRegex }),
        page.getByText(containsRegex),
      ];
      for (const locator of selectLocators) {
        const target = locator.first();
        try {
          if (await target.isVisible({ timeout: 1000 })) {
            await target.click({ timeout: 3000 });
            await wait(page, 1500);
            try {
              await page.keyboard.press('Tab');
              await wait(page, 1000);
            } catch {
              // Ignore.
            }
            break;
          }
        } catch {
          // Try next locator.
        }
      }
    }

    const screenshotPath = join(ARTIFACT_DIR, `${slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const pickerState = await picker.evaluate((element) => {
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const controlsId = element.getAttribute('aria-controls') || '';
      const activeId = element.getAttribute('aria-activedescendant') || '';
      const expanded = element.getAttribute('aria-expanded') || '';
      const role = element.getAttribute('role') || '';
      const value = element instanceof HTMLInputElement ? element.value : element.getAttribute('value') || '';
      return {
        tag: element.tagName.toLowerCase(),
        id: element.getAttribute('id') || '',
        role,
        expanded,
        controlsId,
        activeId,
        value: clean(value),
        placeholder: clean(element.getAttribute('placeholder')),
        ariaLabel: clean(element.getAttribute('aria-label')),
      };
    });

    const diagnosticState = await page.evaluate(({ state, queryText, selectedText }) => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const matchesFocusText = (text) => {
        const lower = clean(text).toLowerCase();
        const queryLower = clean(queryText).toLowerCase();
        const selectedLower = clean(selectedText).toLowerCase();
        return (queryLower && lower.includes(queryLower))
          || (selectedLower && lower.includes(selectedLower))
          || /career|website|source|job board|referral|social media|headhunter|direct source/.test(lower);
      };
      const texts = [];
      const optionNodes = [];
      const pushText = (node) => {
        const text = clean(node?.textContent);
        if (text && text.length < 180) texts.push(text);
      };
      const pushNode = (node) => {
        const text = clean(node?.textContent);
        if (!text || text.length >= 180) return;
        optionNodes.push({
          tag: node.tagName.toLowerCase(),
          id: node.getAttribute('id') || '',
          role: node.getAttribute('role') || '',
          text,
          ariaSelected: node.getAttribute('aria-selected') || '',
          ariaChecked: node.getAttribute('aria-checked') || '',
          dataAutomationId: node.getAttribute('data-automation-id') || '',
          tabIndex: node.getAttribute('tabindex') || '',
        });
      };

      if (state.controlsId) {
        const controlled = document.getElementById(state.controlsId);
        if (controlled && visible(controlled)) {
          pushText(controlled);
          for (const node of Array.from(controlled.querySelectorAll('[role="option"], li, button, div, span')).filter(visible)) {
            pushText(node);
            pushNode(node);
          }
        }
      }

      for (const node of Array.from(document.querySelectorAll('[role="option"], [role="listbox"], li, button, div, span')).filter(visible)) {
        pushText(node);
        pushNode(node);
      }

      const picker = document.getElementById(state.id) || null;
      let containerText = '';
      let containerPath = [];
      if (picker) {
        let ancestor = picker.closest('[data-automation-id="formField-source"]')
          || picker.closest('[data-automation-id*="formField"]')
          || picker.parentElement;
        let depth = 0;
        while (ancestor && depth < 6) {
          const text = clean(ancestor.textContent);
          if (text && text.length < 800) {
            containerText = text;
            containerPath.push({
              tag: ancestor.tagName.toLowerCase(),
              id: ancestor.getAttribute('id') || '',
              role: ancestor.getAttribute('role') || '',
              dataAutomationId: ancestor.getAttribute('data-automation-id') || '',
              text,
            });
            break;
          }
          containerPath.push({
            tag: ancestor.tagName.toLowerCase(),
            id: ancestor.getAttribute('id') || '',
            role: ancestor.getAttribute('role') || '',
            dataAutomationId: ancestor.getAttribute('data-automation-id') || '',
            text,
          });
          ancestor = ancestor.parentElement;
          depth += 1;
        }
      }

      const focusedOptionNodes = optionNodes
        .filter((node) => matchesFocusText(node.text))
        .slice(0, 40);

      return {
        options: [...new Set(texts)].slice(0, 120),
        optionNodes: optionNodes.slice(0, 80),
        focusedOptionNodes,
        containerText,
        containerPath,
        bodyPreview: clean(document.body?.innerText).slice(0, 1200),
      };
    }, { state: pickerState, queryText: query, selectedText: selectText });

    const result = {
      date: new Date().toISOString().slice(0, 10),
      slug,
      url: page.url(),
      title: await page.title(),
      label,
      query,
      selectText,
      pickerState,
      options: diagnosticState.options,
      optionNodes: diagnosticState.optionNodes,
      focusedOptionNodes: diagnosticState.focusedOptionNodes,
      containerText: diagnosticState.containerText,
      containerPath: diagnosticState.containerPath,
      bodyPreview: diagnosticState.bodyPreview,
      screenshot: `output/live-tests/${slug}.png`,
    };

    writeFileSync(join(ARTIFACT_DIR, `${slug}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`Workday picker option probe failed: ${error.message}`);
  process.exit(1);
});
