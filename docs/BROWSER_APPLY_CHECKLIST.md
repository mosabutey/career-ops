# Browser Apply Validation Checklist

Use this checklist when validating browser-assisted application support on real sites.

For prioritization and platform coverage strategy, also see [docs/VALIDATION_ROADMAP.md](VALIDATION_ROADMAP.md).
For repeatable evidence capture, you can also run `npm run probe:apply -- --platform=<ats> --url="<job-url>" --slug=<artifact-slug>`.

## Pre-checks

- `npm run doctor`
- `node verify-pipeline.mjs`
- The correct resume variant exists in `output/`
- The role has an evaluation report in `reports/`
- The candidate has reviewed work authorization details in `config/profile.yml`

## Test scenarios

### 1. Open and inspect a job posting

- Open the job URL
- Confirm the title matches the evaluated role
- Confirm the posting is still active
- Confirm the apply flow can be reached

### 2. Read and classify visible questions

- Free-text questions are detected
- Dropdown and yes/no questions are detected
- Custom comboboxes and listboxes are detected as interactive controls, not ignored because there is no native `select`
- Checkbox and acknowledgment controls are detected
- Radio or pill-style choice groups are detected when present
- Repeated labels such as `Yes` and `No` are matched within the correct question group rather than globally
- Upload fields are detected
- Work authorization and sponsorship questions are surfaced clearly
- Similar labels such as `First Name` and `Preferred First Name` do not confuse field matching

### 3. Upload documents

- The correct resume or CV variant is selected
- Cover letter upload works when a cover letter exists
- The agent does not upload an unapproved file

### 4. Fill fields

- Generated answers match the role and report context
- Required fields are filled accurately
- Salary and sponsorship answers remain truthful
- Custom dropdowns can be set either by visible option click or keyboard fallback
- Checkbox state is verified after clicking
- Radio groups are selected within the correct question block
- Selected values persist after interaction
- The user can review all populated fields before submission

### 5. Multi-step and gated flows

- Step-based platforms such as Workday are recognized as multi-step flows
- Account-creation or sign-in gates are identified before the agent goes further
- If account creation is intentionally tested, the agent records whether the result was inline validation, email verification, or true progression to the next step
- If verification succeeds but the activation link does not advance, the agent retries from the original application route and records whether in-flow sign-in resumes the application
- On authenticated Workday steps, the agent distinguishes plain inputs from picker-style controls and records which fields are truly autofill-ready versus which require custom widget handling
- On Workday, later-step progression is only counted when the heading/body actually changes; a clickable step tab alone does not count as proof
- On Workday, `Review` is only counted when a real review summary renders and the final action button is visible
- On Workday, source pickers such as `How Did You Hear About Us?` are treated as high-risk employer-specific controls and verified separately before progression claims
- On Workday, any employer-specific source-picker wording should live in the local-only profile rather than shared repo instructions
- On Workday, discovering a matching source option in the DOM is not enough; the field must actually leave the unresolved state after blur/save before the agent counts it as filled
- On Workday, treat phone inputs as validation-sensitive and re-check whether the field still shows an inline error after fill
- If a local resume path is configured, the agent still verifies on-page or review-page evidence that the upload actually registered
- On repeat applications to the same employer, the agent re-checks whether the flow now offers `Use My Last Application`, resume autofill, or carried-forward applicant data
- On Workday, a resumed application may open directly on `Voluntary Disclosures`, `Self Identify`, or `Review`; continuation logic should start from the active heading, not from an assumed step order
- The agent stops at account-creation boundaries unless the user explicitly wants help proceeding

### 6. Safety boundary

- The agent stops before final submit
- The final review remains with the user
- No attempt is made to bypass captcha, login friction, or platform safeguards
- When possible, the user receives a live browser handoff at `Review`, not only screenshots
- If a live handoff is not possible, the last URL, step, uploaded files, and unresolved fields are captured for recovery

### 7. Broken or stale links

- 404 or error-page application URLs are detected early
- Redirects to a generic jobs index are not mistaken for valid application forms
- The workflow falls back to re-finding the live posting rather than filling the wrong page

## Validation notes from live tests

Observed on real ATS pages:
- Greenhouse forms may contain overlapping labels such as `First Name` and `Preferred First Name`, so exact selectors are safer than loose label matches.
- Greenhouse commonly uses custom combobox widgets for country, sponsorship, relocation, and similar questions; they are not always native dropdowns.
- Keyboard fallback (`ArrowDown`, `Enter`) can work when a Greenhouse option list is not exposed cleanly for clicking.
- Checkbox acknowledgments can appear alongside custom question blocks and should be validated after clicking.
- Workday may expose the job posting first and only reveal the application structure after clicking `Apply` and, in some cases, `Apply Manually`.
- Some Workday flows reach a create-account/sign-in gate before the full question set is available.
- Some Workday create-account attempts fail inline on password-policy rules and do not send a verification email, so on-page errors should be checked before the inbox is treated as the next source of truth.
- Some Workday verification links still land on `Sign In` / `login/error`, so email verification alone does not prove that the next application step is reachable.
- Some Workday sign-in paths render a modal on top of the create-account page, so duplicate visible inputs can mislead brittle selectors unless the modal fields are targeted carefully.
- Some authenticated Workday steps expose important fields as button-like pickers rather than native `select` elements, so field inventory should include visible button controls and not just text inputs.
- Some authenticated Workday flows keep later step tabs clickable even while the current step is still unresolved, so tab clicks must be validated against visible page content.
- Some Workday employers may change the starting state for later applications, including direct continuation, `Use My Last Application`, or faster resume-based re-entry, so repeat-company testing is worth recording separately.
- Some later Workday pages use tenant-specific consent wording rather than a plain `I consent` control, so required attestation matching should be validated on the live tenant.
- Some Workday source pickers expose real `menuItem` / `promptOption` nodes but still fail to commit through a generalized click path, so DOM discovery and successful fill should be tracked separately.
- Some public ATS links are stale and may return 404 or redirect to a generic jobs page, so liveness and page identity should be rechecked before filling.

## Current proof status

Proven on live forms:
- Standard text fields
- Resume upload
- Some custom Greenhouse combobox interactions
- Checkbox acknowledgment interaction
- Native `select` controls
- Radio-group interaction
- Checkbox-group interaction
- Detection of Workday multi-step application structure
- Detection of inline Workday account-creation validation errors
- Detection of Workday verification-email and post-verification login-boundary behavior
- Detection of authenticated Workday `My Information` progression after in-flow sign-in
- Detection of Workday authenticated step-1 text fields, radios, checkboxes, and picker-style controls
- Detection of truthful Workday progression through `My Experience`, `Application Questions`, and into `Voluntary Disclosures`
- Detection of truthful Workday progression into `Self Identify`
- Detection of truthful Workday progression into `Review`
- Detection that some Workday employers advance directly from create-account to authenticated `My Information` without a separate verification-email loop
- Detection that Workday authenticated step counts can differ materially by employer after authentication

Observed but not yet fully proven across all platforms:
- Reliable Workday disclosure/self-ID option handling across employer-specific wording
- Reliable Workday source-picker handling across employer-specific wording
- Reliable Workday resume-upload completion on `My Experience`
- Reliable generalized Workday `Self Identify` filling across employer-specific implementations
- Every custom-dropdown variant on Greenhouse
- Complex captcha- or login-heavy flows

## Notes to record

After each validation run, note:
- employer / platform
- what worked
- what broke
- which fields were hard to detect
- which control types were proven vs only observed
- whether uploads succeeded
- whether sponsorship questions were handled correctly
- artifact filenames saved in `output/live-tests/`

Use those notes to improve `modes/apply.md`, scanner targeting, and future platform-specific guidance.
