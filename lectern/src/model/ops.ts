/**
 * Every edit, by a person or by AI, is an operation with author, time and
 * reason (spec 3, "Rules of the model"). The deck is the fold of its operations,
 * which gives history, undo, and later claim-level diffs and co-editing.
 */
import type { Author, Block, Deck, DeckMeta, Id, Section, Slide } from "./types";
import { newId } from "./ids";

type Patchable = Pick<Slide, "claim" | "intent" | "notes" | "flags" | "freeform" | "layoutOverride" | "importNotes">;
/** A field set to null is removed. (Not undefined: that would vanish when the log is stored as JSON.) */
export type SlidePatch = { [K in keyof Patchable]?: Patchable[K] | null };

export type OpBody =
  | { kind: "deck.setMeta"; patch: Partial<DeckMeta> }
  | { kind: "slide.insert"; slide: Slide; section: Section; index: number }
  | { kind: "slide.delete"; slideId: Id }
  | { kind: "slide.move"; slideId: Id; section: Section; index: number }
  | { kind: "slide.update"; slideId: Id; patch: SlidePatch }
  | { kind: "block.insert"; slideId: Id; block: Block; index: number }
  | { kind: "block.replace"; slideId: Id; block: Block }
  | { kind: "block.delete"; slideId: Id; blockId: Id }
  | { kind: "block.move"; slideId: Id; blockId: Id; index: number };

export type Operation = OpBody & {
  id: Id;
  at: string;
  author: Author;
  reason?: string;
};

export class OpError extends Error {}

export function makeOp(body: OpBody, author: Author, reason?: string): Operation {
  return { ...body, id: newId("op"), at: new Date().toISOString(), author, reason };
}

function clamp(i: number, max: number): number {
  return Math.max(0, Math.min(i, max));
}

function requireSlide(deck: Deck, slideId: Id): Slide {
  const s = deck.slides[slideId];
  if (!s) throw new OpError(`No slide ${slideId}`);
  return s;
}

export function locateSlide(deck: Deck, slideId: Id): { section: Section; index: number } | null {
  const n = deck.narrative.indexOf(slideId);
  if (n >= 0) return { section: "narrative", index: n };
  const b = deck.backup.indexOf(slideId);
  if (b >= 0) return { section: "backup", index: b };
  return null;
}

function withSlide(deck: Deck, slide: Slide): Deck {
  return { ...deck, slides: { ...deck.slides, [slide.id]: slide } };
}

/** Apply keys of a patch; a key set to null (or undefined) is removed. */
function patchObject<T extends object>(obj: T, patch: object): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

/** Pure: returns a new deck with the operation applied. Throws OpError if it does not fit. */
export function applyOp(deck: Deck, op: OpBody): Deck {
  let next: Deck;
  switch (op.kind) {
    case "deck.setMeta":
      next = { ...deck, meta: patchObject<DeckMeta>(deck.meta, op.patch) };
      break;
    case "slide.insert": {
      if (deck.slides[op.slide.id]) throw new OpError(`Slide ${op.slide.id} exists`);
      const list = [...deck[op.section]];
      list.splice(clamp(op.index, list.length), 0, op.slide.id);
      next = { ...withSlide(deck, op.slide), [op.section]: list };
      break;
    }
    case "slide.delete": {
      requireSlide(deck, op.slideId);
      const slides = { ...deck.slides };
      delete slides[op.slideId];
      next = {
        ...deck,
        slides,
        narrative: deck.narrative.filter((id) => id !== op.slideId),
        backup: deck.backup.filter((id) => id !== op.slideId),
      };
      break;
    }
    case "slide.move": {
      requireSlide(deck, op.slideId);
      const narrative = deck.narrative.filter((id) => id !== op.slideId);
      const backup = deck.backup.filter((id) => id !== op.slideId);
      const target = op.section === "narrative" ? narrative : backup;
      target.splice(clamp(op.index, target.length), 0, op.slideId);
      next = { ...deck, narrative, backup };
      break;
    }
    case "slide.update": {
      const s = requireSlide(deck, op.slideId);
      next = withSlide(deck, patchObject<Slide>(s, op.patch));
      break;
    }
    case "block.insert": {
      const s = requireSlide(deck, op.slideId);
      if (s.blocks.some((b) => b.id === op.block.id)) throw new OpError(`Block ${op.block.id} exists`);
      const blocks = [...s.blocks];
      blocks.splice(clamp(op.index, blocks.length), 0, op.block);
      next = withSlide(deck, { ...s, blocks });
      break;
    }
    case "block.replace": {
      const s = requireSlide(deck, op.slideId);
      const i = s.blocks.findIndex((b) => b.id === op.block.id);
      if (i < 0) throw new OpError(`No block ${op.block.id}`);
      const blocks = [...s.blocks];
      blocks[i] = op.block;
      next = withSlide(deck, { ...s, blocks });
      break;
    }
    case "block.delete": {
      const s = requireSlide(deck, op.slideId);
      if (!s.blocks.some((b) => b.id === op.blockId)) throw new OpError(`No block ${op.blockId}`);
      next = withSlide(deck, { ...s, blocks: s.blocks.filter((b) => b.id !== op.blockId) });
      break;
    }
    case "block.move": {
      const s = requireSlide(deck, op.slideId);
      const block = s.blocks.find((b) => b.id === op.blockId);
      if (!block) throw new OpError(`No block ${op.blockId}`);
      const blocks = s.blocks.filter((b) => b.id !== op.blockId);
      blocks.splice(clamp(op.index, blocks.length), 0, block);
      next = withSlide(deck, { ...s, blocks });
      break;
    }
  }
  return { ...next, version: deck.version + 1 };
}

/** The operation that undoes `op`, computed against the deck as it was before `op`. */
export function invertOp(before: Deck, op: OpBody): OpBody {
  switch (op.kind) {
    case "deck.setMeta": {
      const patch: Partial<DeckMeta> = {};
      for (const k of Object.keys(op.patch) as (keyof DeckMeta)[]) {
        (patch as Record<string, unknown>)[k] = before.meta[k];
      }
      return { kind: "deck.setMeta", patch };
    }
    case "slide.insert":
      return { kind: "slide.delete", slideId: op.slide.id };
    case "slide.delete": {
      const loc = locateSlide(before, op.slideId);
      if (!loc) throw new OpError(`Slide ${op.slideId} is in no section`);
      return { kind: "slide.insert", slide: requireSlide(before, op.slideId), ...loc };
    }
    case "slide.move": {
      const loc = locateSlide(before, op.slideId);
      if (!loc) throw new OpError(`Slide ${op.slideId} is in no section`);
      return { kind: "slide.move", slideId: op.slideId, ...loc };
    }
    case "slide.update": {
      const s = requireSlide(before, op.slideId);
      const patch: SlidePatch = {};
      for (const k of Object.keys(op.patch) as (keyof SlidePatch)[]) {
        (patch as Record<string, unknown>)[k] = s[k] ?? null;
      }
      return { kind: "slide.update", slideId: op.slideId, patch };
    }
    case "block.insert":
      return { kind: "block.delete", slideId: op.slideId, blockId: op.block.id };
    case "block.replace": {
      const s = requireSlide(before, op.slideId);
      const old = s.blocks.find((b) => b.id === op.block.id);
      if (!old) throw new OpError(`No block ${op.block.id}`);
      return { kind: "block.replace", slideId: op.slideId, block: old };
    }
    case "block.delete": {
      const s = requireSlide(before, op.slideId);
      const index = s.blocks.findIndex((b) => b.id === op.blockId);
      if (index < 0) throw new OpError(`No block ${op.blockId}`);
      return { kind: "block.insert", slideId: op.slideId, block: s.blocks[index], index };
    }
    case "block.move": {
      const s = requireSlide(before, op.slideId);
      const index = s.blocks.findIndex((b) => b.id === op.blockId);
      return { kind: "block.move", slideId: op.slideId, blockId: op.blockId, index };
    }
  }
}

export function stripMeta(op: Operation): OpBody {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, at, author, reason, ...body } = op;
  return body as OpBody;
}

export function replay(initial: Deck, ops: Operation[]): Deck {
  return ops.reduce((d, op) => applyOp(d, op), initial);
}
