/**
 * The source catalog (spec 10, Source scope): every database OratorStudio can
 * search, curated by the product owner and the developer under the admission
 * rule. Authors choose from the live ones per presentation; Claude proposes a
 * choice per topic, with a reason for each.
 *
 * Adding a source: write its adapter in src/find/, add it here, and give it
 * a landscape section in server.ts. The search plan picks it up from here.
 */

export type EvidenceKind = "research" | "statistics" | "guidance" | "underway" | "news" | "faith";

export type CatalogSource = {
  id: string;
  name: string;
  /** Who runs it. */
  owner: string;
  kind: EvidenceKind;
  /** What it covers, written for Claude's search plan and for the author. */
  covers: string;
  /** What the author gets from a result. */
  access: string;
  status: "live" | "planned";
  /** Searched unless the author or Claude's plan turns it off. */
  standard: boolean;
};

export const CATALOG: CatalogSource[] = [
  {
    id: "pubmed",
    name: "PubMed",
    owner: "National Library of Medicine (NIH)",
    kind: "research",
    covers: "Biomedical and health research: medicine, nursing, public health, dentistry, allied health, health policy. Systematic reviews, guidelines and primary studies; includes CDC's MMWR",
    access: "Abstracts; free full text from PubMed Central when open access",
    status: "live",
    standard: true,
  },
  {
    id: "openalex",
    name: "OpenAlex",
    owner: "OurResearch (nonprofit), open data",
    kind: "research",
    covers: "Scholarly works in every field: education, social sciences, business, engineering, the humanities, religion and ethics, as well as medicine. Useful when a topic reaches beyond biomedicine",
    access: "Abstracts where the publisher allows; free full text when it is in PubMed Central; otherwise a link",
    status: "live",
    standard: false,
  },
  {
    id: "clinicaltrials",
    name: "ClinicalTrials.gov",
    owner: "National Library of Medicine (NIH)",
    kind: "underway",
    covers: "Registered clinical studies that are recruiting or active: work that may change the evidence soon. Clinical and health topics only",
    access: "The registry record",
    status: "live",
    standard: true,
  },
  {
    id: "bookshelf",
    name: "NCBI Bookshelf",
    owner: "National Library of Medicine (NIH), via Europe PMC",
    kind: "guidance",
    covers: "Government evidence reports and guidance, such as AHRQ evidence reviews and health technology assessments. Health topics",
    access: "Abstract or summary",
    status: "live",
    standard: true,
  },
  {
    id: "datacommons",
    name: "Data Commons",
    owner: "Google, combining Census, CDC, BLS, WHO, World Bank and others",
    kind: "statistics",
    covers: "Statistics for places: population, health, economy, education",
    access: "Values with their original source and date",
    status: "planned",
    standard: false,
  },
  {
    id: "federalregister",
    name: "Federal Register",
    owner: "U.S. National Archives",
    kind: "guidance",
    covers: "Proposed and final federal rules and notices",
    access: "The full document",
    status: "planned",
    standard: false,
  },
  {
    id: "newsrooms",
    name: "Government newsrooms and research news",
    owner: "NIH, CDC, FDA, CMS, WHO; EurekAlert! (AAAS); KFF Health News",
    kind: "news",
    covers: "Official announcements and research press releases; labeled not peer-reviewed, each traced to its primary source",
    access: "The announcement, as a dated snapshot",
    status: "planned",
    standard: false,
  },
  {
    id: "bible",
    name: "The Bible (NIV, NKJV, NLT)",
    owner: "API.Bible (American Bible Society), under each publisher's license",
    kind: "faith",
    covers: "Scripture passages by reference, in the author's chosen version; labeled as Scripture, not research. The Passion Translation is entered by the author",
    access: "The passage text, with the version's copyright notice",
    status: "planned",
    standard: false,
  },
  {
    id: "egw",
    name: "Ellen G. White's writings",
    owner: "Ellen G. White Estate (EGW Writings API)",
    kind: "faith",
    covers: "Her published writings and the Adventist pioneer library, searchable, with standard references (book, page, paragraph)",
    access: "Brief quotations under the Estate's fair-use terms",
    status: "planned",
    standard: false,
  },
  {
    id: "adventist",
    name: "Adventist news and records",
    owner: "Adventist News Network, Adventist Review, Office of Archives, Statistics and Research, Encyclopedia of Seventh-day Adventists",
    kind: "news",
    covers: "Official church news, statistics (Annual Statistical Reports, Yearbook) and history; news labeled not peer-reviewed",
    access: "The article or record, as a dated snapshot",
    status: "planned",
    standard: false,
  },
];

export const LIVE = CATALOG.filter((s) => s.status === "live");
export const LIVE_IDS = LIVE.map((s) => s.id);
export const STANDARD_IDS = LIVE.filter((s) => s.standard).map((s) => s.id);

export const sourceName = (id: string) => CATALOG.find((s) => s.id === id)?.name ?? id;

/** Only live catalog ids, in catalog order; the standard set when none are left. */
export function cleanSelection(ids: readonly string[] | undefined): string[] {
  const chosen = LIVE_IDS.filter((id) => ids?.includes(id));
  return chosen.length ? chosen : STANDARD_IDS;
}
