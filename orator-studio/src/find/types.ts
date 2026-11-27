/**
 * Finding sources (F-119): searches of named scientific and government
 * databases only. Results are candidates; nothing enters the workspace until
 * the author adds it, and what is added is read and checked like any source.
 */
export type Provider = "europepmc" | "clinicaltrials";

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
  access: "full text" | "abstract" | "registry record";
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
}

export const PROVIDERS: Record<Provider, { name: string; covers: string }> = {
  europepmc: { name: "Papers and reports", covers: "Europe PMC: all of PubMed (including CDC's MMWR), open-access full texts from PubMed Central, preprints, and NCBI Bookshelf government reports such as AHRQ evidence reviews" },
  clinicaltrials: { name: "Registered trials", covers: "ClinicalTrials.gov, the U.S. National Library of Medicine's registry of clinical studies" },
};
