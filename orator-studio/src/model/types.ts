/**
 * The deck model (spec section 5). A deck is a model of an argument:
 * slides hold a claim, evidence blocks and a presenter intent. Layout is
 * derived from this, never stored as positioned boxes (except freeform regions).
 */

import type { Mapping } from "@/sources/aggregate";

export type Id = string;

export type Intent = "inform" | "persuade" | "decide";

/** Who made a change. Every AI change is labeled (spec 9, guardrail 1). */
export interface Author {
  kind: "human" | "ai";
  id: string;
  /** For AI authors: the model or feature that produced the change. */
  via?: string;
}

export interface Provenance {
  author: Author;
  at: string;
  /** Source of a figure or claim, when bound or cited. */
  source?: string;
}

interface BlockBase {
  id: Id;
  /** Set when the block's current content came from AI. Persists into history and export. */
  provenance?: Provenance;
}

export interface TextBlock extends BlockBase {
  type: "text";
  text: string;
}

export interface BulletsBlock extends BlockBase {
  type: "bullets";
  items: string[];
  /** Indent level per item (0 = top). Omitted means all top level. */
  levels?: number[];
}

export interface ImageBlock extends BlockBase {
  type: "image";
  src: string;
  alt: string;
  attribution?: string;
}

export interface TableBlock extends BlockBase {
  type: "table";
  header: string[];
  rows: string[][];
  caption?: string;
  binding?: Binding;
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  text: string;
  attribution?: string;
}

/** Links a chart or table to confirmed figures in one of the deck's data sources. */
export interface Binding {
  sourceId: Id;
  seriesIds: Id[];
}

export interface ChartBlock extends BlockBase {
  type: "chart";
  chart: "bar" | "line";
  labels: string[];
  series: { name: string; values: number[] }[];
  /** Text alternative describing what the chart shows. */
  alt: string;
  /** How value labels are written; plain numbers when omitted. */
  unit?: "currency" | "percent" | "number";
  /** Where the numbers came from. Required before a chart can be shown without a warning (guardrail 2). */
  source?: string;
  /** Set when the figures come from confirmed document data; the values above are a copy. */
  binding?: Binding;
}

export type PollKind = "choice" | "rating" | "ranking" | "text" | "wordcloud";

/** A live audience poll (A-02). Its results render on the slide as a chart while presenting (A-03). */
export interface PollBlock extends BlockBase {
  type: "poll";
  poll: PollKind;
  question: string;
  /** Choice and ranking polls. */
  options: string[];
  /** Rating polls: highest value. */
  scale?: number;
}

export type Block = TextBlock | BulletsBlock | ImageBlock | TableBlock | QuoteBlock | ChartBlock | PollBlock;
export type BlockType = Block["type"];

/** A rectangle in slide-relative units (0..1 on each axis). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The escape hatch (principle 5): absolutely positioned blocks, exempt from layout rules. */
export interface FreeformRegion {
  rect: Rect;
  blocks: Block[];
}

export interface SlideFlags {
  /** Voice commands may never put this slide on screen (L-06). */
  neverShowOnVoice?: boolean;
  /** Sending this slide to the audience needs a second confirmation (L-06). */
  requireConfirm?: boolean;
}

export interface Slide {
  id: Id;
  /** The one thing this slide says. Rendered as the title. */
  claim: string;
  intent: Intent;
  blocks: Block[];
  notes: string;
  flags: SlideFlags;
  freeform?: FreeformRegion;
  /** Name of a layout to force instead of the automatic choice. */
  layoutOverride?: string;
  /** The argument point this slide was drafted from, so argument changes can show which slides they affect. */
  pointId?: string;
  /** What PPTX import could not convert or had to guess; cleared once reviewed (F-006). */
  importNotes?: string[];
}

export interface DeckMeta {
  title: string;
  goal: string;
  audience: string;
  timeLimitMin: number;
  takeaway: string;
  themeId: string;
  /** The Research argument these slides were drafted from (F-016), and its version at the time. */
  argumentId?: string;
  argumentVersion?: number;
}

/** One document a data source was read from, such as one month's report. */
export interface SourceDocument {
  id: Id;
  name: string;
  /** Column heading, e.g. "Jan 2026". */
  period: string;
  pages: number;
}

/** One figure: read from a page, or typed in by the author where the document had none. */
export interface SourceFigure {
  value: number | null;
  raw?: string;
  page?: number;
  /** For data URL sources: the field, or how the figure was combined from it. */
  path?: string;
  entered?: boolean;
}

/** A labeled figure across all the source's documents, confirmed by a person before use. */
export interface SourceSeries {
  id: Id;
  label: string;
  unit: "currency" | "percent" | "number";
  /** One per document, in document order. */
  figures: SourceFigure[];
  confirmedAt: string;
  confirmedBy: string;
  /** A target, budget or reference value the author supplied, shown beside the row it applies to. */
  role?: "comparison";
  compareTo?: Id;
}

/** Figures read from a set of documents (spec: start from documents). */
/** Where a data URL source came from, and how its fields were mapped, so it can be refreshed (F-014). */
export interface UrlOrigin {
  url: string;
  fetchedAt: string;
  sha256: string;
  contentType: string;
  format: "json" | "xml" | "csv";
  mapping: Mapping;
  /** The fetched response, kept as a snapshot in this browser's asset store. */
  snapshotAssetId?: string;
}

export interface DataSource {
  id: Id;
  name: string;
  kind: "documents" | "url";
  origin?: UrlOrigin;
  documents: SourceDocument[];
  series: SourceSeries[];
  createdAt: string;
}

/** A finding, limitation or method detail from a paper, with the exact words it rests on. */
export interface PaperClaim {
  /** "P1-C2": paper 1, claim 2. */
  id: Id;
  kind: "finding" | "limitation";
  /** Plain-language statement; any number in it is printed on the cited page. */
  text: string;
  /** Copied word for word from the page ("..." may skip text). */
  quote: string;
  page: number;
  confirmedAt: string;
}

/** A research paper used as evidence, read by Claude and checked against its own text. */
export interface Paper {
  /** "P1", "P2"; also its reference number. */
  id: Id;
  fileName: string;
  pages: number;
  citation: { title: string; authors: string[]; year?: string; venue?: string; doi?: string };
  design?: string;
  sample?: string;
  claims: PaperClaim[];
  /** The PDF, kept in this browser's asset store. */
  pdfAssetId?: string;
  readAt: string;
  via: string;
}

export interface Deck {
  id: Id;
  tenantId: Id;
  meta: DeckMeta;
  /** The main narrative, in order. */
  narrative: Id[];
  /** Backup material, reachable by search and jump but not by "next". */
  backup: Id[];
  slides: Record<Id, Slide>;
  /** Confirmed figures that charts and tables can be bound to. */
  sources?: Record<Id, DataSource>;
  /** Research papers the deck cites. */
  papers?: Record<Id, Paper>;
  /** Number of operations applied. */
  version: number;
}

export type Section = "narrative" | "backup";
