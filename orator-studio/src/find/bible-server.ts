import "server-only";
/** Server calls to API.Bible (F-123). The key (API_BIBLE_KEY) never leaves the server. */
import { API_BIBLE_BASE, apiId, formatReference, parseReference, pickBible, readPassage, readSearch, VERSIONS, type Passage, type Version, type VerseHit } from "./bible";

const TIMEOUT_MS = 15000;
const base = () => process.env.API_BIBLE_BASE || API_BIBLE_BASE;

export class BibleError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export const bibleConfigured = () => Boolean(process.env.API_BIBLE_KEY);

async function call(path: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const key = process.env.API_BIBLE_KEY;
  if (!key) throw new BibleError("Bible lookup isn't set up on this server yet (API_BIBLE_KEY).", 501);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base()}${path}`, { headers: { "api-key": key, accept: "application/json" }, signal: ctl.signal });
    if (res.status === 401 || res.status === 403) throw new BibleError("API.Bible didn't accept the key, or this version isn't licensed on the account. Check API_BIBLE_KEY and the Bibles chosen in the API.Bible dashboard.", 502);
    if (res.status === 404) throw new BibleError("That passage wasn't found in this version. Check the reference.", 404);
    if (res.status === 429) throw new BibleError("The monthly Bible lookup allowance is used up, or requests came too fast. Try again later.", 429);
    if (!res.ok) throw new BibleError(`API.Bible answered ${res.status}. Try again.`);
    return await res.json();
  } catch (e) {
    if (e instanceof BibleError) throw e;
    throw new BibleError(ctl.signal.aborted ? "API.Bible took too long to answer." : "API.Bible couldn't be reached.");
  } finally {
    clearTimeout(timer);
  }
}

// The account's Bibles change rarely: look them up once per server instance, for an hour.
type BibleRow = { id: string; abbreviation?: string; name?: string; language?: { id?: string } };
let index: { at: number; rows: BibleRow[] } | null = null;
async function bibles(fetchImpl?: typeof fetch): Promise<BibleRow[]> {
  // A supplied fetch (tests) always asks afresh and leaves the cache alone.
  if (!fetchImpl && index && Date.now() - index.at < 3_600_000) return index.rows;
  const json = (await call("/bibles?language=eng", fetchImpl)) as { data?: BibleRow[] };
  const rows = json.data ?? [];
  if (!fetchImpl) index = { at: Date.now(), rows };
  return rows;
}

/** Which versions this account can use. */
export async function availableVersions(fetchImpl?: typeof fetch): Promise<Version[]> {
  const rows = await bibles(fetchImpl);
  return VERSIONS.map((v) => v.id).filter((v) => pickBible(rows, v));
}

export async function lookUp(reference: string, version: Version, fetchImpl?: typeof fetch): Promise<Passage> {
  const ref = parseReference(reference);
  if (!ref) throw new BibleError("That doesn't look like a Bible reference. Try a form like John 3:16–17, 1 Cor 13:4–7 or Psalm 23.", 400);
  const id = apiId(ref);
  if (!id) throw new BibleError("Give one chapter, or verses across chapters (for example Romans 8:38–9:2).", 400);
  const bibleId = pickBible(await bibles(fetchImpl), version);
  if (!bibleId) throw new BibleError(`The ${version} isn't available on this API.Bible account. Add it in the API.Bible dashboard.`, 404);
  const q = "content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=false";
  const path = id.kind === "chapter" ? `/bibles/${bibleId}/chapters/${encodeURIComponent(id.id)}?${q}` : `/bibles/${bibleId}/passages/${encodeURIComponent(id.id)}?${q}`;
  const passage = readPassage(await call(path, fetchImpl), version, bibleId, formatReference(ref));
  if (!passage.text) throw new BibleError("API.Bible returned no text for that passage.", 404);
  return passage;
}

/** Verses containing all the words (API.Bible's search), best matches first. */
export async function searchWords(words: string, version: Version, fetchImpl?: typeof fetch): Promise<{ verses: VerseHit[]; total: number; fumsToken?: string; version: Version }> {
  const q = words.trim();
  if (q.length < 2) throw new BibleError("Give a word or two to search for.", 400);
  const bibleId = pickBible(await bibles(fetchImpl), version);
  if (!bibleId) throw new BibleError(`The ${version} isn't available on this API.Bible account. Add it in the API.Bible dashboard.`, 404);
  const r = readSearch(await call(`/bibles/${bibleId}/search?query=${encodeURIComponent(q)}&limit=20&sort=relevance`, fetchImpl));
  return { ...r, version };
}
