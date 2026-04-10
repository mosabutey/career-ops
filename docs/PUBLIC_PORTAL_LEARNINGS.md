# Public Portal Learnings

This repo is open source, so portal-style learnings should absolutely be shared when they help other users. The key is to publish them in a sanitized, reusable form.

## Safe to publish

- platform-level behavior such as Greenhouse verification-code loops, Workday launcher states, or Phenom review handoffs
- generic control-model lessons such as combobox handling, upload persistence checks, or heading-based validation
- de-identified examples like `live oncology MSL employer` or `same-company concurrent Greenhouse submissions`
- reusable scripts, prompts, and validation methods
- generic recovery patterns such as staying in the same live session, checking Gmail for the newest code, or using low-artifact relaunches under disk pressure

## Keep local-only

- candidate identity, contact details, addresses, phone numbers, LinkedIn URLs, and local paths
- employer-specific accepted-value overrides that are too brittle or too revealing for public docs
- exact tracker rows, reports, generated PDFs, and merged tracker artifacts
- exact code-to-window mapping notes from live same-company submissions
- browser/session artifacts, auth state, network captures, and local-only debug files

## Promotion workflow

1. Capture the sharp lesson locally in `.career-ops-local/`.
2. Distill the generic reusable lesson.
3. Publish the generic lesson into tracked docs, modes, or scripts.
4. Run `npm run privacy-check` before public push.

## Example

Good public lesson:
- `Greenhouse can branch into a post-submit security-code flow, so keep the same browser session open and confirm success before updating the tracker.`

Bad public lesson:
- `For employer X and role Y, use code email A in the junior window and code email B in the senior window at 8:44 PM.`
