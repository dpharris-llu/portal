/**
 * Refreshing a data URL source: re-run its confirmed mapping on a new fetch,
 * say what changed, and rebuild the charts and tables bound to it (F-014).
 */
import type { Deck, DataSource } from "@/model/types";
import type { OpBody } from "@/model/ops";
import { parseStructured } from "./structured";
import { applyMapping } from "./aggregate";
import { chartFromSeries, tableFromSource } from "@/documents/build";

export interface Fetched {
  text: string;
  contentType: string;
  fetchedAt: string;
  sha256: string;
}

export interface Refresh {
  next: DataSource;
  /** Plain-language changes, most useful first. */
  changes: string[];
  same: boolean;
}

const fmt = (v: number | null) => (v === null ? "no figure" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

export function remap(old: DataSource, fetched: Fetched, by: string): Refresh {
  const origin = old.origin;
  if (old.kind !== "url" || !origin) throw new Error("Only data URL sources can be refreshed.");
  const table = parseStructured(fetched.text, fetched.contentType).tables.find((t) => t.id === origin.mapping.tableId);
  if (!table) throw new Error(`The data no longer has the table "${origin.mapping.tableId}".`);
  const mapped = applyMapping(table, origin.mapping);

  const host = (() => {
    try {
      return new URL(origin.url).host;
    } catch {
      return origin.url;
    }
  })();
  const data = old.series.filter((s) => s.role !== "comparison");
  const oldPeriods = old.documents.map((d) => d.period);
  const next: DataSource = {
    ...old,
    origin: { ...origin, fetchedAt: fetched.fetchedAt, sha256: fetched.sha256, contentType: fetched.contentType },
    documents: mapped.periods.map((p) => ({ id: `p-${p}`, name: host, period: p, pages: 0 })),
    series: old.series.map((s) => {
      if (s.role === "comparison") {
        // Typed comparisons follow their periods; a single repeated value extends to new periods.
        const vals = s.figures.map((f) => f.value);
        const constant = vals.every((v) => v === vals[0]) ? s.figures[0] : null;
        return {
          ...s,
          figures: mapped.periods.map((p) => {
            const i = oldPeriods.indexOf(p);
            return i >= 0 ? s.figures[i] : constant ? { ...constant } : { value: null };
          }),
        };
      }
      const m = mapped.series[data.indexOf(s)];
      return { ...s, figures: m.figures.map((f) => ({ value: f.value, raw: fmt(f.value), path: f.path })), confirmedAt: fetched.fetchedAt, confirmedBy: by };
    }),
  };

  const changes: string[] = [];
  const before = old.documents.map((d) => d.period);
  const after = next.documents.map((d) => d.period);
  const added = after.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !after.includes(p));
  if (added.length) changes.push(`New periods: ${added.join(", ")}`);
  if (removed.length) changes.push(`Periods no longer in the data: ${removed.join(", ")}`);
  for (const [k, s] of old.series.entries()) {
    if (s.role === "comparison") continue;
    const moved: string[] = [];
    before.forEach((p, i) => {
      const j = after.indexOf(p);
      if (j < 0) return;
      const a = s.figures[i]?.value ?? null;
      const b = next.series[k].figures[j]?.value ?? null;
      if (a !== b) moved.push(`${p} ${fmt(a)} → ${fmt(b)}`);
    });
    if (moved.length) changes.push(`${s.label}: ${moved.length} ${moved.length === 1 ? "value" : "values"} changed (${moved.slice(0, 3).join("; ")}${moved.length > 3 ? "; …" : ""})`);
  }
  return { next, changes, same: changes.length === 0 && origin.sha256 === fetched.sha256 };
}

/** Rebuild every chart and table bound to the source, keeping each block's id and chart type. */
export function rebindOps(deck: Deck, src: DataSource): OpBody[] {
  const ops: OpBody[] = [];
  for (const slide of Object.values(deck.slides)) {
    for (const b of slide.blocks) {
      if ((b.type !== "chart" && b.type !== "table") || b.binding?.sourceId !== src.id) continue;
      const series = b.binding.seriesIds.map((id) => src.series.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
      if (!series.length) continue;
      if (b.type === "chart") {
        const fresh = chartFromSeries(src, series.find((s) => s.role !== "comparison") ?? series[0]);
        ops.push({ kind: "block.replace", slideId: slide.id, block: { ...fresh, id: b.id, chart: b.chart } });
      } else {
        const fresh = tableFromSource(src, series);
        ops.push({ kind: "block.replace", slideId: slide.id, block: { ...fresh, id: b.id } });
      }
    }
  }
  return ops;
}
