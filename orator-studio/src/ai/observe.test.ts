import { describe, expect, it } from "vitest";
import { checkObservation, observePrompt, ObservationAnswer } from "./observe";
import { outputSchema } from "./schema";

const facts = [
  { ref: "F1", text: "Reminder calls cut missed visits by 40% in 2025" },
  { ref: "F2", text: "Patients over 80 rarely answered the calls" },
];

describe("Claude's observations", () => {
  it("accepts an observation that cites real facts and their numbers", () => {
    const r = checkObservation({ observation: "Calls cut missed visits by 40% [F1], though patients over 80 rarely answered [F2].", cites: ["F1"], gaps: [] }, facts);
    expect(r).toEqual({ cites: ["F1", "F2"], problems: [] });
  });

  it("flags unknown citations, numbers not in the facts cited, and numbers in general knowledge", () => {
    const r = checkObservation({ observation: "Calls cut missed visits by 55% [F1] and texts did better [F9].", cites: [], gaps: [], general_knowledge: "Most clinics see 30% no-shows." }, facts);
    expect(r.cites).toEqual(["F1"]);
    expect(r.problems.join(" | ")).toMatch(/F9/);
    expect(r.problems.join(" | ")).toMatch(/55/);
    expect(r.problems.join(" | ")).toMatch(/general-knowledge/);
  });

  it("asks Claude to observe, never to assert, and its answer shape is accepted", () => {
    const p = observePrompt({ topic: "Missed appointments", description: "", question: "", facts: facts.map((f) => ({ ...f, source: "Report", kind: "note", checked: false })), assertions: [] });
    expect(p).toContain("never make assertions");
    expect(p).toContain("[unchecked]");
    expect(JSON.stringify(outputSchema(ObservationAnswer))).not.toMatch(/maxLength|maxItems/);
  });
});
