# Mode: compare -- Multi-Opportunity Comparison

Compare multiple opportunities side by side and rank them without flattening major differences in role pack or career stage.

## Evaluation Framework

Score each opportunity across these weighted dimensions:

| Dimension | Weight | 5 = ... | 1 = ... |
|-----------|--------|---------|---------|
| Role fit | 25% | Strong match to proven strengths | Weak or forced fit |
| Track value | 20% | Strong fit with a priority role pack | Pulls away from target direction |
| Evidence strength | 15% | Clear proof points map directly | Little credible evidence |
| Transition feasibility | 15% | Plausible move now | Hard to explain honestly |
| Compensation and logistics | 10% | Strong package and workable constraints | Weak pay, sponsorship friction, or major logistics blockers |
| Learning and leverage | 10% | Strong upside, network, scope, or brand | Low upside |
| Process quality | 5% | Clear, timely, respectful process | Slow, vague, or noisy process |

Apply stage-aware judgment:
- students and trainees -> signal value, plausibility, exposure
- advanced training -> transferability and maturity
- experienced professionals -> scope and leverage

## Inputs

Offers can be:
- raw JD text
- URLs
- references to previously evaluated roles in the tracker

## Output

Create:
1. A ranked comparison table
2. A short verdict for each opportunity
3. A final recommendation using:
   - `APPLY FIRST`
   - `APPLY NOW`
   - `NETWORK FIRST`
   - `MONITOR`
   - `SKIP`

## Guidance

- Be decisive.
- Name the trade-offs between fit, upside, optionality, and realism.
- Explicitly call out when one role is better strategically but another is easier to convert.
- Explicitly call out when sponsorship posture or work-authorization friction is a major differentiator.
- If all roles are weak, recommend against applying.
