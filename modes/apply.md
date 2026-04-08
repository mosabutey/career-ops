# Mode: apply -- Live Application Assistant

Interactive mode for when the candidate is filling out a job application form in Chrome. Read what is on screen, load the prior context for the role, and generate tailored answers for every visible question.

## Requirements

- **Best with visible Playwright**: in visible mode, the candidate can see the browser and the agent can interact with the page.
- **Without Playwright**: the candidate shares a screenshot or pastes the questions manually.

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

## Step 4 -- Analyze form questions

Identify ALL visible questions:
- Free-text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear about us, work authorization, etc.)
- Yes/No questions (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

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

## Scroll handling

If the form has more questions than are visible:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the full form is covered
