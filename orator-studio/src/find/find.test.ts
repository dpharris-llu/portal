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
  it("parses one efetch response into articles: details, ids and abstracts, in search order", async () => {
    const { pubmedIds, pubmedAbstracts, parsePubmedArticles, pubmedSearchUrl } = await import("./pubmed");
    expect(pubmedSearchUrl("https://e/u", "walking", { openAccessOnly: true })).toContain("term=" + encodeURIComponent("(walking) AND free full text[sb]"));
    expect(pubmedIds(JSON.parse(fx("pubmed-esearch.json")))).toEqual(["39000001", "39000002"]);
    expect(pubmedAbstracts(fx("pubmed-efetch.xml")).get("39000001")).toBe("Background: Walking is widely recommended.\nResults: HbA1c fell by 0.6 percentage points in the walking group compared with 0.1 in usual care (difference 0.5; 95% CI 0.3–0.7).");
    const c = parsePubmedArticles(fx("pubmed-efetch.xml"), ["39000002", "39000001"]);
    expect(c.map((x) => [x.id, x.access, x.pmcid, x.year, x.venue])).toEqual([
      ["MED:39000002", "abstract", undefined, "2024", "Fictional Diabetes Research"],
      ["MED:39000001", "full text", "PMC9900001", "2025", "Journal of Fictional Clinical Studies"],
    ]);
    expect(c[1]).toMatchObject({ title: "A Daily Walking Program and Glycemic Control in Adults With Type 2 Diabetes: A Randomized Trial", authors: ["Delgado M", "Osei K"], doi: "10.5555/jfcs.2025.0101", badges: ["Randomized Controlled Trial"] });
    expect(c[0].authors).toEqual(["Fictional Diabetes Study Group"]);
  });

  it("paces NCBI calls and retries a 429", async () => {
    const { searchPubmed } = await import("./server");
    const times: number[] = [];
    let busyOnce = true;
    const fake = (async (url: string) => {
      times.push(Date.now());
      if (url.includes("esearch") && busyOnce) {
        busyOnce = false;
        return new Response("", { status: 429, headers: { "retry-after": "1" } });
      }
      return new Response(url.includes("esearch") ? fx("pubmed-esearch.json") : fx("pubmed-efetch.xml"));
    }) as unknown as typeof fetch;
    const r = await searchPubmed("walking", {}, fake);
    expect(r).toHaveLength(2);
    expect(times).toHaveLength(3); // the 429, the retry, then one efetch for details and abstracts
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(950);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(380);
  });

  it("searches PubMed for articles and Europe PMC alongside for reports, without waiting on it", async () => {
    const { searchWithSource } = await import("./server");
    const seen: string[] = [];
    const fake = (slowEpmc: boolean) =>
      (async (url: string) => {
        seen.push(new URL(url).host + new URL(url).pathname + (url.includes("europepmc") ? "?" + decodeURIComponent(new URL(url).searchParams.get("query") ?? "") : ""));
        if (url.includes("europepmc")) {
          if (slowEpmc) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
          return new Response(fx("europepmc-search.json"));
        }
        return new Response(url.includes("esearch") ? fx("pubmed-esearch.json") : fx("pubmed-efetch.xml"), { status: 200 });
      }) as unknown as typeof fetch;
    const r = await searchWithSource("europepmc", "walking HbA1c", {}, fake(false));
    expect(r.from).toBe("PubMed and Europe PMC");
    // PubMed's two articles, then only the Bookshelf report from Europe PMC (its PubMed records are not repeated)
    expect(r.results.map((c) => c.id)).toEqual(["MED:39000001", "MED:39000002", "NBK:NBK900001"]);
    expect(seen.find((x) => x.includes("europepmc"))).toContain("(walking HbA1c) AND (SRC:NBK OR SRC:PPR)");
    const slow = await searchWithSource("europepmc", "walking HbA1c", {}, fake(true));
    expect(slow.from).toBe("PubMed");
    expect(slow.results).toHaveLength(2);
    expect(slow.note).toContain("didn't arrive in time");
  });

  it("gets free full text from PubMed Central at NCBI, falling back to Europe PMC", async () => {
    const { fullText } = await import("./server");
    const hosts: string[] = [];
    const ncbiNoBody = (async (url: string) => {
      hosts.push(new URL(url).host);
      return new Response(url.includes("eutils") ? "<article><front><abstract><p>Only an abstract.</p></abstract></front></article>" : fx("pmc-fulltext.xml"));
    }) as unknown as typeof fetch;
    const r = await fullText("PMC9900001", ncbiNoBody);
    expect(hosts).toEqual(["eutils.ncbi.nlm.nih.gov", "www.ebi.ac.uk"]);
    expect(Object.values(r.labels)).toEqual(["Abstract", "Methods", "Results", "Limitations"]);
  });
});

describe("Discover landscape", () => {
  it("runs four searches in parallel, each with its own filter, and lets one fail alone", async () => {
    const { landscape } = await import("./server");
    const seen: string[] = [];
    const fake = (async (url: string) => {
      const u = new URL(url);
      seen.push(u.host + u.pathname + " " + decodeURIComponent(u.searchParams.get("term") ?? u.searchParams.get("query") ?? u.searchParams.get("query.term") ?? "") + (u.searchParams.get("filter.overallStatus") ? " | " + u.searchParams.get("filter.overallStatus") : "") + (u.searchParams.get("sort") ? " | sort=" + u.searchParams.get("sort") : ""));
      if (url.includes("europepmc")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
      if (url.includes("clinicaltrials")) return new Response(fx("ctgov-search.json"));
      return new Response(url.includes("esearch") ? fx("pubmed-esearch.json") : fx("pubmed-efetch.xml"));
    }) as unknown as typeof fetch;
    const secs = await landscape('("walking"[tiab]) AND ("type 2 diabetes"[MeSH Terms])', "walking type 2 diabetes", fake);
    expect(secs.map((s) => [s.key, s.results.length, Boolean(s.error)])).toEqual([
      ["strongest", 2, false],
      ["newest", 0, false],
      ["ongoing", 1, false],
      ["reports", 0, true],
    ]);
    const esearch = seen.filter((x) => x.includes("esearch"));
    // Best match first (relevance), recent for primary studies, case reports left out.
    expect(esearch.some((x) => x.includes("AND (systematic[sb] OR meta-analysis[pt] OR guideline[pt] OR practice guideline[pt])") && x.endsWith("sort=relevance"))).toBe(true);
    expect(esearch.some((x) => /"20\d\d"\[dp\] : "3000"\[dp\]/.test(x) && x.includes("case reports[pt]") && x.endsWith("sort=relevance"))).toBe(true);
    // Shown newest first.
    expect(secs[0].results.map((c) => c.year)).toEqual(["2025", "2024"]);
    expect(seen.find((x) => x.includes("clinicaltrials"))).toBe("clinicaltrials.gov/api/v2/studies walking AND type AND diabetes | RECRUITING|NOT_YET_RECRUITING|ACTIVE_NOT_RECRUITING|ENROLLING_BY_INVITATION");
    expect(seen.find((x) => x.includes("europepmc"))).toContain("(walking type 2 diabetes) AND SRC:NBK");
  });
});

describe("registry search words", () => {
  it("requires the topic's meaningful words", async () => {
    const { ctGovTerms } = await import("./clinicaltrials");
    expect(ctGovTerms("Walking program for people with diabetes")).toBe("walking AND diabetes");
    expect(ctGovTerms("Telehealth follow-up after heart failure discharge")).toBe("telehealth AND follow-up AND heart AND failure AND discharge");
    expect(ctGovTerms("of the")).toBe("of the");
  });
});

describe("broader fallback", () => {
  it("uses the broader search for reviews only when the exact topic has none, and says so", async () => {
    const { landscape } = await import("./server");
    const terms: string[] = [];
    const fake = (async (url: string) => {
      const u = new URL(url);
      if (url.includes("esearch")) {
        const term = u.searchParams.get("term") ?? "";
        terms.push(term);
        const none = term.startsWith("(Filipino") && term.includes("systematic[sb]");
        return new Response(none ? '{"esearchresult":{"idlist":[]}}' : fx("pubmed-esearch.json"));
      }
      if (url.includes("efetch")) return new Response(fx("pubmed-efetch.xml"));
      if (url.includes("clinicaltrials")) return new Response('{"studies":[]}');
      return new Response('{"resultList":{"result":[]}}');
    }) as unknown as typeof fetch;
    const secs = await landscape("Filipino[tiab] AND bone neoplasms[mh]", "Filipinos and bone cancer", fake, "bone neoplasms[mh]");
    expect(secs[0].broadened).toBe("bone neoplasms[mh]");
    expect(secs[0].results).toHaveLength(2);
    expect(terms.some((t) => t.startsWith("(bone neoplasms[mh]) AND (systematic[sb]"))).toBe(true);
    expect(secs[1].broadened).toBeUndefined();
  });
});

describe("OpenAlex", () => {
  it("rebuilds abstracts and maps works to candidates", async () => {
    const { parseOpenAlex, openAlexSearchUrl } = await import("./openalex");
    const list = parseOpenAlex(JSON.parse(fx("openalex-search.json")));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ provider: "openalex", id: "openalex:W1000000001", doi: "10.9999/fictional.2024.001", pmid: "40000001", pmcid: "PMC9000001", abstract: "Students walked more with coaching.", access: "full text", venue: "Journal of Imaginary Education", year: "2024", url: "https://doi.org/10.9999/fictional.2024.001" });
    expect(list[1]).toMatchObject({ kind: "paper", access: "link only", url: "https://example.org/b", badges: ["Review"] });
    const u = new URL(openAlexSearchUrl("https://api.openalex.org", "walking coaching", { fromYear: 2016, pageSize: 10, apiKey: "k" }));
    expect(u.searchParams.get("search")).toBe("walking coaching");
    expect(u.searchParams.get("filter")).toContain("from_publication_date:2016-01-01");
    expect(u.searchParams.get("api_key")).toBe("k");
  });

  it("searches only the chosen sources, and shows a paper once across them", async () => {
    const { landscape } = await import("./server");
    const hosts = new Set<string>();
    const fake = (async (url: string) => {
      hosts.add(new URL(url).host);
      if (url.includes("openalex")) return new Response(fx("openalex-search.json"));
      return new Response(url.includes("esearch") ? fx("pubmed-esearch.json") : fx("pubmed-efetch.xml"));
    }) as unknown as typeof fetch;
    const secs = await landscape("walking[tiab]", "walking", fake, undefined, ["pubmed", "openalex"], "walking coaching");
    expect(secs.map((s) => s.key)).toEqual(["strongest", "newest", "allfields"]);
    expect([...hosts].sort()).toEqual(["api.openalex.org", "eutils.ncbi.nlm.nih.gov"]);
    const ids = secs.flatMap((s) => s.results.map((c) => c.pmid).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
