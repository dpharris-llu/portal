import type { Slide } from "./types";
import type { OpBody, SlidePatch } from "./ops";

const FIELDS = ["claim", "intent", "notes", "flags", "freeform", "layoutOverride", "importNotes"] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Operations that turn slide `a` into slide `b`, for edits made in a draft
 * (field changes and block content changes; blocks keep their ids and order).
 */
export function diffSlide(a: Slide, b: Slide): OpBody[] {
  const ops: OpBody[] = [];
  const patch: SlidePatch = {};
  for (const f of FIELDS) if (!same(a[f], b[f])) (patch as Record<string, unknown>)[f] = b[f] ?? null;
  if (Object.keys(patch).length) ops.push({ kind: "slide.update", slideId: a.id, patch });
  for (const block of b.blocks) {
    const old = a.blocks.find((x) => x.id === block.id);
    if (old && !same(old, block)) ops.push({ kind: "block.replace", slideId: a.id, block });
  }
  return ops;
}
