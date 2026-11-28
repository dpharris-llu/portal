/**
 * Claude's observations on a topic (F-132, F-118): what the topic's facts
 * show, citing them by short id (F1, F2…), and, kept apart, Claude's view from
 * general knowledge. Claude never asserts: the author decides what to assert,
 * in their own words. The app checks every observation: citations must be
 * facts of the topic, and every number must appear in the facts cited.
 */
import { z } from "zod";
import { numbersNotOn } from "@/evidence/text";

export const ObservationAnswer = z.object({
  observation: z.string().max(3000),
  cites: z.array(z.string().max(8)).max(40),
  general_knowledge: z.string().max(1500).optional(),
  gaps: z.array(z.string().max(300)).max(6),
});
export type ObservationAnswer = z.infer<typeof ObservationAnswer>;

export const ObserveRequest = z.object({
  topic: z.string().min(1).max(300),
  description: z.string().max(1000).default(""),
  question: z.string().max(1000).default(""),
  facts: z.array(z.object({ ref: z.string().max(8), text: z.string().max(1200), source: z.string().max(300), kind: z.string().max(30), checked: z.boolean() })).max(200),
  assertions: z.array(z.string().max(600)).max(40).default([]),
});
export type ObserveRequest = z.infer<typeof ObserveRequest>;

export const SUMMARY_QUESTION = "What do these facts show, taken together? What is established, what is new, what is contested, and what is unknown?";
export const challengeQuestion = (assertion: string) => `Challenge this, using the facts: "${assertion}". What cuts against it, what qualifies it, and what would have to be true for it to hold?`;

export function observePrompt(r: ObserveRequest): string {
  return [
    "You help an author make sense of the evidence on a topic. You make observations; you never make assertions for the author. The author will decide what to assert, in their own words.",
    `Topic: ${r.topic}${r.description ? ` (${r.description})` : ""}`,
    "",
    "Facts on this topic (id, then the fact, then its source; [unchecked] means typed by the author, not verified; [scripture] is a Bible passage: authoritative for faith, not research evidence):",
    ...r.facts.map((f) => `${f.ref}. ${f.text} (${f.source})${f.checked ? "" : " [unchecked]"}${f.kind === "scripture" ? " [scripture]" : ""}`),
    r.assertions.length ? `\nThe author's assertions so far:\n${r.assertions.map((a) => `- ${a}`).join("\n")}` : "",
    "",
    r.question ? `The author asks: ${r.question}` : `The author asks: ${SUMMARY_QUESTION}`,
    "",
    "- observation: answer from the facts above only, citing them inline like [F2]. Plain sentences, 3 to 8. Every number you write must appear in a fact you cite. If the facts don't answer it, say so.",
    "- cites: the ids you cited.",
    "- general_knowledge: only if useful, what you know beyond these facts, in 1 to 3 sentences. It will be shown labeled as your general knowledge, not evidence. Leave it out otherwise. Never put numbers or study findings here.",
    "- gaps: what is missing that the author might search for (0 to 4 short phrases).",
    "Don't write 'you should assert' or suggest wording for an assertion.",
    'Reply with only JSON: {"observation":"...","cites":["F1"],"general_knowledge":"...","gaps":["..."]}',
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** Check an observation against the facts it was given: unknown citations, numbers not in the facts cited. */
export function checkObservation(a: ObservationAnswer, facts: { ref: string; text: string }[]): { cites: string[]; problems: string[] } {
  const byRef = new Map(facts.map((f) => [f.ref.toUpperCase(), f.text]));
  const inline = [...a.observation.matchAll(/\[(F\d+)\]/gi)].map((m) => m[1].toUpperCase());
  const cites = [...new Set([...a.cites.map((c) => c.toUpperCase()), ...inline])];
  const problems: string[] = [];
  const unknown = cites.filter((c) => !byRef.has(c));
  if (unknown.length) problems.push(`cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "isn't a fact" : "aren't facts"} on this topic`);
  const known = cites.filter((c) => byRef.has(c));
  const plain = a.observation.replace(/\[F\d+\]/gi, " ");
  const missing = numbersNotOn(plain, known.map((c) => byRef.get(c)!));
  if (missing.length) problems.push(`${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} in the facts it cites`);
  if (a.general_knowledge && /\d/.test(a.general_knowledge.replace(/\b(19|20)\d{2}\b/g, ""))) problems.push("its general-knowledge note contains numbers, which can't be checked");
  return { cites: known, problems };
}
