# Codex Setup

Career-Ops LifeSci supports Codex through the root `AGENTS.md` file.

If your Codex client reads project instructions automatically, `AGENTS.md`
is enough to route work into the existing repo logic. Codex should reuse the
same checked-in modes, scripts, templates, and tracker flow that already power
the broader Career-Ops LifeSci workflow.

## Prerequisites

- A Codex client that can read project `AGENTS.md`
- Node.js 18+
- Playwright Chromium installed for PDF generation and live job verification
- Go 1.21+ if you want the terminal dashboard

## Install

```bash
npm install
npx playwright install chromium
```

## Recommended Starting Prompts

- `Evaluate this job URL with Career-Ops LifeSci and run the full pipeline.`
- `Scan my configured portals for new roles that match my profile.`
- `Generate the tailored ATS PDF for this role using Career-Ops LifeSci.`
- `Analyze my tracker and reports for application patterns.`
- `Check whether Career-Ops LifeSci has a system update I should apply.`

## Routing Map

| User intent | Files Codex should read |
|-------------|-------------------------|
| Raw JD text or job URL | `modes/_shared.md` + `modes/auto-pipeline.md` |
| Single evaluation only | `modes/_shared.md` + `modes/evaluate.md` |
| Multiple offers | `modes/_shared.md` + `modes/compare.md` |
| Portal scan | `modes/_shared.md` + `modes/scan.md` |
| PDF generation | `modes/_shared.md` + `modes/pdf.md` |
| Live application help | `modes/_shared.md` + `modes/apply.md` |
| Pattern analysis | `modes/patterns.md` + `scripts/analyze-patterns.mjs` |
| Pipeline inbox processing | `modes/_shared.md` + `modes/pipeline.md` |
| Tracker status | `modes/tracker.md` |
| Deep company research | `modes/deep.md` |
| Interview prep | `modes/interview-prep.md` |
| Training or certification review | `modes/training.md` |
| Project evaluation | `modes/project.md` |
| System update check or apply | `scripts/update-system.mjs` |

The key point: Codex support is additive. It should route into the existing
Career-Ops LifeSci modes and scripts rather than introducing a separate layer.

## Behavioral Rules

- Treat raw JD text or a job URL as the full auto-pipeline path unless the user explicitly asks for evaluation only.
- Keep personalization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or `portals.yml`.
- Never verify a job's live status with generic web fetch when Playwright is available.
- Never submit an application for the user.
- Never add new tracker rows directly to `data/applications.md`; use the TSV addition flow and `scripts/merge-tracker.mjs`.
- Use `node scripts/update-system.mjs check` for update checks and only apply updates after user confirmation.

## Verification

```bash
npm run doctor
npm run verify
npm run sync-check

# optional dashboard build
cd dashboard && go build ./...
```
