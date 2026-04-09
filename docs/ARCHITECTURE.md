# Architecture

## System overview

Career-Ops LifeSci is a local-first career operating system built around one shared engine and multiple overlays.

```text
User materials
  |-- cv.md
  |-- article-digest.md
  |-- config/profile.yml
  |-- modes/_profile.md
        |
        v
Shared engine
  |-- modes/_shared.md
  |-- evaluate / compare / scan / contact / pdf / apply / patterns / batch
        |
        v
Opportunity logic
  |-- role pack detection
  |-- career stage detection
  |-- sponsorship / authorization signals
  |-- scoring + positioning
        |
        v
Outputs
  |-- reports/
  |-- output/
  |-- batch/tracker-additions/
  |-- data/applications.md
  |-- patterns analysis
```

## Core idea

The system now reasons across a matrix:

`role_pack x career_stage`

### Role packs

- `biopharma_medical`
- `life_sciences_consulting`
- `healthtech_scientific`
- `adjacent_generalist`

### Career stages

- `student_early`
- `advanced_training`
- `experienced_professional`

This lets the same engine serve:
- a graduate student applying for internships
- a PhD or MD-PhD moving into industry
- an experienced clinician or scientist making a strategic pivot

## Single-offer flow

1. User provides a JD or URL
2. The system reads source materials
3. It detects the primary role pack and the user's stage
4. It evaluates fit using the shared rubric plus overlays
5. It writes a report
6. It generates a tailored resume variant
7. It registers the opportunity through tracker TSV flow

## Scanner flow

1. Read `portals.yml`
2. Scan configured company pages and broad search queries
3. Extract candidate listings
4. Tag roles by likely pack, class, and stage fit
5. Filter and deduplicate
6. Add strong candidates to `pipeline.md`

## Apply flow

1. Open the live job form when browser automation is available
2. Match it to an existing report or trigger quick evaluation
3. Read visible questions and upload fields
4. Generate or adapt answers from report context
5. Upload the correct approved document variant
6. Fill visible fields for review
7. Stop before final submission

## Patterns flow

1. Read `data/applications.md`
2. Read reports from `reports/`
3. Aggregate score, status, track, stage, and authorization signals
4. Surface repeated strengths, weak conversion points, and search drift
5. Recommend practical adjustments to the search strategy

## Document generation flow

The PDF system uses one fact source of truth but multiple output families:
- medical affairs resume
- consulting resume
- health-tech resume
- short industry CV
- internship / externship / co-op variant

The chosen family changes section order, vocabulary, and emphasis without inventing facts.

## Data integrity

The canonical tracker contract remains unchanged:
- new rows flow through `batch/tracker-additions/`
- `scripts/merge-tracker.mjs` merges them into `data/applications.md`
- `scripts/verify-pipeline.mjs`, `scripts/normalize-statuses.mjs`, and `scripts/dedup-tracker.mjs` maintain consistency

## Operating boundary

The local agent can automate parts of discovery, evaluation, document generation, and browser-assisted application work, but the user remains the final reviewer and submitter of all real applications.

## Design principle

The repo should stay broad enough to serve many user archetypes while remaining concrete enough to help a single candidate act today.
