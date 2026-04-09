#!/usr/bin/env node

/**
 * generate-pdf.mjs - HTML -> PDF via Playwright
 *
 * Usage:
 *   node scripts/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]
 *
 * Requires: playwright installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Normalize text for ATS compatibility by converting problematic Unicode.
 *
 * ATS parsers and legacy systems often fail on em-dashes, smart quotes,
 * zero-width characters, and non-breaking spaces. These cause mojibake,
 * parsing errors, or display issues. See issue #1.
 *
 * Only touches body text - preserves CSS, JS, tag attributes, and URLs.
 * Returns { html, replacements } so the caller can log what was changed.
 */
export function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => {
    replacements[key] = (replacements[key] || 0) + n;
  };

  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) {
      out += sanitizeText(masked.slice(i));
      break;
    }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) {
      out += masked.slice(lt);
      break;
    }
    out += masked.slice(lt, gt + 1);
    i = gt + 1;
  }

  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let sanitized = text;
    sanitized = sanitized.replace(/\u2014/g, () => {
      bump('em-dash', 1);
      return '-';
    });
    sanitized = sanitized.replace(/\u2013/g, () => {
      bump('en-dash', 1);
      return '-';
    });
    sanitized = sanitized.replace(/[\u201C\u201D\u201E\u201F]/g, () => {
      bump('smart-double-quote', 1);
      return '"';
    });
    sanitized = sanitized.replace(/[\u2018\u2019\u201A\u201B]/g, () => {
      bump('smart-single-quote', 1);
      return "'";
    });
    sanitized = sanitized.replace(/\u2026/g, () => {
      bump('ellipsis', 1);
      return '...';
    });
    sanitized = sanitized.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => {
      bump('zero-width', 1);
      return '';
    });
    sanitized = sanitized.replace(/\u00A0/g, () => {
      bump('nbsp', 1);
      return ' ';
    });
    return sanitized;
  }
}

export function isSafeRenderUrl(url) {
  return /^(file|data|about):/i.test(String(url || ''));
}

export async function generatePDF({ inputPath, outputPath, format = 'a4', silent = false } = {}) {
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]');
  }

  const log = silent ? () => {} : console.log;

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    throw new Error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
  }

  log(`📄 Input:  ${inputPath}`);
  log(`📁 Output: ${outputPath}`);
  log(`📏 Format: ${format.toUpperCase()}`);

  let html = await readFile(inputPath, 'utf-8');

  const fontsDir = resolve(projectRoot, 'fonts');
  html = html.replace(/url\(['"]?\.\/fonts\//g, `url('file://${fontsDir}/`);
  html = html.replace(/file:\/\/([^'")]+)\.woff2['"]\)/g, `file://$1.woff2')`);

  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const blockedRequests = [];

    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (isSafeRenderUrl(requestUrl)) {
        await route.continue();
        return;
      }

      blockedRequests.push(requestUrl);
      await route.abort();
    });

    await page.setContent(html, {
      waitUntil: 'networkidle',
      baseURL: `file://${dirname(inputPath)}/`,
    });

    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: {
        top: '0.6in',
        right: '0.6in',
        bottom: '0.6in',
        left: '0.6in',
      },
      preferCSSPageSize: false,
    });

    await writeFile(outputPath, pdfBuffer);

    const pdfString = pdfBuffer.toString('latin1');
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

    if (blockedRequests.length > 0) {
      const uniqueBlocked = [...new Set(blockedRequests)];
      log(`Blocked ${uniqueBlocked.length} remote render request(s) during PDF generation`);
    }

    log(`✅ PDF generated: ${outputPath}`);
    log(`📊 Pages: ${pageCount}`);
    log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    return {
      outputPath,
      pageCount,
      size: pdfBuffer.length,
      replacements: normalized.replacements,
      blockedRequests: [...new Set(blockedRequests)],
    };
  } finally {
    await browser.close();
  }
}

function parseCliArgs(args) {
  let inputPath;
  let outputPath;
  let format = 'a4';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  return { inputPath, outputPath, format };
}

async function main() {
  const { inputPath, outputPath, format } = parseCliArgs(process.argv.slice(2));
  await generatePDF({ inputPath, outputPath, format });
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ PDF generation failed:', err.message);
    process.exit(1);
  });
}
