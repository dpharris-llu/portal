# LecternAI (version .3 scaffold)

A presentation platform that stores a deck as structured content (claims, evidence and intent) and generates the layout from it. This folder is the version .3 (Stage 0) starting point described in the product spec.

## Run it

```bash
cd lectern
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (model, theme, layout, search, presenter, checks)
npm run typecheck
```

With no environment variables, the app runs in **local mode**. There's no login, and decks are saved in the browser. Click **Open demo deck** to try it.

To sign in and sync, copy `.env.example` to `.env.local` and fill in:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Magic Link login and cloud storage. Apply `supabase/migrations/0001_init.sql` first. In Supabase Auth settings, add `<your-origin>/auth/callback` as a redirect URL. |
| `ANTHROPIC_API_KEY` | Outline drafting with Claude. Without it, a built-in template outline is used. |

## Layout of the code

| Path | What it is | Spec |
| --- | --- | --- |
| `src/model/` | Deck, slide and block types. Every edit is an operation with author, time and reason. Undo appends inverse operations, so the log is a full audit trail and replays to the current deck. | 3, 6 (guardrail 5) |
| `src/theme/` | LLU palette as tokens with PMS and CMYK values. WCAG contrast math. Rules 1 to 4: body-text blocking with the nearest compliant color, safe uses computed against the background, chart series ordering with outlines, and white or black text on fills. | 3A |
| `src/layout/engine.ts` | Rule-based layout (statement, quote, visual, split, stack, grid), shrink-to-fit with overflow warnings, flow around freeform regions, and a per-slide override. Pure, so export can reuse it. | 3, F-003 to F-005 |
| `src/search/` | Local BM25 search over claims, content, notes, table cells and chart labels, with prefix matching. Has a hook for blending in embeddings. | L-01, L-02 (partial), L-10 |
| `src/present/` | Presenter state machine: private preview, send, return-to-place, blank, never-show-on-voice, and confirm-before-showing. The audience window syncs over `BroadcastChannel` with no server. | L-04 to L-06, L-09 |
| `src/checks/` | Missing alt text, unsourced charts, `[figure: …]` placeholders, AI content awaiting review, and layout overflow. | F-010, guardrail 2 |
| `src/import/` | PPTX import: text, bullets with indent levels, tables, images with alt text, bar and line charts with their data, and notes. Hidden slides go to backup. Unconverted items are listed in a report and flagged on their slides. `scripts/make-fixture.py` rebuilds the test deck. | F-006, 7 |
| `src/audience/` | Audience sessions: polls (multiple choice, rating, ranking, short text, word cloud), Q&A with upvotes, moderation, a profanity filter, one response per device, rate limits, room lock. Includes the server store and live streams. | 5A |
| `src/ai/` | Outline prompt and schema, a template fallback, and the Claude call (`claude-opus-5-5`, structured JSON output, server-side refusal fallback). | F-001, F-002 |
| `src/app/` | Pages: deck list, new deck (goal → outline review → approve), import, editor, presenter, audience window, phone join pages (`/join`, `/j/<code>`), login, and the auth callback. | |
| `supabase/migrations/` | Tenants, memberships with roles, decks, and an append-only `deck_ops` table. Row Level Security on every table. Each new user gets a personal tenant. | 8, 9 |

## Status against version .3 (Stage 0)

| Item | Status |
| --- | --- |
| F-001, F-002: deck from goal; outline approved before slides | Built |
| F-003, F-004: theme-driven layout; structured editor with live reflow | Built |
| F-005: freeform region | Partial. A region can be reserved and content flows around it, but there's no editor yet for blocks inside it. |
| F-006: PPTX import | Built (basic, per the spec). Text, bullets, tables, images, bar and line charts, and notes convert. SmartArt, other chart types, embedded objects and animations are reported, not converted. The report gives a quality score and a per-slide review list. |
| F-007: PPTX and PDF export | Not started |
| F-008: non-linear live mode | Built: Ctrl/Cmd+K search, private preview, return-to-place, top-3 matches, never-show-on-voice and confirm flags. Voice (L-03) uses the browser's speech recognition where it exists. |
| F-009, L-10: offline presenting package | Partial. Decks are cached in the browser and presenting needs no server, but there's no service worker or self-contained HTML export yet. |
| F-010: contrast and alt-text checks | Built |
| F-011: notes and rehearsal timer | Notes are built. The timer counts narrative time and detour time separately; there's no rehearsal mode yet. |
| L-02: semantic matching | Hook only. Search is lexical until per-slide embeddings are added. |
| Magic Link login | Built. It needs a Supabase project to try. |
| A-01 to A-05: audience response | Built. Join by QR code or short code, five poll types with live results on the slide, moderated Q&A with upvotes, and question-to-slide matching that opens a private preview. Tested with 300 simultaneous participants on one server. **See the hosting note below.** |

## Hosting note for audience response

Live sessions are held in the server's memory and streamed to phones with Server-Sent Events. That works on a single server (`npm run dev`, `npm start`, or one container), which is enough to try it on a laptop with phones on the same network. It will **not** work on Vercel's serverless hosting, where requests land on different instances. Before using it on Vercel, the session store in `src/audience/store.ts` needs a Supabase version (Postgres tables plus Supabase Realtime, as the spec plans). The API routes and pages only use the store's interface, so they won't change.

Images from imported decks are stored in the browser (IndexedDB). They don't sync to the cloud yet, so an imported deck opened on another device shows "Image not on this device".

## Notes

- Theme colors come from the spec's table. A test checks every contrast ratio in that table, and all of them match to within rounding. Sky blue `#6699cc` is 3.003:1, which only just passes for large text and chart marks.
- The LLU fonts, logo colors and clearance rules are still placeholders, as the spec says.
- Version .3 is for non-sensitive content only (spec 9). Nothing here is set up for patient or student data.
