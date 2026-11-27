"use client";
/**
 * The Research flows (documents, data URLs, papers) save their argument as well
 * as drafting a deck, and link the two (F-016).
 */
import type { Author } from "@/model/types";
import { applyArgOp, emptyArgument, makeArgOp, type ArgFields, type ArgPoint, type Argument, type ArgumentOrigin, type ArgOp } from "@/model/argument";
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
  reason: string;
}): Promise<Argument> {
  let arg = emptyArgument(opts.tenantId, {}, opts.origin);
  const log: ArgOp[] = [
    makeArgOp({ kind: "arg.set", patch: opts.fields }, opts.me, opts.reason),
    ...opts.points.map((point) => makeArgOp({ kind: "point.put", point }, point.byAi && opts.ai ? opts.ai : opts.me, opts.reason)),
  ];
  for (const op of log) arg = applyArgOp(arg, op);
  await getArguments().save(arg, log, true);
  return arg;
}

/** The argument behind a deck drafted from figures (documents or a data URL). */
export function pointsFromFigures(src: DataSource, arg: FiguresArgument): { fields: Partial<ArgFields>; points: ArgPoint[] } {
  return {
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
      evidence: [{ id: `ev-${i}`, kind: "figure" as const, text: pt.evidence, source: `${src.name}${pt.rows.length ? `: ${pt.rows.join(", ")}` : ""}` }],
      byAi: true,
    })),
  };
}
