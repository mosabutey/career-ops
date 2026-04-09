# ATS Apply Playbook

Use this guide when running `apply` mode against real applicant tracking systems. It summarizes the platform-specific behavior observed during live validation and gives the local agent a safer default strategy for each ATS family.

## Why this exists

Application platforms do not behave the same way:
- some use native `select` elements
- some use custom combobox and listbox widgets
- some gate the real application behind account creation
- some rename the call to action so it is not literally `Apply`
- some are good candidates for a direct visible-browser review handoff, while others require stronger recovery strategies

Treating all ATS platforms the same leads to brittle browser automation. This playbook keeps `apply` mode practical and platform-aware.

## Cross-platform review access strategy

Preferred order:
1. visible review handoff in a persistent browser session
2. persistent-session recovery with last known step and URL
3. ATS saved-draft or returning-applicant recovery

Why this matters:
- a screenshot proves what was reached, but a live browser handoff lets the candidate inspect and edit the real form directly
- persistent session recovery can preserve progress when the browser cannot stay open
- ATS-native draft recovery is the last resilient fallback when browser state is lost

For the full operational playbook, see [docs/APPLY_REVIEW_HANDOFF.md](APPLY_REVIEW_HANDOFF.md).

## Phenom / Phenom People

### Proven live behavior

- multi-step same-tab application flow is reachable from the public job page
- native `select`, text input, textarea, checkbox, and radio controls are used heavily
- uploading a resume on step 1 can prefill later work-experience sections
- a real `Review` page can be reached without creating an employer-specific account

### Representative findings

- Eisai's current Phenom flow exposed:
  - `My information`
  - `My experience`
  - `Application questions`
  - `Voluntary Disclosures`
  - `Self identity`
  - `Review`
- resume upload prefilled the three work-experience entries, but education degree and field selectors still required manual or profile-driven completion
- the salary question was a textarea, not a dropdown
- the final review page showed a true summary plus a visible `Submit` button

### Best strategy

1. prefer a visible browser session, not a disposable hidden run
2. upload the approved resume early because it can prefill work history
3. fill the standardized identity fields from `config/profile.yml`
4. store Phenom-specific education and job-question defaults locally when repeated use matters
5. if review is reached, keep the browser open for direct candidate handoff
6. tell the candidate to use the review page's `Edit` links rather than browser Back or the step sidebar
7. auto-focus the review page intentionally:
   - default to the `Submit` region so the final state is obvious
   - use an `edit`-focused handoff when the candidate wants to inspect every section first
8. remind the candidate that `Next`, `Save and Continue`, and `Submit` are usually bottom-of-page controls, not sticky controls
9. if review is not reached, save the last step, URL, missing fields, and session directory for recovery

### Known risk

Phenom can parse resume data unevenly across sections. Work history may import cleanly while education, salary, or employer-specific screening answers still require local defaults or manual review.

## Greenhouse

### Proven live behavior

- posting and form can be reachable on the same page
- text fields work
- file upload works
- many screening questions use custom `combobox` + `listbox` widgets instead of native `select`
- checkbox acknowledgments can appear alongside custom question blocks

### Representative findings

- overlapping labels can exist, such as `First Name` and `Preferred First Name`
- sponsorship and authorization questions may be custom comboboxes
- some comboboxes respond better to keyboard fallback than direct option clicking
- stale role URLs can redirect to a jobs index with `?error=true`, where the page still exposes search fields and department / office filters

### Best strategy

1. verify the job page is still active
2. prefer exact label or field ID targeting
3. treat dropdown-like questions as custom widgets first, not native `select`
4. if option clicking is unreliable, try keyboard fallback:
   - focus field
   - type query
   - `ArrowDown`
   - `Enter`
5. if the page redirected to a jobs index or generic openings page, stop and do not treat search filters as application controls
6. verify the selected value persisted after every choice

### Known risk

Not every Greenhouse combobox variant exposes options the same way, so value verification is mandatory.

## Lever

### Proven live behavior

- `/apply` pages are directly reachable on live postings
- text fields work
- file upload works
- native `select` controls work
- grouped radio questions work
- grouped checkbox questions work

### Representative findings

- some forms contain large self-ID sections with many radios and checkboxes
- repeated labels such as `Yes` and `No` can appear multiple times

### Best strategy

1. target radios and checkboxes within the surrounding question block
2. do not click a global `Yes` or `No` label without scoping it first
3. use native `select` handling when present
4. verify checked state after each interaction

### Known risk

Global label matching is brittle on long Lever forms with repeated response options.

## Workday

### Proven live behavior

- live postings can be opened
- `Apply` can lead into a true multi-step application state
- the step structure may be visible before deeper progression
- a create-account or sign-in step can appear before the actual question pages

### Representative findings

- some Workday roles expose a `Start your application` launcher before the actual gated flow
- Workday commonly exposes a gated flow such as:
  - `Create Account/Sign In`
  - `My Information`
  - `My Experience`
  - `Application Questions`
  - `Voluntary Disclosures`
  - `Self Identify`
  - `Review`
- a create-account attempt can fail inline on the Workday page because of employer password-policy requirements, without sending any verification email or advancing to step 2
- after a successful create-account submit, Workday can send a real verification email and still route the verification link to `login/error` or another sign-in boundary rather than directly into the application
- returning to the original application flow and signing in there can advance the user into an authenticated `My Information` page with visible applicant fields and a shorter remaining step sequence
- the authenticated `My Information` step can mix standard text fields with button-like picker controls for source, country, prefix, suffix, state, phone device type, and phone country code
- a truthful Medtronic fill pass has now proven real progression through authenticated `My Information`, `My Experience`, and `Application Questions` into `Voluntary Disclosures`
- the current Medtronic `Voluntary Disclosures` page contains veteran status, race, gender, Hispanic/Latino, and a required consent checkbox
- the current Medtronic `Voluntary Disclosures` step now truthfully advances into a real `Self Identify` page that renders the CC-305 disability form
- on the current Medtronic flow, the first `Save and Continue` on `Self Identify` advanced into a real `Review` page with summary sections and a visible final `Submit` button
- the current Medtronic `Self Identify` page still allowed progression even though some visible self-ID fields remained `No Response`, so not every visible disclosure field was a hard blocker on this employer flow
- Organon and MSD both advanced directly from create-account into authenticated `My Information` without the Medtronic-style verification-email loop
- Organon shrank to a 5-step authenticated flow with no downstream `Self Identify` step, while MSD shrank to a 7-step authenticated flow that kept `Self Identify` and split `Application Questions` into two steps
- MSD step-1 filling proved that a generalized Workday filler can carry name, address, state, phone device type, phone number, and prior-employment responses across employers, but `How Did You Hear About Us?` remained unresolved and blocked progression
- a local-only resume path can now be declared in `config/profile.yml` for upload attempts, but the current Medtronic `My Experience` upload control is still not proven as a successful `Resume/CV` completion
- Workday step tabs can be clickable before later sections are genuinely open, so heading/body confirmation matters more than tab click success
- on fresh postings within the same employer, returning-account behavior still varied: Organon advanced from `My Information` to a real `Voluntary Disclosures` page, while fresh Medtronic and MSD postings stayed blocked on authenticated `My Information`
- the stricter probe now treats source and phone as unproven unless the active page state confirms they no longer trigger `Errors Found`
- after phone-entry hardening, fresh Medtronic and MSD retests showed that phone validation can clear while `How Did You Hear About Us?` remains the only step-1 blocker
- live source-option probing exposed tenant-specific career-site labels: Medtronic currently exposes `Career Site`, while MSD currently exposes `Company Career Website`
- deeper source diagnostics showed those values are rendered as real Workday `menuItem` / `promptOption` nodes, so the remaining problem is option commitment, not simple label discovery
- a fresh Organon returning-account pass reached a real `Review` page after a tenant-specific terms/conditions consent acknowledgment on `Voluntary Disclosures`

### Best strategy

1. detect whether the page is still just a posting or has entered the application flow
2. distinguish `apply launcher reached` from `account gate reached`
3. if a launcher appears, record its options, such as `Autofill with Resume` or `Apply Manually`
4. record visible step names when available
5. if the user explicitly wants to test account creation, capture the exact inline result after submit:
   - advanced to the next step
   - remained on create-account with validation errors
   - triggered email verification or other out-of-band confirmation
6. check the inbox only after inspecting visible Workday errors; do not assume email verification was sent
7. if a verification email is sent, verify whether its activation link advances into the application or simply lands on another sign-in or `login/error` boundary
8. if the activation link does not advance the flow, retry from the original application route and use the in-flow `Sign In` path before concluding that progression is blocked
9. once inside authenticated `My Information`, separate controls into:
   - plain text and checkbox inputs
   - radio groups
   - picker-style controls that need Workday-specific interaction
10. expect exact live-label matching to matter on deeper steps such as `Application Questions` and `Voluntary Disclosures`
11. map applicant identity and contact data from trusted user/profile sources only
12. stop before filling or continuing applicant data unless the user explicitly wants help proceeding
13. confirm a later step by changed heading/body content, not just by a clickable Workday step tab
14. only claim `Review` when the page renders a review summary plus a visible final action such as `Submit`
15. tell the user clearly that deeper progression may require a real applicant account
16. expect employer-specific variation in `How Did You Hear About Us?` controls and treat source-picker resolution as its own Workday subproblem
17. if you rely on a local resume upload path, still verify at review that `Resume/CV` no longer shows `No Response`; path resolution alone is not proof of successful upload
18. answer `How Did You Hear About Us?` truthfully based on the real acquisition path, such as the company career page, LinkedIn, referral, recruiter outreach, or another site actually used to reach the role
19. on repeat applications to the same employer, re-read the launcher and current step sequence because returning-account behavior may differ from the first application and may expose accelerators such as `Use My Last Application`
20. treat resume autofill or imported prior-application data as a speed aid, not as trusted final content; verify imported values before moving on
21. on Workday, do not count deeper progression if the active heading still says `My Information`, even if the sidebar lists `My Experience`, `Voluntary Disclosures`, or `Review`
22. treat phone fields as validation-sensitive inputs; a value copied from the profile may still need tenant-specific formatting rules before Workday accepts it
23. if a returning Workday application resumes directly on `Voluntary Disclosures` or another later step, continue from that true active heading instead of assuming the flow always restarts at `My Experience`
24. treat later-page consent and terms acknowledgments as tenant-specific required controls that may need broader label matching than a generic `I consent`
25. do not treat a discovered Workday source option as solved until the field itself leaves the `0 items selected` / unresolved state after blur and save

### Known risk

Deeper Workday proof usually requires creating or using a real employer-system account, and credential policies may differ by employer. A blocked create-account attempt is not necessarily a Workday platform failure, duplicate visible fields can make modal targeting tricky, employer-specific disclosure wording can break generic option-selection logic even after earlier steps are proven, some self-ID sections may expose optional fields that are visible but not required to reach `Review`, source/upload controls can vary enough that a filler which works on one tenant may still stall on another, and returning-applicant behavior can change the first visible state on a fresh posting within the same employer. On current Medtronic and MSD tenants, even exact live source options are visible as structured Workday nodes but still do not yet commit reliably through the generalized filler.

## SmartRecruiters

### Proven live behavior

- live postings can be opened
- expired postings are detectable
- the primary CTA may be labeled `I'm interested` rather than `Apply`

### Representative findings

- the `I'm interested` CTA can hand off to a one-click application surface
- in this environment, that one-click surface may render as a blank or JS-heavy handoff page rather than an immediately inspectable form
- a live one-click handoff can also present an explicit `Access is temporarily restricted` page that cites suspicious activity or automation

### Best strategy

1. do not assume the CTA says `Apply`
2. look for alternate intent labels such as `I'm interested`
3. verify whether the handoff page actually renders usable controls before proceeding
4. if the one-click surface shows an explicit restriction or anti-bot page, surface that exact state to the user and stop
5. if the one-click surface is blank or inaccessible, fall back to telling the user what happened and preserve the current page context

### Known risk

SmartRecruiters may rely on rendering or handoff behavior that is less transparent in automated browser sessions than Greenhouse or Lever.

## Ashby

### Proven live behavior

- public postings can be opened
- `Apply for this job` can open a dedicated same-tab `/application` page
- text fields work
- file upload controls are exposed
- radios, checkboxes, and at least one combobox can appear on the live application page

### Representative findings

- Ashby can expose an autofill-from-resume control alongside direct file upload
- sponsorship can appear as a radio-style question rather than a dropdown
- the final submit control can be visible on the same page as the rest of the form

### Best strategy

1. confirm the application route belongs to the same employer and role before proceeding
2. treat the `/application` page as the real form surface, not just a launcher
3. identify uploads, radio groups, and sponsorship questions early
4. keep the stop-before-submit boundary explicit because the submit button may already be visible

### Known risk

Ashby forms can place the final submit control on the same page as otherwise routine applicant fields, so accidental over-progression is a real risk.

## iCIMS

### Proven live behavior

- public social-distribution postings can be opened
- `Apply` can hand off to an employer-hosted `icims.com` route
- the handoff may go directly to a `/login` boundary

### Representative findings

- the public posting can be readable and active while the application handoff is gated
- in the observed Medpace flow, the post-click route was a login page shell without inspectable applicant controls

### Best strategy

1. treat the public posting and the employer-hosted handoff as separate states
2. after clicking `Apply`, inspect the new URL immediately
3. if the handoff lands on `/login` or a clearly authenticated route, tell the user it is a login boundary and stop
4. do not describe the resulting page as a broken form if the real issue is authentication

### Known risk

iCIMS may require authentication earlier than other ATS platforms, which limits how far public, unauthenticated probing can go.

## Workable

### Proven live behavior

- public postings can be opened
- a visible cookie banner can block CTA interaction
- after cookie handling, `Apply for this job` can open a dedicated same-tab `/apply/` page
- large questionnaire-style application forms can be inspected
- file uploads, textareas, radios, checkboxes, and at least one combobox can appear on the form

### Representative findings

- Workable may expose both `Overview` and `Application` tabs on the same public job page
- the application surface can include many required questions and multiple document-upload sections

### Best strategy

1. dismiss or handle cookie banners before concluding that the CTA is unusable
2. if `Apply for this job` opens `/apply/`, treat that as the real form surface
3. expect large questionnaires and multiple uploads
4. scope radio and checkbox interactions carefully because high-count survey sections are possible

### Known risk

Workable forms can become very long and dense, so field counting alone may overstate what is realistically safe to fill without careful grouping and review.

## Cross-platform rules

- verify the page is live before filling
- upload only approved files
- prefer exact selectors over fuzzy matches
- scope repeated labels to the correct question group
- verify persisted values after interactions
- stop before final submission
- stop at account-creation boundaries unless the user explicitly wants help proceeding
- treat explicit anti-automation restriction pages as a hard stop, not as a normal form state
- handle cookie banners before concluding that a CTA is missing or inactive
- if clicking `Apply` opens a new tab or employer-hosted handoff, verify the new page belongs to the same role before proceeding
- keep tenant-specific source-picker wording in the local-only profile, not in shared system prompts or docs
- on repeat applications to the same Workday employer, re-check whether `Use My Last Application`, resume autofill, or carried-forward data changed the starting state

## Current live proof summary

High-confidence control types:
- text inputs
- file uploads
- native `select` controls
- grouped radio questions
- grouped checkbox questions
- some custom combobox/listbox questions

High-confidence workflow capabilities:
- stale-link detection
- grouped-question scoping
- Workday launcher detection
- multi-step Workday flow detection
- Ashby same-tab application detection
- Workable same-tab application detection after cookie handling

Still not fully proven:
- generalized Workday self-ID filling across employers
- generalized Workday source-picker handling across employers
- generalized Workday resume-upload handling on `My Experience`
- every custom-dropdown variant on Greenhouse
- captcha-heavy, anti-bot, or login-heavy flows
- deeper iCIMS progression past employer login
