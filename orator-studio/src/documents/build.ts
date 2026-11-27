/**
 * Turns confirmed document figures into a draft deck. Every number on a slide
 * is copied from a confirmed figure (guardrail 2), and claims are computed from
 * them, then flagged for the author to rewrite into what matters.
 */
import type { Block, ChartBlock, DataSource, Slide, SourceSeries, TableBlock } from "@/model/types";
import { newId } from "@/model/ids";
import { newSlide } from "@/model/factory";
import { analyze, type Finding } from "./analyze";

/** Format in the figure's unit; `cents` keeps currency to two decimals so a series reads consistently. */
export function formatFigure(v: number, unit: SourceSeries["unit"], cents = false): string {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: unit === "currency" && (cents || !Number.isInteger(v)) ? 2 : 0, maximumFractionDigits: 2 });
  const sign = v < 0 ? "-" : "";
  return unit === "currency" ? `${sign}$${abs}` : unit === "percent" ? `${sign}${abs}%` : `${sign}${abs}`;
}

/** Statements print outflows as negatives; when every value is negative, chart them as positive amounts. */
const hasCents = (s: SourceSeries) => s.unit === "currency" && s.figures.some((f) => f.value !== null && !Number.isInteger(f.value));

function chartValues(s: SourceSeries): { values: number[]; flipped: boolean } {
  const present = s.figures.map((f) => f.value).filter((v): v is number => v !== null);
  const flipped = present.length > 0 && present.every((v) => v <= 0) && present.some((v) => v < 0);
  return { values: s.figures.map((f) => (f.value === null ? 0 : flipped ? -f.value : f.value)), flipped };
}

export function provenanceLines(src: DataSource, s: SourceSeries): string[] {
  return s.figures.map((f, i) => {
    const doc = src.documents[i];
    const where = f.value === null ? "no figure" : f.entered ? "typed in by the author" : `${doc.name}, page ${f.page}`;
    return `${doc.period}: ${f.value === null ? "-" : f.raw ?? formatFigure(f.value, s.unit, hasCents(s))} (${where})`;
  });
}

/** A computed, checkable claim: the range, with the periods where it peaked and bottomed. */
export function draftClaim(src: DataSource, s: SourceSeries): string {
  const { values, flipped } = chartValues(s);
  const present = s.figures.map((f, i) => ({ v: values[i], i, has: f.value !== null })).filter((x) => x.has);
  if (present.length === 0) return s.label;
  const fmt = (v: number) => formatFigure(v, s.unit, hasCents(s));
  const label = s.label.charAt(0).toUpperCase() + s.label.slice(1);
  if (present.length === 1) return `${label} was ${fmt(present[0].v)} in ${src.documents[present[0].i].period}`;
  const lo = present.reduce((a, b) => (b.v < a.v ? b : a));
  const hi = present.reduce((a, b) => (b.v > a.v ? b : a));
  if (lo.v === hi.v) return `${label} held at ${fmt(lo.v)} in every period`;
  void flipped;
  return `${label} ranged from ${fmt(lo.v)} (${src.documents[lo.i].period}) to ${fmt(hi.v)} (${src.documents[hi.i].period})`;
}

export function chartFromSeries(src: DataSource, s: SourceSeries): ChartBlock {
  const { values, flipped } = chartValues(s);
  const missing = s.figures.map((f, i) => (f.value === null ? src.documents[i].period : null)).filter(Boolean);
  return {
    id: newId("b"),
    type: "chart",
    chart: "bar",
    unit: s.unit,
    labels: src.documents.map((d) => d.period),
    series: [{ name: s.label, values }],
    alt: `${s.label} by period: ${s.figures.map((f, i) => `${src.documents[i].period} ${f.value === null ? "no figure" : formatFigure(values[i], s.unit, hasCents(s))}`).join(", ")}.`,
    source:
      `${src.name}, figures confirmed ${s.confirmedAt.slice(0, 10)}` +
      (flipped ? "; printed as negative amounts, shown as positive" : "") +
      (missing.length ? `; no figure for ${missing.join(", ")}` : ""),
    binding: { sourceId: src.id, seriesIds: [s.id] },
  };
}

export function tableFromSource(src: DataSource, series: SourceSeries[]): TableBlock {
  return {
    id: newId("b"),
    type: "table",
    header: ["Period", ...series.map((s) => s.label)],
    rows: src.documents.map((d, i) => [d.period, ...series.map((s) => (s.figures[i].value === null ? "-" : formatFigure(s.figures[i].value!, s.unit, hasCents(s))))]),
    caption: `${src.name}. Page references are in the speaker notes.`,
    binding: { sourceId: src.id, seriesIds: series.map((s) => s.id) },
  };
}

export interface DraftDeck {
  narrative: Slide[];
  backup: Slide[];
}

const REVIEW_CLAIM = "Claim drafted from the figures. Rewrite it to say why this matters.";
const ASSURANCE: Finding["kind"][] = ["reconciles", "carries"];

/**
 * Draft deck: what the figures show, one chart per row headed by its strongest
 * finding, suggested next steps, and backup slides for checks and the full table.
 * `findings` defaults to everything the analysis found; the review page passes
 * only the ones the author kept.
 */
export function draftFromSource(src: DataSource, findings: Finding[] = analyze(src).findings, extraSteps: { text: string; ai?: boolean }[] = []): DraftDeck {
  const now = new Date().toISOString();
  const aiMark = (f: { ai?: { via: string } }) =>
    f.ai ? { provenance: { author: { kind: "ai" as const, id: "claude", via: f.ai.via }, at: now, source: src.name } } : {};
  // Each chart's headline: the strongest finding about that row that has one (Claude's first).
  const headline: Record<string, Finding> = {};
  for (const s of src.series) {
    const best = findings.filter((f) => f.claim && f.seriesIds.includes(s.id)).sort((a, b) => b.score - a.score)[0];
    if (best) headline[s.id] = best;
  }
  const first = src.documents[0]?.period ?? "";
  const last = src.documents[src.documents.length - 1]?.period ?? "";
  const span = first && last && first !== last ? `${first} to ${last}` : first;

  const title = newSlide(span ? `${span} in figures` : src.name, "inform", [
    { id: newId("b"), type: "text", text: `${src.series.length} figures confirmed from ${src.documents.length} documents.` } as Block,
  ]);
  title.importNotes = ["Write the one thing this deck should say; this title is a placeholder."];
  title.notes = `Source: ${src.documents.map((d) => d.name).join(", ")}.`;

  const insights = findings.filter((f) => f.kind !== "summary" && !ASSURANCE.includes(f.kind));
  const shows: Slide[] = [];
  if (insights.length) {
    const top = insights.slice(0, 5);
    const byClaude = top.find((f) => f.ai);
    const slide = newSlide("What the figures show", "inform", [{ id: newId("b"), type: "bullets", items: top.map((f) => f.text), ...aiMark(byClaude ?? {}) } as Block]);
    slide.importNotes = [
      byClaude
        ? "Written by Claude from the confirmed figures; every number in it was checked against them. Keep what matters and say it your way."
        : "Findings computed from the confirmed figures. Keep the ones that matter and say what they mean.",
    ];
    slide.notes = "Every number here is computed from the confirmed figures; each chart slide lists where its figures came from.";
    shows.push(slide);
  }

  const charts = src.series.map((s) => {
    const best = headline[s.id];
    const slide = newSlide(best?.claim ?? draftClaim(src, s), "inform", [chartFromSeries(src, s)]);
    slide.importNotes = [best?.ai ? "Headline written by Claude; its numbers were checked against your confirmed figures. Rewrite it in your own words if you like." : REVIEW_CLAIM];
    const about = findings.filter((f) => f.seriesIds.includes(s.id) && f.kind !== "summary").map((f) => f.text);
    slide.notes = [...about, ...(about.length ? [""] : []), ...provenanceLines(src, s)].join("\n");
    return slide;
  });

  const steps = [
    ...extraSteps,
    ...findings.filter((f) => f.suggestion).map((f) => ({ text: f.suggestion as string, ai: Boolean(f.ai) })),
  ].filter((st, i, all) => all.findIndex((x) => x.text.toLowerCase() === st.text.toLowerCase()) === i).slice(0, 5);
  const next: Slide[] = [];
  if (steps.length) {
    const fromClaude = steps.some((st) => st.ai);
    const slide = newSlide("Suggested next steps", "decide", [
      { id: newId("b"), type: "bullets", items: steps.map((st) => st.text), ...(fromClaude ? aiMark({ ai: { via: "claude" } }) : {}) } as Block,
    ]);
    slide.importNotes = [`Suggestions${fromClaude ? " from Claude" : " drawn from the findings"}, not decisions. Keep, edit or remove each one.`];
    next.push(slide);
  }

  const checks = findings.filter((f) => ASSURANCE.includes(f.kind));
  const assurance: Slide[] = [];
  if (checks.length) {
    const slide = newSlide("The figures check out", "inform", [{ id: newId("b"), type: "bullets", items: checks.map((f) => f.text) } as Block]);
    slide.notes = "Checked across every confirmed figure.";
    assurance.push(slide);
  }

  // The full table goes to backup, five figures per slide so it stays readable.
  const backup: Slide[] = [];
  for (let i = 0; i < src.series.length; i += 5) {
    const group = src.series.slice(i, i + 5);
    const slide = newSlide(src.series.length > 5 ? `All figures (${i / 5 + 1})` : "All figures", "inform", [tableFromSource(src, group)]);
    slide.notes = group.map((s) => `${s.label}\n${provenanceLines(src, s).join("\n")}`).join("\n\n");
    backup.push(slide);
  }
  return { narrative: [title, ...shows, ...charts, ...next], backup: [...assurance, ...backup] };
}
