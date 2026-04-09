# Local Agent Guide

Career-Ops LifeSci is designed to be operated locally by an AI agent running on the user's machine through tools such as Codex, Claude Code, or OpenCode.

This document explains what the agent can do, what it should not do, and where human review remains mandatory.

## What the local agent can do

With the repo open locally, the agent can:
- read and edit repo files
- personalize `config/profile.yml`, `modes/_profile.md`, `cv.md`, `article-digest.md`, and `portals.yml`
- run local Node scripts such as:
  - `npm run doctor`
  - `node verify-pipeline.mjs`
  - `node merge-tracker.mjs`
  - `node analyze-patterns.mjs`
- open job sites and evaluate live postings when browser automation is available
- generate ATS-safe resumes, CVs, and cover letters
- inspect job application forms and generate tailored responses
- upload approved resume or cover letter files when the path is known
- fill visible application fields for the user to review
- maintain tracker and report files without breaking the data contract

For repeatable browser-assisted apply work, prefer keeping those upload paths in the local-only `application_files` section of `config/profile.yml` instead of pasting them ad hoc during a live portal session.

## Portal-ready local profile

If you want `/career-ops apply` to run with minimal interruptions, your local-only `config/profile.yml` should include more than high-level career strategy.

Before live apply sessions, keep these truthfully filled in:
- legal/contact identity used in applications
- mailing address and phone metadata
- work authorization and sponsorship answers
- repeated portal defaults such as travel, relocation, age-of-majority, and confidentiality/non-compete answers
- voluntary disclosure defaults you are comfortable storing locally for agent-assisted filling
- employer-specific recurring answers you already know, such as prior employment history
- employer-specific Workday source-picker overrides when the truthful answer is accepted only under tenant-specific wording
- approved local upload paths for your resume and any optional cover letter or transcript
- whether the agent may pre-check required consent/attestation boxes before your review

This information belongs in the local user layer only. It should stay in `config/profile.yml`, not in public repo docs or shared system files.

## What the local agent should not do

The agent should not:
- auto-submit applications without human review
- fabricate qualifications, metrics, publications, or work authorization
- bypass captchas, account protections, or platform safeguards
- ignore explicit employer restrictions such as sponsorship, citizenship, or clearance requirements
- spam low-fit applications or outreach messages
- modify user-layer files in ways that overwrite true personal information without the user's instruction

## Human-review boundary

The user must remain the final reviewer for:
- resume and cover letter content
- application answers
- uploaded files
- sponsorship or work-authorization disclosures
- the final submit action on an application

The agent may prepare, draft, upload, and fill. The user decides whether the final application is actually sent.

## Browser-assisted applications

When browser automation is available, a well-configured local agent may:
- open a company careers page
- navigate into the specific job posting
- open the application flow
- read visible questions and form structure
- choose the best-fit document variant
- upload that document
- fill visible fields from approved source material
- keep a visible browser open at the live `Review` page when a supported handoff workflow is used

The more complete the local profile is, the less often the agent has to stop mid-portal to ask for missing data.

On repeat applications to the same employer, some Workday tenants may reuse prior applicant state, skip parts of account setup, or offer features such as `Use My Last Application` or resume-driven autofill. Those are accelerators, not trust signals; the agent should still verify carried-forward fields before the user reviews the application.

The agent should then stop and present the application for review before final submission.

Best-practice order for review access:
1. visible browser handoff at `Review`
2. persistent session recovery
3. ATS saved-draft or returning-applicant recovery

For Phenom / Phenom People employers, the repo now includes `assist-phenom-review-handoff.mjs`, which uses a persistent local browser profile and leaves the live browser open by default so the candidate can inspect the real review page directly.

For platform-specific browser guidance, see [docs/ATS_APPLY_PLAYBOOK.md](ATS_APPLY_PLAYBOOK.md).
For handoff and recovery guidance, see [docs/APPLY_REVIEW_HANDOFF.md](APPLY_REVIEW_HANDOFF.md).

## Practical limits

Real-world application sites vary widely. Depending on the site, the agent may encounter:
- logins
- captcha or anti-bot screens
- multi-step workflows
- embedded widgets
- inaccessible custom components
- upload restrictions
- region-specific compliance questions

If the agent cannot safely or clearly interact with the site, it should fall back to:
- reading the visible page
- generating copy-paste-ready answers
- telling the user exactly what remains to do manually

## Best practices

- Keep source-of-truth documents current before applying.
- Generate the role-specific resume before opening the application form.
- Prefer evaluating a role before filling the form.
- Use the patterns mode regularly so the system learns from outcomes.
- Treat the repo as a quality system, not a mass-submission engine.
