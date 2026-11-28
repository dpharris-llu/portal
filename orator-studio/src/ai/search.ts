/**
 * Claude writes the database search (F-119) from the author's words and the
 * argument's purpose. The author sees and can edit the search before it runs.
 */
import { z } from "zod";
import type { Provider } from "@/find/types";
import { LIVE, CATALOG } from "@/find/catalog";

// PubMed accepts long queries; a query cut short would be wrong, so the limit is generous.
export const SearchPlan = z.object({ query: z.string().max(4000), broader: z.string().max(4000).optional(), note: z.string().max(600) });
export type SearchPlan = z.infer<typeof SearchPlan>;

export function searchPlanPrompt(o: { provider: Provider; want: string; purpose: string; thesis: string }): string {
  const syntax =
    o.provider === "europepmc"
      ? "PubMed query syntax: each concept in parentheses with its synonyms joined by OR, concepts joined by AND; use [tiab] for title/abstract words and [MeSH Terms] where a MeSH heading clearly fits; quoted phrases are fine. Do NOT add publication-type, date or language filters; the app adds those. Prefer a precise query that returns tens to hundreds of results, not thousands."
      : o.provider === "openalex"
        ? "OpenAlex search: plain keywords for the main concepts (3 to 8 words), no field tags or brackets; quoted phrases are fine."
        : "ClinicalTrials.gov term search: a few plain keywords for the condition and intervention, no boolean operators.";
  return [
    "Write one database search for an author building an evidence-based argument.",
    `Database: ${o.provider === "europepmc" ? "PubMed" : o.provider === "openalex" ? "OpenAlex (scholarly works in every field)" : "ClinicalTrials.gov"}`,
    syntax,
    `The argument's purpose: ${o.purpose || "not stated"}`,
    `Thesis so far: ${o.thesis || "none yet"}`,
    `What the author is looking for: ${o.want}`,
    "",
    o.provider === "europepmc"
      ? "Also give broader: the same search without its narrowest concept (for example without the population or setting), for when the exact topic has no reviews. Leave it out if the search has only one concept."
      : "",
    o.provider === "europepmc"
      ? 'Reply with only JSON: {"query":"...","broader":"...","note":"one sentence on what the search targets"}'
      : 'Reply with only JSON: {"query":"...","note":"one sentence on what the search targets"}',
  ].join("\n");
}

/**
 * Discover's plan (F-020, F-121, F-122): the searches, and which catalog
 * sources fit the topic, each with a reason. The author sees the choice and
 * can change it before or after the search runs.
 */
export const DiscoverPlan = z.object({
  query: z.string().max(4000),
  broader: z.string().max(4000).optional(),
  words: z.string().max(300),
  note: z.string().max(600),
  sources: z.array(z.object({ id: z.string().max(40), use: z.boolean(), why: z.string().max(300) })).max(20),
});
export type DiscoverPlan = z.infer<typeof DiscoverPlan>;

export function discoverPlanPrompt(o: { topic: string; purpose: string; thesis: string }): string {
  const live = LIVE.map((s) => `- ${s.id}: ${s.name} (${s.owner}). Covers: ${s.covers}.`).join("\n");
  const planned = CATALOG.filter((s) => s.status === "planned").map((s) => s.name).join(", ");
  return [
    "Plan the discovery searches for an author building an evidence-based presentation.",
    `Topic: ${o.topic}`,
    `Purpose: ${o.purpose || "not stated"}`,
    `Message so far: ${o.thesis || "none yet"}`,
    "",
    "Sources that can be searched:",
    live,
    `(Not yet available: ${planned}. Don't choose these.)`,
    "",
    "1. For each source above, decide whether it fits this topic: use true or false, with a short reason the author will read (under 20 words). Choose PubMed for anything touching health or medicine. Choose OpenAlex when the topic reaches beyond biomedicine (education, social science, business, policy, ethics, religion, engineering) or when PubMed alone would miss part of it. Choose ClinicalTrials.gov and NCBI Bookshelf only for clinical or health topics.",
    "2. query: the PubMed search. Each concept in parentheses with its synonyms joined by OR, concepts joined by AND; use [tiab] for title/abstract words and [MeSH Terms] where a MeSH heading clearly fits. No publication-type, date or language filters. Aim for tens to hundreds of results.",
    "3. broader: the same PubMed search without its narrowest concept (population or setting), for when the exact topic has no reviews. Leave it out if the search has only one concept.",
    "4. words: plain keywords for OpenAlex and ClinicalTrials.gov (3 to 8 words, no brackets or field tags).",
    "5. note: one sentence on what the searches target.",
    'Reply with only JSON: {"query":"...","broader":"...","words":"...","note":"...","sources":[{"id":"pubmed","use":true,"why":"..."}]}',
  ].join("\n");
}
