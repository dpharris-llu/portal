import { describe, expect, it } from "vitest";
import { applyOp, invertOp, OpError, replay, type OpBody } from "./ops";
import { commit, initState, redo, undo } from "./history";
import { emptyDeck, newSlide, textBlock } from "./factory";
import { sampleDeck } from "./sample";
import type { Author } from "./types";

const me: Author = { kind: "human", id: "me" };
const ai: Author = { kind: "ai", id: "outline", via: "claude" };

describe("operations", () => {
  it("every op inverts back to the original deck", () => {
    const deck = sampleDeck();
    const [s0, s1] = deck.narrative;
    const b0 = deck.slides[s0].blocks[0];
    const cases: OpBody[] = [
      { kind: "deck.setMeta", patch: { title: "New", timeLimitMin: 5 } },
      { kind: "slide.insert", slide: newSlide("Inserted"), section: "backup", index: 0 },
      { kind: "slide.delete", slideId: s1 },
      { kind: "slide.move", slideId: s0, section: "backup", index: 1 },
      { kind: "slide.update", slideId: s0, patch: { claim: "Changed", flags: { neverShowOnVoice: true } } },
      { kind: "slide.update", slideId: s0, patch: { layoutOverride: "grid" } },
      { kind: "block.insert", slideId: s0, block: textBlock("new"), index: 0 },
      { kind: "block.replace", slideId: s0, block: { ...b0, type: "text", text: "replaced" } as never },
      { kind: "block.delete", slideId: s0, blockId: b0.id },
    ];
    for (const op of cases) {
      const after = applyOp(deck, op);
      const back = applyOp(after, invertOp(deck, op));
      expect({ ...back, version: 0 }, op.kind).toEqual({ ...deck, version: 0 });
    }
  });

  it("rejects ops that do not fit the deck", () => {
    expect(() => applyOp(emptyDeck(), { kind: "slide.delete", slideId: "nope" })).toThrow(OpError);
  });

  it("theme changes never touch content", () => {
    const deck = sampleDeck();
    const after = applyOp(deck, { kind: "deck.setMeta", patch: { themeId: "other" } });
    expect(after.slides).toBe(deck.slides);
  });
});

describe("history", () => {
  it("undo appends inverse ops and the log replays to the current deck", () => {
    const start = emptyDeck();
    let st = initState(start);
    const a = newSlide("A");
    const b = newSlide("B");
    st = commit(
      st,
      [
        { kind: "slide.insert", slide: a, section: "narrative", index: 0 },
        { kind: "slide.insert", slide: b, section: "narrative", index: 1 },
      ],
      ai,
      "AI drafted 2 slides",
    );
    st = commit(st, { kind: "slide.update", slideId: a.id, patch: { claim: "A!" } }, me);
    expect(st.log.every((op) => op.author.kind === "ai" || op.author.id === "me")).toBe(true);

    st = undo(st, me);
    expect(st.deck.slides[a.id].claim).toBe("A");
    st = undo(st, me);
    expect(st.deck.narrative).toEqual([]);
    st = redo(st, me);
    expect(st.deck.narrative).toEqual([a.id, b.id]);

    expect(st.log.length).toBe(8); // 2 + 1 + undo(1) + undo(2) + redo(2)
    expect(replay(start, st.log)).toEqual(st.deck);
  });
});

import { diffSlide } from "./diff";
describe("diffSlide", () => {
  it("turns draft edits into ops that reproduce the draft", () => {
    const deck = sampleDeck();
    const a = deck.slides[deck.narrative[0]];
    const b = structuredClone(a);
    b.claim = "New claim";
    b.flags = { requireConfirm: true };
    b.blocks[0] = { ...b.blocks[0], items: ["x"] } as typeof b.blocks[0];
    const ops = diffSlide(a, b);
    expect(ops.map((o) => o.kind)).toEqual(["slide.update", "block.replace"]);
    const after = ops.reduce((d, op) => applyOp(d, op), deck);
    expect(after.slides[a.id]).toEqual(b);
    expect(diffSlide(a, a)).toEqual([]);
  });
});
