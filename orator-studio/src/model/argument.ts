/**
 * The argument (spec 1A, F-002, F-016): what Orator Research produces and Orator
 * Build drafts slides from. Purpose and audience, a thesis, points in order with
 * the evidence behind each, open questions, a recommendation and next steps.
 *
 * Like a deck, it is changed only through operations, each with its inverse, so
 * it has history and undo, and a deck drafted at version N can tell which
 * points changed since.
 */
import type { Author, Id, Intent } from "./types";
import { newId } from "./ids";

export interface EvidenceItem {
  id: Id;
  /** note: the author's own; figure: a confirmed figure; finding: a quoted finding from a paper; image: an evidence image. */
  kind: "note" | "figure" | "finding" | "image";
  text: string;
  /** Where it came from: "Delgado et al., 2025, p. 4", "Statements, Feb 2026", a URL. */
  source?: string;
  quote?: string;
}

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
  purpose: string;
  audience: string;
  takeaway: string;
  thesis: string;
  points: ArgPoint[];
  openQuestions: string[];
  recommendation: string;
  nextSteps: string[];
  origin: ArgumentOrigin;
  /** Number of operations applied. */
  version: number;
}

export type ArgFields = Pick<Argument, "title" | "purpose" | "audience" | "takeaway" | "thesis" | "openQuestions" | "recommendation" | "nextSteps">;

export type ArgOpBody =
  | { kind: "arg.set"; patch: Partial<ArgFields> }
  | { kind: "point.put"; point: ArgPoint; index?: number }
  | { kind: "point.delete"; pointId: Id }
  | { kind: "point.move"; pointId: Id; index: number };

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
  }
}

/** A point with no evidence is shown as unsupported, never blocked (spec 1A). */
export const isSupported = (p: ArgPoint) => p.evidence.length > 0;

/** What changed in the argument after `version`: the points touched, and whether the framing (thesis, recommendation...) changed. */
export function changesSince(log: ArgOp[], version: number): { points: Set<Id>; framing: boolean; count: number } {
  const later = log.slice(version);
  const points = new Set<Id>();
  let framing = false;
  for (const op of later) {
    const b = op.body;
    if (b.kind === "arg.set") framing = framing || Object.keys(b.patch).some((k) => k !== "title");
    else points.add(b.kind === "point.put" ? b.point.id : b.pointId);
  }
  return { points, framing, count: later.length };
}

export const argumentTitle = (a: Pick<Argument, "title" | "thesis" | "purpose">) =>
  (a.title.trim() || a.thesis.trim().slice(0, 80) || a.purpose.trim().slice(0, 80) || "Untitled argument").replace(/[.]+$/, "");
