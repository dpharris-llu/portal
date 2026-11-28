/**
 * Claude writes the database search (F-119) from the author's words and the
 * argument's purpose. The author sees and can edit the search before it runs.
 */
import { z } from "zod";
import type { Provider } from "@/find/types";

// PubMed accepts long queries; a query cut short would be wrong, so the limit is generous.
export const SearchPlan = z.object({ query: z.string().max(4000), broader: z.string().max(4000).optional(), note: z.string().max(600) });
export type SearchPlan = z.infer<typeof SearchPlan>;

export function searchPlanPrompt(o: { provider: Provider; want: string; purpose: string; thesis: string }): string {
  const syntax =
    o.provider === "europepmc"
      ? "PubMed query syntax: each concept in parentheses with its synonyms joined by OR, concepts joined by AND; use [tiab] for title/abstract words and [MeSH Terms] where a MeSH heading clearly fits; quoted phrases are fine. Do NOT add publication-type, date or language filters; the app adds those. Prefer a precise query that returns tens to hundreds of results, not thousands."
      : "ClinicalTrials.gov term search: a few plain keywords for the condition and intervention, no boolean operators.";
  return [
    "Write one database search for an author building an evidence-based argument.",
    `Database: ${o.provider === "europepmc" ? "PubMed" : "ClinicalTrials.gov"}`,
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
