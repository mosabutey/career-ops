# Mode: patterns - Outcome and Pipeline Pattern Analysis

Analyze what the candidate's tracker and reports reveal about search quality,
application behavior, and strategic drift.

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
- `portals.yml` if recommendations may require scanner changes

## Workflow

1. Run the analyzer in JSON mode:

```bash
node scripts/analyze-patterns.mjs --json
```

2. Parse the output. It contains:
   - `metadata`
   - `funnel`
   - `scoreComparison`
   - `trackBreakdown`
   - `stageBreakdown`
   - `authorizationBreakdown`
   - `remotePolicy`
   - `companyClassBreakdown`
   - `blockerAnalysis`
   - `scoreThreshold`
   - `highlights`
   - `recommendations`

3. If the user wants a saved report, run:

```bash
node scripts/analyze-patterns.mjs --write
```

4. Focus on:
   - status conversion
   - score distribution
   - role-pack concentration
   - career-stage alignment
   - sponsorship or authorization friction
   - repeated blocker themes from report gaps
   - repeated signals in high-fit or low-fit decisions

## Sample Size Rule

Check `metadata.enoughData`.

If it is `false`, tell the user the findings are directional because too few
applications have progressed beyond `Evaluated`. Still summarize what signal
exists, but do not present the output as settled policy.

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
reports/pattern-analysis-{YYYY-MM-DD}.md
```

## Apply Recommendations

If the user wants recommendations applied:
- edit `portals.yml` for scanner or filter changes
- edit `modes/_profile.md` or `config/profile.yml` for thresholds, targeting, or narrative changes
- never put user-specific strategy changes into `modes/_shared.md`

## Guidance

- Do not overclaim if the dataset is still small.
- Be honest about sample size and missing data.
- Prefer practical recommendations over abstract career advice.
- If the tracker is nearly empty, say what data the user needs to accumulate for this mode to become more useful.
