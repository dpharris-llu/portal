# Product Spec: OratorStudio

Nov 28, 2026 · @DP Harris

*Ideas first. Slides follow.*

*Curate the evidence. Hone your message. Each point backed by evidence, every fact traceable to its source.*

This spec defines OratorStudio, a platform for creating evidence-based presentations: clear about their message, current with what is known, and traceable in every fact. An author starts from a topic, curates the evidence (what they already know, and what discovery finds that they didn't), hones a message and the points that carry it, then builds, presents and engages. It has four modules: **Orator Curate**, **Orator Build**, **Orator Present** and **Orator Engage**. It is built first for one presenter, then LLU admins, then faculty, then sold to other institutions.

## 1. The premise

**The premise.** People who present at a health sciences university want their presentations to be evidence-based. Something is on the calendar: a board meeting, a lecture, grand rounds, a conference talk. The author knows the topic, but may not know what has been published lately, whether guidance has changed, what is underway, or what evidence cuts against their view. OratorStudio helps them find that out, keep what matters, and show where every fact comes from.

**The gap.** Today that work happens outside the presentation tool, if at all: a literature search in one window, notes in another, slides typed by hand, and nothing linking a figure on a slide back to the passage it came from. PowerPoint stores positioned boxes, so a deck can't be checked, restyled, cut to length or navigated live without manual work. AI added to that model writes fluent text that nobody can verify.

**Why OratorStudio is different.** It starts with the evidence, not the slides.
- **Discovery is built in.** From the author's topic, it finds what has been published (systematic reviews, guidelines, the newest studies, ongoing trials, government reports) alongside the sources the author brings.
- **Every fact is traceable.** Each fact keeps the exact passage and page it came from. Quotes are checked word for word, and every number Claude writes is checked against the facts it cites.
- **The author decides.** Claude finds, summarizes, challenges and proposes; nothing enters the presentation unless the author keeps it, and anything can be discarded.
- **Slides come last.** They are drafted from points that each rest on evidence, so a figure on a slide can always be traced back to its source, and changes in the evidence show which slides to review.

**Vision.** A presentation is curated before it is designed. The author gathers evidence from their own sources and from discovery, decides what to keep, and hones a message with points that each rest on checked facts. Slides are then drafted from that outline: design is applied by rules, data stays live and sourced, and the presenter can go anywhere in the material in seconds.

**Design principles**

1. **Evidence first.** Curate before you design: the message and points rest on checked facts before any slide exists.
2. **Content first.** Authors edit meaning; layout follows.
3. **AI proposes, people decide.** Every AI change is visible, reversible, and labeled.
4. **Every fact is traceable.** Any fact or figure can show where it came from and when it was last checked.
5. **The presenter stays in control.** Presenting works offline and degrades gracefully; nothing reaches the screen without the presenter's say.
6. **Escape hatch always.** Freeform placement exists for the one arrow that must go exactly there.
7. **No lock-in.** Open file format, strong PPTX import and export.

**Working assumptions (please correct)**

- LLU means Loma Linda University Health. Version .3 uses Magic Link login; Entra ID single sign-on comes in a later stage.
- The product is browser-based, built on Vercel and Supabase, with an offline presenting mode and no desktop install. It is built with AI-assisted coding (Claude Code).
- AI runs through a hosted model API at first, with a private-deployment option designed in for sensitive data.
- LLU will own the product. A written agreement covering ownership and any future commercial sale is needed before external customers (see section 13).

**Rollout stages**

| Stage | Audience | Goal | Exit criterion |
| --- | --- | --- | --- |
| 0 | The founder | Create the founder's own presentations evidence-first, in place of PowerPoint | The founder gives a presentation from it weekly for 8 weeks without reopening PowerPoint |
| 1 | LLU admins | Evidence-based leadership and board presentations, every number traceable | 5 admins each give 3 real presentations from it and prefer it to PowerPoint |
| 2 | Faculty | Lectures that reflect current evidence; handouts and accessible course material | 20 faculty, 80% of imported legacy decks usable without manual repair |
| 3 | External customers | Sell to higher ed and health sciences | First paid site license; security review passed |

Stage 0 is version .3. Out of scope for now: pricing, billing, and site licensing.

## 2. The author's journey

**Topic → evidence (yours and discovered) → what is known → message → points → outline → slides → delivery.**

1. **Start with a topic, not a position (F-019).** "Walking programs for adults with type 2 diabetes." The occasion is optional: audience, time, and what should happen.
2. **Gather evidence from two streams into one workspace.**
   - **Known sources, the author's own:** papers they rely on, institutional reports and data, facts they know firsthand. Marked as theirs.
   - **Unknown sources, found by discovery (F-020):** the current landscape, strongest evidence first (systematic reviews, meta-analyses, guidelines), then the newest studies, ongoing trials and government reports. Each result shows its date and a summary; the author adds the ones that matter.
   - Every source gets an id (S1, S2…) and every fact one too (F1, F2…). A fact is **checked** (its quote verified against the source) or **unchecked** (the author's own note).
3. **Make sense of it (F-021).** A discovery summary, written from the workspace only and citing its facts: what is **established**, what is **new** (including where a discovered source supersedes one of the author's), what is **contested**, and what is **unknown**, each unknown with a search for it. The author probes with follow-up questions (F-118), asks the system to **challenge** their view (F-022), follows a paper to the newer work that cites it (F-023), and discards whatever doesn't belong.
4. **Choose the message (F-024).** With the landscape known, the system offers two or three candidate messages grounded in the facts. The author picks, edits or writes their own. The message is the one sentence everything supports.
5. **Build the points that carry it (F-024).** Proposed points, each tied to its facts. Weak support and objections are flagged; an objection is answered with evidence or moved to "What we don't know yet".
6. **The outline.** Message, points in order with their evidence, what we don't know yet, recommendation and next steps, and a time check against the occasion. Approved, it goes to Build; later changes show which slides to review.

The two halves of Curate loop rather than run once: a weak point sends the author back to discovery, and a challenge can change the message. So they share one workspace, shown as two steps: **1. Evidence** and **2. Message and outline**. An author who already knows their evidence can start at step 2.

## 3. Modules

OratorStudio is one product with four modules. They share one sign-in, one store of sources and media, and one model of the presentation; a module is an area of the app, not a separate product. Each can be developed and released on its own schedule.

| Module | Job | What is in it |
| --- | --- | --- |
| **Orator Curate** | Discover what is known, decide what to keep, and hone the message | The topic; the workspace of sources (the author's own and those found by discovery) and checked facts; the discovery summary; probes; the message, points and outline; the written brief |
| **Orator Build** | Turn the outline into slides | Slide drafting from the outline; structured editor; themes and layout; PPTX import; deck checks (consistency, accessibility); setting and fitting to a time limit; variants; point-level review and approval; slide images, including AI-generated illustrations |
| **Orator Present** | Deliver it | Present mode and presenter view; search and voice jump; backup slides; rehearsal timer; offline package; PPTX, PDF and HTML export |
| **Orator Engage** | Involve the audience | Live sessions and join codes; polls; moderated Q&A; question-to-slide matching; Q&A on a published deck; Canvas publishing |

**Shared platform (not a module).** Sign-in, institutions and roles; the LLU brand theme (stored here, applied in Build); storage of presentations, sources and snapshots; sensitivity labels; the media library; AI provider settings, API keys and usage tracking; audit log.

**Why "curate."** A curator judges what matters, keeps the best, sets the rest aside, and arranges what is kept into something coherent for an audience. That is the author's job in the first module, and it matches how the system works: it finds and checks; the author chooses (design principle 3). Discovery is the headline action inside Curate, not its name.


**Boundaries decided so far**

- **The presentation is the thing the author makes (F-025).** It holds its topic and occasion, its curation (sources, facts, probes, message, points) and its slides. Today the outline and the deck are stored as two linked objects; F-025 joins them under one presentation.
- **Curate is a workspace you question.** The author builds the case by discovering, asking, accepting and discarding, one step at a time (F-118, F-119, F-020, F-021, F-022, F-023, F-024).
- **Slides belong in Build.** Splitting or merging points into slides, choosing charts, quotes and layouts, and the time limit (which shapes slides more than the outline) are Build's.
- **PPTX import is in Build**, since an existing deck is a starting point for slides. An imported deck can be sent back to Curate to pull out its message and points and check them against sources (F-117).
- **Images go where their role is.** A slide image (photo, logo, illustration) is added in Build. An image used as evidence (a figure from a paper, a dashboard screenshot, a scanned table) is added in Curate with its source. Both live in one media library (F-017).
- **Exports follow what is exported.** Present exports slides (PPTX, PDF, HTML). Curate exports the outline as a written brief. Pre-read and handout variants are made in Build and exported through Present.
- **Engage is separate from Present**, so audience features can ship on their own schedule.

**Words used in this spec**

| Word | Meaning |
| --- | --- |
| Presentation | What the author makes: topic, occasion, curation and slides |
| Topic | What the presentation is about, before any position is taken |
| Source | Something evidence comes from: a paper, report, registry record, document, data URL or the author's note. Id S1, S2… |
| Fact | One statement taken from a source, with its quote and location where there is one; checked or unchecked. Id F1, F2… |
| Discovery | Finding sources the author didn't have, from named scientific and government databases (F-119, F-020, F-023) |
| Probe | A question the author asks of the workspace; the checked answer may propose changes (F-118) |
| Message | The one sentence the presentation supports (formerly "thesis") |
| Point | One step that carries the message, backed by facts; becomes a slide's headline |
| Outline | Message, points with evidence, what we don't know yet, recommendation and next steps (formerly "the argument") |
| Brief | The outline written out as a document |

In the code and database, the outline is still stored as `argument` and `argument_ops`, the message as `thesis`, and the module's pages live under `/research`. These internal names are invisible to authors.

## 4. Users and use cases

Each stage adds a user type with different needs. Admin features are not assumed to carry over to faculty.

| User | Typical presentation | Top needs | What evidence-based means to them |
| --- | --- | --- | --- |
| The founder-presenter | Talks, leadership briefings, internal updates | Fast authoring, live Q&A navigation, import of existing decks | Talks grounded in the current evidence, without losing years of existing content |
| LLU admin | Board, budget, enrollment and accreditation presentations | Correct numbers, consistent brand, quick review and approval | Every number in a board deck traceable to its source |
| Faculty | Lectures, grand rounds, conference talks | Legacy import, handouts, accessibility, image attribution | Lectures that reflect the latest research, without rebuilding hundreds of slides |
| Student / audience | Viewing a deck or handout | Readable, accessible, searchable material | Material they can check, with sources they can follow |
| Student as researcher | A research paper or class presentation, in a course | To learn to find, read, judge and cite evidence themselves, with feedback | Every fact read, summarized and quoted by the student, with a record the instructor can see |
| Institutional buyer (IT, compliance, procurement) | N/A | SSO, audit trail, privacy, accessibility compliance | An audit trail for every fact and AI suggestion, with data kept within the institution |

**Primary use cases, in the order of the journey**

1. Start a presentation from a topic and discover the current evidence: strongest first, then the newest studies, ongoing trials and government reports.
2. Bring your own evidence into the same workspace: monthly reports as PDFs (figures lined up into sourced charts), data from a URL, research papers (read and quote-checked), and facts you know firsthand.
3. Ask questions of the evidence, summarize what is established, new, contested and unknown, challenge your own message, and discard what doesn't belong.
4. Choose a message and the points that carry it, each backed by checked facts, and export the outline as a written brief.
5. Build slides from the outline, fitted to the time; when the outline changes, see which slides to review.
6. Import an existing PowerPoint deck and continue from it, and send it to Curate to check its claims against sources.
7. Generate a 5-minute, 45-minute and pre-read version from one presentation.
8. Present live and jump to any slide by voice or search during Q&A.
9. Run live polls and moderated audience Q&A from phones, and jump to the slide that answers each question.
10. Review a colleague's changes point by point and approve or reject each.
11. Publish a lecture as slides, a handout and an accessible study guide, and let viewers ask questions answered only from its evidence.
12. Add images once to a shared library, as slide images or as evidence with their source.
13. Learn to research: in a course set to learning mode, a student discovers sources, reads them, writes each fact with its quote and page, and builds the message, with Claude as coach rather than reader; the instructor sees the record of the student's own work (F-209, F-210).
## 5. The presentation model

The model follows the journey: a presentation holds its curation (where the evidence lives) and its slides (where the design lives). Keeping the two apart, and linked, is what separates this product from a PowerPoint with an AI sidebar.

| Concept | Definition | Why it matters |
| --- | --- | --- |
| Presentation | What the author makes: topic, occasion, its curation and its slides (F-025) | One thing for the author to think about, from first search to delivery |
| Outline | Made in Curate: the message, points in order with their evidence (checked facts, figures, evidence images) or marked unsupported, what we don't know yet, a recommendation and next steps | Separates what you'll say from how the slides look; one outline can feed several slide versions or a brief |
| Topic and occasion | What the presentation is about, and optionally who it is for, what should happen and how long it runs | Discovery starts from the topic; the occasion shapes the message and the time fit |
| Probe | A question the author asks of the workspace; the answer cites facts and may propose changes the author accepts or dismisses | The case is built step by step, with a record of how |
| Slides (deck) | Made in Build, usually from the outline: an ordered narrative plus a pool of backup material, with a time budget | Enables multiple versions and non-linear delivery |
| Slide | One point as its headline, the evidence blocks under it, and a presenter intent (inform, persuade, decide) | Layout can be regenerated without losing meaning |
| Block | A typed unit of content: text, figure, chart, table, image, quote, equation, diagram | Each type has its own accessibility and review rules |
| Layout | A rule-based arrangement chosen from the slide's blocks and the active theme | No manual nudging; overridable per slide |
| Theme (design tokens) | Colors, type, spacing, logo rules, contrast minimums, owned by the institution | Brand and accessibility are enforced, not checked |
| Source | Something a presentation draws on: a record found by discovery (paper, report, registry entry), an uploaded file, a web page, a data URL (JSON, XML or CSV), an MCP connector, or the author's own note. Marked as the author's own or discovered; every fetch is kept as a dated snapshot | Every claim and number traces to exactly what was read, and when |
| Data source | Figures taken from sources (a document's page, a data field) and lined up into rows, each confirmed by a person before use | Recurring reports become decks without retyping, and every number stays traceable |
| Data binding | A link from a chart or number to confirmed figures in a data source, with a refresh rule (manual, or scheduled for URL sources) | Live figures and stale-number warnings |
| Fact | A statement taken from a source with its exact quote and location (checked), or the author's own note (unchecked); confirmed by the author before use | Points cite only what the sources say |
| Media item | An image in the shared library, with its role (slide image or evidence), alt text, rights and, for evidence, its source | One upload serves both modules; decoration is never mistaken for evidence |
| Provenance record | Source, retrieval time, transformation, and approver for any bound figure or cited claim | Auditability for board and accreditation use |
| Variant | A saved view of a presentation's slides: which slides, what depth, what length, what language | One source, many outputs |
| Freeform region | A slide area exempt from layout rules, with absolute positioning | The escape hatch |

**Rules of the model**

- A slide may be freeform in part, but the model still records its point and evidence so search, review, and variants keep working.
- Edits by AI and by people are stored as operations with author, time, and reason, which powers history and point-level diffs.
- A theme change never alters content, and a content change never breaks a theme.

## 6. Functional requirements

Priority: **P0** = required for that stage to ship, **P1** = should have, **P2** = later. IDs are stable so they can be referenced in tickets. The module column says where each requirement lives (section 3).

### Stage 0: you (MVP)

Grouped by the step of the journey they serve (section 2). Stage 0 requirements numbered F-1xx were added later; their numbers are kept so tickets stay valid.

**Start: topic and occasion**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-019 | Curate | Start a presentation from a topic: the topic is required, the occasion (audience, time, what should happen) optional; no message is needed to begin | P0 |
| F-001 | Curate | Superseded by F-019: the topic comes first. The occasion (purpose, audience, and optionally a key takeaway) is set after it, when the author is ready; the time limit is set in Build | P1 |

**Evidence: discovery**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-020 | Curate | Discover: from the topic, build the current landscape from named databases (F-119): systematic reviews, meta-analyses and guidelines first, then the newest studies, ongoing trials and government reports, with dates prominent. Each result is a candidate until the author adds it. Sources the author brings are marked as theirs; discovered ones as discovered | P0 |
| F-119 | Curate | Find sources: search named scientific and government databases from the workspace. PubMed at the NIH (journal articles, including CDC's MMWR) with open-access full text from PubMed Central; Europe PMC alongside for NCBI Bookshelf government reports and preprints; and ClinicalTrials.gov. PubMed comes first because it answers fast (about 0.1 s from the host, against about 8 s for Europe PMC). Claude may write the search from the author's words; the author sees and can edit it. Results show access (free full text, abstract only, or registry record). Nothing is added unless the author chooses it; added sources are read and checked like uploads (open-access full text by section; otherwise the abstract, labeled as such; trials as their registry record), or, without Claude, the author ticks sentences to keep word for word. A probe that finds a gap can propose a search | P0 |
| F-023 | Curate | Follow a thread: from a source, find newer work that cites it or is closely related, as candidates | P1 |
| F-121 | Curate | Source catalog and selection: one curated list of searchable sources (spec 10, Source scope), each with its kind of evidence, owner, coverage, access and status (live or planned); the author chooses per presentation which live sources Discover searches, and the choice is saved with the presentation. Each Discover run is kept as a search record (sources, searches, who wrote them, date, counts) | P0 |
| F-122 | Curate | Claude proposes where to search: from the topic, Claude chooses which catalog sources fit, with a one-line reason for each, and writes the searches (PubMed syntax, and plain keywords for the others). The author's own choice, once made, always wins; Claude's reasons stay visible beside each source | P0 |
| F-123 | Curate | Bible quotations: look up a passage by reference in the author's chosen version (NIV, NKJV, NLT through API.Bible; public-domain versions freely), quoted word for word with the version on every quotation and the publisher's copyright notice on the references slide, under API.Bible's terms (non-commercial, usage reporting, 30-day refresh). The Passion Translation is entered by the author and labeled as a paraphrase entered by the author | P1 |
| F-124 | Curate | Ellen G. White's writings: search and quote her published writings through the White Estate's EGW Writings API, each quotation with its standard reference (book, page, paragraph) and checked word for word; brief quotations under the Estate's fair-use terms | P1 |
| F-125 | Curate | Adventist news and records: official and regional Adventist news as news (labeled, traced to the original statement), and church statistics and history from the Office of Archives, Statistics and Research, the Encyclopedia of Seventh-day Adventists and the Adventist Digital Library | P2 |
| F-120 | Curate | Keep watching: re-run a presentation's discovery searches on request or on a schedule, and flag sources published since the last look, so a presentation given again is still current | P2 |

**Evidence: the author's own sources**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-012 | Curate | Start from documents: read labeled figures from text-based PDFs in the browser, line them up across documents, let the author correct and confirm them as a data source; Build drafts bound charts from it (section 10) | P1 |
| F-014 | Curate | Data URL sources: fetch JSON, XML or CSV from a URL on the institution's allowed list, map fields to rows (Claude may propose the mapping), confirm them, keep a dated snapshot, and refresh on demand with changes shown (section 10) | P1 |
| F-015 | Curate | Start from research papers: Claude reads each uploaded paper for its citation, design, sample, findings and limitations, each with an exact quote and page that OratorStudio checks against the PDF; the author confirms findings; Claude analyzes across the papers for the presentation's purpose, citing only confirmed findings; decks drafted from it carry numbered references, quotes and a backup slide per paper (sections 9 and 10) The cross-paper analysis is a proposal: its findings become facts in the workspace and its message and points join the candidate messages (F-024); slides are drafted only from the outline the author approves. | P1 |

**Making sense: the workspace**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-118 | Curate | Curate workspace with probes: each presentation has one workspace of sources (papers, documents, data, the author's notes) and the facts confirmed from them, with short ids (S2, F7). The author builds the case by asking successive questions; Claude answers from the active facts only, citing them, with the earlier questions as context, and proposes changes (add a point, link evidence, change the message, add an open question, discard a source or fact). The author accepts or dismisses each one. Answers and proposals are checked: citations must be active facts, and every number must appear in the facts cited. When the author discards a source or fact, by button or by asking, it is taken off every point, never sent to Claude again, and kept on record with the reason; it can be restored or undone | P0 |
| F-021 | Curate | Discovery summary: from the workspace's active facts only, what is established, what is new (including where a discovered source supersedes one of the author's), what is contested and what is unknown, each statement citing its facts and checked like a probe answer; each unknown offers a search | P0 |
| F-022 | Curate | Challenge me: find and summarize evidence against the direction the author is leaning (the message or a point), so the presentation is tested before it is given | P1 |
| F-013 | Curate | Claude analyzes confirmed figures for the presentation's purpose and against comparisons the author supplies (a budget, a target, last year, a normal). The result is an analysis, not a summary: a message, points with evidence, why each matters, possible drivers and confidence, then a recommendation and next steps. Every number carries a formula the app recomputes, and anything that doesn't check is left out; Claude's general knowledge is labeled and kept to speaker notes. Without Claude, computed checks and patterns still run. Details in section 10 Its message and points are proposals: they join the workspace and the candidate messages (F-024), and slides are drafted only from the outline the author approves. | P1 |

**Message and outline**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-024 | Curate | Message and points: the system offers two or three candidate messages and the points that would carry each, every point tied to facts; weak support and objections are flagged; the author picks, edits or writes their own. Replaces the template-first outline of F-002 when the workspace has facts | P0 |
| F-002 | Curate | Superseded in part by F-024 when the workspace has facts; still used to start with no sources. Outline: the author writes, reorders and nests points, with or without sources; Claude may propose an outline or more points; evidence is attached per point, and a point with none is marked unsupported; the author approves before slides are drafted | P0 |
| F-016 | Curate | Save the outline (message, points, evidence, open questions, recommendation, next steps) as Curate's output and Build's input; one outline can feed several slide versions; export it as a written brief (DOCX or Markdown) | P1 |

**Build**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-003 | Build | Set the time limit and draft slides from the outline with theme-driven automatic layout, fitted to that limit; changes to the outline show which slides they affect | P0 |
| F-004 | Build | Edit content in a structured editor; layout reflows on every change | P0 |
| F-005 | Build | Freeform region on any slide | P0 |
| F-006 | Build | Import PPTX into the semantic model (basic: text, images, tables, notes; everything else kept as an image or freeform region), with a report of what could not be converted | P0 |
| F-010 | Build | One theme, with contrast and alt-text checks | P1 |

**Present**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-007 | Present | Export PPTX and PDF | P0 |
| F-008 | Present | Non-linear live mode: search and voice jump, return-to-place (section 7) | P0 |
| F-009 | Present | Offline presenting from a downloaded deck | P0 |
| F-011 | Present | Speaker notes and rehearsal timer | P1 |

**Platform**

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-018 | Platform | Magic Link sign-in, one institution, author role | P0 |
| F-025 | Platform | The presentation as one object: topic, occasion, curation (sources, facts, probes, outline) and its slides together, in one list ("Your presentations"), opening in the module last used. Replaces the separate outline and deck lists | P1 |
| F-017 | Platform | Shared media library: upload an image once; each image is a slide image or evidence; evidence images keep their source and date; alt text and rights travel with the image | P1 |

**Engage**

The audience response features in section 8 (A-01 to A-05 are P0 for version .3).

### Stage 1: LLU admins

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-101 | Curate | Data bindings to uploaded Excel and CSV files, document sources (F-012) and data URL sources (F-014), with manual or scheduled refresh; adding the next period's document to a source updates its charts; direct SQL and SharePoint deferred | P0 |
| F-102 | Curate | Provenance panel on every bound number; stale-figure warnings | P0 |
| F-103 | Build | Cross-slide consistency check: flags the same metric with different values | P0 |
| F-104 | Build | Institutional themes with enforced brand rules; department sub-themes | P0 |
| F-105 | Build | Variants: exec summary, full deck, pre-read document | P0 |
| F-106 | Build | Point-level review: comments, suggested edits, approvals, change summary since last view | P0 |
| F-107 | Platform | Roles (author, reviewer, approver, admin), audit log; Entra ID SSO deferred to Stage 3 | P0 |
| F-108 | Platform | Sensitivity labels on decks and slides; restrict AI and sharing by label | P1 |
| F-109 | Present | Predicted hard questions with draft answers grounded in the presentation's evidence | P1 |
| F-110 | Platform | Teams and Outlook integration for sharing and scheduling | P2 |
| F-111 | Curate | Document sources, extended: scanned PDFs (OCR), saved layouts for recurring report types, Excel and CSV in the same review grid, and Word documents read like PDFs. (A PowerPoint deck is imported in Build, F-006, and can be sent to Curate, F-117) | P1 |
| F-112 | Curate | Web page sources: fetch a page, keep a dated snapshot of its readable text, and let Claude propose claims and figures with citations to passages, each confirmed by the author before use | P1 |
| F-113 | Curate | MCP connectors: an institution admin adds a connector once (address and sign-in); authors pick it as a source; the app, not Claude, calls its tools and records every response as a snapshot | P1 |
| F-114 | Platform | AI keys and usage: per-person keys assigned by the institution, or one institutional key with usage tracked per person; budgets and alerts by person and department; the institution chooses the AI and image providers. Version .3: every server request to Claude is recorded (person, presentation, task, model, tokens, estimated cost) and shown on the usage page, with an optional monthly limit | P1 |
| F-115 | Curate | Evidence images: Claude reads an evidence image for figures or points; each is checked and confirmed by the author before use, and labeled as read from an image (weaker checking than PDF text) | P1 |
| F-116 | Build | AI-generated illustrations through an image provider set per institution (Azure OpenAI expected by default; Google Imagen or a self-hosted model possible); labeled as AI-generated and kept in history; illustration only, with images that look like clinical or data evidence blocked or flagged; prompts never include patient or student information | P1 |
| F-117 | Build | Send an imported deck to Curate: pull out its message, points and figures, and check them against sources | P2 |

### Stage 2: faculty

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-201 | Build | Bulk PPTX import with quality scoring and a repair queue | P0 |
| F-202 | Build | Lecture-to-handout and study-guide generation | P0 |
| F-203 | Build | Automatic accessibility remediation (alt text suggestions, reading order, captions, contrast), with WCAG 2.1 AA as the target | P0 |
| F-204 | Platform | Image rights and attribution tracking per figure, with reuse warnings | P0 |
| F-205 | Engage | Canvas publishing via LTI 1.3 (LLU uses Canvas); other LMSs later | P1 |
| F-206 | Engage | Student-facing Q&A grounded only in the published deck, with citations to slides | P1 |
| F-207 | Build | Medical and scientific content blocks: structured citations, units, equations, anatomical image handling | P1 |
| F-208 | Present | Live captions and slide-synced transcripts | P2 |
| F-209 | Curate | Learning mode, for teaching students to research. The instructor sets it per course; students in that course can't turn it off. Discovery works as usual and shows its search with a short explanation of why it was built that way (terms, synonyms, AND and OR), or the student writes the search and Claude critiques it. Results are links (through the library's access, so paywalled papers open when the institution subscribes). Claude does not read papers or propose facts: the student reads each source and writes each fact in their own words with the quote and page, and the app checks that the quote is on that page (no AI needed). Claude coaches on request instead of answering: whether a summary matches its quote, how strong a study is, what would contradict the message, whether a point is supported. The student writes the message, points and outline. The instructor chooses how strict: coaching only, or Claude's reading unlocked for a source after the student has written their own summary of it, to compare | P0 |
| F-210 | Curate | Research record for instructors: from the operation log, show per student and presentation what the student wrote and what Claude contributed (searches, facts, summaries, coaching asked for and given), the sources found, read and discarded, and when. Shared with the instructor by the student's enrollment in the course; exportable with the submitted work | P0 |

### Stage 3: commercial

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| F-301 | Platform | Multi-tenant isolation, per-tenant themes, admin console | P0 |
| F-302 | Platform | Billing and site-license management (out of scope until Stage 3 is planned) | P0 |
| F-303 | Platform | Self-serve tenant onboarding with SSO and SCIM provisioning | P1 |
| F-304 | Platform | Public API and MCP server for generating and updating decks | P1 |
| F-305 | Platform | Template and theme marketplace or sharing between tenants | P2 |
| F-306 | Platform | Usage analytics for administrators (adoption, accessibility pass rate) | P2 |

## 7. Orator Present: live presenting and non-linear mode

The presenter can jump to any slide by voice or search, check it privately, then show it, and return to the main narrative in one action.

| ID | Module | Requirement | Priority |
| --- | --- | --- | --- |
| L-01 | Present | Command bar (Cmd/Ctrl+K) searches all slides, including backups, by title, content, notes, and data labels, with thumbnails | P0 |
| L-02 | Present | Semantic matching: a query like "why are students leaving" finds the attrition slide without the word attrition | P0 |
| L-03 | Present | Voice command to jump, such as "show me churn by cohort" | P1 |
| L-04 | Present | Presenter-only preview: the match appears on the presenter screen first; one key sends it to the audience | P0 |
| L-05 | Present | Return-to-place: a single action restores the prior main-narrative slide | P0 |
| L-06 | Present | Slides can be marked never-show-on-voice or require-confirmation (confidential figures) | P0 |
| L-07 | Present | Context repair: if a jumped-to slide depends on a skipped concept, show a one-line reminder to the presenter | P1 |
| L-08 | Present | Timer distinguishes planned detours from running over; notes and captions follow the presenter | P1 |
| L-09 | Present | Top 3 matches always shown for ambiguous queries; never auto-advance on low confidence | P0 |
| L-10 | Present | Works offline: search index and slides are cached locally before the session | P0 |

**Performance targets.** Search results appear in under 300 ms. Voice-to-preview takes under 2 s. Local matching must work with no network; voice transcription may use a cloud service when online and falls back to typed search when offline.

**Failure behavior.** If voice recognition or matching fails, the audience screen never changes. The presenter sees the failure and falls back to the command bar.

## 8. Orator Engage: audience response

Audience members join from a phone and respond to the slide in front of them. The presenter stays in control, and slides never depend on the audience channel.

| ID | Requirement | Priority | Version |
| --- | --- | --- | --- |
| A-01 | Join by QR code or short code in a phone browser; no account, anonymous by default | P0 | .3 |
| A-02 | Live polls: multiple choice, rating scale, ranking, short text, word cloud | P0 | .3 |
| A-03 | Poll results render as a chart block on the slide, live | P0 | .3 |
| A-04 | Audience Q&A with upvoting and a presenter moderation queue; nothing shows to the room until approved | P0 | .3 |
| A-05 | Question-to-slide matching: each question is matched to the best slide, including backups, with a one-click jump (uses the search from section 7) | P0 | .3 |
| A-06 | Pace signals ("too fast", "lost me") shown only to the presenter, tied to the current slide | P1 | .3 |
| A-07 | AI help, always presenter-approved: merge duplicate questions, summarize open text into themes, suggest a follow-up poll, flag inappropriate submissions | P1 | .3 |
| A-08 | Per-slide results report, CSV export, and responses saved with the deck for next time | P1 | .3 |
| A-09 | Quizzes with correct answers; optional identified responses | P1 | Stage 2 |
| A-10 | Canvas grade passback and attendance (LTI 1.3) | P1 | Stage 2 |
| A-11 | Session controls: open and close polling, lock the room, set a response limit | P1 | .3 |
| A-12 | Remote viewers can respond during Teams or Zoom sessions with the same code | P2 | Stage 1 |
| A-13 | Audience path: a link that lets remote viewers browse the deck on their own (was L-11) | P2 | Stage 1 |

**Rules**

1. **Privacy.** Responses are anonymous unless the presenter turns on identified mode. Identified data carries a retention limit and is treated as a student record under FERPA.
2. **Moderation.** All free-text goes through the queue, plus a profanity and abuse filter. A filter alone is not enough.
3. **Abuse control.** One response per device per poll by default, rate limits on submissions, and a rotating join code per session.
4. **Reliability.** If the realtime service drops, slides and notes keep working. The presenter sees a status indicator and can continue without audience features.
5. **Capacity target.** At least 300 simultaneous participants in one session for the first release. Revise after load testing.
6. **Accessibility.** The audience page meets WCAG 2.1 AA, works with screen readers, and does not rely on color alone.

## 9. AI capabilities and guardrails

AI is used where it saves real effort, and always as a proposal the user can inspect and undo.

| Capability | What it does | Human control |
| --- | --- | --- |
| Discovery and outline (Curate) | Builds the discovery landscape and summary, then proposes candidate messages and points from the workspace's facts (F-020, F-021, F-024) | Author edits and approves before slides exist |
| Finding sources (Curate) | Writes database searches from the author's words; reads added records for findings (F-119) | Author edits the search and picks every result; quotes checked against the record |
| Probing the workspace (Curate) | Answers the author's successive questions from the workspace's active facts and proposes changes to the outline (F-118) | Citations and numbers checked; each proposal accepted or dismissed; discards only on the author's word |
| Reading research papers (Curate) | Pulls each paper's findings and limitations with quotes and pages, then analyzes across papers for the presentation's purpose (F-015) | Quotes and numbers checked against the PDF; author confirms each finding; points that fail checks are left out |
| Slide drafting (Build) | Turns the outline's points into slide headlines, evidence blocks and layout, fitted to the time limit | Shown as a diff; accept, edit, or reject |
| Consistency and evidence checks (Build) | Finds conflicting numbers, unsupported points, stale data | Warnings only; never silently changes content |
| Variant generation | Cuts a deck to a target length or depth | Preview before saving; original untouched |
| Accessibility remediation | Suggests alt text, reading order, caption fixes | Per-item accept; flagged as AI-generated |
| Q&A prediction (Present) | Drafts likely questions and answers from the deck's own evidence | Answers cite slides; presenter edits |
| Semantic search and voice | Matches spoken or typed queries to slides | Presenter preview before audience sees it |
| Illustrations (Build) | Generates images from a prompt through the institution's image provider (F-116) | Illustration only; labeled as AI-generated; clinical- or data-looking images blocked or flagged |
| Viewer Q&A (Engage) | Answers viewer questions from a published deck | Restricted to deck content; shows source slides; says "not covered" otherwise |
| Coaching (Curate, learning mode) | Asks the student questions about their own summaries, the strength of their evidence and their message; critiques their search (F-209) | Never reads sources or writes facts, points or the message for the student; every exchange is in the research record (F-210) |

**Guardrails**

1. **Labeling.** AI-written text and images carry a visible provenance flag in the editor, and the flag persists in history and export metadata.
2. **No invented numbers.** AI may not generate a figure unless it comes from a bound source, a confirmed document figure, or user input. Unsourced figures are blocked or marked.
3. **Grounding.** Viewer Q&A and predicted answers retrieve only from the deck and its cited sources.
4. **Data handling.** Customer content is never used for model training. Sensitivity labels control which content may be sent to a hosted model. A private-model path is available for restricted data.
5. **Reversibility.** Every AI operation is an undoable step in history.
6. **Confirmed extraction.** Figures read from documents are never used until a person confirms them. Each keeps its document and page, and a value the author typed is labeled as typed.
7. **Quoted evidence (F-015).** Every finding Claude takes from a research paper carries an exact quote and page.
   - A finding is usable only if its quote appears word for word on that page and every number in it is printed there. A page number off by one is corrected.
   - A finding is used only after the author confirms it.
   - Each point of the outline must cite confirmed findings. A point with a number that is not in the findings it cites is left out.
   - Each point states how strong and how consistent the evidence is and what it does not cover. Claude's general knowledge is labeled and kept to speaker notes, as in F-013.
8. **Images are not evidence unless sourced.** AI-generated images are illustrations, labeled as such, and never shown as patients, scans, results or data. Evidence images carry their source, and anything read from them is confirmed before use.
9. **Only the author's sources, found in named databases.** AI reads only the sources the author added to the presentation. There is no open web search: Find sources (F-119) searches named scientific and government databases from the source catalog (F-121: PubMed and PubMed Central at the NIH; OpenAlex for every field; Europe PMC for NCBI Bookshelf reports and preprints; ClinicalTrials.gov), and a result enters the workspace only when the author adds it, after which it is read and checked like any source. URL fetches go only to hosts on the institution's allowed list.

**Evaluation.** Each AI capability has a test set built from real LLU decks (with permission). Targets for the first release: at least 90% of AI-proposed outlines accepted with minor edits, under 1% of drafted slides containing an unsupported figure, and search top-3 recall of at least 95% on a labeled query set. These targets are starting points to revise after the first measurements.

## 10. Sources, import, export and interoperability

In the order of the journey: the sources a presentation draws on (found by discovery, or brought by the author) are in Orator Curate; PPTX import is in Orator Build; exports are in Orator Present.

**Discovery (F-019, F-020, F-119)**

- From the topic, the server searches named databases only, at fixed endpoints: PubMed and PubMed Central at the NIH (journal articles, including CDC's MMWR, and free full texts), ClinicalTrials.gov (registered and ongoing studies), and Europe PMC for NCBI Bookshelf government reports and preprints. PubMed comes first because it answers fastest from the host.
- The landscape has four parts: strongest evidence (systematic reviews, meta-analyses, guidelines, newest first), the newest primary studies, ongoing trials, and government reports. A result appears once, in the first part it fits.
- Claude may write the PubMed search from the topic; it is shown and editable. Without Claude, the topic's words are searched as typed.
- Each result shows its date and how much can be read: free full text (read by section, with quotes checked against the text), abstract only (labeled wherever it is used), the registry record, or a link only (no abstract available: the author opens it and uploads the PDF). Nothing enters the workspace until the author adds it.
- Which databases are searched is decided in layers, below (F-121, F-122). OpenAlex adds a fifth part, research in all fields, when chosen.

**Source scope: which databases, and who decides (F-121, F-122)**

OratorStudio serves presenters on any topic, so the question is not which databases a topic needs but which kinds of evidence presenters rely on, and the smallest set of sources that covers them. Each kind gets one general source that works for almost any topic; specialist sources are added only where real use shows the general one falls short.

| Kind of evidence | Example point it supports | General source | Status |
| --- | --- | --- | --- |
| Research findings | "Coached walking lowered HbA1c 0.5 points" | PubMed (biomedical depth); OpenAlex (every field) | Live |
| Statistics | "1 in 10 adults in California has diabetes" | Data Commons (Census, CDC, BLS, WHO, World Bank) | Planned |
| Guidance and standards | "The USPSTF recommends screening from age 35" | NCBI Bookshelf; guidelines through PubMed; Federal Register for rules | Bookshelf live; Federal Register planned |
| Work underway | "Three trials are recruiting now" | ClinicalTrials.gov; NIH RePORTER later | Live (clinical) |
| News and announcements | "The FDA approved this last month" | Government newsrooms (NIH, CDC, FDA, CMS, WHO), EurekAlert!, KFF Health News | Planned |
| The institution's own | "Our readmissions rose 12%" | Uploads and data URLs; institutional connectors later (F-113) | Live |
| Scripture and faith tradition | "Jesus healed on the Sabbath (Mark 3:1–5)"; "Ellen White wrote that…" | The Bible through API.Bible (NIV, NKJV, NLT); Ellen G. White's writings through the White Estate's EGW Writings API; Adventist news and records | Planned (F-123, F-124, F-125) |

*The admission rule.* A database enters the catalog only if it passes all six:

1. **Authority:** scientific, governmental or peer-reviewed. No open web, no social media.
2. **Verifiability:** every record has a stable id, a date and quotable text, so the checks work.
3. **Access:** a documented API whose terms allow this use, with workable rate limits.
4. **Coverage gain:** it adds evidence the catalog misses, not duplicates.
5. **Cost and upkeep:** licensing, keys, how often the API changes.
6. **Privacy:** search terms leave the institution; acceptable for the topics people search.

A source that fails 1 or 2 is out however popular. Licensed library databases (Scopus, CINAHL, Web of Science) pass 1 and 2 but need the institution's subscriptions, so they belong to the institution layer.

*Three layers decide what is searched.*

| Layer | Who | Decides |
| --- | --- | --- |
| 1. The catalog | The product owner and the developer | Which sources OratorStudio can search at all, by the admission rule. Kept in one list in code (`src/find/catalog.ts`): name, owner, kind of evidence, coverage, access, status |
| 2. The institution (later) | An institution administrator | Which catalog sources are on for the institution, plus what it licenses (library databases, a wire service) |
| 3. The presentation | The author | Which sources to search for this topic. Claude proposes a choice per topic with a one-line reason for each source; the author ticks and unticks from there, and the choice is saved with the presentation |

*News is a different kind of evidence.* A news story is usually secondary: it reports a study, a policy or an event. News comes in labeled "News, not peer-reviewed", is used for context and as a lead, and each news fact offers "Find the original study" so the point cites the primary source. Free, authoritative sources first; AP or Reuters only under a license the institution already holds; GDELT later for broad coverage.

*Scripture and faith tradition is its own kind of evidence.* Verifiability is excellent (book, chapter and verse; Ellen White's book, page and paragraph), so quotations are checked word for word like any source. Authority is different: it is authoritative for faith and the church's teaching, not scientific evidence, so it is labeled for what it is and a slide never presents a quotation as a research finding. Claude never quotes Scripture or Ellen White from memory: every quotation comes from the fetched text, with its version or reference.

- **Bible versions (F-123).** NIV, NKJV and NLT come through **API.Bible** (American Bible Society), whose one agreement covers all three; its free Starter plan allows up to 3 licensed Bibles and 5,000 requests a month, for **non-commercial** use (no ads, fees or paid access; a later commercial OratorStudio needs a paid commercial plan). Obligations: each version's copyright notice wherever it is quoted (the references slide carries it automatically); a visible link to api.bible on the Starter plan; the text never altered; stored text refreshed at least every 30 days; and API.Bible's usage reporting (FUMS) in the web app. The NKJV is available on the free plan only while the app has 5,000 or fewer monthly users. The terms forbid training AI on the text; sending verses to Claude to answer an author's question is not training, and Anthropic does not train on API data. Tyndale's own NLT API closes on January 1, 2027, so it is not used. Public-domain versions (KJV, ASV, World English Bible, Berean Standard Bible) can be added freely.
- **The Passion Translation (F-123).** Not available through any API. Its publisher allows up to 500 verses without permission (not a whole book, nor over 20% of the work); in talks and projected slides only the initials TPT are needed after each quotation. The author enters TPT text themselves, and it is labeled "TPT, paraphrase, entered by the author": many scholars class it as a paraphrase rather than a translation, and without an online source the wording can't be checked, like a typed figure. Where a point depends on exact wording, the app can show the same verses from a translation beside it.
- **Ellen G. White's writings (F-124).** The Ellen G. White Estate runs an official developer API (EGW Writings API: her published writings, search, and the Adventist pioneer library), with credentials for a registered application. The Estate's copyright notice allows fair use: brief quotations for sermons, classroom instruction, publications and research, without modification or derivative works. Each quotation carries the standard reference (for example *DA* 25.1: *The Desire of Ages*, p. 25, paragraph 1), which is checked word for word. Before building, the API's developer terms are confirmed with the Estate, including whether passages may be sent to Claude to answer an author's questions.
- **The SDA Bible Commentary and the Andrews Bible Commentary** are copyrighted, with no API; they belong to the institution layer, licensed by the institution. Ellen White's comments printed in the SDA Bible Commentary (1BC, 2BC…) are available with her other writings.
- **Adventist news and records (F-125).** Adventist News Network (the General Conference's news service), Adventist Review and Adventist World, regional papers such as the Pacific Union Recorder, and independent outlets (Adventist Today, Spectrum) labeled as independent; all handled as news, not peer-reviewed. For church statistics and history: the Office of Archives, Statistics and Research (Annual Statistical Reports, the SDA Yearbook), the Encyclopedia of Seventh-day Adventists, and the Adventist Digital Library. Adventist health research (such as the Adventist Health Studies) and Adventist scholarly journals are already reached through PubMed and OpenAlex.

*The search record.* Each presentation keeps what was searched: which sources, which searches, who wrote them (Claude or the author), when, and how many results each part found (full results for the latest three runs). It can be shown like a methods section ("Sources searched: PubMed, OpenAlex, ClinicalTrials.gov, Nov 28, 2026"), on the references slide and in the brief, and it makes "nothing found" meaningful.

*How the catalog grows: measured, not guessed.*
- **An evaluation set** of 25 to 30 real topics across the institution's range (medicine, nursing, public health, dentistry, allied health, education, administration, religion and ethics). Discover runs on each; someone who knows each field judges whether the results were relevant and what was missing. Each gap points at a source to add, and the set is rerun after every change, as a test.
- **Usage signals**, aggregate only, no content stored: searches that come back empty, the sections authors add sources from, what authors upload that discovery never found, and what Claude's "search for…" proposals ask for.

**Sources: uploads and URLs (F-014, F-112, F-113)**

Every source is one the author chose: a record found by discovery in a named database (F-019, F-020, F-119), a file the author uploads, or a URL the author adds. There is no open web search: discovery queries only named scientific and government databases, nothing enters the workspace unless the author adds it, and the presentation can always say exactly what it drew on.

| Kind | Examples | How it is read | First release |
| --- | --- | --- | --- |
| Uploaded file | PDF, Excel, CSV, Word | In the browser; figures matched by label (F-012) | .3 (PDF), 1 (others) |
| Web page | A news release, a policy page, a published report | Fetched by the server; readable text kept as a snapshot; Claude proposes claims with citations (F-112) | 1 |
| Database search | PubMed and PubMed Central (NIH), ClinicalTrials.gov, and Europe PMC for NCBI Bookshelf reports and preprints | The server queries fixed endpoints; the author picks results, which are read and checked (F-119) | .3 |
| Data URL | A REST API or file returning JSON, XML or CSV | Fetched by the server; fields mapped to rows by path, such as `daily.temperature_2m_max` (F-014) | .3 |
| MCP connector | An institutional system exposed through MCP | The server calls the connector's tools as an MCP client and records each response (F-113) | 1 |

- **Snapshots.** Every fetch is stored with its URL, time and a content hash. Figures and citations point at the snapshot, so a deck shows what it used even after the source changes. Refreshing fetches again and shows what changed before any chart updates.
- **Structured data first.** JSON, XML and CSV name their fields, so mapping is exact and refresh is safe. The author picks the field holding the periods and the fields holding values (Claude may propose a mapping, which the author confirms). The confirmed rows then work like document figures: charts, analysis (F-013) and checks.
- **Credentials.** APIs and connectors that need keys or sign-in store them encrypted on the server, per institution. They are never sent to Claude or to the browser.
- **Allowed hosts.** The server fetches only from hosts on the institution's allowed list, and never from private or link-local addresses unless that exact host is allowed. This stops the fetcher from being used to reach internal systems.
- **Internal systems.** Systems on LLU's network may not be reachable from the hosting provider. Those need an MCP server or a small connector that LLU runs inside its network.
- **Who calls MCP.** Claude can call MCP tools itself, but then figures arrive inside Claude's answer. The app calls the tools, records the responses, and gives Claude the recorded data to analyze, so every number traces to a recorded response. When OratorStudio is opened inside claude.ai, it can also use connectors the person has already set up in Claude, with their sign-in.
- **Rights and terms.** Web page sources carry their URL and retrieval date in citations; reuse of quoted material follows the same attribution rules as images (F-204).

**Documents as data sources (F-012)**

Many decks restate figures from recurring reports: monthly finance packs, enrollment reports, statements. Retyping them is slow and is where wrong numbers come from.

- The author adds a set of PDFs. They are read in the browser and not uploaded.
- Labeled figures ("Purchases $22,773.77") are found and lined up across the documents into rows, one column per document, ordered by the month or period in the file names. Each value shows its page.
- Lines that only look like figures are skipped: transaction lists, page numbers, account, box and phone numbers, dates, and numbers inside sentences.
- The author checks the grid, types over or fills any value, and confirms each row. Nothing unconfirmed can be used. A value printed twice in one document with different amounts is flagged.
- Confirmed rows become a data source in the shared store and facts in the workspace. Once the author approves the outline, Build can draft a deck from them: one bound chart per row, a point computed from the figures (flagged for the author to rewrite), a backup table, and every figure's document and page in the notes and the editor.
- The author states what the presentation is for, can add comparisons (a budget, a target, last year's figures, a normal) for any row, and can ask Claude to analyze the confirmed rows (F-013). The analysis is reasoning, not a summary: a message; points that each state a conclusion, its evidence, why it matters for the purpose, possible drivers as hypotheses with how to check them, and a confidence level; then a recommendation with its tradeoffs, and next steps. Only the purpose, comparisons, labels and confirmed figures are sent, never the documents.
- Every number Claude takes from the figures comes with a formula, such as `(sum([Purchases]) - [Purchases @ Jan 2026]) / 9`, so it can show multi-step work; the app recomputes each one. A point, message, recommendation or next step with a number that doesn't check is shown with the reason and kept out of the deck.
- Claude may add context from its general knowledge (seasonal norms, how such accounts usually behave). It is labeled as such wherever it appears, stays in the speaker notes rather than on slides, and any outside number in it must be declared; an undeclared one drops the context. Claude's text is labeled as AI-written in the editor.
- Where Claude runs: OratorStudio can be opened inside claude.ai, Anthropic's Claude app; there, requests run on the person's own Claude account, with their permission asked on first use. Run on LLU's own servers, requests go through an API key the institution holds (F-114). Sensitivity labels (F-108) will decide which sources may be sent at all.
- Checks that need no AI always run: rows that add up to another in every period, and closing figures carried into the next period. When Claude isn't connected, computed patterns (swings, trends, concentration, offsets) stand in.
- First release: text-based PDFs only, matched by rules so the figures themselves are predictable and checkable. Scanned PDFs and saved layouts per report type are F-111.

Tested on ten real monthly financial statements (kept private, not in the repository): the summary figures (balances, purchases, payments, credits) were found in all ten and matched the reconciled values exactly. One figure changed layout partway through the year and was found in only seven; the gaps were visible in the grid and filled by hand, as designed.

**Research papers (F-015)**

- The author adds research papers as PDFs. Text is read in the browser, column by column for two-column layouts, with page numbers kept.
- Claude reads each paper on its own (one request per paper; the reference list is left out; a very long paper is cut, and the page says so) and returns its citation, design, sample, findings and limitations, each with an exact quote and page.
- OratorStudio checks every quote word for word on its page (a page off by one is corrected) and every number in it against that page. A finding that fails cannot be selected. The citation's DOI, authors and title are checked against the first pages.
- The author confirms findings. Only confirmed findings, with their quotes and citations, go to Claude for the analysis across papers, not the full papers.
- Each point of the analysis states its conclusion, evidence, cited findings, whether the studies agree, the strength of the evidence and why, why it matters, and what the papers do not cover. Strength is Claude's reasoned judgment, shown with its reason; it is not a formal GRADE or risk-of-bias rating.
- Its findings become workspace facts, and its message and points join the candidates the author chooses from (F-024). A deck drafted from the approved outline in Build has a message slide, one slide per point with reference numbers and a supporting quote, what the evidence doesn't tell us, the recommendation, next steps, references, and a backup slide per paper.
- First release: text-based PDFs. Quotes from tables may fail the word-for-word check; they are shown as unusable rather than let through.

**Images (F-017, F-115, F-116)**

- One media library holds every image. Slide images are added in Build; evidence images are added in Curate with their source and date.
- Evidence images can be read by Claude for figures or points, confirmed by the author like any other source, and labeled as read from an image.
- AI-generated illustrations come from the institution's chosen image provider. Only the prompt is sent, never patient or student information.

**PPTX import**

Migration decides adoption. Nobody will rebuild ten years of decks, so PPTX import quality is a P0 feature at every stage.


- Full import (the Stage 2 target, F-201): convert text boxes, tables, images, charts, speaker notes, and master slide styles into blocks and themes.
- Infer each slide's point and evidence from titles and structure; mark low-confidence inferences for review.
- Anything that cannot convert (complex SmartArt, embedded objects, animations) is kept as a freeform region or image, and listed in an import report.
- Quality score per deck, so faculty and admins can triage a bulk import.
- Basic import is the bar for now: text, images, tables, and speaker notes convert; everything else stays as an image or freeform region. Target: 80% of a representative sample of LLU decks import with no manual repair; measure this in Stage 0 and revisit the bar.

**Exports**

| Format | Fidelity goal | Notes |
| --- | --- | --- |
| PPTX | Opens cleanly in PowerPoint; editable text and charts | Needed for buyer confidence and lock-in concerns |
| PDF | Tagged and accessible, with reading order and alt text | Also used for handouts |
| HTML (self-contained) | Full interactive deck incl. search, works offline | The offline presenting package |
| DOCX / Markdown | Pre-read and handout variants | Generated from variants |
| Native deck file | Lossless | Human-readable, text-based, diffable in git |

**Native file format.** A JSON or YAML-based package: content model, theme reference, bindings, and assets in one bundle. Versioned schema, documented publicly from Stage 1.

**Integrations**

| System | Purpose | Stage |
| --- | --- | --- |
| Magic Link login with a transactional email service | Identity | .3 |
| Excel and CSV upload | Data sources for charts | 1 |
| Data URLs (REST, JSON, XML, CSV) | Sources with refresh (F-014) | .3 |
| MCP servers for institutional systems | Connectors as sources (F-113) | 1 |
| Canvas via LTI 1.3 | Publish course material, grade passback | 2 |
| Teams, Outlook | Share, schedule, present | 2 |
| Entra ID SSO | Institutional identity and roles | 3 |
| SharePoint, OneDrive | File storage and data sources | 3 |
| SQL warehouse | Data bindings, preferably through an API or MCP server the institution runs | 3 |
| Public API and MCP server | Let other tools and agents create or update decks | 3 |

## 11. Non-functional requirements

| Area | Requirement | Stage |
| --- | --- | --- |
| Reliability | Presenting never depends on the network; a deck loads from a local package and runs with no connection | .3 |
| Reliability | Autosave with version history; no work lost on crash or disconnect | .3 |
| Reliability | Audience features can fail without affecting slides or notes | .3 |
| Performance | Editor interactions under 100 ms; layout reflow under 200 ms on a 100-slide deck | .3 |
| Performance | Opens a 300-slide deck in under 3 s | 1 |
| Hosting | Vercel and Supabase on paid tiers before LLU use; standard Postgres to keep a move to Azure simple | .3 |
| Accessibility | The product's own UI and the audience page meet WCAG 2.1 AA and work by keyboard and screen reader | .3 |
| Accessibility | Decks and exports pass automated checks and a defined manual checklist; tagged PDF output | 2 |
| Security | Encryption in transit and at rest; tenant isolation through Row Level Security; secrets never sent to models | .3 |
| Security | URL sources are fetched by the server only from the institution's allowed hosts, never from private addresses unless allowed; API and connector credentials stored encrypted and never sent to models or the browser | .3 |
| Security | On a deployed server, routes that call Claude with the institution's key or fetch URLs require sign-in; with no sign-in configured they are off | .3 |
| Security | Magic Link login (F-018) | .3 |
| Security | Role-based access and audit log of views, edits, exports, and AI calls | 1 |
| Privacy | Documents used as data sources are read in the browser and not uploaded; their figures go to AI only where sensitivity labels allow | .3 |
| Privacy | No training on customer content; configurable data retention; data export and deletion on request | 1 |
| Privacy | Version .3 uses non-sensitive content only. A HIPAA agreement with the host, or a move to Azure, is required before patient information may appear; student data is handled for FERPA | 1 |
| Compliance | VPAT and HECVAT documentation prepared before first external sale | 3 |
| Compliance | SOC 2 Type I within 12 months of first customer, Type II after | 3 |
| Scalability | Multi-tenant design from the start, even with one tenant | .3 |
| Browser support | Current Chrome, Edge, Safari, Firefox; tablet-friendly presenting | .3 |
| Observability | Logging of AI quality signals (accepts, rejects, edits) without storing content where avoidable | 1 |

## 12. Architecture and technical approach

Build a standalone web app on Vercel and Supabase, with the presentation model at the center (its curation and its slides) and a self-contained offline package for presenting.

&#91;embedded content: architecture · 3 clients, 6 services, 3 back ends\]

Clients reach one presentation service; AI calls, storage, and outside systems sit behind it, so models and sources can change without touching the editor.

| Decision | Choice | Reason |
| --- | --- | --- |
| Hosting | Vercel for the web app, Supabase for database, auth, storage, realtime | One managed stack; no servers to run; Claude Code works well with both |
| Login | Supabase Magic Link, with a transactional email service for delivery | No passwords; SSO (Entra ID) added in a later stage |
| Tenancy | Tenant ID on every record, enforced by Row Level Security | Multi-tenant from day one, even with one tenant |
| Presentation model | The curation (topic, sources, facts, probes, outline) and each deck (a typed block tree) are changed only by operations, each kept in an append-only log | Gives history, point-level diffs, undo, and later co-editing |
| Data model | Postgres tables: `tenants`, `memberships`; `presentations` with `presentation_ops`; `decks` (each belonging to a presentation, or none for an import) with `deck_ops`; `live_*` for audience sessions. Row Level Security on every table; the logs are insert-only. Set up or reset with `supabase/setup-all.sql` | The tables follow the model; history cannot be rewritten; one paste rebuilds a database |
| Layout | Rules from theme tokens, run in the browser | Instant reflow; same logic reused for export |
| Search | Per-slide embeddings computed at save; index bundled into the offline package | Semantic jump works with no network |
| Audience response | Supabase Realtime channels per session | Live polls and Q&A without running a WebSocket server |
| Slow jobs | PPTX import, export, and AI drafting run as background jobs with progress shown | Avoids serverless time limits (verify current limits) |
| Sources | Discovery searches fixed endpoints of named databases from the server (PubMed first, for speed); uploads read in the browser; URLs fetched by the server with an allowlist, snapshots kept in storage; MCP called by the server as a client | Provenance for every figure; credentials stay on the server; private systems reachable through a connector inside the institution |
| Document sources | pdf.js text extraction in the browser; rule-based label and value matching; author confirmation | Sensitive files stay on the device; results are predictable and checkable |
| Modules | One web app with four areas (Curate, Build, Present, Engage) on one presentation model and one store | Modules can ship separately without separate products to run or sign into |
| Outline to slides | Decks record which presentation and points they were drafted from (the outline is the app's internal `Argument` object) | Changes in Curate can be traced to the slides they affect |
| Image generation | Provider behind one server interface, chosen per institution (Azure OpenAI expected first) | The institution's existing cloud contract and data terms apply; providers can change without touching the editor |
| Portability | Standard Postgres; avoid vendor-specific features where practical | Keeps a later move to Azure a migration, not a rewrite |

**Constraints for version .3**

- Use non-sensitive content only until the hosting plan includes a HIPAA agreement or the product moves to Azure.
- Create the Vercel, Supabase, email, and domain accounts under a transferable organization, since LLU will own the product.
- Confirm whether Vercel's free tier allows this use; plan on a paid tier.

## 13. Success metrics, risks, and roadmap

**Roadmap**

1. **Version .3 (you).** Curate: topic-first discovery (PubMed, ClinicalTrials.gov, government reports), the author's own documents, data URLs and papers, the workspace with probes and discard, the discovery summary, candidate messages and points, the outline. Build: structured editor, slide drafting, one theme, freeform regions, basic PPTX import. Present: non-linear live mode, offline package, PPTX and PDF export. Engage: audience Q&A with slide matching, simple polls. Gate: you present from it weekly for 8 weeks.
2. **Stage 1 (LLU admins).** Excel and CSV data bindings, web page sources and MCP connectors, evidence images and AI illustrations, AI keys and usage tracking, provenance and consistency checks, themes, variants, point-level review, roles and audit log. Gate: 5 admins each give 3 real presentations from it.
3. **Stage 2 (faculty).** Bulk import, handouts, accessibility remediation, image attribution, Canvas via LTI, quizzes. Gate: 20 faculty active; 80% of imported legacy decks usable without manual repair.
4. **Stage 3 (external).** Multi-tenant admin console, SSO and SCIM, public API and MCP, HECVAT and VPAT. Pricing and billing are out of scope until this stage is planned.

**Success metrics**

| Metric | Target | Stage |
| --- | --- | --- |
| Presentations given from OratorStudio | At least 1 per week for 8 weeks | .3 |
| Time from topic to an approved outline | Under 1 hour for a typical talk | .3 |
| Presentations where discovery added a source the author didn't have | Tracked; most presentations | .3 |
| Facts behind slide points that are checked against a source | 90% or more | .3 |
| Claude answers and proposals flagged by the checks | Tracked; falling over time | .3 |
| Legacy decks imported without repair | 80% (revisit given "basic" import) | .3 |
| Q&A questions matched to the right slide in top 3 | 90% on a labeled set | .3 |
| Number or point errors caught before a board meeting | Tracked per presentation | 1 |
| Figures read from documents that the author had to correct | Under 5% on a labeled set of LLU reports | 1 |
| Accessibility checks passing at export | 95% | 2 |

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Ownership unclear between you and LLU | Blocks adoption and any later sale | Written agreement now, including a license-back or assignment path for selling |
| Patient or student data enters decks on a non-compliant host | Privacy breach | Non-sensitive content only in .3; BAA plan or Azure move before Stage 1 real data |
| Discovery misses key evidence (database coverage, search wording) | A presentation that looks evidence-based but isn't complete | Search shown and editable; several databases; strongest evidence first; Challenge me; the author's own sources alongside |
| Claude misreads or overstates a source | A wrong fact on a slide | Quotes checked word for word, numbers checked against cited facts, the author confirms every fact, abstract-only sources labeled |
| Generic AI output makes forgettable presentations | Low adoption | Evidence-first workflow, the author chooses the message, strong defaults, easy overrides |
| Import quality too low | Users abandon | Import report, freeform fallback, quality score, early testing on real decks |
| Wrong slide appears on voice command | The presenter loses control of the room | Presenter-only preview, confirm gate, never-show flag |
| Audience abuse or off-topic submissions | Disrupted sessions | Moderation queue, rate limits, rotating codes |
| Built entirely with AI-assisted coding | Hidden defects, security gaps | Tests, code review passes, security checklist, staged rollout |
| AI-generated image mistaken for evidence in a clinical or research deck | Misleading content | Illustration-only rule; labels; clinical- and data-looking images blocked or flagged (F-116) |
| Learning mode used to outsource the research instead of learning it | Students don't learn; work isn't theirs | Claude doesn't read or write facts in learning mode; student-written facts quote-checked; the research record shows the instructor who did what (F-209, F-210) |
| Scope across four modules | Slow progress on what matters most | Curate and Build first; Present kept to essentials; Engage on its own schedule |
| Vendor lock-in | Costly later move | Standard Postgres, open file format |
| URL fetcher used to reach internal systems | Data exposure | Per-institution host allowlist; private addresses blocked; fetches logged |
| A source changes after a deck is presented | Wrong or unexplained numbers | Dated snapshots; refresh shows changes before charts update |

**Open questions**

- [ ] Does LLU need a formal agreement covering ownership and a future commercial sale?
- [ ] Which hosting plans include a HIPAA agreement, and at what cost?
- [ ] Does "basic import" need a higher bar once real faculty decks are tested?
- [ ] Which Canvas features does LLU allow (LTI tools, grade passback)?
- [ ] Who owns data sources for admin reports, and how are they exported today?
- [ ] Which LLU systems already expose an API or could expose an MCP server, and are they reachable from the hosting provider or only from inside LLU's network?
- [ ] Which image provider will LLU approve, and is it already covered by an existing Microsoft or Google agreement, including a BAA?
- [ ] Should institution-assigned AI keys be one per person, or one institutional key with usage tracked per person (F-114)?
- [ ] Should a written brief from Curate (F-016) follow an LLU template?
- [ ] Which databases after the planned ones (Data Commons, Federal Register, the news tier): CDC and CMS data directly, IPEDS for institutional comparisons, NIH RePORTER for funded work? Decide from the evaluation set.
- [ ] Scripture and faith tradition (F-123, F-124): confirm the EGW Writings API's developer terms with the White Estate (including sending passages to Claude); register the LLU application with API.Bible (non-commercial, NIV, NKJV, NLT); should the SDA Bible Commentary be licensed for the institution layer?
- [ ] Which 25 to 30 topics make the evaluation set, and who judges the results in each field?
- [ ] Can LLU's library provide access to paywalled full texts, so discovery is not limited to abstracts for those papers? Learning mode (F-209) needs the library's link format so students reach full texts.
- [ ] For learning mode (F-209): which courses pilot it, how strict should the default be (coaching only, or reading unlocked after the student's own summary), and should the research record (F-210) go to Canvas with the submission (F-205)?
- [ ] Which recurring reports (finance, enrollment, accreditation) do admins build decks from, and in which formats: PDF, Excel, or a reporting system?

# Appendices

Details the main sections refer to: the brand, the name and logo, and the interface design.

## Appendix A. LLU brand theme

The first built-in theme uses the LLU palette, with every color tagged by its safe uses so the accessibility checks can enforce contrast automatically. Values are transcribed from a screenshot of the LLU style guide palette page and should be checked against the live guide. The logo colors, fonts, and logo-clearance rules were not in the screenshot and still need to be captured.

**Defaults.** Regent Red (#a30234) is the primary color and Platinum Gray (#666666) is the secondary, since those are the two colors the guide names. Confirm this with LLU brand staff.

**Contrast on white.** Ratios use the WCAG 2.1 formula against #ffffff. Body text needs at least 4.5:1, large text and chart marks at least 3:1.

| Token | Color | Hex | PMS | Contrast on white | Safe use |
| --- | --- | --- | --- | --- | --- |
| green-dark | Green | #556622 | 371 C | 6.3 | Text, fills, charts |
| green | Green | #558822 | 370 C | 4.3 | Large text, fills, charts |
| green-light | Yellow-green | #dddd77 | 585 C | 1.4 | Fills only, with dark text |
| orange | Orange | #dd8800 | 145 C | 2.8 | Fills only; add an outline in charts |
| amber | Amber | #ffbb44 | 142 C | 1.7 | Fills only, with dark text |
| yellow | Yellow | #ffdd88 | 121 C | 1.3 | Fills only, with dark text |
| red (primary) | Regent Red | #a30234 | 1955 C | 8.0 | Text, fills, charts, headings |
| red-bright | Red | #cc0044 | 1935 C | 5.8 | Text, fills, charts |
| red-tint | Pink | #f0d6db | 698 C | 1.4 | Backgrounds only |
| plum | Plum | #552255 | 261 C | 12.0 | Text, fills, charts |
| purple | Purple | #7722aa | 527 C | 8.1 | Text, fills, charts |
| periwinkle | Blue-gray | #91a1be | 535 C | 2.6 | Fills only; add an outline in charts |
| navy | Navy | #002255 | 654 C | 15.4 | Text, fills, charts |
| blue | Blue | #005195 | 301 C | 8.0 | Text, fills, charts, links |
| blue-light | Sky blue | #6699cc | 542 C | 3.0 | Large text, fills, chart marks |
| teal-dark | Dark teal | #004f5c | 3165 C | 9.2 | Text, fills, charts |
| teal | Teal | #008472 | 327 C | 4.6 | Text, fills, charts |
| sage | Sage | #88aa99 | 5565 C | 2.5 | Fills only; add an outline in charts |
| warm-gray-dark | Warm gray | #685c53 | Warm Gray 11 C | 6.5 | Text, fills, charts |
| warm-gray-mid | Warm gray | #beb2a6 | 7529 C | 2.1 | Fills, borders |
| warm-gray-light | Warm gray | #eae9df | Warm Gray 2 C | 1.2 | Backgrounds only |
| black | Black | #000000 | Black | 21.0 | Text |
| gray (secondary) | Platinum Gray | #666666 | 425 C | 5.7 | Text, fills, charts |
| gray-light | Cool gray | #cccccc | Cool Gray 3 C | 1.6 | Borders, backgrounds |

**Theme rules**

1. Colors with under 4.5:1 on white can never be used for body text. The editor blocks it, and offers the nearest compliant color.
2. A color's safe uses are computed from its contrast against the slide background, so a dark theme works out automatically.
3. Chart series draw from colors with at least 3:1 contrast first. Lighter colors are used only with an outline or a direct label.
4. Text on a fill must meet 4.5:1 against that fill. The editor picks white or black text accordingly.
5. The theme stores PMS and CMYK values beside each hex value, so print exports and PDFs can use the right ink values.
6. Color is never the only way to carry meaning; charts add patterns or labels.

**Theme file excerpt**

```json
{
  "theme": "LLU",
  "colors": {
    "red":  { "name": "Regent Red",    "hex": "#a30234", "pms": "1955 C", "cmyk": [0, 100, 60, 37], "role": "primary" },
    "gray": { "name": "Platinum Gray", "hex": "#666666", "pms": "425 C",  "cmyk": [0, 0, 0, 77],    "role": "secondary" },
    "blue": { "name": "Blue",          "hex": "#005195", "pms": "301 C",  "cmyk": [100, 23.5, 0, 18.5], "role": "accent" }
  }
}
```

## Appendix B. Name and logo

**Name.** OratorStudio replaces the earlier working name, LecternAI. It has not yet been through a trademark search. Before the name is public, run a trademark search, check domains and app store listings, and decide who files. LLU would own any mark.

**Tagline and motto.** The tagline is "Ideas first. Slides follow." It restates design principles 1 and 2: the evidence and the message come first, and the slides follow from them. The motto, "Create. Present. Engage.", predates the four modules. A motto that names them, "Curate. Build. Present. Engage.", is proposed. The line for Curate is "Curate the evidence. Hone your message. Each point backed by evidence, every fact traceable to its source." "Orator's Sidekick" was considered as a name and not adopted.

**Logo.** The logo is a wordmark: "Orator" in bold type followed by "Studio" in an accent color, with no space between them. On the brand card, the tagline sits below the name, then a thin rule, then the motto in a lighter gray. The app uses this lockup on the sign-in page and the name with the tagline on the phone join page. The typeface is a placeholder (the system sans-serif) until a brand typeface is chosen.

| Colorway | Background | "Orator" | "Studio" | Contrast |
| --- | --- | --- | --- | --- |
| Primary | White | Navy #002255 | Regent Red #a30234 | 15.4 and 8.0 |
| Reversed | Black | White | Lighter red, to be chosen (for example #e0335f) | 21.0 and 4.8 |
| One color, light on dark | Regent Red #a30234 | White | White | 8.0 |
| One color, print | White | Black | Black | 21.0 |

Contrast ratios are WCAG 2.1 calculations from the hex values.

**Dark backgrounds.** The brand card shows "Studio" in Regent Red on black. That pairing is only 2.6:1, below the 3:1 minimum even for large text, so it is not one of the colorways. The reversed colorway needs a lighter red. #e0335f (4.8:1) passes at any size, and #cc0044 (3.65:1) passes for large text only. LLU brand staff should choose.

**Usage rules (proposed)**

1. Keep clear space around the logo equal to the height of the letter O on every side.
2. Minimum size is 96 px wide on screen and 25 mm wide in print.
3. Use only the four colorways above. Do not recolor, outline, rotate, stretch, or add a space between "Orator" and "Studio".
4. Regent Red "Studio" on black or navy is not allowed; use the reversed colorway.
5. Show the logo on backgrounds that keep the wordmark at 4.5:1 or better.

**Open items**

- [ ] Small-size mark for browser tabs and app icons (likely a monogram, such as an O or OS).
- [ ] Choose the red for the reversed colorway.
- [ ] Confirm with LLU brand staff that the product may use the LLU palette and how it may be shown beside LLU logos.
- [ ] Choose a brand typeface to replace Inter and Source Serif 4 (Appendix C).
- [ ] Trademark, domain, and app store check for OratorStudio and the module names.
- [ ] Decide whether the motto changes to name the four modules.

## Appendix C. Interface design

The interface follows direction A ("calm clinical") with direction B's serif headings, chosen from three directions on Nov 27, 2026. Mockups for desktop, iPad and phone: [OratorStudio design directions](https://claude.ai/artifact/EaeKiRbeAWdcyaR4zP6g3j).

**Principles**

1. **Calm and white.** White surfaces, quiet gray panels, hairline borders, generous spacing. Grouping comes from space more than boxes.
2. **Serif for what people read, sans for what they operate.** Page titles, the message, points and card titles use the serif. Controls, labels, tables and body text use the sans-serif.
3. **Red is rare.** Navy carries text and primary actions. Regent Red appears about once per screen: the wordmark, the current module marker, the slide accent bar.
4. **Status is spoken plainly.** Evidence strength, unsupported points and slides to review are labeled in words, with color as a second signal, never the only one.

**Tokens**

| Token | Value | Use |
| --- | --- | --- |
| Navy | #002255 | Primary buttons, headings, links |
| Regent Red | #a30234 | Wordmark, current-module marker, slide accent |
| Ink | #0f1b2d | Body text |
| Muted | #4a5568 | Secondary text (7.4:1 on white) |
| Line | #e7eaef | Borders and dividers |
| Panel | #f7f8fa | Side navigation, quiet panels |
| Amber | #8a4b00 on #fff7eb | Needs attention: unsupported points, slides to review |
| Green | #1d4b2a on #e6f2e9 | Strong or moderate evidence, checks that passed |
| Radius | 10 px controls, 16 px cards | |
| Sans | Inter | Interface text |
| Serif | Source Serif 4 | Titles, the message, points |

Both typefaces are open source (SIL Open Font License) and are served by the app itself, not by a font service. They are placeholders until LLU chooses a brand typeface (Appendix B).

**Layout by device**

| Device | Navigation | Notes |
| --- | --- | --- |
| Desktop (1200 px and wider) | Sidebar with the four modules and labels | Slide editor: thumbnails, slide, details panel side by side |
| iPad and small laptops | Icon rail with short labels | Upright: one column of content. Sideways: the full slide editor |
| Phone | Bottom tab bar | For reviewing and quick fixes: the outline and probes, a slide's text and notes, joining a session. Full slide building is meant for iPad or desktop |

Every control is at least 44 by 44 points, so it is easy to tap. Layouts reflow without horizontal scrolling down to 320 px wide.

**Styling approach.** Version .3 uses one stylesheet built on these tokens, with no CSS framework. When the app needs complex components (dialogs, menus, date pickers, data tables), adopt an unstyled accessible component library such as Radix UI or React Aria, styled with these tokens, rather than Bootstrap's defaults. Dark mode is a later item.
