# Apply Review Handoff

Use this guide when the goal is not just to fill an application, but to leave the candidate with direct access to the real review page before submission.

## Best mode: visible review handoff

This is the preferred workflow.

What it means:
- the agent fills the application in a visible browser, not a disposable hidden session
- the browser remains open when the application reaches `Review`
- the candidate can inspect the real page, click `Edit` sections, and submit manually if they choose

Why this is best:
- the candidate sees the exact live employer form, not just screenshots
- edits can be made directly in the ATS before submission
- the stop-before-submit boundary remains intact
- this reduces the risk of a perfect-looking artifact that the user cannot actually access

Important usability note:
- once the candidate is on `Review`, prefer the ATS page's own `Edit` links instead of the browser's Back button or the step sidebar
- on many long ATS forms, `Next`, `Save and Continue`, and `Submit` are not sticky; they usually sit at the bottom of the current step
- on Phenom specifically, `Submit` may sit below the review summary and attachments, so the candidate may need to scroll to the bottom even when the review page is already open

## Phenom helper

For Phenom / Phenom People employers, the repo now includes:

```bash
node scripts/assist-phenom-review-handoff.mjs --url="https://careers.example.com/us/en/apply?jobSeqNo=..."
```

Default behavior:
- launches a visible Chromium session
- stores its persistent browser profile under `output/browser-sessions/<slug>/`
- fills known fields from local `config/profile.yml`
- uploads the approved resume from `application_files.resume_upload_path`
- stops at the first unresolved required field or at `Review`
- auto-scrolls the live review page to the `Submit` region by default
- injects a small in-page handoff helper in headed mode with jump buttons for `Top`, `First Edit`, and `Submit`
- saves artifacts to `output/live-tests/`
- keeps the live browser open for the candidate by default

Helpful options:

```bash
node scripts/assist-phenom-review-handoff.mjs \
  --url="https://careers.example.com/us/en/apply?jobSeqNo=..." \
  --slug="acme-phenom-review" \
  --salary-text="Open to discussing compensation within the posted range." \
  --review-focus="submit" \
  --keep-open=true \
  --reset-session=true
```

Review-focus options:
- `--review-focus=submit`: land near the final action area so `Submit` is immediately visible
- `--review-focus=edit`: land near the first `Edit` link for a review-first workflow
- `--review-focus=top`: land at the top of the review summary

Banner option:
- `--inject-handoff-banner=false`: disable the in-page helper if a completely untouched browser surface is preferred

## Local profile fields that improve handoff quality

The Phenom helper becomes much more reliable when these local-only fields exist in `config/profile.yml`:

- `application_defaults.phenom_defaults.how_did_you_hear`
- `application_defaults.phenom_defaults.previous_worker`
- `application_defaults.phenom_defaults.interviewed_with_employer_before`
- `application_defaults.phenom_defaults.base_salary_expectations`
- `application_defaults.phenom_education.*`

Example shape:

```yaml
application_defaults:
  phenom_defaults:
    how_did_you_hear: "Eisai Career Website"
    previous_worker: false
    interviewed_with_employer_before: false
    base_salary_expectations: "Open to discussing compensation within the posted range based on level, scope, and total package."
  phenom_education:
    entry_1:
      school_name: "Example University"
      degree_label: "Doctor of Philosophy (Ph.D)"
      field_of_study_label: "Immunology"
      end_year: "2026"
```

## Fallback mode 1: persistent session recovery

Sometimes a live review handoff is not possible in the same run, but the browser session itself can still be preserved.

Recommended recovery pattern:
- keep a persistent browser profile directory under `output/browser-sessions/<slug>/`
- save the last known application URL and step in `output/live-tests/<slug>-summary.json`
- reopen the same ATS route using that session profile instead of starting from scratch

Why this helps:
- some employers keep partial form state in the browser session
- some ATS flows remember uploads, profile imports, or returning-applicant state
- the candidate may regain the in-progress application even if the original automation run ended

Practical caution:
- session persistence is useful but not guaranteed
- some ATS platforms expire server-side state even when the browser profile survives
- treat session recovery as a strong fallback, not a promise

## Fallback mode 2: ATS saved draft or returning-applicant recovery

When session recovery is not enough, rely on what the ATS itself preserves.

Common examples:
- Workday: `Use My Last Application`
- Workday: returning directly to a later step after sign-in
- employer portals that preserve an in-progress application under the same login
- resume-driven autofill that restores most of the profile but still needs review

Recommended agent behavior:
- reopen the exact employer application route when possible
- sign in only if the candidate wants help proceeding
- inspect the first visible step before assuming the flow restarted
- verify imported values instead of trusting them blindly
- tell the candidate whether the portal resumed a saved draft, offered an accelerator, or restarted the workflow

## Recovery playbook for the candidate

If a review-stage browser is no longer open:

1. Reopen the original employer application URL.
2. If the portal requires sign-in, use the same applicant account used for that employer.
3. Look for `Review`, `Continue Application`, `Use My Last Application`, `Saved Application`, or the last completed step.
4. Verify uploaded documents and sensitive disclosures before submitting.
5. If the ATS resumed somewhere earlier than expected, use the saved repo artifacts instead of re-answering from memory.

## How to review smoothly in a live ATS

Best-practice flow on the live review page:

1. Read the summary sections on `Review`.
2. If something needs changing, use that section's `Edit` link.
3. After editing, scroll to the bottom of that step to find `Next` or `Save and Continue`.
4. Return to `Review` and repeat as needed.
5. Only when the candidate is satisfied should they scroll to the bottom of `Review` and use `Submit`.

Avoid:
- browser Back as the primary navigation tool
- assuming the step sidebar reflects the true active state
- assuming the action button is missing if it is simply below the fold

Practical default:
- for most handoffs, land the user near `Submit` first so they immediately know the page is truly at final review
- if the goal is line-by-line inspection, rerun with `--review-focus=edit`

## What the repo should always save during apply work

Even when a visible handoff is available, capture:
- the final URL reached
- the active step name
- whether `Review` was truly reached
- a screenshot of the last page
- a JSON summary of the state
- which local files were uploaded
- any unresolved required fields

These artifacts make both recovery paths much more practical.

## Bottom line

Preferred order:

1. Visible browser handoff at `Review`
2. Persistent session recovery
3. ATS saved-draft / returning-applicant recovery

That order gives the candidate the most control while still keeping the repo useful when real ATS behavior is messy.
