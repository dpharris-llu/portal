/**
 * OpenAlex (https://openalex.org): open data on scholarly works in every
 * field (CC0). Used for research beyond biomedicine. Abstracts come as an
 * "inverted index" (word -> positions) and are rebuilt here; some publishers
 * withhold them, and then only the link is offered.
 */
import type { Candidate } from "./types";

export const OPENALEX_BASE = "https://api.openalex.org";

const FIELDS = "id,doi,title,display_name,publication_year,type,open_access,primary_location,authorships,cited_by_count,abstract_inverted_index,ids";

export function openAlexSearchUrl(base: string, words: string, o: { fromYear?: number; pageSize?: number; apiKey?: string } = {}): string {
  const filter = ["is_retracted:false", "type:article|review|book-chapter|report|preprint", ...(o.fromYear ? [`from_publication_date:${o.fromYear}-01-01`] : [])].join(",");
  const p = new URLSearchParams({ search: words, filter, "per-page": String(o.pageSize ?? 8), select: FIELDS });
  if (o.apiKey) p.set("api_key", o.apiKey);
  return `${base}/works?${p.toString()}`;
}

/** The abstract as text, from OpenAlex's word -> positions index. */
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const at of positions ?? []) if (at >= 0 && at < 20000) words[at] = word;
  return words.filter((w) => w !== undefined).join(" ").trim();
}

type Work = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
  primary_location?: { source?: { display_name?: string | null } | null; landing_page_url?: string | null } | null;
  authorships?: { author?: { display_name?: string | null } | null }[] | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  ids?: { pmid?: string | null; pmcid?: string | null } | null;
};

const tail = (url: string | null | undefined, re: RegExp) => (url ? re.exec(url)?.[1] : undefined);

export function parseOpenAlex(json: unknown): Candidate[] {
  const results = ((json as { results?: Work[] })?.results ?? []) as Work[];
  return results.flatMap((w): Candidate[] => {
    const title = (w.title ?? w.display_name ?? "").trim();
    const key = tail(w.id, /(W\d+)$/);
    if (!title || !key) return [];
    const doi = tail(w.doi, /doi\.org\/(.+)$/i) ?? undefined;
    const pmid = tail(w.ids?.pmid, /(\d+)\/?$/);
    const pmcid = tail(w.ids?.pmcid, /(PMC\d+)/i)?.toUpperCase();
    const abstract = abstractFromIndex(w.abstract_inverted_index);
    const type = w.type ?? "article";
    const badges = [
      ...(type === "review" ? ["Review"] : type === "preprint" ? ["Preprint, not peer-reviewed"] : type === "report" ? ["Report"] : []),
      ...(w.cited_by_count ? [`Cited by ${w.cited_by_count.toLocaleString("en-US")}`] : []),
    ];
    return [
      {
        provider: "openalex",
        id: `openalex:${key}`,
        kind: type === "report" ? "report" : type === "preprint" ? "preprint" : "paper",
        title,
        authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
        ...(w.primary_location?.source?.display_name ? { venue: w.primary_location.source.display_name } : {}),
        ...(w.publication_year ? { year: String(w.publication_year) } : {}),
        ...(doi ? { doi } : {}),
        ...(pmid ? { pmid } : {}),
        ...(pmcid ? { pmcid } : {}),
        abstract,
        // Full text is read from PubMed Central only; other open copies are linked.
        access: pmcid && w.open_access?.is_oa ? "full text" : abstract ? "abstract" : "link only",
        url: doi ? `https://doi.org/${doi}` : w.primary_location?.landing_page_url || `https://openalex.org/${key}`,
        badges,
      },
    ];
  });
}
