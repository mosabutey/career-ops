# Mode: auto-pipeline -- Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, run the entire pipeline in sequence.

## Step 0 -- Extract the JD

If the input is a **URL** (not pasted JD text), use this extraction strategy:

**Priority order:**

1. **Playwright (preferred):** Most job portals (Lever, Ashby, Greenhouse, Workday) are SPAs. Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (last resort):** Search for the role title + company on secondary portals that index the JD as static HTML.

**If nothing works:** ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): use it directly with no fetch step.

## Step 1 -- A-G Evaluation

Run exactly the same evaluation as `evaluate` mode. Read `modes/evaluate.md` for all A-G blocks.

## Step 2 -- Save the report

Save the evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see the format in `modes/evaluate.md`).

## Step 3 -- Generate the PDF

Run the full `pdf` pipeline (see `modes/pdf.md`).

## Step 4 -- Draft application answers (only if score >= 4.5)

If the final score is >= 4.5, generate draft answers for the application form:

1. **Extract form questions**: use Playwright to navigate to the form and take a snapshot. If the questions cannot be extracted, use the generic set below.
2. **Generate responses** using the tone rules below.
3. **Save them in the report** as section `## H) Draft Application Answers`.

### Generic questions

- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement.
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone for form answers

**Positioning: "I'm choosing you."** The candidate has options and is choosing this company for concrete reasons.

**Tone rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems. Your role is where I want to apply that experience next."
- **Selective without entitlement**: "I've been intentional about finding a team where I can contribute meaningfully from day one."
- **Specific and concrete**: always reference something real from the JD or the company, and something real from the candidate's background
- **Direct, no fluff**: 2-4 sentences per answer. No "I'm passionate about..." and no "I would love the opportunity to..."
- **Lead with proof, not claims**: instead of "I'm great at X," say "I built X that did Y"

**Question framework:**
- **Why this role?** -> "Your [specific thing] maps directly to [specific thing I built]."
- **Why this company?** -> mention something concrete about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** -> a quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** -> "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear about this role?** -> be honest. "Found it through [portal/scan], evaluated it against my criteria, and it scored highest."

**Language:** always generate in the language of the JD (EN default).

## Step 5 -- Update the tracker

Write a tracker TSV line to `batch/tracker-additions/` using the canonical order from `modes/evaluate.md`, then run `node merge-tracker.mjs` so the evaluated role is merged into `data/applications.md` without creating duplicates.

**If any step fails**, continue with the next ones and mark the failed step as pending in the tracker.
