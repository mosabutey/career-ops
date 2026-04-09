# Validation Roadmap

This document defines the next highest-value validation work for Career-Ops LifeSci.

It is intentionally product-focused:
- prioritize real-world reliability over feature sprawl
- distinguish documented behavior from live-proven behavior
- capture evidence so future local agents do not repeat vague testing
- preserve the human-review boundary at every step

Use this roadmap with:
- [docs/ATS_APPLY_PLAYBOOK.md](ATS_APPLY_PLAYBOOK.md)
- [docs/BROWSER_APPLY_CHECKLIST.md](BROWSER_APPLY_CHECKLIST.md)
- [docs/LIVE_APPLY_VALIDATION_NOTES.md](LIVE_APPLY_VALIDATION_NOTES.md)

---

## Current Readiness Snapshot

### Strong now

- Repo guidance, data contract, and human-review boundaries are clear and durable.
- English-first role-pack x career-stage reasoning is well represented in the modes.
- Apply-mode documentation is grounded in real ATS observations rather than pure speculation.
- PDF generation now has an end-to-end smoke test in `scripts/test-all.mjs`.

### Partially proven

- Greenhouse: text fields, uploads, some custom combobox behavior, checkbox acknowledgment
- Lever: text fields, uploads, native selects, radio groups, checkbox groups
- Workday: posting access, apply entry, multi-step detection, account-creation gate recognition
- SmartRecruiters: stale posting detection, alternate CTA handling, one-click handoff nuance

### Not yet sufficiently proven

- Deep Workday progression after account creation
- Broader custom widget coverage across Greenhouse variants
- Additional major ATS families beyond the current live-tested set
- Multi-page and edge-case PDF/template behavior under awkward content
- Consistent capture of live-test evidence in a reusable validation structure

---

## Ranked Execution Queue

## Priority 1 - Expand real ATS proof where failure risk is highest

This is the highest-value work because `apply` mode is the most operationally fragile part of the repo and the most likely place for local agents to over-assume capability.

### 1. Workday deep-flow validation

Goal:
- confirm behavior after the account-creation boundary when the user explicitly wants help proceeding

Why this matters:
- Workday is common
- Workday flows are step-based and high-friction
- the repo currently proves the boundary, but not the deeper question pages

Done means:
- at least one live Workday flow documented beyond the gate
- visible step names and form sections captured
- clear notes on what the agent can fill vs where human identity/account actions are required
- `modes/apply.md` and ATS docs updated if new constraints appear

### 2. Greenhouse custom-widget expansion

Goal:
- validate more Greenhouse combobox and listbox variants across multiple employers

Why this matters:
- Greenhouse is common
- it already partially works
- the remaining failure mode is selector brittleness across custom widget variants

Done means:
- at least 3 materially different Greenhouse forms tested
- notes captured for option-click success vs keyboard fallback success
- overlapping-label and persisted-value behavior rechecked
- docs updated with any new fallback ordering or failure cues

### 3. SmartRecruiters handoff validation

Goal:
- characterize what happens after alternate CTA flows such as `I'm interested`

Why this matters:
- SmartRecruiters does not behave like Greenhouse or Lever
- current proof is real but shallow

Done means:
- at least one live SmartRecruiters handoff categorized as one of:
  - inspectable form
  - JS-heavy handoff with visible controls
  - blank or inaccessible handoff
  - auth/account wall
- docs updated to reflect the actual category and recommended fallback

---

## Priority 2 - Add coverage for additional ATS families

These platforms matter because a serious local-agent apply product should not implicitly equate "works on Greenhouse and Lever" with "works broadly."

Recommended order:
1. Jobvite
2. Taleo
3. deeper iCIMS progression beyond login, when user-authenticated help is explicitly requested
4. additional Ashby employers and edge-case question sets
5. additional Workable employers and dense questionnaire variants

For each platform, the minimum validation questions are:
- Can the posting be identified as live vs stale?
- Can the apply CTA be found reliably?
- Is the form same-page, modal, redirected, or handoff-based?
- Are text fields readable and fillable?
- Are uploads possible?
- Are dropdowns native or custom?
- Are radios and checkboxes scoped cleanly?
- Are there sign-in or account-creation gates?
- Is there a clear stop-before-submit handoff?

Done means:
- one documented live example per platform
- one or more screenshots saved during validation
- a short platform section added to `ATS_APPLY_PLAYBOOK.md` if the platform is materially different

---

## Priority 3 - Stress-test PDF and HTML template reliability

The repo now has a smoke test for the PDF path. The next step is output quality hardening rather than just "can Chromium make a PDF."

### High-value PDF checks

1. Long-header stress test
- long candidate name
- long LinkedIn / portfolio strings
- dense contact row

2. Summary and competencies stress test
- unusually long summary
- larger competency list
- awkward line wraps

3. Experience-section stress test
- long company names
- long titles
- bullet-heavy roles
- multi-page output

4. Optional-section behavior
- empty certifications
- empty projects
- early-career ordering vs standard ordering

5. Paper-format behavior
- `letter`
- `a4`

Done means:
- known-good fixtures exist for at least short, standard, and stress cases
- any overflow or layout failures are fixed in `templates/cv-template.html`
- `scripts/test-all.mjs` stays fast while focused PDF edge cases can be run intentionally

---

## Priority 4 - Tighten live-test evidence capture

Right now the repo has useful screenshots and narrative notes, but not yet a disciplined validation ledger.

### Needed improvement

Each live validation should record:
- date
- company
- ATS family
- job URL status
- CTA label
- form depth reached
- control types proven
- uploads proven or not
- gating behavior
- exact blocker if something failed
- artifact names in `output/live-tests/`

Done means:
- future validation notes are comparable across runs
- platform confidence can be raised or lowered based on evidence rather than memory

---

## Priority 5 - Keep modes and docs aligned with reality

Whenever live testing discovers friction, the repo should absorb it in the lowest-friction place that protects future agents.

Update targets:
- `modes/apply.md` for behavioral rules
- `docs/ATS_APPLY_PLAYBOOK.md` for platform-specific strategy
- `docs/BROWSER_APPLY_CHECKLIST.md` for execution checklist changes
- `docs/LIVE_APPLY_VALIDATION_NOTES.md` for evidence and confidence updates
- `scripts/test-all.mjs` only when the new behavior is deterministic enough to validate automatically

Done means:
- no strong repo claim remains unsupported by either live notes or a deterministic test

---

## Platform Matrix

| Platform | Current confidence | What is proven | Highest-value next test |
|----------|--------------------|----------------|-------------------------|
| Greenhouse | Medium-high | text, upload, some custom comboboxes, checkbox acknowledgment | more custom-dropdown variants across employers |
| Lever | High | text, upload, native select, radios, checkbox groups | larger self-ID sections and repeated-label scoping |
| Workday | Medium | apply entry, multi-step detection, gate recognition | deeper progression after account creation |
| SmartRecruiters | Low-medium | stale detection, alternate CTA discovery, handoff nuance | characterize live handoff surfaces |
| Ashby | Medium-high | posting access, same-tab `/application`, uploads, radios, checkbox, combobox | more employers and field-pattern diversity |
| iCIMS | Medium | public posting access and `Apply` handoff to employer login gate | deeper progression beyond login when explicitly appropriate |
| Workable | Medium-high | posting access, cookie-banner interference, same-tab `/apply/`, uploads, textareas, radios, checkboxes, combobox | more employers and long-form grouping behavior |
| Jobvite | Unvalidated | none live yet | first live apply-flow classification |
| Taleo | Unvalidated | none live yet | first live gate / legacy-form assessment |

---

## Release Readiness Criteria For Apply Mode

Treat `apply` mode as materially stronger only when all of the following are true:

1. At least 5 ATS families have at least one real validated example.
2. Workday deeper-flow behavior is documented clearly enough that agents do not over-promise.
3. Greenhouse custom control handling is validated across multiple employers, not one lucky form.
4. SmartRecruiters is categorized precisely enough that agents know when to stop and fall back.
5. The repo keeps explicit stop-before-submit behavior everywhere.
6. Live notes, checklist, and playbook stay synchronized with the actual evidence.

---

## Recommended Next Action

Start with:
1. Jobvite live validation
2. Taleo live validation
3. deeper iCIMS / Workday gated progression only when the user explicitly wants authenticated help

That order gives the best mix of risk reduction, user value, and realism.
