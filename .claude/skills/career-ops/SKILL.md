---
name: career-ops
description: Career-Ops LifeSci -- evaluate opportunities, generate tailored resumes, scan portals, and track applications
user_invocable: true
args: mode
argument-hint: "[evaluate | compare | contact | deep | pdf | training | project | tracker | interview-prep | patterns | pipeline | apply | scan | batch | update]"
---

# Career-Ops LifeSci -- Router

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `evaluate` | `evaluate` |
| `compare` | `compare` |
| `contact` | `contact` |
| `oferta` | `evaluate` (legacy alias) |
| `ofertas` | `compare` (legacy alias) |
| `contacto` | `contact` (legacy alias) |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `interview-prep` | `interview-prep` |
| `patterns` | `patterns` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `update` | `update` -- check or apply system updates |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
Career-Ops LifeSci -- Command Center

Available commands:
  /career-ops {JD}      -> AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /career-ops pipeline  -> Process pending URLs from inbox (data/pipeline.md)
  /career-ops evaluate  -> Evaluation only A-G (no auto PDF)
  /career-ops compare   -> Compare and rank multiple offers
  /career-ops contact   -> LinkedIn power move: find contacts + draft message
  /career-ops deep      -> Deep research prompt about company
  /career-ops pdf       -> PDF only, ATS-optimized CV
  /career-ops training  -> Evaluate course/cert against North Star
  /career-ops project   -> Evaluate portfolio project idea
  /career-ops tracker   -> Application status overview
  /career-ops interview-prep -> Build company-specific interview prep and story framing
  /career-ops apply     -> Live application assistant (reads form + generates answers)
  /career-ops scan      -> Scan portals and discover new offers
  /career-ops patterns  -> Analyze trends, conversion, and strategy drift from tracker/report data
  /career-ops batch     -> Batch processing with parallel workers
  /career-ops update    -> Check for or apply system-layer updates safely

Inbox: add URLs to data/pipeline.md -> /career-ops pipeline
Or paste a JD directly to run the full pipeline.
```

---

## Context Loading by Mode

After determining the mode, load the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `evaluate`, `compare`, `pdf`, `contact`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `interview-prep`, `patterns`, `deep`, `training`, `project`

### Modes delegated to subagent:
For `scan`, `apply` (with Playwright), and `pipeline` (3+ URLs): launch as Agent with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="career-ops {mode}"
)
```

### Special router command: `update`
If the mode is `update`, do not load a mode file. Instead:
- run `node scripts/update-system.mjs check`
- if an update is available, summarize the version change and ask whether to apply it
- if the user confirms, run `node scripts/update-system.mjs apply`
- if the user declines, run `node scripts/update-system.mjs dismiss`

Execute the instructions from the loaded mode file.
