import { describe, expect, it } from "vitest";
import { localBackend } from "./backend";
import { repo } from "./repo";
import { describeEvidence, evidenceSummary, parseKeywords, similarTopics, words } from "./logic";
import type { Topic } from "./types";

const fresh = () => repo(localBackend({ store: "memory", user: "u1" }));

describe("the knowledge model, end to end (local backend)", () => {
  it("keeps evidence, asserts on a topic, builds a presentation, and flags it when evidence changes", async () => {
    const k = fresh();
    // Discover: a source and its facts (made-up study).
    const { source, facts } = await k.keepSource({ kind: "paper", title: "A made-up walking study", year: "2024" }, [
      { text: "Coached walking lowered HbA1c by 0.5 points", quote: "HbA1c fell by 0.5", page: 3, checked: true },
      { text: "Adults over 65 saw a smaller effect", quote: "smaller in older adults", page: 5, checked: true },
    ]);
    // Curate: a topic, an observation by Claude, and the author's own assertion.
    const topic = await k.createTopic({ name: "Walking and diabetes", keywords: ["walking", "HbA1c"] });
    const obs = await k.addObservation({ topic_id: topic.id, made_by: "claude", text: "The study finds a meaningful drop, smaller in older adults.", fact_ids: facts.map((f) => f.id) });
    const a = await k.assert({ topic_id: topic.id, text: "Coached walking is worth funding, with care for older patients.", origin: "from_observation", observation_id: obs.id }, [
      { fact_id: facts[0].id, role: "supports" },
      { fact_id: facts[1].id, role: "qualifies" },
    ]);
    // Citing a fact linked its source to the topic automatically (F-140).
    const view = await k.topicView(topic.id);
    expect(view.links).toEqual([expect.objectContaining({ source_id: source.id, linked_by: "auto" })]);
    expect(view.assertions).toHaveLength(1);
    const summary = evidenceSummary(view.assertionFacts, new Map(view.facts.map((f) => [f.id, f])), new Map(view.sources.map((s) => [s.id, s])));
    expect(describeEvidence(summary)).toBe("2 facts from 1 source (1 paper), 2024: 1 supports, 1 qualifies.");

    // Build: a presentation from the topic and the chosen assertion.
    const p = await k.createPresentation({ title: "Board talk", purpose: "Decide on funding", audience: "The board" });
    await k.setTopics(p.id, [topic.id]);
    await k.setAssertions(p.id, topic.id, [a.id]);
    let pv = await k.presentationView(p.id);
    expect(pv.topics.map((t) => t.name)).toEqual(["Walking and diabetes"]);
    expect(pv.chosen[topic.id].map((x) => x.id)).toEqual([a.id]);
    expect(pv.flags).toHaveLength(0);

    // A fact is discarded: the assertion and the presentation are flagged (F-138).
    await k.discardFact(facts[1].id, "Superseded by a larger trial");
    expect((await k.topicView(topic.id)).flags).toHaveLength(1);
    pv = await k.presentationView(p.id);
    expect(pv.flags[0].reason).toContain("Superseded by a larger trial");

    // Revising the assertion flags the presentation again.
    await k.reviseAssertion(a.id, { text: "Coached walking is worth funding." });
    expect((await k.presentationView(p.id)).flags).toHaveLength(2);
  });

  it("insists assertions are written, and lets an assertion start unsupported", async () => {
    const k = fresh();
    const topic = await k.createTopic({ name: "Sabbath rest" });
    await expect(k.assert({ topic_id: topic.id, text: "   " })).rejects.toThrow(/own words/);
    const a = await k.assert({ topic_id: topic.id, text: "Weekly rest protects clinicians from burnout." });
    const v = await k.topicView(topic.id);
    expect(describeEvidence(evidenceSummary(v.assertionFacts.filter((l) => l.assertion_id === a.id), new Map(), new Map()))).toMatch(/^Unsupported/);
  });

  it("copies a public source and its facts, disconnected", async () => {
    const k = fresh();
    const { source } = await k.keepSource({ kind: "report", title: "A made-up report", is_public: true }, [{ text: "Finding one" }]);
    const copy = await k.copySource(source.id);
    expect(copy.source.id).not.toBe(source.id);
    expect(copy.source).toMatchObject({ origin: "copied", copied_from: source.id, is_public: false });
    expect(copy.facts.map((f) => f.text)).toEqual(["Finding one"]);
    await k.updateFact(copy.facts[0].id, { text: "Changed in my copy" });
    expect((await k.factsOf([source.id]))[0].text).toBe("Finding one");
  });

  it("drops a topic's chosen assertions when the topic leaves a presentation", async () => {
    const k = fresh();
    const t1 = await k.createTopic({ name: "One" });
    const t2 = await k.createTopic({ name: "Two" });
    const a1 = await k.assert({ topic_id: t1.id, text: "A1" });
    const a2 = await k.assert({ topic_id: t2.id, text: "A2" });
    const p = await k.createPresentation({});
    await k.setTopics(p.id, [t1.id, t2.id]);
    await k.setAssertions(p.id, t1.id, [a1.id]);
    await k.setAssertions(p.id, t2.id, [a2.id]);
    await k.setTopics(p.id, [t2.id]);
    const v = await k.presentationView(p.id);
    expect(v.topics.map((t) => t.name)).toEqual(["Two"]);
    expect(Object.values(v.chosen).flat().map((x) => x.text)).toEqual(["A2"]);
  });
});

describe("does this topic exist already?", () => {
  const t = (name: string, keywords: string[] = []): Topic => ({ id: name, owner_id: "u", name, description: "", keywords, created_at: "", updated_at: "" });
  const lib = [t("Sabbath rest and health", ["sabbath", "rest"]), t("Burnout in clinicians", ["burnout"]), t("Walking programs for diabetes")];
  it("finds near-duplicates by meaningful words, best first", () => {
    expect(similarTopics("Health and Sabbath rest", [], lib).map((x) => x.topic.name)).toEqual(["Sabbath rest and health"]);
    expect(similarTopics("Clinician burnout", [], lib)[0].topic.name).toBe("Burnout in clinicians");
    expect(similarTopics("Bone cancer in Filipinos", [], lib)).toEqual([]);
    expect(words("The programs, for diabetes")).toEqual(["program", "diabete"]);
    expect(similarTopics("Appointments that patients miss", [], [t("Missed appointments", ["appointments", "reminders"])])).toHaveLength(1);
    expect(words("resting rested rests")).toEqual(["rest", "rest", "rest"]);
    expect(parseKeywords("walking, diabetes; HbA1c, walking")).toEqual(["walking", "diabetes", "HbA1c"]);
  });
});
