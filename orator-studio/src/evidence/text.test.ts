import { describe, expect, it } from "vitest";
import { numbersNotOn, pageText, paperForClaude, quoteFound } from "./text";
import type { TextItem } from "@/documents/extract";

const item = (str: string, x: number, y: number): TextItem => ({ str, x, y, width: str.length * 4.5, height: 9 });

describe("reading a two-column paper", () => {
  it("reads the full-width title first, then the left column, then the right", () => {
    const items: TextItem[] = [item("A Trial of Something Useful in Adults With Long Titles", 72, 740)];
    for (let k = 0; k < 10; k++) {
      items.push(item(`left line ${k} of the methods section here`, 72, 700 - k * 12));
      items.push(item(`right line ${k} of the results section`, 320, 700 - k * 12));
    }
    const text = pageText({ page: 1, items });
    const lines = text.split("\n");
    expect(lines[0]).toBe("A Trial of Something Useful in Adults With Long Titles");
    expect(lines[1]).toBe("left line 0 of the methods section here");
    expect(lines[10]).toBe("left line 9 of the methods section here");
    expect(lines[11]).toBe("right line 0 of the results section");
  });

  it("rejoins hyphenated words and reads one column as one column", () => {
    const text = pageText({ page: 1, items: [item("Patients received the treat-", 72, 700), item("ment for 12 weeks.", 72, 688)] });
    expect(text).toBe("Patients received the treatment for 12 weeks.");
  });

  it("leaves out the reference list and keeps page markers", () => {
    const pages = [
      { page: 1, text: "Title\nAbstract" },
      { page: 2, text: "Results" },
      { page: 3, text: "Discussion text\nReferences\n1. Smith J. Old paper." },
      { page: 4, text: "2. More references" },
    ];
    const r = paperForClaude(pages);
    expect(r.text).toBe("[[Page 1]]\nTitle\nAbstract\n\n[[Page 2]]\nResults\n\n[[Page 3]]\nDiscussion text");
    expect(r.referencesFrom).toBe(3);
  });
});

describe("checking quotes and numbers", () => {
  const page = "Among 1,204 participants, the hazard ratio was 0·82 (95% CI 0·70–0·95), and adverse events were rare. Effects were consistent across subgroups.";
  it("finds quotes despite typography, and supports ellipses", () => {
    expect(quoteFound("the hazard ratio was 0.82 (95% CI 0.70-0.95)", page)).toBe(true);
    expect(quoteFound("“Among 1204 participants … adverse events were rare.”", page)).toBe(true);
    expect(quoteFound("the hazard ratio was 0.80", page)).toBe(false);
    expect(quoteFound("adverse events were rare ... Among 1,204 participants", page)).toBe(false); // out of order
  });
  it("finds numbers that are not printed on the page", () => {
    expect(numbersNotOn("HR 0.82 in 1,204 adults (95% CI 0.70-0.95)", [page])).toEqual([]);
    expect(numbersNotOn("an 18% lower risk in 1,204 adults", [page])).toEqual(["18"]);
  });
});
