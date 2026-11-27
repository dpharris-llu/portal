/**
 * Claude's analysis of confirmed figures (F-013): an argument for the deck's
 * purpose, not a summary. Claude returns a thesis and points (conclusion,
 * evidence, why it matters, possible drivers with how to check them, optional
 * general-knowledge context, confidence), a recommendation and next steps.
 * Every number taken from the figures carries a formula that the app
 * recomputes (see expr.ts). Numbers from Claude's general knowledge may appear
 * only in a point's context, are labeled as such, and are never checked.
 */
import { z } from "zod";
import type { DataSource } from "@/model/types";
import { evaluate } from "./expr";

export const AnalysisRequest = z.object({
  goal: z.string().max(1000).default(""),
  periods: z.array(z.string().max(60)).min(1).max(120),
  rows: z
    .array(
      z.object({
        label: z.string().max(200),
        unit: z.enum(["currency", "percent", "number"]),
        values: z.array(z.number().nullable()),
        typed: z.array(z.boolean()),
        /** "comparison": a target, budget or reference the presenter supplied. */
        role: z.enum(["data", "comparison"]).default("data"),
        comparesTo: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(40),
  checks: z.array(z.string().max(400)).max(10).default([]),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequest>;

const NumberUse = z.object({ text: z.string(), formula: z.string(), approx: z.boolean().optional() });
const External = z.object({ text: z.string(), about: z.string() });
const Point = z.object({
  conclusion: z.string(),
  evidence: z.string(),
  soWhat: z.string(),
  drivers: z.array(z.object({ hypothesis: z.string(), check: z.string() })),
  context: z.string().optional(),
  externalNumbers: z.array(External).optional(),
  rows: z.array(z.string()),
  numbers: z.array(NumberUse),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceReason: z.string(),
});
export const Analysis = z.object({
  thesis: z.string(),
  thesisNumbers: z.array(NumberUse).optional(),
  points: z.array(Point),
  recommendation: z.object({ action: z.string(), rationale: z.string(), tradeoffs: z.string(), numbers: z.array(NumberUse) }),
  nextSteps: z.array(z.string()),
});
export type Analysis = z.infer<typeof Analysis>;
export type NumberUse = z.infer<typeof NumberUse>;
export type Point = z.infer<typeof Point>;

export function requestFromSource(src: DataSource, goal: string, checks: string[] = []): AnalysisRequest {
  const label = (id?: string) => src.series.find((s) => s.id === id)?.label;
  return {
    goal,
    periods: src.documents.map((d) => d.period),
    rows: src.series.map((s) => ({
      label: s.label,
      unit: s.unit,
      values: s.figures.map((f) => f.value),
      typed: s.figures.map((f) => Boolean(f.entered)),
      role: s.role === "comparison" ? ("comparison" as const) : ("data" as const),
      ...(s.compareTo ? { comparesTo: label(s.compareTo) } : {}),
    })),
    checks,
  };
}

const SHAPE = `{"thesis":"...","thesisNumbers":[{"text":"...","formula":"..."}],
"points":[{"conclusion":"...","evidence":"...","soWhat":"...","drivers":[{"hypothesis":"...","check":"..."}],"context":"...","externalNumbers":[{"text":"...","about":"..."}],"rows":["row label"],"numbers":[{"text":"$22,773.77","formula":"[Purchases @ Jan 2026]"}],"confidence":"medium","confidenceReason":"..."}],
"recommendation":{"action":"...","rationale":"...","tradeoffs":"...","numbers":[]},
"nextSteps":["..."]}`;

export function analysisPrompt(req: AnalysisRequest): string {
  const data = {
    periods: req.periods,
    rows: req.rows.map((r) => ({
      label: r.label,
      unit: r.unit,
      role: r.role,
      ...(r.comparesTo ? { comparesTo: r.comparesTo } : {}),
      values: r.values,
      ...(r.typed.some(Boolean) ? { typedByPresenter: r.typed } : {}),
    })),
  };
  return [
    "You are an analyst helping a presenter build a short deck that argues a point. Your job is ANALYSIS, not a summary. A summary restates the figures (ranges, totals, peaks). An analysis explains what they mean for the deck's purpose: what is driving them, how they compare with what matters, what follows, and what the presenter should do, with the reasoning and how sure you are.",
    "",
    `What the deck is for: ${req.goal.trim() || "not stated; infer the most useful purpose from the figures and say it in the thesis"}`,
    "",
    "Figures as JSON. Each row is one labeled figure across the periods, in period order, as printed (some rows print outflows as negatives). null means no figure. role \"comparison\" rows are targets, budgets or reference values the presenter supplied; comparesTo names the row they apply to. typedByPresenter marks hand-entered values.",
    JSON.stringify(data),
    req.checks.length ? `\nAlready verified: ${req.checks.join(" ")}` : "",
    "",
    "Write:",
    "- thesis: one sentence that answers the deck's purpose.",
    "- points: 3 to 5 steps of the argument, most important first. For each:",
    "  conclusion: a headline that states what the figures MEAN, not what they are (\"Spending is lumpy, so a flat budget will fail\", not \"Purchases ranged from X to Y\"). Under 14 words.",
    "  evidence: one or two sentences with the figures that show it. Use comparisons: against comparison rows, the average, other periods, or other rows; break totals into what drives them.",
    "  soWhat: why it matters for the purpose.",
    "  drivers: possible causes, each a hypothesis with how the presenter could check it. Never state a cause as fact unless the figures prove it.",
    "  context (optional): relevant general knowledge you bring (seasonal norms, how such accounts or programs usually behave, common practice). It will be shown to the presenter labeled as your general knowledge, not their data.",
    "  rows: the row labels to chart as this point's evidence, main one first.",
    "  confidence: high, medium or low, with confidenceReason (coverage, number of periods, typed values, untested hypotheses).",
    "- recommendation: action (a headline the presenter could present), rationale, tradeoffs.",
    "- nextSteps: 2 to 4 concrete steps.",
    "",
    "Numbers, strictly:",
    "- Every number you write in thesis, conclusion, evidence, soWhat or the recommendation must come from the figures. List each one in that part's numbers (thesisNumbers for the thesis) with the exact text you wrote and a formula that computes it.",
    "  Formula language: [Row] is every figure in a row (only inside a function); [Row @ Period] is one figure; functions sum, mean, min, max, count, abs; operators + - * / and parentheses.",
    "  Examples: \"$22,773.77\" = [Purchases @ Jan 2026]; \"45%\" = 100 * ([Purchases @ Jan 2026] + [Purchases @ Apr 2026] + [Purchases @ Sep 2026]) / sum([Purchases]); \"$11,819.00\" = (sum([Purchases]) - [Purchases @ Jan 2026] - [Purchases @ Apr 2026] - [Purchases @ Sep 2026]) / 7.",
    "  For a deliberately rounded number (\"about $11,800\"), set approx to true.",
    "- Numbers from your general knowledge may appear ONLY in context, each listed in that point's externalNumbers with what it is about.",
    "- Next steps may repeat numbers used above but add no new ones.",
    "- Write money like $1,234.56 and percents like 12%. Refer to periods exactly by their labels. Write no years except inside period labels.",
    "- Plain language, short sentences. Address the presenter as you.",
    "",
    `Reply with only JSON in this shape: ${SHAPE}`,
  ].join("\n");
}

// ---- Verification ----

/** "$1,234.56" -> {value: 1234.56, tol: 0.005}; "12%" -> {12, 0.5}. */
export function parseStated(text: string, approx = false): { value: number; tol: number } | null {
  const m = text.replace(/−/g, "-").match(/-?\(?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\)?/);
  if (!m) return null;
  const decimals = m[2] ? m[2].length - 1 : 0;
  const value = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
  let tol = 0.5 * 10 ** -decimals + 1e-9;
  if (approx) {
    // "about $11,800": rounded to its last non-zero digit, or within half a percent.
    const zeros = decimals ? 0 : (m[1].replace(/,/g, "").match(/0+$/)?.[0].length ?? 0);
    tol = Math.max(tol, 0.5 * 10 ** zeros, 0.005 * Math.abs(value));
  }
  return { value, tol };
}

/** Numbers written in prose, leaving out years and the numbers inside period labels. */
function numbersIn(text: string, periods: string[]): string[] {
  let t = text;
  for (const p of [...periods].sort((a, b) => b.length - a.length)) t = t.split(p).join(" ");
  return (t.match(/-?\$?\d[\d,]*(\.\d+)?%?/g) ?? []).filter((n) => !/^(19|20)\d\d$/.test(n.replace(/[^\d]/g, "")) || /[$%.,]/.test(n));
}

type Proven = { value: number; tol: number };

function checkNumbers(req: AnalysisRequest, uses: NumberUse[], prose: string, counts: Set<number>) {
  const problems: string[] = [];
  const ok: Proven[] = [];
  const listed: Proven[] = [];
  for (const use of uses) {
    const stated = parseStated(use.text, use.approx);
    if (!stated) {
      problems.push(`"${use.text}" is not a number`);
      continue;
    }
    listed.push(stated);
    try {
      const got = evaluate(use.formula, req);
      if (Math.abs(Math.abs(got) - stated.value) > stated.tol + 1e-6 * Math.abs(got)) problems.push(`${use.text} should be ${Math.round(Math.abs(got) * 100) / 100}`);
      else ok.push(stated);
    } catch (e) {
      problems.push(`${use.text}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const n of numbersIn(prose, req.periods)) {
    const p = parseStated(n);
    if (!p) continue;
    if (!n.includes("$") && !n.includes("%") && Number.isInteger(p.value) && counts.has(p.value)) continue;
    if (!listed.some((o) => Math.abs(o.value - p.value) <= Math.max(o.tol, p.tol))) problems.push(`${n} is not shown how it was worked out`);
  }
  return { problems, ok };
}

export interface CheckedPoint extends Point {
  verified: boolean;
  problems: string[];
  checkedCount: number;
  /** Problems in the labeled context (unlisted outside numbers); the point can still be used, without its context. */
  contextProblems: string[];
}

export interface CheckedAnalysis {
  thesis: { text: string; verified: boolean; problems: string[] };
  points: CheckedPoint[];
  recommendation: { action: string; rationale: string; tradeoffs: string; verified: boolean; problems: string[] };
  nextSteps: { text: string; verified: boolean; problems: string[] }[];
}

export function verifyAnalysis(req: AnalysisRequest, a: Analysis): CheckedAnalysis {
  const counts = new Set(Array.from({ length: req.periods.length + 1 }, (_, k) => k)); // "3 of 10 months"
  const proven: Proven[] = [];

  const th = checkNumbers(req, a.thesisNumbers ?? [], a.thesis, counts);
  proven.push(...th.ok);

  const points = a.points.map((pt): CheckedPoint => {
    const c = checkNumbers(req, pt.numbers, `${pt.conclusion} ${pt.evidence} ${pt.soWhat}`, counts);
    proven.push(...c.ok);
    const ext = (pt.externalNumbers ?? []).map((x) => parseStated(x.text)).filter((x): x is Proven => Boolean(x));
    const contextProblems = numbersIn(pt.context ?? "", req.periods)
      .map((n) => ({ n, p: parseStated(n) }))
      .filter(({ n, p }) => p && !(!n.includes("$") && !n.includes("%") && Number.isInteger(p.value) && counts.has(p.value)))
      .filter(({ p }) => !ext.some((o) => Math.abs(o.value - p!.value) <= Math.max(o.tol, p!.tol)) && !proven.some((o) => Math.abs(o.value - p!.value) <= Math.max(o.tol, p!.tol)))
      .map(({ n }) => `${n} in the context is not listed as general knowledge`);
    return { ...pt, verified: c.problems.length === 0, problems: c.problems, checkedCount: c.ok.length, contextProblems };
  });

  const rec = checkNumbers(req, a.recommendation.numbers, `${a.recommendation.action} ${a.recommendation.rationale} ${a.recommendation.tradeoffs}`, counts);
  proven.push(...rec.ok);

  const nextSteps = a.nextSteps.map((text) => {
    const problems = numbersIn(text, req.periods)
      .map((n) => ({ n, p: parseStated(n) }))
      .filter(({ n, p }) => p && !(!n.includes("$") && !n.includes("%") && Number.isInteger(p.value) && counts.has(p.value)))
      .filter(({ p }) => !proven.some((o) => Math.abs(o.value - p!.value) <= Math.max(o.tol, p!.tol)))
      .map(({ n }) => `${n} does not come from a checked point`);
    return { text, verified: problems.length === 0, problems };
  });

  return {
    thesis: { text: a.thesis, verified: th.problems.length === 0, problems: th.problems },
    points,
    recommendation: { action: a.recommendation.action, rationale: a.recommendation.rationale, tradeoffs: a.recommendation.tradeoffs, verified: rec.problems.length === 0, problems: rec.problems },
    nextSteps,
  };
}
