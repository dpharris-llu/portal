# OratorStudio (version .3)

*Ideas first. Slides follow.* · Create. Present. Engage.

An AI-native platform for evidence-based presentations: **Curate** the evidence, hone the message, **Build** the slides, **Present** and **Engage**. Each point is backed by evidence, every fact traceable to its source. This folder is version .3 (Stage 0) of the product spec, [`docs/product-spec.md`](docs/product-spec.md).

**The knowledge model** (spec section 5): `src/knowledge/` (types, rules, the Supabase and local backends, the repository), `src/discover/` and `src/app/discover/` (the Body of Knowledge), `src/curate/` and `src/app/curate/` (the Topic Library), `src/app/build/p/` and `src/build/fromPresentation.ts` (presentations and their slides), `supabase/migrations/0006_knowledge.sql` and `scripts/test-db.sh`.

**Where things stand, decisions made, and what's open: [`docs/status.md`](docs/status.md).** Setup and keys: [`docs/deployment.md`](docs/deployment.md).

## Run it

```bash
cd orator-studio
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (model, theme, layout, search, presenter, checks, import, audience)
# With a local Supabase running, also compare the two audience stores:
# SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_SERVICE_KEY=<service role key> npm test
npm run typecheck
```

`npm run demo` builds a browser-only demo into one file, `demo/dist/index.html`: the same pages with no server, so outlines use the template and audience polls and Q&A are off.

With no environment variables, the app runs in **local mode**. There's no login, and decks are saved in the browser. Click **Open demo deck** to try it.

To sign in and sync, copy `.env.example` to `.env.local` and fill in:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Magic Link login, cloud storage of decks, and audience sessions over Realtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only, and required with the two above. Audience sessions are written with it. |
| `ANTHROPIC_API_KEY` | Claude on the server: outlines, analysis, reading papers. Without it, Claude works only inside claude.ai, and outlines use a template. |
| `AI_MONTHLY_BUDGET_USD` | Optional. A monthly limit on the estimated Claude cost, per person (each person has their own tenant). |
| `OPENALEX_API_KEY` | Optional, server only. Your own OpenAlex daily allowance for "Research in all fields". |
| `API_BIBLE_KEY` | Server only. API.Bible key (Starter plan, non-commercial) for NIV, NKJV, NLT passages. |
| `NCBI_API_KEY` | Optional, server only. A free key from NCBI raises PubMed's limit from about 3 to 10 requests a second and makes it yours rather than shared with the host's address. Discovery works without it, a little slower. |
| `SOURCE_ALLOWED_HOSTS` | Comma-separated hosts that data URL sources may be fetched from, such as `api.open-meteo.com`. Empty means any public host. |
| `REQUIRE_SIGN_IN` | Set to `1` on a public server other than Vercel. Without sign-in, the Claude and URL-fetch routes then switch off (on Vercel this is automatic). |

### Setting up a Supabase project

1. Create a project, then apply the migrations in `supabase/migrations/` in order (`npx supabase link` then `npx supabase db push`), or paste `supabase/setup-all.sql` into the SQL Editor: it resets the database (deleting app data) and creates everything. Regenerate it from `supabase/reset.sql` and the migrations when either changes. Step by step: [`docs/deployment.md`](docs/deployment.md).
2. **Authentication → URL configuration:** add `https://<your-domain>/auth/callback` as a redirect URL.
3. **Realtime → Settings:** turn off "Allow public access", so only the private, access-checked channels work.
4. Set the three Supabase variables above in Vercel (or `.env.local`).

To run the same stack locally with Docker: `npx supabase start`, which prints the local URL and keys.

## Deploy to Vercel

Step by step, with the current live setup, the environment variables and their Vercel types (Config or Secret), and what to do if a key leaks: [`docs/deployment.md`](docs/deployment.md). Live site: https://orator-studio-dusky.vercel.app

## Layout of the code

| Path | What it is | Spec |
| --- | --- | --- |
| `src/model/` | Deck, slide and block types. Every edit is an operation with author, time and reason. Undo appends inverse operations, so the log is a full audit trail and replays to the current deck. | 5, 9 (guardrail 5) |
| `src/theme/` | LLU palette as tokens with PMS and CMYK values. WCAG contrast math. Rules 1 to 4: body-text blocking with the nearest compliant color, safe uses computed against the background, chart series ordering with outlines, and white or black text on fills. | Appendix A |
| `src/layout/engine.ts` | Rule-based layout (statement, quote, visual, split, stack, grid), shrink-to-fit with overflow warnings, flow around freeform regions, and a per-slide override. Pure, so export can reuse it. | 5, F-003 to F-005 |
| `src/model/argument.ts` | The Research argument and its workspace: purpose, thesis, points with evidence, sources and facts with short ids (S2, F7), probes, discard and restore. Operations with inverses, like decks. | 3, F-016, F-118 |
| `src/research/`, `src/components/research/` | Research workspace: the probe panel, sources and facts with discard, Find sources, upload a PDF, read-or-pick facts, the brief, and links from the documents, data and papers flows. | F-002, F-016, F-118, F-119 |
| `src/find/` | Find sources: the source catalog (`catalog.ts`), PubMed (NIH E-utilities), OpenAlex (all fields), Europe PMC (reports and preprints) and ClinicalTrials.gov; the Bible through API.Bible (`bible.ts`, `bible-server.ts`); word study over STEPBible data (`wordstudy.ts`). Fixed endpoints only; full texts from PubMed Central become checkable sections. Test fixtures are made up. | F-020, F-119, F-121, F-123, F-128 |
| `src/evidence/` | Research papers: two-column PDF text, quote and number checks against the page, the cross-paper deck. | F-015 |
| `src/documents/`, `src/sources/` | Figures from PDFs, data URL sources (JSON, XML, CSV) with snapshots and refresh, the server fetcher with its safeguards. | F-012 to F-014 |
| `src/build/` | Drafting slides from an argument, with points left out going to backup. | F-003 |
| `src/search/` | Local BM25 search over claims, content, notes, table cells and chart labels, with prefix matching. Has a hook for blending in embeddings. | L-01, L-02 (partial), L-10 |
| `src/present/` | Presenter state machine: private preview, send, return-to-place, blank, never-show-on-voice, and confirm-before-showing. The audience window syncs over `BroadcastChannel` with no server. | L-04 to L-06, L-09 |
| `src/checks/` | Missing alt text, unsourced charts, `[figure: …]` placeholders, AI content awaiting review, and layout overflow. | F-010, guardrail 2 |
| `src/import/` | PPTX import: text, bullets with indent levels, tables, images with alt text, bar and line charts with their data, and notes. Hidden slides go to backup. Unconverted items are listed in a report and flagged on their slides. `scripts/make-fixture.py` rebuilds the test deck. | F-006, 10 |
| `src/audience/` | Audience sessions: polls (multiple choice, rating, ranking, short text, word cloud), Q&A with upvotes, moderation, a profanity filter, one response per device, rate limits, room lock. Two stores behind one interface: in memory with Server-Sent Events (local mode), and Postgres with Supabase Realtime. A parity test runs the same scenario through both. | 8 |
| `src/ai/` | Prompts, schemas and checks for every Claude task: outlines, figure analysis, reading papers, cross-paper synthesis, probes, search planning. Claude is reached through the viewer's claude.ai account when the page runs there, otherwise through the server's API key (structured JSON output; which model does which task is set in `src/ai/models.ts`: Sonnet 5.5 as standard, Haiku 5.5 for search plans). | 9, F-013, F-015, F-118, F-119 |
| `src/app/` | Pages: home, the four module pages (`/research`, `/build`, `/present`, `/engage`), the argument workspace (`/research/<id>`), drafting from an argument (`/build/<id>`), documents, data URL and papers flows, import, editor, presenter, audience window, phone join pages (`/join`, `/j/<code>`), login and the auth callback. API routes under `/api`. | 3 |
| `src/ai/pricing.ts`, `src/ai/usage.ts`, `src/ai/usage-report.ts` | Claude usage and cost: token counts from every response (including fallback attempts), estimated cost at list prices, recorded per person, presentation and task; the optional monthly limit. Shown at `/usage`. | F-114 |
| `src/lib/people.ts` | Invitations and administrators: invite by email (creates the account and its private space), list people with last sign-in and Claude cost, block or restore access. Shown at `/people` to administrators. | F-126 |
| `public/wordstudy/`, `scripts/build-wordstudy.mjs` | Word-study data built from STEPBible (CC BY 4.0): each verse's Greek or Hebrew words, every occurrence of each word, brief definitions. Static files, no key. | F-128 |
| `src/lib/serverAccess.ts` | Who may use routes that spend money or fetch URLs: signed-in users with Supabase; on Vercel without sign-in, nobody. | 11 |
| `supabase/migrations/` | `0001`: tenants and memberships with roles; `presentations` (topic, curation) with the append-only `presentation_ops`; `decks`, each belonging to a presentation, with `deck_ops`; Row Level Security on every table; each new user gets a personal tenant. `0002`: audience session tables and the functions that enforce the rules. `0003`: who may use which Realtime channel. `0004`: the Claude usage record (`ai_usage`). `0005`: administrators and invitations. `reset.sql` removes it all; `setup-all.sql` is reset plus all migrations, for one paste into the SQL Editor; `make-admin.sql` makes the first administrator. | 11, 12 |

## Status against version .3 (Stage 0)

| Item | Status |
| --- | --- |
| F-001, F-002: argument outline in Research, approved before slides | Built |
| F-015, F-016, F-118, F-119: research papers, saved argument and brief, probing workspace with discard, Find sources | Built. Real Claude and the real databases were first used on the live site; earlier tests used stand-ins. |
| F-003, F-004: theme-driven layout; structured editor with live reflow | Built |
| F-005: freeform region | Partial. A region can be reserved and content flows around it, but there's no editor yet for blocks inside it. |
| F-006: PPTX import | Built (basic, per the spec). Text, bullets, tables, images, bar and line charts, and notes convert. SmartArt, other chart types, embedded objects and animations are reported, not converted. The report gives a quality score and a per-slide review list. |
| F-007: PPTX and PDF export | Not started |
| F-008: non-linear live mode | Built: Ctrl/Cmd+K search, private preview, return-to-place, top-3 matches, never-show-on-voice and confirm flags. Voice (L-03) uses the browser's speech recognition where it exists. |
| F-009, L-10: offline presenting package | Partial. Decks are cached in the browser and presenting needs no server, but there's no service worker or self-contained HTML export yet. |
| F-010: contrast and alt-text checks | Built |
| F-011: notes and rehearsal timer | Notes are built. The timer counts narrative time and detour time separately; there's no rehearsal mode yet. |
| L-02: semantic matching | Hook only. Search is lexical until per-slide embeddings are added. |
| Magic Link login | Built. Sign-in, the login redirect and cloud saving were tested against a local Supabase stack; the email itself was not sent in tests. |
| F-020, F-121, F-122: Discover with a source catalog | Built. Claude (Haiku) chooses which sources fit the topic with a reason each and writes the searches; the author's choice is saved with the presentation; each run is kept as a search record. OpenAlex adds research in all fields. |
| F-114: AI usage and cost | Built (version .3 part): every Claude request recorded with tokens and estimated cost; `/usage`; optional monthly limit. |
| F-123: Bible passages | Built: find passages by theme (Claude proposes references, the app fetches the text) or by words; look up by reference in NIV, NKJV, NLT (API.Bible) or KJV; TPT entered by the author. |
| F-126: invitations | Built: invite-only, administrators invite on `/people`. Needs custom SMTP in Supabase for sign-in emails to reach colleagues. |
| F-128: word study | Built: the original words of any verse with definitions, and every occurrence counted by book. Following a concept across related words is still to come. |
| A-01 to A-05: audience response | Built. Join by QR code or short code, five poll types with live results on the slide, moderated Q&A with upvotes, and question-to-slide matching that opens a private preview. Tested end to end against a local Supabase stack, including 300 simultaneous participants. |

## How live sessions work with Supabase

Phones and the presenter call the app's API routes. The routes write to Postgres through the functions in `0002_live.sql`, using the service role, so rules such as one response per device hold even with many server instances. After each change, the server pings the presenter on a private Realtime channel (`live-host:<session>`). The presenter's browser fetches the new state and publishes the public room view (open poll, approved questions) to phones on `live-room:<code>`, at most a few times a second. A burst of votes therefore becomes a few broadcasts, not one per vote per phone. Only the session's presenter may listen to the host channel or publish to the room; this was checked with forged messages from a phone and from another signed-in user. Phones and the presenter also refetch every so often, in case a message is missed.

Without Supabase, sessions stay in the server's memory and stream over Server-Sent Events. That works only on a single server, which is fine for local use.

Images from imported decks are stored in the browser (IndexedDB). They don't sync to the cloud yet, so an imported deck opened on another device shows "Image not on this device".

## Notes

- Theme colors come from the spec's table. A test checks every contrast ratio in that table, and all of them match to within rounding. Sky blue `#6699cc` is 3.003:1, which only just passes for large text and chart marks.
- The LLU fonts and clearance rules are still placeholders, as the spec says.
- **Wordmark:** "Orator" in navy (15.4:1 on white) and "Studio" in Regent Red (8.0:1). The brand card shows the name on black, but Regent Red on black is only 2.6:1, below the 3:1 minimum even for large text. A dark version needs a lighter red: `#cc0044` is 3.65:1 (large text only), `#e0335f` is 4.8:1. That choice is for LLU brand staff, so the app only uses the light version for now.
- Browser storage keys and channel names still start with `lectern`, the earlier working name, so decks already saved in a browser stay readable. Users never see them.
- Version .3 is for non-sensitive content only (spec 12). Nothing here is set up for patient or student data.
