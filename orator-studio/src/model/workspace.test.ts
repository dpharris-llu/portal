import { describe, expect, it } from "vitest";
import { activeFacts, applyArgOp, discardBodies, emptyArgument, evidenceFromFact, invertArgOp, makeArgOp, newPoint, nextId, restoreBodies, type ArgOpBody, type Argument, type Fact, type WorkspaceSource } from "./argument";
import { probeRequest, probePrompt, verifyProbe } from "@/ai/probe";

const me = { kind: "human" as const, id: "u1" };
function run(arg: Argument, bodies: ArgOpBody[]) {
  const inverses: ArgOpBody[] = [];
  for (const b of bodies) {
    inverses.unshift(invertArgOp(arg, b));
    arg = applyArgOp(arg, makeArgOp(b, me));
  }
  return { arg, inverses };
}

const src = (id: string, short: string, extra: Partial<WorkspaceSource> = {}): WorkspaceSource => ({ id, kind: "paper", title: short, citation: `${short}. Fictional.`, short, status: "active", addedAt: "", ...extra });
const fact = (id: string, sourceId: string, text: string, extra: Partial<Fact> = {}): Fact => ({ id, sourceId, kind: "finding", text, checked: true, status: "active", ...extra });

function workspace(): Argument {
  let a = emptyArgument("t1", { purpose: "Decide whether to fund a walking program", thesis: "Coached walking lowers HbA1c." });
  const bodies: ArgOpBody[] = [
    { kind: "source.put", source: src("S1", "Delgado et al., 2025", { sample: "412 adults with type 2 diabetes" }) },
    { kind: "source.put", source: src("S2", "Whitfield and Haddad, 2025", { sample: "96 adults aged 70 and older" }) },
    { kind: "fact.put", fact: fact("F1", "S1", "HbA1c fell 0.5 points more with coached walking (95% CI 0.3 to 0.7).", { quote: "difference 0.5; 95% CI 0.3 to 0.7", page: 1 }) },
    { kind: "fact.put", fact: fact("F2", "S1", "Follow-up lasted only 12 weeks.", { kind: "limitation" }) },
    { kind: "fact.put", fact: fact("F3", "S2", "Pedometer feedback alone did not change HbA1c (p=0.48).") },
  ];
  a = run(a, bodies).arg;
  const p1 = newPoint("Coaching makes walking work");
  a = run(a, [{ kind: "point.put", point: { ...p1, evidence: [evidenceFromFact(a, a.facts![0]), evidenceFromFact(a, a.facts![2])] } }]).arg;
  return a;
}

describe("the Research workspace", () => {
  it("gives short ids and labels evidence with its source and page", () => {
    const a = workspace();
    expect(nextId("S", a.sources)).toBe("S3");
    expect(nextId("F", a.facts)).toBe("F4");
    expect(a.points[0].evidence[0]).toMatchObject({ factId: "F1", source: "Delgado et al., 2025, p. 1", quote: "difference 0.5; 95% CI 0.3 to 0.7" });
  });

  it("discards a source with its facts, takes them off points, and one undo brings it all back", () => {
    const a = workspace();
    const { arg: after, inverses } = run(a, discardBodies(a, { sourceId: "S2" }, "Too small to rely on"));
    expect(after.sources!.find((s) => s.id === "S2")).toMatchObject({ status: "discarded", discardReason: "Too small to rely on" });
    expect(after.facts!.find((f) => f.id === "F3")).toMatchObject({ status: "discarded" });
    expect(activeFacts(after).map((f) => f.id)).toEqual(["F1", "F2"]);
    expect(after.points[0].evidence.map((e) => e.factId)).toEqual(["F1"]);
    const undone = run(after, inverses).arg;
    expect({ ...undone, version: 0 }).toEqual({ ...a, version: 0 });
  });

  it("discards a single fact, and restores it without relinking", () => {
    const a = workspace();
    const after = run(a, discardBodies(a, { factId: "F1" }, "Superseded")).arg;
    expect(after.points[0].evidence.map((e) => e.factId)).toEqual(["F3"]);
    const back = run(after, restoreBodies(after, { factId: "F1" })).arg;
    expect(activeFacts(back).map((f) => f.id)).toEqual(["F1", "F2", "F3"]);
    expect(back.points[0].evidence.map((e) => e.factId)).toEqual(["F3"]);
  });
});

describe("probes", () => {
  it("never sends discarded sources or facts to Claude", () => {
    const a = workspace();
    const after = run(a, discardBodies(a, { sourceId: "S2" }, "Too small")).arg;
    const prompt = probePrompt(probeRequest(after, "What is the strongest objection?"));
    expect(prompt).not.toContain("Pedometer");
    expect(prompt).not.toContain("Whitfield");
    expect(prompt).not.toMatch(/^F3 \(/m);
    expect(prompt).not.toMatch(/^S2 \[/m);
    expect(prompt).toContain("F1 (S1, finding, checked)");
  });

  it("checks citations and numbers in the answer and proposals", () => {
    const a = workspace();
    const after = run(a, discardBodies(a, { factId: "F3" }, "Off topic")).arg;
    const v = verifyProbe(after, {
      answer: "Coached walking lowered HbA1c by 0.5 points [F1], unlike feedback alone [F3]. It saves $1,200 per patient [F1]. See point 1.",
      cites: ["F1"],
      proposals: [
        { why: "Strong support", action: { kind: "add_point", text: "Coaching cut HbA1c by 0.5 points in 412 adults", intent: "persuade", detail: "", factIds: ["F1"] } },
        { why: "Bad number", action: { kind: "add_point", text: "Coaching cuts costs by 30%", intent: "persuade", detail: "", factIds: ["F1"] } },
        { why: "Link it", action: { kind: "link_evidence", pointNumber: 1, factIds: ["F2"] } },
        { why: "No such point", action: { kind: "link_evidence", pointNumber: 7, factIds: ["F2"] } },
        { why: "Asked to drop", action: { kind: "discard_fact", factId: "F3", reason: "Off topic" } },
        { why: "Asked to drop", action: { kind: "discard_source", sourceId: "S1", reason: "Industry funded" } },
      ],
    });
    expect(v.problems).toEqual(["cites F3, which is not an active fact", "1200 is not in the facts cited"]);
    expect(v.cites).toEqual(["F1"]);
    expect(v.proposals.map((p) => p.problems)).toEqual([[], ["30 is not in the facts cited"], [], ["there is no point 7"], ["F3 is not an active fact"], []]);
    expect(v.proposals[2].action).toEqual({ kind: "link_evidence", pointId: after.points[0].id, factIds: ["F2"] });
  });

  it("carries earlier probes forward as context", () => {
    let a = workspace();
    a = run(a, [{ kind: "probe.put", probe: { id: "q1", question: "What supports point 1?", at: "", answer: "F1 does.", cites: ["F1"], problems: [], proposals: [{ why: "", action: { kind: "set_thesis", text: "X" }, problems: [] }], outcomes: ["dismissed"], via: "api" } }]).arg;
    const r = probeRequest(a, "And the weaknesses?");
    expect(r.history).toEqual([{ question: "What supports point 1?", answer: "F1 does.", outcome: "set_thesis: dismissed" }]);
  });
});

describe("discovery and messages", () => {
  it("tells Claude each source's origin, year and access, and the topic", async () => {
    let a = workspace();
    a = run(a, [
      { kind: "arg.set", patch: { topic: "Walking programs for type 2 diabetes" } },
      { kind: "source.put", source: { ...a.sources![0], origin: "discovered", year: "2025", access: "abstract" } },
      { kind: "source.put", source: { ...a.sources![1], origin: "yours", year: "2019" } },
    ]).arg;
    const prompt = probePrompt(probeRequest(a, "What's new?"));
    expect(prompt).toContain("Topic: Walking programs for type 2 diabetes");
    expect(prompt).toContain("S1 [paper, discovered, abstract only, 2025] Delgado et al., 2025");
    expect(prompt).toContain("S2 [paper, author's own, 2019] Whitfield and Haddad, 2025");
  });

  it("checks candidate messages and their points against the facts", async () => {
    const { verifyMessages } = await import("@/ai/messages");
    const a = workspace();
    const v = verifyMessages(a, {
      candidates: [
        { message: "Fund coached walking.", why: "Decision", points: [
          { text: "Coaching lowered HbA1c 0.5 points", intent: "persuade", detail: "", factIds: ["F1"] },
          { text: "It saves 30% of costs", intent: "persuade", detail: "", factIds: ["F1"] },
          { text: "Feedback alone failed", intent: "inform", detail: "", factIds: ["F3", "F99"] },
        ] },
        { message: "Walking cuts HbA1c by 3 points.", why: "Bold", points: [] },
      ],
    });
    expect(v[0].problems).toEqual([]);
    expect(v[0].points.map((p) => p.problems)).toEqual([[], ["30 not in the facts cited"], ["uses F99, not active facts"]]);
    expect(v[0].points[2].factIds).toEqual(["F3"]);
    expect(v[1].problems).toEqual(["3 not in the facts"]);
  });

  it("presets: the summary asks for the four headings; the challenge quotes the message", async () => {
    const { SUMMARY_QUESTION, challengeQuestion } = await import("@/ai/probe");
    expect(SUMMARY_QUESTION).toContain("Established, New, Contested, Unknown");
    expect(challengeQuestion("Fund coached walking.")).toContain('Challenge the message: "Fund coached walking."');
    expect(challengeQuestion("")).toContain("There is no message yet");
  });
});

describe("years in answers", () => {
  it("accepts a source's publication year in an answer that cites it", () => {
    let a = workspace();
    a = run(a, [{ kind: "source.put", source: { ...a.sources![0], year: "2025" } }]).arg;
    const v = verifyProbe(a, { answer: "The 2025 trial found a 0.5 point drop [F1].", cites: ["F1"], proposals: [] });
    expect(v.problems).toEqual([]);
  });
});

import { SEARCHES_WITH_RESULTS, type SearchRecord } from "./argument";

describe("search record", () => {
  it("keeps Discover runs with the presentation, full results for the latest few, and undoes", async () => {
    const { applyArgOp, emptyArgument, invertArgOp, makeArgOp } = await import("./argument");
    const me = { kind: "human" as const, id: "u" };
    const rec = (i: number): SearchRecord => ({ id: `s${i}`, at: "2026-11-28T00:00:00Z", topic: "t", query: `q${i}`, by: "claude", counts: [{ key: "strongest", title: "Strongest", n: 1 }], sections: [{ key: "strongest", title: "Strongest", note: "", results: [] }] });
    let a = emptyArgument("t1");
    for (let i = 1; i <= SEARCHES_WITH_RESULTS + 2; i++) a = applyArgOp(a, makeArgOp({ kind: "search.put", search: rec(i) }, me));
    expect(a.searches).toHaveLength(SEARCHES_WITH_RESULTS + 2);
    expect(a.searches!.filter((s) => s.sections).map((s) => s.id)).toEqual(["s3", "s4", "s5"]);
    expect(a.searches![0].query).toBe("q1");
    const body = { kind: "search.put" as const, search: rec(9) };
    const after = applyArgOp(a, makeArgOp(body, me));
    const undone = applyArgOp(after, makeArgOp(invertArgOp(a, body), me));
    expect(undone.searches!.map((s) => s.id)).toEqual(a.searches!.map((s) => s.id));
  });
});

describe("Bible passages in the workspace", () => {
  it("adds a passage as a Scripture source with the passage as a checked quote; TPT is unchecked", async () => {
    const { passageBodies } = await import("@/components/research/BiblePanel");
    const { emptyArgument } = await import("./argument");
    const a = emptyArgument("t1");
    const [src, fact] = passageBodies(a, { reference: "John 3:16", version: "NIV", text: "Sample verse text.", copyright: "Sample notice." }) as unknown as [{ kind: "source.put"; source: { kind: string; fetchedAt?: string; citation: string } }, { kind: "fact.put"; fact: { checked: boolean; quote?: string; text: string } }];
    expect(src.source.kind).toBe("scripture");
    expect(src.source.fetchedAt).toBeTruthy();
    expect(src.source.citation).toBe("John 3:16 (NIV). Sample notice.");
    expect(fact.fact).toMatchObject({ checked: true, quote: "Sample verse text." });
    const [, tpt] = passageBodies(a, { reference: "John 3:16", version: "TPT", text: "Typed text.", copyright: "N", enteredByAuthor: true }) as [unknown, { fact: { checked: boolean; text: string } }];
    expect(tpt.fact.checked).toBe(false);
    expect(tpt.fact.text).toContain("paraphrase entered by the author");
  });
});
