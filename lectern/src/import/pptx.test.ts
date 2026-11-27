import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { importPptx, resolve } from "./pptx";

const fixture = new Uint8Array(readFileSync(path.join(__dirname, "fixtures", "sample.pptx")));

describe("PPTX import", () => {
  const res = importPptx(fixture, "sample.pptx");
  const s = res.narrative;

  it("keeps slide order and takes claims from titles", () => {
    expect(res.report.slideCount).toBe(6);
    expect(s.map((x) => x.claim)).toEqual([
      "Enrollment Update",
      "Applications are up in every school",
      "Retention by cohort",
      "The new simulation lab",
      "Applications by year",
      "Questions we expect from the board",
    ]);
    expect(res.title).toBe("Enrollment Update");
  });

  it("converts subtitles, bullets with levels, and notes", () => {
    expect(s[0].blocks).toMatchObject([{ type: "text", text: "Board of Trustees, Fall 2026" }]);
    expect(s[1].blocks[0]).toMatchObject({
      type: "bullets",
      items: ["Nursing leads growth", "Strong transfer pipeline", "Dentistry steady", "Public health recovering"],
      levels: [0, 1, 0, 0],
    });
    expect(s[1].notes).toBe("Mention the transfer agreement signed in March.");
  });

  it("converts tables", () => {
    expect(s[2].blocks[0]).toMatchObject({ type: "table", header: ["Cohort", "Retained"], rows: [["2023", "81%"], ["2024", "86%"]] });
  });

  it("converts pictures with their alt text and stores the image as an asset", () => {
    const img = s[3].blocks.find((b) => b.type === "image");
    expect(img).toMatchObject({ alt: "Students at simulation lab workstations" });
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0].mime).toBe("image/png");
    expect(img && img.type === "image" && img.src).toBe(`asset:${res.assets[0].id}`);
    expect(s[3].blocks.find((b) => b.type === "text")).toMatchObject({ text: "Opened in August" });
  });

  it("converts bar charts with their data", () => {
    expect(s[4].blocks[0]).toMatchObject({
      type: "chart",
      chart: "bar",
      labels: ["2024", "2025", "2026"],
      series: [
        { name: "Nursing", values: [410, 455, 520] },
        { name: "Dentistry", values: [300, 310, 305] },
      ],
    });
  });

  it("infers a missing title, and reports what it could not convert", () => {
    expect(s[5].importNotes).toEqual([
      "No title in the original; the claim was taken from the slide text. Confirm it.",
      "Not converted: pie chart. Recreate it or add an image of it.",
      "Not converted: SmartArt diagram. Recreate it or add an image of it.",
    ]);
    expect(res.report.unconverted).toEqual([
      { slide: 6, what: "pie chart" },
      { slide: 6, what: "SmartArt diagram" },
    ]);
    expect(res.report.cleanSlides).toBe(5);
    expect(res.report.score).toBeGreaterThan(80);
    expect(res.report.score).toBeLessThan(100);
  });

  it("puts hidden slides in backup", () => {
    const deck = rezip(fixture, (name, text) => (name === "ppt/slides/slide3.xml" ? text.replace("<p:sld ", '<p:sld show="0" ') : text));
    const r = importPptx(deck);
    expect(r.narrative).toHaveLength(5);
    expect(r.backup.map((x) => x.claim)).toEqual(["Retention by cohort"]);
  });

  it("rejects files that are not presentations", () => {
    expect(() => importPptx(strToU8("hello"))).toThrow(/not a valid PPTX/);
    expect(() => importPptx(zipSync({ "a.txt": strToU8("x") }))).toThrow(/not a PowerPoint/);
  });

  it("resolves relationship targets", () => {
    expect(resolve("ppt/slides", "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(resolve("ppt", "slides/slide1.xml")).toBe("ppt/slides/slide1.xml");
    expect(resolve("ppt/slides", "/ppt/media/x.png")).toBe("ppt/media/x.png");
  });
});

import { unzipSync, strFromU8 } from "fflate";
function rezip(bytes: Uint8Array, edit: (name: string, text: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith(".xml")) files[name] = strToU8(edit(name, strFromU8(data)));
  }
  return zipSync(files);
}
