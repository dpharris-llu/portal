"use client";
/**
 * A search result (a candidate) turned into something to read and keep:
 * the full text from PubMed Central when free, otherwise the abstract, or a
 * trial's registry record. The source's details come from the database record.
 */
import type { Candidate } from "@/find/types";
import { shortCitation } from "@/ai/evidence";
import type { NewSource } from "@/knowledge/repo";
import type { SourceDoc } from "./ReadSource";

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "That couldn't be done here.");
  return json as T;
}

export function citationOf(c: Candidate): string {
  const authors = c.authors.length ? c.authors.join(", ") : c.venue ?? "";
  return `${authors}${c.year ? ` (${c.year})` : ""}. ${c.title}.${c.venue && c.authors.length ? ` ${c.venue}.` : ""}${c.doi ? ` doi:${c.doi}` : ""}${c.provider === "clinicaltrials" ? ` ClinicalTrials.gov ${c.id}.` : c.pmid ? ` PMID ${c.pmid}.` : ""}`;
}

/** "Delgado et al., 2025"; an organization as author keeps its whole name. */
export function shortFor(c: Candidate): string {
  const first = c.authors[0] ?? "";
  const person = /\b[A-Z]{1,3}\.?$/.test(first) || /,/.test(first);
  if (c.authors.length === 1 && !person) return `${first}${c.year ? `, ${c.year}` : ""}`;
  return shortCitation({ title: c.title, authors: c.authors, year: c.year });
}

export function sourceFromCandidate(c: Candidate): NewSource {
  const ids: Record<string, string> = {};
  if (c.doi) ids.doi = c.doi;
  if (c.pmid) ids.pmid = c.pmid;
  if (c.pmcid) ids.pmcid = c.pmcid;
  if (c.provider === "clinicaltrials") ids.nct = c.id;
  if (c.provider === "openalex") ids.openalex = c.id.replace(/^openalex:/, "");
  return {
    kind: c.kind === "trial" ? "trial" : c.kind === "report" ? "report" : "paper",
    title: c.title,
    citation: citationOf(c),
    short: c.provider === "clinicaltrials" ? c.id : shortFor(c),
    url: c.url,
    year: c.year ?? null,
    origin: "discovered",
    access: c.access === "link only" ? "abstract" : c.access,
    ids,
  };
}

/** What to read for a chosen result: full text when free, else the abstract, or the registry record. */
export async function candidateDoc(c: Candidate): Promise<{ doc: SourceDoc; note?: string }> {
  const meta = sourceFromCandidate(c);
  if (c.provider === "clinicaltrials")
    return { doc: { name: c.id, pages: [{ page: 1, text: c.recordText ?? c.title }], labels: { 1: "Registry record" }, meta, context: "This is a ClinicalTrials.gov registry record, not a paper. Findings are what the record states (design, enrollment, status, outcomes measured, whether results are posted). Do not infer results that are not posted." } };
  let note: string | undefined;
  if (c.access === "full text" && c.pmcid) {
    try {
      const ft = await post<{ pages: SourceDoc["pages"]; labels: Record<number, string> }>("/api/sources/fulltext", { pmcid: c.pmcid });
      return { doc: { name: c.title, pages: ft.pages, labels: ft.labels, meta: { ...meta, access: "full text" } } };
    } catch {
      note = "The full text couldn't be fetched, so only the abstract is used.";
    }
  }
  if (!c.abstract) throw new Error("This record has no abstract to read. Open the link, and upload the PDF if you can get it.");
  return { note, doc: { name: c.title, pages: [{ page: 1, text: c.abstract }], labels: { 1: "Abstract" }, meta: { ...meta, access: "abstract" }, context: "Only the abstract is available. Extract findings from the abstract alone and note that the full paper was not read." } };
}
