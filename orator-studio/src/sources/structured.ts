/**
 * Reads structured data (JSON, XML, CSV) from a data URL or upload into
 * tables of columns, so the author can map fields to rows (F-014). JSON and
 * XML name their fields, so a figure maps exactly to a path such as
 * `daily.temperature_2m_max`.
 */
import { XMLParser } from "fast-xml-parser";

export type ColumnType = "number" | "date" | "text";

export interface Column {
  key: string;
  /** Field name, with its unit when the data gives one: "temperature_2m_max (°C)". */
  label: string;
  /** Where the values live, for provenance: "daily.temperature_2m_max". */
  path: string;
  type: ColumnType;
  values: (number | string | null)[];
}

export interface Table {
  /** Path of the table in the data, used to find it again on refresh. */
  id: string;
  label: string;
  rows: number;
  columns: Column[];
}

export type Format = "json" | "xml" | "csv";

export function detectFormat(text: string, contentType = ""): Format | null {
  const t = text.trimStart();
  if (/json/i.test(contentType) || t.startsWith("{") || t.startsWith("[")) return "json";
  if (/xml/i.test(contentType) || t.startsWith("<")) return "xml";
  if (/csv|text\/plain/i.test(contentType) || /^[^\n]*,[^\n]*\n/.test(t)) return "csv";
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

export function typeOf(values: unknown[]): ColumnType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!present.length) return "text";
  if (present.every((v) => asNumber(v) !== null)) return "number";
  if (present.every((v) => typeof v === "string" && ISO_DATE.test(v.trim()))) return "date";
  return "text";
}

function column(key: string, path: string, raw: unknown[], unit?: string): Column {
  const type = typeOf(raw);
  const values = raw.map((v) => (v === null || v === undefined || v === "" ? null : type === "number" ? asNumber(v) : String(v)));
  return { key, label: unit ? `${key} (${unit})` : key, path, type, values };
}

const isPrimitive = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** Find tables anywhere in parsed JSON or XML. */
export function tablesIn(data: unknown): Table[] {
  const out: Table[] = [];
  const walk = (node: unknown, path: string, parent?: Record<string, unknown>, key?: string) => {
    if (Array.isArray(node)) {
      // An array of records: each record is a row, each field a column.
      const records = node.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[];
      if (records.length >= 2 && records.length === node.length) {
        const keys = [...new Set(records.flatMap((r) => Object.keys(r).filter((k) => isPrimitive(r[k]))))];
        if (keys.length >= 2) {
          out.push({
            id: path || "$",
            label: path || "records",
            rows: records.length,
            columns: keys.map((k) => column(k, `${path ? path + "." : ""}${k}`, records.map((r) => r[k] as unknown))),
          });
        }
      }
      node.forEach((child, i) => {
        if (child && typeof child === "object") walk(child, `${path}[${i}]`);
      });
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // Sibling arrays of primitives with the same length form a table of columns (Open-Meteo's "daily").
      const arrays = Object.entries(obj).filter(([, v]) => Array.isArray(v) && v.length >= 2 && (v as unknown[]).every(isPrimitive)) as [string, unknown[]][];
      const byLength = new Map<number, [string, unknown[]][]>();
      for (const a of arrays) byLength.set(a[1].length, [...(byLength.get(a[1].length) ?? []), a]);
      // Units often sit beside the data: {"daily": {...}, "daily_units": {...}}.
      const units = (key && parent && typeof parent[`${key}_units`] === "object" ? parent[`${key}_units`] : obj.units) as Record<string, unknown> | undefined;
      for (const [len, cols] of byLength) {
        if (cols.length < 2) continue;
        out.push({
          id: path || "$",
          label: path || "data",
          rows: len,
          columns: cols.map(([k, v]) => column(k, `${path ? path + "." : ""}${k}`, v, typeof units?.[k] === "string" ? (units[k] as string) : undefined)),
        });
      }
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === "object") walk(v, path ? `${path}.${k}` : k, obj, k);
      }
    }
  };
  walk(data, "");
  return out.filter((t) => t.columns.some((c) => c.type === "number"));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseStructured(text: string, contentType = ""): { format: Format; tables: Table[] } {
  const format = detectFormat(text, contentType);
  if (!format) throw new Error("This isn't JSON, XML or CSV.");
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The JSON could not be read.");
    }
    return { format, tables: tablesIn(data) };
  }
  if (format === "xml") {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false, isArray: () => false });
    const data = parser.parse(text);
    return { format, tables: tablesIn(data) };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
  const [header, ...body] = rows;
  const table: Table = {
    id: "$",
    label: "CSV",
    rows: body.length,
    columns: header.map((h, i) => column(h.trim() || `Column ${i + 1}`, h.trim() || `column ${i + 1}`, body.map((r) => r[i] ?? null))),
  };
  return { format, tables: table.columns.some((c) => c.type === "number") ? [table] : [] };
}
