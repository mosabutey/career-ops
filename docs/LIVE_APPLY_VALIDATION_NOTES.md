# Live Apply Validation Notes

This document records hands-on validation findings from real public application flows.

## Validation ledger

| Date | Platform | Company / Role | Result | Key finding | Artifacts |
|------|----------|----------------|--------|-------------|-----------|
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | launcher + gated flow reached | `Apply` opened a `Start your application` launcher, and `Apply Manually` revealed a 7-step flow with `Create Account/Sign In` as step 1 | `medtronic-workday-pvh-2026-04-08.json`, `medtronic-workday-pvh-2026-04-08-initial.png`, `medtronic-workday-pvh-2026-04-08-after-cta.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | account-creation validation blocked | a real create-account attempt stayed on step 1 and returned an inline password-policy error; no related verification mail was observed in the connected inbox afterward | `medtronic-workday-auth-2026-04-09.json`, `medtronic-workday-auth-2026-04-09-gate.png`, `medtronic-workday-auth-2026-04-09-post-auth-attempt.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | verification email emitted | a second create-account attempt redirected to a Workday login route and generated a real `Verify your candidate account` email | `medtronic-workday-auth-2026-04-09b.json`, `medtronic-workday-auth-2026-04-09b-gate.png`, `medtronic-workday-auth-2026-04-09b-post-auth-attempt.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | activation link reached login boundary | opening the verification link landed on `login/error` with title `Sign In`, not directly on `My Information` or another downstream application step | `medtronic-workday-verify-2026-04-09.json`, `medtronic-workday-verify-2026-04-09-activation.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | authenticated progression to step 1 | returning through the original apply flow and signing in with the verified account reached a real authenticated `My Information` page with a 6-step sequence and visible applicant fields | `medtronic-workday-signin-2026-04-09d.json`, `medtronic-workday-signin-2026-04-09d-signin.png`, `medtronic-workday-signin-2026-04-09d-post-signin.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | field inventory captured on authenticated step 1 | authenticated `My Information` exposed required text fields, yes/no radios, a preferred-name checkbox, and multiple custom picker controls for source, country, prefix, suffix, state, and phone metadata | `medtronic-workday-myinfo-2026-04-09.json`, `medtronic-workday-myinfo-2026-04-09-myinfo.png` |
| 2026-04-09 | Workday | Medtronic -- Senior Medical Affairs Specialist - PVH | authenticated progression to review | a truthful fill pass advanced through `Voluntary Disclosures`, rendered a real `Self Identify` page, and then reached a true `Review` page with summary sections and a visible final `Submit` button | `medtronic-workday-fill-myinfo-2026-04-09q.json`, `medtronic-workday-fill-myinfo-2026-04-09q-after-disclosures.png`, `medtronic-workday-fill-myinfo-2026-04-09q-after-self-identify-save.png`, `medtronic-workday-fill-myinfo-2026-04-09q-review.png` |
| 2026-04-09 | Workday | Organon -- Medical Science Liaison - Northeast | create-account advanced directly to authenticated step 1 | the same test account reached authenticated `My Information` immediately after create-account, with a shorter 5-step sequence and no `Self Identify` step in the authenticated flow | `organon-workday-auth-2026-04-09.json`, `organon-workday-auth-2026-04-09-gate.png`, `organon-workday-auth-2026-04-09-post-auth-attempt.png` |
| 2026-04-09 | Workday | MSD -- Associate Principal Scientist, Clinical Operations - Immunology | create-account advanced directly to authenticated step 1 | the same test account reached authenticated `My Information` immediately after create-account, with `Application Questions` split across two steps and `Self Identify` preserved in the downstream step list | `msd-workday-auth-2026-04-09.json`, `msd-workday-auth-2026-04-09-gate.png`, `msd-workday-auth-2026-04-09-post-auth-attempt.png` |
| 2026-04-09 | Workday | MSD -- Associate Principal Scientist, Clinical Operations - Immunology | step-1 fill mostly worked but source picker blocked progression | name, address, state, phone device type, phone number, and prior-employment answers were populated, but `How Did You Hear About Us?` remained unresolved and blocked progression past `My Information` | `msd-workday-fill-myinfo-2026-04-09b.json`, `msd-workday-fill-myinfo-2026-04-09b-myinfo-filled.png`, `msd-workday-fill-myinfo-2026-04-09b-after-save.png` |
| 2026-04-09 | Workday | Medtronic -- Clinical Specialist, CAS | returning-account retest still blocked at authenticated step 1 | on a fresh Medtronic posting, in-flow sign-in reused the existing applicant account but the truthful fill still stopped on `My Information`; stricter validation showed `How Did You Hear About Us?` remained unselected and phone validation still failed, so no deeper progression was claimed | `medtronic-workday-clinical-specialist-fill-2026-04-09c.json`, `medtronic-workday-clinical-specialist-fill-2026-04-09c-myinfo-filled.png`, `medtronic-workday-clinical-specialist-fill-2026-04-09c-after-save.png` |
| 2026-04-09 | Workday | MSD -- Associate Director, Clinical Data Management (Hybrid) | returning-account retest still blocked at authenticated step 1 | on a fresh MSD posting, in-flow sign-in reused the existing applicant account but the truthful fill still stopped on `My Information`; stricter validation showed `How Did You Hear About Us?` remained unselected and phone validation still failed, so no deeper progression was claimed | `msd-workday-clinical-data-management-fill-2026-04-09c.json`, `msd-workday-clinical-data-management-fill-2026-04-09c-myinfo-filled.png`, `msd-workday-clinical-data-management-fill-2026-04-09c-after-save.png` |
| 2026-04-09 | Workday | Organon -- Regulatory Affairs Specialist | returning-account retest reached review | on a fresh Organon posting, in-flow sign-in reused the existing applicant account, resumed beyond step 1, passed a real `Voluntary Disclosures` page once the tenant-specific terms/conditions consent was checked, and reached a true `Review` page without submission | `organon-workday-reg-affairs-fill-2026-04-09e.json`, `organon-workday-reg-affairs-fill-2026-04-09e-disclosures-filled.png`, `organon-workday-reg-affairs-fill-2026-04-09e-after-disclosures.png`, `organon-workday-reg-affairs-fill-2026-04-09e-review.png` |
| 2026-04-09 | Greenhouse | Azurity -- Medical Science Liaison/Sr. Medical Science Liaison - Oncology - WEST | live form | live form exposed 2 file inputs and a high custom-widget footprint, including 16 visible comboboxes | `azurity-greenhouse-oncology-west-2026-04-08.json`, `azurity-greenhouse-oncology-west-2026-04-08-initial.png`, `azurity-greenhouse-oncology-west-2026-04-08-after-cta.png` |
| 2026-04-09 | Greenhouse | Azurity -- stale redirected role URL | stale redirect | stale job URL redirected to jobs index with `?error=true` and still rendered interactive index filters; the page also surfaced React hydration warnings in the browser console | `azurity-greenhouse-msl-2026-04-08.json`, `azurity-greenhouse-msl-2026-04-08-initial.png` |
| 2026-04-09 | SmartRecruiters | AbbVie -- Medical Science Liaison | blocked one-click handoff | `I'm interested` redirected to SmartRecruiters one-click UI, which returned `Access is temporarily restricted` rather than an inspectable form | `abbvie-smartrecruiters-msl-2026-04-08.json`, `abbvie-smartrecruiters-msl-2026-04-08-initial.png`, `abbvie-smartrecruiters-msl-2026-04-08-after-cta.png` |
| 2026-04-09 | SmartRecruiters | Dr. Reddy's -- Team Lead- Medical Affairs | expired | posting rendered an explicit expired-job state rather than an apply surface | `drreddys-smartrecruiters-team-lead-medical-affairs-2026-04-08.json`, `drreddys-smartrecruiters-team-lead-medical-affairs-2026-04-08-initial.png` |
| 2026-04-09 | Ashby | CoMind -- Director of Medical Affairs | live form | `Apply for this job` opened `/application` and exposed text fields, uploads, a sponsorship radio question, and a combobox | `comind-ashby-director-medical-affairs-2026-04-08.json`, `comind-ashby-director-medical-affairs-2026-04-08-initial.png`, `comind-ashby-director-medical-affairs-2026-04-08-after-cta.png` |
| 2026-04-09 | iCIMS | Medpace -- Clinical Safety Manager - Pharmacovigilance / Drug Safety | login gate | `Apply` left the social-distribution posting and opened an employer `icims.com` login route instead of an inspectable application form | `medpace-icims-clinical-safety-manager-2026-04-08.json`, `medpace-icims-clinical-safety-manager-2026-04-08-initial.png`, `medpace-icims-clinical-safety-manager-2026-04-08-after-cta.png` |
| 2026-04-09 | Workable | CLAS -- Medical Interpreter | live form after cookie handling | cookie banner blocked the CTA until dismissed; then `Apply for this job` opened `/apply/` with large questionnaire, uploads, textareas, radios, and one combobox | `clas-workable-medical-interpreter-2026-04-08.json`, `clas-workable-medical-interpreter-2026-04-08-initial.png`, `clas-workable-medical-interpreter-2026-04-08-after-cta.png` |
| 2026-04-09 | Phenom | Eisai -- MSL/Sr. MSL, Neurology - Alzheimer's Disease, New England | review reached without submission | a truthful fill pass uploaded the tailored resume, advanced through personal information, work and education, job-specific questions, veteran disclosure, disability self-ID, and reached a real `Review` page with a visible `Submit` button | `eisai-r3995-apply-2026-04-09.json`, `eisai-review-2026-04-09.json`, `eisai-review-2026-04-09.png` |

## Validated platforms

### Greenhouse

Representative live tests:
- Legend Biotech -- Medical Affairs Co-Op
- Cytokinetics -- Director, Regulatory Affairs CMC Europe
- Azurity -- Medical Science Liaison/Sr. Medical Science Liaison - Oncology - WEST

Observed:
- The application page was reachable
- The `Apply` flow stayed on the same page and exposed a full form
- Text fields could be filled
- Resume upload could be triggered
- Custom combobox-style questions were present in quantity, including country, sponsorship, relocation, and other screening questions
- A live sponsorship combobox was successfully driven with keyboard fallback on the Cytokinetics form
- A live checkbox acknowledgment was successfully marked on the Cytokinetics form
- A current Azurity medical-affairs form exposed 2 visible file inputs and 16 visible comboboxes in one live pass
- The workflow stopped before submission

Important finding:
- Greenhouse may expose both `First Name` and `Preferred First Name`, so exact selectors are safer than broad label matching
- Greenhouse dropdowns are often not native `select` elements; they may behave as `combobox` + `listbox` controls instead
- Some comboboxes are easier to drive by keyboard than by clicking a visible option list
- Not every combobox variant behaved the same way across pages, so value verification after selection is important
- A stale Greenhouse role URL can redirect to the jobs index with `?error=true`; the resulting page may still show interactive filters and job links, so agents should not mistake it for a valid application form
- At least one stale Greenhouse redirect surfaced React hydration warnings while still rendering the jobs index, so console noise alone should not be treated as proof of an active form

### Lever

Representative live test:
- enGene -- Vice President, Medical Affairs

Observed:
- The `/apply` route was reachable
- Standard contact fields could be filled
- Resume upload worked
- Native `select` controls were filled successfully
- Radio groups were selected successfully when scoped to the surrounding question block
- Checkbox groups were selected successfully
- The workflow stopped before submission

Important finding:
- Lever can include many repeated `Yes`/`No` labels and large self-ID sections, so question-scoped selectors are safer than global label matching

### Workday

Representative live test:
- Montclair State University -- Procurement Systems Analyst
- Medtronic -- Senior Medical Affairs Specialist - PVH

Observed:
- The posting page was reachable
- The `Apply` path could be opened
- The flow progressed into a real multi-step application state
- The step structure was visible before account creation, including `Create Account/Sign In`, `My Information`, `My Experience`, `Application Questions`, `Voluntary Disclosures`, `Self Identify`, and `Review`
- A checkbox-style account-creation acknowledgment was present on the create-account step
- A current Medtronic role exposed a `Start your application` launcher with `Autofill with Resume`, `Apply Manually`, and `Use My Last Application` before entering the gated flow
- Choosing `Apply Manually` led to a dedicated `/apply/applyManually` path and a visible 7-step sequence with `Create Account/Sign In` as step 1
- A direct create-account attempt on the current Medtronic flow stayed on step 1 and returned an inline password-policy error rather than progressing to `My Information`
- No related verification or account email was observed in the connected inbox after that blocked attempt
- A second create-account attempt redirected to a Workday login route and produced a real `Verify your candidate account` email
- Opening the verification link led to a `login/error` route with title `Sign In`, not directly to `My Information` or another downstream application step
- Re-entering the original apply flow and choosing `Sign In` with the verified account reached an authenticated `My Information` page with a 6-step sequence, candidate-session chrome, and visible applicant fields such as legal name, address, phone, and prior-employment questions
- A read-only inventory pass on authenticated `My Information` captured 15 visible input controls plus custom picker-style controls surfaced as button-like elements, including `How Did You Hear About Us?`, `Country`, `Prefix`, `Suffix`, `State`, and `Phone Device Type`
- A truthful fill pass on authenticated `My Information` advanced into a real `My Experience` page after a second `Save and Continue`
- `My Experience` exposed work history, education, skills, and resume/CV upload in the authenticated Medtronic flow
- A truthful fill pass on Medtronic `Application Questions` advanced into a real `Voluntary Disclosures` page
- The live Medtronic `Voluntary Disclosures` page includes veteran status, race, gender, Hispanic/Latino, and a required `I consent` checkbox
- A truthful Medtronic disclosures pass advanced into a real `Self Identify` page that rendered the federal CC-305 disability form
- On the current Medtronic flow, the first `Save and Continue` from `Self Identify` advanced into a real `Review` page with summary sections and a visible final `Submit` button
- The current Medtronic `Self Identify` page showed `Language`, `Name`, `Employee ID`, and `Date`, and still allowed progression to `Review` without explicit self-ID answer filling in this employer flow
- Workday step tabs remained clickable even while earlier Medtronic steps were unresolved, so `Self Identify` and `Review` clicks alone still do not prove true page progression
- A current Organon flow reduced from a 6-step public gate to a 5-step authenticated flow after create-account and did not include `Self Identify` downstream
- A current MSD flow reduced from an 8-step public gate to a 7-step authenticated flow after create-account, preserving `Self Identify` and splitting `Application Questions` across two steps
- MSD authenticated step-1 filling proved the generalized name/address/state/prior-employment handling, but `How Did You Hear About Us?` still required a more exact employer-specific option strategy before `My Experience` became reachable
- Declaring a local resume path in `application_files.resume_upload_path` successfully propagated the approved file path into the probe, but Medtronic resume upload still did not surface as proven `Resume/CV` completion on review
- On fresh postings within the same employer, returning-account behavior still varied by tenant: Organon moved from `My Information` to `My Experience` and then to a real `Voluntary Disclosures` page, while Medtronic and MSD remained blocked on authenticated `My Information`
- The stricter heading-based probe confirmed that Workday sidebar step names can appear in page text without representing real page progression, so deeper states should only be counted when the active heading changes
- On fresh Medtronic and MSD postings, `How Did You Hear About Us?` and phone validation both remained unresolved after an otherwise complete step-1 fill, so repeat applications did not eliminate those tenant-specific blockers
- Organon fresh-posting progression showed that not every Workday tenant requires a source picker on `My Information`, and that the next blocker may instead be a later-page consent requirement
- After a phone-entry hardening pass, fresh Medtronic and MSD retests showed phone validation could be cleared while the source picker still blocked progression, narrowing the remaining Workday blocker to source selection only
- Live source-option probing on fresh postings exposed the currently accepted career-site labels: Medtronic surfaces `Career Site`, while MSD surfaces `Company Career Website`
- Deeper source-picker diagnostics showed these labels are exposed as real Workday `menuItem` / `promptOption` nodes on the live tenant, not just as page text
- Even after targeted `promptOption` selection and exact-label entry, fresh Medtronic and MSD retests still did not produce a trusted committed source value, so generalized source-picker completion remains unproven on those tenants
- A generalized later-step continuation pass proved that a returning Organon application can resume directly on `Voluntary Disclosures` and still reach a real `Review` page after checking the tenant-specific terms/conditions consent box

Important finding:
- Workday may require an account-creation or sign-in step before the deeper question pages are reachable, so this is a real workflow boundary the repo should respect
- Workday may expose an intermediate launcher before the real gated flow, so agents should distinguish `launcher reached` from `account wall reached`
- Workday account-creation testing can fail at inline password-policy validation before any email or next-step handoff occurs, so agents should inspect on-page errors before assuming account creation succeeded or that inbox verification is pending
- Even after Workday emits a real verification email, opening the activation link may still land on a login-boundary error route instead of advancing directly into step 2, so email verification alone does not prove downstream application access
- For at least one live Medtronic flow, the reliable path after verification was to return to the original application and sign in there; that resumed the application at authenticated `My Information` rather than at create-account
- Workday `My Information` mixes standard text inputs with non-native picker controls that are not exposed as plain `select` elements, so a complete filler needs both direct input handling and ATS-specific combobox/button logic
- Progressing past Workday `Application Questions` can require exact live-label matching, not just partial-label heuristics
- Workday step tabs should not be treated as proof of later-step access until the heading and body content actually change
- On the current Medtronic flow, `Review` is only considered proven because the heading changed to `Review`, the page rendered cross-step summary sections, and the final `Submit` control became visible
- Some Workday `Self Identify` pages may allow progression without every visible self-ID field being populated, so agents should distinguish required blockers from optional disclosure fields
- Some Workday employers allow create-account to advance directly into authenticated `My Information` without a separate verification-email loop, while others still require post-create-account verification or re-entry
- Workday step counts are employer-specific and can shrink after authentication, so agents should re-read the downstream step list instead of assuming the public gate sequence is final
- Workday `How Did You Hear About Us?` pickers can remain the main blocker even after other `My Information` fields are filled successfully, which argues for employer-specific source-option handling
- On some live tenants, even exact visible source options may not commit through a simple click or exact text entry, so a discovered option label alone does not prove a reliable filler path
- A local-only resume path can be configured up front, but Workday resume upload remains not yet proven on the current Medtronic flow
- Returning to a new Workday posting within the same employer does not guarantee that prior account state removes tenant-specific step-1 blockers; repeat-company behavior should be validated per employer
- Heading-based validation is necessary because sidebar step labels can make a blocked `My Information` page look like deeper progression unless the active page heading is checked explicitly
- Tenant-specific consent/terms acknowledgment wording can be the real blocker on later Workday pages even after step 1 and resume state are already complete

### SmartRecruiters

Representative live tests:
- AbbVie -- Pipeline Medical Science Liaison
- AbbVie -- Medical Science Liaison
- Dr. Reddy's -- Team Lead- Medical Affairs

Observed:
- expired postings are clearly detectable
- a live posting can expose a primary CTA labeled `I'm interested` instead of `Apply`
- following that CTA can hand off to a one-click SmartRecruiters surface
- A current AbbVie posting redirected the one-click handoff to `oneclick-ui/...` and then displayed `Access is temporarily restricted`

Important finding:
- in this environment, the SmartRecruiters one-click handoff did not expose an immediately inspectable form surface, so the repo should treat SmartRecruiters as a platform with CTA naming and rendering nuances rather than assuming Greenhouse-like behavior
- A live SmartRecruiters handoff can fail with an explicit anti-automation restriction page rather than a blank render, so the repo should surface the restriction clearly instead of describing it as generic inaccessibility

### Ashby

Representative live test:
- CoMind -- Director of Medical Affairs

Observed:
- The posting page was reachable
- `Apply for this job` opened a dedicated `/application` page
- The application page exposed text fields, uploads, radio buttons, a checkbox, and a combobox
- A sponsorship question was presented as a radio-style choice
- The workflow stopped before submission

Important finding:
- Ashby can expose a compact but fully inspectable same-tab application form with both autofill-from-resume and direct upload behaviors
- The final submit button may be present on the same page, so the stop-before-submit boundary must stay explicit

### iCIMS

Representative live test:
- Medpace -- Clinical Safety Manager - Pharmacovigilance / Drug Safety

Observed:
- The social-distribution posting page was reachable
- `Apply` handed off from the social-distribution page to an employer-hosted `icims.com` route
- The handoff landed on a `/login` path rather than an inspectable form
- The resulting page shell did not expose applicant controls in this environment

Important finding:
- iCIMS can use a social-distribution posting as a public front door and then require an employer-hosted login step before the actual application is available
- Agents should classify the handoff as a login gate, not as a broken or empty form

### Workable

Representative live test:
- Comprehensive Language Access Solutions -- Medical Interpreter

Observed:
- The posting page was reachable
- A cookie banner was present and initially blocked the primary CTA
- After accepting cookies, `Apply for this job` opened a dedicated `/apply/` page
- The application page exposed many controls, including text inputs, textareas, multiple file uploads, radios, checkboxes, and a combobox
- The workflow stopped before submission

Important finding:
- Workable may require cookie-banner handling before the visible CTA is actually usable
- Workable can expose large, same-tab application forms with many required upload and questionnaire sections

### Phenom / Phenom People

Representative live test:
- Eisai -- MSL/Sr. MSL, Neurology - Alzheimer's Disease, New England

Observed:
- the employer route exposed a same-tab multi-step apply flow
- step 1 used native `select` and text controls for personal information
- resume upload on step 1 was accepted and persisted into review
- step 2 prefilled work experience from the uploaded resume
- step 2 still required manual or profile-driven completion of degree and field-of-study selectors for education
- step 3 used native `select` controls plus a textarea for salary expectations
- step 4 required veteran-status selection plus a terms-and-conditions checkbox
- step 5 rendered the federal disability self-ID form and still allowed truthful `I do not want to answer`
- step 6 rendered a true `Review` page with summary sections and a visible final `Submit` button

Important finding:
- Phenom is a strong candidate for visible-browser review handoff because the final review page is directly reachable without an employer-side account gate on the tested flow
- resume parsing can reduce manual effort substantially, but it should not be trusted to complete education or employer-specific questions without verification

## Failure cases observed

- A stale Lever job link returned a 404 page
- A Greenhouse job link redirected to a generic jobs error page instead of a valid application
- A stale Azurity Greenhouse role URL redirected to the jobs index with `?error=true`
- A sector-relevant Workday link for Sarepta returned a "page doesn't exist" error page
- A real Workday account-creation attempt remained on `Create Account` because of inline password-policy validation
- A verified Medtronic Workday activation link landed on `login/error` rather than a downstream applicant step
- Early Workday sign-in probing initially filled the wrong visible email field because the modal coexisted with background create-account inputs
- Some Greenhouse question widgets exposed field IDs cleanly but did not always expose click-friendly option lists consistently
- A SmartRecruiters posting was expired, and a live SmartRecruiters one-click handoff rendered without accessible form controls in this environment
- A live SmartRecruiters one-click handoff also returned an explicit `Access is temporarily restricted` page that cited suspicious activity / automation
- An iCIMS `Apply` handoff reached a `/login` route with no inspectable applicant controls in this environment
- A Workable cookie banner initially blocked the primary CTA until it was dismissed

## Product implications

- Apply mode should verify the application page before filling
- Field selectors should be robust to overlapping labels
- Upload flows are realistic and worth supporting as a first-class capability
- Custom ATS controls should be handled as role-based widgets, not just native form elements
- Keyboard fallback is valuable for some combobox widgets
- Workday support should explicitly account for launcher states, gated multi-step flows, and account-creation boundaries
- Workday auth probing should capture inline validation errors and should not infer that an email was sent unless inbox evidence exists
- Workday verification-link probing should classify downstream `login/error` or sign-in landings as continued auth boundaries, not as proof that the applicant flow is now open
- Workday sign-in probing should target modal fields carefully when sign-in overlays the create-account page, because duplicate visible inputs can coexist on the same DOM
- Workday step-1 filling should map repo/profile data into both plain fields and custom picker controls rather than assuming a uniform form model
- Greenhouse stale redirects should be classified before control counting so index filters are not mistaken for form questions
- SmartRecruiters support should look for alternate CTA text such as `I'm interested` and verify whether the application handoff actually renders usable controls or an explicit access restriction
- Ashby support can treat same-tab application pages as a realistic high-value target for assisted form filling
- iCIMS support should treat employer-hosted `/login` handoffs as a documented boundary rather than as an unexplained failure
- Workable support should handle cookie banners before deciding whether the CTA is absent
- Browser-assisted application support is viable, but must keep the user-review boundary intact

## Current confidence by control type

High confidence:
- text inputs
- file uploads
- stale-link detection
- Greenhouse custom-combobox handling in at least one live sponsorship flow
- Greenhouse live-form detection on at least one current high-combobox medical-affairs page
- checkbox interaction
- Workday launcher detection
- Workday multi-step flow detection up to the create-account gate
- Workday inline account-creation validation detection
- Workday verification-email detection and post-verification login-boundary detection
- Workday authenticated progression into `My Information`
- Workday authenticated step-1 field inventory
- Workday truthful progression into `My Experience`
- Workday truthful progression into `Application Questions`
- Workday truthful progression into `Voluntary Disclosures`
- Workday truthful progression into `Self Identify`
- Workday truthful progression into `Review`
- Workday create-account progression directly into authenticated `My Information` on Organon
- Workday create-account progression directly into authenticated `My Information` on MSD
- Workday returning-account progression into `Voluntary Disclosures` on a fresh Organon posting
- Workday returning-account progression into `Review` on a fresh Organon posting
- Ashby same-tab application-form detection
- Workable same-tab application-form detection after cookie handling

Medium confidence:
- broader Greenhouse combobox families across different employers
- SmartRecruiters alternate-CTA detection and blocked one-click handoff classification
- iCIMS posting-to-login-gate handoff classification

Not yet proven in live testing:
- generalized Workday `Self Identify` fill behavior across employers
- generalized Workday `How Did You Hear About Us?` / source-picker handling across employers
- generalized Workday resume-upload handling on `My Experience`
- generalized Workday phone normalization / validation handling across employers
- generalized Workday tenant-specific consent checkbox handling across employers
- whether a verified Workday account can resume directly into applicant step 2 in this environment
- a reliable generalized selector strategy for Workday picker-style controls across employers
- a reliable generalized selector strategy for Workday disclosure/self-ID dropdown options across employers
- reliable SmartRecruiters progression past one-click restrictions
- deeper iCIMS progression past the employer login handoff
- final-submit handling, by design

## Workday boundary note

Going deeper than the create-account or sign-in gate on most live Workday applications usually requires creating or using a real applicant account on an employer system. Even when the user explicitly asks to test that boundary, the agent should verify whether the attempt failed inline, sent a verification email, or genuinely advanced before assuming the account exists. The repo should treat this as a documented handoff boundary unless the user clearly asks for help proceeding.
