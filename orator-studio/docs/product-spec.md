# Product Spec: OratorStudio

Nov 27, 2026 · @DP Harris

*Ideas first. Slides follow.*

This spec defines OratorStudio, a presentation platform that stores a deck as structured content (claims, evidence, intent) and generates layout, variants, and delivery aids from it. It is built first for one presenter, then LLU admins, then faculty, then sold to other institutions.

## 1. Overview

**Problem.** PowerPoint stores positioned boxes. That makes decks hard to restyle, check for accuracy, make accessible, reuse for different audiences, or navigate live. AI bolted onto that model can only decorate it.

**Vision.** A deck is a model of an argument. Design is applied by rules, data stays live and sourced, and the presenter can go anywhere in the material in seconds.

**Design principles**

1. **Content first.** Authors edit meaning; layout follows.
2. **AI proposes, people decide.** Every AI change is visible, reversible, and labeled.
3. **Numbers are sourced.** Any figure can show where it came from and when it was last checked.
4. **Never fail in front of an audience.** Presenting works offline and degrades gracefully.
5. **Escape hatch always.** Freeform placement exists for the one arrow that must go exactly there.
6. **No lock-in.** Open file format, strong PPTX import and export.

**Working assumptions (please correct)**

- LLU means Loma Linda University Health. Version .3 uses Magic Link login; Entra ID single sign-on comes in a later stage.
- The product is browser-based, built on Vercel and Supabase, with an offline presenting mode and no desktop install. It is built with AI-assisted coding (Claude Code).
- AI runs through a hosted model API at first, with a private-deployment option designed in for sensitive data.
- LLU will own the product. A written agreement covering ownership and any future commercial sale is needed before external customers (see section 10).

**Rollout stages**

| Stage | Audience | Goal | Exit criterion |
| --- | --- | --- | --- |
| 0 | You | Replace PowerPoint for your own decks | You use it weekly for 8 weeks without reopening PowerPoint |
| 1 | LLU admins | Accurate, consistent leadership and board decks | 5 admins each ship 3 real decks and prefer it to PPT |
| 2 | Faculty | Lecture decks, handouts, accessible course material | 20 faculty, 80% of imported legacy decks usable without manual repair |
| 3 | External customers | Sell to higher ed and health sciences | First paid site license; security review passed |

Stage 0 is version .3. Out of scope for now: pricing, billing, and site licensing.

## 2. Users and use cases

Each stage adds a user type with different needs. Admin features are not assumed to carry over to faculty.

| User | Typical deck | Top needs | Biggest fear |
| --- | --- | --- | --- |
| You (founder-presenter) | Talks, leadership briefings, internal updates | Fast authoring, live Q&A navigation, import of existing decks | Losing years of content |
| LLU admin | Board, budget, enrollment, accreditation reporting | Correct numbers, consistent brand, quick review and approval | A wrong number in front of the board |
| Faculty | Lectures, grand rounds, conference talks | Legacy import, handouts, accessibility, image attribution | Rebuilding hundreds of slides |
| Student / audience | Viewing a deck or handout | Readable, accessible, searchable material | Inaccessible content |
| Institutional buyer (IT, compliance, procurement) | N/A | SSO, audit trail, privacy, accessibility compliance | Data leaving the institution |

**Primary use cases**

1. Draft a deck from a goal, audience, and time limit, shaping the outline before any visuals.
2. Import an existing PPTX and convert it to the structured model with minimal repair.
3. Bind a chart to an uploaded Excel or CSV file and see it flag when the figure goes stale.
4. Generate a 5-minute, 45-minute, and pre-read version from one deck.
5. Present live and jump to any slide by voice or search during Q&A.
6. Review a colleague's changes as claim-level diffs and approve or reject each.
7. Publish a lecture as a slide deck, handout, and accessible study guide.
8. Let viewers ask questions of a published deck and get answers grounded only in its content.
9. Run live polls and moderated audience Q&A from phones, and jump to the slide that answers each question.

## 3. Core concepts

The data model is what separates this product from a PowerPoint with an AI sidebar. Everything else in this spec depends on it.

| Concept | Definition | Why it matters |
| --- | --- | --- |
| Deck | An ordered narrative plus a pool of backup material, with a stated goal, audience, and time budget | Enables multiple versions and non-linear delivery |
| Slide | One claim, its evidence blocks, and a presenter intent (inform, persuade, decide) | Layout can be regenerated without losing meaning |
| Block | A typed unit of content: text, figure, chart, table, image, quote, equation, diagram | Each type has its own accessibility and review rules |
| Layout | A rule-based arrangement chosen from the slide's blocks and the active theme | No manual nudging; overridable per slide |
| Theme (design tokens) | Colors, type, spacing, logo rules, contrast minimums, owned by the institution | Brand and accessibility are enforced, not checked |
| Data binding | A link from a chart or number to a source (sheet, warehouse query, API), with refresh rule | Live figures and stale-number warnings |
| Provenance record | Source, retrieval time, transformation, and approver for any bound figure or cited claim | Auditability for board and accreditation use |
| Variant | A saved view of a deck: which slides, what depth, what length, what language | One source, many outputs |
| Freeform region | A slide area exempt from layout rules, with absolute positioning | The escape hatch |

**Rules of the model**

- A slide may be freeform in part, but the model still records its claim and evidence so search, review, and variants keep working.
- Edits by AI and by people are stored as operations with author, time, and reason, which powers history and claim-level diffs.
- A theme change never alters content, and a content change never breaks a theme.

## 3A. LLU brand theme

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

## 3B. Name and logo

**Name.** OratorStudio replaces the earlier working name, LecternAI. It has not yet been through a trademark search. Before the name is public, run a trademark search, check domains and app store listings, and decide who files. LLU would own any mark.

**Tagline and motto.** The tagline is "Ideas first. Slides follow." It restates design principle 1: authors edit meaning, and layout follows. The motto, "Create. Present. Engage.", names the three things the product does, from authoring to audience response.

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
- [ ] Choose a brand typeface and replace the placeholder.
- [ ] Trademark, domain, and app store check for OratorStudio.

## 4. Functional requirements

Priority: **P0** = required for that stage to ship, **P1** = should have, **P2** = later. IDs are stable so they can be referenced in tickets.

### Stage 0: you (MVP)

| ID | Requirement | Priority |
| --- | --- | --- |
| F-001 | Create a deck from goal, audience, time limit, and one key takeaway | P0 |
| F-002 | AI proposes a narrative outline; user edits, reorders, and approves before slides are generated | P0 |
| F-003 | Generate slides from the outline with theme-driven automatic layout | P0 |
| F-004 | Edit content in a structured editor; layout reflows on every change | P0 |
| F-005 | Freeform region on any slide | P0 |
| F-006 | Import PPTX into the semantic model (basic: text, images, tables, notes; everything else kept as an image or freeform region), with a report of what could not be converted | P0 |
| F-007 | Export PPTX and PDF | P0 |
| F-008 | Non-linear live mode: search and voice jump, return-to-place (section 5) | P0 |
| F-009 | Offline presenting from a downloaded deck | P0 |
| F-010 | One theme, with contrast and alt-text checks | P1 |
| F-011 | Speaker notes and rehearsal timer | P1 |

Also in Stage 0: Magic Link login (P0) and the audience response features in section 5A (A-01 to A-05 are P0 for version .3).

### Stage 1: LLU admins

| ID | Requirement | Priority |
| --- | --- | --- |
| F-101 | Data bindings to uploaded Excel and CSV files, with manual refresh; SQL, API, and SharePoint sources deferred | P0 |
| F-102 | Provenance panel on every bound number; stale-figure warnings | P0 |
| F-103 | Cross-slide consistency check: flags the same metric with different values | P0 |
| F-104 | Institutional themes with enforced brand rules; department sub-themes | P0 |
| F-105 | Variants: exec summary, full deck, pre-read document | P0 |
| F-106 | Claim-level review: comments, suggested edits, approvals, change summary since last view | P0 |
| F-107 | Magic Link login, roles (author, reviewer, approver, admin), audit log; Entra ID SSO deferred to Stage 3 | P0 |
| F-108 | Sensitivity labels on decks and slides; restrict AI and sharing by label | P1 |
| F-109 | Predicted hard questions with draft answers grounded in the deck | P1 |
| F-110 | Teams and Outlook integration for sharing and scheduling | P2 |

### Stage 2: faculty

| ID | Requirement | Priority |
| --- | --- | --- |
| F-201 | Bulk PPTX import with quality scoring and a repair queue | P0 |
| F-202 | Lecture-to-handout and study-guide generation | P0 |
| F-203 | Automatic accessibility remediation (alt text suggestions, reading order, captions, contrast), with WCAG 2.1 AA as the target | P0 |
| F-204 | Image rights and attribution tracking per figure, with reuse warnings | P0 |
| F-205 | Canvas publishing via LTI 1.3 (LLU uses Canvas); other LMSs later | P1 |
| F-206 | Student-facing Q&A grounded only in the published deck, with citations to slides | P1 |
| F-207 | Medical and scientific content blocks: structured citations, units, equations, anatomical image handling | P1 |
| F-208 | Live captions and slide-synced transcripts | P2 |

### Stage 3: commercial

| ID | Requirement | Priority |
| --- | --- | --- |
| F-301 | Multi-tenant isolation, per-tenant themes, admin console | P0 |
| F-302 | Billing and site-license management (out of scope until Stage 3 is planned) | P0 |
| F-303 | Self-serve tenant onboarding with SSO and SCIM provisioning | P1 |
| F-304 | Public API and MCP server for generating and updating decks | P1 |
| F-305 | Template and theme marketplace or sharing between tenants | P2 |
| F-306 | Usage analytics for administrators (adoption, accessibility pass rate) | P2 |

## 5. Live presenting and non-linear mode

The presenter can jump to any slide by voice or search, check it privately, then show it, and return to the main narrative in one action.

| ID | Requirement | Priority |
| --- | --- | --- |
| L-01 | Command bar (Cmd/Ctrl+K) searches all slides, including backups, by title, content, notes, and data labels, with thumbnails | P0 |
| L-02 | Semantic matching: a query like "why are customers leaving" finds the churn slide without the word churn | P0 |
| L-03 | Voice command to jump, such as "show me churn by cohort" | P1 |
| L-04 | Presenter-only preview: the match appears on the presenter screen first; one key sends it to the audience | P0 |
| L-05 | Return-to-place: a single action restores the prior main-narrative slide | P0 |
| L-06 | Slides can be marked never-show-on-voice or require-confirmation (confidential figures) | P0 |
| L-07 | Context repair: if a jumped-to slide depends on a skipped concept, show a one-line reminder to the presenter | P1 |
| L-08 | Timer distinguishes planned detours from running over; notes and captions follow the presenter | P1 |
| L-09 | Top 3 matches always shown for ambiguous queries; never auto-advance on low confidence | P0 |
| L-10 | Works offline: search index and slides are cached locally before the session | P0 |
| L-11 | Optional audience path: a link that lets remote viewers browse the deck on their own | P2 |

**Performance targets.** Search results appear in under 300 ms. Voice-to-preview takes under 2 s. Local matching must work with no network; voice transcription may use a cloud service when online and falls back to typed search when offline.

**Failure behavior.** If voice recognition or matching fails, the audience screen never changes. The presenter sees the failure and falls back to the command bar.

## 5A. Audience response

Audience members join from a phone and respond to the slide in front of them. The presenter stays in control, and slides never depend on the audience channel.

| ID | Requirement | Priority | Version |
| --- | --- | --- | --- |
| A-01 | Join by QR code or short code in a phone browser; no account, anonymous by default | P0 | .3 |
| A-02 | Live polls: multiple choice, rating scale, ranking, short text, word cloud | P0 | .3 |
| A-03 | Poll results render as a chart block on the slide, live | P0 | .3 |
| A-04 | Audience Q&A with upvoting and a presenter moderation queue; nothing shows to the room until approved | P0 | .3 |
| A-05 | Question-to-slide matching: each question is matched to the best slide, including backups, with a one-click jump (uses the search from section 5) | P0 | .3 |
| A-06 | Pace signals ("too fast", "lost me") shown only to the presenter, tied to the current slide | P1 | Stage 0 |
| A-07 | AI help, always presenter-approved: merge duplicate questions, summarize open text into themes, suggest a follow-up poll, flag inappropriate submissions | P1 | Stage 0 |
| A-08 | Per-slide results report, CSV export, and responses saved with the deck for next time | P1 | Stage 0 |
| A-09 | Quizzes with correct answers; optional identified responses | P1 | Stage 2 |
| A-10 | Canvas grade passback and attendance (LTI 1.3) | P1 | Stage 2 |
| A-11 | Session controls: open and close polling, lock the room, set a response limit | P1 | Stage 0 |
| A-12 | Remote viewers can respond during Teams or Zoom sessions with the same code | P2 | Stage 1 |

**Rules**

1. **Privacy.** Responses are anonymous unless the presenter turns on identified mode. Identified data carries a retention limit and is treated as a student record under FERPA.
2. **Moderation.** All free-text goes through the queue, plus a profanity and abuse filter. A filter alone is not enough.
3. **Abuse control.** One response per device per poll by default, rate limits on submissions, and a rotating join code per session.
4. **Reliability.** If the realtime service drops, slides and notes keep working. The presenter sees a status indicator and can continue without audience features.
5. **Capacity target.** At least 300 simultaneous participants in one session for the first release. Revise after load testing.
6. **Accessibility.** The audience page meets WCAG 2.1 AA, works with screen readers, and does not rely on color alone.

## 6. AI capabilities and guardrails

AI is used where it saves real effort, and always as a proposal the user can inspect and undo.

| Capability | What it does | Human control |
| --- | --- | --- |
| Outline generation | Proposes a narrative arc from goal, audience, and time | User edits and approves before slides exist |
| Slide drafting | Turns an outline node into claim, evidence blocks, and layout | Shown as a diff; accept, edit, or reject |
| Consistency and claim checks | Finds conflicting numbers, unsupported claims, stale data | Warnings only; never silently changes content |
| Variant generation | Cuts a deck to a target length or depth | Preview before saving; original untouched |
| Accessibility remediation | Suggests alt text, reading order, caption fixes | Per-item accept; flagged as AI-generated |
| Q&A prediction | Drafts likely questions and answers from the deck's own evidence | Answers cite slides; presenter edits |
| Semantic search and voice | Matches spoken or typed queries to slides | Presenter preview before audience sees it |
| Viewer Q&A | Answers viewer questions from a published deck | Restricted to deck content; shows source slides; says "not covered" otherwise |

**Guardrails**

1. **Labeling.** AI-written text and images carry a visible provenance flag in the editor, and the flag persists in history and export metadata.
2. **No invented numbers.** AI may not generate a figure unless it comes from a bound source or user input. Unsourced figures are blocked or marked.
3. **Grounding.** Viewer Q&A and predicted answers retrieve only from the deck and its cited sources.
4. **Data handling.** Customer content is never used for model training. Sensitivity labels control which content may be sent to a hosted model. A private-model path is available for restricted data.
5. **Reversibility.** Every AI operation is an undoable step in history.

**Evaluation.** Each AI capability has a test set built from real LLU decks (with permission). Targets for the first release: at least 90% of AI-proposed outlines accepted with minor edits, under 1% of drafted slides containing an unsupported figure, and search top-3 recall of at least 95% on a labeled query set. These targets are starting points to revise after the first measurements.

## 7. Import, export, and interoperability

Migration decides adoption. Nobody will rebuild ten years of decks, so PPTX import quality is a P0 feature at every stage.

**PPTX import**

- Convert text boxes, tables, images, charts, speaker notes, and master slide styles into blocks and themes.
- Infer each slide's claim and evidence from titles and structure; mark low-confidence inferences for review.
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
| Canvas via LTI 1.3 | Publish course material, grade passback | 2 |
| Teams, Outlook | Share, schedule, present | 2 |
| Entra ID SSO | Institutional identity and roles | 3 |
| SharePoint, OneDrive | File storage and data sources | 3 |
| SQL warehouse, REST APIs | Data bindings | 3 |
| Public API and MCP server | Let other tools and agents create or update decks | 3 |

## 8. Non-functional requirements

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
| Security | Magic Link login, role-based access, audit log of views, edits, exports, and AI calls | 1 |
| Privacy | No training on customer content; configurable data retention; data export and deletion on request | 1 |
| Privacy | Version .3 uses non-sensitive content only. A HIPAA agreement with the host, or a move to Azure, is required before patient information may appear; student data is handled for FERPA | 1 |
| Compliance | VPAT and HECVAT documentation prepared before first external sale | 3 |
| Compliance | SOC 2 Type I within 12 months of first customer, Type II after | 3 |
| Scalability | Multi-tenant design from the start, even with one tenant | .3 |
| Browser support | Current Chrome, Edge, Safari, Firefox; tablet-friendly presenting | .3 |
| Observability | Logging of AI quality signals (accepts, rejects, edits) without storing content where avoidable | 1 |

## 9. Architecture and technical approach

Build a standalone web app on Vercel and Supabase, with a structured deck model at the center and a self-contained offline package for presenting.

&#91;embedded content: architecture · 3 clients, 6 services, 3 back ends\]

Clients reach one deck service; AI calls, storage, and outside systems sit behind it, so models and sources can change without touching the editor.

| Decision | Choice | Reason |
| --- | --- | --- |
| Hosting | Vercel for the web app, Supabase for database, auth, storage, realtime | One managed stack; no servers to run; Claude Code works well with both |
| Login | Supabase Magic Link, with a transactional email service for delivery | No passwords; SSO (Entra ID) added in a later stage |
| Tenancy | Tenant ID on every record, enforced by Row Level Security | Multi-tenant from day one, even with one tenant |
| Deck model | Typed block tree stored as operations | Gives history, claim-level diffs, and later co-editing |
| Layout | Rules from theme tokens, run in the browser | Instant reflow; same logic reused for export |
| Search | Per-slide embeddings computed at save; index bundled into the offline package | Semantic jump works with no network |
| Audience response | Supabase Realtime channels per session | Live polls and Q&A without running a WebSocket server |
| Slow jobs | PPTX import, export, and AI drafting run as background jobs with progress shown | Avoids serverless time limits (verify current limits) |
| Data sources | Excel or CSV upload, linked to charts | Light for now; SQL and API bindings later |
| Portability | Standard Postgres; avoid vendor-specific features where practical | Keeps a later move to Azure a migration, not a rewrite |

**Constraints for version .3**

- Use non-sensitive content only until the hosting plan includes a HIPAA agreement or the product moves to Azure.
- Create the Vercel, Supabase, email, and domain accounts under a transferable organization, since LLU will own the product.
- Vercel's free tier is, to my understanding, limited to non-commercial use; confirm terms and plan on a paid tier.

## 10. Success metrics, risks, and roadmap

**Roadmap**

1. **Version .3 (you).** Structured editor, outline-first drafting, basic PPTX import, non-linear live mode, offline package, audience Q&A with slide matching, simple polls. Gate: you present from it weekly for 8 weeks.
2. **Stage 1 (LLU admins).** Excel and CSV data bindings, provenance and consistency checks, themes, variants, claim-level review, roles and audit log. Gate: 5 admins each ship 3 real decks.
3. **Stage 2 (faculty).** Bulk import, handouts, accessibility remediation, image attribution, Canvas via LTI, quizzes. Gate: 20 faculty active; Canvas passback working.
4. **Stage 3 (external).** Multi-tenant admin console, SSO and SCIM, public API and MCP, HECVAT and VPAT. Pricing and billing are out of scope until this stage is planned.

**Success metrics**

| Metric | Target | Stage |
| --- | --- | --- |
| Weekly decks authored by you | At least 1 per week for 8 weeks | .3 |
| Time to first draft from goal to outline | Under 5 minutes | .3 |
| Legacy decks imported without repair | 80% (revisit given "basic" import) | .3 |
| Q&A questions matched to the right slide in top 3 | 90% on a labeled set | .3 |
| Number or claim errors caught before a board meeting | Tracked per deck | 1 |
| Accessibility checks passing at export | 95% | 2 |

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Ownership unclear between you and LLU | Blocks adoption and any later sale | Written agreement now, including a license-back or assignment path for selling |
| Patient or student data enters decks on a non-compliant host | Privacy breach | Non-sensitive content only in .3; BAA plan or Azure move before Stage 1 real data |
| Generic AI output makes forgettable decks | Low adoption | Outline-first workflow, strong defaults, easy overrides |
| Import quality too low | Users abandon | Import report, freeform fallback, quality score, early testing on real decks |
| Wrong slide appears on voice command | Public embarrassment | Presenter-only preview, confirm gate, never-show flag |
| Audience abuse or off-topic submissions | Disrupted sessions | Moderation queue, rate limits, rotating codes |
| Built entirely with AI-assisted coding | Hidden defects, security gaps | Tests, code review passes, security checklist, staged rollout |
| Vendor lock-in | Costly later move | Standard Postgres, open file format |

**Open questions**

- [ ] Does LLU need a formal agreement covering ownership and a future commercial sale?
- [ ] Which hosting plans include a HIPAA agreement, and at what cost?
- [ ] Does "basic import" need a higher bar once real faculty decks are tested?
- [ ] Which Canvas features does LLU allow (LTI tools, grade passback)?
- [ ] Who owns data sources for admin reports, and how are they exported today?
