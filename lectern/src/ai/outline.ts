/**
 * Outline drafting (F-001, F-002). The AI proposes; the user edits and approves
 * before any slide exists. Figures are not invented (guardrail 2): the prompt
 * forbids numbers that the user did not supply.
 */
import { z } from "zod";

export const OutlineRequest = z.object({
  goal: z.string().min(1).max(2000),
  audience: z.string().max(1000).default(""),
  timeLimitMin: z.number().int().min(1).max(240),
  takeaway: z.string().max(1000).default(""),
});
export type OutlineRequest = z.infer<typeof OutlineRequest>;

export const OutlineNode = z.object({
  claim: z.string(),
  intent: z.enum(["inform", "persuade", "decide"]),
  points: z.array(z.string()),
});
export type OutlineNode = z.infer<typeof OutlineNode>;

export const Outline = z.object({ nodes: z.array(OutlineNode) });
export type Outline = z.infer<typeof Outline>;

/** Roughly one slide per two minutes, between 3 and 25. */
export function targetSlideCount(minutes: number): number {
  return Math.max(3, Math.min(25, Math.round(minutes / 2)));
}

/** Used when no API key is set, or the call fails: a classic problem-solution-ask arc. */
export function templateOutline(req: OutlineRequest): Outline {
  const n = targetSlideCount(req.timeLimitMin);
  const nodes: OutlineNode[] = [
    { claim: req.takeaway || req.goal, intent: "inform", points: [`For: ${req.audience || "this audience"}`] },
    { claim: "Where we are today", intent: "inform", points: ["Current state", "What is not working"] },
    { claim: "Why it matters now", intent: "persuade", points: ["Cost of waiting", "Who is affected"] },
  ];
  for (let i = nodes.length; i < n - 2; i++) {
    nodes.push({ claim: `Supporting point ${i - 2}`, intent: "persuade", points: ["Evidence", "Example"] });
  }
  nodes.push({ claim: "What we propose", intent: "persuade", points: ["The plan", "What it takes"] });
  nodes.push({ claim: req.goal, intent: "decide", points: ["The decision we need", "Next steps"] });
  return { nodes: nodes.slice(0, Math.max(n, 3)) };
}

export function outlinePrompt(req: OutlineRequest): string {
  return [
    "Draft the narrative outline for a presentation. Each node becomes one slide.",
    "",
    `Goal: ${req.goal}`,
    `Audience: ${req.audience || "not specified"}`,
    `Time limit: ${req.timeLimitMin} minutes (aim for about ${targetSlideCount(req.timeLimitMin)} slides)`,
    `Key takeaway: ${req.takeaway || "not specified"}`,
    "",
    "For each node give:",
    "- claim: the single sentence the slide asserts, written as a headline (under 12 words)",
    "- intent: inform, persuade, or decide (what the presenter wants from the room)",
    "- points: 2 to 4 short evidence points the slide should carry",
    "",
    "Build an argument, not a list of topics: each claim should follow from the one before, and the last slide should ask for the decision or action the goal implies.",
    "Do not invent numbers, statistics, dates, or names. Where evidence needs a figure, write a placeholder such as [figure: enrollment change since 2024] so the author supplies the real value.",
  ].join("\n");
}
