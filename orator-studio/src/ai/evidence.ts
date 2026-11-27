/**
 * Claude's two jobs with research papers (F-015), shared by the page and the
 * server routes:
 *  1. Read one paper: citation, design, sample, findings and limitations, each
 *     with a quote copied from a page. The app checks each quote is on that
 *     page and each number in a finding is printed there.
 *  2. Synthesize confirmed findings across papers for the deck's purpose: an
 *     argument where every point cites findings and every number comes from
 *     the findings it cites. General knowledge stays labeled.
 */
import { z } from "zod";
import { normalize, numbersInText, numbersNotOn, quoteFound, type PaperPage } from "@/evidence/text";

// ---- 1. Reading a paper ----

const Quoted = z.object({ text: z.string(), quote: z.string(), page: z.number().int() });
export const PaperReading = z.object({
  citation: z.object({ title: z.string(), authors: z.array(z.string()), year: z.string().optional(), venue: z.string().optional(), doi: z.string().optional() }),
  design: z.string(),
  sample: z.string(),
  findings: z.array(Quoted),
  limitations: z.array(Quoted),
});
export type PaperReading = z.infer<typeof PaperReading>;

export const ReadRequest = z.object({ fileName: z.string().max(300), text: z.string().max(200_000) });

export function readPaperPrompt(fileName: string, text: string, context?: string): string {
  return [
    "You are reading one research paper so a presenter can cite it accurately in a deck. The paper's text follows, with [[Page N]] markers where each PDF page starts. The reference list has been left out.",
    `File: ${fileName}`,
    ...(context ? [context] : []),
    "",
    "Extract:",
    "- citation: title, authors (as printed, in order; at most 6, then \"et al.\" as the last entry), year, journal or venue, and DOI if printed.",
    "- design: the study design in a few words (for example: randomized controlled trial; retrospective cohort; systematic review and meta-analysis; qualitative interview study).",
    "- sample: who and how many, in a short phrase, as reported.",
    "- findings: up to 8 of the paper's main results, most important first, including effect sizes, confidence intervals and p-values where reported.",
    "- limitations: up to 4 limitations the authors themselves state.",
    "",
    "For every finding and limitation:",
    "- text: one plain-language sentence. Any number in it must be printed on the cited page.",
    "- quote: words copied EXACTLY from the cited page, 8 to 40 words, contiguous. You may use \"...\" to skip words within the same page. Never paraphrase inside a quote.",
    "- page: the N of the [[Page N]] marker the quote is under.",
    "Use only this paper. Add no outside knowledge, and do not interpret beyond what the authors report.",
    "",
    'Reply with only JSON: {"citation":{"title":"...","authors":["..."],"year":"...","venue":"...","doi":"..."},"design":"...","sample":"...","findings":[{"text":"...","quote":"...","page":3}],"limitations":[{"text":"...","quote":"...","page":9}]}',
    "",
    "PAPER TEXT:",
    text,
  ].join("\n");
}

export interface CheckedClaim {
  kind: "finding" | "limitation";
  text: string;
  quote: string;
  page: number;
  verified: boolean;
  problems: string[];
}

export interface CheckedReading {
  citation: PaperReading["citation"];
  design: string;
  sample: string;
  claims: CheckedClaim[];
  /** Citation details that couldn't be found on the first pages (shown, not blocking). */
  citationNotes: string[];
}

export function verifyReading(r: PaperReading, pages: PaperPage[]): CheckedReading {
  const textOf = (n: number) => pages.find((p) => p.page === n)?.text ?? "";
  const check = (kind: CheckedClaim["kind"], q: z.infer<typeof Quoted>): CheckedClaim => {
    const problems: string[] = [];
    let page = q.page;
    if (!textOf(page)) problems.push(`page ${page} is not in the paper`);
    else if (!quoteFound(q.quote, textOf(page))) {
      // A quote on the next or previous page is a page-number slip: accept it with the right page.
      const near = [page - 1, page + 1].find((n) => textOf(n) && quoteFound(q.quote, textOf(n)));
      if (near) page = near;
      else problems.push(`the quote is not on page ${page}`);
    }
    const missing = numbersNotOn(q.text, [textOf(page)]);
    if (missing.length) problems.push(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not printed on page ${page}`);
    return { kind, text: q.text, quote: q.quote, page, verified: problems.length === 0, problems };
  };
  const front = normalize(pages.slice(0, 2).map((p) => p.text).join(" "));
  const citationNotes: string[] = [];
  if (r.citation.doi && !front.includes(normalize(r.citation.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")))) citationNotes.push("DOI not found on the first pages");
  const missingAuthors = r.citation.authors.filter((a) => !/et al/i.test(a)).filter((a) => {
    const surname = a.trim().split(/\s+/).find((w) => w.length > 2 && w === w.replace(/\./g, "")) ?? a;
    return !front.includes(normalize(surname));
  });
  if (missingAuthors.length) citationNotes.push(`author${missingAuthors.length > 1 ? "s" : ""} not found on the first pages: ${missingAuthors.join(", ")}`);
  if (!front.includes(normalize(r.citation.title).slice(0, 40))) citationNotes.push("title not found on the first pages");
  return {
    citation: r.citation,
    design: r.design,
    sample: r.sample,
    claims: [...r.findings.map((q) => check("finding", q)), ...r.limitations.map((q) => check("limitation", q))],
    citationNotes,
  };
}

// ---- 2. Synthesizing across papers ----

export const SynthesisRequest = z.object({
  goal: z.string().max(1000).default(""),
  papers: z
    .array(
      z.object({
        ref: z.number().int(),
        citation: z.string().max(600),
        design: z.string().max(300).optional(),
        sample: z.string().max(300).optional(),
        claims: z.array(z.object({ id: z.string().max(20), kind: z.enum(["finding", "limitation"]), text: z.string().max(800), quote: z.string().max(1200), page: z.number().int() })).max(20),
      }),
    )
    .min(1)
    .max(25),
});
export type SynthesisRequest = z.infer<typeof SynthesisRequest>;

const External = z.object({ text: z.string(), about: z.string() });
export const Synthesis = z.object({
  thesis: z.string(),
  points: z.array(
    z.object({
      conclusion: z.string(),
      evidence: z.string(),
      cites: z.array(z.string()),
      agreement: z.enum(["consistent", "mixed", "single study"]),
      strength: z.enum(["strong", "moderate", "weak"]),
      strengthReason: z.string(),
      soWhat: z.string(),
      gaps: z.string().optional(),
      context: z.string().optional(),
      externalNumbers: z.array(External).optional(),
    }),
  ),
  recommendation: z.object({ action: z.string(), rationale: z.string(), tradeoffs: z.string(), cites: z.array(z.string()) }),
  nextSteps: z.array(z.string()),
  openQuestions: z.array(z.string()),
});
export type Synthesis = z.infer<typeof Synthesis>;

export function synthesisPrompt(req: SynthesisRequest): string {
  return [
    "You are an analyst helping a presenter build a short deck that argues a point from research evidence. Your job is ANALYSIS across the studies, not a summary of each: what the evidence as a whole supports for the deck's purpose, where studies agree or conflict and why that might be (design, population, measures), how strong the evidence is, what is missing, and what the presenter should do.",
    "",
    `What the deck is for: ${req.goal.trim() || "not stated; infer the most useful purpose from the evidence and say it in the thesis"}`,
    "",
    "The presenter confirmed these findings and limitations from these papers (ref is the reference number; each claim has an id):",
    JSON.stringify(req.papers),
    "",
    "Write:",
    "- thesis: one sentence that answers the purpose, as strongly as the evidence allows and no more.",
    "- points: 3 to 5 steps of the argument, most important first. For each:",
    "  conclusion: a headline stating what the evidence MEANS. Under 14 words.",
    "  evidence: one or two sentences citing the specific findings. Compare across studies where you can.",
    "  cites: the ids of every claim the point rests on (for example \"P1-C2\"). Include limitations that weaken it.",
    "  agreement: consistent, mixed, or single study. strength: strong, moderate or weak, with strengthReason (designs, sample sizes, consistency, stated limitations).",
    "  soWhat: why it matters for the purpose.",
    "  gaps (optional): what the evidence doesn't cover.",
    "  context (optional): relevant general knowledge you bring (for example, how a design is usually weighed, or common practice). It is shown labeled as your general knowledge, not the papers.",
    "- recommendation: action (a headline), rationale, tradeoffs, cites.",
    "- nextSteps: 2 to 4 concrete steps. openQuestions: 1 to 3 questions the evidence leaves open.",
    "",
    "Rules:",
    "- Every number in thesis, conclusion, evidence or the recommendation must appear in the text or quote of a claim it cites (the thesis may use any confirmed claim). Do not compute new numbers.",
    "- Numbers from your general knowledge may appear ONLY in context, each listed in externalNumbers.",
    "- Never state a cause or effect more strongly than the cited studies' designs allow.",
    "- Plain language, short sentences. Address the presenter as you.",
    "",
    'Reply with only JSON: {"thesis":"...","points":[{"conclusion":"...","evidence":"...","cites":["P1-C1"],"agreement":"consistent","strength":"moderate","strengthReason":"...","soWhat":"...","gaps":"...","context":"...","externalNumbers":[]}],"recommendation":{"action":"...","rationale":"...","tradeoffs":"...","cites":["P1-C1"]},"nextSteps":["..."],"openQuestions":["..."]}',
  ].join("\n");
}

type Claim = SynthesisRequest["papers"][number]["claims"][number];

export interface CheckedSynthesis {
  thesis: { text: string; verified: boolean; problems: string[] };
  points: (Synthesis["points"][number] & { verified: boolean; problems: string[]; contextProblems: string[] })[];
  recommendation: Synthesis["recommendation"] & { verified: boolean; problems: string[] };
  nextSteps: { text: string; verified: boolean; problems: string[] }[];
  openQuestions: string[];
}

/** Claim tags such as [P3-C1] are references, not numbers. */
const withoutTags = (s: string) => s.replace(/\[?\bP\d+-C\d+\b\]?/g, " ");

export function verifySynthesis(req: SynthesisRequest, s: Synthesis): CheckedSynthesis {
  const claims = new Map<string, Claim>(req.papers.flatMap((p) => p.claims.map((c) => [c.id, c] as const)));
  const paperOf = (id: string) => req.papers.find((p) => p.claims.some((c) => c.id === id));
  // A cited finding's numbers, plus its paper's design and sample ("412 adults").
  const textOf = (ids: string[]) =>
    ids
      .map((id) => ({ c: claims.get(id), p: paperOf(id) }))
      .filter((x): x is { c: Claim; p: SynthesisRequest["papers"][number] } => Boolean(x.c && x.p))
      .map(({ c, p }) => `${c.text} ${c.quote} ${p.sample ?? ""} ${p.design ?? ""}`);
  const allText = textOf([...claims.keys()]);

  const check = (raw: string, cites: string[] | null) => {
    const prose = withoutTags(raw);
    const problems: string[] = [];
    if (cites) {
      const unknown = cites.filter((id) => !claims.has(id));
      if (unknown.length) problems.push(`cites ${unknown.join(", ")}, which ${unknown.length === 1 ? "is" : "are"} not a confirmed finding`);
      if (!cites.length) problems.push("cites no findings");
    }
    const missing = numbersNotOn(prose, cites ? textOf(cites) : allText);
    if (missing.length) problems.push(`${missing.join(", ")} ${missing.length === 1 ? "does" : "do"} not appear in the cited findings`);
    return problems;
  };

  const thesisProblems = check(s.thesis, null);
  const points = s.points.map((pt) => {
    const problems = check(`${pt.conclusion} ${pt.evidence} ${pt.soWhat}`, pt.cites);
    const declared = new Set((pt.externalNumbers ?? []).flatMap((x) => numbersInText(x.text)));
    const contextProblems = numbersInText(pt.context ?? "")
      .filter((n) => !declared.has(n) && numbersNotOn(n, allText).length > 0)
      .map((n) => `${n} in the context is not listed as general knowledge`);
    return { ...pt, verified: problems.length === 0, problems, contextProblems };
  });
  const recProblems = check(`${s.recommendation.action} ${s.recommendation.rationale} ${s.recommendation.tradeoffs}`, s.recommendation.cites);
  const nextSteps = s.nextSteps.map((text) => {
    const missing = numbersNotOn(withoutTags(text), allText);
    const problems = missing.length ? [`${missing.join(", ")} not from the confirmed findings`] : [];
    return { text, verified: problems.length === 0, problems };
  });
  return {
    thesis: { text: s.thesis, verified: thesisProblems.length === 0, problems: thesisProblems },
    points,
    recommendation: { ...s.recommendation, verified: recProblems.length === 0, problems: recProblems },
    nextSteps,
    openQuestions: s.openQuestions,
  };
}

/** "Smith J, Lee K, et al. (2024). Title. Journal. doi:..." */
export function formatCitation(c: PaperReading["citation"]): string {
  const authors = c.authors.length ? c.authors.join(", ") : "Unknown authors";
  return `${authors}${c.year ? ` (${c.year})` : ""}. ${c.title.replace(/\.$/, "")}.${c.venue ? ` ${c.venue}.` : ""}${c.doi ? ` doi:${c.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : ""}`;
}

/** An author's family name from "Maria Delgado", "Delgado M", "Delgado, Maria" or "M. Delgado". */
export function surname(author: string): string {
  const a = author.trim();
  if (a.includes(",")) return a.split(",")[0].trim();
  const words = a.split(/\s+/);
  const initials = (w: string) => /^([A-Z]\.?){1,3}$/.test(w);
  if (words.length > 1 && initials(words[words.length - 1])) return words.slice(0, -1).join(" ");
  return words[words.length - 1] || a;
}

/** "Delgado et al., 2025" */
export function shortCitation(c: PaperReading["citation"]): string {
  const first = c.authors[0] ? surname(c.authors[0]) : "Unknown";
  const more = c.authors.length > 1 ? (c.authors.length === 2 ? ` and ${surname(c.authors[1])}` : " et al.") : "";
  return `${first}${more}${c.year ? `, ${c.year}` : ""}`;
}
