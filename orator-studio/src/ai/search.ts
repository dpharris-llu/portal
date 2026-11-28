/**
 * Claude writes the database search (F-119) from the author's words and the
 * argument's purpose. The author sees and can edit the search before it runs.
 */
import { z } from "zod";
import type { Provider } from "@/find/types";

export const SearchPlan = z.object({ query: z.string().max(500), note: z.string().max(400) });
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
    'Reply with only JSON: {"query":"...","note":"one sentence on what the search targets"}',
  ].join("\n");
}
