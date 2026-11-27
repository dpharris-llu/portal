# LecternAI (version .3 scaffold)

A presentation platform that stores a deck as structured content (claims, evidence and intent) and generates the layout from it. This folder is the version .3 (Stage 0) starting point described in the product spec.

## Run it

```bash
cd lectern
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (model, theme, layout, search, presenter, checks, import, audience)
# With a local Supabase running, also compare the two audience stores:
# SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_SERVICE_KEY=<service role key> npm test
npm run typecheck
```

With no environment variables, the app runs in **local mode**. There's no login, and decks are saved in the browser. Click **Open demo deck** to try it.

To sign in and sync, copy `.env.example` to `.env.local` and fill in:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Magic Link login, cloud storage of decks, and audience sessions over Realtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only, and required with the two above. Audience sessions are written with it. |
| `ANTHROPIC_API_KEY` | Outline drafting with Claude. Without it, a built-in template outline is used. |

### Setting up a Supabase project

1. Create a project, then apply the migrations in `supabase/migrations/` in order (`npx supabase link` then `npx supabase db push`, or paste them into the SQL editor).
2. **Authentication → URL configuration:** add `https://<your-domain>/auth/callback` as a redirect URL.
3. **Realtime → Settings:** turn off "Allow public access", so only the private, access-checked channels work.
4. Set the three Supabase variables above in Vercel (or `.env.local`).

To run the same stack locally with Docker: `npx supabase start`, which prints the local URL and keys.

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
| `src/audience/` | Audience sessions: polls (multiple choice, rating, ranking, short text, word cloud), Q&A with upvotes, moderation, a profanity filter, one response per device, rate limits, room lock. Two stores behind one interface: in memory with Server-Sent Events (local mode), and Postgres with Supabase Realtime. A parity test runs the same scenario through both. | 5A |
| `src/ai/` | Outline prompt and schema, a template fallback, and the Claude call (`claude-opus-5-5`, structured JSON output, server-side refusal fallback). | F-001, F-002 |
| `src/app/` | Pages: deck list, new deck (goal → outline review → approve), import, editor, presenter, audience window, phone join pages (`/join`, `/j/<code>`), login, and the auth callback. | |
| `supabase/migrations/` | `0001`: tenants, memberships with roles, decks, and an append-only `deck_ops` table, with Row Level Security on every table; each new user gets a personal tenant. `0002`: audience session tables and the functions that enforce the rules. `0003`: who may use which Realtime channel. | 8, 9 |

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
| Magic Link login | Built. Sign-in, the login redirect and cloud saving were tested against a local Supabase stack; the email itself was not sent in tests. |
| A-01 to A-05: audience response | Built. Join by QR code or short code, five poll types with live results on the slide, moderated Q&A with upvotes, and question-to-slide matching that opens a private preview. Tested end to end against a local Supabase stack, including 300 simultaneous participants. |

## How live sessions work with Supabase

Phones and the presenter call the app's API routes. The routes write to Postgres through the functions in `0002_live.sql`, using the service role, so rules such as one response per device hold even with many server instances. After each change, the server pings the presenter on a private Realtime channel (`live-host:<session>`). The presenter's browser fetches the new state and publishes the public room view (open poll, approved questions) to phones on `live-room:<code>`, at most a few times a second. A burst of votes therefore becomes a few broadcasts, not one per vote per phone. Only the session's presenter may listen to the host channel or publish to the room; this was checked with forged messages from a phone and from another signed-in user. Phones and the presenter also refetch every so often, in case a message is missed.

Without Supabase, sessions stay in the server's memory and stream over Server-Sent Events. That works only on a single server, which is fine for local use.

Images from imported decks are stored in the browser (IndexedDB). They don't sync to the cloud yet, so an imported deck opened on another device shows "Image not on this device".

## Notes

- Theme colors come from the spec's table. A test checks every contrast ratio in that table, and all of them match to within rounding. Sky blue `#6699cc` is 3.003:1, which only just passes for large text and chart marks.
- The LLU fonts, logo colors and clearance rules are still placeholders, as the spec says.
- Version .3 is for non-sensitive content only (spec 9). Nothing here is set up for patient or student data.
