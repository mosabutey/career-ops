# Mode: apply -- Live Application Assistant

Interactive mode for when the candidate is filling out a job application form in Chrome. Read what is on screen, load the prior context for the role, and generate tailored answers for every visible question.

This mode can be used for browser-assisted application work on the candidate's local machine. The system may open job pages, inspect forms, upload the correct resume or cover letter file, and fill fields for review, but the candidate remains the final reviewer and submitter.

## Requirements

- **Best with visible Playwright**: in visible mode, the candidate can see the browser and the agent can interact with the page.
- **Best end-state is a visible review handoff**: if browser control is available, prefer leaving the live ATS browser open on `Review` so the candidate can inspect the real form directly.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.
- **File uploads**: if the candidate wants the agent to upload a resume or cover letter, the file path must be known and the intended document should be confirmed first.
- **Custom ATS widgets**: many live forms use custom comboboxes, listboxes, step flows, and gated account-creation screens instead of plain HTML inputs. Treat those as first-class application controls.

## Workflow

```
1. DETECT    -> Read the active Chrome tab (screenshot/URL/title)
2. IDENTIFY  -> Extract company + role from the page
3. SEARCH    -> Match against existing reports in reports/
4. LOAD      -> Read the full report + Section H (if present)
5. COMPARE   -> Does the on-screen role match the evaluated one? If it changed, warn
6. ANALYZE   -> Identify ALL visible form questions
7. GENERATE  -> Generate a personalized answer for each question
8. PRESENT   -> Show copy-paste-ready responses
```

## Step 1 -- Detect the role

**With Playwright:** take a snapshot of the active page. Read the title, URL, and visible content.

If the candidate asks for it and browser control is available, the agent may:
- navigate to the company job page
- open the application flow
- inspect visible fields and upload controls
- inspect the control model for custom widgets such as comboboxes, listboxes, radios, checkboxes, and multi-step flows
- prepare the browser state for the candidate's review
- preserve a persistent browser session and hand off the live `Review` page when possible

**Without Playwright:** ask the candidate to:
- Share a screenshot of the form
- Paste the form questions as text
- Or provide the company + role so the context can be loaded

## Step 2 -- Identify and load context

1. Extract the company name and role title from the page
2. Search `reports/` by company name
3. If there is a match -> load the full report
4. If Section H exists -> use the previous draft answers as a starting point
5. If there is no match -> say so and offer a quick auto-pipeline evaluation
6. Read `config/profile.yml` for `authorization` details before answering work authorization or sponsorship questions

## Step 3 -- Detect role changes

If the role on screen differs from the evaluated role:
- **Warn the candidate**: "The role changed from [X] to [Y]. Do you want me to re-evaluate it or adapt the answers to the new title?"
- **If adapting**: adjust the answers to the new title without re-running the full evaluation
- **If re-evaluating**: run a full A-G evaluation, update the report, and regenerate Section H
- **Update the tracker**: change the role title in `applications.md` if needed

If the application URL itself is stale, redirected, or broken:
- tell the candidate before filling anything
- do not proceed as if the form is valid
- offer to locate the current live posting or re-run evaluation on the active URL
- if a stale ATS link redirects to a generic jobs index or openings page, do not treat the index filters or job-search controls as the application form

If the platform reaches an account-creation or sign-in gate before the actual application:
- identify the platform and step number if visible
- tell the candidate whether the next step would create an account or authenticate
- stop before creating an account unless the candidate explicitly wants help proceeding
- if an employer-hosted handoff route ends in `/login` or clearly requires authentication, classify it as a login boundary rather than a broken form
- if a verification email is sent but its activation link lands on `login/error` or another sign-in page, return to the original application route and test the in-flow `Sign In` path before assuming the deeper application is unreachable

If a platform exposes an intermediate launcher before the real application:
- identify it explicitly as a launcher, not yet a completed entry into the full form
- record the visible options, such as `Autofill with Resume`, `Apply Manually`, or one-click variants
- tell the candidate what the next click would do before proceeding

If a one-click handoff or follow-up page shows an explicit access restriction, suspicious-activity warning, captcha, or automation block:
- surface that exact state to the candidate
- stop and preserve the current page context
- do not describe it as a normal but empty form

If clicking `Apply` opens a new tab or employer-hosted page:
- verify the new page still belongs to the same employer and role
- continue only if the handoff is clearly the intended application surface
- otherwise tell the candidate what changed before proceeding

## Step 4 -- Analyze form questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear about us, work authorization, etc.)
- Yes/No questions (relocation, visa, etc.)
- Custom comboboxes and listboxes that behave like dropdowns but are not native `select` elements
- Checkboxes and acknowledgment controls
- Radio groups, pill selectors, and other click-to-mark controls
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)
- Attachments and document selectors (resume variant, transcript, writing sample, supporting files)
- Step indicators, gated screens, and platform-specific progress states

Classify each question:
- **Already answered in Section H** -> adapt the existing answer
- **New question** -> generate a new answer from the report + `cv.md`

## Step 5 -- Generate responses

For each question, generate the response using:

1. **Report context**: proof points from Block B, STAR stories from Block G
2. **Previous Section H**: if a draft answer already exists, refine it instead of starting from scratch
3. **"I'm choosing you" tone**: same framework as auto-pipeline
4. **Specificity**: reference something concrete from the JD visible on screen
5. **career-ops proof point**: include it in "Additional info" if relevant
6. **Authorization truthfulness**: use `authorization` from `config/profile.yml` when present and never overstate work eligibility

For work authorization and sponsorship questions:
- answer truthfully based on the candidate profile
- distinguish between `authorized to work now` and `will require sponsorship in the future`
- if a form collapses both concepts into a single yes/no question, explain the tradeoff in notes if needed
- if the form text conflicts with the candidate's actual situation, tell the candidate before suggesting a response
- never tell the candidate to answer `no` to future sponsorship if the profile says future sponsorship will be required
- if the company explicitly states no sponsorship and the candidate does require it, flag the mismatch clearly before continuing

For uploads and form-filling:
- choose the document variant that best matches the evaluated role
- confirm the intended file before upload when multiple variants exist
- upload only files the candidate has approved or that were generated for this role
- fill visible fields carefully and re-check values
- handle cookie banners if they are blocking the visible CTA or form controls, then re-check that the page identity is still correct
- prefer exact field selectors when labels are similar, such as `First Name` vs `Preferred First Name`
- do not assume every dropdown is a native `select`; many ATS flows use combobox + listbox patterns
- do not assume repeated labels such as `Yes` or `No` are unique; scope them to the surrounding question block before clicking
- prefer this fallback order for custom controls: exact label/ID -> role-based control (`combobox`, `option`, `checkbox`, `radio`) -> keyboard navigation (`ArrowDown`, `Enter`) -> pause and ask the candidate to review the visible options
- after choosing any dropdown, checkbox, radio, or acknowledgment control, verify that the value or checked state persisted on screen
- on Workday, do not treat a clickable step tab as proof that the next page is truly open; confirm the heading and body content changed before claiming progression to `Voluntary Disclosures`, `Self Identify`, or `Review`
- on Workday, only claim `Review` when the page renders a true review summary and the final action button is visible
- on Workday, some visible self-ID or disclosure fields may be optional on a specific employer flow; distinguish optional `No Response` items from true required blockers before deciding that progression failed
- on Workday, expect employer-specific variation in step counts after authentication; re-read the visible downstream sequence instead of assuming the public gate sequence still applies
- on Workday, treat `How Did You Hear About Us?` as an employer-specific picker that may need different accepted values even when other step-1 fields fill successfully
- answer `How Did You Hear About Us?` truthfully based on how the role was actually reached, such as the employer career page, LinkedIn, a referral, or recruiter outreach
- keep any tenant-specific Workday source override in the local-only profile instead of the shared repo
- if a local resume path is configured, still verify on-page evidence that `Resume/CV` no longer shows `No Response` before claiming upload success
- on repeat applications to the same Workday employer, re-check whether `Use My Last Application`, resume autofill, or carried-forward applicant data changes the first visible state
- on Workday, do not count deeper progression if the active heading still says `My Information`, even if the sidebar lists later steps
- on Workday, treat phone inputs as validation-sensitive; if the field still errors after fill, report that formatting remains unresolved instead of claiming step-1 completion
- if an ATS redirects to a generic openings page, stop and do not count search filters as applicant questions
- if a platform requires account creation or sign-in before the real form, stop at that boundary unless the candidate explicitly wants help continuing
- if a sign-in modal overlays the create-account page, scope selectors to the modal because background create-account inputs may still be visible and can steal focus or fills
- do not invent required information the candidate has not approved
- stop before the final submit or send action so the candidate can review everything
- when review is reached in a visible browser session, prefer leaving that live page open rather than closing the browser and relying only on screenshots
- if a visible review handoff is not possible, save the last URL, active step, uploads used, and unresolved fields so the candidate can recover through a persistent session or the ATS's own saved-draft flow later

**Output format:**

```
## Answers for [Company] -- [Role]

Based on: Report #NNN | Score: X.X/5 | Track: [role pack] | Career Stage: [stage]

---

### 1. [Exact form question]
> [Copy-paste-ready answer]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any note about role changes, mismatches, etc.]
- [Any personalization suggestion the candidate should review]
- [Any sponsorship or work authorization clarification the candidate should double-check]
```

## Step 6 -- Post-apply (optional)

If the candidate confirms that the application was submitted:
1. Update the status in `applications.md` from `Evaluated` to `Applied`
2. Update Section H in the report with the final answers
3. Suggest the next step: `/career-ops contact` for LinkedIn outreach

## Safety boundary

- The agent may help open sites, upload files, and fill sections.
- The candidate must review the application before submission.
- Do not click the final submit action unless the candidate explicitly asks for a final handoff and still has a chance to review first.
- Do not create external accounts as part of the application flow unless the candidate explicitly wants that help and understands the platform boundary.

## Scroll handling

If the form has more questions than are visible:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the full form is covered
