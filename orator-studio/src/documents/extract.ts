/**
 * Finds labeled figures in a document's text ("Purchases  +$22,773.77"), so a
 * series of reports can become sourced data (spec: start from documents).
 * Pure: input is positioned text, as any PDF reader returns it.
 */

export interface TextItem {
  str: string;
  /** Left edge and baseline, in PDF points (y grows upward). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageText {
  page: number;
  items: TextItem[];
}

export interface Figure {
  /** The label as printed, tidied. */
  label: string;
  /** Normalized label used to match the same figure across documents. */
  key: string;
  value: number;
  /** The value as printed, e.g. "+$22,773.77". */
  raw: string;
  unit: "currency" | "percent" | "number";
  page: number;
  /** Reading order within the document. */
  order: number;
}

const VALUE = /^([+\-−]?)\s?(\()?\s?(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(\))?(%)?$/;
const DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}[/-]\d{1,2}\b/g;

/** Parse one value token, or null if it is not a figure (dates, phone numbers, bare years). */
export function parseValue(token: string): { value: number; unit: Figure["unit"] } | null {
  const t = token.trim().replace(/ /g, " ");
  const m = t.match(VALUE);
  if (!m) return null;
  const [, sign, open, dollar, int, frac, close, pct] = m;
  if (Boolean(open) !== Boolean(close)) return null;
  const digits = int.replace(/,/g, "");
  // A bare 4-digit number between 1900 and 2100 is almost always a year.
  if (!dollar && !pct && !frac && !int.includes(",") && /^(19|20)\d\d$/.test(digits)) return null;
  let value = Number(digits + (frac ?? ""));
  if (sign === "-" || sign === "−" || open) value = -value;
  return { value, unit: dollar ? "currency" : pct ? "percent" : "number" };
}

/** Match labels across documents: ignore case, dates, punctuation and leader dots. */
export function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(DATE, " ")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\b(as of|for|on)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyLabel(s: string): string {
  return s
    .replace(DATE, " ")
    .replace(/\b(as of|for|on)\s*:?\s*$/i, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/[:–—-]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Segment {
  text: string;
  x0: number;
  x1: number;
}

/** Group items into lines (same baseline), then split each line where there is a wide gap. */
export function lines(page: PageText): Segment[][] {
  const items = page.items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const it of items) {
    const row = rows.find((r) => Math.abs(r[0].y - it.y) <= Math.max(2, it.height * 0.35));
    if (row) row.push(it);
    else rows.push([it]);
  }
  rows.sort((a, b) => b[0].y - a[0].y);
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const segs: Segment[] = [];
    for (const it of row) {
      const last = segs[segs.length - 1];
      const gap = last ? it.x - last.x1 : Infinity;
      // A gap wider than about two characters starts a new column.
      if (last && gap < Math.max(it.height, 6) * 1.6) {
        last.text += (gap > it.height * 0.15 && !last.text.endsWith(" ") ? " " : "") + it.str;
        last.x1 = Math.max(last.x1, it.x + it.width);
      } else {
        segs.push({ text: it.str, x0: it.x, x1: it.x + it.width });
      }
    }
    return segs.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }));
  });
}

/**
 * Labels whose "value" is really an identifier or a list entry: page numbers,
 * account and box numbers, and transaction lines (which start with a date or
 * carry a phone number or a city and state).
 */
export function notAFigureLabel(original: string): boolean {
  const t = original.trim();
  return (
    /\bpage\b(\s+\d+)?\s+of\s*$/i.test(t) ||
    /\b(p\.?\s?o\.?\s+box|ending in|account (number|no\.?)|member since|zip|suite|routing|invoice (number|no\.?)|id)\s*:?\s*$/i.test(t) ||
    /^\d{1,2}[/-]\d{1,2}\b/.test(t) ||
    /\b\d{3}[-.\s]\d{3}[-.\s]?\d{4}\b|\b\d{3}-\d{4}\b/.test(t) ||
    STATE_END.test(t)
  );
}

// Transaction and address lines end with a US state code ("REDLANDS CA", "Newark, DE").
const STATE_END = new RegExp(
  "[\\s,](" +
    "AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY" +
    ")$",
);

/** A line whose own column is a date ("12/22", "12/30 12/30") is a list entry, not a summary figure. */
const DATE_COLUMN = /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?(\s+\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?)*$/;

const TRAILING_VALUE = /([+\-−]?\s?\(?\s?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?\)?%?)$/;

/** Labeled figures on a page: a value that ends a label's column, or sits in the next column. */
export function figuresOnPage(page: PageText, startOrder = 0): Figure[] {
  const out: Figure[] = [];
  let order = startOrder;
  for (const segs of lines(page)) {
    if (segs.some((s) => DATE_COLUMN.test(s.text))) continue;
    segs.forEach((seg, i) => {
      const tail = seg.text.match(TRAILING_VALUE);
      if (!tail) return;
      // The end of a date, phone number or code ("01/31/26", "555-0100") is not a value.
      const before = seg.text.slice(0, seg.text.length - tail[1].length);
      if (/[\d/.\-]$/.test(before)) return;
      const parsed = parseValue(tail[1]);
      if (!parsed) return;
      let label = tidyLabel(seg.text.slice(0, seg.text.length - tail[1].length));
      if (!label && i > 0) {
        const prev = segs[i - 1].text;
        if (!TRAILING_VALUE.test(prev)) label = tidyLabel(prev);
      }
      // A label needs words, and long sentences that happen to end in a number are not labels.
      if (!/[a-z]{2}/i.test(label) || label.split(" ").length > 12 || /[.!?]$/.test(label)) return;
      if (notAFigureLabel(seg.text.slice(0, seg.text.length - tail[1].length) || (i > 0 ? segs[i - 1].text : ""))) return;
      const key = labelKey(label);
      if (!key) return;
      out.push({ label, key, value: parsed.value, raw: tail[1].replace(/\s+/g, ""), unit: parsed.unit, page: page.page, order: order++ });
    });
  }
  return out;
}

export function figuresInDocument(pages: PageText[]): Figure[] {
  const out: Figure[] = [];
  for (const p of pages) out.push(...figuresOnPage(p, out.length));
  return out;
}
