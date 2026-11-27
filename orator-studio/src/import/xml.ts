/** A small, order-preserving XML tree over fast-xml-parser, for reading OOXML parts. */
import { XMLParser } from "fast-xml-parser";

export interface El {
  name: string;
  attrs: Record<string, string>;
  children: El[];
  text: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true,
});

type Raw = Record<string, unknown>;

function convert(node: Raw): El | null {
  const name = Object.keys(node).find((k) => k !== ":@");
  if (!name) return null;
  if (name === "#text") return { name, attrs: {}, children: [], text: String(node[name]) };
  const attrs = (node[":@"] as Record<string, string>) ?? {};
  const kids = ((node[name] as Raw[]) ?? []).map(convert).filter((x): x is El => x !== null);
  return { name, attrs, children: kids.filter((k) => k.name !== "#text"), text: kids.filter((k) => k.name === "#text").map((k) => k.text).join("") };
}

export function parseXml(xml: string): El {
  const raw = parser.parse(xml) as Raw[];
  const root = raw.map(convert).find((e) => e && e.name !== "?xml");
  if (!root) throw new Error("Empty XML part");
  return root;
}

export const child = (el: El | undefined, name: string): El | undefined => el?.children.find((c) => c.name === name);
export const kids = (el: El | undefined, name: string): El[] => el?.children.filter((c) => c.name === name) ?? [];

export function path(el: El | undefined, ...names: string[]): El | undefined {
  return names.reduce<El | undefined>((e, n) => child(e, n), el);
}

export function descendants(el: El | undefined, name: string, out: El[] = []): El[] {
  for (const c of el?.children ?? []) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
