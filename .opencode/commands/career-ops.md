---
description: Career-Ops LifeSci -- show menu or evaluate an opportunity
---

Career-Ops LifeSci router. Arguments provided: "$ARGUMENTS"

If arguments contain a job description or URL (keywords like "responsibilities", "requirements", "qualifications", "about the role", "http", "https"), the skill will execute auto-pipeline mode.

Otherwise, the discovery menu will be shown.

Supported modes include:
- `evaluate`
- `compare`
- `contact`
- `interview-prep`
- `pdf`
- `apply`
- `scan`
- `patterns`
- `pipeline`
- `batch`
- `tracker`
- `deep`
- `training`
- `project`
- `update`

Load the career-ops skill:
```
skill({ name: "career-ops" })
```
