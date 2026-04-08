# Customization Guide

Career-Ops LifeSci is designed to be adapted quickly.

The shared system lives in the repo. Your personal strategy belongs in:
- `config/profile.yml`
- `modes/_profile.md`
- `cv.md`
- `article-digest.md`
- `portals.yml`

## 1. Profile (`config/profile.yml`)

This is the single source of truth for:
- who you are
- what stage you are in
- which role packs matter most
- your markets, compensation, and work constraints
- your narrative, proof themes, and deal-breakers

Customize:
- `candidate`
- `authorization`
- `career_strategy`
- `role_packs`
- `narrative`
- `deal_breakers`
- `document_strategy`

For international candidates, use `authorization` to record:
- whether you can work now
- whether you need immediate sponsorship
- whether you will need future sponsorship
- your current basis for work authorization
- your authorization end date
- your preferred default when postings are silent

## 2. Translation library (`modes/_profile.md`)

This file teaches the system how to talk about you.

Use it to record:
- what you actually did
- how that maps into different employer contexts
- transferable strengths
- hidden assets
- objections and reframes
- track-specific positioning

## 3. Scanner targeting (`portals.yml`)

Copy from `templates/portals.example.yml` and customize:
- title keywords
- role packs
- career stages
- employer lists
- search queries

If you are targeting internships or fellowships, keep stage-specific keywords enabled.

You can also tune sponsorship detection by editing:
- `sponsorship_signals.explicit_open`
- `sponsorship_signals.explicit_closed`
- `sponsorship_signals.restricted`

Recommended default:
- treat explicit no-sponsorship language as a serious negative
- treat explicit sponsorship support as a positive
- do not auto-skip when the posting is silent

## 4. Resume and PDF behavior (`modes/pdf.md`)

The system supports multiple document families. Choose or customize:
- medical affairs resume
- consulting resume
- health-tech resume
- short industry CV
- internship / externship / co-op variant

Keep the facts the same. Change the framing, section order, and vocabulary.

## 5. Shared system logic (`modes/_shared.md`)

Only edit shared files when you are changing the product for everyone.

Examples:
- adding a new role pack
- improving stage logic
- changing the common scoring rubric
- improving international-candidate or sponsorship logic for everyone
- strengthening global writing or ATS rules

Do not put private personal data here.
