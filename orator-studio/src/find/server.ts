import "server-only";
/**
 * Server calls to the named databases (F-119). Only these fixed endpoints are
 * reached, built from the query; the browser never supplies an address, so
 * this is not an open fetcher. Time and size limits as for data URLs.
 */
import type { Candidate, LandscapeSection, Provider, SearchOptions } from "./types";
import { EUROPEPMC_BASE, europePmcFullTextUrl, europePmcSearchUrl, jatsPages, parseEuropePmc } from "./europepmc";
import { CTGOV_BASE, ctGovSearchUrl, ctGovTerms, parseCtGov } from "./clinicaltrials";
import { OPENALEX_BASE, openAlexSearchUrl, parseOpenAlex } from "./openalex";
import { STANDARD_IDS } from "./catalog";
import { EUTILS_BASE, parsePubmedArticles, pmcFullTextUrl, pubmedAbstractUrl, pubmedIds, pubmedSearchUrl } from "./pubmed";

const TIMEOUT_MS = 20000;
/** Europe PMC gets a shorter wait when PubMed can stand in for it. */
const EPMC_TIMEOUT_MS = 12000;
const MAX_BYTES = 8 * 1024 * 1024;
// Overridable for tests only (a local stand-in server).
const epmc = () => process.env.EUROPEPMC_BASE || EUROPEPMC_BASE;
const ctgov = () => process.env.CTGOV_BASE || CTGOV_BASE;
const eutils = () => process.env.EUTILS_BASE || EUTILS_BASE;
const openalex = () => process.env.OPENALEX_BASE || OPENALEX_BASE;

export class SearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

/** A short code for what went wrong underneath ("UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND"), for the message and the logs. */
export function causeOf(e: unknown): string {
  const c = (e as { cause?: { code?: string; name?: string } })?.cause;
  return c?.code ?? c?.name ?? (e as { name?: string })?.name ?? "unknown";
}

/**
 * NCBI allows about 3 requests a second per address (10 with an API key), and
 * Vercel's addresses are shared with other sites. So E-utilities calls go one
 * at a time, spaced out, with the key added when one is set, and a 429 or 503
 * is retried after the wait the server asks for (or 1, 2, 4 seconds).
 */
let ncbiNext = 0;
let ncbiQueue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function ncbiTurn(): Promise<void> {
  const gap = process.env.NCBI_API_KEY ? 120 : 400;
  const turn = ncbiQueue.then(async () => {
    const wait = ncbiNext - Date.now();
    if (wait > 0) await sleep(wait);
    ncbiNext = Date.now() + gap;
  });
  ncbiQueue = turn.catch(() => undefined);
  return turn;
}
const isNcbi = (url: string) => /eutils\.ncbi\.nlm\.nih\.gov|\/eutils\//.test(url);
function withKey(url: string): string {
  const key = process.env.NCBI_API_KEY;
  return key && isNcbi(url) ? `${url}${url.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(key)}` : url;
}

async function get(url: string, accept: string, fetchImpl: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<string> {
  if (!isNcbi(url)) return getOnce(url, accept, fetchImpl, timeoutMs);
  for (let attempt = 0; ; attempt++) {
    await ncbiTurn();
    try {
      return await getOnce(withKey(url), accept, fetchImpl, timeoutMs);
    } catch (e) {
      const busy = e instanceof SearchError && (e.status === 429 || e.status === 503);
      if (!busy || attempt >= 3) throw e;
      await sleep((e as SearchError & { retryAfter?: number }).retryAfter ?? 1000 * 2 ** attempt);
    }
  }
}

async function getOnce(url: string, accept: string, fetchImpl: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { accept, "user-agent": "OratorStudio/0.3 (research workspace)" }, signal: ctl.signal, redirect: "follow" });
    if (res.status === 404) throw new SearchError("Not found at the source.", 404);
    if (res.status === 429 || res.status === 503) {
      const err = new SearchError(res.status === 429 ? `${new URL(url).host} is busy (too many requests). Try again in a moment.` : `${new URL(url).host} is temporarily unavailable. Try again in a moment.`, res.status);
      const ra = Number(res.headers.get("retry-after"));
      if (ra > 0 && ra <= 10) (err as SearchError & { retryAfter?: number }).retryAfter = ra * 1000;
      throw err;
    }
    if (!res.ok) throw new SearchError(`The database answered ${res.status}. Try again in a moment.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new SearchError("The record is too large to read here.");
    return text;
  } catch (e) {
    if (e instanceof SearchError) throw e;
    const host = new URL(url).host;
    console.error(`Search request to ${host} failed:`, causeOf(e));
    throw new SearchError(ctl.signal.aborted ? `${host} took too long to answer.` : `${host} couldn't be reached (${causeOf(e)}).`);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchPubmed(query: string, o: SearchOptions = {}, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  const ids = pubmedIds(JSON.parse(await get(pubmedSearchUrl(eutils(), query, o), "application/json", fetchImpl)));
  if (!ids.length) return [];
  return parsePubmedArticles(await get(pubmedAbstractUrl(eutils(), ids), "application/xml", fetchImpl), ids);
}

/** Papers: PubMed (fast, NIH) for journal articles; Europe PMC alongside for government reports and preprints only. */
export async function searchSources(provider: Provider, query: string, o: SearchOptions = {}, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  return (await searchWithSource(provider, query, o, fetchImpl)).results;
}

/** OpenAlex: scholarly works in every field, by relevance. An optional free key (OPENALEX_API_KEY) raises the daily limit. */
export async function searchOpenAlex(words: string, o: SearchOptions = {}, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  return parseOpenAlex(JSON.parse(await get(openAlexSearchUrl(openalex(), words, { fromYear: o.fromYear, pageSize: o.pageSize, apiKey: process.env.OPENALEX_API_KEY }), "application/json", fetchImpl)));
}

export async function searchWithSource(provider: Provider, query: string, o: SearchOptions = {}, fetchImpl?: typeof fetch): Promise<{ results: Candidate[]; from: string; note?: string }> {
  if (provider === "openalex") return { results: await searchOpenAlex(query, o, fetchImpl), from: "OpenAlex" };
  if (provider !== "europepmc") return { results: await searchCtGov(query, o, fetchImpl), from: "ClinicalTrials.gov" };
  // Reports (NCBI Bookshelf) and preprints aren't in PubMed; ask Europe PMC for just those, with a short wait.
  const extras = o.openAccessOnly
    ? Promise.resolve({ list: [] as Candidate[], failed: false })
    : get(europePmcSearchUrl(epmc(), `(${query}) AND (SRC:NBK OR SRC:PPR)`, { ...o, pageSize: 5 }), "application/json", fetchImpl, EPMC_TIMEOUT_MS)
        .then((t) => ({ list: parseEuropePmc(JSON.parse(t)), failed: false }))
        .catch(() => ({ list: [] as Candidate[], failed: true }));
  try {
    const [papers, more] = await Promise.all([searchPubmed(query, o, fetchImpl), extras]);
    const seen = new Set(papers.map((p) => p.pmid).filter(Boolean));
    return {
      results: [...papers, ...more.list.filter((c) => !c.pmid || !seen.has(c.pmid))],
      from: more.list.length ? "PubMed and Europe PMC" : "PubMed",
      ...(more.failed ? { note: "Government reports and preprints from Europe PMC didn't arrive in time; journal articles are complete." } : {}),
    };
  } catch (e) {
    const why = e instanceof SearchError ? e.message : "PubMed failed.";
    try {
      return { results: parseEuropePmc(JSON.parse(await get(europePmcSearchUrl(epmc(), query, o), "application/json", fetchImpl))), from: "Europe PMC", note: `Results from Europe PMC: ${why}` };
    } catch (e2) {
      throw new SearchError(`${why} Europe PMC also failed: ${e2 instanceof SearchError ? e2.message : "unknown error"}`);
    }
  }
}

async function searchCtGov(query: string, o: SearchOptions, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  const all = parseCtGov(JSON.parse(await get(ctGovSearchUrl(ctgov(), query), "application/json", fetchImpl)));
  return o.fromYear ? all.filter((c) => !c.year || Number(c.year) >= o.fromYear!) : all;
}

/** How each database answers from this server: for the check page. */
export async function checkConnections(fetchImpl?: typeof fetch) {
  const probe = async (name: string, url: string) => {
    const t0 = Date.now();
    try {
      await get(url, "application/json", fetchImpl, 20000);
      return { name, ok: true, ms: Date.now() - t0 };
    } catch (e) {
      return { name, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
    }
  };
  return Promise.all([
    probe("Europe PMC", `${epmc()}/search?query=diabetes&format=json&resultType=lite&pageSize=1`),
    probe("PubMed (NCBI)", `${eutils()}/esearch.fcgi?db=pubmed&retmode=json&retmax=1&tool=oratorstudio&term=diabetes`),
    probe("ClinicalTrials.gov", `${ctgov()}/studies?query.term=diabetes&pageSize=1&format=json`),
    probe("OpenAlex", openAlexSearchUrl(openalex(), "diabetes", { pageSize: 1, apiKey: process.env.OPENALEX_API_KEY })),
  ]);
}

/**
 * Open-access full text, as section pages: from PubMed Central at NCBI first
 * (fast), then Europe PMC. A record with no body (not open access) doesn't count.
 */
export async function fullText(pmcid: string, fetchImpl?: typeof fetch) {
  if (!/^PMC\d{1,10}$/.test(pmcid)) throw new SearchError("Not a PubMed Central id.", 400);
  const hasBody = (r: ReturnType<typeof jatsPages>) => r.pages.some((p) => p.text && !p.text.startsWith("Abstract\n"));
  try {
    const r = jatsPages(await get(pmcFullTextUrl(eutils(), pmcid), "application/xml", fetchImpl));
    if (hasBody(r)) return r;
  } catch {
    // fall through to Europe PMC
  }
  const r = jatsPages(await get(europePmcFullTextUrl(epmc(), pmcid), "application/xml", fetchImpl));
  if (!hasBody(r)) throw new SearchError("No free full text is available for this paper.", 404);
  return r;
}

/**
 * The discovery landscape for a topic (F-020): strongest evidence (systematic
 * reviews, meta-analyses, guidelines), the newest primary studies, ongoing
 * trials, and government reports. Sections run in parallel and fail on their
 * own; a slow source never holds up the others.
 */
/** Newest first, for display: the search itself ranks by best match. */
const byYear = (list: Candidate[]) => [...list].sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));

/**
 * `sources` are catalog ids (src/find/catalog.ts): pubmed powers the strongest
 * and newest sections, openalex the all-fields section, clinicaltrials the
 * ongoing trials, bookshelf the government reports. `words` are plain
 * keywords, for the databases that don't take PubMed's syntax.
 */
export async function landscape(query: string, plainWords: string, fetchImpl?: typeof fetch, broader?: string, sources: readonly string[] = STANDARD_IDS, words = plainWords): Promise<LandscapeSection[]> {
  const on = new Set(sources);
  const q = `(${query})`;
  const recent = `("${new Date().getFullYear() - 5}"[dp] : "3000"[dp])`;
  const REVIEWS = "(systematic[sb] OR meta-analysis[pt] OR guideline[pt] OR practice guideline[pt])";
  const run = async (key: LandscapeSection["key"], title: string, note: string, f: () => Promise<Candidate[]>): Promise<LandscapeSection> => {
    try {
      return { key, title, note, results: await f() };
    } catch (e) {
      return { key, title, note, results: [], error: e instanceof SearchError ? e.message : "This search failed." };
    }
  };
  const broadenedNote: Partial<Record<LandscapeSection["key"], string>> = {};
  const secs = await Promise.all([
    !on.has("pubmed") ? null : run("strongest", "Strongest evidence", "Systematic reviews, meta-analyses and guidelines: the best matches, shown newest first (PubMed)", async () => {
      const exact = byYear(await searchPubmed(`${q} AND ${REVIEWS}`, { pageSize: 8 }, fetchImpl));
      if (exact.length || !broader?.trim()) return exact;
      const wide = byYear(await searchPubmed(`(${broader}) AND ${REVIEWS}`, { pageSize: 8 }, fetchImpl));
      if (wide.length) broadenedNote.strongest = broader;
      return wide;
    }),
    !on.has("pubmed") ? null : run("newest", "Newest studies", "Primary research from the last five years: the best matches, shown newest first (PubMed)", async () =>
      byYear(await searchPubmed(`${q} AND ${recent} NOT (review[pt] OR systematic[sb] OR meta-analysis[pt] OR editorial[pt] OR comment[pt] OR letter[pt] OR case reports[pt])`, { pageSize: 10 }, fetchImpl)),
    ),
    !on.has("openalex")
      ? null
      : run("allfields", "Research in all fields", "Studies, reviews and reports from every discipline since " + (new Date().getFullYear() - 10) + ": the best matches, shown newest first (OpenAlex)", async () =>
          byYear(await searchOpenAlex(words, { fromYear: new Date().getFullYear() - 10, pageSize: 10 }, fetchImpl)),
        ),
    !on.has("clinicaltrials") ? null : run("ongoing", "Ongoing trials", "Recruiting or active studies that may change the picture (ClinicalTrials.gov)", async () => {
      const strict = parseCtGov(JSON.parse(await get(ctGovSearchUrl(ctgov(), ctGovTerms(plainWords), { ongoingOnly: true, pageSize: 8 }), "application/json", fetchImpl)));
      // Too strict for this topic? Fall back to matching any of the words.
      return strict.length ? strict : parseCtGov(JSON.parse(await get(ctGovSearchUrl(ctgov(), plainWords, { ongoingOnly: true, pageSize: 8 }), "application/json", fetchImpl)));
    }),
    !on.has("bookshelf") ? null : run("reports", "Government reports", "NCBI Bookshelf, such as AHRQ evidence reviews (Europe PMC)", async () =>
      parseEuropePmc(JSON.parse(await get(europePmcSearchUrl(epmc(), `(${plainWords}) AND SRC:NBK`, { pageSize: 5 }), "application/json", fetchImpl, EPMC_TIMEOUT_MS))).filter((c) => c.kind === "report"),
    ),
  ]);
  // A paper shows once: the first section it appears in keeps it, matched by id, PubMed id or DOI.
  const seen = new Set<string>();
  const keys = (c: Candidate) => [c.id, c.pmid && `pmid:${c.pmid}`, c.doi && `doi:${c.doi.toLowerCase()}`].filter(Boolean) as string[];
  const first = (c: Candidate) => {
    const k = keys(c);
    if (k.some((x) => seen.has(x))) return false;
    k.forEach((x) => seen.add(x));
    return true;
  };
  return secs.filter((s): s is LandscapeSection => s !== null).map((sec) => ({ ...sec, ...(broadenedNote[sec.key] ? { broadened: broadenedNote[sec.key] } : {}), results: sec.results.filter(first) }));
}
