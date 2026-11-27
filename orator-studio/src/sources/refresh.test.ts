import { describe, expect, it } from "vitest";
import { parseStructured } from "./structured";
import { applyMapping, type Mapping } from "./aggregate";
import { remap, rebindOps } from "./refresh";
import { draftFromSource } from "@/documents/build";
import { applyOp, type OpBody } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import type { DataSource } from "@/model/types";

// Made-up daily values in Open-Meteo's shape, so the answers are known.
function response(days: number, bump = 0) {
  const time: string[] = [], tmax: number[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    time.push(d.toISOString().slice(0, 10));
    tmax.push(d.getUTCMonth() === 1 ? 20 + bump : 18 + d.getUTCMonth());
  }
  return JSON.stringify({ daily_units: { temperature_2m_max: "°C" }, daily: { time, temperature_2m_max: tmax } });
}

const mapping: Mapping = { tableId: "daily", periodKey: "time", grouping: "month", values: [{ key: "temperature_2m_max", label: "Average high (°C)", combine: "mean" }] };

function source(text: string): DataSource {
  const m = applyMapping(parseStructured(text).tables[0], mapping);
  return {
    id: "src", name: "Weather", kind: "url", createdAt: "2026-11-01T00:00:00Z",
    origin: { url: "https://archive-api.open-meteo.com/v1/archive?x=1", fetchedAt: "2026-11-01T00:00:00Z", sha256: "a", contentType: "application/json", format: "json", mapping },
    documents: m.periods.map((p) => ({ id: `p-${p}`, name: "archive-api.open-meteo.com", period: p, pages: 0 })),
    series: [{ id: "ser-t", label: "Average high (°C)", unit: "number", confirmedAt: "2026-11-01T00:00:00Z", confirmedBy: "me",
      figures: m.series[0].figures.map((f) => ({ value: f.value, raw: String(f.value), path: f.path })) }],
  };
}

describe("refreshing a data URL source", () => {
  const old = source(response(59)); // Jan and Feb
  const fetched = { text: response(90, 1.5), contentType: "application/json", fetchedAt: "2026-11-27T10:00:00Z", sha256: "b" };

  it("re-runs the confirmed mapping and says what changed", () => {
    const r = remap(old, fetched, "me");
    expect(r.next.documents.map((d) => d.period)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(r.next.series[0].figures.map((f) => f.value)).toEqual([18, 21.5, 20]);
    expect(r.changes).toEqual(["New periods: Mar 2026", "Average high (°C): 1 value changed (Feb 2026 20 → 21.5)"]);
    expect(r.next.origin?.fetchedAt).toBe("2026-11-27T10:00:00Z");
    expect(remap(old, { ...fetched, text: response(59), sha256: "a" }, "me").same).toBe(true);
  });

  it("rebuilds bound charts in place", () => {
    let deck = emptyDeck();
    const draft = draftFromSource(old, []);
    const ops: OpBody[] = [{ kind: "source.put", source: old }, ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index }))];
    for (const op of ops) deck = applyOp(deck, op);
    const chartSlide = Object.values(deck.slides).find((s) => s.blocks[0]?.type === "chart")!;
    const before = chartSlide.blocks[0];
    const { next } = remap(old, fetched, "me");
    const rebind = rebindOps(deck, next);
    expect(rebind).toHaveLength(1);
    for (const op of [{ kind: "source.put", source: next } as OpBody, ...rebind]) deck = applyOp(deck, op);
    const after = deck.slides[chartSlide.id].blocks[0];
    expect(after.id).toBe(before.id);
    expect(after.type === "chart" && after.labels).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(after.type === "chart" && after.series[0].values).toEqual([18, 21.5, 20]);
  });

  it("says plainly when the table is gone", () => {
    expect(() => remap(old, { ...fetched, text: '{"hourly":{"time":["2026-01-01T00:00","2026-01-01T01:00"],"t":[1,2]}}' }, "me")).toThrow(/no longer has the table "daily"/);
  });
});
