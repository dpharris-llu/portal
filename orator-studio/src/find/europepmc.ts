/** Europe PMC REST API: search and open-access full text (JATS XML). */
import type { Candidate, SearchOptions } from "./types";
import type { PaperPage } from "@/evidence/text";

export const EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export function europePmcSearchUrl(base: string, query: string, o: SearchOptions = {}): string {
  let q = query.trim();
  if (o.openAccessOnly) q = `(${q}) AND OPEN_ACCESS:y`;
  if (o.fromYear) q = `(${q}) AND PUB_YEAR:[${o.fromYear} TO 3000]`;
  return `${base}/search?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${o.pageSize ?? 15}`;
}

export const europePmcFullTextUrl = (base: string, pmcid: string) => `${base}/${encodeURIComponent(pmcid)}/fullTextXML`;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", minus: "−", plusmn: "±", le: "≤", ge: "≥", times: "×" };
export function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
/** Markup to plain text: tags become spaces, block ends become line breaks. */
export function plainText(markup: string): string {
  return decode(
    markup
      .replace(/<(xref|sup|sub|italic|bold|i|b|em|strong|sc|underline|inline-formula)\b[^>]*>/gi, "")
      .replace(/<\/(xref|sup|sub|italic|bold|i|b|em|strong|sc|underline|inline-formula)>/gi, "")
      .replace(/<\/(p|title|h\d|li|tr|caption|label)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function authorsFrom(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .replace(/\.$/, "")
    .split(/,\s*/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 7);
}

interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  abstractText?: string;
  isOpenAccess?: string;
  journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
  pubTypeList?: { pubType?: string[] };
}

export function parseEuropePmc(json: unknown): Candidate[] {
  const results = ((json as { resultList?: { result?: EpmcResult[] } })?.resultList?.result ?? []).filter((r) => r.id && r.title);
  return results.map((r) => {
    const src = r.source ?? "MED";
    const kind: Candidate["kind"] = src === "NBK" ? "report" : src === "PPR" ? "preprint" : "paper";
    const full = r.isOpenAccess === "Y" && Boolean(r.pmcid);
    const types = r.pubTypeList?.pubType ?? [];
    const badges = [
      ...(kind === "report" ? ["Government or institutional report"] : kind === "preprint" ? ["Preprint, not peer reviewed"] : []),
      ...types.filter((t) => /review|meta-analysis|randomized|guideline|systematic/i.test(t)).slice(0, 2),
    ];
    return {
      provider: "europepmc" as const,
      id: `${src}:${r.id}`,
      kind,
      title: plainText(r.title ?? "").replace(/\.$/, ""),
      authors: authorsFrom(r.authorString),
      venue: r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher,
      year: r.pubYear,
      doi: r.doi,
      pmid: r.pmid,
      pmcid: r.pmcid,
      abstract: plainText(r.abstractText ?? ""),
      access: full ? ("full text" as const) : ("abstract" as const),
      url: `https://europepmc.org/article/${src}/${r.id}`,
      badges,
    };
  });
}

/**
 * JATS full text as "pages" the reading and checking can use: the abstract,
 * then one page per top-level section, each starting with its heading. The
 * reference list is left out. Labels say which section a page is.
 */
export function jatsPages(xml: string): { pages: PaperPage[]; labels: Record<number, string> } {
  const pages: PaperPage[] = [];
  const labels: Record<number, string> = {};
  const push = (label: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    const n = pages.length + 1;
    pages.push({ page: n, text: `${label}\n${t}` });
    labels[n] = label;
  };
  const abstract = xml.match(/<abstract\b[^>]*>([\s\S]*?)<\/abstract>/i);
  if (abstract) push("Abstract", plainText(abstract[1]));
  const body = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  // Top-level sections: walk the <sec> tags, tracking depth.
  const tag = /<(\/?)sec\b[^>]*>/gi;
  let depth = 0;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(body))) {
    if (!m[1]) {
      if (depth === 0) start = m.index;
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        const sec = body.slice(start, m.index + m[0].length);
        const title = plainText(sec.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") || `Section ${pages.length + 1}`;
        const inner = sec.replace(/^<sec\b[^>]*>\s*(<label>[\s\S]*?<\/label>\s*)?<title>[\s\S]*?<\/title>/i, "");
        push(title, plainText(inner));
        start = -1;
      }
    }
  }
  if (pages.length <= (abstract ? 1 : 0) && body) push("Text", plainText(body));
  return { pages, labels };
}
