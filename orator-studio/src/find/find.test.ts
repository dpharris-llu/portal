import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { europePmcSearchUrl, jatsPages, parseEuropePmc, plainText } from "./europepmc";
import { ctGovSearchUrl, parseCtGov } from "./clinicaltrials";
import { quoteFound } from "@/evidence/text";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("Europe PMC", () => {
  it("builds searches with filters", () => {
    expect(europePmcSearchUrl("https://x/rest", "walking HbA1c", { openAccessOnly: true, fromYear: 2015 })).toBe(
      "https://x/rest/search?query=" + encodeURIComponent("((walking HbA1c) AND OPEN_ACCESS:y) AND PUB_YEAR:[2015 TO 3000]") + "&format=json&resultType=core&pageSize=15",
    );
  });

  it("turns results into candidates: full text when open access, reports from NCBI Bookshelf", () => {
    const c = parseEuropePmc(JSON.parse(fx("europepmc-search.json")));
    expect(c.map((x) => [x.id, x.kind, x.access])).toEqual([
      ["MED:39000001", "paper", "full text"],
      ["MED:39000002", "paper", "abstract"],
      ["NBK:NBK900001", "report", "abstract"],
    ]);
    expect(c[0]).toMatchObject({ title: "A Daily Walking Program and Glycemic Control in Adults With Type 2 Diabetes: A Randomized Trial", authors: ["Delgado M", "Osei K", "Park H", "Romero L"], venue: "Journal of Fictional Clinical Studies", year: "2025", pmcid: "PMC9900001", url: "https://europepmc.org/article/MED/39000001" });
    expect(c[0].badges).toEqual(["Randomized Controlled Trial"]);
    expect(c[0].abstract).toBe("Background\nWalking is widely recommended. Results\nHbA1c fell by 0.6 percentage points in the walking group compared with 0.1 in usual care (difference 0.5; 95% CI 0.3–0.7).");
    expect(c[2].badges).toEqual(["Government or institutional report"]);
    expect(c[2].venue).toBe("Fictional Agency for Healthcare Research");
  });

  it("reads full text into checkable sections, without the references", () => {
    const { pages, labels } = jatsPages(fx("pmc-fulltext.xml"));
    expect(Object.values(labels)).toEqual(["Abstract", "Methods", "Results", "Limitations"]);
    expect(pages[1].text).toBe("Methods\nWe enrolled 412 adults aged 40–75 years at four community clinics1.\nOutcomes\nThe primary outcome was the change in HbA1c at 12 weeks.");
    expect(quoteFound("difference 0.5; 95% CI 0.3 to 0.7; p<0.001", pages[2].text)).toBe(true);
    expect(pages.some((p) => p.text.includes("earlier fictional study"))).toBe(false);
  });

  it("decodes entities and drops inline markup", () => {
    expect(plainText("p&lt;0.05 &amp; <italic>n</italic>&#x2009;=&#160;12")).toBe("p<0.05 & n = 12");
  });
});

describe("ClinicalTrials.gov", () => {
  it("builds the search and renders the record as checkable text", () => {
    expect(ctGovSearchUrl("https://ct/api/v2", "walking diabetes")).toBe("https://ct/api/v2/studies?query.term=walking%20diabetes&pageSize=15&format=json");
    const [t] = parseCtGov(JSON.parse(fx("ctgov-search.json")));
    expect(t).toMatchObject({ id: "NCT09900001", kind: "trial", access: "registry record", url: "https://clinicaltrials.gov/study/NCT09900001", year: "2025", badges: ["Recruiting", "240 participants"] });
    expect(t.recordText).toContain("Enrollment: 240 participants (estimated).");
    expect(t.recordText).toContain("Primary outcomes: Change in HbA1c (time frame: 12 months).");
    expect(t.recordText).toContain("No results posted to the registry.");
  });
});

describe("PubMed fallback", () => {
  it("parses search, summaries and abstracts", async () => {
    const { pubmedIds, pubmedAbstracts, parsePubmed, pubmedSearchUrl } = await import("./pubmed");
    expect(pubmedSearchUrl("https://e/u", "walking", { openAccessOnly: true })).toContain("term=" + encodeURIComponent("(walking) AND free full text[sb]"));
    expect(pubmedIds(JSON.parse(fx("pubmed-esearch.json")))).toEqual(["39000001", "39000002"]);
    const abs = pubmedAbstracts(fx("pubmed-efetch.xml"));
    expect(abs.get("39000001")).toBe("Background: Walking is widely recommended.\nResults: HbA1c fell by 0.6 percentage points in the walking group compared with 0.1 in usual care (difference 0.5; 95% CI 0.3–0.7).");
    const c = parsePubmed(JSON.parse(fx("pubmed-esummary.json")), abs);
    expect(c.map((x) => [x.id, x.access, x.pmcid, x.year, x.url])).toEqual([
      ["MED:39000001", "full text", "PMC9900001", "2025", "https://pubmed.ncbi.nlm.nih.gov/39000001/"],
      ["MED:39000002", "abstract", undefined, "2024", "https://pubmed.ncbi.nlm.nih.gov/39000002/"],
    ]);
    expect(c[0].badges).toEqual(["Randomized Controlled Trial"]);
  });

  it("falls back to PubMed when Europe PMC doesn't answer, and says so", async () => {
    const { searchWithSource } = await import("./server");
    const seen: string[] = [];
    const fake = (async (url: string) => {
      seen.push(new URL(url).host + new URL(url).pathname);
      if (url.includes("europepmc")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
      const body = url.includes("esearch") ? fx("pubmed-esearch.json") : url.includes("esummary") ? fx("pubmed-esummary.json") : fx("pubmed-efetch.xml");
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await searchWithSource("europepmc", "walking HbA1c", {}, fake);
    expect(r.from).toBe("PubMed");
    expect(r.note).toContain("couldn't be reached (UND_ERR_CONNECT_TIMEOUT)");
    expect(r.results).toHaveLength(2);
    expect(seen[0]).toBe("www.ebi.ac.uk/europepmc/webservices/rest/search");
    expect(seen.slice(1).sort()).toEqual(["eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", "eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", "eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"]);
  });
});
