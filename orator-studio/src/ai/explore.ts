/**
 * Explore an idea (Discover, spec 3): Claude helps shape a loose idea into
 * what to look for. Everything here is Claude's general knowledge, labeled
 * as such and never evidence: an overview, the questions worth asking, what
 * is debated, suggested topics for the Topic Library, and searches to run.
 * The author finds the evidence; Claude only points the way.
 */
import { z } from "zod";

export const Exploration = z.object({
  overview: z.string().max(1500),
  questions: z.array(z.string().max(300)).max(8),
  debated: z.array(z.string().max(300)).max(6),
  topics: z.array(z.object({ name: z.string().max(120), keywords: z.array(z.string().max(40)).max(8), why: z.string().max(300) })).max(6),
  searches: z.array(z.object({ words: z.string().max(200), why: z.string().max(200) })).max(6),
});
export type Exploration = z.infer<typeof Exploration>;

export const ExploreRequest = z.object({
  idea: z.string().min(2).max(1000),
  existingTopics: z.array(z.string().max(200)).max(200).default([]),
});
export type ExploreRequest = z.infer<typeof ExploreRequest>;

export function explorePrompt(r: ExploreRequest): string {
  return [
    "An author has an idea for a presentation or study and isn't yet sure what they want to say. Help them explore it before they look for evidence.",
    `The idea: ${r.idea}`,
    r.existingTopics.length ? `Topics already in their library (suggest these again only if they fit; don't create near-duplicates): ${r.existingTopics.join("; ")}` : "",
    "",
    "Everything you write is your general knowledge, shown to the author labeled as such, never as evidence. Don't cite studies, numbers or quotations: the author will find and check the evidence themselves.",
    "- overview: 3 to 5 sentences on what the idea touches and why it matters, in plain language.",
    "- questions: the 4 to 8 questions worth answering, each answerable from evidence.",
    "- debated: 2 to 6 points where informed people disagree or the evidence is thin.",
    "- topics: 2 to 5 topics for their topic library, each a short name (a subject, not a claim), 3 to 6 keywords, and why it belongs.",
    "- searches: 3 to 6 searches to run, each as plain keywords (3 to 8 words) and why.",
    'Reply with only JSON: {"overview":"...","questions":["..."],"debated":["..."],"topics":[{"name":"...","keywords":["..."],"why":"..."}],"searches":[{"words":"...","why":"..."}]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}
