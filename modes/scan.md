# Mode: scan -- Opportunity Discovery

Scan configured job portals, discover new openings, tag them by role pack and company class, and add strong-fit roles to the pipeline for later evaluation.

## Recommended execution

Run as a sub-agent when possible so scanning does not consume the main thread context.

## Configuration

Read `portals.yml`, which contains:
- `role_pack_filters`
- `career_stage_filters`
- `search_queries`
- `tracked_companies`
- `title_filter`
- `sponsorship_signals`

## Discovery strategy

### Layer 1 -- Direct Playwright scan (PRIMARY)

For each company in `tracked_companies`, navigate to `careers_url` and extract visible listings in real time.

### Layer 2 -- Structured API scan (SUPPLEMENTARY)

Use vendor APIs like Greenhouse where configured.

### Layer 3 -- WebSearch (BROAD DISCOVERY)

Use `search_queries` with `site:` filters to discover new roles and new companies, then verify liveness before adding anything to the pipeline.

## Workflow

1. Read `portals.yml`
2. Read `data/scan-history.tsv`
3. Read dedup sources: `data/applications.md` and `data/pipeline.md`
4. Run the configured scan layers
5. Extract `{title, url, company}` for each listing
6. Tag each role with:
   - likely role pack
   - likely company class
   - likely career stage fit
   - sponsorship signal if explicit language is visible
7. Filter by title relevance using `title_filter`
8. Deduplicate against scan history, tracker, and pipeline
9. Verify liveness for stale or search-derived URLs before adding them
10. Add strong candidates to `pipeline.md`
11. Write all seen URLs to `data/scan-history.tsv`

## Filtering guidance

- At least 1 positive keyword must appear in the title
- 0 negative keywords may appear
- `seniority_boost` raises priority but is not required
- internships, externships, co-ops, fellowships, traineeships, and early-career programs are valid positive paths when they match the configured stage filters
- explicit sponsorship language should be captured when visible, not guessed when absent

## Sponsorship signal detection

Use `sponsorship_signals` from `portals.yml` when possible.

Classify:
- `open` -> explicit sponsorship support, OPT/CPT/STEM OPT welcome, visa transfer welcome, or similar
- `closed` -> no sponsorship, no visa transfer, or long-term unrestricted authorization required
- `restricted` -> citizenship, permanent residency, clearance, or export-control requirements that exclude some candidates
- `unknown` -> nothing explicit

Decision rule:
- `closed` or `restricted` should be surfaced clearly in the scan summary
- `unknown` should not stop the role from entering the pipeline if it otherwise fits
- if the candidate profile says `authorization.sponsorship_policy.default_when_unstated: apply`, preserve that behavior

## Liveness verification

For WebSearch-discovered URLs, verify with Playwright before adding them:
- Active -> visible job title, real JD content, and an apply flow or clear listing
- Expired -> page says closed, filled, expired, or shows only shell content

If navigation fails, do not interrupt the full scan. Mark the role as skipped and continue.

## Output summary

Include:
- queries executed
- roles found
- title-filtered
- duplicates
- expired discarded
- new roles added
- sponsorship-open roles
- sponsorship-closed or restricted roles
- a short list of the best new opportunities by role pack

End with:
`Run /career-ops pipeline to evaluate the new roles.`
