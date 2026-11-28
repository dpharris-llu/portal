/**
 * The argument (spec 3, F-002, F-016): what Orator Research produces and Orator
 * Build drafts slides from. Purpose and audience, a thesis, points in order with
 * the evidence behind each, open questions, a recommendation and next steps.
 *
 * Like a deck, it is changed only through operations, each with its inverse, so
 * it has history and undo, and a deck drafted at version N can tell which
 * points changed since.
 */
import type { Author, Id, Intent } from "./types";
import { newId } from "./ids";
import type { LandscapeSection } from "@/find/types";

export interface EvidenceItem {
  id: Id;
  /** note: the author's own; figure: a confirmed figure; finding: a quoted finding from a paper; image: an evidence image. */
  kind: "note" | "figure" | "finding" | "image";
  text: string;
  /** Where it came from: "Delgado et al., 2025, p. 4", "Statements, Feb 2026", a URL. */
  source?: string;
  quote?: string;
  /** The workspace fact this evidence is, when it came from one (spec 3, F-118). */
  factId?: Id;
}

/**
 * The Research workspace (F-118): the sources an argument draws on and the
 * facts confirmed from them. Ids are short ("S2", "F7") so the author and
 * Claude can refer to them. Discarded items stay on record, with a reason,
 * but are never used again: not in points, not sent to Claude.
 */
export type SourceKind = "paper" | "report" | "trial" | "document" | "data" | "note" | "web";
export interface WorkspaceSource {
  id: Id;
  kind: SourceKind;
  title: string;
  /** Full citation for papers; file name, URL or "Author's note" otherwise. */
  citation: string;
  /** Short form for chips: "Delgado et al., 2025". */
  short: string;
  design?: string;
  sample?: string;
  /** The public record, for sources found by search (F-119). */
  url?: string;
  /** Publication year, when known. */
  year?: string;
  /** Brought by the author, or found by discovery (F-020). */
  origin?: "yours" | "discovered";
  /** What was read: the full text, only the abstract, or a registry record. */
  access?: "full text" | "abstract" | "registry record";
  /** Names for "pages" that are really sections (full texts from PubMed Central). */
  pageLabels?: Record<number, string>;
  status: "active" | "discarded";
  discardReason?: string;
  addedAt: string;
}

/** Where in a source a fact is: "p. 4", or a section name. */
export function locate(src: WorkspaceSource | undefined, page?: number): string {
  if (!page) return "";
  return src?.pageLabels?.[page] ?? `p. ${page}`;
}
export interface Fact {
  id: Id;
  sourceId: Id;
  kind: "finding" | "limitation" | "figure" | "note";
  text: string;
  quote?: string;
  page?: number;
  /** True when the app checked the quote (and its numbers) against the source. */
  checked: boolean;
  status: "active" | "discarded";
  discardReason?: string;
}
/** One probe: the author's question, Claude's checked answer, and what became of its proposals. */
export interface Probe {
  id: Id;
  question: string;
  at: string;
  answer: string;
  cites: Id[];
  /** Problems the app found in the answer (shown, and the answer is marked). */
  problems: string[];
  /** Outcome of each proposal, by index: accepted, dismissed, or left out by the checks. */
  outcomes: ("accepted" | "dismissed" | "left out" | "open")[];
  proposals: { action: ProbeAction; why: string; problems: string[] }[];
  via: string;
}

/**
 * One Discover run, kept with the presentation so a reload or a restart
 * doesn't lose it, and so the presentation records how its evidence was
 * found (the search record). Only the latest few keep their full results;
 * older ones keep the query and how many each section found.
 */
export interface SearchRecord {
  id: Id;
  at: string;
  topic: string;
  query: string;
  broader?: string;
  note?: string;
  /** Who wrote the query: Claude, or the author. */
  by: "claude" | "author";
  counts: { key: string; title: string; n: number }[];
  sections?: LandscapeSection[];
}

export const SEARCHES_WITH_RESULTS = 3;

/** What a probe may propose. The author accepts or dismisses each one. */
export type ProbeAction =
  | { kind: "add_point"; text: string; intent: Intent; detail: string; factIds: Id[] }
  | { kind: "link_evidence"; pointId: Id; factIds: Id[] }
  | { kind: "set_thesis"; text: string }
  | { kind: "add_open_question"; text: string }
  | { kind: "discard_source"; sourceId: Id; reason: string }
  | { kind: "discard_fact"; factId: Id; reason: string }
  | { kind: "find_sources"; want: string };

export interface ArgPoint {
  id: Id;
  /** The conclusion, written as a headline. */
  text: string;
  intent: Intent;
  /** Why it matters, reasoning, what the author wants to say about it. */
  detail: string;
  evidence: EvidenceItem[];
  /** Set when Claude wrote or proposed the point. */
  byAi?: boolean;
}

export type ArgumentOrigin = "blank" | "documents" | "data" | "papers";

export interface Argument {
  id: Id;
  tenantId: Id;
  title: string;
  /** What the presentation is about, before any position is taken (F-019). */
  topic?: string;
  purpose: string;
  audience: string;
  takeaway: string;
  thesis: string;
  points: ArgPoint[];
  openQuestions: string[];
  recommendation: string;
  nextSteps: string[];
  origin: ArgumentOrigin;
  sources?: WorkspaceSource[];
  facts?: Fact[];
  probes?: Probe[];
  searches?: SearchRecord[];
  /** Number of operations applied. */
  version: number;
}

export type ArgFields = Pick<Argument, "title" | "topic" | "purpose" | "audience" | "takeaway" | "thesis" | "openQuestions" | "recommendation" | "nextSteps">;

export type ArgOpBody =
  | { kind: "arg.set"; patch: Partial<ArgFields> }
  | { kind: "point.put"; point: ArgPoint; index?: number }
  | { kind: "point.delete"; pointId: Id }
  | { kind: "point.move"; pointId: Id; index: number }
  | { kind: "source.put"; source: WorkspaceSource }
  | { kind: "fact.put"; fact: Fact }
  | { kind: "probe.put"; probe: Probe }
  | { kind: "search.put"; search: SearchRecord }
  | { kind: "item.remove"; list: "sources" | "facts" | "probes" | "searches"; id: Id };

export interface ArgOp {
  id: Id;
  at: string;
  author: Author;
  reason?: string;
  body: ArgOpBody;
}

export function emptyArgument(tenantId: Id, fields: Partial<ArgFields> = {}, origin: ArgumentOrigin = "blank"): Argument {
  return {
    id: newId("arg"),
    tenantId,
    title: "",
    purpose: "",
    audience: "",
    takeaway: "",
    thesis: "",
    points: [],
    openQuestions: [],
    recommendation: "",
    nextSteps: [],
    origin,
    version: 0,
    ...fields,
  };
}

export function newPoint(text = "", fields: Partial<ArgPoint> = {}): ArgPoint {
  return { id: newId("pt"), text, intent: "persuade", detail: "", evidence: [], ...fields };
}

export function newEvidence(text: string, fields: Partial<EvidenceItem> = {}): EvidenceItem {
  return { id: newId("ev"), kind: "note", text, ...fields };
}

export function makeArgOp(body: ArgOpBody, author: Author, reason?: string): ArgOp {
  return { id: newId("aop"), at: new Date().toISOString(), author, reason, body };
}

export class ArgOpError extends Error {}

export function applyArgOp(arg: Argument, op: ArgOp): Argument {
  const b = op.body;
  let next: Argument;
  switch (b.kind) {
    case "arg.set":
      next = { ...arg, ...b.patch };
      break;
    case "point.put": {
      const at = arg.points.findIndex((p) => p.id === b.point.id);
      const points = [...arg.points];
      if (at >= 0 && b.index === undefined) points[at] = b.point;
      else {
        if (at >= 0) points.splice(at, 1);
        points.splice(Math.max(0, Math.min(b.index ?? points.length, points.length)), 0, b.point);
      }
      next = { ...arg, points };
      break;
    }
    case "point.delete":
      if (!arg.points.some((p) => p.id === b.pointId)) throw new ArgOpError(`No point ${b.pointId}`);
      next = { ...arg, points: arg.points.filter((p) => p.id !== b.pointId) };
      break;
    case "point.move": {
      const at = arg.points.findIndex((p) => p.id === b.pointId);
      if (at < 0) throw new ArgOpError(`No point ${b.pointId}`);
      const points = [...arg.points];
      const [p] = points.splice(at, 1);
      points.splice(Math.max(0, Math.min(b.index, points.length)), 0, p);
      next = { ...arg, points };
      break;
    }
    case "source.put":
      next = { ...arg, sources: upsert(arg.sources, b.source) };
      break;
    case "fact.put":
      next = { ...arg, facts: upsert(arg.facts, b.fact) };
      break;
    case "probe.put":
      next = { ...arg, probes: upsert(arg.probes, b.probe) };
      break;
    case "search.put": {
      // Full results for the latest few only, so the saved presentation stays small.
      const all = upsert(arg.searches, b.search);
      const keep = all.length - SEARCHES_WITH_RESULTS;
      next = { ...arg, searches: all.map((x, i) => (i < keep && x.sections ? { ...x, sections: undefined } : x)) };
      break;
    }
    case "item.remove":
      next = { ...arg, [b.list]: ((arg[b.list] ?? []) as { id: Id }[]).filter((x) => x.id !== b.id) };
      break;
  }
  return { ...next, version: arg.version + 1 };
}

/** The operation that undoes `body`, given the argument before it was applied. */
export function invertArgOp(before: Argument, body: ArgOpBody): ArgOpBody {
  switch (body.kind) {
    case "arg.set": {
      const patch: Partial<ArgFields> = {};
      for (const k of Object.keys(body.patch) as (keyof ArgFields)[]) (patch as Record<string, unknown>)[k] = before[k];
      return { kind: "arg.set", patch };
    }
    case "point.put": {
      const at = before.points.findIndex((p) => p.id === body.point.id);
      return at < 0 ? { kind: "point.delete", pointId: body.point.id } : { kind: "point.put", point: before.points[at], index: at };
    }
    case "point.delete": {
      const at = before.points.findIndex((p) => p.id === body.pointId);
      return { kind: "point.put", point: before.points[at], index: at };
    }
    case "point.move":
      return { kind: "point.move", pointId: body.pointId, index: before.points.findIndex((p) => p.id === body.pointId) };
    case "source.put":
    case "fact.put":
    case "probe.put": {
      const list = body.kind === "source.put" ? "sources" : body.kind === "fact.put" ? "facts" : "probes";
      const item = body.kind === "source.put" ? body.source : body.kind === "fact.put" ? body.fact : body.probe;
      const prev = (before[list] as { id: Id }[] | undefined)?.find((x) => x.id === item.id);
      if (!prev) return { kind: "item.remove", list, id: item.id };
      return list === "sources" ? { kind: "source.put", source: prev as WorkspaceSource } : list === "facts" ? { kind: "fact.put", fact: prev as Fact } : { kind: "probe.put", probe: prev as Probe };
    }
    case "search.put": {
      const prev = before.searches?.find((x) => x.id === body.search.id);
      return prev ? { kind: "search.put", search: prev } : { kind: "item.remove", list: "searches", id: body.search.id };
    }
    case "item.remove": {
      const prev = (before[body.list] as { id: Id }[] | undefined)?.find((x) => x.id === body.id);
      if (!prev) return body;
      if (body.list === "searches") return { kind: "search.put", search: prev as SearchRecord };
      return body.list === "sources" ? { kind: "source.put", source: prev as WorkspaceSource } : body.list === "facts" ? { kind: "fact.put", fact: prev as Fact } : { kind: "probe.put", probe: prev as Probe };
    }
  }
}

/** A point with no evidence is shown as unsupported, never blocked (spec 3). */
export const isSupported = (p: ArgPoint) => p.evidence.length > 0;

/** What changed in the argument after `version`: the points touched, and whether the framing (thesis, recommendation...) changed. */
export function changesSince(log: ArgOp[], version: number): { points: Set<Id>; framing: boolean; count: number } {
  const later = log.slice(version);
  const points = new Set<Id>();
  let framing = false;
  for (const op of later) {
    const b = op.body;
    if (b.kind === "arg.set") framing = framing || Object.keys(b.patch).some((k) => k !== "title");
    else if (b.kind === "point.put") points.add(b.point.id);
    else if (b.kind === "point.delete" || b.kind === "point.move") points.add(b.pointId);
  }
  return { points, framing, count: later.length };
}

export const argumentTitle = (a: Pick<Argument, "title" | "thesis" | "purpose"> & { topic?: string }) =>
  (a.title.trim() || a.topic?.trim().slice(0, 80) || a.thesis.trim().slice(0, 80) || a.purpose.trim().slice(0, 80) || "Untitled presentation").replace(/[.]+$/, "");

// ---- Workspace helpers (F-118) ----

function upsert<T extends { id: Id }>(list: T[] | undefined, item: T): T[] {
  const l = list ?? [];
  return l.some((x) => x.id === item.id) ? l.map((x) => (x.id === item.id ? item : x)) : [...l, item];
}

/** The next short id: "S3" after S1 and S2. */
export function nextId(prefix: "S" | "F", existing: { id: Id }[] | undefined): Id {
  const n = Math.max(0, ...(existing ?? []).map((x) => (x.id.startsWith(prefix) ? Number(x.id.slice(1)) || 0 : 0)));
  return `${prefix}${n + 1}`;
}

export const activeSources = (a: Argument) => (a.sources ?? []).filter((s) => s.status === "active");
export const activeFacts = (a: Argument) => {
  const live = new Set(activeSources(a).map((s) => s.id));
  return (a.facts ?? []).filter((f) => f.status === "active" && live.has(f.sourceId));
};

/** Evidence for a point, from a fact, labeled with its source. */
export function evidenceFromFact(a: Argument, f: Fact): EvidenceItem {
  const src = (a.sources ?? []).find((s) => s.id === f.sourceId);
  const kind: EvidenceItem["kind"] = f.kind === "figure" ? "figure" : f.kind === "note" ? "note" : "finding";
  return {
    id: `ev-${f.id}`,
    kind,
    text: f.text,
    factId: f.id,
    ...(f.quote ? { quote: f.quote } : {}),
    source: src ? `${src.short}${f.page ? `, ${locate(src, f.page)}` : ""}${src.access === "abstract" ? " (abstract)" : ""}` : undefined,
  };
}

/**
 * Discarding (the author's call, F-118): the fact or source is marked discarded
 * with the reason, and evidence that used it is taken off every point. A source
 * takes its facts with it. Returns the operations, so one undo restores it all.
 */
export function discardBodies(a: Argument, target: { sourceId: Id } | { factId: Id }, reason: string): ArgOpBody[] {
  const bodies: ArgOpBody[] = [];
  const facts =
    "sourceId" in target ? (a.facts ?? []).filter((f) => f.sourceId === target.sourceId && f.status === "active") : (a.facts ?? []).filter((f) => f.id === target.factId && f.status === "active");
  if ("sourceId" in target) {
    const src = (a.sources ?? []).find((s) => s.id === target.sourceId);
    if (!src || src.status === "discarded") return [];
    bodies.push({ kind: "source.put", source: { ...src, status: "discarded", discardReason: reason } });
  } else if (!facts.length) return [];
  for (const f of facts) bodies.push({ kind: "fact.put", fact: { ...f, status: "discarded", discardReason: reason } });
  const gone = new Set(facts.map((f) => f.id));
  for (const p of a.points) {
    if (p.evidence.some((e) => e.factId && gone.has(e.factId))) bodies.push({ kind: "point.put", point: { ...p, evidence: p.evidence.filter((e) => !(e.factId && gone.has(e.factId))) } });
  }
  return bodies;
}

/** Bring a discarded source or fact back (its evidence links are not restored; undo does that). */
export function restoreBodies(a: Argument, target: { sourceId: Id } | { factId: Id }): ArgOpBody[] {
  if ("sourceId" in target) {
    const src = (a.sources ?? []).find((s) => s.id === target.sourceId);
    if (!src || src.status === "active") return [];
    const facts = (a.facts ?? []).filter((f) => f.sourceId === src.id && f.status === "discarded" && f.discardReason === src.discardReason);
    return [{ kind: "source.put", source: { ...src, status: "active", discardReason: undefined } }, ...facts.map((f) => ({ kind: "fact.put" as const, fact: { ...f, status: "active" as const, discardReason: undefined } }))];
  }
  const f = (a.facts ?? []).find((x) => x.id === target.factId);
  return f && f.status === "discarded" ? [{ kind: "fact.put", fact: { ...f, status: "active", discardReason: undefined } }] : [];
}
