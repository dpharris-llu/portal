import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { figuresInDocument, figuresOnPage, labelKey, parseValue } from "./extract";
import { readPdf } from "./pdf";
import { alignSeries, orderDocuments, periodFromName, type ScannedDocument } from "./series";

describe("values and labels", () => {
  it("parses money, percents, signs and parentheses; rejects dates, phones and years", () => {
    expect(parseValue("+$22,773.77")).toEqual({ value: 22773.77, unit: "currency" });
    expect(parseValue("-$33,868.32")).toEqual({ value: -33868.32, unit: "currency" });
    expect(parseValue("(120.50)")).toEqual({ value: -120.5, unit: "number" });
    expect(parseValue("87.5%")).toEqual({ value: 87.5, unit: "percent" });
    expect(parseValue("1,234")).toEqual({ value: 1234, unit: "number" });
    expect(parseValue("2026")).toBeNull();
    expect(parseValue("01/20/26")).toBeNull();
    expect(parseValue("1-800-555-0100")).toBeNull();
  });

  it("matches labels across documents despite dates and punctuation", () => {
    expect(labelKey("New balance as of 01/20/26:")).toBe("new balance");
    expect(labelKey("New balance as of 02/19/26")).toBe("new balance");
    expect(labelKey("Students enrolled ..........")).toBe("students enrolled");
  });

  it("skips identifiers and transaction lines that look like figures", () => {
    const at = (str: string, y: number) => ({ str, x: 50, y, width: str.length * 5, height: 10 });
    const figs = figuresOnPage({
      page: 1,
      items: [
        at("Page 2 of 8", 700),
        at("Account number ending in 8819", 690),
        at("PO Box 790046", 680),
        at("12/22 GROCERY STORE REDLANDS CA 54.20", 670),
        at("CAFE 909-555-0142 CA 12.50", 660),
        at("Department, 400 Center Drive, Newark, DE 19711", 655),
        at("Minimum payment due $47.00", 650),
        at("New balance as of 01/20/26: $4,707.24", 640),
      ],
    });
    expect(figs.map((f) => [f.label, f.value])).toEqual([
      ["Minimum payment due", 47],
      ["New balance", 4707.24],
    ]);
  });

  it("skips transaction rows whose date sits in its own column", () => {
    const at = (str: string, x: number) => ({ str, x, y: 700, width: str.length * 5, height: 10 });
    expect(figuresOnPage({ page: 1, items: [at("12/22", 50), at("STATERBROS", 120), at("$54.20", 500)] })).toEqual([]);
  });

  it("pairs a value with the label in its own column or the column to its left", () => {
    const at = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 5, height: 10 });
    const figs = figuresOnPage({
      page: 1,
      items: [at("Late fees of up to $41 may apply.", 50, 700), at("Purchases", 330, 700), at("+$512.30", 520, 700), at("Total due: $1,200.00", 50, 680)],
    });
    expect(figs.map((f) => [f.label, f.value])).toEqual([
      ["Purchases", 512.3],
      ["Total due", 1200],
    ]);
  });
});

describe("documents", () => {
  const dir = path.join(__dirname, "fixtures");
  const names = ["report-March2026.pdf", "report-January2026.pdf", "report-February2026.pdf"];

  it("orders documents by the month in their names", () => {
    expect(orderDocuments(names.map((name) => ({ name }))).map((d) => d.name)).toEqual([
      "report-January2026.pdf",
      "report-February2026.pdf",
      "report-March2026.pdf",
    ]);
    expect(periodFromName("September2026.pdf")?.label).toBe("Sep 2026");
    expect(periodFromName("board-pack.pdf")).toBeNull();
  });

  it("reads PDFs and lines up the same figures across months", async () => {
    const docs: ScannedDocument[] = [];
    for (const { name } of orderDocuments(names.map((name) => ({ name })))) {
      const pages = await readPdf(new Uint8Array(readFileSync(path.join(dir, name))));
      docs.push({ id: name, name, period: periodFromName(name)!.label, pages: pages.length, figures: figuresInDocument(pages) });
    }
    const rows = alignSeries(docs);
    const row = (label: string) => rows.find((r) => r.label === label)!;
    const values = (label: string) => row(label).cells.map((c) => c?.value ?? null);

    expect(values("Purchases")).toEqual([512.3, 1048.1, 730]);
    expect(row("Purchases").cells[2]?.alternatives).toEqual([99.99]);
    expect(values("Payments")).toEqual([-800, -912.3, -1023.1]);
    expect(values("Students enrolled")).toEqual([1234, 1250, 1262]);
    expect(values("Retention rate")).toEqual([87.5, 88, 88.4]);
    expect(values("Net change")).toEqual([-120.5, -80, 45.25]);
    expect(values("Cash back earned")).toEqual([null, 41.2, 56.4]);
    expect(values("New balance")).toEqual([912.3, 1023.1, 730]);
    expect(row("Students enrolled").cells[0]?.page).toBe(2);
    // Prose numbers, phone numbers, dates and years are not figures.
    const labels = rows.map((r) => r.label.toLowerCase()).join(" | ");
    expect(labels).not.toMatch(/late fees|questions|fiscal year|report date|this sentence/);
  });
});
