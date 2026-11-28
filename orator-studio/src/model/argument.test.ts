import { describe, expect, it } from "vitest";
import { applyArgOp, changesSince, emptyArgument, invertArgOp, isSupported, makeArgOp, newEvidence, newPoint, type ArgOp, type ArgOpBody, type Argument } from "./argument";
import { draftFromArgument, slidesFor } from "@/build/fromArgument";
import { briefMarkdown } from "@/research/brief";

const me = { kind: "human" as const, id: "u1" };

function run(arg: Argument, bodies: ArgOpBody[]): { arg: Argument; log: ArgOp[]; inverses: ArgOpBody[] } {
  const log: ArgOp[] = [];
  const inverses: ArgOpBody[] = [];
  for (const b of bodies) {
    inverses.unshift(invertArgOp(arg, b));
    const op = makeArgOp(b, me);
    arg = applyArgOp(arg, op);
    log.push(op);
  }
  return { arg, log, inverses };
}

describe("argument operations", () => {
  const a = newPoint("Readmissions are rising", { evidence: [newEvidence("Up 12% since 2024", { source: "Quality report, p. 3" })] });
  const b = newPoint("Follow-up calls cut readmissions");
  const c = newPoint("Pilot in two units", { intent: "decide" });
  const base = emptyArgument("t1", { purpose: "Approve a follow-up call pilot" });

  it("adds, edits, moves and deletes points, and every change undoes exactly", () => {
    const { arg, inverses } = run(base, [
      { kind: "point.put", point: a },
      { kind: "point.put", point: b },
      { kind: "point.put", point: c },
      { kind: "point.move", pointId: c.id, index: 0 },
      { kind: "point.put", point: { ...b, text: "Calls within 48 hours cut readmissions" } },
      { kind: "point.delete", pointId: a.id },
      { kind: "arg.set", patch: { thesis: "A call pilot is worth funding", nextSteps: ["Pick units"] } },
    ]);
    expect(arg.points.map((p) => p.text)).toEqual(["Pilot in two units", "Calls within 48 hours cut readmissions"]);
    expect(arg.version).toBe(7);
    const undone = run(arg, inverses).arg;
    expect({ ...undone, version: 0 }).toEqual(base);
  });

  it("marks points without evidence as unsupported", () => {
    expect([a, b].map(isSupported)).toEqual([true, false]);
  });

  it("reports which points and framing changed after a version", () => {
    const first = run(base, [{ kind: "point.put", point: a }, { kind: "point.put", point: b }]);
    const later = run(first.arg, [
      { kind: "point.put", point: { ...a, text: "Readmissions rose 12%" } },
      { kind: "arg.set", patch: { title: "Renamed" } },
      { kind: "point.put", point: c },
    ]);
    const log = [...first.log, ...later.log];
    const ch = changesSince(log, first.arg.version);
    expect([...ch.points].sort()).toEqual([a.id, c.id].sort());
    expect(ch.framing).toBe(false); // a title change alone doesn't touch the slides' argument
    expect(changesSince([...log, makeArgOp({ kind: "arg.set", patch: { recommendation: "Fund it" } }, me)], first.arg.version).framing).toBe(true);
  });
});

describe("drafting slides from an argument", () => {
  const supported = newPoint("Readmissions are rising", { evidence: [newEvidence("Up 12% since 2024", { source: "Quality report, p. 3", kind: "figure" })], detail: "Each costs about a week of bed time." });
  const quoted = newPoint("Calls work elsewhere", { evidence: [newEvidence("Calls cut readmissions", { kind: "finding", quote: "readmissions fell by a third", source: "[1] Lee et al., 2023, p. 5" })] });
  const bare = newPoint("Staff can absorb the calls", { byAi: true });
  const arg: Argument = {
    ...emptyArgument("t1", { thesis: "A follow-up call pilot is worth funding.", audience: "Quality committee", purpose: "Approve the pilot", recommendation: "Fund a 6-month pilot.", nextSteps: ["Pick two units"], openQuestions: ["Does it work for surgical patients?"] }),
    points: [supported, quoted, bare],
  };

  it("makes a thesis slide, a slide per point, and the closing slides, each point slide linked to its point", () => {
    const d = draftFromArgument(arg);
    expect(d.narrative.map((s) => s.claim)).toEqual([
      "A follow-up call pilot is worth funding",
      "Readmissions are rising",
      "Calls work elsewhere",
      "Staff can absorb the calls",
      "What we don't know yet",
      "Recommendation",
      "Next steps",
    ]);
    expect(d.narrative.slice(1, 4).map((s) => s.pointId)).toEqual([supported.id, quoted.id, bare.id]);
    expect(d.narrative[1].blocks[0]).toMatchObject({ type: "bullets", items: ["Up 12% since 2024 (Quality report, p. 3)"] });
    expect(d.narrative[1].notes).toBe("Each costs about a week of bed time.");
    expect(d.narrative[2].blocks[1]).toMatchObject({ type: "quote", text: "readmissions fell by a third", attribution: "[1] Lee et al., 2023, p. 5" });
    expect(d.narrative[3].importNotes).toEqual(["This point had no evidence in Research. Add it there, or here, before presenting.", "Claude wrote or proposed this point. Make it your own."]);
  });

  it("sends points left out of the talk to backup", () => {
    const d = draftFromArgument(arg, (p) => p.id !== quoted.id);
    expect(d.narrative.some((s) => s.pointId === quoted.id)).toBe(false);
    expect(d.backup.map((s) => s.pointId)).toEqual([quoted.id]);
    expect(slidesFor(20)).toBe(10);
  });

  it("writes the argument as a brief", () => {
    const md = briefMarkdown(arg);
    expect(md).toContain("## Points");
    expect(md).toContain('- Calls cut readmissions ("readmissions fell by a third") ([1] Lee et al., 2023, p. 5)');
    expect(md).toContain("_No evidence yet._");
    expect(md).toContain("proposed by Claude");
  });
});
