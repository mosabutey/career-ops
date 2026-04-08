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

### 3. Add your source materials

Create `cv.md` in the project root.

Optional but strongly recommended:
- `article-digest.md` for proof points, publications, projects, awards, or case studies
- `modes/_profile.md` for your translation library and track-specific positioning

### 4. Open your AI tool

```bash
claude
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
- run `/career-ops batch`

## Validate setup

```bash
node cv-sync-check.mjs
node verify-pipeline.mjs
```

## Optional dashboard

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```
