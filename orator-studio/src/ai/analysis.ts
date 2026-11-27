/**
 * Claude's analysis of confirmed document figures (F-013). Shared by the page
 * (asking Claude on the viewer's claude.ai account) and the server route
 * (asking with an API key). Claude must show how it got every number it
 * writes; `verifyAnalysis` recomputes each one from the confirmed figures, so
 * an insight whose numbers don't check out never reaches the deck unnoticed.
 */
import { z } from "zod";
import type { DataSource } from "@/model/types";

export const AnalysisRequest = z.object({
  goal: z.string().max(1000).default(""),
  periods: z.array(z.string().max(60)).min(1).max(60),
  rows: z
    .array(
      z.object({
        label: z.string().max(200),
        unit: z.enum(["currency", "percent", "number"]),
        values: z.array(z.number().nullable()),
        typed: z.array(z.boolean()),
      }),
    )
    .min(1)
    .max(40),
  checks: z.array(z.string().max(400)).max(10).default([]),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequest>;

const Operand = z.object({ row: z.string(), period: z.string().optional() });
const NumberUse = z.object({
  text: z.string(),
  op: z.enum(["value", "sum", "mean", "min", "max", "difference", "percent_change", "share"]),
  operands: z.array(Operand),
});
export const Analysis = z.object({
  insights: z.array(
    z.object({
      headline: z.string(),
      detail: z.string(),
      rows: z.array(z.string()),
      numbers: z.array(NumberUse),
      suggestion: z.string().optional(),
    }),
  ),
  nextSteps: z.array(z.string()),
});
export type Analysis = z.infer<typeof Analysis>;
export type NumberUse = z.infer<typeof NumberUse>;

export function requestFromSource(src: DataSource, goal: string, checks: string[] = []): AnalysisRequest {
  return {
    goal,
    periods: src.documents.map((d) => d.period),
    rows: src.series.map((s) => ({
      label: s.label,
      unit: s.unit,
      values: s.figures.map((f) => f.value),
      typed: s.figures.map((f) => Boolean(f.entered)),
    })),
    checks,
  };
}

export function analysisPrompt(req: AnalysisRequest): string {
  const data = {
    periods: req.periods,
    rows: req.rows.map((r) => ({ label: r.label, unit: r.unit, values: r.values, ...(r.typed.some(Boolean) ? { typedByPresenter: r.typed } : {}) })),
  };
  return [
    "You are helping a presenter turn figures from their own documents into a short deck. They confirmed every figure below.",
    "",
    `What the deck is for: ${req.goal.trim() || "not stated; infer a sensible purpose from the figures"}`,
    "",
    "Figures as JSON. Each row is one labeled figure across the periods, in period order. Values are as printed in the documents, so some rows are printed as negative amounts (payments, credits). null means the document had no such figure. typedByPresenter marks values the presenter typed in.",
    JSON.stringify(data),
    "",
    req.checks.length ? `Checks already verified: ${req.checks.join(" ")}` : "",
    "",
    "Write the analysis a thoughtful analyst would give this presenter: what stands out and why it matters for the deck's purpose, how the rows relate, what could explain a pattern (as a question to check, never as a fact), and what to do next. Give 3 to 6 insights, most important first, and 2 to 4 next steps.",
    "",
    "Rules:",
    "- Use only these figures. No outside facts, benchmarks, or guesses stated as facts.",
    "- Every number you write must be a figure above or computed from them with ONE operation: value, sum, mean, min, max, difference, percent_change, or share. List each number in that insight's numbers array: the exact text you wrote, the operation, and its operands. An operand is {row, period}; leave out period to mean the whole row (all its periods).",
    "  value: one operand with a period. sum, mean, min, max: over the operands. difference: first minus second. percent_change: from the first to the second, in percent. share: first as a percent of the second.",
    "- Write money like $1,234.56 and percents like 12%. Refer to periods exactly by their labels. Do not write years except inside period labels.",
    "- Next steps may only repeat numbers already used in an insight.",
    "- Plain language, short sentences. Headlines under 12 words. Address the presenter as you.",
    "",
    'Reply with only JSON in this shape: {"insights":[{"headline":"...","detail":"...","rows":["row label"],"numbers":[{"text":"$5,348.43","op":"sum","operands":[{"row":"Credits"}]}],"suggestion":"..."}],"nextSteps":["..."]}',
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ---- Verification ----

/** "$1,234.56" -> {value: 1234.56, tol: 0.005}; "12%" -> {12, 0.5}. Null if not a number. */
export function parseStated(text: string): { value: number; tol: number } | null {
  const m = text.replace(/−/g, "-").match(/-?\(?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\)?/);
  if (!m) return null;
  const decimals = m[2] ? m[2].length - 1 : 0;
  return { value: Number(m[1].replace(/,/g, "") + (m[2] ?? "")), tol: 0.5 * 10 ** -decimals + 1e-9 };
}

function compute(req: AnalysisRequest, use: NumberUse): number | string {
  const rowOf = (name: string) => req.rows.find((r) => r.label.toLowerCase() === name.trim().toLowerCase());
  const resolve = (o: { row: string; period?: string }): number[] | string => {
    const r = rowOf(o.row);
    if (!r) return `unknown row "${o.row}"`;
    if (o.period === undefined) return r.values.filter((v): v is number => v !== null);
    const i = req.periods.findIndex((p) => p.toLowerCase() === o.period!.trim().toLowerCase());
    if (i < 0) return `unknown period "${o.period}"`;
    const v = r.values[i];
    return v === null ? `${o.row} has no figure for ${o.period}` : [v];
  };
  const lists: number[][] = [];
  for (const o of use.operands) {
    const r = resolve(o);
    if (typeof r === "string") return r;
    lists.push(r);
  }
  const all = lists.flat();
  const one = (k: number) => lists[k]?.reduce((a, b) => a + b, 0);
  if (!all.length) return "no figures to compute from";
  switch (use.op) {
    case "value":
      return lists.length === 1 && lists[0].length === 1 ? lists[0][0] : "value needs one figure";
    case "sum":
      return all.reduce((a, b) => a + b, 0);
    case "mean":
      return all.reduce((a, b) => a + b, 0) / all.length;
    case "min":
      return Math.min(...all.map(Math.abs)) * (all.every((v) => v <= 0) ? -1 : 1);
    case "max":
      return Math.max(...all.map(Math.abs)) * (all.every((v) => v <= 0) ? -1 : 1);
    case "difference":
      return lists.length === 2 ? Math.abs(one(0)) - Math.abs(one(1)) : "difference needs two operands";
    case "percent_change": {
      if (lists.length !== 2) return "percent_change needs two operands";
      const from = Math.abs(one(0)), to = Math.abs(one(1));
      return from === 0 ? "percent change from zero" : ((to - from) / from) * 100;
    }
    case "share": {
      if (lists.length !== 2) return "share needs two operands";
      const whole = Math.abs(one(1));
      return whole === 0 ? "share of zero" : (Math.abs(one(0)) / whole) * 100;
    }
  }
}

/** Numbers written in prose, leaving out years and the numbers inside period labels. */
function numbersIn(text: string, periods: string[]): string[] {
  let t = text;
  for (const p of [...periods].sort((a, b) => b.length - a.length)) t = t.split(p).join(" ");
  return (t.match(/-?\$?\d[\d,]*(\.\d+)?%?/g) ?? []).filter((n) => !/^(19|20)\d\d$/.test(n.replace(/[^\d]/g, "")) || /[$%.,]/.test(n));
}

export interface CheckedInsight {
  headline: string;
  detail: string;
  rows: string[];
  suggestion?: string;
  verified: boolean;
  /** Why it could not be verified, for the author. */
  problems: string[];
  checkedCount: number;
}

export interface CheckedAnalysis {
  insights: CheckedInsight[];
  nextSteps: { text: string; verified: boolean; problems: string[] }[];
}

export function verifyAnalysis(req: AnalysisRequest, a: Analysis): CheckedAnalysis {
  const counts = new Set(Array.from({ length: req.periods.length + 1 }, (_, k) => k)); // "3 of 10 periods"
  const proven: { value: number; tol: number }[] = [];

  const insights = a.insights.map((ins): CheckedInsight => {
    const problems: string[] = [];
    const ok: { value: number; tol: number }[] = [];
    const listed: { value: number; tol: number }[] = [];
    for (const use of ins.numbers) {
      const stated = parseStated(use.text);
      if (!stated) {
        problems.push(`"${use.text}" is not a number`);
        continue;
      }
      listed.push(stated);
      const got = compute(req, use);
      if (typeof got === "string") problems.push(`${use.text}: ${got}`);
      else if (Math.abs(Math.abs(got) - stated.value) > stated.tol + 1e-6 * Math.abs(got)) problems.push(`${use.text} should be ${Math.round(Math.abs(got) * 100) / 100}`);
      else ok.push(stated);
    }
    for (const n of numbersIn(`${ins.headline} ${ins.detail} ${ins.suggestion ?? ""}`, req.periods)) {
      const p = parseStated(n);
      if (!p) continue;
      if (!n.includes("$") && !n.includes("%") && Number.isInteger(p.value) && counts.has(p.value)) continue;
      if (!listed.some((o) => Math.abs(o.value - p.value) <= Math.max(o.tol, p.tol))) problems.push(`${n} is not shown how it was worked out`);
    }
    proven.push(...ok);
    return { headline: ins.headline, detail: ins.detail, rows: ins.rows, suggestion: ins.suggestion, verified: problems.length === 0, problems, checkedCount: ok.length };
  });

  const nextSteps = a.nextSteps.map((text) => {
    const problems = numbersIn(text, req.periods)
      .map((n) => ({ n, p: parseStated(n) }))
      .filter(({ n, p }) => p && !(!n.includes("$") && !n.includes("%") && Number.isInteger(p.value) && counts.has(p.value)))
      .filter(({ p }) => !proven.some((o) => Math.abs(o.value - p!.value) <= Math.max(o.tol, p!.tol)))
      .map(({ n }) => `${n} does not come from a checked insight`);
    return { text, verified: problems.length === 0, problems };
  });
  return { insights, nextSteps };
}
