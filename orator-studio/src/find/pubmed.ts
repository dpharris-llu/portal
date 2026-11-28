/**
 * PubMed through NCBI's E-utilities (the NIH's own interface): the fallback
 * when Europe PMC doesn't answer. esearch finds ids, esummary gives the
 * citation, efetch gives the abstracts. No account or key is sent.
 */
import type { Candidate, SearchOptions } from "./types";
import { plainText } from "./europepmc";

export const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "tool=oratorstudio";

export function pubmedSearchUrl(base: string, query: string, o: SearchOptions = {}): string {
  let q = query.trim();
  if (o.openAccessOnly) q = `(${q}) AND free full text[sb]`;
  if (o.fromYear) q = `(${q}) AND ${o.fromYear}:3000[dp]`;
  return `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=15&sort=relevance&${TOOL}&term=${encodeURIComponent(q)}`;
}
export const pubmedSummaryUrl = (base: string, ids: string[]) => `${base}/esummary.fcgi?db=pubmed&retmode=json&${TOOL}&id=${ids.join(",")}`;
export const pubmedAbstractUrl = (base: string, ids: string[]) => `${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&${TOOL}&id=${ids.join(",")}`;

export function pubmedIds(json: unknown): string[] {
  return ((json as { esearchresult?: { idlist?: string[] } })?.esearchresult?.idlist ?? []).filter((x) => /^\d+$/.test(x));
}

/** PMID → abstract text, with section labels ("Results: ...") kept. */
export function pubmedAbstracts(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/g)) {
    const block = m[0];
    const pmid = block.match(/<PMID\b[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid) continue;
    const parts = [...block.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((p) => {
      const label = p[1].match(/Label="([^"]+)"/)?.[1];
      const text = plainText(p[2]);
      return label ? `${label[0]}${label.slice(1).toLowerCase()}: ${text}` : text;
    });
    if (parts.length) out.set(pmid, parts.join("\n"));
  }
  return out;
}

interface Summary {
  uid?: string;
  title?: string;
  authors?: { name?: string }[];
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  pubtype?: string[];
  articleids?: { idtype?: string; value?: string }[];
}

export function parsePubmed(summaryJson: unknown, abstracts: Map<string, string>): Candidate[] {
  const r = (summaryJson as { result?: Record<string, unknown> & { uids?: string[] } })?.result;
  if (!r) return [];
  return (r.uids ?? []).flatMap((uid) => {
    const s = r[uid] as Summary | undefined;
    if (!s?.title) return [];
    const id = (t: string) => s.articleids?.find((a) => a.idtype === t)?.value;
    const pmcid = id("pmc");
    const types = s.pubtype ?? [];
    return [
      {
        provider: "europepmc" as const,
        id: `MED:${uid}`,
        kind: types.some((t) => /preprint/i.test(t)) ? ("preprint" as const) : ("paper" as const),
        title: plainText(s.title).replace(/\.$/, ""),
        authors: (s.authors ?? []).map((a) => a.name ?? "").filter(Boolean).slice(0, 7),
        venue: s.fulljournalname ?? s.source,
        year: s.pubdate?.match(/\d{4}/)?.[0],
        doi: id("doi"),
        pmid: uid,
        pmcid: pmcid && /^PMC\d+$/.test(pmcid) ? pmcid : undefined,
        abstract: abstracts.get(uid) ?? "",
        access: pmcid ? ("full text" as const) : ("abstract" as const),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        badges: types.filter((t) => /review|meta-analysis|randomized|guideline|systematic/i.test(t)).slice(0, 2),
      },
    ];
  });
}
