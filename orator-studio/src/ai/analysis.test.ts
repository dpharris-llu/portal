import { describe, expect, it } from "vitest";
import { analysisPrompt, parseStated, verifyAnalysis, type Analysis, type AnalysisRequest } from "./analysis";

const req: AnalysisRequest = {
  goal: "Decide on a monthly spending target",
  periods: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"],
  rows: [
    { label: "Purchases", unit: "currency", values: [1000, 4000.5, 1200, 800], typed: [false, false, false, false] },
    { label: "Credits", unit: "currency", values: [0, -50, -600, 0], typed: [false, false, false, true] },
  ],
  checks: [],
};

describe("checking Claude's numbers", () => {
  it("parses stated numbers with their precision", () => {
    expect(parseStated("$4,000.50")).toEqual({ value: 4000.5, tol: 0.005 + 1e-9 });
    expect(parseStated("43%")).toEqual({ value: 43, tol: 0.5 + 1e-9 });
    expect(parseStated("-$600.00")?.value).toBe(600);
  });

  it("accepts numbers that recompute, and rejects wrong or unexplained ones", () => {
    const a: Analysis = {
      insights: [
        {
          headline: "February carried the year",
          detail: "Purchases were $4,000.50 in Feb 2026, 57% of the $7,000.50 total.",
          rows: ["Purchases"],
          numbers: [
            { text: "$4,000.50", op: "value", operands: [{ row: "Purchases", period: "Feb 2026" }] },
            { text: "57%", op: "share", operands: [{ row: "Purchases", period: "Feb 2026" }, { row: "Purchases" }] },
            { text: "$7,000.50", op: "sum", operands: [{ row: "Purchases" }] },
          ],
          suggestion: "Find out what you bought in Feb 2026.",
        },
        {
          headline: "Credits were large in March",
          detail: "Credits of $600.00 offset 60% of March purchases, and returns took 3 days.",
          rows: ["Credits", "Purchases"],
          numbers: [
            { text: "$600.00", op: "value", operands: [{ row: "Credits", period: "Mar 2026" }] },
            { text: "60%", op: "share", operands: [{ row: "Credits", period: "Mar 2026" }, { row: "Purchases", period: "Mar 2026" }] },
          ],
        },
        {
          headline: "Spending fell 20% from January to April",
          detail: "From $1,000.00 to $800.00.",
          rows: ["Purchases"],
          numbers: [
            { text: "20%", op: "percent_change", operands: [{ row: "Purchases", period: "Jan 2026" }, { row: "Purchases", period: "Apr 2026" }] },
            { text: "$1,000.00", op: "value", operands: [{ row: "Purchases", period: "Jan 2026" }] },
            { text: "$800.00", op: "value", operands: [{ row: "Purchases", period: "Apr 2026" }] },
          ],
        },
      ],
      nextSteps: ["Set a target near $1,000.00 a month.", "Plan for a $2,500.00 month in summer.", "Review 2 of the 4 months."],
    };
    const v = verifyAnalysis(req, a);
    expect(v.insights[0]).toMatchObject({ verified: true, checkedCount: 3 });
    // 600 / 1200 = 50%, not 60%; and "3 days" was never worked out (3 is a count of periods, so allowed).
    expect(v.insights[1].verified).toBe(false);
    expect(v.insights[1].problems).toEqual(["60% should be 50"]);
    expect(v.insights[2].verified).toBe(true);
    expect(v.nextSteps.map((s) => s.verified)).toEqual([true, false, true]);
    expect(v.nextSteps[1].problems).toEqual(["$2,500.00 does not come from a checked insight"]);
  });

  it("flags unknown rows and periods instead of guessing", () => {
    const v = verifyAnalysis(req, {
      insights: [{ headline: "x", detail: "Fees were $5.00.", rows: [], numbers: [{ text: "$5.00", op: "value", operands: [{ row: "Fees", period: "Jan 2026" }] }] }],
      nextSteps: [],
    });
    expect(v.insights[0].problems).toContain('$5.00: unknown row "Fees"');
  });

  it("puts the goal, the figures and the number rules in the prompt", () => {
    const p = analysisPrompt(req);
    expect(p).toContain("Decide on a monthly spending target");
    expect(p).toContain('"label":"Purchases"');
    expect(p).toContain("typedByPresenter");
    expect(p).toMatch(/Every number you write must be/);
  });
});
