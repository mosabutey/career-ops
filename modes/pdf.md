# Mode: pdf -- ATS-Optimized Resume and CV Generation

## Full pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if it is not already in context
3. Extract 15-20 keywords and phrases from the JD
4. Detect JD language -> document language (EN default)
5. Detect company location -> paper format:
   - US/Canada -> `letter`
   - Rest of world -> `a4`
6. Detect the primary role pack and career stage
7. Choose the best document family:
   - `medical_affairs_resume`
   - `consulting_resume`
   - `healthtech_resume`
   - `short_industry_cv`
   - `internship_resume` / `externship_resume` / `co_op_resume`
   - optional later `academic_support_cv`
8. Rewrite the Professional Summary for the role pack and stage
9. Reorder experience bullets by relevance
10. Build a competency grid from the JD requirements
11. Inject keywords naturally into existing achievements without inventing anything
12. Generate full HTML from the template and tailored content
13. Write HTML to a temporary file
14. Run `node generate-pdf.mjs`
15. Report PDF path, page count, and keyword coverage

## Document-family guidance

- `medical_affairs_resume`: emphasize evidence communication, therapeutic relevance, external-facing credibility, scientific depth
- `consulting_resume`: emphasize structured problem solving, synthesis, executive communication, ambiguity handling, decisions
- `healthtech_resume`: emphasize workflow insight, evidence-to-product translation, systems thinking, cross-functional collaboration
- `short_industry_cv`: compact variant for broad applications and networking
- `internship_resume` / `externship_resume` / `co_op_resume`: emphasize initiative, readiness, exposure, and ownership over seniority

## ATS rules

- Single-column layout
- Standard section headers
- No critical text inside images or SVGs
- No sidebars or parallel columns
- UTF-8, selectable text
- No invented keywords
- Put the most relevant JD language in the Summary, first bullets, and Skills section

## Section order

### Standard industry variants

1. Header
2. Professional Summary
3. Core Competencies
4. Work Experience
5. Projects / Selected Work
6. Education
7. Certifications (if applicable)
8. Skills

### Early-career variants

1. Header
2. Professional Summary
3. Core Competencies
4. Education
5. Research / Project Experience
6. Work / Clinical / Leadership Experience
7. Skills

## Keyword-injection strategy

Only rephrase real experience using the employer's language.

Examples:
- "Presented findings to multidisciplinary audiences" -> "Communicated evidence to cross-functional stakeholders"
- "Managed study workflow and participant tracking" -> "Coordinated study operations and workflow execution"
- "Built analyses in Python and R" -> "Used Python and R for analytical workflows and decision support"

## HTML template

Use `templates/cv-template.html` and fill the placeholders with tailored content from the chosen document family.

## Canva CV generation (optional)

If `config/profile.yml` has `canva_resume_design_id`, offer a choice:
- `HTML/PDF (fast, ATS-optimized)`
- `Canva CV (visual, design-preserving)`

If no Canva design ID exists, skip the prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 -- Duplicate the base design

a. `export-design` the base design as PDF
b. `import-design-from-url` using that export URL
c. Save the new duplicate `design_id`

#### Step 2 -- Read the design structure

a. `get-design-content` on the duplicate
b. Map text elements to sections by content matching:
   - candidate name -> header
   - summary labels -> summary
   - company names from `cv.md` -> experience
   - degree or school names -> education
   - skill keywords -> competencies / skills
c. If mapping fails, show the user what was found and ask for guidance

#### Step 3 -- Generate tailored content

Use the same content generation logic as the HTML flow:
- rewrite the summary for the role pack and stage
- reorder bullets by JD relevance
- choose the right competency terms
- condense or expand content to fit the chosen document family

**Character-budget rule:** each replacement text should stay within about +/-15% of the original element length. If the tailored copy is longer, condense it. Fixed-size Canva text boxes can otherwise break the layout.

#### Step 4 -- Apply edits

a. `start-editing-transaction`
b. `perform-editing-operations` with `find_and_replace_text`
c. Reflow layout after text replacement:
   1. read updated positions from the editing response
   2. calculate the end of each experience block
   3. preserve the original gap between sections
   4. move the next header, dates, titles, and bullets with `position_element`
   5. repeat top to bottom
d. Verify layout before commit:
   - `get-design-thumbnail`
   - inspect for overlap, uneven spacing, cut-off text, or overly small text
   - fix with `position_element`, `resize_element`, or `format_text`
   - repeat until clean
e. Show the user the preview and ask for approval
f. `commit-editing-transaction` only after approval

#### Step 5 -- Export and download PDF

a. `export-design` the duplicate as PDF using the detected paper size
b. Immediately download the PDF to `output/`
c. Verify the download is a real PDF, not expired XML or HTML
d. If the URL expired, re-export and retry
e. Report the PDF path, file size, and Canva design URL

#### Error handling

- If design duplication fails -> fall back to the HTML/PDF flow
- If mapping fails -> ask for manual guidance
- If replacement text cannot be matched -> widen the text search
- Always provide the Canva design URL for manual tweaking if auto-editing is imperfect

## Post-generation

If the role is already in `data/applications.md`, update the existing tracker row from `❌` to `✅`.
Do not create a new tracker entry in `pdf` mode.
