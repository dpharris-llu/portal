/**
 * Candidate messages (F-024): two or three messages the facts can support,
 * each with the points that would carry it, every point tied to active facts.
 * Checked like probe proposals: facts must be active, numbers must appear in
 * the facts cited. The author picks, edits or writes their own.
 */
import { z } from "zod";
import { activeFacts, type Argument } from "@/model/argument";
import { numbersNotOn } from "@/evidence/text";
import { probePrompt, type ProbeRequest } from "./probe";

const Point = z.object({ text: z.string().max(300), intent: z.enum(["inform", "persuade", "decide"]), detail: z.string().max(800), factIds: z.array(z.string().max(12)).max(12) });
export const MessageCandidates = z.object({
  candidates: z.array(z.object({ message: z.string().max(400), why: z.string().max(600), points: z.array(Point).max(8) })).max(3),
});
export type MessageCandidates = z.infer<typeof MessageCandidates>;

export const MESSAGES_QUESTION = [
  "Propose two or three different candidate messages for this presentation: each one sentence the whole presentation could support, given the facts and the occasion.",
  "Make them genuinely different (for example a decision-focused one, a cautious one that reflects the limits of the evidence, and a teaching-focused one), and only as strong as the facts allow.",
  "For each, give why (one sentence on when it is the right choice) and 3 to 6 points in order that would carry it: each point a conclusion written as a headline (under 12 words), its intent, a one-sentence detail, and the factIds that support it.",
  "Every number in a message or point must appear in the facts it cites. A point with no supporting facts is allowed only if it is clearly needed; give it no factIds and say in the detail what evidence it needs.",
].join(" ");

export function messagesPrompt(r: ProbeRequest): string {
  // Same context as a probe (active facts only, the occasion, earlier probes), with its own output shape.
  const base = probePrompt({ ...r, question: MESSAGES_QUESTION });
  const cut = base.indexOf("Rules:");
  return [
    base.slice(0, cut),
    "Rules:",
    "- Use only the facts above. Never add numbers from outside them.",
    "- Respect what the author discarded: those sources and facts are not listed and must not be referred to.",
    "",
    'Reply with only JSON: {"candidates":[{"message":"...","why":"...","points":[{"text":"...","intent":"persuade","detail":"...","factIds":["F1","F3"]}]}]}',
  ].join("\n");
}

const plain = (s: string) => s.replace(/\[?\b[FS]\d+\b\]?/g, " ").replace(/\b(points?|slides?|steps?)\s+\d+\b/gi, " ");

export interface CheckedCandidate {
  message: string;
  why: string;
  problems: string[];
  points: { text: string; intent: "inform" | "persuade" | "decide"; detail: string; factIds: string[]; problems: string[] }[];
}

export function verifyMessages(a: Argument, r: MessageCandidates): CheckedCandidate[] {
  const facts = activeFacts(a);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const src = new Map((a.sources ?? []).map((s) => [s.id, s]));
  const textOf = (ids: string[]) => ids.flatMap((id) => (byId.get(id) ? [`${byId.get(id)!.text} ${byId.get(id)!.quote ?? ""} ${src.get(byId.get(id)!.sourceId)?.sample ?? ""} ${src.get(byId.get(id)!.sourceId)?.year ?? ""} ${src.get(byId.get(id)!.sourceId)?.short ?? ""}`] : []));
  const all = facts.map((f) => f.id);
  return r.candidates.map((c) => {
    const missing = numbersNotOn(plain(c.message), textOf(all));
    return {
      message: c.message,
      why: c.why,
      problems: missing.length ? [`${missing.join(", ")} not in the facts`] : [],
      points: c.points.map((p) => {
        const unknown = p.factIds.filter((id) => !byId.has(id));
        const nums = numbersNotOn(plain(`${p.text} ${p.detail}`), textOf(p.factIds.filter((id) => byId.has(id))));
        return {
          ...p,
          factIds: p.factIds.filter((id) => byId.has(id)),
          problems: [...(unknown.length ? [`uses ${unknown.join(", ")}, not active facts`] : []), ...(nums.length ? [`${nums.join(", ")} not in the facts cited`] : [])],
        };
      }),
    };
  });
}
