/**
 * Rules of the knowledge model that need no database: the evidence summary
 * of an assertion (F-134), whether it is supported, and the check for a topic
 * that already exists (F-142). Pure, so they are tested directly.
 */
import type { Assertion, AssertionFact, Fact, LinkRole, Source, SourceKind, Topic } from "./types";

export type EvidenceSummary = {
  facts: number;
  sources: number;
  /** Counts by kind of source: { paper: 2, scripture: 1 }. */
  kinds: Partial<Record<SourceKind, number>>;
  /** Earliest and latest source year, when known. */
  years: [string, string] | null;
  roles: Record<LinkRole, number>;
  /** Facts the app checked against their source; the rest are typed or unchecked. */
  checked: number;
};

/** A plain description of what an assertion rests on. No rating: judging strength is the author's. */
export function evidenceSummary(links: AssertionFact[], facts: Map<string, Fact>, sources: Map<string, Source>): EvidenceSummary {
  const live = links.map((l) => ({ l, f: facts.get(l.fact_id) })).filter((x): x is { l: AssertionFact; f: Fact } => Boolean(x.f && x.f.status === "active"));
  const srcIds = [...new Set(live.map((x) => x.f.source_id))];
  const srcs = srcIds.map((id) => sources.get(id)).filter((s): s is Source => Boolean(s));
  const kinds: Partial<Record<SourceKind, number>> = {};
  for (const s of srcs) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  const years = srcs.map((s) => s.year).filter((y): y is string => Boolean(y && /^\d{4}$/.test(y))).sort();
  const roles: Record<LinkRole, number> = { supports: 0, qualifies: 0, contradicts: 0 };
  for (const x of live) roles[x.l.role]++;
  return { facts: live.length, sources: srcIds.length, kinds, years: years.length ? [years[0], years[years.length - 1]] : null, roles, checked: live.filter((x) => x.f.checked).length };
}

const KIND_WORD: Record<SourceKind, [string, string]> = {
  paper: ["paper", "papers"],
  report: ["report", "reports"],
  trial: ["trial record", "trial records"],
  statistic: ["statistic", "statistics"],
  scripture: ["Scripture passage", "Scripture passages"],
  document: ["document", "documents"],
  data: ["data source", "data sources"],
  web: ["web page", "web pages"],
  own_writing: ["piece of your own writing", "pieces of your own writing"],
  own_knowledge: ["note of your own knowledge", "notes of your own knowledge"],
};

/** "5 facts from 3 sources (2 papers, 1 Scripture passage), 2019–2025: 4 support, 1 qualifies." */
export function describeEvidence(e: EvidenceSummary): string {
  if (!e.facts) return "Unsupported: no facts linked yet.";
  const kinds = Object.entries(e.kinds)
    .map(([k, n]) => `${n} ${KIND_WORD[k as SourceKind][n === 1 ? 0 : 1]}`)
    .join(", ");
  const years = e.years ? (e.years[0] === e.years[1] ? `, ${e.years[0]}` : `, ${e.years[0]}–${e.years[1]}`) : "";
  const roles = (["supports", "qualifies", "contradicts"] as LinkRole[])
    .filter((r) => e.roles[r])
    .map((r) => `${e.roles[r]} ${e.roles[r] === 1 ? r : r.replace(/s$/, "")}`)
    .join(", ");
  return `${e.facts} fact${e.facts === 1 ? "" : "s"} from ${e.sources} source${e.sources === 1 ? "" : "s"} (${kinds})${years}: ${roles}.`;
}

export const isSupported = (links: AssertionFact[], facts: Map<string, Fact>) => links.some((l) => facts.get(l.fact_id)?.status === "active");

/** An assertion's own text can't be edited by anyone but its author. */
export const canEdit = (a: Assertion, userId: string) => a.author_id === userId;

// ---- Does this topic exist already? (F-142) ----

const STOP = new Set("a an and the of in on for to with by from at as or is are be its it this that among between into about over under".split(" "));
export const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

/** A light stem, so "missed", "misses" and "miss", or "resting" and "rest", match. */
function stem(w: string): string {
  let x = w.replace(/ies$/, "y").replace(/(?<!s)s$/, "");
  if (x.length > 5) x = x.replace(/(ing|ed)$/, "");
  return x.replace(/(.)\1$/, "$1");
}

/**
 * Existing topics that look like the one about to be created, best first:
 * the share of meaningful words (in the name and keywords) they have in common.
 */
export function similarTopics(name: string, keywords: string[], topics: Topic[], min = 0.5): { topic: Topic; score: number }[] {
  const want = new Set([...words(name), ...keywords.flatMap(words)]);
  if (!want.size) return [];
  return topics
    .map((t) => {
      const have = new Set([...words(t.name), ...t.keywords.flatMap(words)]);
      const shared = [...want].filter((w) => have.has(w)).length;
      const score = shared / Math.min(want.size, have.size || 1);
      return { topic: t, score: Math.min(1, score) };
    })
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
}

/** Keywords from a free-text list: "walking, diabetes; HbA1c" -> ["walking", "diabetes", "HbA1c"]. */
export const parseKeywords = (s: string) => [...new Set(s.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean))].slice(0, 20);
