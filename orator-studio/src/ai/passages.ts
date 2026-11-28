/**
 * Finding Bible passages on a theme (F-123). Claude proposes references with
 * a reason for each; it never supplies the wording. The app fetches every
 * reference's text from API.Bible in the author's version, so a passage that
 * doesn't exist is caught and nothing is quoted from memory. The author reads
 * and chooses.
 */
import { z } from "zod";

export const PassageIdeas = z.object({
  passages: z.array(z.object({ reference: z.string().max(60), why: z.string().max(300), caution: z.string().max(300).optional() })).max(14),
  note: z.string().max(600),
});
export type PassageIdeas = z.infer<typeof PassageIdeas>;

export const PassageRequest = z.object({
  theme: z.string().min(2).max(500),
  topic: z.string().max(500).default(""),
  message: z.string().max(1000).default(""),
  already: z.array(z.string().max(60)).max(60).default([]),
});
export type PassageRequest = z.infer<typeof PassageRequest>;

export function passagePrompt(r: PassageRequest): string {
  return [
    "Suggest Bible passages for an author preparing a presentation or Bible study.",
    `What they are looking for: ${r.theme}`,
    r.topic ? `The presentation's topic: ${r.topic}` : "",
    r.message ? `Its message so far: ${r.message}` : "",
    r.already.length ? `Already in their workspace (don't repeat): ${r.already.join("; ")}` : "",
    "",
    "Give 6 to 10 passages that speak most directly to this, from across Scripture where they exist (law, history, wisdom, prophets, gospels, letters). Prefer short, self-contained passages (1 to 8 verses).",
    "For each: reference in the form Book Chapter:Verse or Book Chapter:Verse–Verse (for example Mark 2:27 or Isaiah 58:13–14); why: one sentence (under 25 words) on how it speaks to the theme, without quoting it; caution: only when its relevance depends on a particular interpretation or its context changes its meaning, say so in one sentence.",
    "Include a passage that complicates or balances the theme if one exists, and say so in its why.",
    "Never quote the text of any verse: the app fetches the wording itself. Never invent references; if unsure a verse says what you think, leave it out.",
    "note: one sentence on how the passages are spread or what is missing.",
    'Reply with only JSON: {"passages":[{"reference":"...","why":"...","caution":"..."}],"note":"..."}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}
