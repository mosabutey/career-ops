# Mode: tracker -- Applications Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```

Possible states: `Evaluated` -> `Applied` -> `Responded` -> `Interview` -> `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = the candidate submitted the application
- `Responded` = a recruiter/company replied and the candidate responded
- `Interview` = the candidate is in an active interview process

If the user asks to update a state, edit the corresponding row.

Also show stats:
- Total applications
- By state
- Average score
- % with generated PDF
- % with generated report
