import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { apiId, formatReference, needsRefresh, parseReference, pickBible, readPassage } from "./bible";

describe("Bible references", () => {
  it("reads the forms people type", () => {
    expect(parseReference("John 3:16")).toMatchObject({ code: "JHN", chapter: 3, verse: 16 });
    expect(apiId(parseReference("Jn 3:16-18")!)).toEqual({ kind: "passage", id: "JHN.3.16-JHN.3.18" });
    expect(apiId(parseReference("1 Cor 13:4–7")!)).toEqual({ kind: "passage", id: "1CO.13.4-1CO.13.7" });
    expect(apiId(parseReference("I Corinthians 13:4")!)).toEqual({ kind: "passage", id: "1CO.13.4" });
    expect(apiId(parseReference("Ps 23")!)).toEqual({ kind: "chapter", id: "PSA.23" });
    expect(apiId(parseReference("Romans 8:38–9:2")!)).toEqual({ kind: "passage", id: "ROM.8.38-ROM.9.2" });
    expect(apiId(parseReference("Song of Solomon 2.1")!)).toEqual({ kind: "passage", id: "SNG.2.1" });
    expect(apiId(parseReference("Isa 53:5")!)).toEqual({ kind: "passage", id: "ISA.53.5" });
    expect(apiId(parseReference("John 3-4")!)).toBeNull();
    expect(formatReference(parseReference("rom 8:38-9:2")!)).toBe("Romans 8:38–9:2");
    expect(parseReference("Hezekiah 1:1")).toBeNull();
    expect(parseReference("hello")).toBeNull();
  });

  it("chooses the main edition of each version on the account", () => {
    const rows = [
      { id: "a-01", abbreviation: "NIVUK11", name: "New International Version (Anglicized) 2011", language: { id: "eng" } },
      { id: "78a9f6124f344018-01", abbreviation: "NIV11", name: "New International Version 2011", language: { id: "eng" } },
      { id: "n-01", abbreviation: "NKJV", name: "New King James Version", language: { id: "eng" } },
      { id: "c-01", abbreviation: "NLTCE", name: "New Living Translation Catholic Edition", language: { id: "eng" } },
      { id: "l-01", abbreviation: "NLT", name: "New Living Translation", language: { id: "eng" } },
    ];
    expect(pickBible(rows, "NIV")).toBe("78a9f6124f344018-01");
    expect(pickBible(rows, "NKJV")).toBe("n-01");
    expect(pickBible(rows, "NLT")).toBe("l-01");
    expect(pickBible(rows, "KJV")).toBeNull();
  });

  it("reads a passage as plain text with its copyright and usage token", () => {
    const p = readPassage({ data: { id: "JHN.3.16", reference: "John 3:16", content: "  ¶For God so loved\n the world.  ", copyright: "Sample copyright line." }, meta: { fumsToken: "tok" } }, "NIV", "b", "John 3:16");
    expect(p).toMatchObject({ text: "For God so loved the world.", copyright: "Sample copyright line.", fumsToken: "tok", reference: "John 3:16" });
  });

  it("asks for text older than 28 days to be fetched again", () => {
    const now = new Date("2026-12-31T00:00:00Z").getTime();
    expect(needsRefresh("2026-12-01T00:00:00Z", now)).toBe(true);
    expect(needsRefresh("2026-12-20T00:00:00Z", now)).toBe(false);
  });
});

describe("Bible lookup on the server", () => {
  it("sends the key in a header, finds the version, and asks for plain text", async () => {
    process.env.API_BIBLE_KEY = "test-key";
    const { lookUp } = await import("./bible-server");
    const calls: { url: string; key: string | null }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, key: new Headers(init?.headers).get("api-key") });
      if (url.includes("/bibles?")) return new Response(JSON.stringify({ data: [{ id: "n-01", abbreviation: "NKJV", name: "New King James Version", language: { id: "eng" } }] }));
      return new Response(JSON.stringify({ data: { id: "PSA.23", reference: "Psalms 23", content: "A made-up psalm text.", copyright: "Made-up notice." }, meta: { fumsToken: "t" } }));
    }) as unknown as typeof fetch;
    const p = await lookUp("Psalm 23", "NKJV", fake);
    expect(p).toMatchObject({ version: "NKJV", bibleId: "n-01", text: "A made-up psalm text.", copyright: "Made-up notice." });
    expect(calls.every((c) => c.key === "test-key")).toBe(true);
    expect(calls[1].url).toContain("/bibles/n-01/chapters/PSA.23?content-type=text");
    expect(calls[1].url).toContain("include-verse-numbers=false");
    await expect(lookUp("Psalm 23", "NLT", fake)).rejects.toThrow(/isn't available on this API.Bible account/);
    delete process.env.API_BIBLE_KEY;
  });
});
