import "server-only";
/**
 * Fetches a data URL for a source (F-014) without letting the server be used
 * to reach internal systems: https only, the institution's allowed hosts when
 * a list is set, no private or link-local addresses unless that exact host is
 * allowed, redirects checked at every hop, and size and time limits.
 * (A host that changes its DNS answer between check and fetch is a known gap;
 * an allowlist of trusted hosts closes it.)
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";

export const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

export class FetchRefused extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Hosts allowed by SOURCE_ALLOWED_HOSTS (comma separated); null means any public host. */
export function allowedHosts(): string[] | null {
  const raw = process.env.SOURCE_ALLOWED_HOSTS?.trim();
  return raw ? raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean) : null;
}

const listed = (host: string, list: string[] | null) => Boolean(list?.some((h) => host === h || host.endsWith("." + h)));

export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80");
}

async function check(url: URL, list: string[] | null) {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const explicitlyAllowed = listed(host, list);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && explicitlyAllowed)) throw new FetchRefused("Only https URLs can be sources.");
  if (list && !explicitlyAllowed) throw new FetchRefused(`${host} is not on this institution's list of allowed source hosts.`, 403);
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new FetchRefused(`${host} could not be found.`, 404);
  if (!explicitlyAllowed && addresses.some(isPrivateAddress)) throw new FetchRefused(`${host} is a private or internal address.`, 403);
}

export interface Fetched {
  text: string;
  contentType: string;
  finalUrl: string;
  fetchedAt: string;
  sha256: string;
  bytes: number;
}

export async function fetchSource(raw: string, list = allowedHosts()): Promise<Fetched> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused("That isn't a valid URL.");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await check(url, list);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: ctl.signal, headers: { accept: "application/json, application/xml, text/xml, text/csv, text/plain;q=0.8", "user-agent": "OratorStudio source fetcher" } });
    } catch {
      clearTimeout(timer);
      throw new FetchRefused("The URL didn't answer in time or couldn't be reached.", 504);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new FetchRefused(`The URL answered ${res.status}.`, 502);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/json|xml|csv|text\/plain/i.test(contentType)) {
      clearTimeout(timer);
      throw new FetchRefused(`The URL returned ${contentType.split(";")[0]}, not JSON, XML or CSV.`, 415);
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) {
        ctl.abort();
        clearTimeout(timer);
        throw new FetchRefused("The response is over 5 MB.", 413);
      }
      chunks.push(value);
    }
    clearTimeout(timer);
    const buf = Buffer.concat(chunks);
    return {
      text: buf.toString("utf8"),
      contentType,
      finalUrl: url.toString(),
      fetchedAt: new Date().toISOString(),
      sha256: createHash("sha256").update(buf).digest("hex"),
      bytes,
    };
  }
  throw new FetchRefused("Too many redirects.", 508);
}
