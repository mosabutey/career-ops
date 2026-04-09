# Setup Guide

## Prerequisites

- an AI coding tool such as Claude Code, Codex, or OpenCode
- Node.js 18+
- Playwright Chromium for PDF generation
- optional: Go for the dashboard

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/mosabutey/career-ops-lifesci.git
cd career-ops-lifesci
npm install
npx playwright install chromium
npm run doctor
```

### 2. Configure your profile

```bash
cp config/profile.example.yml config/profile.yml
cp templates/portals.example.yml portals.yml
```

Edit `config/profile.yml` with:
- your identity
- your career stage
- your primary role packs
- your narrative and proof themes
- your markets and constraints
- your portal/application defaults in `application_defaults`

For browser-assisted apply work, do not stop at a minimal profile. Fill the local-only `application_defaults` section before you start sending agents into live portals.

That section should cover, truthfully:
- legal/contact details used in applications: prefix, legal first/middle/last name, preferred name, suffix, phone, address, county, postal code, country
- portal-level defaults: how you heard about the role, phone device type, age-of-majority answers, travel/field-travel/relocation preferences
- work authorization and disclosure answers that repeat in portals
- employer-history questions that may recur, such as prior employment or contractor status
- employer-specific Workday source-picker wording when a tenant expects a truthful answer under labels like `Career Page`, `Career Site`, or `Employee Referral`
- voluntary disclosure defaults you want available locally, such as veteran status, disability status, gender, race/ethnicity, and Hispanic/Latino responses
- whether the agent may pre-check required consent/attestation boxes before your review
- approved upload-file paths in `application_files`, especially your default resume path and any optional cover letter or transcript path
- any ATS-specific fields you want available for visible review handoff helpers, such as:
  - `application_defaults.phenom_defaults.*`
  - `application_defaults.phenom_education.*`

These values stay local in `config/profile.yml`; they are not meant for the public repo.

### 3. Add your source materials

Create `cv.md` in the project root.

Optional but strongly recommended:
- `article-digest.md` for proof points, publications, projects, awards, or case studies
- `modes/_profile.md` for your translation library and track-specific positioning

If you plan to use `/career-ops apply`, strongly recommended becomes practically required:
- complete `config/profile.yml` including `application_defaults`
- keep `cv.md` current and truthful
- decide your local-only defaults for voluntary disclosures and repeated portal questions before the first live application session
- store any known employer-specific Workday source overrides once in `config/profile.yml` so agents do not have to stop on later applications
- expect resume autofill and `Use My Last Application` to need review and correction even when a returning-employer flow looks faster

### 4. Open your AI tool

```bash
claude
# or: codex
# or: opencode
```

Then ask the tool to personalize the system. Examples:
- "Set this up for medical affairs and life sciences consulting"
- "Build an internship-friendly version for graduate students"
- "Make health-tech my secondary track"

### 5. Start using it

You can:
- paste a JD or URL to evaluate it
- run `/career-ops scan`
- run `/career-ops pdf`
- run `/career-ops patterns`
- run `/career-ops batch`

## Local PC capabilities

When the repo is open in a compatible local agent environment, the agent can:
- run repo scripts and validations
- open job sites and inspect live postings
- generate tailored documents locally
- assist with browser-based application forms
- upload resume or cover letter files when paths are known
- fill visible fields and stop before final submission

The user remains the final reviewer and submitter of all real applications.

If you want the strongest browser-assisted apply experience, prefer a visible review handoff workflow rather than a disposable headless run. For Phenom / Phenom People employers, the repo now includes:

```bash
npm run apply:phenom-review -- --url="https://careers.example.com/.../apply?jobSeqNo=..."
```

That helper uses a persistent local browser profile, fills known fields from `config/profile.yml`, and keeps the live browser open when it reaches `Review` so you can inspect the real application directly.

For boundaries and operating expectations, see [docs/LOCAL_AGENT_GUIDE.md](LOCAL_AGENT_GUIDE.md).
For real-site validation of browser assistance, see [docs/BROWSER_APPLY_CHECKLIST.md](BROWSER_APPLY_CHECKLIST.md).
For ATS-specific application behavior, see [docs/ATS_APPLY_PLAYBOOK.md](ATS_APPLY_PLAYBOOK.md).
For visible review handoff and recovery paths, see [docs/APPLY_REVIEW_HANDOFF.md](APPLY_REVIEW_HANDOFF.md).

## Validate setup

```bash
npm run doctor
node cv-sync-check.mjs
node verify-pipeline.mjs
node analyze-patterns.mjs
```

## Optional dashboard

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```
