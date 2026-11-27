/**
 * Turns a mapped table into periods and series: optional grouping of dated
 * rows (daily weather into months) with a stated way of combining values.
 * Each resulting figure says how it was made, for provenance.
 */
import type { Column, Table } from "./structured";

export type Grouping = "none" | "week" | "month" | "quarter" | "year";
export type Combine = "mean" | "sum" | "min" | "max" | "last";

export interface Mapping {
  tableId: string;
  periodKey: string;
  values: { key: string; label: string; combine: Combine }[];
  grouping: Grouping;
}

export interface MappedFigure {
  value: number | null;
  /** How the figure was made: "mean of 31 values of daily.temperature_2m_max (2026-01-01 to 2026-01-31)". */
  path: string;
  count: number;
}

export interface Mapped {
  periods: string[];
  series: { key: string; label: string; figures: MappedFigure[] }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(iso: string, grouping: Grouping): { key: string; label: string } {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (grouping) {
    case "none":
      return { key: iso, label: iso };
    case "month":
      return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MONTHS[m]} ${y}` };
    case "quarter":
      return { key: `${y}-Q${Math.floor(m / 3) + 1}`, label: `Q${Math.floor(m / 3) + 1} ${y}` };
    case "year":
      return { key: String(y), label: String(y) };
    case "week": {
      const day = (d.getUTCDay() + 6) % 7; // Monday start
      const start = new Date(Date.UTC(y, m, d.getUTCDate() - day));
      const k = start.toISOString().slice(0, 10);
      return { key: k, label: `Week of ${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}, ${start.getUTCFullYear()}` };
    }
  }
}

/** A sensible default: names that say how to combine, else the mean. */
export function defaultCombine(label: string): Combine {
  if (/precip|rain|snow|sum|total|count|amount|sales|revenue|spend|hours|duration/i.test(label)) return "sum";
  if (/\bmin|minimum|lowest/i.test(label)) return "min";
  if (/\bmax|maximum|highest|peak/i.test(label)) return "max";
  return "mean";
}

/** Group daily rows when there are many of them. */
export function defaultGrouping(dates: string[]): Grouping {
  if (dates.length <= 24) return "none";
  const t = dates.map((d) => Date.parse(d)).filter((x) => !Number.isNaN(x));
  const days = (Math.max(...t) - Math.min(...t)) / 86400000;
  return days > 1100 ? "year" : days > 90 ? "month" : days > 21 ? "week" : "none";
}

const round = (v: number) => Math.round(v * 100) / 100;

function combine(values: number[], how: Combine): number | null {
  if (!values.length) return null;
  switch (how) {
    case "sum": return round(values.reduce((a, b) => a + b, 0));
    case "mean": return round(values.reduce((a, b) => a + b, 0) / values.length);
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "last": return values[values.length - 1];
  }
}

export function applyMapping(table: Table, m: Mapping): Mapped {
  const periodCol = table.columns.find((c) => c.key === m.periodKey);
  if (!periodCol) throw new Error(`The field "${m.periodKey}" is no longer in the data.`);
  const cols = m.values.map((v) => {
    const c = table.columns.find((x) => x.key === v.key);
    if (!c) throw new Error(`The field "${v.key}" is no longer in the data.`);
    return { spec: v, col: c as Column };
  });
  const grouping = periodCol.type === "date" ? m.grouping : "none";

  // Group row indexes by period, keeping first-seen order.
  const groups = new Map<string, { label: string; rows: number[] }>();
  periodCol.values.forEach((raw, i) => {
    if (raw === null) return;
    const { key, label } = grouping === "none" ? { key: String(raw), label: String(raw) } : periodLabel(String(raw), grouping);
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key)!.rows.push(i);
  });
  const entries = [...groups.values()];

  return {
    periods: entries.map((g) => g.label),
    series: cols.map(({ spec, col }) => ({
      key: spec.key,
      label: spec.label,
      figures: entries.map((g) => {
        const vals = g.rows.map((i) => col.values[i]).filter((v): v is number => typeof v === "number");
        if (grouping === "none") {
          const i = g.rows[0];
          return { value: vals[0] ?? null, path: `${col.path}[${i}]`, count: vals.length };
        }
        const first = String(periodCol.values[g.rows[0]]);
        const last = String(periodCol.values[g.rows[g.rows.length - 1]]);
        return {
          value: combine(vals, spec.combine),
          path: `${spec.combine} of ${vals.length} values of ${col.path} (${first.slice(0, 10)} to ${last.slice(0, 10)})`,
          count: vals.length,
        };
      }),
    })),
  };
}
