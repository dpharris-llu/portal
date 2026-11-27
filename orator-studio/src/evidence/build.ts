/**
 * The deck from research evidence (F-015): the thesis; one slide per point with
 * its conclusion, the cited evidence with reference numbers, and the strongest
 * supporting quote; what the evidence doesn't tell us; the recommendation;
 * next steps; references. One backup slide per paper.
 */
import type { Block, Paper, Slide } from "@/model/types";
import { newId } from "@/model/ids";
import { newSlide } from "@/model/factory";
import type { DraftDeck } from "@/documents/build";
import { formatCitation, shortCitation, type CheckedSynthesis } from "@/ai/evidence";

export interface EvidenceArgument {
  thesis?: string;
  points: CheckedSynthesis["points"];
  recommendation?: CheckedSynthesis["recommendation"];
  nextSteps: string[];
  openQuestions: string[];
  via: string;
}

const CONTEXT_LABEL = "Context from Claude's general knowledge (not from the papers, and not checked):";

/** Claude's prose cites claim tags ("[P1-C1]"); the slide shows reference numbers once, at the end. */
const untag = (t: string) => t.replace(/\s*\[(?:P\d+-C\d+[,;\s]*)+\]/g, "").replace(/\s*\bP\d+-C\d+\b/g, "").replace(/\s+([.,;])/g, "$1").trim();

export function draftFromEvidence(papers: Paper[], arg: EvidenceArgument): DraftDeck {
  const now = new Date().toISOString();
  const ai = { provenance: { author: { kind: "ai" as const, id: "claude", via: arg.via }, at: now, source: `${papers.length} papers` } };
  const claim = (id: string) => {
    for (const p of papers) {
      const c = p.claims.find((x) => x.id === id);
      if (c) return { p, c };
    }
    return null;
  };
  const ref = (p: Paper) => Number(p.id.replace(/\D/g, ""));
  const refs = (ids: string[]) => {
    const nums = [...new Set(ids.map((id) => claim(id)?.p).filter((p): p is Paper => Boolean(p)).map(ref))].sort((a, b) => a - b);
    return nums.length ? ` [${nums.join(", ")}]` : "";
  };
  const citedNotes = (ids: string[]) =>
    ids
      .map(claim)
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map(({ p, c }) => `[${ref(p)}] ${shortCitation(p.citation)}, p. ${c.page} (${c.kind}): "${c.quote}"`);

  const title = newSlide(arg.thesis?.replace(/[.]$/, "") || "What the research shows", "persuade", [
    { id: newId("b"), type: "bullets", items: [`Based on ${papers.length} ${papers.length === 1 ? "study" : "studies"}:`, ...papers.map((p) => `[${ref(p)}] ${shortCitation(p.citation)}${p.design ? `, ${p.design}` : ""}`)] } as Block,
  ]);
  title.importNotes = [arg.thesis ? "Thesis written by Claude from the confirmed findings. Make it yours before presenting." : "Write the one thing this deck should say."];

  const pointSlides: Slide[] = arg.points.map((pt) => {
    const findings = pt.cites.map(claim).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const best = findings.find((x) => x.c.kind === "finding") ?? findings[0];
    const blocks: Block[] = [{ id: newId("b"), type: "text", text: `${untag(pt.evidence)}${refs(pt.cites)}`, ...ai } as Block];
    if (best) blocks.push({ id: newId("b"), type: "quote", text: best.c.quote, attribution: `${shortCitation(best.p.citation)}, p. ${best.c.page}` } as Block);
    const slide = newSlide(pt.conclusion.replace(/[.]$/, ""), "persuade", blocks);
    slide.notes = [
      `Why it matters: ${untag(pt.soWhat)}`,
      `Evidence: ${pt.agreement}; ${pt.strength} strength. ${pt.strengthReason}`,
      ...(pt.gaps ? [`Not covered: ${pt.gaps}`] : []),
      ...(pt.context && !pt.contextProblems.length ? ["", CONTEXT_LABEL, pt.context] : []),
      "",
      "Cited findings:",
      ...citedNotes(pt.cites),
    ].join("\n");
    slide.importNotes = [
      "Conclusion and evidence written by Claude from the findings you confirmed; every quote and number was checked against the papers. Make the conclusion your own.",
      ...(pt.strength === "weak" ? ["Claude rated the evidence for this point as weak."] : []),
      ...(pt.context && !pt.contextProblems.length ? ["The notes include Claude's general knowledge, labeled. Check it before putting it on a slide."] : []),
    ];
    return slide;
  });

  const closing: Slide[] = [];
  if (arg.openQuestions.length) {
    const slide = newSlide("What the evidence doesn't tell us", "inform", [{ id: newId("b"), type: "bullets", items: arg.openQuestions, ...ai } as Block]);
    slide.importNotes = ["Open questions suggested by Claude. Keep the ones your audience will ask."];
    closing.push(slide);
  }
  if (arg.recommendation) {
    const r = arg.recommendation;
    const slide = newSlide(r.action.replace(/[.]$/, ""), "decide", [
      { id: newId("b"), type: "bullets", items: [`Why: ${untag(r.rationale)}${refs(r.cites)}`, `Tradeoffs: ${r.tradeoffs}`], ...ai } as Block,
    ]);
    slide.notes = ["Cited findings:", ...citedNotes(r.cites)].join("\n");
    slide.importNotes = ["Recommendation from Claude, not a decision. Keep, change or remove it."];
    closing.push(slide);
  }
  if (arg.nextSteps.length) {
    const slide = newSlide("Next steps", "decide", [{ id: newId("b"), type: "bullets", items: arg.nextSteps, ...ai } as Block]);
    slide.importNotes = ["Next steps suggested by Claude. Keep, edit or remove each one."];
    closing.push(slide);
  }
  const references = newSlide("References", "inform", [
    { id: newId("b"), type: "bullets", items: papers.map((p) => `[${ref(p)}] ${formatCitation(p.citation)}`) } as Block,
  ]);
  references.notes = "Citations as read from each paper's first pages; check them against the journal before publishing.";

  const backup = papers.map((p) => {
    const items = [
      ...(p.design ? [`Design: ${p.design}`] : []),
      ...(p.sample ? [`Sample: ${p.sample}`] : []),
      ...p.claims.filter((c) => c.kind === "finding").map((c) => `${c.text} (p. ${c.page})`),
      ...p.claims.filter((c) => c.kind === "limitation").map((c) => `Limitation: ${c.text} (p. ${c.page})`),
    ];
    const slide = newSlide(`[${ref(p)}] ${shortCitation(p.citation)}`, "inform", [{ id: newId("b"), type: "bullets", items } as Block]);
    slide.notes = [formatCitation(p.citation), "", ...p.claims.map((c) => `p. ${c.page}: "${c.quote}"`)].join("\n");
    return slide;
  });
  return { narrative: [title, ...pointSlides, ...closing, references], backup };
}
