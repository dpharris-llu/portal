# OratorStudio: an alternative plan

November 28, 2026. A fresh look at the plan, after the first day of real use. It keeps the premise, the four modules and everything built; it changes the emphasis, the order of work, and a few structures underneath. For comparison with the current plan in [`product-spec.md`](product-spec.md) and [`status.md`](status.md). Nothing here is decided until the product owner says so.

## Why pause now

In one day OratorStudio went from "evidence-based slides for LLU" to discovery across any field, cost tracking, students learning research, Scripture, Greek and Hebrew word study, and invitations. Each step was sound. Together they show the product is larger and slightly different than the spec assumed, and that its strongest part is not the one the spec puts first.

## What the first day taught us

1. **Curate is the product.** The moment that impressed was Discover returning a real evidence landscape on a random topic, then reading and checking it. Slide layout, presenting and polls are useful but replaceable; nobody else does evidence-to-message well.
2. **The output varies more than we thought.** The same curated evidence became, or could become: a talk, a written brief, a student research paper, a Bible study, a sermon. Slides are one output among several.
3. **One principle carries everything: Claude proposes, the data confirms.** It held for papers (quotes checked), numbers (checked against facts), discovery (named databases), Bible wording (fetched, not recalled) and Greek and Hebrew (STEPBible data). It is the product's trust story and should be its architecture.
4. **Evidence comes in kinds, each with its own label and check.** Research, statistics, guidance, work underway, news, Scripture and faith tradition, the institution's own. Today each was added its own way.
5. **Cost is a design constraint, not an afterthought.** Real numbers: about $3–5 per research paper on Sonnet, a fraction of a cent for Haiku tasks. Students and wider use make per-person limits, model routing and caching part of the core.
6. **People work together sooner than planned.** Invitations came on day one; co-authoring, reviewing and instructors follow naturally.
7. **The scope can sprawl.** Ten good directions at once means none finished. The plan needs a narrower first audience and clear exit criteria per phase.

## The alternative in one paragraph

Make **Curate the center**: a trusted evidence workspace that any presenter, teacher or student starts from. Treat everything after it as **outputs** chosen at the start: slides, a brief, a study guide, a paper outline, sermon notes. Build **one evidence pipeline** that every source kind plugs into, with its label and its check. **Export to the tools people already use** (PowerPoint, Google Slides, Word) early, instead of competing with them first. Keep Present and Engage, but after export. Focus the next three months on **two audiences**, presenters at LLU and students learning research, and measure quality with an evaluation set before adding more sources.

## What stays, what changes

| Area | Current plan | Alternative |
| --- | --- | --- |
| Premise and principles | Evidence-based presentations; Claude proposes, the author decides | Same, and "Claude proposes, the data confirms" becomes the named architecture |
| Modules | Curate → Build → Present → Engage, slides as the goal | Same four, but **Build means "build the output"**: slides, brief, study guide, paper outline, sermon notes |
| Starting point | A presentation | **A piece of work** with an occasion and an output type, chosen up front (can change later) |
| Sources | Added one at a time, each its own way | **One evidence pipeline:** every source kind declares how it is found, read, labeled and checked |
| Export (F-007) | Not started; after editor features | **Early:** PPTX, Google Slides and Word export, so people use OratorStudio with the tools they have |
| Slide editor, presenter, polls | Built and growing | Kept; new work paused until export exists and real use asks for more |
| Audiences | Founder, LLU admins, then faculty, then commercial | **Now:** LLU presenters and students learning research. **Next:** faculty and ministry (Bible study, sermons). Admin reporting later |
| Collaboration | Stage 2 | **Phase 2:** share one piece of work (co-author, reviewer, instructor) |
| Cost | Tracked; limits optional | **Part of the core:** limits per person and course, model per task, caching, a cost estimate shown before expensive steps |
| Quality | Tests per feature | Tests, plus an **evaluation set** run before adding any source and after any prompt or model change |

## The pieces underneath

**1. A piece of work.** One record with: topic, occasion (talk, class, sermon, Bible study, paper), audience, time or length, output type, and its workspace. The output type decides what Build produces and which prompts Shape uses; the workspace is the same for all.

**2. The evidence pipeline.** Every source kind registers four things:

| Step | Research paper | Statistic | Scripture | Ellen White | News |
| --- | --- | --- | --- | --- | --- |
| Find | PubMed, OpenAlex | Data Commons | Theme, words, reference | EGW search | Newsrooms |
| Read | Full text or abstract | Value, place, date | Fetched wording | Fetched paragraph | Snapshot |
| Label | Study design, strength | Agency, date | Version, "Scripture" | Reference, "faith tradition" | "Not peer-reviewed" |
| Check | Quote on page; numbers | Value matches source | Word for word | Word for word | Quote in snapshot; trace to original |

Adding Data Commons, Ellen White or news becomes filling in one row, not building a new screen.

**3. Shape: from facts to message.** Today the message and outline live in Curate's second tab. Making it a clear step (message, points, each point's evidence, gaps) is where output types differ: a study guide needs questions, a paper needs sections, a talk needs a time budget.

**4. Outputs.** Each output is a template over the same outline: slides (existing builder, plus PPTX and Google Slides export), brief (Word and PDF), study guide (questions for observation, interpretation, application; leader notes), paper outline (sections with citations), sermon notes (passages, points, illustrations from the evidence).

**5. People and roles.** Personal spaces stay. Add sharing a piece of work (co-author, reviewer), then courses (instructor, students, learning mode, the research record).

**6. Cost as a feature.** Limits per person and per course; per-task model choice; prompt caching for repeated workspace context; a visible estimate before reading many papers; the usage page for administrators and instructors.

## Phases, each with a finish line

| Phase | Weeks | Work | Done when |
| --- | --- | --- | --- |
| **0. The talk** | Now | Dry run; fix only what breaks | The talk is given from OratorStudio |
| **1. Solid core** | 1–4 | "Piece of work" with output type; Shape as its own step; PPTX export; evidence pipeline with the current sources moved onto it; prompt caching | Five LLU colleagues build and export a real talk without help; cost per talk under $3 |
| **2. Measured quality** | 3–6 | Evaluation set of 25–30 topics with judges; Data Commons statistics on the pipeline | Each field's judges rate discovery useful; the gaps list decides the next sources |
| **3. Students** | 5–10 | Courses, learning mode, research record, paper-outline output; sharing a piece of work | One course pilots it; the instructor can see each student's own work |
| **4. Ministry** | 8–12 | Study guide and sermon outputs; concept study across related words; Ellen White's writings once the Estate agrees | A Bible study leader prepares a study from scratch in OratorStudio |
| **Later** | | Institution layer (licensed databases, commentaries, lexicons), news tier, Engage improvements, commercial plan | Driven by use |

## What this plan asks of the product owner

1. **Agree the center:** Curate first, outputs second, export before more editor features.
2. **Choose the first two audiences:** LLU presenters and students, or another pair.
3. **Name five colleagues** for phase 1, and **one course** for phase 3.
4. **Choose the output types** to support first (suggested: slides and brief, then paper outline, then study guide).
5. **Set cost targets:** per talk, per student paper, per month per person.
6. **Decide on naming:** keep "presentation" for everything, or say "a piece of work" (or "project") with the output chosen inside it.

## What it costs to switch

Little is thrown away. The workspace, checks, Discover, Bible, word study, usage and invitations all carry over. The work is mostly re-plumbing: a small data-model change (output type on the presentation), moving each source onto the pipeline as it's touched, and starting export sooner than planned.
