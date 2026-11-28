# OratorStudio: status, decisions and open items

Last updated: November 28, 2026. The product spec ([`product-spec.md`](product-spec.md)) says what OratorStudio should be; [`deployment.md`](deployment.md) says how it is set up. This file records where the work stands, the decisions made along the way and why, and what is open, so progress isn't lost between working sessions.

## Where it runs

- **Live site:** https://orator-studio-dusky.vercel.app (Vercel project `dpharris-llu/orator-studio`), deployed automatically from branch `claude/wonderful-lamport-y0ycay` of `dpharris-llu/portal`, which is the repository's default branch.
- **Database and sign-in:** Supabase project `orators-studio` (us-east-2). Sign-up is closed: people join by invitation.
- **Keys in Vercel:** Supabase (URL, publishable key, secret key), `ANTHROPIC_API_KEY`, `OPENALEX_API_KEY`, `API_BIBLE_KEY`. Optional: `NCBI_API_KEY`, `AI_MONTHLY_BUDGET_USD`.

## What is built (version .3)

**Curate**
- A presentation starts from a topic. The workspace holds sources and facts (short ids S2, F7), each fact quoted and checked against its source; sources and facts can be discarded with a reason and restored.
- **Discover** (F-020, F-121, F-122): Claude plans the searches and proposes which sources fit the topic, with a reason for each; the author can change the choice, which is saved. Sections: strongest evidence and newest studies (PubMed), research in all fields (OpenAlex), ongoing trials (ClinicalTrials.gov), government reports (NCBI Bookshelf). Each run is kept as a search record; the latest three keep their results, so a reload doesn't lose them.
- **Reading sources:** papers (full text from PubMed Central or the abstract), uploaded PDFs, data URLs; Claude proposes facts with quotes, or the author ticks sentences.
- **Probing** (F-118): questions to Claude answered only from the workspace's facts, with checked citations and proposals the author accepts or dismisses.
- **Message and outline:** candidate messages with points, from the facts.
- **Scripture** (F-123, F-128): Bible passages found by theme (Claude proposes references; the app fetches the wording in NIV, NKJV, NLT or KJV through API.Bible) or by words, looked up by reference, or The Passion Translation typed by the author. Word study shows the Greek or Hebrew of any verse and every occurrence of a word (STEPBible data).

**Build, Present, Engage:** slides drafted from the outline, layout from the LLU theme, PPTX import, presenter with search and private preview, live polls and Q&A from phones (see the README's status table).

**Platform**
- **Claude usage and cost** (F-114): every request recorded (person, presentation, task, model, tokens, cost); `/usage`; optional monthly limit per person.
- **Invitations** (F-126): `/people` for administrators: invite by email, see last sign-in and Claude cost per person, block or restore, make administrators.

## Decisions and why

| Decision | Why |
| --- | --- |
| **The knowledge model** (spec section 5, F-130 to F-141): a personal **Body of Knowledge** (sources have facts), a **Topic Library** (topics have assertions), **assertions supported by facts** (many to many, each link marked supports / qualifies / contradicts), and **presentations** with a purpose and an audience, made from a series of topics with the assertions that suit them | Knowledge is curated once and reused across presentations; evidence and interpretation stay apart. Decided by the product owner on November 28, 2026; replaces "each presentation owns its workspace and one message" |
| **Five modules: Discover, Curate, Build, Present, Engage** | Finding evidence is a different activity from making sense of it. Discover owns the Body of Knowledge (sources and facts; explore an idea, find evidence); Curate owns the Topic Library (topics, observations, assertions); Build makes presentations. Two ways in: start in Build when you know what you want to say, or in Discover when you're exploring |
| **Ingestion engine** (F-143 to F-147) | Scholars have a large body of work: their writing (papers, books, sermons, lectures, decks, drafts) and collected papers are read into the Body of Knowledge and a proposed Topic Library; what they wrote counts as their assertions, quoted and cited; the works they cited become sources worth exploring. Runs in the background at batch prices; personal for now |
| **Claude observes; people assert** | Observations come from the author or Claude, labeled by who made them; Claude may offer observations, labeling its general knowledge separately; a person types every assertion in their own words ("Do you agree? How would you say this?"). Nobody edits another person's assertion: collaborators comment or write an enhanced assertion |
| **Start fresh** for the knowledge model | Nothing is in real use yet; existing presentations and decks are deleted and the database rebuilt |
| Four modules: **Curate → Build → Present → Engage** | "Curate" names what the author does with evidence: gather, judge, keep, discard. It replaced "Research" and "Discover". |
| Vocabulary: a **presentation** has one **message** and several **points**; Curate produces the **outline** | Plain words an author uses; "argument" and "thesis" sounded combative. (The code still says `Argument` internally.) |
| The premise is the **desire for evidence-based presentations** | Not fear of being wrong. Tagline: "Curate the evidence. Hone your message. Each point backed by evidence, every fact traceable to its source." |
| **Claude proposes, the data confirms** | Everywhere: quotes checked word for word, numbers checked against cited facts, Bible wording fetched rather than recalled, Greek and Hebrew from STEPBible data. The author accepts every fact. |
| **Models: Sonnet 5.5 as standard, Haiku 5.5 for low-stakes work** (search plans) | Chosen by the product owner after seeing real costs. One table: `src/ai/models.ts`. Fallback to another model on a refusal is on for Sonnet. |
| **Track every Claude request's cost** | "This can get very expensive very fast." Estimates at list prices; the Claude Console is the bill. Measured: search plan about $0.0005 (Haiku), paper read $0.02–0.07, question about $0.04; roughly $3–5 per student research paper. |
| **Source scope in layers:** the catalog (product owner and developer), the institution (later), the presentation (author) | Any topic needs a curated set of trustworthy sources, not the open web. Admission rule: authority, verifiability, access, coverage gain, cost and upkeep, privacy. |
| **Scripture and faith tradition is its own kind of evidence** | Verifiable like a source, but authoritative for faith, not science: labeled so a slide never presents it as a research finding. |
| **Bible versions: NIV, NKJV, NLT** through API.Bible's free non-commercial plan; **TPT** typed by the author and labeled a paraphrase | The product owner's preferred versions; TPT has no API. API.Bible's terms are built in (copyright lines, link, usage reporting, 30-day refresh). The NKJV cap is 5,000 monthly users. |
| **Invite-only; only administrators invite; invitees get their own private space** | Protects the Claude budget and privacy. Sharing a single presentation comes later (F-127). |
| **Learning mode for students** (F-209, F-210) | When the goal is teaching research, students read and summarize; Claude coaches instead of reading; instructors see the record. |
| The database was redesigned to fit the model | Presentations own their curation and slides; every change is an operation in an append-only log. |

## Waiting on the product owner

- **Run in Supabase** (if not done): `supabase/make-admin.sql` with your address.
- **Custom SMTP in Supabase** before inviting colleagues: Authentication → Emails → SMTP Settings (LLU mail or a transactional provider). The built-in sender is for testing.
- **Optional:** `AI_MONTHLY_BUDGET_USD` in Vercel; a spending limit in the Claude Console; `NCBI_API_KEY`; a Data Commons API key (`DATACOMMONS_API_KEY`) when statistics are built.
- **Decisions open in the spec** (section 13): co-authors' Claude limits (F-127), learning-mode defaults (F-209), the evaluation topics, EGW API terms (F-124), LLU licenses for commentaries and lexicons.

## Next, in order

0. **Rebuild on the knowledge model**: phases A (database and data layer), B (Discover), C (Curate) and D (Build) are done. The live database was switched to the knowledge model on November 28, 2026 (0004, 0005 and 0006 run). Next: E, ingestion. Older flows not yet on the new model: documents and data URLs make decks without keeping sources; the old Curate components remain in the code until a cleanup.
   **Review the knowledge model in the spec** (sections 2, 3, 5 and F-130 to F-147), then rebuild onto it (F-141), including the ingestion engine.
1. **The talk** (in a few days): use the live site; fix only what the dry run shows.
2. **A slight redesign** (requested; scope to be agreed).
3. **Word study:** follow a concept across related words (Claude suggests, data confirms); spell out grammar codes.
4. **Bible study** as an output type: study guide with questions, discussion prompts, leader notes.
5. **Statistics:** Data Commons source.
6. **Ellen G. White's writings** (F-124) once the Estate's API terms are confirmed; Adventist news (F-125).
7. **Collaborating on a presentation** (F-127); learning mode (F-209, F-210).
8. **Cost:** prompt caching for questions; medium effort for paper reading, tested against quality.
9. **Evaluation set** of 25–30 topics to decide which sources to add next.

## Working notes

- The development sandbox reaches outside sites only through its allow list (environment settings → Network access). Added so far: OpenAlex, Data Commons, API.Bible, the NLT API, The Passion Translation, EGW Writings, Adventist news sites, GitHub raw files, STEPBible.
- Fixtures in tests are made up. Personal data (for example the credit card statements discussed early on) never goes into the repository, the demo or outside services.
- Version .3 is for non-sensitive content only.
