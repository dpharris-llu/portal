import { describe, expect, it } from "vitest";
import { analyze, listPeriods } from "./analyze";
import { draftFromSource } from "./build";
import type { DataSource, SourceSeries } from "@/model/types";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const series = (id: string, label: string, values: (number | null)[], unit: SourceSeries["unit"] = "currency"): SourceSeries => ({
  id, label, unit, confirmedAt: "2026-11-27T00:00:00Z", confirmedBy: "me", figures: values.map((value) => ({ value, page: 1 })),
});
const source = (s: SourceSeries[]): DataSource => ({
  id: "src", name: "Reports", kind: "documents", createdAt: "",
  documents: months.map((m, i) => ({ id: `d${i}`, name: `${m}.pdf`, period: `${m} 2026`, pages: 1 })),
  series: s,
});

// A small ledger: opening + purchases + payments + credits = closing, and each closing opens the next month.
const purchases = [1500, 4000, 1600, 1400, 4200, 1500];
const payments = [-500, -1000, -4000, -1100, -900, -4200];
const credits = [0, 0, -600, 0, 0, -500];
const opening: number[] = [];
const closing: number[] = [];
let bal = 2000;
for (let i = 0; i < 6; i++) {
  opening.push(bal);
  bal = bal + purchases[i] + payments[i] + credits[i];
  closing.push(bal);
}
const ledger = source([
  series("open", "Previous balance", opening),
  series("pur", "Purchases", purchases),
  series("pay", "Payments", payments),
  series("cred", "Credits", credits),
  series("close", "New balance", closing),
  series("cb", "Cash back balance", [10, 50, 61, 70, 112, 122]),
  series("enr", "Students enrolled", [100, 110, 118, 131, 140, 152], "number"),
]);

describe("analysis", () => {
  const a = analyze(ledger);
  const kinds = (id: string) => a.findings.filter((f) => f.seriesIds.includes(id)).map((f) => f.kind);
  const text = (kind: string) => a.findings.find((f) => f.kind === kind)?.text;

  it("finds rows that add up, and closing figures carried into the next period", () => {
    expect(text("reconciles")).toBe("Every period adds up to the cent: Previous balance + Purchases + Payments + Credits = New balance, in all 6 periods (signs as printed).");
    expect(text("carries")).toBe("Each period's previous balance equals the previous period's new balance, so nothing is missing between documents.");
  });

  it("names peaks in a swinging row, and suggests what to look into", () => {
    const f = a.findings.find((x) => x.kind === "volatile" && x.seriesIds[0] === "pur")!;
    expect(f.text).toBe("Purchases swung widely: Feb and May 2026 were each 69% or more above the $2,366.67 average.");
    expect(f.claim).toBe("Purchases peaked in Feb and May 2026");
    expect(f.suggestion).toBe("Find out what drove purchases in Feb and May 2026.");
  });

  it("reports concentrated rows and their offset against the row they reduce", () => {
    expect(kinds("cred")).toContain("concentration");
    expect(kinds("cred")).not.toContain("volatile");
    expect(text("share")).toBe("Credits offset 8% of purchases overall, but 38% in Mar 2026.");
  });

  it("recognizes running totals and steady trends", () => {
    expect(a.headline.cb.text).toBe("Cash back balance grew in every period, adding $22.40 a period on average, from $10.00 (Jan 2026) to $122.00 (Jun 2026).");
    expect(a.headline.enr.kind).toBe("cumulative");
    const rising = analyze(source([series("r", "Retention rate", [80, 82, 81, 84, 86, 88], "percent")]));
    expect(rising.headline.r.text).toBe("Retention rate rose steadily, from 80% (Jan 2026) to 88% (Jun 2026), up 8 percentage points.");
  });

  it("does not call balances volatile when other rows explain them, and never suggests targets for them", () => {
    expect(kinds("close")).not.toContain("volatile");
    expect(a.findings.filter((f) => f.suggestion).every((f) => !/balance/i.test(f.suggestion!) || /cash back/i.test(f.suggestion!))).toBe(true);
  });

  it("keeps one suggestion per row", () => {
    const rows = a.findings.filter((f) => f.suggestion).map((f) => f.seriesIds[0]);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it("lists periods compactly", () => {
    expect(listPeriods(["Jan 2026", "Apr 2026", "Sep 2026"])).toBe("Jan, Apr and Sep 2026");
    expect(listPeriods(["Dec 2025", "Jan 2026"])).toBe("Dec 2025 and Jan 2026");
  });

  it("drafts a deck with findings, headlines from them, next steps, and checks in backup", () => {
    const d = draftFromSource(ledger);
    const claims = d.narrative.map((s) => s.claim);
    expect(claims[1]).toBe("What the figures show");
    expect(claims).toContain("Purchases peaked in Feb and May 2026");
    expect(claims[claims.length - 1]).toBe("Suggested next steps");
    expect(d.narrative[d.narrative.length - 1].intent).toBe("decide");
    expect(d.backup[0].claim).toBe("The figures check out");
    // Dropping a finding removes it from the deck.
    const all = analyze(ledger).findings;
    const without = draftFromSource(ledger, all.filter((f) => f.kind !== "volatile"));
    expect(without.narrative.map((s) => s.claim)).not.toContain("Purchases peaked in Feb and May 2026");
  });
});
