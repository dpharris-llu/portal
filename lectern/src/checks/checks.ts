/** Deck checks shown in the editor (F-010): accessibility, sourcing, fit. Warnings only; nothing is changed silently. */
import type { Block, Deck, Id } from "@/model/types";
import type { Theme } from "@/theme/types";
import { layoutSlide } from "@/layout/engine";

export interface Issue {
  slideId: Id;
  blockId?: Id;
  severity: "error" | "warning" | "info";
  message: string;
}

function blockIssues(slideId: Id, b: Block): Issue[] {
  const out: Issue[] = [];
  if ((b.type === "image" || b.type === "chart") && !b.alt.trim()) {
    out.push({ slideId, blockId: b.id, severity: "error", message: `${b.type === "image" ? "Image" : "Chart"} has no alt text.` });
  }
  if (b.type === "chart" && !b.source?.trim()) {
    out.push({ slideId, blockId: b.id, severity: "warning", message: "Chart figures have no source." });
  }
  if (b.type === "image" && b.src && !b.attribution?.trim()) {
    out.push({ slideId, blockId: b.id, severity: "info", message: "Image has no attribution." });
  }
  if (b.provenance?.author.kind === "ai") {
    out.push({ slideId, blockId: b.id, severity: "info", message: "AI-written content: review before presenting." });
  }
  if ((b.type === "text" || b.type === "bullets") && /\[figure:[^\]]*\]/i.test(b.type === "text" ? b.text : b.items.join(" "))) {
    out.push({ slideId, blockId: b.id, severity: "warning", message: "Placeholder figure still needs a real, sourced value." });
  }
  return out;
}

export function deckChecks(deck: Deck, theme: Theme): Issue[] {
  const issues: Issue[] = [];
  for (const id of [...deck.narrative, ...deck.backup]) {
    const s = deck.slides[id];
    if (!s) continue;
    if (!s.claim.trim()) issues.push({ slideId: id, severity: "warning", message: "Slide has no claim." });
    for (const b of [...s.blocks, ...(s.freeform?.blocks ?? [])]) issues.push(...blockIssues(id, b));
    for (const w of layoutSlide(s, theme).warnings) issues.push({ slideId: id, severity: "warning", message: w });
  }
  return issues;
}
