import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readPdf } from "@/documents/pdf";
import { paperForClaude, paperPages, quoteFound } from "./text";
import { formatCitation, shortCitation, verifyReading, verifySynthesis, type PaperReading, type SynthesisRequest } from "@/ai/evidence";

const load = async (f: string) => paperPages(await readPdf(new Uint8Array(readFileSync(path.join(__dirname, "fixtures", f)))));

describe("reading fictional test papers", () => {
  it("keeps sentences whole across lines and columns, and leaves out the references", async () => {
    const pages = await load("paper-walking-rct.pdf");
    expect(quoteFound("Of the 412 participants, 389 completed follow-up. HbA1c fell by 0.6 percentage points in the walking group compared with 0.1 in usual care", pages[0].text)).toBe(true);
    expect(quoteFound("Follow-up lasted only 12 weeks, so we cannot say whether the benefit persists.", pages.map((p) => p.text).join("\n"))).toBe(true);
    const forClaude = paperForClaude(pages);
    expect(forClaude.text).toContain("[[Page 1]]");
    expect(forClaude.text).not.toContain("An earlier fictional study");
  });

  it("checks quotes, pages and numbers in Claude's reading", async () => {
    const pages = await load("paper-walking-rct.pdf");
    const limitPage = pages.find((p) => p.text.includes("Follow-up lasted only 12 weeks"))!.page;
    const reading: PaperReading = {
      citation: { title: "A Daily Walking Program and Glycemic Control in Adults With Type 2 Diabetes: A Randomized Trial", authors: ["Maria Delgado", "Kevin Osei", "Hannah Park", "Luis Romero"], year: "2025", venue: "Journal of Fictional Clinical Studies", doi: "10.5555/jfcs.2025.0101" },
      design: "randomized controlled trial",
      sample: "412 adults with type 2 diabetes",
      findings: [
        { text: "HbA1c fell 0.5 points more with walking (95% CI 0.3 to 0.7).", quote: "HbA1c fell by 0.6 percentage points in the walking group compared with 0.1 in usual care (difference 0.5; 95% CI 0.3 to 0.7; p<0.001)", page: 1 },
        { text: "Weight fell 1.8 kg with walking.", quote: "Mean weight loss was 1.8 kg in the walking group", page: 2 }, // off by one page
        { text: "Walking halved the need for medication.", quote: "walking halved the need for medication", page: 1 }, // not in the paper
        { text: "Adherence was 85%.", quote: "Adherence was high: participants walked a median of 5.6 days per week.", page: 1 }, // 85 not printed
      ],
      limitations: [{ text: "Follow-up was 12 weeks.", quote: "Follow-up lasted only 12 weeks, so we cannot say whether the benefit persists.", page: limitPage }],
    };
    const v = verifyReading(reading, pages);
    expect(v.claims.map((c) => c.verified)).toEqual([true, true, false, false, true]);
    expect(v.claims[1].page).toBe(1);
    expect(v.claims[2].problems).toEqual(["the quote is not on page 1"]);
    expect(v.claims[3].problems).toEqual(["85 is not printed on page 1"]);
    expect(v.citationNotes).toEqual([]);
    expect(verifyReading({ ...reading, citation: { ...reading.citation, doi: "10.9999/made.up", authors: ["Maria Delgado", "Nobody Here"] } }, pages).citationNotes).toEqual([
      "DOI not found on the first pages",
      "author not found on the first pages: Nobody Here",
    ]);
  });

  it("formats citations", () => {
    const c = { title: "Steps per Day and Long-Term HbA1c in a Primary Care Cohort", authors: ["Samuel Chen", "Aisha Bello", "Robert Lindqvist"], year: "2024", venue: "Fictional Diabetes Research", doi: "https://doi.org/10.5555/fdr.2024.0055" };
    expect(shortCitation(c)).toBe("Chen et al., 2024".replace("Samuel", "Samuel")); // first word that is a name
    expect(formatCitation(c)).toBe("Samuel Chen, Aisha Bello, Robert Lindqvist (2024). Steps per Day and Long-Term HbA1c in a Primary Care Cohort. Fictional Diabetes Research. doi:10.5555/fdr.2024.0055");
  });
});

describe("checking a synthesis", () => {
  const req: SynthesisRequest = {
    goal: "Decide whether to fund a walking program",
    papers: [
      { ref: 1, citation: "Delgado et al., 2025", design: "RCT", sample: "412 adults", claims: [
        { id: "P1-C1", kind: "finding", text: "HbA1c fell 0.5 points more with coached walking (95% CI 0.3 to 0.7).", quote: "difference 0.5; 95% CI 0.3 to 0.7", page: 1 },
        { id: "P1-C2", kind: "limitation", text: "Follow-up was 12 weeks.", quote: "Follow-up lasted only 12 weeks", page: 1 } ] },
      { ref: 2, citation: "Whitfield and Haddad, 2025", design: "pilot RCT", sample: "96 adults aged 70+", claims: [
        { id: "P3-C1", kind: "finding", text: "Pedometer feedback alone did not change HbA1c (difference 0.1; p=0.48).", quote: "difference 0.1; 95% CI -0.2 to 0.4; p=0.48", page: 1 } ] },
    ],
  };
  it("requires citations to confirmed findings and numbers from them", () => {
    const v = verifySynthesis(req, {
      thesis: "Fund coached walking, not pedometers alone.",
      points: [
        { conclusion: "Coaching is what makes walking work", evidence: "Coached walking cut HbA1c by 0.5 points, while feedback alone changed it by 0.1.", cites: ["P1-C1", "P3-C1"], agreement: "mixed", strength: "moderate", strengthReason: "Two trials, one small.", soWhat: "Budget for coaching.", context: "Behavior change programs often fade after 6 months.", externalNumbers: [] },
        { conclusion: "Benefits last for years", evidence: "Effects held for 3 years.", cites: ["P1-C1", "P2-C9"], agreement: "single study", strength: "weak", strengthReason: "One study.", soWhat: "x" },
      ],
      recommendation: { action: "Fund a 12-week coached pilot", rationale: "Strongest evidence.", tradeoffs: "Coaching costs more.", cites: ["P1-C1", "P1-C2"] },
      nextSteps: ["Price coaching for 412 people.", "Plan a 24-month follow-up."],
      openQuestions: ["Does the benefit last?"],
    });
    expect(v.thesis.verified).toBe(true);
    expect(v.points[0]).toMatchObject({ verified: true, contextProblems: ["6 in the context is not listed as general knowledge"] });
    expect(v.points[1].problems).toEqual(["cites P2-C9, which is not a confirmed finding", "3 does not appear in the cited findings"]);
    expect(v.recommendation.verified).toBe(true);
    expect(v.nextSteps.map((s) => s.verified)).toEqual([true, false]);
  });

  it("names authors by family name and ignores claim tags as numbers", async () => {
    const { shortCitation, surname } = await import("@/ai/evidence");
    expect(["Maria Delgado", "Delgado M", "Delgado MA", "Delgado, Maria", "M. Delgado", "van der Berg J"].map(surname)).toEqual(["Delgado", "Delgado", "Delgado", "Delgado", "Delgado", "van der Berg"]);
    expect(shortCitation({ title: "T", authors: ["Grace Whitfield", "Omar Haddad"], year: "2025" })).toBe("Whitfield and Haddad, 2025");
    const req = { goal: "", papers: [{ ref: 3, citation: "x", sample: "96 adults", claims: [{ id: "P3-C1", kind: "finding" as const, text: "No change (p=0.48).", quote: "p=0.48", page: 1 }] }] };
    const s = { thesis: "No effect.", points: [{ conclusion: "No effect", evidence: "In 96 adults, p=0.48 [P3-C1].", cites: ["P3-C1"], agreement: "single study" as const, strength: "weak" as const, strengthReason: "Small.", soWhat: "Skip it." }],
      recommendation: { action: "Skip", rationale: "See P3-C1.", tradeoffs: "None.", cites: ["P3-C1"] }, nextSteps: ["Recheck [P3-C1]."], openQuestions: [] };
    const v = verifySynthesis(req, s);
    expect([v.points[0].problems, v.recommendation.problems, v.nextSteps[0].problems]).toEqual([[], [], []]);
  });

  it("removes claim tags from slide text", async () => {
    const { draftFromEvidence } = await import("./build");
    const paper = { id: "P1", fileName: "a.pdf", pages: 2, citation: { title: "T", authors: ["Maria Delgado"], year: "2025" }, claims: [{ id: "P1-C1", kind: "finding" as const, text: "x", quote: "q", page: 1, confirmedAt: "" }], readAt: "", via: "claude.ai" as const };
    const d = draftFromEvidence([paper], { points: [{ conclusion: "C", evidence: "Fell 0.5 points [P1-C1], as in [P1-C1, P1-C1].", cites: ["P1-C1"], agreement: "single study", strength: "weak", strengthReason: "", soWhat: "S", verified: true, problems: [], contextProblems: [] }], nextSteps: [], openQuestions: [], via: "claude.ai" });
    const text = JSON.stringify(d.narrative);
    expect(text).toContain("Fell 0.5 points, as in. [1]");
    expect(text).not.toContain("P1-C1]");
  });
});
