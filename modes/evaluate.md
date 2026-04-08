# Mode: evaluate -- Full Opportunity Evaluation

When the candidate pastes a job description or URL, always deliver all 7 blocks.

## Step 0 -- Detect the opportunity shape

Classify the opportunity before scoring:

1. **Primary role pack**: `biopharma_medical`, `life_sciences_consulting`, `healthtech_scientific`, or `adjacent_generalist`
2. **Secondary role pack** if clearly hybrid
3. **Career stage fit** using `config/profile.yml`
4. **Company class** if visible: biotech/pharma, consulting, health-tech, CRO/CDMO, investing, internship program, academic-adjacent, other
5. **Authorization signal**: `open`, `closed`, `unknown`, or `restricted` based on explicit JD language about sponsorship, work authorization, citizenship, clearance, or visa policy

This determines:
- which evidence to prioritize
- which objections to reframe
- which resume variant to recommend
- which interview stories and outreach angle to use
- whether sponsorship should be treated as a blocker, a risk, or a note to clarify later

## Block A -- Role Summary

Create a table with:
- detected role pack
- secondary pack if any
- career stage fit
- company class
- authorization signal
- sponsorship fit summary
- function
- seniority
- work model
- TL;DR in 1 sentence

## Block B -- Experience Match

Read `cv.md`. Create a table mapping the JD requirements to exact lines from the CV and, if present, `article-digest.md`.

Include:
- strongest evidence for the role
- what language from the JD the candidate can honestly adopt
- a **gaps** section with a mitigation plan for each gap

For each gap, answer:
1. Is it a hard blocker or a nice-to-have?
2. Is there adjacent experience that covers the underlying need?
3. Can the candidate address it through framing, a short project, a case, or networking?
4. What is the honest mitigation plan?

## Block C -- Positioning and Level Strategy

Explain:
1. The level implied by the JD vs the candidate's believable level
2. How to sell the candidate without overstating anything
3. How to frame the transition for this specific role pack
4. What to say if the employer worries about industry readiness or role fit
5. What to do if the role is attractive but likely requires a downlevel or a lateral move
6. What the candidate should say if sponsorship or work authorization may become part of the process

Stage-aware emphasis:
- `student_early`: readiness, ownership, initiative, learning velocity
- `advanced_training`: maturity, depth, transferability, communication range
- `experienced_professional`: scope, leverage, repeated delivery, leadership

## Block D -- Work Authorization and Sponsorship Fit

Read `config/profile.yml` and use `authorization` when present. If only `candidate.work_authorization` exists, use that as a fallback summary.

Create a table with:
- candidate work authorization summary
- whether the candidate can work now
- whether immediate sponsorship is required
- whether future sponsorship is required
- explicit employer language from the JD, if any
- verdict: `open`, `closed`, `unknown`, or `restricted`
- recommended action: `apply`, `apply and clarify later`, `network first`, or `skip`

Rules:
- If the JD explicitly says no sponsorship, no visa transfer, no future sponsorship, or long-term unrestricted U.S. work authorization is required, treat that as `closed` unless the candidate independently satisfies it.
- If the JD explicitly welcomes sponsorship, OPT, CPT, STEM OPT, visa transfer, or future sponsorship, treat that as `open`.
- If the JD explicitly requires citizenship, permanent residency, security clearance, or export-control eligibility the candidate does not have, treat that as `restricted`.
- If the JD is silent, treat it as `unknown`, not an automatic negative.
- If the role is strong and the signal is `unknown`, default to applying unless other factors make the role low value.
- Never give legal advice. Summarize practical fit only and tell the candidate to confirm legal specifics with their school official, program sponsor, attorney, or employer when necessary.

## Block E -- Compensation and Market Context

Use WebSearch for:
- current salary ranges
- compensation reputation when available
- demand trend for the role family
- any notable market context such as travel, title inflation, or promotion path

Create a table with cited sources. If data is unavailable, say so.

## Block F -- Positioning Plan

Create a table:

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|

Include:
- top 5 resume changes
- top 5 LinkedIn changes
- recommended document family
- recommended networking angle

## Block G -- Interview and Narrative Plan

Map 6-10 STAR+R stories to the JD requirements.

| # | JD requirement | Story | S | T | A | R | Reflection |
|---|----------------|-------|---|---|---|---|------------|

Also include:
- `Why this candidate wins` in 3-5 bullets
- `Employer worries` and how to answer them
- 1 recommended case study or proof-point bundle to lead with

## Final recommendation

Use one of:
- `APPLY NOW`
- `NETWORK FIRST`
- `GOOD STRETCH`
- `MONITOR`
- `SKIP`

Explain the recommendation in plain language.

---

## Post-Evaluation

### 1. Save a report `.md`

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

**Report format:**

```markdown
# Evaluation: {Company} -- {Role}

**Date:** {YYYY-MM-DD}
**Track:** {primary role pack}
**Career Stage:** {career stage}
**Authorization Signal:** {open | closed | unknown | restricted}
**Work Authorization:** {one-line summary}
**Score:** {X/5}
**URL:** {original job URL}
**PDF:** {path or pending}

---

## A) Role Summary

## B) Experience Match

## C) Positioning and Level Strategy

## D) Work Authorization and Sponsorship Fit

## E) Compensation and Market Context

## F) Positioning Plan

## G) Interview and Narrative Plan

## H) Draft Application Answers
(only if score >= 4.5 or the user asks)

---

## Extracted Keywords
(15-20 useful JD keywords or phrases)
```

### 2. Register in the tracker

Always register new evaluations through `batch/tracker-additions/`, not by inserting new rows directly into `data/applications.md`.

Write one TSV line to:

```text
batch/tracker-additions/{###}-{company-slug}.tsv
```

Use 9 tab-separated columns in this exact order:

```text
{###}\t{YYYY-MM-DD}\t{company}\t{role}\tEvaluated\t{X/5}\t{❌ or ✅}\t[{###}](reports/{###}-{company-slug}-{YYYY-MM-DD}.md)\t{one-line note}
```

If the company + role already exists in `data/applications.md`, update the existing row instead of creating a duplicate.
