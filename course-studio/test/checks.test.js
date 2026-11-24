// Run with: node test/checks.test.js
// Examples come from Teaching Well in Higher Ed, so the checks agree with the course.
const assert = require("assert");
const C = require("../src/checks.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("ok -", name); };
const codes = r => r.issues.map(i => i.code);

// ---------- Outcomes (Module 2, Page 2) ----------
test("vague verbs are flagged: the course's weak outcomes", () => {
  for (const t of ["Understand the stages of wound healing", "Know the signs of sepsis",
    "Appreciate the role of the interprofessional team", "Be familiar with the literature on pain management"]) {
    assert(codes(C.analyzeOutcome(t)).includes("vague_verb"), t);
  }
});
test("the course's stronger outcomes pass the verb check", () => {
  for (const t of ["Explain how each stage of wound healing relates to the choice of dressing for a given wound",
    "Appraise a study on opioid-sparing analgesia and state whether it should change practice",
    "Select an appropriate antibiotic for a case of uncomplicated cellulitis and justify the choice"]) {
    const r = C.analyzeOutcome(t);
    assert(!codes(r).includes("vague_verb") && !codes(r).includes("no_verb"), t);
  }
});
test("preamble is stripped and the highest Bloom level wins", () => {
  const r = C.analyzeOutcome("By the end of the session, learners will be able to select and justify a first-line treatment for a patient with hypertension and a comorbidity.");
  assert.deepStrictEqual(r.verbs, ["select", "justify"]);
  assert.strictEqual(r.bloom, 5);
  assert(codes(r).includes("two_verbs"));
});
test("nouns that look like verbs mid-sentence are ignored", () => {
  const r = C.analyzeOutcome("Describe how each team member contributes to a discharge plan and identify a gap in a sample plan");
  assert.deepStrictEqual(r.verbs, ["describe", "identify"]);
  assert.strictEqual(r.bloom, 2);
});
test("performance verbs imply at least 'shows how'", () => {
  assert.strictEqual(C.analyzeOutcome("Perform a focused cardiac exam on a standardized patient").millerFloor, 3);
});
test("short outcomes are asked for context", () => {
  assert(codes(C.analyzeOutcome("Interpret ECGs")).includes("no_context"));
});

// ---------- Alignment (Module 2, Page 4 table) ----------
const base = { outcome: { text: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity", miller: 2 } };
const withParts = (methods, type) => ({ ...base, session: { segments: methods.map(m => ({ method: m, minutes: 10 })) }, assessment: { type } });

test("row 1: small-group cases + case-based exam = aligned", () => {
  const a = C.alignment(withParts(["case"], "written_case"));
  assert.strictEqual(a.level.status, "aligned");
});
test("row 2: lecture + recall MCQ = not aligned on both links", () => {
  const a = C.alignment(withParts(["lecture"], "mcq_recall"));
  assert.strictEqual(a.practice.status, "gap");
  assert.strictEqual(a.assessment.status, "gap");
  assert(a.assessment.issues.some(i => i.code === "assessment_below"));
});
test("row 3: 'shows how' exam assessed by a written test = wrong tool", () => {
  const d = { outcome: { text: "Demonstrate a focused cardiac exam on a standardized patient", miller: 3 },
    session: { segments: [{ method: "worked_example" }] }, assessment: { type: "mcq_case" } };
  const a = C.alignment(d);
  assert(a.assessment.issues.some(i => i.code === "wrong_tool" && i.severity === "gap"));
  assert.strictEqual(a.practice.status, "gap");
});
test("simulation + OSCE aligns a 'shows how' outcome", () => {
  const d = { outcome: { text: "Demonstrate a focused cardiac exam on a standardized patient", miller: 3 },
    session: { segments: [{ method: "simulation" }] }, assessment: { type: "simulation" } };
  assert.strictEqual(C.alignment(d).level.status, "aligned");
});
test("alignment stays pending until there is an outcome", () => {
  assert.strictEqual(C.alignment({ session: { segments: [{ method: "case" }] } }).level.status, "pending");
});

// ---------- Session (Module 3) ----------
test("session flags overtime, long explanation and missing feedback", () => {
  const r = C.analyzeSession({ length: 50, segments: [{ method: "lecture", minutes: 35 }, { method: "case", minutes: 20 }] });
  assert.deepStrictEqual(codes(r).sort(), ["long_lecture", "no_feedback", "no_retrieval", "overtime"]);
});
test("the course's converted heart-failure session is clean", () => {
  const segs = [["retrieval", 5], ["lecture", 10], ["think_pair_share", 10], ["case", 7], ["worked_example", 10], ["case", 6], ["reflection", 2]]
    .map(([method, minutes]) => ({ method, minutes }));
  const r = C.analyzeSession({ length: 50, segments: segs, feedbackDuring: "Debrief after each case" });
  assert.strictEqual(r.total, 50);
  assert.deepStrictEqual(r.issues, []);
});

// ---------- Assessment and feedback (Module 4) ----------
test("knowledge check 4: person praise and no next step are flagged", () => {
  assert(codes(C.analyzeAssessment({ feedbackSample: "You're a strong student." })).includes("self_level"));
  assert(codes(C.analyzeAssessment({ feedbackSample: "Needs work." })).includes("no_next_step"));
  const good = "You identified the key diagnosis but did not rule out dangerous alternatives; list those first next time.";
  assert.deepStrictEqual(codes(C.analyzeAssessment({ feedbackSample: good })), []);
});
test("rubric: vague descriptors and criterion count", () => {
  const r = C.analyzeAssessment({ rubric: [{ criterion: "Reasoning", meets: "Good reasoning" }, { criterion: "Communication", meets: "Clear" }] });
  assert(codes(r).includes("vague_descriptor") && codes(r).includes("criteria_count"));
});

// ---------- AI (Module 5) ----------
test("AI: core skill at level 3+, vague policy, detector reliance", () => {
  const r = C.analyzeAI({ outcome: { miller: 3 }, ai: { level: 4, wording: "Use AI responsibly.", misuse: "Run it through the detector" } });
  assert.deepStrictEqual(codes(r).sort(), ["ai_core_skill", "ai_detector", "ai_document", "ai_vague_policy"]);
});
test("AI: knowledge check 6's clear statement passes", () => {
  const r = C.analyzeAI({ outcome: { miller: 2 }, ai: { level: 2, document: "Note the tool and what you changed",
    wording: "AI may be used for brainstorming in Assignment 2 with a note on how you used it; it may not be used for the case analysis in Assignment 3." } });
  assert.deepStrictEqual(r.issues, []);
});

// ---------- Mission lens ----------
test("mission: chosen but not woven is flagged as bolted on", () => {
  const r = C.analyzeMission({ mission: { dimensions: [{ id: "compassion" }, { id: "service", activity: true }] } });
  assert.strictEqual(r.woven, 1);
  assert(codes(r).includes("bolted_on") && codes(r).includes("mission_unassessed"));
});

// ---------- Privacy ----------
test("PHI scan catches identifiers and passes clean teaching text", () => {
  assert.strictEqual(C.scanForPHI("MRN: 4482913, 67-year-old"), "a medical record number");
  assert.strictEqual(C.scanForPHI("SSN 123-45-6789"), "a Social Security number");
  assert.strictEqual(C.scanForPHI("DOB 03/14/1958"), "a date of birth");
  assert.strictEqual(C.scanForPHI("A 67-year-old with hypertension and chronic kidney disease"), null);
});

// ---------- Capstone estimate ----------
test("capstone: an empty plan is not badge-ready; a complete aligned plan is", () => {
  assert.strictEqual(C.capstoneEstimate({}).badgeLikely, false);
  const full = {
    outcome: { text: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity", miller: 2 },
    session: { length: 50, modalityReason: "Live discussion of cases", feedbackDuring: "Debrief after each case",
      segments: [{ method: "retrieval", minutes: 5 }, { method: "case", minutes: 30 }] },
    assessment: { type: "written_case", formative: "Practice case in week 3", feedbackRoutine: "Rubric comments within a week",
      rubric: [{ criterion: "Clinical reasoning", meets: "Justifies the decision using patient data and evidence" },
        { criterion: "Communication", meets: "Clear, organized and appropriate for the audience" },
        { criterion: "Use of evidence", meets: "Cites relevant, current sources correctly" }] },
    ai: { level: 1, reason: "Core reasoning skill", visible: "Timed in-class case", wording: "No AI for the graded case analysis in Assignment 3." },
    evaluation: { measure: "Case scores vs last year", firstStep: "Retrieval opener", firstDate: "2027-01-12" },
  };
  const e = C.capstoneEstimate(full);
  assert.strictEqual(e.meets, 5, JSON.stringify(e.criteria));
  assert(e.badgeLikely);
});

// ---------- Course level ----------
const course = () => ({
  course: { credits: 4, weeks: 10, term: "quarter" },
  outcomes: [
    { id: "a", text: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity.", miller: 2 },
    { id: "b", text: "Counsel a patient starting a new antihypertensive medication, using teach-back.", miller: 3 },
    { id: "c", text: "Adjust drug therapy for a patient with chronic kidney disease using current guidelines.", miller: 2 },
  ],
  weeks: [
    { n: 1, topic: "Choosing therapy", outcomes: ["a"], methods: ["case"], classMinutes: 200, outHours: 8 },
    { n: 2, topic: "Counseling", outcomes: ["b"], methods: ["lecture"], classMinutes: 200, outHours: 8 },
    { n: 3, topic: "Comorbidities", outcomes: ["a"], methods: ["tbl"], classMinutes: 200, outHours: 8 },
    { n: 4, topic: "Review", outcomes: [], methods: ["lecture"], classMinutes: 200, outHours: 8 },
  ],
  assessments: [
    { id: "q", name: "Practice cases", type: "written_case", week: 1, weight: 10, formative: true, outcomes: ["a"] },
    { id: "m", name: "Midterm", type: "written_case", week: 3, weight: 40, outcomes: ["a"] },
    { id: "f", name: "Final", type: "mcq_case", week: 4, weight: 40, outcomes: ["b"] },
    { id: "r", name: "Reflection", type: "essay", week: 4, weight: 5, outcomes: [] },
  ],
});
test("matrix: an outcome with practice and matching evidence is aligned", () => {
  const m = C.courseMatrix(course());
  const a = m.rows.find(r => r.outcome.id === "a");
  assert.strictEqual(a.status, "aligned");
  assert.deepStrictEqual(a.weeks, [1, 3]);
  assert(!a.issues.some(i => i.code === "not_spaced"));
});
test("matrix: lecture-only practice and a written test for a 'shows how' outcome", () => {
  const b = C.courseMatrix(course()).rows.find(r => r.outcome.id === "b");
  assert.strictEqual(b.chain.practice.status, "gap");
  assert(b.issues.some(i => i.code === "wrong_tool"));
  assert(b.issues.some(i => i.code === "no_formative"));
  assert(b.issues.some(i => i.code === "not_spaced"));
});
test("matrix: never practiced, never assessed, orphans", () => {
  const m = C.courseMatrix(course());
  const c = m.rows.find(r => r.outcome.id === "c");
  assert(c.issues.some(i => i.code === "never_practiced") && c.issues.some(i => i.code === "never_assessed"));
  assert.strictEqual(c.status, "gap");
  assert.strictEqual(m.orphans.length, 1);
  assert(m.orphans[0].message.includes("Reflection"));
  assert.strictEqual(m.weekOrphans.length, 1);
  assert.strictEqual(m.status, "gap");
});
test("matrix: practice that comes after the first graded attempt is flagged", () => {
  const d = course();
  d.assessments[0].week = 5;
  const a = C.courseMatrix(d).rows.find(r => r.outcome.id === "a");
  assert(a.issues.some(i => i.code === "formative_late"));
});
test("weights: total and high stakes", () => {
  const w = C.analyzeWeights(course());
  assert.strictEqual(w.total, 95);
  assert(w.issues.some(i => i.code === "weights_total"));
  assert.strictEqual(w.issues.filter(i => i.code === "high_stakes").length, 2);
});
test("workload: 4 quarter credits over 10 weeks is about 120 hours", () => {
  const d = course();
  const w = C.analyzeWorkload(d);
  assert.strictEqual(w.expected, 120);
  assert.strictEqual(w.planned, Math.round(4 * 200 / 60 + 32));
  assert(w.issues.some(i => i.code === "under_workload"));
  d.weeks.forEach(x => { x.outHours = 40; });
  assert(C.analyzeWorkload(d).issues.some(i => i.code === "over_workload"));
});
test("AI per assessment: graded performance task at level 3+ is flagged, practice is not", () => {
  const d = course();
  assert(C.analyzeAssessmentAI({ name: "Final", outcomes: ["b"], aiLevel: 4 }, d.outcomes).issues.length === 1);
  assert(C.analyzeAssessmentAI({ name: "Drill", formative: true, outcomes: ["b"], aiLevel: 4 }, d.outcomes).issues.length === 0);
  assert(C.analyzeAssessmentAI({ name: "Plan", outcomes: ["a"], aiLevel: 3 }, d.outcomes).issues.length === 0);
});
test("mission: course-level links count as woven", () => {
  const r = C.analyzeMission({ mission: { dimensions: [{ id: "service", weeks: ["3"] }, { id: "equity", outcomes: [], weeks: [], assessments: [] }] } });
  assert.strictEqual(r.woven, 1);
  assert(r.issues.some(i => i.code === "bolted_on") && r.issues.some(i => i.code === "mission_unassessed"));
});
test("matrix: vague outcomes and outcomes without a level say so", () => {
  const d = course();
  d.outcomes.push({ id: "v", text: "Understand the mechanisms of the major antihypertensive classes." });
  d.outcomes.push({ id: "w", text: "Reconcile medication lists for patients moving between care settings." });
  d.weeks[0].outcomes.push("v", "w");
  const m = C.courseMatrix(d);
  assert(m.rows.find(r => r.outcome.id === "v").issues.some(i => i.code === "vague_outcome"));
  assert.strictEqual(m.rows.find(r => r.outcome.id === "v").status, "gap");
  assert(m.rows.find(r => r.outcome.id === "w").issues.some(i => i.code === "no_level"));
  assert.strictEqual(C.analyzeOutcome("Adjust drug therapy for a patient with chronic kidney disease").bloom, 3);
});

console.log(`\n${passed} tests passed`);
