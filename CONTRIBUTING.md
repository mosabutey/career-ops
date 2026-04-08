# Contributing to Career-Ops LifeSci

Thanks for your interest in contributing.

Career-Ops LifeSci is an open-source career operating system for scientific, clinical, technical, consulting, and adjacent career paths. We want the project to stay useful across backgrounds, industries, and career stages, not drift toward one founder story or one narrow user type.

## Before opening a PR

Please open an issue first for substantial changes. This helps us align on:
- audience impact
- role-pack or stage-path fit
- data privacy concerns
- architecture consistency

PRs without prior discussion may be closed if they introduce major directional changes without shared context.

## High-value contribution areas

Good first contributions:
- improve documentation
- add or refine scanner companies and search queries
- add anonymized fictional examples in `examples/`
- improve localization and accessibility
- clarify role-pack guidance or stage-path wording

Bigger contributions:
- add a new role pack
- improve scoring logic or evaluation prompts
- expand dashboard filtering and sorting
- improve onboarding for students, trainees, and career changers
- strengthen tracker, batch, or PDF workflows

## Contribution principles

- Keep the repo useful to more than one biography or one industry
- Favor clear, practical language over jargon
- Protect user privacy
- Keep the system local-first
- Do not encourage spammy or deceptive application behavior

## Privacy and safety rules

We do not accept PRs that:
- contain personal data such as real CVs, phone numbers, emails, or private employer information
- enable auto-submitting applications without human review
- facilitate Terms-of-Service-violating scraping
- encourage deceptive resume inflation or fabricated experience
- add external dependencies without clear justification and discussion

Use fictional or anonymized data in `examples/`.

## Development notes

```bash
# Node scripts
npm run doctor
node verify-pipeline.mjs
node normalize-statuses.mjs
node dedup-tracker.mjs

# Dashboard
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

## What strong contributions look like

- They improve quality for real users
- They preserve canonical tracker and report contracts
- They make the system clearer for scientists, clinicians, students, and career changers
- They do not assume all users want the same career path

## Need help?

- Open an issue
- Read the architecture and customization docs
- Reference the original project with respect when proposing major changes to the shared foundation
