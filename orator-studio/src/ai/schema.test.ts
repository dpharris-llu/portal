import { describe, expect, it } from "vitest";
import { z } from "zod";
import { forAnthropic, outputSchema } from "./schema";
import { PaperReading, Synthesis, SynthesisRequest } from "./evidence";
import { Analysis } from "./analysis";
import { ProbeAnswer } from "./probe";
import { MessageCandidates } from "./messages";
import { Proposal } from "./argument";
import { SearchPlan } from "./search";
import { Outline } from "./outline";

const FORBIDDEN = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern", "$schema"];

function walk(v: unknown, path: string, found: string[]) {
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`, found));
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(o)) {
    if (k !== "properties" && FORBIDDEN.includes(k)) found.push(`${path}.${k}`);
    if (k === "minItems" && typeof x === "number" && x > 1) found.push(`${path}.minItems=${x}`);
    if (k === "properties") Object.entries(x as Record<string, unknown>).forEach(([n, s]) => walk(s, `${path}.${n}`, found));
    else walk(x, `${path}.${k}`, found);
  }
  if (o.type === "object" && o.properties && o.additionalProperties !== false) found.push(`${path} (object not closed)`);
}

describe("schemas sent to Anthropic", () => {
  // Every schema the app sends as structured output.
  const all = { PaperReading, Synthesis, Analysis, ProbeAnswer, MessageCandidates, Proposal, SearchPlan, Outline };
  for (const [name, schema] of Object.entries(all)) {
    it(`${name} uses only what structured output accepts`, () => {
      const found: string[] = [];
      walk(outputSchema(schema as z.ZodType), name, found);
      expect(found).toEqual([]);
    });
  }

  it("keeps field names that look like keywords, and the limits still hold on the way back", () => {
    const S = z.object({ maximum: z.string().max(3), items: z.array(z.number().int().min(1)).max(2) });
    expect(forAnthropic(z.toJSONSchema(S))).toMatchObject({ type: "object", additionalProperties: false, properties: { maximum: { type: "string" }, items: { type: "array", items: { type: "integer" } } } });
    expect(S.safeParse({ maximum: "toolong", items: [1] }).success).toBe(false);
    expect(S.safeParse({ maximum: "ok", items: [1, 2, 3] }).success).toBe(false);
    expect(SynthesisRequest.safeParse({}).success).toBe(false);
  });
});

import { fitToLimits } from "./schema";
import { SearchPlan as Plan } from "./search";
import { ProbeAnswer as Answer } from "./probe";

describe("fitToLimits", () => {
  it("trims over-long text instead of rejecting a paid answer", () => {
    const v = fitToLimits(Plan, { query: "a", note: "x".repeat(2000) }) as { note: string };
    expect(v.note.length).toBe(600);
    expect(Plan.safeParse(v).success).toBe(true);
  });
  it("trims lists and reaches into union branches", () => {
    const raw = { answer: "ok", cites: [], proposals: Array.from({ length: 12 }, () => ({ why: "w", action: { kind: "set_thesis", text: "t".repeat(900) } })) };
    const v = fitToLimits(Answer, raw) as { proposals: Array<{ action: { text: string } }> };
    expect(v.proposals).toHaveLength(8);
    expect(v.proposals[0].action.text.length).toBe(400);
    expect(Answer.safeParse(v).success).toBe(true);
  });
});

import { DiscoverPlan, discoverPlanPrompt } from "./search";
describe("discover plan", () => {
  it("is accepted by structured output and lists only live sources as choices", () => {
    const s = JSON.stringify(outputSchema(DiscoverPlan));
    expect(s).not.toMatch(/maxLength|maxItems/);
    const p = discoverPlanPrompt({ topic: "t", purpose: "", thesis: "" });
    expect(p).toContain("- openalex: OpenAlex");
    expect(p).not.toContain("- datacommons:");
  });
});
