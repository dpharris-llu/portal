import { describe, expect, it } from "vitest";
import { analysisPrompt, parseStated, verifyAnalysis, type Analysis, type AnalysisRequest } from "./analysis";
import { evaluate } from "./expr";

const req: AnalysisRequest = {
  goal: "Set a monthly spending budget",
  periods: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026"],
  rows: [
    { label: "Purchases", unit: "currency", values: [1000, 4000.5, 1200, 800], typed: [false, false, false, false], role: "data" },
    { label: "Credits", unit: "currency", values: [0, -50, -600, 0], typed: [false, false, false, false], role: "data" },
    { label: "Budget", unit: "currency", values: [1500, 1500, 1500, 1500], typed: [true, true, true, true], role: "comparison", comparesTo: "Purchases" },
  ],
  checks: [],
};

describe("formulas", () => {
  it("evaluates figures, whole rows in functions, and multi-step arithmetic", () => {
    expect(evaluate("[Purchases @ Feb 2026]", req)).toBe(4000.5);
    expect(evaluate("sum([Purchases])", req)).toBe(7000.5);
    expect(evaluate("(sum([Purchases]) - [Purchases @ Feb 2026]) / 3", req)).toBe(1000);
    expect(evaluate("100 * [Purchases @ Feb 2026] / sum([Purchases])", req)).toBeCloseTo(57.146, 2);
    expect(evaluate("[Purchases @ Mar 2026] + [Credits @ Mar 2026]", req)).toBe(600);
    expect(evaluate("count([Purchases]) - mean([Budget]) / 1500", req)).toBe(3);
    expect(evaluate("max([Purchases], [Budget])", req)).toBe(4000.5);
  });

  it("refuses formulas it cannot check", () => {
    expect(() => evaluate("[Fees @ Jan 2026]", req)).toThrow(/unknown row "Fees"/);
    expect(() => evaluate("[Purchases @ May 2026]", req)).toThrow(/unknown period/);
    expect(() => evaluate("[Purchases] / 2", req)).toThrow(/whole row needs sum/);
    expect(() => evaluate("median([Purchases])", req)).toThrow(/unknown function/);
    expect(() => evaluate("1 / ([Credits @ Jan 2026])", req)).toThrow(/division by zero/);
  });
});

describe("checking Claude's argument", () => {
  it("parses stated numbers, including deliberately rounded ones", () => {
    expect(parseStated("$4,000.50")).toEqual({ value: 4000.5, tol: 0.005 + 1e-9 });
    expect(parseStated("$11,800", true)?.tol).toBe(59); // within 0.5% of 11,800
    expect(parseStated("43%")).toEqual({ value: 43, tol: 0.5 + 1e-9 });
  });

  const base: Analysis = {
    thesis: "A flat $1,500 budget fits three of your four months.",
    thesisNumbers: [{ text: "$1,500", formula: "[Budget @ Jan 2026]" }],
    points: [
      {
        conclusion: "One February spike breaks a flat budget",
        evidence: "Purchases were $4,000.50 in Feb 2026, 57% of the $7,000.50 total; the other months averaged $1,000.00.",
        soWhat: "A flat budget would be overspent once and underused otherwise.",
        drivers: [{ hypothesis: "A one-off purchase in February.", check: "Look at February's largest transactions." }],
        context: "Many households see one or two large months a year; a common rule of thumb is a reserve of about 10% of annual spending.",
        externalNumbers: [{ text: "10%", about: "a common reserve rule of thumb" }],
        rows: ["Purchases"],
        numbers: [
          { text: "$4,000.50", formula: "[Purchases @ Feb 2026]" },
          { text: "57%", formula: "100 * [Purchases @ Feb 2026] / sum([Purchases])" },
          { text: "$7,000.50", formula: "sum([Purchases])" },
          { text: "$1,000.00", formula: "(sum([Purchases]) - [Purchases @ Feb 2026]) / 3" },
        ],
        confidence: "medium",
        confidenceReason: "Only four months of data.",
      },
      {
        conclusion: "Returns erased half of March's spending",
        evidence: "Credits of $600.00 offset 60% of March purchases.",
        soWhat: "Net spending is lower than it looks.",
        drivers: [],
        context: "Return rates often run near 30% for clothing.",
        rows: ["Credits", "Purchases"],
        numbers: [
          { text: "$600.00", formula: "abs([Credits @ Mar 2026])" },
          { text: "60%", formula: "100 * abs([Credits @ Mar 2026]) / [Purchases @ Mar 2026]" },
        ],
        confidence: "low",
        confidenceReason: "One month.",
      },
    ],
    recommendation: { action: "Budget about $1,000 a month plus a reserve", rationale: "Three of four months were near $1,000.00.", tradeoffs: "Less slack in a spike month.", numbers: [{ text: "$1,000", formula: "(sum([Purchases]) - [Purchases @ Feb 2026]) / 3", approx: true }, { text: "$1,000.00", formula: "(sum([Purchases]) - [Purchases @ Feb 2026]) / 3" }] },
    nextSteps: ["Review February's receipts.", "Set aside $2,500.00 for spikes."],
  };

  it("checks every number in the thesis, points and recommendation", () => {
    const v = verifyAnalysis(req, base);
    expect(v.thesis.verified).toBe(true);
    expect(v.points[0]).toMatchObject({ verified: true, checkedCount: 4, contextProblems: [] });
    // 600 / 1200 = 50%, not 60%.
    expect(v.points[1].problems).toEqual(["60% should be 50"]);
    // "30%" in the context is an outside number that wasn't listed as general knowledge.
    expect(v.points[1].contextProblems).toEqual(["30% in the context is not listed as general knowledge"]);
    expect(v.recommendation.verified).toBe(true);
    expect(v.nextSteps.map((s) => s.verified)).toEqual([true, false]);
  });

  it("asks for analysis, comparisons, labeled knowledge and formulas", () => {
    const p = analysisPrompt(req);
    expect(p).toContain("Your job is ANALYSIS, not a summary");
    expect(p).toContain("Set a monthly spending budget");
    expect(p).toContain('"role":"comparison","comparesTo":"Purchases"');
    expect(p).toMatch(/labeled as your general knowledge/);
    expect(p).toMatch(/\[Row @ Period\] is one figure/);
  });
});
