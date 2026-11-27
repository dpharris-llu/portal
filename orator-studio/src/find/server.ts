import "server-only";
/**
 * Server calls to the named databases (F-119). Only these fixed endpoints are
 * reached, built from the query; the browser never supplies an address, so
 * this is not an open fetcher. Time and size limits as for data URLs.
 */
import type { Candidate, Provider, SearchOptions } from "./types";
import { EUROPEPMC_BASE, europePmcFullTextUrl, europePmcSearchUrl, jatsPages, parseEuropePmc } from "./europepmc";
import { CTGOV_BASE, ctGovSearchUrl, parseCtGov } from "./clinicaltrials";

const TIMEOUT_MS = 15000;
const MAX_BYTES = 8 * 1024 * 1024;
// Overridable for tests only (a local stand-in server).
const epmc = () => process.env.EUROPEPMC_BASE || EUROPEPMC_BASE;
const ctgov = () => process.env.CTGOV_BASE || CTGOV_BASE;

export class SearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

async function get(url: string, accept: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: { accept, "user-agent": "OratorStudio/0.3 (research workspace)" }, signal: ctl.signal, redirect: "follow" });
    if (res.status === 404) throw new SearchError("Not found at the source.", 404);
    if (!res.ok) throw new SearchError(`The database answered ${res.status}. Try again in a moment.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new SearchError("The record is too large to read here.");
    return text;
  } catch (e) {
    if (e instanceof SearchError) throw e;
    throw new SearchError(ctl.signal.aborted ? "The database took too long to answer." : "The database couldn't be reached.");
  } finally {
    clearTimeout(timer);
  }
}

export async function searchSources(provider: Provider, query: string, o: SearchOptions = {}, fetchImpl?: typeof fetch): Promise<Candidate[]> {
  if (provider === "europepmc") return parseEuropePmc(JSON.parse(await get(europePmcSearchUrl(epmc(), query, o), "application/json", fetchImpl)));
  const all = parseCtGov(JSON.parse(await get(ctGovSearchUrl(ctgov(), query), "application/json", fetchImpl)));
  return o.fromYear ? all.filter((c) => !c.year || Number(c.year) >= o.fromYear!) : all;
}

/** Open-access full text from PubMed Central, as section pages. */
export async function fullText(pmcid: string, fetchImpl?: typeof fetch) {
  if (!/^PMC\d{1,10}$/.test(pmcid)) throw new SearchError("Not a PubMed Central id.", 400);
  const r = jatsPages(await get(europePmcFullTextUrl(epmc(), pmcid), "application/xml", fetchImpl));
  if (!r.pages.length) throw new SearchError("The full text came back empty.");
  return r;
}
