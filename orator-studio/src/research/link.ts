"use client";
/**
 * The Research flows (documents, data URLs, papers) save their argument as well
 * as drafting a deck, and link the two (F-016).
 */
import type { Author } from "@/model/types";
import { applyArgOp, emptyArgument, evidenceFromFact, makeArgOp, type ArgFields, type ArgPoint, type Argument, type ArgumentOrigin, type ArgOp, type Fact, type WorkspaceSource } from "@/model/argument";
import type { Paper } from "@/model/types";
import { formatCitation, shortCitation } from "@/ai/evidence";
import { getArguments } from "@/lib/argumentRepo";
import type { DataSource } from "@/model/types";
import type { Argument as FiguresArgument } from "@/documents/build";

export async function saveNewArgument(opts: {
  tenantId: string;
  me: Author;
  ai?: Author;
  origin: ArgumentOrigin;
  fields: Partial<ArgFields>;
  points: ArgPoint[];
  sources?: WorkspaceSource[];
  facts?: Fact[];
  reason: string;
}): Promise<Argument> {
  let arg = emptyArgument(opts.tenantId, {}, opts.origin);
  const log: ArgOp[] = [
    makeArgOp({ kind: "arg.set", patch: opts.fields }, opts.me, opts.reason),
    ...(opts.sources ?? []).map((source) => makeArgOp({ kind: "source.put", source }, opts.me, opts.reason)),
    ...(opts.facts ?? []).map((fact) => makeArgOp({ kind: "fact.put", fact }, opts.me, opts.reason)),
    ...opts.points.map((point) => makeArgOp({ kind: "point.put", point }, point.byAi && opts.ai ? opts.ai : opts.me, opts.reason)),
  ];
  for (const op of log) arg = applyArgOp(arg, op);
  await getArguments().save(arg, log, true);
  return arg;
}

/** The workspace for papers: one source per paper, one fact per confirmed finding; maps claim ids ("P1-C2") to fact ids. */
export function workspaceFromPapers(papers: Paper[]): { sources: WorkspaceSource[]; facts: Fact[]; factOf: Map<string, string> } {
  const now = new Date().toISOString();
  const sources: WorkspaceSource[] = [];
  const facts: Fact[] = [];
  const factOf = new Map<string, string>();
  papers.forEach((p, i) => {
    const sid = `S${i + 1}`;
    sources.push({ id: sid, kind: "paper", title: p.citation.title, citation: formatCitation(p.citation), short: shortCitation(p.citation), ...(p.design ? { design: p.design } : {}), ...(p.sample ? { sample: p.sample } : {}), status: "active", addedAt: now });
    for (const c of p.claims) {
      const fid = `F${facts.length + 1}`;
      factOf.set(c.id, fid);
      facts.push({ id: fid, sourceId: sid, kind: c.kind, text: c.text, quote: c.quote, page: c.page, checked: true, status: "active" });
    }
  });
  return { sources, facts, factOf };
}

/** Evidence items for a point from workspace facts. */
export function evidenceFor(sources: WorkspaceSource[], facts: Fact[], factIds: string[]) {
  const ws = { sources, facts } as Argument;
  return factIds.flatMap((id) => {
    const f = facts.find((x) => x.id === id);
    return f ? [evidenceFromFact(ws, f)] : [];
  });
}

/** The argument behind a deck drafted from figures (documents or a data URL): one source, one checked figure fact per point. */
export function pointsFromFigures(src: DataSource, arg: FiguresArgument, kind: "document" | "data" = "document"): { fields: Partial<ArgFields>; points: ArgPoint[]; sources: WorkspaceSource[]; facts: Fact[] } {
  const source: WorkspaceSource = { id: "S1", kind, title: src.name, citation: src.name, short: src.name, status: "active", addedAt: new Date().toISOString() };
  const facts: Fact[] = arg.points.map((pt, i) => ({ id: `F${i + 1}`, sourceId: "S1", kind: "figure", text: pt.evidence, checked: true, status: "active" }));
  return {
    sources: [source],
    facts,
    fields: {
      thesis: arg.thesis ?? "",
      recommendation: arg.recommendation ? `${arg.recommendation.action}. Why: ${arg.recommendation.rationale} Tradeoffs: ${arg.recommendation.tradeoffs}` : "",
      nextSteps: arg.nextSteps,
    },
    points: arg.points.map((pt, i) => ({
      id: arg.pointIds?.[i] ?? `pt-${i}`,
      text: pt.conclusion,
      intent: "persuade" as const,
      detail: `Why it matters: ${pt.soWhat}\nConfidence: ${pt.confidence}. ${pt.confidenceReason}`,
      evidence: evidenceFor([source], facts, [`F${i + 1}`]),
      byAi: true,
    })),
  };
}
