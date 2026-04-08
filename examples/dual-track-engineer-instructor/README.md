# Example -- dual-track engineer + instructor

This is for the case where one candidate has a real track record across two different role packs at once. The example here is a senior engineer who is also a senior technical instructor, but the same structure works for backend + SRE, research + product, IC + manager, or engineer + educator.

The default career-ops examples often assume one north-star track. Hybrid careers do not fit that mold. Bootcamp instructors, university lecturers, DevRel engineers, training architects, and internal enablement leads often have two real jobs on the CV, and the system needs to preserve both.

This folder shows how to:

1. Configure `role_packs:` in `profile.yml` with two strong target tracks instead of one.
2. Write a `cv.md` that puts measurable wins on both sides in front of the recruiter without diluting either.
3. Set two compensation ranges. Engineering and teaching pay differently, often by 20-40%, and the evaluator needs to know which range applies to a given offer.
4. At evaluation time, decide which track to lead with for the specific JD on the desk.

---

## Files

| File | Purpose |
|------|---------|
| `cv.md` | Fictional dual-track CV (Sam Rivera). Use as structural reference for your own. |
| `profile.yml` | Profile config with two primary tracks and two comp ranges. |
| `README.md` | This file. |

The persona is fictional (`Sam Rivera <sam@example.com>`). Do not copy values directly -- adapt them.

---

## When to use the dual-track pattern

Use it only if all of these are true:

1. You have measurable, recent wins on two different tracks. Not "I taught a workshop once", but real numbers: hours taught, alumni placed, retention rates, NPS -- and on the engineering side, systems owned, latency or cost moved.
2. You will actually take an offer from either side. If you would only really accept one and grudgingly take the other, do single-track and treat the other side as one strong bullet in the summary.
3. The two tracks are at roughly the same seniority. A junior teacher who is also a staff engineer is a single-track engineer who happens to mentor.

Use single-track instead if:

- One side is hobby-grade. "I mentor on weekends" does not count as a teaching career.
- The seniorities are mismatched.
- You are early enough in your career that you don't actually know yet which side is the main one.
- Your salary expectations on one track are non-negotiable. Pick that track and use the other as a differentiator in the cover letter.

---

## How dual-track changes the rest of career-ops

### `modes/_shared.md`
List both tracks clearly in your profile and translation library. The system should apply equal rigor to both until the specific JD makes one dominant.

### `cv.md`
Two ways to structure it:

- Layered (what I recommend): one Professional Summary that names both tracks in the first sentence, then experience entries that include both engineering and teaching bullets per role. Use this when the roles actually combined both. See the `cv.md` in this folder.
- Sectioned: separate "Engineering Experience" and "Teaching Experience" headings. Use this when the two tracks happened at different employers and don't need to be told as one story.

Lead the Professional Summary with the combination itself -- "senior AI engineer who runs the curriculum", or whatever the equivalent is for your stack. The combination is the thing that's hard to hire. Either side alone is not.

### `profile.yml` -- compensation
Put your engineering range in `compensation.target_range` (it's usually the higher one) and the teaching range in the optional `compensation.alternate_ranges` block. The evaluator picks the right one based on the JD.

### Evaluation reports
When career-ops evaluates an offer, it should detect which role pack the JD targets and pick the matching salary range, CV emphasis, and STAR stories. Check the `Track:` line in the report header. If that is wrong, the rest of the report is wrong too.

---

## Interview objection handling

A dual-track CV triggers objections that single-track CVs do not. Three you should expect.

### "Why are you applying for an engineering role if you also teach?"

The answer template I use:

> "Teaching is how I keep the engineering sharp. I have to ship code that students can actually run, debug, and extend, so I cannot get away with hand-waving. The reason I am here for [role] is [specific reason about the team / product / scope]. Teaching stays as a side activity, not a competing job."

Lead with engineering wins. Mention teaching as a credibility signal ("I have explained transformers about 200 times so I know exactly which parts trip people up"), not as a co-equal commitment.

### "Are you sure you want a teaching role? Your engineering background is intense, you will be bored."

> "The students I want to teach are going to ship production systems, not pass a quiz. My engineering background is exactly why I can get them there. I have done both for [N] years. This is not a step down. It is the same work in a different format."

Lead with the teaching wins (hours, alumni placed, retention, NPS). Use the engineering background as proof of credibility, not as a fallback plan.

### "Why not just pick one?"

> "Because the combination is the actual value. Engineers who can teach end up leading onboarding, writing internal docs people actually read, and running technical interviews. Teachers who can ship get hired to design curriculum that survives contact with production. I am looking for roles where both matter."

---

## Over/underqualified failure modes

Dual-track candidates get read as overqualified for pure teaching roles ("you will leave in six months for an engineering job") and as underqualified for pure engineering roles ("you have not been a full-time IC in two years"). Both kill applications. The mitigations:

| Risk | Mitigation in CV | Mitigation in interview |
|------|------------------|-------------------------|
| Overqualified for teaching | Lead the Summary with curriculum and outcomes, not LOC | Tell a story about a course you redesigned that moved student outcomes. Show you care about pedagogy, not just shipping. |
| Underqualified for engineering | Add a "Recent Engineering" section that lists shipping work from the last 12 months | Bring code. Pull up a PR you wrote in the last month. Walk through the architecture decisions in plain language. |

---

## Related files

- `../cv-example.md` -- single-track CV example for comparison.
- `../../config/profile.example.yml` -- the canonical profile schema this example extends.
- `../../modes/_shared.md` -- where role packs feed into framing logic.
- `../../CONTRIBUTING.md` -- this example was contributed under "Add example CVs for different roles".
