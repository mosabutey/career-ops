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
  |-- evaluate / compare / scan / contact / pdf / batch
        |
        v
Opportunity logic
  |-- role pack detection
  |-- career stage detection
  |-- scoring + positioning
        |
        v
Outputs
  |-- reports/
  |-- output/
  |-- batch/tracker-additions/
  |-- data/applications.md
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
- `merge-tracker.mjs` merges them into `data/applications.md`
- `verify-pipeline.mjs`, `normalize-statuses.mjs`, and `dedup-tracker.mjs` maintain consistency

## Design principle

The repo should stay broad enough to serve many user archetypes while remaining concrete enough to help a single candidate act today.
