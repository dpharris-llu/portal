/**
 * Probes (F-118): the author builds the case by asking successive questions of
 * their own workspace. Claude answers from the active facts only, citing them,
 * and proposes changes the author accepts or dismisses. Discarded sources and
 * facts are never sent. Every answer and proposal is checked here: citations
 * must be active facts, and every number must appear in the facts cited.
 */
import { z } from "zod";
import { activeFacts, activeSources, type Argument, type Probe, type ProbeAction } from "@/model/argument";
import { numbersNotOn } from "@/evidence/text";

const Ids = z.array(z.string().max(12)).max(30);
export const ProbeActionSchema = z.union([
  z.object({ kind: z.literal("add_point"), text: z.string().max(300), intent: z.enum(["inform", "persuade", "decide"]), detail: z.string().max(1200), factIds: Ids }),
  z.object({ kind: z.literal("link_evidence"), pointNumber: z.number().int(), factIds: Ids }),
  z.object({ kind: z.literal("set_thesis"), text: z.string().max(400) }),
  z.object({ kind: z.literal("add_open_question"), text: z.string().max(400) }),
  z.object({ kind: z.literal("discard_source"), sourceId: z.string().max(12), reason: z.string().max(300) }),
  z.object({ kind: z.literal("discard_fact"), factId: z.string().max(12), reason: z.string().max(300) }),
  z.object({ kind: z.literal("find_sources"), want: z.string().max(400) }),
]);
export const ProbeAnswer = z.object({
  answer: z.string().max(6000),
  cites: Ids,
  proposals: z.array(z.object({ why: z.string().max(600), action: ProbeActionSchema })).max(8),
});
export type ProbeAnswer = z.infer<typeof ProbeAnswer>;

/** What goes to Claude: the argument, the ACTIVE sources and facts, recent probes, and the question. Nothing discarded. */
export interface ProbeRequest {
  topic?: string;
  purpose: string;
  audience: string;
  thesis: string;
  points: { n: number; text: string; detail: string; factIds: string[]; unsupportedNote?: string }[];
  sources: { id: string; kind: string; short: string; citation: string; design?: string; sample?: string; year?: string; origin?: string; access?: string }[];
  facts: { id: string; sourceId: string; kind: string; text: string; quote?: string; page?: number; checked: boolean }[];
  history: { question: string; answer: string; outcome: string }[];
  question: string;
}

export const ProbeRequestSchema = z.object({
  topic: z.string().max(500).optional(),
  purpose: z.string().max(2000),
  audience: z.string().max(1000),
  thesis: z.string().max(1000),
  points: z.array(z.object({ n: z.number().int(), text: z.string().max(500), detail: z.string().max(2000), factIds: Ids, unsupportedNote: z.string().optional() })).max(40),
  sources: z.array(z.object({ id: z.string(), kind: z.string(), short: z.string().max(200), citation: z.string().max(800), design: z.string().max(300).optional(), sample: z.string().max(300).optional(), year: z.string().max(10).optional(), origin: z.string().max(20).optional(), access: z.string().max(30).optional() })).max(60),
  facts: z.array(z.object({ id: z.string(), sourceId: z.string(), kind: z.string(), text: z.string().max(1000), quote: z.string().max(1500).optional(), page: z.number().int().optional(), checked: z.boolean() })).max(300),
  history: z.array(z.object({ question: z.string().max(2000), answer: z.string().max(1500), outcome: z.string().max(600) })).max(8),
  question: z.string().min(1).max(2000),
});

const HISTORY = 6;

export function probeRequest(a: Argument, question: string): ProbeRequest {
  const facts = activeFacts(a);
  const live = new Set(facts.map((f) => f.id));
  return {
    topic: a.topic ?? "",
    purpose: a.purpose,
    audience: a.audience,
    thesis: a.thesis,
    points: a.points.map((p, i) => {
      const factIds = p.evidence.map((e) => e.factId).filter((x): x is string => Boolean(x && live.has(x)));
      const typed = p.evidence.filter((e) => !e.factId).length;
      return { n: i + 1, text: p.text, detail: p.detail, factIds, ...(typed ? { unsupportedNote: `${typed} evidence note(s) typed by the author, not from a source` } : {}) };
    }),
    sources: activeSources(a).map((s) => ({
      id: s.id,
      kind: s.kind,
      short: s.short,
      citation: s.citation,
      ...(s.design ? { design: s.design } : {}),
      ...(s.sample ? { sample: s.sample } : {}),
      ...(s.year ? { year: s.year } : {}),
      ...(s.origin ? { origin: s.origin } : {}),
      ...(s.access ? { access: s.access } : {}),
    })),
    facts: facts.map((f) => ({ id: f.id, sourceId: f.sourceId, kind: f.kind, text: f.text, ...(f.quote ? { quote: f.quote } : {}), ...(f.page ? { page: f.page } : {}), checked: f.checked })),
    history: (a.probes ?? []).slice(-HISTORY).map((p) => ({
      question: p.question,
      answer: p.answer.slice(0, 1500),
      outcome: p.proposals.map((x, i) => `${x.action.kind}: ${p.outcomes[i]}`).join("; ") || "no proposals",
    })),
    question,
  };
}

export function probePrompt(r: ProbeRequest): string {
  return [
    "You are helping an author build an argument from their own research workspace, one question at a time. Answer the author's latest question using ONLY the facts listed below.",
    "",
    `Purpose: ${r.purpose || "not stated"}`,
    `Audience: ${r.audience || "not stated"}`,
    `Topic: ${r.topic || "not stated"}`,
    `Message (the one sentence the presentation supports): ${r.thesis || "none yet"}`,
    "",
    "Points so far (numbered):",
    r.points.length ? r.points.map((p) => `${p.n}. ${p.text}${p.detail ? ` (${p.detail})` : ""}; evidence: ${p.factIds.join(", ") || "none"}${p.unsupportedNote ? `; ${p.unsupportedNote}` : ""}`).join("\n") : "(none)",
    "",
    "Sources (id, kind, short name, citation; 'author's own' were brought by the author, 'discovered' were found by search; 'abstract only' means only the abstract was read):",
    r.sources.length
      ? r.sources.map((s) => `${s.id} [${s.kind}${s.origin === "discovered" ? ", discovered" : s.origin === "yours" ? ", author's own" : ""}${s.access === "abstract" ? ", abstract only" : ""}${s.year ? `, ${s.year}` : ""}] ${s.short}: ${s.citation}${s.design ? `; design: ${s.design}` : ""}${s.sample ? `; sample: ${s.sample}` : ""}`).join("\n")
      : "(none)",
    "",
    "Facts (id, source, kind, text, quote, page; 'checked' means the app verified the quote against the source):",
    r.facts.length ? r.facts.map((f) => `${f.id} (${f.sourceId}, ${f.kind}${f.checked ? ", checked" : ", unchecked"}): ${f.text}${f.quote ? ` | quote: "${f.quote}"` : ""}${f.page ? ` | p. ${f.page}` : ""}`).join("\n") : "(none)",
    "",
    r.history.length ? ["Earlier in this session:", ...r.history.map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}\nOutcome: ${h.outcome}`)].join("\n") : "This is the first question.",
    "",
    `The author's question now: ${r.question}`,
    "",
    "Rules:",
    "- Use only the facts above. Cite each fact you rely on inline as [F3]. If the facts don't answer the question, say so plainly and say what kind of source would.",
    "- Every number you write must appear in a fact you cite. Never add numbers from outside the facts.",
    "- Sources of kind 'scripture' are Bible passages (version named): authoritative for faith, not research evidence. Never present them as research findings or as proof of a scientific claim; say they are Scripture when you use them. A TPT passage is a paraphrase entered by the author.",
    "- Be direct: answer first, then reasoning. Point out weak evidence (unchecked facts, single small studies, limitations) where it matters.",
    "- When asked for objections or weaknesses, give the strongest ones, say whether the facts answer each, and propose an open question for each one they don't answer.",
    "- Propose changes only where they help the argument: add_point (with the facts that support it), link_evidence (facts to an existing point, by its number), set_thesis, add_open_question.",
    "- When the facts can't answer something that matters, propose find_sources with a short plain description of the evidence to look for (the author can search scientific and government databases).",
    "- Propose discard_source or discard_fact ONLY when the author asks to drop, discard, remove or exclude something; use the id and put the author's reason in their words. Never propose discards on your own.",
    "- The author decides: proposals are suggestions they accept or dismiss.",
    "",
    'Reply with only JSON: {"answer":"...","cites":["F1"],"proposals":[{"why":"...","action":{"kind":"add_point","text":"...","intent":"persuade","detail":"...","factIds":["F1"]}}]}',
    'Other action shapes: {"kind":"link_evidence","pointNumber":2,"factIds":["F4"]}, {"kind":"set_thesis","text":"..."}, {"kind":"add_open_question","text":"..."}, {"kind":"discard_source","sourceId":"S2","reason":"..."}, {"kind":"discard_fact","factId":"F7","reason":"..."}, {"kind":"find_sources","want":"..."}',
  ].join("\n");
}

/** Tags and point numbers are references, not figures. */
const plain = (s: string) =>
  s
    .replace(/\[?\b[FS]\d+\b\]?/g, " ")
    .replace(/\b(points?|slides?|steps?|questions?)\s+\d+\b/gi, " ")
    .replace(/\b[QA]\d+\b/g, " "); // "Q1", "A2" from the history, case-sensitive so the word "a" is left alone

export interface CheckedProbe {
  answer: string;
  cites: string[];
  problems: string[];
  proposals: Probe["proposals"];
}

export function verifyProbe(a: Argument, r: ProbeAnswer): CheckedProbe {
  const facts = activeFacts(a);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const sources = new Map((a.sources ?? []).map((s) => [s.id, s]));
  const textOf = (ids: string[]) =>
    ids.flatMap((id) => {
      const f = byId.get(id);
      if (!f) return [];
      const s = sources.get(f.sourceId);
      return [`${f.text} ${f.quote ?? ""} ${s?.sample ?? ""} ${s?.design ?? ""} ${s?.year ?? ""} ${s?.short ?? ""}`];
    });
  const unknown = (ids: string[]) => ids.filter((id) => !byId.has(id));
  const numbers = (text: string, ids: string[]) => {
    const missing = numbersNotOn(plain(text), textOf(ids));
    return missing.length ? [`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not in the facts cited`] : [];
  };

  const inline = [...new Set((r.answer.match(/\bF\d+\b/g) ?? []))];
  const cites = [...new Set([...r.cites, ...inline])];
  const problems = [
    ...(unknown(cites).length ? [`cites ${unknown(cites).join(", ")}, which ${unknown(cites).length === 1 ? "is not an active fact" : "are not active facts"}`] : []),
    ...numbers(r.answer, cites.filter((id) => byId.has(id))),
  ];

  const proposals = r.proposals.map(({ why, action: raw }) => {
    const p: string[] = [];
    let action: ProbeAction;
    switch (raw.kind) {
      case "add_point":
        action = raw;
        if (!raw.factIds.length) p.push("cites no facts");
        if (unknown(raw.factIds).length) p.push(`uses ${unknown(raw.factIds).join(", ")}, not active facts`);
        p.push(...numbers(`${raw.text} ${raw.detail}`, raw.factIds));
        break;
      case "link_evidence": {
        const point = a.points[raw.pointNumber - 1];
        action = { kind: "link_evidence", pointId: point?.id ?? "", factIds: raw.factIds };
        if (!point) p.push(`there is no point ${raw.pointNumber}`);
        if (!raw.factIds.length) p.push("names no facts");
        if (unknown(raw.factIds).length) p.push(`uses ${unknown(raw.factIds).join(", ")}, not active facts`);
        break;
      }
      case "set_thesis":
      case "add_open_question":
        action = raw;
        p.push(...numbers(raw.text, facts.map((f) => f.id)));
        break;
      case "discard_source": {
        action = raw;
        const s = sources.get(raw.sourceId);
        if (!s || s.status !== "active") p.push(`${raw.sourceId} is not an active source`);
        break;
      }
      case "discard_fact":
        action = raw;
        if (!byId.has(raw.factId)) p.push(`${raw.factId} is not an active fact`);
        break;
      case "find_sources":
        action = raw;
        break;
    }
    return { action, why, problems: p };
  });
  return { answer: r.answer, cites: cites.filter((id) => byId.has(id)), problems, proposals };
}

/** A one-line description of a proposal, for the author. */
export function describeAction(a: Argument, x: ProbeAction): string {
  switch (x.kind) {
    case "add_point":
      return `Add a point: ${x.text}`;
    case "link_evidence": {
      const i = a.points.findIndex((p) => p.id === x.pointId);
      return `Add ${x.factIds.join(", ")} as evidence for point ${i + 1}${i >= 0 ? `: ${a.points[i].text}` : ""}`;
    }
    case "set_thesis":
      return `Change the thesis to: ${x.text}`;
    case "add_open_question":
      return `Add an open question: ${x.text}`;
    case "discard_source": {
      const s = (a.sources ?? []).find((y) => y.id === x.sourceId);
      return `Discard source ${x.sourceId}${s ? ` (${s.short})` : ""} and its facts`;
    }
    case "discard_fact":
      return `Discard fact ${x.factId}`;
    case "find_sources":
      return `Search for: ${x.want}`;
  }
}

/** Preset probes (F-021, F-022). They are ordinary probes: same checks, same proposals. */
export const SUMMARY_QUESTION =
  "Write a discovery summary of this workspace under four headings, each on its own line: Established, New, Contested, Unknown. Under each, give short statements citing facts like [F3]. In New, say where a newer source supersedes or updates an older one, especially one that is the author's own. In Contested, say where sources disagree. In Unknown, name what the facts don't settle; for each unknown that matters to the topic, propose find_sources, and propose add_open_question for the most important ones.";

export function challengeQuestion(message: string): string {
  return message.trim()
    ? `Challenge the message: "${message.trim()}". What in the facts cuts against it or limits it (populations, durations, effect sizes, study quality, contradicting results)? Be specific and fair, citing facts. Then name up to three kinds of evidence that could contradict it which this workspace may be missing, and propose find_sources for each. Propose add_open_question for any objection the facts don't answer.`
    : "There is no message yet. Challenge the direction the current points take: what in the facts cuts against them or limits them? Cite facts. Then name up to three kinds of contradicting evidence the workspace may be missing, and propose find_sources for each.";
}
