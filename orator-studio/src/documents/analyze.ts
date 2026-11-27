/**
 * Analysis of confirmed document figures: patterns within a row, relationships
 * between rows, and the questions they raise. Every number in a finding is
 * computed from confirmed figures (guardrail 2), and runs in the browser.
 * Findings and suggestions are proposals: the author keeps, edits or drops them.
 */
import type { DataSource, SourceSeries } from "@/model/types";
import { formatFigure } from "./build";

export type FindingKind =
  | "volatile"
  | "trend"
  | "cumulative"
  | "concentration"
  | "summary"
  | "reconciles"
  | "carries"
  | "matches"
  | "share"
  | "together"
  /** Written by Claude, with every number checked against the confirmed figures. */
  | "insight";

export interface Finding {
  id: string;
  kind: FindingKind;
  seriesIds: string[];
  text: string;
  /** A short headline for the row's chart slide. */
  claim?: string;
  /** A question or next step the finding raises. Only Claude's insights carry one; computed patterns describe. */
  suggestion?: string;
  /** Higher is more worth saying. */
  score: number;
  /** Set when Claude wrote it; how Claude was reached. */
  ai?: { via: string };
}

interface Point {
  i: number;
  /** Value as charted (all-negative rows shown as positive amounts). */
  v: number;
  /** Value as printed. */
  raw: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => (s === s.toUpperCase() ? s.toLowerCase() : s.charAt(0).toLowerCase() + s.slice(1));
const pct = (x: number) => `${Math.round(x * 100)}%`;

function points(s: SourceSeries): Point[] {
  const raw = s.figures.map((f, i) => ({ i, raw: f.value })).filter((p): p is { i: number; raw: number } => p.raw !== null);
  const flip = raw.length > 0 && raw.every((p) => p.raw <= 0) && raw.some((p) => p.raw < 0);
  return raw.map((p) => ({ ...p, v: flip ? -p.raw : p.raw }));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** "Jan, Apr and Sep 2026" when the periods share a year, else the full labels. */
export function listPeriods(labels: string[]): string {
  const years = labels.map((l) => l.match(/(\d{4})$/)?.[1]);
  const shared = years.every((y) => y && y === years[0]);
  const names = shared ? labels.map((l) => l.replace(/\s*\d{4}$/, "")) : labels;
  const joined = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return shared ? `${joined} ${years[0]}` : joined;
}

/** Balances, limits, rates and counts are levels: averaging them makes sense, adding them up does not. */
const isLevel = (label: string) => /balance|limit|rate|days|available|%|average|count|enrolled|headcount|price|score/i.test(label);

function withinSeries(src: DataSource, s: SourceSeries): Finding[] {
  const pts = points(s);
  const n = pts.length;
  if (n < 2) return [];
  // Money in findings always shows cents, so derived figures ($22.40 a period) match the rest.
  const fmt = (v: number) => formatFigure(v, s.unit, true);
  const per = (p: Point) => src.documents[p.i].period;
  const vs = pts.map((p) => p.v);
  const m = mean(vs);
  const total = vs.reduce((a, b) => a + b, 0);
  const out: Finding[] = [];
  const L = cap(s.label);

  // Running totals: never fall, and end higher than they start.
  const diffs = pts.slice(1).map((p, k) => p.v - pts[k].v);
  const cumulative = n >= 3 && diffs.every((d) => d >= 0) && pts[n - 1].v > pts[0].v;
  if (cumulative) {
    const avgAdd = (pts[n - 1].v - pts[0].v) / (n - 1);
    out.push({
      id: `cum-${s.id}`,
      kind: "cumulative",
      seriesIds: [s.id],
      score: 0.7,
      text: `${L} ${diffs.every((d) => d > 0) ? "grew in every period" : "never fell"}, adding ${fmt(avgAdd)} a period on average, from ${fmt(pts[0].v)} (${per(pts[0])}) to ${fmt(pts[n - 1].v)} (${per(pts[n - 1])}).`,
      claim: `${L} grew every period, to ${fmt(pts[n - 1].v)}`,
    });
  }

  // Steady rise or fall: a straight line explains most of the movement.
  if (!cumulative && n >= 4 && m !== 0) {
    const xs = pts.map((p) => p.i);
    const mx = mean(xs);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = xs.reduce((a, x, k) => a + (x - mx) * (vs[k] - m), 0) / sxx;
    const ssTot = vs.reduce((a, v) => a + (v - m) ** 2, 0);
    const ssRes = vs.reduce((a, v, k) => a + (v - (m + slope * (xs[k] - mx))) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    const span = slope * (xs[n - 1] - xs[0]);
    if (r2 >= 0.6 && Math.abs(span) >= 0.05 * Math.abs(m)) {
      const up = span > 0;
      const diff = pts[n - 1].v - pts[0].v;
      // Rates change by points ("up 8 percentage points"), amounts by percent.
      const change =
        s.unit === "percent"
          ? `${Math.abs(Math.round(diff * 10) / 10)} percentage points`
          : pts[0].v !== 0
            ? pct(Math.abs(diff / pts[0].v))
            : null;
      out.push({
        id: `trend-${s.id}`,
        kind: "trend",
        seriesIds: [s.id],
        score: 0.6 + 0.3 * r2,
        text: `${L} ${up ? "rose" : "fell"} steadily, from ${fmt(pts[0].v)} (${per(pts[0])}) to ${fmt(pts[n - 1].v)} (${per(pts[n - 1])})${change !== null ? `, ${up ? "up" : "down"} ${change}` : ""}.`,
        claim: `${L} ${up ? "rose" : "fell"} steadily to ${fmt(pts[n - 1].v)}`,
      });
    }
  }

  // Big swings: the spread is large next to the average, so name the peaks.
  const cv = m > 0 ? sd(vs) / m : 0;
  if (!cumulative && n >= 4 && m > 0 && cv > 0.3) {
    const peaks = pts.filter((p) => p.v >= m * 1.25).sort((a, b) => b.v - a.v).slice(0, 3);
    if (peaks.length > 0 && peaks.length < n / 2) {
      const least = Math.min(...peaks.map((p) => p.v / m - 1));
      const names = listPeriods(peaks.sort((a, b) => a.i - b.i).map(per));
      out.push({
        id: `vol-${s.id}`,
        kind: "volatile",
        seriesIds: [s.id],
        // A swinging balance is less telling than swinging spending: rank levels lower.
        score: 0.55 + Math.min(0.3, cv / 3) - (isLevel(s.label) ? 0.2 : 0),
        text: `${L} swung widely: ${names} ${peaks.length === 1 ? "was" : "were each"} ${pct(least)} or more above the ${fmt(m)} average.`,
        claim: `${L} peaked in ${names}`,
      });
    }
  }

  // A few periods account for most of the total.
  if (!isLevel(s.label) && n >= 5 && total > 0 && vs.every((v) => v >= 0)) {
    const top = [...pts].sort((a, b) => b.v - a.v).slice(0, 2);
    const share = (top[0].v + top[1].v) / total;
    // At least half the total, and at least twice their fair share of it.
    if (share >= 0.5 && share >= 2 * (2 / n)) {
      const names = listPeriods(top.sort((a, b) => a.i - b.i).map(per));
      out.push({
        id: `conc-${s.id}`,
        kind: "concentration",
        seriesIds: [s.id],
        score: 0.5 + (share - 0.5),
        text: `${L} came mostly in ${names}: ${pct(share)} of the ${fmt(total)} total.`,
        claim: `${pct(share)} of ${low(s.label)} came in ${names}`,
      });
    }
  }

  // Always available: the summary a reader expects.
  const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
  const hi = pts.reduce((a, b) => (b.v > a.v ? b : a));
  out.push({
    id: `sum-${s.id}`,
    kind: "summary",
    seriesIds: [s.id],
    score: 0.2,
    text: isLevel(s.label)
      ? `${L} averaged ${fmt(m)}, between ${fmt(lo.v)} (${per(lo)}) and ${fmt(hi.v)} (${per(hi)}).`
      : `${L} totaled ${fmt(total)} across ${n} periods, ${fmt(m)} on average, from ${fmt(lo.v)} (${per(lo)}) to ${fmt(hi.v)} (${per(hi)}).`,
  });
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) < 0.005 + 1e-9 * Math.abs(b);

function subsets<T>(xs: T[], min: number, max: number): T[][] {
  const out: T[][] = [];
  const go = (start: number, acc: T[]) => {
    if (acc.length >= min) out.push(acc);
    if (acc.length === max) return;
    for (let k = start; k < xs.length; k++) go(k + 1, [...acc, xs[k]]);
  };
  go(0, []);
  return out;
}

function betweenSeries(src: DataSource): Finding[] {
  const series = src.series;
  const n = src.documents.length;
  const full = series.filter((s) => s.figures.every((f) => f.value !== null));
  const val = (s: SourceSeries, i: number) => s.figures[i].value as number;
  const out: Finding[] = [];

  // Rows that add up to another row in every period (signs as printed).
  if (n >= 2) {
    const nonZero = full.filter((s) => s.figures.some((f) => f.value !== 0));
    for (const target of nonZero) {
      const parts = nonZero.filter((s) => s !== target);
      const hit = subsets(parts, 2, 4).find((set) => src.documents.every((_, i) => close(set.reduce((a, s) => a + val(s, i), 0), val(target, i))));
      if (hit) {
        out.push({
          id: `rec-${target.id}`,
          kind: "reconciles",
          seriesIds: [...hit.map((s) => s.id), target.id],
          score: 0.65,
          text: `Every period adds up to the cent: ${hit.map((s) => s.label).join(" + ")} = ${target.label}, in all ${n} periods (signs as printed).`,
        });
        break;
      }
    }
  }

  // One period's closing figure carried into the next period.
  if (n >= 3) {
    for (const a of full) for (const b of full) {
      if (a === b) continue;
      if (src.documents.slice(1).every((_, k) => close(val(b, k + 1), val(a, k)))) {
        out.push({
          id: `carry-${a.id}-${b.id}`,
          kind: "carries",
          seriesIds: [a.id, b.id],
          score: 0.45,
          text: `Each period's ${low(b.label)} equals the previous period's ${low(a.label)}, so nothing is missing between documents.`,
        });
      }
    }
  }

  // Rows that match another row in many periods.
  if (n >= 4) {
    for (let x = 0; x < full.length; x++) for (let y = x + 1; y < full.length; y++) {
      const a = full[x], b = full[y];
      if (out.some((f) => f.kind === "carries" && f.seriesIds.includes(a.id) && f.seriesIds.includes(b.id))) continue;
      const same = src.documents.map((_, i) => close(Math.abs(val(a, i)), Math.abs(val(b, i))) && val(a, i) !== 0);
      const count = same.filter(Boolean).length;
      if (count >= Math.ceil(n / 2) && count < n) {
        out.push({
          id: `match-${a.id}-${b.id}`,
          kind: "matches",
          seriesIds: [a.id, b.id],
          score: 0.4 + 0.2 * (count / n),
          text: `In ${count} of ${n} periods, ${low(a.label)} matched ${low(b.label)} exactly.`,
        });
      }
    }
  }

  // One row's share of another jumps in particular periods. Rows printed with
  // opposite signs offset each other (credits against purchases), which is the
  // comparison readers expect, so those pairs come first.
  const shares: (Finding & { small: string; offset: boolean })[] = [];
  for (const small of series) for (const large of series) {
    if (small === large || small.unit !== large.unit || small.unit === "percent") continue;
    if (isLevel(small.label) || isLevel(large.label)) continue;
    const both = src.documents
      .map((d, i) => ({ d, s: small.figures[i].value, l: large.figures[i].value }))
      .filter((p): p is { d: typeof p.d; s: number; l: number } => p.s !== null && p.l !== null && p.l !== 0);
    if (both.length < 4) continue;
    const signS = Math.sign(both.reduce((a, p) => a + p.s, 0));
    const signL = Math.sign(both.reduce((a, p) => a + p.l, 0));
    const offset = signS !== 0 && signL !== 0 && signS !== signL;
    const pairs = both.map((p) => ({ ...p, s: Math.abs(p.s), l: Math.abs(p.l) }));
    const ts = pairs.reduce((a, p) => a + p.s, 0);
    const tl = pairs.reduce((a, p) => a + p.l, 0);
    const overall = ts / tl;
    if (overall >= 0.5 || overall === 0) continue;
    const peak = pairs.reduce((a, p) => (p.s / p.l > a.s / a.l ? p : a));
    const top = peak.s / peak.l;
    if (top >= 2 * overall && top >= 0.05) {
      shares.push({
        id: `share-${small.id}-${large.id}`,
        kind: "share",
        seriesIds: [small.id, large.id],
        small: small.id,
        offset,
        score: 0.4 + Math.min(0.3, top / overall / 20) + (offset ? 0.1 : 0),
        text: offset
          ? `${cap(small.label)} offset ${pct(overall)} of ${low(large.label)} overall, but ${pct(top)} in ${peak.d.period}.`
          : `${cap(small.label)} equaled ${pct(overall)} of ${low(large.label)} overall, but ${pct(top)} in ${peak.d.period}.`,
      });
    }
  }
  for (const id of new Set(shares.map((f) => f.small))) {
    const mine = shares.filter((f) => f.small === id).sort((a, b) => Number(b.offset) - Number(a.offset) || b.score - a.score);
    const { small: _s, offset: _o, ...best } = mine[0];
    out.push(best);
  }

  // Two flows that rise and fall together.
  const flows = full.filter((s) => !isLevel(s.label) && s.figures.some((f) => f.value !== 0));
  if (n >= 5) {
    for (let x = 0; x < flows.length; x++) for (let y = x + 1; y < flows.length; y++) {
      const a = flows[x].figures.map((f) => Math.abs(f.value as number));
      const b = flows[y].figures.map((f) => Math.abs(f.value as number));
      const ma = mean(a), mb = mean(b);
      const cov = a.reduce((acc, v, i) => acc + (v - ma) * (b[i] - mb), 0);
      const den = Math.sqrt(a.reduce((acc, v) => acc + (v - ma) ** 2, 0) * b.reduce((acc, v) => acc + (v - mb) ** 2, 0));
      const r = den === 0 ? 0 : cov / den;
      if (r >= 0.8) {
        out.push({
          id: `tog-${flows[x].id}-${flows[y].id}`,
          kind: "together",
          seriesIds: [flows[x].id, flows[y].id],
          score: 0.35 + (r - 0.8),
          text: `${cap(flows[x].label)} and ${low(flows[y].label)} rose and fell together (correlation ${r.toFixed(2)}).`,
        });
      }
    }
  }
  return out;
}

export interface Analysis {
  findings: Finding[];
  /** Best finding per row, for chart headlines. */
  headline: Record<string, Finding>;
}

export function analyze(src: DataSource): Analysis {
  const between = betweenSeries(src);
  // Balances that other rows add up to, or that carry over, swing because of
  // those rows; their own swings are not news.
  const explained = new Set(
    between.filter((f) => f.kind === "reconciles" || f.kind === "carries").flatMap((f) => (f.kind === "reconciles" ? [f.seriesIds[f.seriesIds.length - 1]] : f.seriesIds)),
  );
  const per = src.series.map((s) => {
    let fs = withinSeries(src, s);
    if (fs.some((f) => f.kind === "concentration")) fs = fs.filter((f) => f.kind !== "volatile");
    if (explained.has(s.id) && isLevel(s.label)) fs = fs.filter((f) => f.kind !== "volatile");
    return fs;
  });
  const headline: Record<string, Finding> = {};
  src.series.forEach((s, k) => {
    const best = [...per[k]].sort((a, b) => b.score - a.score)[0];
    if (best) headline[s.id] = best;
  });
  const findings = [...per.flat(), ...between].sort((a, b) => b.score - a.score);
  return { findings, headline };
}
