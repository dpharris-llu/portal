"use client";
/**
 * Start from research papers (F-015): read PDFs in the browser, have Claude
 * read each paper for quoted findings (every quote and number checked against
 * its page), confirm the findings, then have Claude argue across the papers
 * for the deck's purpose, citing confirmed findings only.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { paperForClaude, paperPages, type PaperPage } from "@/evidence/text";
import { draftFromEvidence } from "@/evidence/build";
import {
  formatCitation,
  PaperReading,
  readPaperPrompt,
  shortCitation,
  Synthesis,
  synthesisPrompt,
  verifyReading,
  verifySynthesis,
  type CheckedReading,
  type CheckedSynthesis,
  type SynthesisRequest,
} from "@/ai/evidence";
import { askClaudeFor, claudeAvailable, ClaudeError, type Transport } from "@/ai/analysis-client";
import { applyOp, makeOp, type OpBody, type Operation } from "@/model/ops";
import { emptyDeck } from "@/model/factory";
import { newId } from "@/model/ids";
import type { Author, Paper } from "@/model/types";
import { currentAuthorId, getRepo } from "@/lib/repo";
import { putAsset } from "@/lib/assets";
import { knowledge } from "@/knowledge/client";

interface PaperState {
  id: string; // "P1"
  fileName: string;
  file: File;
  status: "extracting" | "ready" | "reading" | "read" | "error";
  error?: string;
  pages?: PaperPage[];
  truncated?: boolean;
  reading?: CheckedReading;
  via?: Transport;
  /** Indexes of confirmed claims in reading.claims. */
  confirmed: Set<number>;
}

const MAX_FILE_MB = 60;

export default function EvidencePage() {
  const router = useRouter();
  const [papers, setPapers] = useState<PaperState[]>([]);
  const [transport, setTransport] = useState<Transport | null | undefined>(undefined);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [synth, setSynth] = useState<
    { status: "idle" } | { status: "thinking"; chars: number } | { status: "error"; message: string } | { status: "done"; via: Transport; result: CheckedSynthesis; key: string }
  >({ status: "idle" });
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const stop = useRef<AbortController | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    claudeAvailable().then(setTransport);
  }, []);

  const update = (id: string, patch: Partial<PaperState>) => setPapers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function addFiles(files: FileList) {
    setError("");
    const { readPdf, NoTextError } = await import("@/documents/pdf");
    for (const f of [...files]) {
      const id = `P${++counter.current}`;
      const too = f.size > MAX_FILE_MB * 1024 * 1024;
      setPapers((ps) => [...ps, { id, fileName: f.name, file: f, status: too ? "error" : "extracting", error: too ? `Over ${MAX_FILE_MB} MB.` : undefined, confirmed: new Set() }]);
      if (too) continue;
      try {
        const pages = paperPages(await readPdf(new Uint8Array(await f.arrayBuffer())));
        update(id, { status: "ready", pages });
      } catch (e) {
        update(id, { status: "error", error: e instanceof NoTextError ? e.message : "This file could not be read as a PDF." });
      }
    }
  }

  async function readWithClaude(p: PaperState) {
    if (!p.pages) return;
    const { text, truncated } = paperForClaude(p.pages);
    update(p.id, { status: "reading", truncated, error: undefined });
    try {
      const { value, via } = await askClaudeFor({
        prompt: readPaperPrompt(p.fileName, text),
        parse: (raw) => {
          const r = PaperReading.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/evidence/read",
        payload: { fileName: p.fileName, text },
        key: "value",
      });
      update(p.id, { status: "read", reading: verifyReading(value, p.pages), via, confirmed: new Set() });
    } catch (e) {
      update(p.id, { status: "ready", error: e instanceof ClaudeError ? e.message : "Claude couldn't read this paper." });
    }
  }

  async function readAll() {
    // One paper at a time: each fits Claude's request size, and progress is visible.
    for (const p of papers.filter((x) => x.status === "ready")) await readWithClaude(p);
  }

  const claimId = (p: PaperState, k: number) => `${p.id}-C${k + 1}`;
  const read = papers.filter((p) => p.status === "read" && p.reading);
  const confirmedCount = read.reduce((n, p) => n + p.confirmed.size, 0);
  const request: SynthesisRequest | null = confirmedCount
    ? {
        goal,
        papers: read
          .filter((p) => p.confirmed.size)
          .map((p) => ({
            ref: Number(p.id.slice(1)),
            citation: formatCitation(p.reading!.citation),
            design: p.reading!.design,
            sample: p.reading!.sample,
            claims: p.reading!.claims
              .map((c, k) => ({ c, k }))
              .filter(({ k }) => p.confirmed.has(k))
              .map(({ c, k }) => ({ id: claimId(p, k), kind: c.kind, text: c.text, quote: c.quote, page: c.page })),
          })),
      }
    : null;
  const key = request ? JSON.stringify(request) : "";
  const fresh = synth.status === "done" && synth.key === key;

  async function synthesize() {
    if (!request) return;
    stop.current?.abort();
    const ctl = new AbortController();
    stop.current = ctl;
    setSynth({ status: "thinking", chars: 0 });
    try {
      const { value, via } = await askClaudeFor({
        prompt: synthesisPrompt(request),
        parse: (raw) => {
          const r = Synthesis.safeParse(raw);
          return r.success ? r.data : null;
        },
        route: "/api/evidence/synthesize",
        payload: request,
        key: "value",
        signal: ctl.signal,
        onProgress: (chars) => setSynth({ status: "thinking", chars }),
      });
      setSynth({ status: "done", via, result: verifySynthesis(request, value), key });
      setDropped(new Set());
    } catch (e) {
      const err = e instanceof ClaudeError ? e : new ClaudeError("Claude couldn't be reached. Try again.", "upstream_error");
      setSynth(err.code === "cancelled" ? { status: "idle" } : { status: "error", message: err.message });
    }
  }

  const toggle = (id: string, keep: boolean) =>
    setDropped((d) => {
      const n = new Set(d);
      if (keep) n.delete(id);
      else n.add(id);
      return n;
    });

  async function createDeck() {
    if (!(fresh && synth.status === "done")) return;
    setBusy(true);
    try {
      const repo = getRepo();
      const me: Author = { kind: "human", id: await currentAuthorId() };
      const now = new Date().toISOString();
      const used: Paper[] = [];
      for (const p of read.filter((x) => x.confirmed.size)) {
        const pdfAssetId = newId("pdf");
        await putAsset(pdfAssetId, p.file).catch(() => undefined);
        used.push({
          id: p.id,
          fileName: p.fileName,
          pages: p.pages?.length ?? 0,
          citation: p.reading!.citation,
          design: p.reading!.design,
          sample: p.reading!.sample,
          claims: p.reading!.claims
            .map((c, k) => ({ c, k }))
            .filter(({ k }) => p.confirmed.has(k))
            .map(({ c, k }) => ({ id: claimId(p, k), kind: c.kind, text: c.text, quote: c.quote, page: c.page, confirmedAt: now })),
          pdfAssetId,
          readAt: now,
          via: p.via ?? "claude",
        });
      }
      const r = synth.result;
      const keptPoints = r.points.filter((pt, i) => pt.verified && !dropped.has(`pt-${i}`));
      const pointIds = keptPoints.map(() => newId("pt"));
      const rec = r.recommendation.verified && !dropped.has("rec") ? r.recommendation : undefined;
      const tenantId = await repo.tenantId();
      // The papers and their checked findings go into the Body of Knowledge (F-130).
      const k = knowledge();
      for (const paper of used) {
        await k.keepSource(
          { kind: "paper", origin: "yours", title: paper.citation.title, citation: formatCitation(paper.citation), short: shortCitation(paper.citation), year: paper.citation.year || null, design: paper.design || null, sample: paper.sample || null, ids: paper.citation.doi ? { doi: paper.citation.doi } : {} },
          paper.claims.map((c) => ({ kind: c.kind, text: c.text, quote: c.quote, page: c.page, checked: true })),
        );
      }
      const draft = draftFromEvidence(used, {
        pointIds,
        thesis: r.thesis.verified ? r.thesis.text : undefined,
        points: keptPoints,
        recommendation: rec,
        nextSteps: r.nextSteps.filter((s, i) => s.verified && !dropped.has(`step-${i}`)).map((s) => s.text),
        openQuestions: r.openQuestions.filter((_, i) => !dropped.has(`q-${i}`)),
        via: synth.via,
      });
      const bodies: OpBody[] = [
        { kind: "deck.setMeta", patch: { title: r.thesis.verified ? r.thesis.text.replace(/[.]$/, "") : "What the research shows", goal, timeLimitMin: Math.max(5, draft.narrative.length * 2) } },
        ...used.map((paper) => ({ kind: "paper.put" as const, paper })),
        ...draft.narrative.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "narrative" as const, index })),
        ...draft.backup.map((slide, index) => ({ kind: "slide.insert" as const, slide, section: "backup" as const, index })),
      ];
      let deck = emptyDeck({}, tenantId);
      const log: Operation[] = bodies.map((b) => makeOp(b, me, "Created from research papers"));
      for (const op of log) deck = applyOp(deck, op);
      await repo.save(deck, log, true);
      router.push(`/decks/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const refLabel = (id: string) => {
    const p = read.find((x) => id.startsWith(x.id + "-"));
    if (!p) return id;
    const k = Number(id.split("-C")[1]) - 1;
    const c = p.reading!.claims[k];
    return `[${p.id.slice(1)}] ${shortCitation(p.reading!.citation)}${c ? `, p. ${c.page}` : ""}`;
  };

  return (
    <>
      <TopBar />
      <main className="wide stack">
        <h1 style={{ margin: 0 }}>Start from research papers</h1>
        <p className="muted" style={{ margin: 0 }}>
          Add the papers your presentation rests on. Claude reads each one and pulls out its findings and limitations, each with an exact quote and
          page; OratorStudio checks every quote and number against the paper. You confirm the findings, state what the deck is for, and Claude
          argues across the papers, citing only what you confirmed.
        </p>
        <label>
          PDF files
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        {transport === null && papers.length > 0 && (
          <p className="notice small">Reading papers needs Claude. Open this page in claude.ai to use your Claude account, or set ANTHROPIC_API_KEY on the server.</p>
        )}

        {papers.length > 0 && transport && (
          <div className="row">
            <button className="primary" onClick={readAll} disabled={!papers.some((p) => p.status === "ready") || papers.some((p) => p.status === "reading")}>
              Read {papers.filter((p) => p.status === "ready").length > 1 ? "all papers" : "the paper"} with Claude
            </button>
            <span className="small muted">
              Each paper&apos;s text goes to Claude{transport === "claude.ai" ? " on your Claude account" : " through this server's API key"}, one at a time; the reference list is left out.
            </span>
          </div>
        )}

        {papers.map((p) => (
          <section key={p.id} className="paper-card" aria-label={p.fileName}>
            <div className="row">
              <span className="ref-num">[{p.id.slice(1)}]</span>
              <strong style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{p.reading ? p.reading.citation.title : p.fileName}</strong>
              <span className="small muted" role="status">
                {p.status === "extracting" ? "Reading the PDF…" : p.status === "reading" ? "Claude is reading…" : p.status === "error" ? "" : `${p.pages?.length ?? 0} pages`}
              </span>
              {p.status === "ready" && transport && <button className="small" onClick={() => readWithClaude(p)}>Read with Claude</button>}
              <button className="ghost danger small" onClick={() => setPapers((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.fileName}`}>Remove</button>
            </div>
            {p.error && <p className="small error" role="alert">{p.error}</p>}
            {p.truncated && <p className="small notice">This paper is long, so only its first part was sent to Claude.</p>}
            {p.reading && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="small">{formatCitation(p.reading.citation)}</span>
                {p.reading.citationNotes.length > 0 && <span className="small warn-text">Check the citation: {p.reading.citationNotes.join("; ")}.</span>}
                <span className="small"><em>Design:</em> {p.reading.design} · <em>Sample:</em> {p.reading.sample}</span>
                <div className="row">
                  <button
                    className="small"
                    onClick={() => update(p.id, { confirmed: new Set(p.reading!.claims.map((c, k) => (c.verified ? k : -1)).filter((k) => k >= 0)) })}
                  >
                    Confirm all checked findings
                  </button>
                  <span className="small muted">{p.confirmed.size} of {p.reading.claims.length} confirmed</span>
                </div>
                <ul className="findings">
                  {p.reading.claims.map((c, k) => (
                    <li key={k} className={c.verified ? undefined : "unverified"}>
                      <label className="inline">
                        <input
                          type="checkbox"
                          disabled={!c.verified}
                          checked={p.confirmed.has(k)}
                          onChange={(e) => {
                            const next = new Set(p.confirmed);
                            if (e.target.checked) next.add(k);
                            else next.delete(k);
                            update(p.id, { confirmed: next });
                          }}
                          aria-label={`Confirm: ${c.text}`}
                        />
                        <span className="point">
                          <span>
                            <span className={`finding-kind ${c.kind === "limitation" ? "limit" : ""}`}>{c.kind}</span> {c.text}
                          </span>
                          <span className="quote-line">“{c.quote}” <span className="muted">p. {c.page}</span></span>
                          <span className={c.verified ? "verify ok" : "verify bad"}>{c.verified ? "Quote and numbers found on the page" : `Can't use: ${c.problems.join("; ")}`}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}

        {confirmedCount > 0 && (
          <section className="stack" aria-labelledby="synth-h">
            <h2 id="synth-h" style={{ margin: 0, fontSize: 18 }}>Analysis across the papers</h2>
            <label>
              What is this deck for?
              <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example: decide whether to fund a walking program for patients with diabetes" />
            </label>
            <div className="row">
              <button className="primary" onClick={synthesize} disabled={synth.status === "thinking" || !transport}>
                {synth.status === "done" ? "Ask Claude again" : "Ask Claude to analyze the evidence"}
              </button>
              {synth.status === "thinking" && <button onClick={() => stop.current?.abort()}>Stop</button>}
              <span className="small muted">Sends the purpose and the {confirmedCount} confirmed findings (with their quotes and citations), not the full papers.</span>
            </div>
            {synth.status === "thinking" && <p className="small" role="status">{synth.chars ? `Claude is writing (${synth.chars} characters)…` : "Claude is thinking. This can take a minute or two."}</p>}
            {synth.status === "error" && <p className="small error" role="alert">{synth.message}</p>}
            {synth.status === "done" && !fresh && <p className="small notice">The confirmed findings or purpose changed since Claude&apos;s analysis. Ask again to use it.</p>}
            {synth.status === "done" && fresh && (
              <>
                <div className="thesis">
                  <span className="finding-kind ai">Claude</span> <strong>{synth.result.thesis.text}</strong>
                  {!synth.result.thesis.verified && <span className="verify bad">Left out: {synth.result.thesis.problems.join("; ")}</span>}
                </div>
                <h3 className="sub-h">The analysis</h3>
                <ul className="findings">
                  {synth.result.points.map((pt, i) => (
                    <li key={i} className={pt.verified ? undefined : "unverified"}>
                      <label className="inline">
                        <input type="checkbox" disabled={!pt.verified} checked={pt.verified && !dropped.has(`pt-${i}`)} onChange={(e) => toggle(`pt-${i}`, e.target.checked)} aria-label={`Use: ${pt.conclusion}`} />
                        <span className="point">
                          <span>
                            <span className={`confidence ${pt.strength === "strong" ? "high" : pt.strength === "moderate" ? "medium" : "low"}`}>{pt.strength} evidence</span>{" "}
                            <span className="small muted">{pt.agreement}</span> <strong>{pt.conclusion}</strong>
                          </span>
                          <span>{pt.evidence}</span>
                          <span className="cites">{pt.cites.map((id) => <span key={id} className="cite">{refLabel(id)}</span>)}</span>
                          <span><em>Why it matters:</em> {pt.soWhat}</span>
                          <span className="small muted">Strength: {pt.strengthReason}</span>
                          {pt.gaps && <span><em>Not covered:</em> {pt.gaps}</span>}
                          {pt.context && !pt.contextProblems.length && <span className="context-note"><strong>Claude&apos;s general knowledge, not the papers (not checked):</strong> {pt.context}</span>}
                          {pt.contextProblems.length > 0 && <span className="verify bad">Context left out: {pt.contextProblems.join("; ")}</span>}
                          <span className={pt.verified ? "verify ok" : "verify bad"}>{pt.verified ? "Citations and numbers checked against your confirmed findings" : `Left out: ${pt.problems.join("; ")}`}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {synth.result.openQuestions.length > 0 && (
                  <>
                    <h3 className="sub-h">What the evidence doesn&apos;t tell us</h3>
                    <ul className="findings">
                      {synth.result.openQuestions.map((q, i) => (
                        <li key={i}>
                          <label className="inline">
                            <input type="checkbox" checked={!dropped.has(`q-${i}`)} onChange={(e) => toggle(`q-${i}`, e.target.checked)} />
                            <span>{q}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <h3 className="sub-h">Recommendation</h3>
                <ul className="findings">
                  <li className={synth.result.recommendation.verified ? undefined : "unverified"}>
                    <label className="inline">
                      <input type="checkbox" disabled={!synth.result.recommendation.verified} checked={synth.result.recommendation.verified && !dropped.has("rec")} onChange={(e) => toggle("rec", e.target.checked)} aria-label="Use the recommendation" />
                      <span className="point">
                        <strong>{synth.result.recommendation.action}</strong>
                        <span><em>Why:</em> {synth.result.recommendation.rationale}</span>
                        <span><em>Tradeoffs:</em> {synth.result.recommendation.tradeoffs}</span>
                        {!synth.result.recommendation.verified && <span className="verify bad">Left out: {synth.result.recommendation.problems.join("; ")}</span>}
                      </span>
                    </label>
                  </li>
                </ul>
                {synth.result.nextSteps.length > 0 && (
                  <>
                    <h3 className="sub-h">Next steps</h3>
                    <ul className="findings">
                      {synth.result.nextSteps.map((st, i) => (
                        <li key={i} className={st.verified ? undefined : "unverified"}>
                          <label className="inline">
                            <input type="checkbox" disabled={!st.verified} checked={st.verified && !dropped.has(`step-${i}`)} onChange={(e) => toggle(`step-${i}`, e.target.checked)} />
                            <span>
                              {st.text}
                              {!st.verified && <span className="verify bad">Left out: {st.problems.join("; ")}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {confirmedCount > 0 && (
          <section className="row create-bar">
            <span className="small muted" style={{ flex: 1 }}>{fresh ? "The deck uses the points you kept, with references and quotes." : "Ask Claude to analyze the evidence first."}</span>
            <button className="primary" disabled={busy || !fresh} onClick={createDeck}>{busy ? "Creating…" : "Draft the deck"}</button>
          </section>
        )}
      </main>
    </>
  );
}
