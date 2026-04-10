#!/usr/bin/env node

const { chromium } = require('playwright');
const path = require('path');

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    parsed[key] = rest.length ? rest.join('=') : 'true';
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionDir = args['session-dir'];
  if (!sessionDir) {
    throw new Error('Missing --session-dir');
  }

  const resolved = path.resolve(sessionDir);
  await chromium.launchPersistentContext(resolved, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
