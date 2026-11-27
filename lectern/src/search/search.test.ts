import { describe, expect, it } from "vitest";
import { buildIndex, search } from "./index";
import { sampleDeck } from "@/model/sample";

describe("search", () => {
  const deck = sampleDeck();
  const index = buildIndex(deck);
  const claimOf = (id: string) => deck.slides[id].claim;

  it("finds backup slides by claim, notes and table content", () => {
    expect(claimOf(search(index, "churn by cohort")[0].slideId)).toBe("Customer churn by cohort");
    expect(claimOf(search(index, "why are customers leaving")[0].slideId)).toBe("Customer churn by cohort");
    expect(claimOf(search(index, "retained 2024")[0].slideId)).toBe("Customer churn by cohort");
  });

  it("matches partial words and chart labels", () => {
    expect(claimOf(search(index, "secur")[0].slideId)).toBe("Security and privacy plan");
    expect(claimOf(search(index, "errors caught")[0].slideId)).toBe("Board decks need sourced numbers");
  });

  it("returns at most three hits and nothing for nonsense", () => {
    expect(search(index, "deck").length).toBeLessThanOrEqual(3);
    expect(search(index, "zzqx")).toEqual([]);
  });

  it("blends in embeddings when given", () => {
    const target = deck.backup[1];
    const slides = Object.fromEntries(Object.keys(deck.slides).map((id) => [id, id === target ? [1, 0] : [0, 1]]));
    const hits = search(index, "keeping patient data safe", { vectors: { slides, query: [1, 0] } });
    expect(hits[0].slideId).toBe(target);
  });

  it("answers within the 300 ms budget on a 300-slide deck", () => {
    const big = sampleDeck();
    for (let i = 0; i < 50; i++) {
      for (const id of [...big.narrative]) {
        const nid = `${id}_${i}`;
        big.slides[nid] = { ...big.slides[id], id: nid };
        big.backup.push(nid);
      }
    }
    const idx = buildIndex(big);
    const t = performance.now();
    search(idx, "sourced numbers board");
    expect(performance.now() - t).toBeLessThan(300);
  });
});
