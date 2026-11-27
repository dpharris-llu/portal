/** Line up the same labeled figure across several documents (for example, twelve monthly reports). */
import type { Figure } from "./extract";

export interface ScannedDocument {
  id: string;
  name: string;
  /** Column heading, e.g. "Jan 2026". */
  period: string;
  pages: number;
  figures: Figure[];
}

export interface Cell {
  value: number;
  raw: string;
  page: number;
  /** Other values the same label had in this document, for the reviewer to see. */
  alternatives?: number[];
}

export interface CandidateRow {
  key: string;
  label: string;
  unit: Figure["unit"];
  /** One per document, in document order; null where the label was not found. */
  cells: (Cell | null)[];
  found: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "January2026.pdf" -> { label: "Jan 2026", sort: 2026*12+0 }. Null if no month and year. */
export function periodFromName(name: string): { label: string; sort: number } | null {
  const n = name.toLowerCase();
  const year = n.match(/(19|20)\d\d/);
  const month = MONTHS.findIndex((m) => new RegExp(`(^|[^a-z])${m}`, "i").test(n.replace(/(19|20)\d\d/g, " ")));
  if (!year || month < 0) return null;
  const label = MONTHS[month][0].toUpperCase() + MONTHS[month].slice(1) + " " + year[0];
  return { label, sort: Number(year[0]) * 12 + month };
}

/** Sort documents by the month in their names when every name has one; otherwise keep their order. */
export function orderDocuments<T extends { name: string }>(docs: T[]): T[] {
  const periods = docs.map((d) => periodFromName(d.name));
  if (periods.some((p) => !p)) return docs;
  return docs.map((d, i) => ({ d, s: periods[i]!.sort })).sort((a, b) => a.s - b.s).map((x) => x.d);
}

export function alignSeries(docs: ScannedDocument[]): CandidateRow[] {
  const rows = new Map<string, CandidateRow & { firstOrder: number }>();
  docs.forEach((doc, di) => {
    const byKey = new Map<string, Figure[]>();
    for (const f of doc.figures) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
    for (const [key, figs] of byKey) {
      const first = figs[0];
      let row = rows.get(key);
      if (!row) {
        row = { key, label: first.label, unit: first.unit, cells: docs.map(() => null), found: 0, firstOrder: di * 1e6 + first.order };
        rows.set(key, row);
      }
      const others = [...new Set(figs.map((f) => f.value).filter((v) => v !== first.value))];
      row.cells[di] = { value: first.value, raw: first.raw, page: first.page, ...(others.length ? { alternatives: others } : {}) };
      row.found++;
    }
  });
  return [...rows.values()]
    .sort((a, b) => b.found - a.found || a.firstOrder - b.firstOrder)
    .map(({ firstOrder: _f, ...r }) => r);
}
