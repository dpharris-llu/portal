/**
 * PubMed through NCBI's E-utilities (the NIH's own interface). Two calls per
 * search: esearch finds the ids, efetch returns each article's details and
 * abstract together. NCBI allows about 3 requests a second per address (10
 * with a free API key, NCBI_API_KEY), so the server paces and retries calls
 * (see server.ts). No personal details are sent.
 */
import type { Candidate, SearchOptions } from "./types";
import { plainText } from "./europepmc";

export const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "tool=oratorstudio";

export function pubmedSearchUrl(base: string, query: string, o: SearchOptions = {}): string {
  let q = query.trim();
  if (o.openAccessOnly) q = `(${q}) AND free full text[sb]`;
  if (o.fromYear) q = `(${q}) AND ${o.fromYear}:3000[dp]`;
  return `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${o.pageSize ?? 15}&sort=${o.newest ? "pub_date" : "relevance"}&${TOOL}&term=${encodeURIComponent(q)}`;
}
export const pubmedAbstractUrl = (base: string, ids: string[]) => `${base}/efetch.fcgi?db=pubmed&retmode=xml&rettype=abstract&${TOOL}&id=${ids.join(",")}`;

export const pmcFullTextUrl = (base: string, pmcid: string) => `${base}/efetch.fcgi?db=pmc&retmode=xml&${TOOL}&id=${encodeURIComponent(pmcid.replace(/^PMC/, ""))}`;

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

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`))?.[1];

/**
 * Articles from an efetch (PubMed XML) response, in the order of `ids`: title,
 * authors, journal, year, publication types, DOI and PubMed Central id (from
 * the article's own id list, not its references), and the abstract.
 */
export function parsePubmedArticles(xml: string, ids: string[] = []): Candidate[] {
  const abstracts = pubmedAbstracts(xml);
  const byId = new Map<string, Candidate>();
  for (const m of xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/g)) {
    const a = m[0];
    const pmid = a.match(/<PMID\b[^>]*>(\d+)<\/PMID>/)?.[1];
    const title = plainText(tag(a, "ArticleTitle") ?? "").replace(/\.$/, "");
    if (!pmid || !title) continue;
    const journal = tag(tag(a, "Journal") ?? "", "Title");
    const pubDate = tag(a, "PubDate") ?? "";
    const year = (tag(pubDate, "Year") ?? tag(pubDate, "MedlineDate") ?? tag(tag(a, "ArticleDate") ?? "", "Year") ?? "").match(/\d{4}/)?.[0];
    const authors = [...(tag(a, "AuthorList") ?? "").matchAll(/<Author\b[\s\S]*?<\/Author>/g)]
      .map((x) => {
        const collective = tag(x[0], "CollectiveName");
        if (collective) return plainText(collective);
        const last = tag(x[0], "LastName");
        const initials = tag(x[0], "Initials");
        return last ? `${plainText(last)}${initials ? ` ${initials}` : ""}` : "";
      })
      .filter(Boolean)
      .slice(0, 7);
    const types = [...a.matchAll(/<PublicationType\b[^>]*>([^<]+)<\/PublicationType>/g)].map((x) => x[1]);
    // The article's own ids live in PubmedData, before any ReferenceList.
    const own = (a.split("<PubmedData")[1] ?? "").split("<ReferenceList")[0];
    const idOf = (t: string) => own.match(new RegExp(`<ArticleId IdType="${t}">([^<]+)</ArticleId>`))?.[1];
    const pmc = idOf("pmc");
    const pmcid = pmc && /^PMC\d+$/.test(pmc) ? pmc : undefined;
    byId.set(pmid, {
      provider: "europepmc",
      id: `MED:${pmid}`,
      kind: types.some((t) => /preprint/i.test(t)) ? "preprint" : "paper",
      title,
      authors,
      venue: journal ? plainText(journal) : undefined,
      year,
      doi: idOf("doi"),
      pmid,
      pmcid,
      abstract: abstracts.get(pmid) ?? "",
      access: pmcid ? "full text" : "abstract",
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      badges: types.filter((t) => /review|meta-analysis|randomized|guideline|systematic/i.test(t)).slice(0, 2),
    });
  }
  const order = ids.length ? ids : [...byId.keys()];
  return order.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
}
