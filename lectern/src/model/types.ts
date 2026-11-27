/**
 * The deck model (spec section 3). A deck is a model of an argument:
 * slides hold a claim, evidence blocks and a presenter intent. Layout is
 * derived from this, never stored as positioned boxes (except freeform regions).
 */

export type Id = string;

export type Intent = "inform" | "persuade" | "decide";

/** Who made a change. Every AI change is labeled (spec 6, guardrail 1). */
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
}

export interface QuoteBlock extends BlockBase {
  type: "quote";
  text: string;
  attribution?: string;
}

export interface ChartBlock extends BlockBase {
  type: "chart";
  chart: "bar" | "line";
  labels: string[];
  series: { name: string; values: number[] }[];
  /** Text alternative describing what the chart shows. */
  alt: string;
  /** Where the numbers came from. Required before a chart can be shown without a warning (guardrail 2). */
  source?: string;
}

export type Block = TextBlock | BulletsBlock | ImageBlock | TableBlock | QuoteBlock | ChartBlock;
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
  /** Number of operations applied. */
  version: number;
}

export type Section = "narrative" | "backup";
