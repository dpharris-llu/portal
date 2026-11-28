# Deploying OratorStudio

How the live site is set up, how to set it up again from scratch, and what to watch for. No secret values are recorded here, only where each one lives.

## Current setup (as of Nov 28, 2026)

| Piece | Where | Notes |
| --- | --- | --- |
| Code | GitHub `dpharris-llu/portal`, folder `orator-studio/` | Default branch: `claude/wonderful-lamport-y0ycay`. Every push to it redeploys the site. |
| Website | Vercel project `orator-studio`, team `dpharris-llu` (Hobby plan) | Live at https://orator-studio-dusky.vercel.app. Dashboard: https://vercel.com/dpharris-llu/orator-studio |
| Database and sign-in | Supabase project `orators-studio` (ref `nhssgqvpnibinejxebrz`), organization "dpharris-llu's Org" (Free plan), region East US (Ohio), `us-east-2` | Project URL: `https://nhssgqvpnibinejxebrz.supabase.co`. Database set up with `supabase/setup-all.sql` (the presentation model: `presentations`, `decks`, their logs, and the live-session tables). |
| Claude on the server | Not set up yet | Needs `ANTHROPIC_API_KEY` in Vercel. Decide first whose account it bills to (personal or LLU). |

The accounts are personal for now. The spec says LLU will own the product (section 9), so move the Vercel project and Supabase project to LLU-owned teams before others depend on them; both services support transferring a project.

## Environment variables

Set in Vercel → project → **Settings → Environment Variables** (https://vercel.com/dpharris-llu/orator-studio/settings/environment-variables). They apply to **Production**. A change takes effect only after a new deployment: **Deployments → ⋯ → Redeploy**.

Vercel marks each variable as **Config** (readable after saving) or **Secret** (hidden after saving). Use the type in this table. Vercel warns about any `NEXT_PUBLIC_` variable set as Secret: switch those to Config, and keep the `NEXT_PUBLIC_` prefix, because the browser part of the app reads those exact names.

| Variable | Type | Value comes from | What it does |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Supabase → Project Settings → API Keys (or the project home page): the Project URL | Sign-in, cloud storage, live sessions. Public by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Supabase → Project Settings → API Keys → **Publishable key** (`sb_publishable_…`) | Same. Public by design: row-level security protects the data. The variable keeps its old name; the new publishable key goes in it. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) | Server only. Writes audience sessions and the Claude usage record. Never in the browser, a chat or a screenshot. The new secret key goes in the old variable name. |
| `ANTHROPIC_API_KEY` | **Secret** | Claude Console (console.anthropic.com) → API keys | Claude on the server. Takes effect only when the Supabase variables are set, so only signed-in people can use it. Set a monthly spending limit in the console. |
| `AI_MONTHLY_BUDGET_USD` | Config | Your choice, for example `25` | Optional. A monthly limit on the estimated Claude cost, per tenant. When this month's estimate reaches it, Claude requests are refused until the 1st; the usage page warns at 80%. A safety net on top of the console's own spending limit. |
| `NCBI_API_KEY` | **Secret** | NCBI: sign in at ncbi.nlm.nih.gov → Account settings → **API Key Management** → Create | Optional. Raises PubMed's limit from about 3 to 10 requests a second, so discovery doesn't hit "too many requests" (429) on Vercel's shared addresses. The app already paces and retries without it. |
| `OPENALEX_API_KEY` | **Secret** | openalex.org: create a free account and API key | Optional. Raises OpenAlex's daily limit for the "Research in all fields" part of Discover. Without it, OpenAlex is searched with the free anonymous allowance. |
| `SOURCE_ALLOWED_HOSTS` | Config | Your choice, for example `api.open-meteo.com` | Hosts that data URL sources may be fetched from. Empty means any public host. Database searches (PubMed, Europe PMC, ClinicalTrials.gov) don't use this list. |
| `REQUIRE_SIGN_IN` | Config | `1` | Only for hosts other than Vercel: turns off Claude and URL fetching when sign-in isn't configured. Automatic on Vercel. |

Supabase's legacy `anon` and `service_role` keys also work in the same variables, but Supabase retires them in early 2027, so use the publishable and secret keys.

## Setting it up from scratch

### 1. Vercel
1. Make sure the GitHub repository's **default branch** contains the `orator-studio/` folder (GitHub → repo → Settings → General → Default branch). Vercel imports the default branch, and the Root Directory picker only lists folders on it.
2. Vercel → **Add New → Project** → **Import** `dpharris-llu/portal` (allow Vercel's GitHub app access to the repo if it isn't listed).
3. **Project Name:** `orator-studio`. **Root Directory:** `orator-studio`. **Application Preset:** **Next.js** (if it says "Other", choose Next.js). Leave build settings alone.
4. **Deploy.** With no variables, the site runs in local mode: each visitor's work stays in their own browser, and Claude and URL fetching are off.

### 2. Supabase
1. supabase.com → sign in with GitHub → **New project** (Free plan; a U.S. region). Save the generated database password somewhere safe.
2. **SQL Editor → New query:** paste all of `orator-studio/supabase/setup-all.sql` (GitHub → the file → "Copy raw file") and **Run**. The file first removes anything from an earlier setup (**all app data is deleted**; signed-in users are kept and get their workspace back), then creates everything. Supabase may warn that the query is destructive; confirm. **Table Editor** should then list 12 tables: `deck_ops`, `decks`, `live_devices`, `live_polls`, `live_questions`, `live_responses`, `live_sessions`, `live_votes`, `memberships`, `presentation_ops`, `presentations`, `tenants`.
3. **Authentication → URL Configuration:** Site URL `https://<your-vercel-address>`, and add the redirect URL `https://<your-vercel-address>/auth/callback`. Magic Link sign-in fails without these.
4. **Realtime → Settings:** turn off **Allow public access**, so only the private, access-checked channels work.
5. **Project Settings → API Keys:** copy the Project URL, the publishable key and the secret key (with the copy icon; the secret key is shown masked).

### 3. Connect them
1. Add the variables above in Vercel with the types shown.
2. **Redeploy.**
3. Open the site: the yellow "Local mode" banner is gone and the sign-in page appears. Sign in with the Magic Link.

Work created in local mode stays in that browser; it doesn't move into the cloud account.

## Changing the database

The database is defined by `supabase/migrations/` (0001 core: tenants, presentations, decks and their logs; 0002 and 0003: live sessions; 0004: the Claude usage record). A new migration that only adds a table, like 0004, can be pasted on its own into the SQL Editor without losing data. `supabase/reset.sql` removes everything the app created. `supabase/setup-all.sql` is reset.sql followed by the migrations, regenerated whenever either changes; pasting it rebuilds the database from scratch.

## Claude usage and cost

Which model does which task is set in one table, `src/ai/models.ts`: Claude Sonnet 5.5 is the standard, and Claude Haiku 5.5 (about 20 times cheaper) does low-stakes work whose result the author sees at once, such as search plans. Every Claude request the server makes is recorded in the `ai_usage` table: who asked, for which presentation, which task, which model answered (a refused request can fall back to another model, billed at that model's price), the tokens in, out and thinking, the time it took, Anthropic's request id, and an estimated cost at list prices (`src/ai/pricing.ts`). The **Claude usage** page (`/usage`, linked in the top bar) shows this month, each month, and the totals by presentation, task and model. Each request is also one `[ai-usage]` line in Vercel → Logs.

The estimate is for watching spend; the bill is in the Claude Console → **Usage** and **Cost**. Compare the two each month: the request ids match the console's. Claude used inside claude.ai runs on the person's own Claude plan and isn't recorded here. Database searches are free.

## Checks

- **Database connections:** open `https://<your-vercel-address>/api/sources/search`. It reports whether Europe PMC, PubMed, ClinicalTrials.gov and OpenAlex answer from Vercel, and how fast. On Nov 28, 2026: PubMed 136 ms, ClinicalTrials.gov 75 ms, Europe PMC 8.4 s (which is why paper searches go to PubMed first).
- **Sign-in emails:** Supabase's built-in email sender allows only a few emails an hour. Fine for one person; set up a transactional email service (Supabase → Authentication → Emails → SMTP) before inviting colleagues.
- **Free plans:** Vercel's Hobby plan is for personal, non-commercial use, so move to Pro or an LLU arrangement before colleagues rely on it. Supabase free projects pause after a period without use and need a click to resume. Check both providers' current terms.

## If a secret leaks

If the secret key (or any Secret variable) appears in a chat, screenshot, email or file:
1. Supabase → Project Settings → API Keys → **New secret key**.
2. Paste the new key into the Vercel variable (type **Secret**), save, and redeploy.
3. Delete the old secret key in Supabase.

The same applies to an Anthropic key: create a new one in the Claude Console, replace it in Vercel, redeploy, then delete the old one. Anthropic's commercial terms (including the API and enterprise agreements) don't use your content for training by default; replacing a leaked key is about keeping copies of the key out of places you don't control.

## Data rules for version .3

Non-sensitive content only (spec sections 11 and 12). Nothing here is set up for patient or student data. A HIPAA agreement with the hosts, or a move to Azure, comes first.
