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

function blockIssues(slideId: Id, b: Block, deck?: Deck): Issue[] {
  const out: Issue[] = [];
  if ((b.type === "chart" || b.type === "table") && b.binding) {
    const src = deck?.sources?.[b.binding.sourceId];
    if (!src || b.binding.seriesIds.some((id) => !src.series.some((s) => s.id === id))) {
      out.push({ slideId, blockId: b.id, severity: "error", message: "The source of these figures is missing from the deck." });
    }
  }
  if ((b.type === "image" || b.type === "chart") && !b.alt.trim()) {
    out.push({ slideId, blockId: b.id, severity: "error", message: `${b.type === "image" ? "Image" : "Chart"} has no alt text.` });
  }
  if (b.type === "chart" && !b.source?.trim()) {
    out.push({ slideId, blockId: b.id, severity: "warning", message: "Chart figures have no source." });
  }
  if (b.type === "image" && b.src && !b.attribution?.trim()) {
    out.push({ slideId, blockId: b.id, severity: "info", message: "Image has no attribution." });
  }
  if (b.type === "poll") {
    if (!b.question.trim()) out.push({ slideId, blockId: b.id, severity: "warning", message: "Poll has no question." });
    if ((b.poll === "choice" || b.poll === "ranking") && b.options.filter((o) => o.trim()).length < 2) {
      out.push({ slideId, blockId: b.id, severity: "warning", message: "Poll needs at least two options." });
    }
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
    for (const note of s.importNotes ?? []) issues.push({ slideId: id, severity: "warning", message: `Review: ${note}` });
    for (const b of [...s.blocks, ...(s.freeform?.blocks ?? [])]) issues.push(...blockIssues(id, b, deck));
    for (const w of layoutSlide(s, theme).warnings) issues.push({ slideId: id, severity: "warning", message: w });
  }
  return issues;
}
