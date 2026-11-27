import { describe, expect, it } from "vitest";
import { parseStructured, typeOf } from "./structured";
import { applyMapping, defaultCombine, defaultGrouping, periodLabel } from "./aggregate";

// Shaped like an Open-Meteo archive response; values are made up so the answers are known.
function weatherJson() {
  const time: string[] = [], tmax: number[] = [], tmin: number[] = [], rain: (number | null)[] = [];
  for (let d = new Date(Date.UTC(2026, 0, 1)); d < new Date(Date.UTC(2026, 3, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
    const m = d.getUTCMonth();
    time.push(d.toISOString().slice(0, 10));
    tmax.push([18, 20, 23][m]);
    tmin.push([5, 6, 8][m] + (d.getUTCDate() % 2));
    rain.push(d.getUTCDate() === 15 ? [12.5, 4, null][m] : 0);
  }
  return JSON.stringify({
    latitude: 34.05, longitude: -117.26, timezone: "America/Los_Angeles",
    daily_units: { time: "iso8601", temperature_2m_max: "°C", temperature_2m_min: "°C", precipitation_sum: "mm" },
    daily: { time, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: rain },
  });
}

describe("structured data", () => {
  it("finds the daily table in an Open-Meteo response, with units", () => {
    const { format, tables } = parseStructured(weatherJson(), "application/json");
    expect(format).toBe("json");
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t).toMatchObject({ id: "daily", rows: 90 });
    expect(t.columns.map((c) => [c.label, c.type, c.path])).toEqual([
      ["time (iso8601)", "date", "daily.time"],
      ["temperature_2m_max (°C)", "number", "daily.temperature_2m_max"],
      ["temperature_2m_min (°C)", "number", "daily.temperature_2m_min"],
      ["precipitation_sum (mm)", "number", "daily.precipitation_sum"],
    ]);
  });

  it("groups daily values into months, combining each field its own way", () => {
    const t = parseStructured(weatherJson()).tables[0];
    expect(defaultGrouping(t.columns[0].values as string[])).toBe("week");
    const m = applyMapping(t, {
      tableId: "daily",
      periodKey: "time",
      grouping: "month",
      values: [
        { key: "temperature_2m_max", label: "High (°C)", combine: defaultCombine("temperature_2m_max") },
        { key: "temperature_2m_min", label: "Low (°C)", combine: "mean" },
        { key: "precipitation_sum", label: "Rain (mm)", combine: defaultCombine("precipitation_sum") },
      ],
    });
    expect(m.periods).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(m.series[0].figures.map((f) => f.value)).toEqual([18, 20, 23]);
    expect(m.series[1].figures.map((f) => f.value)).toEqual([5.52, 6.5, 8.52]); // odd days add 1
    expect(m.series[2].figures.map((f) => f.value)).toEqual([12.5, 4, 0]); // March's rain day was missing
    expect(m.series[2].figures[2]).toMatchObject({ count: 30 });
    expect(m.series[0].figures[0].path).toBe("mean of 31 values of daily.temperature_2m_max (2026-01-01 to 2026-01-31)");
  });

  it("reads records from XML and CSV", () => {
    const xml = `<report><month><name>Jan</name><visits>120</visits><rate>4.5</rate></month><month><name>Feb</name><visits>135</visits><rate>4.1</rate></month></report>`;
    const x = parseStructured(xml).tables[0];
    expect(x).toMatchObject({ id: "report.month", rows: 2 });
    expect(x.columns.find((c) => c.key === "visits")?.values).toEqual([120, 135]);
    const csv = 'Month,"Visits, total",Rate\nJan,120,4.5\nFeb,135,4.1\n';
    const c = parseStructured(csv, "text/csv").tables[0];
    expect(c.columns.map((col) => [col.key, col.type])).toEqual([["Month", "text"], ["Visits, total", "number"], ["Rate", "number"]]);
    const mapped = applyMapping(c, { tableId: "$", periodKey: "Month", grouping: "none", values: [{ key: "Visits, total", label: "Visits", combine: "sum" }] });
    expect(mapped).toMatchObject({ periods: ["Jan", "Feb"], series: [{ figures: [{ value: 120, path: "Visits, total[0]" }, { value: 135 }] }] });
  });

  it("labels periods and types columns", () => {
    expect(periodLabel("2026-03-18", "quarter").label).toBe("Q1 2026");
    expect(periodLabel("2026-03-18", "week").label).toBe("Week of Mar 16, 2026");
    expect(typeOf(["2026-01-01", "2026-01-02T05:00"])).toBe("date");
    expect(typeOf(["1", 2, null])).toBe("number");
    expect(() => parseStructured("hello")).toThrow(/isn't JSON, XML or CSV/);
  });
});
