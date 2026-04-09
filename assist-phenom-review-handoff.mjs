#!/usr/bin/env node

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return String(value || 'phenom-review')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function resolveLocalPath(value) {
  if (!value) return '';
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return value;
  }
  return join(ROOT, value);
}

function toYesNo(value, fallback = '') {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return fallback;
}

function normalizeVeteranOption(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return '';
  if (/prefer not|wish not|do not wish|decline/.test(normalized)) return 'I do not wish to self-identify';
  if (/not a protected veteran|not protected/.test(normalized)) return 'I am not a protected veteran';
  if (/protected veteran|veteran/.test(normalized)) return 'I identify as one or more of the classifications of protected veterans listed above';
  return '';
}

function normalizeDisabilityChoice(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return '';
  if (/prefer not|do not wish|do not want|decline/.test(normalized)) return 'decline';
  if (/yes|have a disability/.test(normalized)) return 'yes';
  if (/no|do not have/.test(normalized)) return 'no';
  return '';
}

function normalizeReviewFocus(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'edit') return 'edit';
  if (normalized === 'top') return 'top';
  return 'submit';
}

function educationEntriesFromProfile(defaults) {
  const raw = get(defaults, 'phenom_education', {});
  return Object.keys(raw)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => raw[key])
    .filter((entry) => entry && typeof entry === 'object');
}

async function wait(page, ms = 1000) {
  await page.waitForTimeout(ms);
}

async function dismissCookieBanner(page) {
  for (const label of ['Allow', 'Accept', 'Accept all', 'Accept All']) {
    try {
      const target = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
      if (await target.isVisible({ timeout: 1000 })) {
        await target.click({ timeout: 3000 });
        await wait(page, 1000);
        return label;
      }
    } catch {
      // Ignore cookie-banner failures.
    }
  }
  return '';
}

async function clearCookieOverlay(page) {
  await page.evaluate(() => {
    const selectors = [
      '[key-role="gdpr-regionRole"]',
      '[data-ph-id*="cookie-popup"]',
      '[data-ph-id*="gdpr"]',
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) {
        node.style.display = 'none';
        node.style.visibility = 'hidden';
        node.style.pointerEvents = 'none';
      }
    }
  }).catch(() => {});
}

async function selectByBestLabel(locator, candidates) {
  const optionTexts = await locator.evaluate((element) =>
    Array.from(element.querySelectorAll('option')).map((option) => option.textContent?.trim() || '')
  );

  for (const candidate of candidates.map(cleanText).filter(Boolean)) {
    const exact = optionTexts.find((option) => option.toLowerCase() === candidate.toLowerCase());
    if (exact) {
      await locator.selectOption({ label: exact });
      return exact;
    }
  }

  for (const candidate of candidates.map(cleanText).filter(Boolean)) {
    const partial = optionTexts.find((option) => option.toLowerCase().includes(candidate.toLowerCase()));
    if (partial) {
      await locator.selectOption({ label: partial });
      return partial;
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

async function findControlIdByLabel(page, patterns) {
  const labels = await collectVisibleLabels(page);
  for (const pattern of patterns) {
    const match = labels.find((label) => pattern.test(label.text));
    if (match?.htmlFor) return match.htmlFor;
  }
  return '';
}

async function clickNextAndWait(page, pattern) {
  try {
    await page.getByRole('button', { name: /^next$/i }).click({ timeout: 5000 });
  } catch (error) {
    if (/intercepts pointer events|subtree intercepts pointer events/i.test(error.message)) {
      await clearCookieOverlay(page);
      await wait(page, 300);
      await page.getByRole('button', { name: /^next$/i }).click({ timeout: 5000 });
    } else {
      throw error;
    }
  }
  await page.waitForURL(pattern, { timeout: 30000 });
  await wait(page, 2500);
}

async function captureReviewSummary(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
      .filter(visible)
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 40);

    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter(visible)
      .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 80);

    return {
      url: location.href,
      title: document.title,
      headings,
      buttons,
      bodyPreview: (document.body?.innerText || '').slice(0, 9000),
    };
  });
}

async function scrollViewportToTop(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }).catch(() => {});
}

async function scrollViewportToBottom(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
  }).catch(() => {});
}

async function focusReviewArea(page, focus) {
  const normalizedFocus = normalizeReviewFocus(focus);
  if (normalizedFocus === 'top') {
    await scrollViewportToTop(page);
    return { focus: normalizedFocus, target: 'top' };
  }

  const targetText = normalizedFocus === 'edit' ? /edit/i : /submit/i;
  const roleTargets = [
    page.getByRole('link', { name: targetText }).first(),
    page.getByRole('button', { name: targetText }).first(),
  ];

  for (const target of roleTargets) {
    try {
      if (await target.count()) {
        await target.scrollIntoViewIfNeeded({ timeout: 3000 });
        await wait(page, 300);
        return { focus: normalizedFocus, target: normalizedFocus };
      }
    } catch {
      // Ignore and try the next strategy.
    }
  }

  if (normalizedFocus === 'submit') {
    await scrollViewportToBottom(page);
    return { focus: normalizedFocus, target: 'bottom_fallback' };
  }

  await scrollViewportToTop(page);
  return { focus: normalizedFocus, target: 'top_fallback' };
}

async function injectHandoffBanner(page, reviewFocus) {
  await page.evaluate((focus) => {
    const existing = document.getElementById('codex-phenom-handoff-helper');
    if (existing) existing.remove();

    const helper = document.createElement('div');
    helper.id = 'codex-phenom-handoff-helper';
    helper.setAttribute('data-codex-helper', 'true');
    helper.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">Career-Ops handoff</div>
      <div style="font-size:12px;line-height:1.4;margin-bottom:8px;">
        Use this page's Edit links instead of browser Back. Action buttons usually live at the bottom of each step.
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" data-codex-jump="top">Top</button>
        <button type="button" data-codex-jump="edit">First Edit</button>
        <button type="button" data-codex-jump="submit">Submit</button>
      </div>
      <div style="font-size:11px;opacity:0.9;margin-top:8px;">Default view: ${focus}</div>
    `;

    Object.assign(helper.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      width: '280px',
      maxWidth: 'calc(100vw - 32px)',
      background: 'rgba(17, 24, 39, 0.96)',
      color: '#fff',
      borderRadius: '12px',
      padding: '12px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
      fontFamily: 'Segoe UI, Arial, sans-serif',
    });

    const jumpToMatch = (pattern) => {
      const controls = Array.from(document.querySelectorAll('a, button'));
      const target = controls.find((control) => {
        const text = (control.textContent || '').replace(/\s+/g, ' ').trim();
        const rect = control.getBoundingClientRect();
        if (!text || rect.width === 0 || rect.height === 0) return false;
        return pattern.test(text);
      });

      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    helper.querySelectorAll('button[data-codex-jump]').forEach((button) => {
      button.addEventListener('click', () => {
        const jump = button.getAttribute('data-codex-jump');
        if (jump === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (jump === 'edit') {
          jumpToMatch(/^edit$/i);
        } else if (jump === 'submit') {
          jumpToMatch(/^submit$/i);
          setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 200);
        }
      });
    });

    helper.querySelectorAll('button').forEach((button) => {
      Object.assign(button.style, {
        border: '0',
        borderRadius: '999px',
        padding: '6px 10px',
        background: '#f8fafc',
        color: '#111827',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600',
      });
    });

    document.body.appendChild(helper);
  }, normalizeReviewFocus(reviewFocus)).catch(() => {});
}

function printHelp() {
  console.log(`Usage:
  node assist-phenom-review-handoff.mjs --url="https://careers.example.com/...apply..."

Options:
  --url=...                 Required Phenom/Phenom People apply URL
  --slug=...                Artifact/session slug
  --profile=...             Profile YAML path (default: config/profile.yml)
  --headless=true|false     Default false
  --keep-open=true|false    Keep headed browser open for user handoff (default true)
  --reset-session=true      Clear prior persistent session directory before launch
  --resume-path=...         Override resume path
  --salary-text=...         Override salary expectation text for job-specific questions
  --review-focus=...        Review landing target: submit (default), edit, or top
  --inject-handoff-banner=true|false
                            Show an in-page helper banner in headed handoff mode (default true)

This helper automates known Phenom steps using trusted local profile data,
stops at Review when possible, and leaves the live browser open for manual review.`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.url) {
    printHelp();
    process.exit(args.url ? 0 : 1);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(SESSION_ROOT, { recursive: true });

  const slug = slugify(args.slug || `phenom-review-${new Date().toISOString().slice(0, 10)}`);
  const profilePath = resolveLocalPath(args.profile || 'config/profile.yml');
  const profile = parseSimpleYaml(profilePath);
  const defaults = get(profile, 'application_defaults', {});
  const files = get(profile, 'application_files', {});
  const phenomDefaults = get(defaults, 'phenom_defaults', {});
  const sessionDir = join(SESSION_ROOT, slug);
  const reviewFocus = normalizeReviewFocus(args['review-focus'] || 'submit');
  const injectBanner = args['inject-handoff-banner'] !== 'false';

  if (args['reset-session'] === 'true' && existsSync(sessionDir)) {
    rmSync(sessionDir, { recursive: true, force: true });
  }

  const resumePath = resolveLocalPath(args['resume-path'] || files.resume_upload_path || '');
  const keepOpen = args['keep-open'] !== 'false';
  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: args.headless === 'true',
    viewport: { width: 1440, height: 1800 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  const result = {
    date: new Date().toISOString().slice(0, 10),
    slug,
    mode: 'visible_review_handoff',
    sessionDir,
    inputUrl: args.url,
    finalUrl: '',
    finalStep: '',
    reviewReached: false,
    missingData: [],
    notes: [],
    artifacts: {},
  };

  try {
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(page, 2500);
    const cookieAction = await dismissCookieBanner(page);
    if (cookieAction) result.notes.push(`dismissed_cookie_banner:${cookieAction}`);
    await clearCookieOverlay(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (resumePath && await fileInput.count()) {
      await fileInput.setInputFiles(resumePath);
      await wait(page, 2000);
      result.notes.push(`resume_uploaded:${resumePath}`);
    }

    const sourceSelected = await selectByBestLabel(page.locator('[id="applicantSource"]'), [
      get(phenomDefaults, 'how_did_you_hear', ''),
      defaults.how_did_you_hear,
      'Career Website',
      'Career Site',
      'Company careers page',
    ]).catch(() => '');
    if (!sourceSelected) {
      result.missingData.push('application_defaults.how_did_you_hear');
    }
    await page.locator('[id="previousWorker"]').selectOption({ label: toYesNo(get(phenomDefaults, 'previous_worker', false), 'No') });
    await selectByBestLabel(page.locator('[id="country"]'), [defaults.country, 'United States of America']);
    await page.locator('[id="cntryFields.firstName"]').fill(defaults.first_name || get(profile, 'candidate.full_name', '').split(' ')[0] || '');
    await page.locator('[id="cntryFields.lastName"]').fill(defaults.last_name || '');
    await selectByBestLabel(page.locator('[id="cntryFields.preferredName"]'), [cleanText(defaults.preferred_name) ? 'Yes' : 'No']);
    await page.locator('[id="cntryFields.addressLine1"]').fill(defaults.address_line_1 || '');
    await page.locator('[id="cntryFields.city"]').fill(defaults.city || '');
    await selectByBestLabel(page.locator('[id="cntryFields.region"]'), [defaults.state || '']);
    await page.locator('[id="cntryFields.postalCode"]').fill(defaults.postal_code || '');
    await page.locator('[id="email"]').fill(get(profile, 'candidate.email', ''));
    await selectByBestLabel(page.locator('[id="deviceType"]'), [defaults.phone_device_type || 'Mobile']);
    await selectByBestLabel(page.locator('[id="phoneWidget.countryPhoneCode"]'), [defaults.country ? `${defaults.country} (+1)` : '', 'United States of America (+1)']);
    await page.locator('[id="phoneWidget.phoneNumber"]').fill(String(get(profile, 'candidate.phone', '')).replace(/[^\d]/g, ''));
    await wait(page, 500);
    await clickNextAndWait(page, /step=2|stepname=workAndEducation/i);

    const educationEntries = educationEntriesFromProfile(defaults);
    if (!educationEntries.length) {
      result.missingData.push('application_defaults.phenom_education');
    }
    for (let index = 0; index < educationEntries.length; index += 1) {
      const entry = educationEntries[index];
      if (entry.school_name) {
        await page.locator(`[id="educationData[${index}].schoolName"]`).fill(entry.school_name).catch(() => {});
      }
      if (entry.degree_label) {
        await selectByBestLabel(page.locator(`[id="educationData[${index}].degree"]`), [entry.degree_label]).catch(() => {});
      }
      if (entry.field_of_study_label) {
        await selectByBestLabel(page.locator(`[id="educationData[${index}].fieldOfStudy"]`), [entry.field_of_study_label]).catch(() => {});
      }
      if (entry.end_year) {
        await page.locator(`[id="educationData[${index}].fromTo.endDate"]`).fill(String(entry.end_year)).catch(() => {});
      }
    }
    await wait(page, 500);
    await clickNextAndWait(page, /step=3|stepname=jobSpecificQuestions/i);

    const ageId = await findControlIdByLabel(page, [/at least 18/i]);
    const authId = await findControlIdByLabel(page, [/authorized to work in the united states/i]);
    const sponsorshipId = await findControlIdByLabel(page, [/future require sponsorship/i, /require sponsorship/i]);
    const relocateId = await findControlIdByLabel(page, [/willing to relocate/i]);
    const interviewedId = await findControlIdByLabel(page, [/interviewed with .* previously/i]);
    const salaryId = await findControlIdByLabel(page, [/salary expectations/i, /base salary/i]);

    if (ageId) await page.locator(`[id="${ageId}"]`).selectOption({ label: toYesNo(defaults.is_over_18, 'Yes') });
    if (authId) await page.locator(`[id="${authId}"]`).selectOption({ label: toYesNo(defaults.authorized_to_work_us, 'Yes') });
    if (sponsorshipId) await page.locator(`[id="${sponsorshipId}"]`).selectOption({ label: toYesNo(get(profile, 'authorization.future_sponsorship_required', false), 'No') });
    if (relocateId) await page.locator(`[id="${relocateId}"]`).selectOption({ label: toYesNo(defaults.open_to_relocation, 'No') });
    if (interviewedId) {
      const priorInterview = get(phenomDefaults, 'interviewed_with_employer_before', get(defaults, 'company_specific_defaults.interviewed_with_employer_before', false));
      await page.locator(`[id="${interviewedId}"]`).selectOption({ label: toYesNo(priorInterview, 'No') });
    }

    const salaryText = args['salary-text'] || get(phenomDefaults, 'base_salary_expectations', '');
    if (salaryId && salaryText) {
      await page.locator(`[id="${salaryId}"]`).fill(salaryText);
    } else if (salaryId) {
      result.missingData.push('application_defaults.phenom_defaults.base_salary_expectations');
    }

    if (!result.missingData.length) {
      await wait(page, 500);
      await clickNextAndWait(page, /step=4|stepname=voluntaryInformation/i);

      const veteranChoice = normalizeVeteranOption(get(defaults, 'self_id_defaults.veteran_status', ''));
      if (veteranChoice) {
        await selectByBestLabel(page.locator('[id="eeoUSA.veteranStatus"]'), [veteranChoice]);
      }
      if (defaults.consent_to_terms === true) {
        await page.locator('[id="agreementCheck"]').check().catch(() => {});
      } else {
        result.missingData.push('application_defaults.consent_to_terms=true');
      }
    }

    if (!result.missingData.length) {
      await wait(page, 500);
      await clickNextAndWait(page, /step=5|stepname=disabilityInformation/i);
      const disabilityChoice = normalizeDisabilityChoice(get(defaults, 'self_id_defaults.disability_status', ''));
      if (disabilityChoice === 'yes') {
        await page.locator('[id="disability_heading_self_identity.disabilityStatus.YES_REV_2026"]').check();
      } else if (disabilityChoice === 'no') {
        await page.locator('[id="disability_heading_self_identity.disabilityStatus.NO_REV_2026"]').check();
      } else {
        await page.locator('[id="disability_heading_self_identity.disabilityStatus.DECLINE_REV_2026"]').check().catch(() => {});
      }
      await wait(page, 500);
      await clickNextAndWait(page, /step=6|stepname=applicationReview/i);
      result.reviewReached = true;
      result.finalStep = 'review';
    }

    result.finalUrl = page.url();
    if (!result.finalStep) {
      if (/workAndEducation/i.test(result.finalUrl)) result.finalStep = 'work_and_education';
      else if (/jobSpecificQuestions/i.test(result.finalUrl)) result.finalStep = 'job_specific_questions';
      else if (/voluntaryInformation/i.test(result.finalUrl)) result.finalStep = 'voluntary_information';
      else if (/disabilityInformation/i.test(result.finalUrl)) result.finalStep = 'disability_information';
      else result.finalStep = 'unknown';
    }

    const screenshotPath = join(ARTIFACT_DIR, `${slug}-${result.finalStep}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.artifacts.screenshot = `output/live-tests/${slug}-${result.finalStep}.png`;

    if (result.reviewReached) {
      const reviewFocusApplied = await focusReviewArea(page, reviewFocus);
      result.artifacts.reviewFocus = reviewFocusApplied;
      const review = await captureReviewSummary(page);
      result.artifacts.reviewJson = `output/live-tests/${slug}-review.json`;
      writeFileSync(join(ARTIFACT_DIR, `${slug}-review.json`), JSON.stringify(review, null, 2));
      result.notes.push('review_reached_submit_visible');
      result.notes.push('use_review_edit_links_instead_of_browser_back');
      result.notes.push('next_save_submit_controls_live_at_bottom_of_step');
      result.notes.push(`review_focus:${reviewFocusApplied.focus}`);
      result.notes.push(`review_focus_target:${reviewFocusApplied.target}`);
      if (keepOpen && injectBanner) {
        await injectHandoffBanner(page, reviewFocus);
        result.notes.push('in_page_handoff_banner_injected');
      }
    } else if (result.missingData.length) {
      result.notes.push(`stopped_for_missing_data:${result.missingData.join(',')}`);
    }

    const summaryPath = join(ARTIFACT_DIR, `${slug}-summary.json`);
    writeFileSync(summaryPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      slug,
      reviewReached: result.reviewReached,
      finalStep: result.finalStep,
      finalUrl: result.finalUrl,
      sessionDir: result.sessionDir,
      missingData: result.missingData,
      artifacts: result.artifacts,
    }, null, 2));

    if (keepOpen) {
      console.log(`Visible browser handoff is active. Review focus: ${reviewFocus}. Use the page's Edit links instead of browser Back, and scroll to the bottom of each step for Next/Save/Submit.`);
      await new Promise((resolve) => {
        browser.browser()?.once('disconnected', resolve);
      });
    } else {
      await browser.close();
    }
  } catch (error) {
    result.finalUrl = page.url();
    result.finalStep = result.finalStep || 'error';
    result.notes.push(`error:${error.message}`);
    writeFileSync(join(ARTIFACT_DIR, `${slug}-summary.json`), JSON.stringify(result, null, 2));
    console.error(`Visible review handoff failed: ${error.message}`);
    await browser.close();
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(`Visible review handoff failed: ${error.message}`);
  process.exit(1);
});
