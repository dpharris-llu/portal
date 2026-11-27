import { describe, expect, it } from "vitest";
import { deckChecks } from "./checks";
import { sampleDeck } from "@/model/sample";
import { lluTheme } from "@/theme/llu";
import { newId } from "@/model/ids";

describe("checks", () => {
  it("the sample deck is clean", () => {
    expect(deckChecks(sampleDeck(), lluTheme).filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("flags missing alt text, unsourced charts and placeholder figures", () => {
    const deck = sampleDeck();
    const s = deck.slides[deck.narrative[0]];
    s.blocks.push({ id: newId("b"), type: "image", src: "x.png", alt: "" });
    s.blocks.push({ id: newId("b"), type: "chart", chart: "bar", labels: ["a"], series: [{ name: "s", values: [1] }], alt: "" });
    s.blocks.push({ id: newId("b"), type: "text", text: "Enrollment rose [figure: change since 2024]" });
    const msgs = deckChecks(deck, lluTheme).map((i) => i.message);
    expect(msgs).toContain("Image has no alt text.");
    expect(msgs).toContain("Chart has no alt text.");
    expect(msgs).toContain("Chart figures have no source.");
    expect(msgs).toContain("Placeholder figure still needs a real, sourced value.");
  });
});
