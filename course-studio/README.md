# LLU Course Studio (proof of concept)

A **course builder** for Loma Linda University Health faculty, with the faculty development course **Teaching Well in Higher Ed** (Learning Innovation, draft for pilot) built into the building. Faculty design a whole course. The course's ideas, evidence and knowledge checks appear at the moment each one is used. A **mission lens** framed by *Scholarship for Service* runs alongside.

## How the learning is built in

- **Each step teaches the module it draws on.** The panel beside every step states the idea to use there, in the course's own words.
- **"Why" at three depths.** A symbol at a glance, a one-line hint, and the full course page with its worked example and evidence row.
- **Knowledge checks in place.** The course's questions sit in the step where the idea is used, with unlimited tries and feedback. Learning progress by module is under **Learning** in the header. It does not grant the certificate; the formal course stays in Canvas.
- **Live checks** apply the course's rules to your actual course and link each finding to its reason.
- **The capstone comes out of the build.** Choose one focus outcome, and the Teaching Improvement Plan assembles from the course design.

## Steps

| Step | Teaches | Builds |
|---|---|---|
| 1. Course and learners | Module 1: andragogy | Course details, learners, credits and an hours budget |
| 2. Outcomes | Module 2: measurable outcomes, Bloom, Miller | Three to eight course outcomes with levels |
| 3. Course map | Module 1: spacing | Week-by-week topics tied to outcomes, with a map of where each outcome returns |
| 4. Learning activities | Module 3: active learning; Module 1: audit | Methods and hours for each week, plus one session designed in detail |
| 5. Assessment plan | Module 4: assessment, rubrics, feedback | Assessments with formats, weights, outcomes, rubrics and hours |
| 6. Alignment matrix | Module 2: alignment and misalignment patterns | Every outcome against its practice and its evidence |
| 7. AI approach | Module 5: AI levels, detectors, clear policy | An AI level for each assessment and a course AI statement |
| 8. Mission lens | Proposed addition | Where Scholarship for Service lives in outcomes, weeks and assessments |
| 9. Syllabus and plan | Capstone | Workload check, syllabus draft, Teaching Improvement Plan and self-check |

## Symbols

| Symbol | Answers |
|---|---|
| Evidence: ●●● Strong, ●●○ Moderate, ●○○ Limited, ◇ Framework, □ Design choice | How sure are we? (the course author's ratings) |
| ◉ Mission | A value LLU holds. Mission hints never carry an evidence rating. |
| Bloom 1–6 | What kind of thinking? |
| Miller: knows → does | What kind of assessment can show this? |
| AI 1–5 | How much AI fits this assignment? |
| ✓ Aligned, ◐ Partly, ✕ Gap | Do outcome, practice and assessment line up? |

Every symbol pairs a shape with a word, so color is never the only signal.

## Content and ownership

- `src/content/course.js` holds the course's hints and evidence rows, condensed from the Learning Innovation document. The course is the source; edit this file when the course changes. Its draft status and unverified citations are shown in the studio.
- `src/content/mission.js` is a **draft for the course owner's review**. The mission wording, the *Scholarship for Service* and *Mission-Focused Learning* definitions, and the dimension prompts were written for this POC and are not institutional language.
- `src/content/course.js` also holds the course's knowledge-check questions, each placed in the step where its idea is used.
- `src/checks.js` holds the rules behind the hints, from single outcomes up to the course matrix, weights and workload. Each rule names the hint that explains it.

## AI coach

The coach critiques a step the faculty member has already drafted; it opens only after they write something. This follows Module 5's guidance to try first, then compare. It runs on Claude through the server and:

- grounds its feedback in the course content for that step,
- refuses to send text that looks like patient or personal identifiers (checked in the browser and again on the server),
- is told never to invent citations.

## Run it

```bash
npm install
```

```bash
ANTHROPIC_API_KEY=your-key npm start
```

Then open http://localhost:8080. Without a key, everything works except the coach.

```bash
npm test
```

```bash
npm run build
```

The build writes `dist/course-studio.html`, a single self-contained page for previews. The coach is off there.

## POC limits

- Courses and learning progress are saved in the browser only. Export or import JSON to move a course.
- No sign-in, no shared review queue, and no Canvas connection yet.
- The capstone rating is an estimate from the entries. A trained reviewer decides.
- The workload check uses the federal credit-hour definition (about 1 hour in class and 2 outside per credit, per week). Confirm how your school applies it.
