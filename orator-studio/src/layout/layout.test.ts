import { describe, expect, it } from "vitest";
import { chooseLayout, layoutSlide } from "./engine";
import { lluTheme } from "@/theme/llu";
import { bulletsBlock, newSlide, textBlock } from "@/model/factory";
import type { Block, Rect } from "@/model/types";

const chart: Block = { id: "c", type: "chart", chart: "bar", labels: ["a"], series: [{ name: "s", values: [1] }], alt: "x" };
const within = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;

describe("layout", () => {
  it("chooses layouts from block types", () => {
    expect(chooseLayout([])).toBe("statement");
    expect(chooseLayout([chart])).toBe("visual");
    expect(chooseLayout([textBlock("a"), chart])).toBe("split");
    expect(chooseLayout([textBlock("a"), bulletsBlock(["b"])])).toBe("stack");
    expect(chooseLayout([chart, { ...chart, id: "d" }])).toBe("grid");
  });

  it("keeps boxes on the slide and apart", () => {
    const slides = [
      newSlide("Claim", "inform", [textBlock("one"), chart]),
      newSlide("Claim", "inform", [textBlock("one"), bulletsBlock(["a", "b"]), textBlock("three")]),
      newSlide("Claim", "inform", [chart, { ...chart, id: "d" }, textBlock("x")]),
    ];
    for (const s of slides) {
      const l = layoutSlide(s, lluTheme);
      const rects = [l.title.rect, ...l.boxes.map((b) => b.rect)];
      rects.forEach((r) => expect(within(r)).toBe(true));
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
    }
  });

  it("shrinks long text, then warns", () => {
    const long = newSlide("Claim", "inform", [textBlock("word ".repeat(200))]);
    const l = layoutSlide(long, lluTheme);
    expect(l.boxes[0].fontScale).toBeLessThan(1);
    const huge = layoutSlide(newSlide("Claim", "inform", [textBlock("word ".repeat(2000))]), lluTheme);
    expect(huge.warnings.length).toBe(1);
  });

  it("shrinks long tables to fit, and warns when even the minimum is too big", () => {
    const table = (n: number): Block => ({ id: "t", type: "table", header: ["A", "B"], rows: Array.from({ length: n }, () => ["1", "2"]) });
    expect(layoutSlide(newSlide("Claim", "inform", [table(3)]), lluTheme).boxes[0].fontScale).toBe(1);
    const eleven = layoutSlide(newSlide("Claim", "inform", [table(10)]), lluTheme);
    expect(eleven.boxes[0].fontScale).toBeLessThan(1);
    expect(eleven.warnings).toEqual([]);
    expect(layoutSlide(newSlide("Claim", "inform", [table(40)]), lluTheme).warnings).toHaveLength(1);
  });

  it("flows content around a freeform region", () => {
    const s = newSlide("Claim", "inform", [textBlock("hello")]);
    s.freeform = { rect: { x: 0.6, y: 0.3, w: 0.35, h: 0.6 }, blocks: [] };
    const l = layoutSlide(s, lluTheme);
    expect(overlap(l.boxes[0].rect, s.freeform.rect)).toBe(false);
  });

  it("honors a layout override", () => {
    const s = newSlide("Claim", "inform", [textBlock("a")]);
    s.layoutOverride = "grid";
    expect(layoutSlide(s, lluTheme).name).toBe("grid");
  });
});
