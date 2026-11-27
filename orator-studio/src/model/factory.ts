import type { Block, Deck, DeckMeta, Intent, Slide } from "./types";
import { newId } from "./ids";

export const LOCAL_TENANT = "local";

export function emptyDeck(meta: Partial<DeckMeta> = {}, tenantId = LOCAL_TENANT): Deck {
  return {
    id: newId("deck"),
    tenantId,
    meta: {
      title: "Untitled deck",
      goal: "",
      audience: "",
      timeLimitMin: 20,
      takeaway: "",
      themeId: "llu",
      ...meta,
    },
    narrative: [],
    backup: [],
    slides: {},
    version: 0,
  };
}

export function newSlide(claim: string, intent: Intent = "inform", blocks: Block[] = []): Slide {
  return { id: newId("s"), claim, intent, blocks, notes: "", flags: {} };
}

export function textBlock(text: string): Block {
  return { id: newId("b"), type: "text", text };
}

export function bulletsBlock(items: string[]): Block {
  return { id: newId("b"), type: "bullets", items };
}

export function blankBlock(type: Block["type"]): Block {
  const id = newId("b");
  switch (type) {
    case "text":
      return { id, type, text: "" };
    case "bullets":
      return { id, type, items: [""] };
    case "image":
      return { id, type, src: "", alt: "" };
    case "table":
      return { id, type, header: ["Column 1", "Column 2"], rows: [["", ""]] };
    case "quote":
      return { id, type, text: "", attribution: "" };
    case "chart":
      return { id, type, chart: "bar", labels: ["A", "B", "C"], series: [{ name: "Series 1", values: [1, 2, 3] }], alt: "" };
    case "poll":
      return { id, type, poll: "choice", question: "", options: ["", ""] };
  }
}
