/**
 * Claude proposes an argument outline (F-002): a thesis and points from the
 * author's purpose, audience, takeaway and their own notes. Proposals only;
 * the author keeps, edits or drops each point. No numbers are invented
 * (guardrail 2): where a point needs a figure, Claude writes a placeholder.
 */
import { z } from "zod";

export const ProposeRequest = z.object({
  purpose: z.string().max(2000),
  audience: z.string().max(1000).default(""),
  takeaway: z.string().max(1000).default(""),
  thesis: z.string().max(1000).default(""),
  /** The author's existing points, so Claude builds on them instead of replacing them. */
  points: z.array(z.object({ text: z.string().max(500), detail: z.string().max(2000).default(""), evidence: z.array(z.string().max(1000)).max(20).default([]) })).max(40).default([]),
  notes: z.string().max(20000).default(""),
});
export type ProposeRequest = z.infer<typeof ProposeRequest>;

export const Proposal = z.object({
  thesis: z.string(),
  points: z.array(z.object({ text: z.string(), intent: z.enum(["inform", "persuade", "decide"]), detail: z.string(), keepsExisting: z.number().int().optional() })),
  openQuestions: z.array(z.string()),
});
export type Proposal = z.infer<typeof Proposal>;

export function proposePrompt(r: ProposeRequest): string {
  return [
    "Help an author organize their thinking into an argument before any slides exist.",
    "",
    `Purpose (what should happen because of this): ${r.purpose || "not stated"}`,
    `Audience: ${r.audience || "not stated"}`,
    `Key takeaway: ${r.takeaway || "not stated"}`,
    `Current thesis: ${r.thesis || "none yet"}`,
    "",
    r.points.length
      ? ["The author's points so far (numbered from 1):", ...r.points.map((p, i) => `${i + 1}. ${p.text}${p.detail ? ` (${p.detail})` : ""}${p.evidence.length ? ` [evidence: ${p.evidence.join("; ")}]` : " [no evidence yet]"}`)].join("\n")
      : "The author has no points yet.",
    ...(r.notes ? ["", "The author's notes:", r.notes] : []),
    "",
    "Return:",
    "- thesis: the one sentence the whole argument supports, sharper than the current one if you can make it so",
    "- points: the argument in order, each a conclusion written as a headline (under 12 words), its intent (inform, persuade or decide), and detail: one or two sentences on why it matters to this audience and what evidence would support it. Keep the author's points and their wording where they work; set keepsExisting to the number of the author's point a point keeps or refines. Each point should follow from the one before, and the last should lead to the decision or action the purpose implies.",
    "- openQuestions: what the author would need to find out to make the argument hold",
    "",
    "Do not invent numbers, statistics, studies, dates or names. Where a point needs a figure, write a placeholder such as [figure: readmissions last year] so the author supplies the real value from a source.",
  ].join("\n");
}

/** The fallback when Claude isn't connected: a classic arc for the author to fill in. */
export function templateProposal(r: Pick<ProposeRequest, "purpose" | "takeaway">): Proposal {
  return {
    thesis: r.takeaway,
    points: [
      { text: "Where we are today", intent: "inform", detail: "The current situation and what is not working." },
      { text: "Why it matters now", intent: "persuade", detail: "The cost of waiting and who is affected." },
      { text: "What we propose", intent: "persuade", detail: "The plan and what it takes." },
      { text: r.purpose ? `The decision: ${r.purpose}` : "The decision we need", intent: "decide", detail: "What you are asking this audience to do." },
    ],
    openQuestions: [],
  };
}
