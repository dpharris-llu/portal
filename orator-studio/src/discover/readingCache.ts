"use client";
/**
 * Claude's readings, kept so the same text isn't read (and paid for) twice.
 * Keyed by a hash of the exact text read, so a different text (full text
 * instead of the abstract) is read afresh. Kept in this browser, newest 60.
 */
import type { CheckedReading } from "@/ai/evidence";
import type { PaperPage } from "@/evidence/text";

const INDEX = "orator-readings";
const MAX = 60;

/** FNV-1a over the text: short, stable, good enough to tell texts apart. */
export function textKey(name: string, pages: PaperPage[]): string {
  const s = name + "\u0000" + pages.map((p) => `${p.page}\u0001${p.text}`).join("\u0002");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(36)}-${s.length.toString(36)}`;
}

type Entry = { key: string; at: string; reading: CheckedReading };

function readAll(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? "[]");
  } catch {
    return [];
  }
}

export function cachedReading(key: string): { reading: CheckedReading; at: string } | null {
  const e = readAll().find((x) => x.key === key);
  return e ? { reading: e.reading, at: e.at } : null;
}

export function cacheReading(key: string, reading: CheckedReading) {
  const rest = readAll().filter((x) => x.key !== key);
  const next = [{ key, at: new Date().toISOString(), reading }, ...rest].slice(0, MAX);
  try {
    localStorage.setItem(INDEX, JSON.stringify(next));
  } catch {
    // Full: keep fewer.
    try {
      localStorage.setItem(INDEX, JSON.stringify(next.slice(0, 20)));
    } catch {}
  }
}
