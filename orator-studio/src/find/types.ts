/**
 * Finding sources (F-119): searches of named scientific and government
 * databases only. Results are candidates; nothing enters the workspace until
 * the author adds it, and what is added is read and checked like any source.
 */
export type Provider = "europepmc" | "clinicaltrials" | "openalex";

export interface Candidate {
  provider: Provider;
  /** Europe PMC "MED:12345678", or a ClinicalTrials.gov NCT number. */
  id: string;
  kind: "paper" | "report" | "preprint" | "trial";
  title: string;
  authors: string[];
  venue?: string;
  year?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  abstract: string;
  /** What can be read: the full text (open access), the abstract only, or the registry record. */
  access: "full text" | "abstract" | "registry record" | "link only";
  /** The public page for the record. */
  url: string;
  /** Short facts for the list: trial status, enrollment, publication type. */
  badges: string[];
  /** For trials: the record rendered as text, ready to read and check. */
  recordText?: string;
}

export interface SearchOptions {
  openAccessOnly?: boolean;
  fromYear?: number;
  pageSize?: number;
  /** Newest first instead of best match. */
  newest?: boolean;
}

export const PROVIDERS: Record<Provider, { name: string; covers: string }> = {
  europepmc: { name: "Papers and reports", covers: "PubMed, the NIH's database of journal articles (including CDC's MMWR), with free full texts from PubMed Central; plus government reports from NCBI Bookshelf (such as AHRQ evidence reviews) and preprints, through Europe PMC" },
  clinicaltrials: { name: "Registered trials", covers: "ClinicalTrials.gov, the U.S. National Library of Medicine's registry of clinical studies" },
  openalex: { name: "All fields", covers: "OpenAlex, open data on scholarly works in every field: education, social sciences, business, engineering, the humanities, as well as medicine" },
};

/** One part of the discovery landscape (F-020). */
export interface LandscapeSection {
  key: "strongest" | "newest" | "allfields" | "ongoing" | "reports";
  title: string;
  note: string;
  results: Candidate[];
  error?: string;
  /** Set when the exact topic found nothing and a broader search stood in. */
  broadened?: string;
}
