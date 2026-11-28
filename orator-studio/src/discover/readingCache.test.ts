import { describe, expect, it } from "vitest";
import { textKey } from "./readingCache";

describe("reading cache keys", () => {
  it("is stable for the same text and differs when the text differs", () => {
    const abstract = [{ page: 1, text: "Only the abstract." }];
    const full = [{ page: 1, text: "Only the abstract." }, { page: 2, text: "Methods and results." }];
    expect(textKey("A study", abstract)).toBe(textKey("A study", abstract));
    expect(textKey("A study", abstract)).not.toBe(textKey("A study", full));
    expect(textKey("A study", abstract)).not.toBe(textKey("Another study", abstract));
  });
});
