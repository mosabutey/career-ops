# Career-Ops LifeSci

<p align="center">
  <a href="https://github.com/mosabutey/career-ops-lifesci"><img src="docs/hero-banner.svg" alt="Career-Ops LifeSci - Career Operating System" width="800"></a>
</p>

<p align="center">
  <em>Resumes and spreadsheets are not enough for modern career navigation.</em><br>
  <strong>Career-Ops LifeSci helps ambitious people evaluate, target, position, package, and pursue the right opportunities with rigor.</strong><br>
  <em>Built as a community-first evolution of an excellent open-source foundation.</em>
</p>

<p align="center">
  <a href="https://www.anthropic.com/product/claude-code"><img src="https://img.shields.io/badge/Claude_Code-000000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code"></a>
  <a href="https://opencode.ai/"><img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode"></a>
  <a href="https://openai.com/codex"><img src="https://img.shields.io/badge/Codex-111111?style=flat&logo=openai&logoColor=white" alt="Codex"></a>
  <a href="https://nodejs.org/en"><img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="https://go.dev/"><img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go"></a>
  <a href="https://playwright.dev/docs/intro"><img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2563EB?style=flat" alt="MIT"></a>
  <br>
  <img src="https://img.shields.io/badge/EN-1D4ED8?style=flat" alt="EN">
  <img src="https://img.shields.io/badge/DE-6B7280?style=flat" alt="DE">
  <img src="https://img.shields.io/badge/FR-2563EB?style=flat" alt="FR">
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Career-Ops LifeSci Demo" width="800">
</p>

## What This Is

Career-Ops LifeSci is an open-source career operating system for people navigating complex professional paths across science, medicine, consulting, health-tech, technical strategy, and adjacent industries.

### At a glance

| Dimension | What it means here |
|-----------|--------------------|
| **Local-first** | Your CV, profile, reports, outputs, and browser-assisted apply artifacts stay on your machine by default |
| **Role-aware** | Supports `role_pack x career_stage` instead of forcing a single generic job-search path |
| **English-first** | Shared system layer is optimized for English-language use while still supporting additional language mode packs |
| **Product-minded** | Real ATS validation, stronger docs, and explicit human-review boundaries matter more than speculative automation |

It is designed for:
- MDs, PhDs, MD-PhDs, postdocs, residents, fellows, and clinicians
- graduate and undergraduate students
- internship, externship, co-op, and fellowship applicants
- international candidates navigating CPT, OPT, STEM OPT, J-1 pathways, and future sponsorship questions
- career changers with deep but nontraditional experience
- ambitious operators who need more than a resume, spreadsheet, and intuition

Career-Ops LifeSci is not just a resume tool. It helps you:
- evaluate opportunities with structured judgment
- identify fit across multiple role families
- translate your experience into employer-relevant language
- reason clearly about work authorization, sponsorship signals, and international-candidate constraints
- generate tailored, ATS-safe documents
- build opportunity pipelines and track decisions
- move faster without losing rigor

> **Important:** Career-Ops LifeSci is not a spray-and-pray bot. It is a decision-support system. It is designed to help you choose the right opportunities, not overwhelm employers with low-fit applications.

## Why This Exists

Modern career navigation is multidimensional. A strong candidate may simultaneously fit:
- biotech or pharma medical-scientific roles
- life sciences consulting or diligence work
- health-tech strategy or scientific product roles
- internships, fellowships, or other stage-specific entry paths

Most people are told to reduce themselves to one title too early. Career-Ops LifeSci takes the opposite approach: it helps you manage opportunity intelligence, narrative positioning, and application quality across multiple plausible futures.

## Who It Serves First

Day-one audience order:
1. Scientists and clinicians
2. Broader career changers with deep transferable experience
3. Students and trainees entering industry

The repo supports role packs and career-stage paths from the start, so it can serve both an experienced physician-scientist and a graduate student pursuing a first industry internship.

## Role Packs and Career Stages

### Role packs

- `biopharma_medical`: medical affairs, MSL, scientific affairs, clinical scientist, translational science, biomarker, and therapeutic-area roles
- `life_sciences_consulting`: strategy, diligence, advisory, portfolio, and scientifically intensive consulting roles
- `healthtech_scientific`: product, clinical strategy, medical content, partnerships, solutions, and scientific-product roles
- `adjacent_generalist`: cross-functional roles where scientific or clinical credibility creates an edge

### Career stages

- `student_early`: undergraduate, graduate, internship, externship, co-op, trainee
- `advanced_training`: PhD candidate, postdoc, resident, fellow, MD-PhD, research trainee
- `experienced_professional`: clinician, scientist, consultant, operator, manager

## Core Capabilities

| Capability | What it does |
|------------|--------------|
| **Evaluate** | Scores a role, explains fit, gaps, risks, and positioning strategy |
| **Compare** | Ranks multiple roles without flattening important trade-offs |
| **PDF / Resume Generation** | Produces tailored ATS-safe resume variants for each role family |
| **Scan** | Searches portals and company pages for new opportunities |
| **Batch** | Processes multiple opportunities in parallel |
| **Tracker** | Keeps a canonical application pipeline with integrity checks |
| **Interview Prep** | Builds reusable stories, objections, and case-study framing |
| **Contact** | Drafts role-aware outreach for networking and recruiter conversations |
| **Patterns** | Analyzes tracker and report data to surface conversion, focus, and strategy patterns |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/mosabutey/career-ops-lifesci.git
cd career-ops-lifesci
npm install
npx playwright install chromium
npm run doctor

# 2. Configure your profile
cp config/profile.example.yml config/profile.yml
cp templates/portals.example.yml portals.yml

# 3. Add your source material
# Create cv.md in the project root
# Optional: create article-digest.md with proof points, publications, projects, awards

# 4. Open your AI coding tool in this directory
claude
# or: codex
# or: opencode

# 5. Ask it to personalize the system
# "Set this up for biotech medical affairs and life sciences consulting roles"
# "Build a student internship version for me"
# "Tailor the scanner to neuro, oncology, and health-tech companies"
```

See [docs/SETUP.md](docs/SETUP.md) for the full setup guide.

For `/career-ops apply`, do not stop at a minimal profile. Fill the local-only `application_defaults` section in `config/profile.yml` with the truthful identity, address, phone, repeated portal answers, mobility preferences, and voluntary disclosure defaults you want available during live browser-assisted applications. Also fill `application_files` with the approved local resume path you want agents to upload, plus any optional cover letter or transcript paths. If a Workday employer uses unusual source-picker wording, store that in `application_defaults.workday_overrides` so agents do not stall on `How Did You Hear About Us?`.

Privacy note:
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, and interview-prep notes are intended to stay local on your machine and should not be committed to the open-source repo.
- The repo is designed so agents can use those files locally while keeping the public system layer generic.
- See [SECURITY.md](SECURITY.md) for the privacy and security model, including ignored secret/session artifacts and local-only browser-validation outputs.

## Typical Workflows

### Command Center

The core command surface works across Claude Code, Codex, and OpenCode:
- `/career-ops {JD or URL}` -> full auto-pipeline
- `/career-ops evaluate` -> evaluation only
- `/career-ops compare` -> compare multiple roles
- `/career-ops scan` -> scan portals and company pages
- `/career-ops apply` -> browser-assisted application support
- `/career-ops pdf` -> generate the best-fit document
- `/career-ops patterns` -> learn from tracker and report data
- `/career-ops pipeline` -> process saved URLs
- `/career-ops batch` -> run parallel evaluation flows

### Opportunity evaluation

Paste a job URL or JD text and get:
- a structured evaluation report
- a score with clear reasoning
- a recommended resume variant
- a tracker entry

### Role-family adaptation

Ask the agent to adapt the repo to your path:
- "Change the role packs to medtech commercialization and VC diligence"
- "Support consulting internships and PhD fellowship applications"
- "Make my default path medical affairs, with health-tech as secondary"

### Stage-aware support

Career-Ops LifeSci explicitly supports:
- internships
- externships
- co-ops
- fellowships
- early-career associate roles
- advanced training transitions
- experienced professional pivots

### International candidate support

The repo can be configured for candidates who:
- can work now but will need sponsorship later
- need immediate sponsorship or transfer support
- are pursuing internships or early-career roles through CPT, OPT, STEM OPT, J-1, or similar pathways

The default policy is practical:
- explicit no-sponsorship language is a real signal
- explicit sponsorship support is a positive signal
- silence is not an automatic rejection
- citizenship or clearance requirements should be surfaced clearly

### Browser-assisted applications

When browser automation is available, the system can:
- open job sites and live application pages
- inspect visible form questions
- generate tailored responses from prior reports
- upload the correct resume or cover letter when the file path is known
- fill sections of the form for human review
- leave a visible browser open on the live `Review` page when the platform supports a direct handoff workflow

To keep that flow smooth, users should front-load their local-only application profile:
- legal/contact details used in job portals
- address and phone metadata
- work authorization and sponsorship answers
- repeated portal answers such as travel, relocation, age-of-majority, confidentiality/non-compete, and prior-employment disclosures
- voluntary disclosure defaults they are comfortable storing locally
- employer-specific source-picker overrides when a platform accepts a truthful answer but only under tenant-specific wording
- approved upload paths for resume, cover letter, transcript, or similar documents that a portal may request

The human boundary stays in place:
- the candidate reviews the materials
- the candidate owns the final decision
- the system should stop before final submission unless the user explicitly asks for a final handoff and still reviews first

Repeat-company note:
- some Workday employers remember prior applicant state, may skip parts of account setup on later applications, and may offer accelerators such as `Use My Last Application` or resume-driven autofill
- treat those as speed features, not proof that the imported information is correct; agents should still verify every carried-forward field before the final review

Best-practice handoff note:
- when possible, prefer a visible browser handoff over a disposable headless run so the candidate can directly inspect the live ATS review page instead of relying only on screenshots
- for Phenom / Phenom People employers, use `npm run apply:phenom-review -- --url="https://careers.example.com/.../apply?jobSeqNo=..."` to drive a visible review handoff from local profile data
- the repo's operational automation now lives under `scripts/`, so direct script entry points follow the pattern `node scripts/<name>.mjs`
- if a live review handoff is not possible, preserve a persistent session and rely on ATS saved-draft or returning-applicant recovery paths instead of starting over blindly
- see [docs/APPLY_REVIEW_HANDOFF.md](docs/APPLY_REVIEW_HANDOFF.md) for the full handoff and recovery playbook

## What Agents Can Do Locally On Your PC

When this repo is open in Codex, Claude Code, or another compatible CLI, the agent can:
- read and edit repo files locally
- run validation and maintenance scripts
- open job sites, evaluate postings, and save reports
- generate ATS-safe resumes and cover letters
- assist with browser-based application forms, uploads, and field-filling
- maintain the tracker and pipeline without breaking the data contract
- adapt the repo itself for new sectors, role packs, and workflows

## How It Works

```text
You provide a JD or URL
        |
        v
Role-pack detection + career-stage detection
        |
        v
Structured evaluation
        |
        +--> report (.md)
        +--> tailored resume (.pdf)
        +--> tracker TSV -> applications.md
```

## Examples

Check the `examples/` directory for fictional setups covering multiple user types, including:
- physician-scientist to medical affairs
- graduate student to consulting internship
- broader dual-track profiles

## Public-Facing Principles

- Quality over quantity
- Honest evidence over inflated narratives
- Local-first data handling
- Human review before any application is sent
- Broad usefulness beyond one founder or one career arc

## Acknowledgment

This repo is a community-first evolution of the original [career-ops](https://github.com/santifer/career-ops) by [santifer](https://santifer.io), whose work demonstrated how powerful local-first, agentic job-search tooling can be.

This fork expands that foundation toward scientific, clinical, consulting, health-tech, student, and multidomain career navigation.

The portfolio that accompanied the original project is also open source: [cv-santiago](https://github.com/santifer/cv-santiago).

## Project Structure

```text
career-ops-lifesci/
|-- AGENTS.md
|-- CLAUDE.md
|-- config/profile.example.yml
|-- modes/
|-- templates/
|-- batch/
|-- dashboard/
|-- docs/
|-- examples/
|-- data/
|-- reports/
|-- output/
```

## Documentation

- [docs/SETUP.md](docs/SETUP.md)
- [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/LOCAL_AGENT_GUIDE.md](docs/LOCAL_AGENT_GUIDE.md)
- [docs/ATS_APPLY_PLAYBOOK.md](docs/ATS_APPLY_PLAYBOOK.md)
- [docs/BROWSER_APPLY_CHECKLIST.md](docs/BROWSER_APPLY_CHECKLIST.md)
- [docs/VALIDATION_ROADMAP.md](docs/VALIDATION_ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md)

## Disclaimer

Career-Ops LifeSci is a local, open-source tool, not a hosted service. You control your data, your prompts, your providers, and your outputs. Always review generated material for accuracy and fit before using it in the real world.

See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) for full details.

## License

Released under the [MIT License](LICENSE).
