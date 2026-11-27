import { describe, expect, it } from "vitest";
import { draftClaim, draftFromSource, formatFigure } from "./build";
import { applyOp, invertOp, replay, makeOp } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import type { DataSource } from "@/model/types";

const src: DataSource = {
  id: "src1",
  name: "Monthly reports",
  kind: "documents",
  createdAt: "2026-11-27T00:00:00Z",
  documents: ["Jan", "Feb", "Mar"].map((m, i) => ({ id: `d${i}`, name: `report-${m}.pdf`, period: `${m} 2026`, pages: 2 })),
  series: [
    { id: "s1", label: "Purchases", unit: "currency", confirmedAt: "2026-11-27T10:00:00Z", confirmedBy: "me",
      figures: [{ value: 512.3, raw: "+$512.30", page: 1 }, { value: 1048.1, raw: "+$1,048.10", page: 1 }, { value: 730, raw: "+$730.00", page: 1 }] },
    { id: "s2", label: "Payments", unit: "currency", confirmedAt: "2026-11-27T10:00:00Z", confirmedBy: "me",
      figures: [{ value: -800, raw: "-$800.00", page: 1 }, { value: null }, { value: -1023.1, entered: true }] },
  ],
};

describe("draft deck from document figures", () => {
  it("formats figures in their unit", () => {
    expect(formatFigure(1048.1, "currency")).toBe("$1,048.10");
    expect(formatFigure(-800, "currency")).toBe("-$800");
    expect(formatFigure(87.5, "percent")).toBe("87.5%");
    expect(formatFigure(1234, "number")).toBe("1,234");
  });

  it("computes claims from the figures only", () => {
    expect(draftClaim(src, src.series[0])).toBe("Purchases ranged from $512.30 (Jan 2026) to $1,048.10 (Feb 2026)");
    expect(draftClaim(src, src.series[1])).toBe("Payments ranged from $800.00 (Jan 2026) to $1,023.10 (Mar 2026)");
  });

  it("builds bound charts with provenance, flags claims for review, and keeps gaps visible", () => {
    const d = draftFromSource(src);
    expect(d.narrative).toHaveLength(3);
    const pay = d.narrative[2].blocks[0];
    expect(pay).toMatchObject({ type: "chart", binding: { sourceId: "src1", seriesIds: ["s2"] }, series: [{ values: [800, 0, 1023.1] }] });
    expect(pay.type === "chart" && pay.source).toMatch(/shown as positive; no figure for Feb 2026/);
    expect(d.narrative[2].notes).toBe("Jan 2026: -$800.00 (report-Jan.pdf, page 1)\nFeb 2026: - (no figure)\nMar 2026: -$1,023.10 (typed in by the author)");
    expect(d.narrative.every((s) => s.importNotes?.length)).toBe(true);
    expect(d.backup[0].blocks[0]).toMatchObject({ type: "table", header: ["Period", "Purchases", "Payments"], rows: [["Jan 2026", "$512.30", "-$800.00"], ["Feb 2026", "$1,048.10", "-"], ["Mar 2026", "$730.00", "-$1,023.10"]] });
  });

  it("stores sources as undoable operations that survive a JSON round trip", () => {
    const deck = emptyDeck();
    const put = { kind: "source.put" as const, source: src };
    const after = applyOp(deck, put);
    expect(after.sources?.src1.series).toHaveLength(2);
    expect(applyOp(after, invertOp(deck, put)).sources).toEqual({});
    const log = JSON.parse(JSON.stringify([makeOp(put, { kind: "human", id: "me" })]));
    expect(replay(deck, log).sources?.src1).toEqual(src);
  });
});

import { draftArgument } from "./build";
describe("drafting an argument", () => {
  const withBudget: DataSource = {
    ...src,
    series: [...src.series, { id: "b1", label: "Budget", unit: "currency", role: "comparison", compareTo: "s1", confirmedAt: "", confirmedBy: "me", figures: [{ value: 900, entered: true }, { value: 900, entered: true }, { value: 900, entered: true }] }],
  };
  const d = draftArgument(withBudget, {
    thesis: "February blew the budget",
    points: [
      { conclusion: "February ran over budget.", evidence: "Purchases were $1,048.10 against $900.", soWhat: "Matters.", drivers: [{ hypothesis: "A one-off.", check: "Look at receipts." }], context: "Spending often peaks in winter.", rows: ["Purchases"], confidence: "medium", confidenceReason: "Three months." },
    ],
    recommendation: { action: "Hold a reserve", rationale: "Spikes happen.", tradeoffs: "Less to spend." },
    nextSteps: ["Review receipts."],
    via: "claude.ai",
  });

  it("uses conclusions as headlines, charts the comparison beside its row, and keeps context to the notes", () => {
    expect(d.narrative.map((s) => s.claim)).toEqual(["February blew the budget", "February ran over budget", "Hold a reserve", "Next steps"]);
    const chart = d.narrative[1].blocks[0];
    expect(chart).toMatchObject({ type: "chart", series: [{ name: "Purchases" }, { name: "Budget", values: [900, 900, 900] }], binding: { seriesIds: ["s1", "b1"] } });
    expect(d.narrative[1].blocks[1]).toMatchObject({ type: "text", provenance: { author: { kind: "ai" } } });
    expect(d.narrative[1].notes).toContain("Context from Claude's general knowledge (not from your figures, and not checked):\nSpending often peaks in winter.");
    expect(JSON.stringify(d.narrative[1].blocks)).not.toContain("peaks in winter");
    expect(d.narrative[2].intent).toBe("decide");
    // Payments wasn't used by any point, so its chart goes to backup.
    expect(d.backup.map((s) => s.claim)).toContain("Payments ranged from $800.00 (Jan 2026) to $1,023.10 (Mar 2026)");
  });
});
