# LLU Course Studio (proof of concept)

A course design workbench for Loma Linda University Health faculty. It embeds the faculty development course **Teaching Well in Higher Ed** (Learning Innovation, draft for pilot) as a guided path, and adds a **mission lens** framed by *Scholarship for Service*.

Faculty design as they go, and the studio explains **why** each approach fits, at three depths:

1. **Glance:** a symbol beside a field or suggestion.
2. **Hint:** one line, in the course's own "why this matters" voice.
3. **Go deeper:** the course page, a worked example, and the evidence behind the claim, with its strength and caveats.

## The guided path

Each step produces one of the course's apply-it templates as a live record.

| Step | Course source | Produces |
|---|---|---|
| 1. Course and outcome | Module 2 | One measurable outcome, with Bloom and Miller levels |
| 2. Learning-science audit | Module 1 | Retrieval, spacing, load and blind-spot audit |
| 3. Session and modality | Module 3 | Timed session plan with practice and feedback |
| 4. Assessment and feedback | Module 4 | Task, rubric, feedback routine |
| 5. Alignment map | Module 2 | Outcome → practice → assessment, with the five misalignment patterns |
| 6. AI approach | Module 5 | AI Assessment Scale level, visible thinking, syllabus wording |
| 7. Mission lens | Proposed addition | Where Scholarship for Service lives in the design |
| 8. Plan and self-check | Capstone | Teaching Improvement Plan, estimated against the reviewer's rubric |

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
- `src/checks.js` holds the rules behind the hints. Each rule names the hint that explains it.

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

- Designs are saved in the browser only. Export or import JSON to move them.
- No sign-in, no shared review queue, and no Canvas connection yet.
- The capstone rating is an estimate from the entries. A trained reviewer decides.
