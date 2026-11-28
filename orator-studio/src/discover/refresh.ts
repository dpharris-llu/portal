"use client";
/**
 * API.Bible text kept in the Body of Knowledge is fetched again before 30
 * days pass (its terms, F-123). Run when Discover opens; text that changed is
 * updated, which flags whatever relies on it.
 */
import { needsRefresh, type Passage } from "@/find/bible";
import type { Repo } from "@/knowledge/repo";
import type { Source } from "@/knowledge/types";
import { post } from "./candidates";

export async function refreshScripture(k: Repo, sources: Source[]): Promise<number> {
  const stale = sources.filter((s) => s.kind === "scripture" && s.status === "active" && s.access !== "typed" && s.ids.reference && s.ids.version && needsRefresh(s.fetched_at ?? undefined));
  let n = 0;
  for (const s of stale) {
    try {
      const { passage } = await post<{ passage: Passage }>("/api/sources/bible", { reference: s.ids.reference, version: s.ids.version });
      await k.updateSource(s.id, { fetched_at: new Date().toISOString() });
      for (const f of await k.factsOf([s.id])) {
        if (f.quote && f.quote !== passage.text) await k.updateFact(f.id, { quote: passage.text, text: f.text.replace(f.quote, passage.text) });
      }
      n++;
    } catch {
      // Not reachable now (no key, offline): try again next time.
    }
  }
  return n;
}
