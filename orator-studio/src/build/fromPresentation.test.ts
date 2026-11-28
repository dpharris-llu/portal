import { describe, expect, it } from "vitest";
import { localBackend } from "@/knowledge/backend";
import { repo } from "@/knowledge/repo";
import { draftFromPresentation } from "./fromPresentation";

describe("drafting slides from a presentation", () => {
  it("makes a title slide, a slide per topic and per chosen assertion, backups, and a sources slide", async () => {
    const k = repo(localBackend({ store: "memory", user: "u1" }));
    const { facts } = await k.keepSource({ kind: "report", title: "A made-up clinic report", short: "Clinic report, 2025", citation: "Clinic report, 2025. Made up." }, [
      { text: "Reminder calls cut missed visits by 40%", quote: "missed visits fell by 40%", checked: true },
      { text: "Patients over 80 rarely answered", checked: true },
    ]);
    const t1 = await k.createTopic({ name: "Missed appointments" });
    const t2 = await k.createTopic({ name: "Text reminders" });
    const a1 = await k.assert({ topic_id: t1.id, text: "Reminder calls are worth keeping." }, [
      { fact_id: facts[0].id, role: "supports" },
      { fact_id: facts[1].id, role: "qualifies" },
    ]);
    const a2 = await k.assert({ topic_id: t1.id, text: "Calls alone won't reach the oldest patients." });
    const a3 = await k.assert({ topic_id: t2.id, text: "Texts may do as well as calls." });
    const p = await k.createPresentation({ title: "Keeping patients on schedule", purpose: "Fund reminders", audience: "Clinic leaders" });
    await k.setTopics(p.id, [t1.id, t2.id]);
    await k.setAssertions(p.id, t1.id, [a1.id]);
    await k.setAssertions(p.id, t2.id, [a3.id]);

    const { narrative, backup } = draftFromPresentation(await k.presentationView(p.id));
    expect(narrative.map((s) => s.claim)).toEqual(["Keeping patients on schedule", "Missed appointments", "Reminder calls are worth keeping", "Text reminders", "Texts may do as well as calls", "Sources"]);
    const s1 = narrative[2];
    expect(s1.pointId).toBe(a1.id);
    expect(JSON.stringify(s1.blocks)).toContain("Reminder calls cut missed visits by 40% (Clinic report, 2025)");
    expect(JSON.stringify(s1.blocks)).toContain("missed visits fell by 40%");
    expect(s1.notes).toContain("Qualifies: Patients over 80 rarely answered");
    expect(narrative[4].importNotes?.[0]).toMatch(/unsupported/);
    expect(backup.map((s) => s.claim)).toEqual([a2.text.replace(/[.]$/, "")]);
    expect(JSON.stringify(narrative[5].blocks)).toContain("Clinic report, 2025. Made up.");
  });
});
