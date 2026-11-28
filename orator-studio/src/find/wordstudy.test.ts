import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { byBook, isFunctionWord, refToText, type BookData } from "./wordstudy";
import { bookName } from "./bible";

const data = (f: string) => JSON.parse(readFileSync(path.join(process.cwd(), "public/wordstudy", f), "utf8"));

describe("word study helpers", () => {
  it("counts occurrences by book in order and names references", () => {
    expect(byBook(["MAT.11.28", "MAT.26.45", "MRK.6.31", "LUK.12.19"])).toEqual([["MAT", 2], ["MRK", 1], ["LUK", 1]]);
    expect(refToText("MRK.2.27", bookName)).toBe("Mark 2:27");
    expect(refToText("PSA.23.0", bookName)).toBe("Psalms 23");
    expect(isFunctionWord("G3588")).toBe(true);
    expect(isFunctionWord("H9001")).toBe(true);
    expect(isFunctionWord("G4521")).toBe(false);
  });
});

describe("built word-study data (STEPBible)", () => {
  it("has all 66 books and the words of known verses", () => {
    const meta = data("meta.json");
    expect(meta.books).toBe(66);
    expect(meta.license).toBe("CC BY 4.0");
    const mark = data("books/MRK.json") as BookData;
    expect(mark.lang).toBe("greek");
    expect(mark.verses["2:27"].map((w) => w[3])).toContain("G4521");
    const gen = data("books/GEN.json") as BookData;
    expect(gen.lang).toBe("hebrew");
    expect(gen.verses["2:2"].map((w) => w[3])).toContain("H7673");
  });

  it("matches standard concordance counts", () => {
    expect(data("occ/G03.json").G0373).toHaveLength(12); // ἀναπαύω, to give rest
    expect(data("occ/G03.json").G0372).toHaveLength(5); // ἀνάπαυσις, rest
    expect(data("lex/H76.json").H7676.g).toBe("Sabbath");
  });
});
