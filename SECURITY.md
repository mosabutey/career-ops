# Security and Privacy

Career-Ops LifeSci is a local-first system. The primary security goal is simple:

- keep personal data local
- keep public repo content generic
- keep browser-assisted workflows inside explicit human-review boundaries

This document explains the expected security posture for contributors and local users.

## Threat Model

The main risks in this repo are not classic server-side exploits. They are:

- accidental publication of private candidate data
- accidental publication of browser/session artifacts
- accidental publication of credentials or test-account secrets
- unsafe assumptions about what an ATS flow actually did
- generated documents fetching remote assets during local rendering

This repo is designed to reduce those risks, not to bypass platform security controls.

## Public Repo Rules

Never commit:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `article-digest.md`
- `portals.yml`
- `data/*`
- `reports/*`
- `output/*`
- `jds/*`
- `.env` or `.env.*`
- browser auth/session exports such as `playwright/.auth/` or `storage-state*.json`
- captured network archives such as `*.har`

If a file contains real identity, contact, compensation, authorization, disclosure, account, or application data, it belongs in the local user layer only.

Portal and ATS learnings are encouraged in the public repo when they are sanitized and reusable. Keep the generic lesson public, and keep employer-specific or user-specific operator details in `.career-ops-local/`. See [docs/PUBLIC_PORTAL_LEARNINGS.md](docs/PUBLIC_PORTAL_LEARNINGS.md).

## Browser Automation Boundaries

Agents should not:

- bypass captchas or anti-bot systems
- harvest or exfiltrate cookies, tokens, or session data
- auto-submit real applications without human review
- hardcode credentials in tracked files
- treat a clickable sidebar step as proof of Workday progression

Agents may:

- use local-only profile data the user explicitly provided
- use environment variables for temporary local test credentials
- stop before final submission
- record local-only artifacts in ignored paths for validation

## PDF Generation Safety

The PDF renderer is expected to stay local-first:

- self-hosted fonts are preferred
- remote render requests should be blocked during Playwright PDF generation
- generated HTML should not rely on remote scripts or tracking assets

This reduces the chance that rendering a CV leaks candidate information to third-party servers.

## Privacy Review Checklist

Before pushing changes, check:

1. no user-layer files are tracked
2. no credentials or secrets appear in tracked files
3. no local absolute paths leaked into shared system files
4. no live-test screenshots or reports with PII are being committed
5. public docs and examples use placeholders or intentionally public sample data only
6. `npm run privacy-check` passes before public push

## Reporting a Security Issue

If you discover a privacy leak, credential exposure, tracked personal data, or another security issue:

1. do not open a public issue with the secret or personal data attached
2. remove or rotate the exposed material locally first when possible
3. prepare a minimal reproduction that does not include private data
4. report the problem privately to the maintainer if sensitive details are involved

## Scope Note

No repository can honestly promise to be "hack-proof." The practical goal here is narrower and more useful:

- minimize accidental data exposure
- keep local automation from widening the attack surface
- make privacy mistakes visible early through docs, ignore rules, and validation checks
