# Mode: deep -- Deep Research Prompt

Generate a structured prompt for Perplexity/Claude/ChatGPT across 6 axes:

```markdown
## Deep Research: [Company] -- [Role]

Context: I am evaluating a candidacy for [role] at [company]. I need actionable interview intelligence.

### 1. AI Strategy
- Which products/features use AI/ML?
- What is their AI stack? (models, infra, tools)
- Do they have an engineering blog? What do they publish?
- What papers or talks have they given about AI?

### 2. Recent Moves (last 6 months)
- Relevant AI/ML/product hires?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering Culture
- How do they ship? (deploy cadence, CI/CD)
- Monorepo or multi-repo?
- Which languages/frameworks do they use?
- Remote-first or office-first?
- What do Glassdoor/Blind reviews say about engineering culture?

### 4. Likely Challenges
- What scaling problems are they likely facing?
- Reliability, cost, or latency challenges?
- Are they migrating anything? (infra, models, platforms)
- What pain points do people mention in reviews?

### 5. Competitors and Differentiation
- Who are their main competitors?
- What is their moat / differentiator?
- How do they position themselves against the competition?

### 6. Candidate Angle
Given my background (read from `cv.md` and `profile.yml` for specific experience):
- What unique value do I bring to this team?
- Which of my projects are most relevant?
- What story should I tell in the interview?
```

Personalize each section with the specific context of the evaluated role.
