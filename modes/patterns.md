# Mode: patterns -- Outcome and Pipeline Pattern Analysis

Analyze what the candidate's tracker and reports reveal about search quality, application behavior, and strategic drift.

This mode is for learning from the search, not just evaluating one role.

## Purpose

Use this mode to answer questions like:
- Are high-scoring roles actually converting into applications?
- Which role packs are producing the best outcomes?
- Is the candidate spending time on low-return applications?
- Are sponsorship or work-authorization issues showing up repeatedly?
- Is the search drifting away from the intended tracks or stage?

## Inputs

Read:
- `data/applications.md` if it exists
- `reports/` for evaluation reports
- `config/profile.yml`
- `modes/_profile.md` if narrative context is needed

## Workflow

1. Run:

```bash
node scripts/analyze-patterns.mjs
```

2. Read the generated summary from stdout or run:

```bash
node scripts/analyze-patterns.mjs --write
```

3. Interpret the output in candidate-facing language.
4. Focus on:
   - status conversion
   - score distribution
   - role-pack concentration
   - career-stage alignment
   - sponsorship or authorization friction
   - repeated signals in high-fit or low-fit decisions

## Output

Provide:

### 1. Pattern Summary

- 3-5 strongest observations
- what seems to be working
- what looks inefficient or misaligned

### 2. Strategic Risks

Call out:
- over-applying to weak-fit roles
- under-converting strong-fit roles
- track drift
- stage mismatch
- recurring sponsorship friction
- too much ambiguity in company selection or resume strategy

### 3. Specific Fixes

Recommend concrete next steps such as:
- raise or lower the apply threshold
- adjust scanner queries
- tighten or expand company targets
- improve one resume variant
- network before applying in certain role families
- change how sponsorship-unknown roles are handled

### 4. Optional Saved Report

If the user asks, write the output to:

```text
reports/patterns-{YYYY-MM-DD}.md
```

## Guidance

- Do not overclaim if the dataset is still small.
- Be honest about sample size and missing data.
- Prefer practical recommendations over abstract career advice.
- If the tracker is nearly empty, say what data the user needs to accumulate for this mode to become more useful.
