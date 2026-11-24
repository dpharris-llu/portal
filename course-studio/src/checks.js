// Course Studio checks: the rules behind the hints.
// Each rule comes from Teaching Well in Higher Ed (Learning Innovation, draft for pilot).
// Every issue names a hint id in content/course.js, so the UI can show "why".
// Works in the browser (window.Checks) and in Node (module.exports).
(function (root) {
  "use strict";

  // ---------- Taxonomies ----------
  const BLOOM = [null, "Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
  const MILLER = [null, "Knows", "Knows how", "Shows how", "Does"];

  // Verbs that do not say what a learner will do (Module 2, Page 2).
  const VAGUE = ["understand", "know", "appreciate", "learn", "grasp", "comprehend", "realize",
    "realise", "value", "gain", "familiar", "aware", "familiarize"];

  // Verb to Bloom level. A starting suggestion; faculty can override it.
  const BLOOM_VERBS = {
    1: ["list", "define", "recall", "name", "state", "recognize", "label", "memorize", "repeat", "identify", "match", "cite"],
    2: ["explain", "describe", "summarize", "classify", "discuss", "paraphrase", "illustrate", "outline", "restate", "report"],
    3: ["apply", "use", "demonstrate", "perform", "calculate", "administer", "execute", "implement", "solve",
      "compute", "conduct", "operate", "practice", "measure", "counsel", "communicate", "educate", "teach",
      "document", "dose", "examine", "obtain", "elicit", "carry"],
    4: ["analyze", "analyse", "differentiate", "distinguish", "interpret", "compare", "contrast", "categorize",
      "diagnose", "investigate", "deconstruct", "relate", "infer"],
    5: ["evaluate", "appraise", "critique", "justify", "judge", "defend", "assess", "prioritize", "recommend",
      "select", "argue", "decide", "choose", "weigh", "manage"],
    6: ["create", "design", "develop", "construct", "formulate", "compose", "plan", "propose", "produce",
      "generate", "devise", "build", "write", "lead"],
  };
  const VERB_LEVEL = {};
  Object.keys(BLOOM_VERBS).forEach(l => BLOOM_VERBS[l].forEach(v => { VERB_LEVEL[v] = Number(l); }));

  // Verbs that describe performance, so the outcome is at least "shows how" on Miller's pyramid.
  const PERFORMANCE_VERBS = ["perform", "demonstrate", "administer", "counsel", "communicate", "conduct",
    "examine", "obtain", "elicit", "educate", "lead", "operate", "manage"];

  // What each assessment type can show (Module 2, Page 3; Module 4, Page 2).
  const ASSESSMENTS = {
    mcq_recall: { label: "Multiple-choice questions (recall)", bloomMax: 2, millerMax: 1 },
    mcq_case: { label: "Case-based or extended questions", bloomMax: 4, millerMax: 2 },
    written_case: { label: "Short written case: justify a decision", bloomMax: 5, millerMax: 2 },
    essay: { label: "Essay, paper or critique", bloomMax: 6, millerMax: 2 },
    oral: { label: "Oral exam or brief viva", bloomMax: 5, millerMax: 2 },
    project: { label: "Project or plan design", bloomMax: 6, millerMax: 2 },
    reflection: { label: "Structured reflection", bloomMax: 5, millerMax: 2 },
    simulation: { label: "Simulation, standardized patient or OSCE", bloomMax: 6, millerMax: 3 },
    observation: { label: "Direct observation or workplace-based assessment", bloomMax: 6, millerMax: 4 },
    portfolio: { label: "Portfolio of supervised practice", bloomMax: 6, millerMax: 4 },
  };

  // What each learning activity lets learners practice (Module 1, Page 5; Module 3, Page 2).
  const ACTIVITIES = {
    lecture: { label: "Mini-lecture or explanation", bloomMax: 2, millerMax: 1, practice: false },
    retrieval: { label: "Retrieval questions or polling", bloomMax: 2, millerMax: 1, practice: true },
    worked_example: { label: "Worked example, steps narrated", bloomMax: 3, millerMax: 2, practice: false },
    think_pair_share: { label: "Think-pair-share", bloomMax: 4, millerMax: 2, practice: true },
    case: { label: "Case-based learning", bloomMax: 5, millerMax: 2, practice: true },
    tbl: { label: "Team-based learning", bloomMax: 5, millerMax: 2, practice: true },
    flipped: { label: "Flipped: application in class", bloomMax: 5, millerMax: 2, practice: true },
    simulation: { label: "Simulation with debrief", bloomMax: 6, millerMax: 3, practice: true },
    reflection: { label: "Reflection or muddiest point", bloomMax: 5, millerMax: 2, practice: true },
    service: { label: "Service learning or community encounter", bloomMax: 6, millerMax: 4, practice: true },
  };

  const words = s => String(s || "").toLowerCase().replace(/[^a-z\s,'-]/g, " ").replace(/,/g, " , ").split(/\s+/).filter(Boolean);

  // Strip "By the end of the session, learners will be able to".
  function stripPreamble(text) {
    let t = String(text || "").trim();
    const m = t.match(/\b(?:be able to|will be able to|able to|will|should)\s+(.*)$/i);
    if (m && /^(by|at|after|upon|on|learners|students|participants|the learner|the student)/i.test(t)) t = m[1];
    return t;
  }

  function verbStem(w) {
    if (VERB_LEVEL[w] !== undefined) return w;
    if (w.endsWith("ies") && VERB_LEVEL[w.slice(0, -3) + "y"] !== undefined) return w.slice(0, -3) + "y";
    if (w.endsWith("es") && VERB_LEVEL[w.slice(0, -2)] !== undefined) return w.slice(0, -2);
    if (w.endsWith("s") && VERB_LEVEL[w.slice(0, -1)] !== undefined) return w.slice(0, -1);
    return null;
  }

  // Outcome verbs sit at the start of the outcome or right after "and", "or", "then" or a comma.
  function findVerbs(text) {
    const toks = words(stripPreamble(text));
    const found = [];
    const vague = [];
    toks.forEach((w, i) => {
      const prev = toks[i - 1];
      const head = i === 0 || prev === "and" || prev === "or" || prev === "then" || prev === "," || prev === "to";
      if (VAGUE.includes(w) && (head || i < 3)) vague.push(w === "familiar" || w === "aware" ? "be " + w + " with" : w);
      if (!head) return;
      const v = verbStem(w);
      if (v && !found.includes(v)) found.push(v);
    });
    return { verbs: found, vague };
  }

  function issue(code, severity, message, hint) { return { code, severity, message, hint }; }

  // Module 2, Page 2: measurable outcomes.
  function analyzeOutcome(text) {
    const result = { verbs: [], bloom: null, millerFloor: null, issues: [] };
    const t = String(text || "").trim();
    if (!t) return result;
    const { verbs, vague } = findVerbs(t);
    result.verbs = verbs;
    if (vague.length) {
      result.issues.push(issue("vague_verb", "gap",
        `"${vague[0]}" does not say what learners will do, so it is hard to teach toward or assess.`, "outcome_verb"));
    }
    if (!verbs.length && !vague.length) {
      result.issues.push(issue("no_verb", "partial",
        "Start with an action verb you could observe or check, such as explain, select or perform.", "outcome_formula"));
    }
    if (verbs.length >= 2) {
      result.issues.push(issue("two_verbs", "note",
        `Two verbs (${verbs.join(", ")}). If they need different assessments, split them. If they are one task, as in "select and justify", keep them together.`, "one_verb"));
    }
    if (words(stripPreamble(t)).length < 6) {
      result.issues.push(issue("no_context", "partial",
        "Add what learners act on and the context or standard: verb + what + context.", "outcome_formula"));
    }
    if (verbs.length) result.bloom = Math.max(...verbs.map(v => VERB_LEVEL[v]));
    if (verbs.some(v => PERFORMANCE_VERBS.includes(v))) result.millerFloor = 3;
    return result;
  }

  function levelOf(list, catalog) {
    const items = (list || []).map(id => catalog[id]).filter(Boolean);
    if (!items.length) return null;
    return {
      bloom: Math.max(...items.map(a => a.bloomMax)),
      miller: Math.max(...items.map(a => a.millerMax)),
      practice: items.some(a => a.practice !== false),
    };
  }

  // Module 2, Pages 4 and 5: constructive alignment and the five misalignment patterns.
  function alignment(design) {
    const o = (design && design.outcome) || {};
    const bloom = Number(o.bloom) || analyzeOutcome(o.text).bloom;
    const miller = Number(o.miller) || null;
    const methods = ((design.session && design.session.segments) || []).map(s => s.method).filter(Boolean);
    const act = levelOf(methods, ACTIVITIES);
    const type = design.assessment && design.assessment.type;
    const asm = type && ASSESSMENTS[type] ? { bloom: ASSESSMENTS[type].bloomMax, miller: ASSESSMENTS[type].millerMax } : null;

    const out = {
      outcome: { bloom, miller },
      practice: { status: "pending", issues: [] },
      assessment: { status: "pending", issues: [] },
      level: { status: "pending", issues: [] },
    };
    if (!bloom) return out;

    if (act) {
      out.practice.status = "aligned";
      if (!act.practice) {
        out.practice.status = bloom >= 3 ? "gap" : "partial";
        out.practice.issues.push(issue("instruction_below", out.practice.status,
          "Learners only listen or watch. They need to practice what the outcome asks, with feedback, before the assessment.", "pattern_instruction_below"));
      } else if (act.bloom < bloom - 1 || (miller && act.miller < miller)) {
        out.practice.status = "gap";
        out.practice.issues.push(issue("instruction_below", "gap",
          `The activities reach ${BLOOM[act.bloom]}${miller ? " / " + MILLER[act.miller] : ""}, below the outcome. Add practice at the outcome's level.`, "pattern_instruction_below"));
      } else if (act.bloom < bloom) {
        out.practice.status = "partial";
        out.practice.issues.push(issue("instruction_below", "partial",
          `Practice reaches ${BLOOM[act.bloom]}; the outcome asks for ${BLOOM[bloom]}. One activity at that level would close the gap.`, "pattern_instruction_below"));
      }
    }

    if (asm) {
      out.assessment.status = "aligned";
      if (miller && miller >= 3 && asm.miller < 3) {
        out.assessment.status = "gap";
        out.assessment.issues.push(issue("wrong_tool", "gap",
          `"${MILLER[miller]}" needs learners to perform. A written or recall format cannot show performance.`, "pattern_wrong_tool"));
      } else if (miller && asm.miller < miller) {
        out.assessment.status = "partial";
        out.assessment.issues.push(issue("wrong_tool", "partial",
          `This format reaches "${MILLER[asm.miller]}"; the outcome is "${MILLER[miller]}".`, "pattern_wrong_tool"));
      }
      if (asm.bloom < bloom) {
        const sev = asm.bloom < bloom - 1 ? "gap" : "partial";
        if (sev === "gap" || out.assessment.status === "aligned") out.assessment.status = sev;
        out.assessment.issues.push(issue("assessment_below", sev,
          `The outcome asks learners to ${BLOOM[bloom].toLowerCase()}; this format mainly checks ${BLOOM[asm.bloom].toLowerCase()}. Raise the task or lower the outcome honestly.`, "pattern_outcome_above"));
      }
    }

    if (act && asm) {
      const worst = [out.practice.status, out.assessment.status];
      out.level.status = worst.includes("gap") ? "gap" : worst.includes("partial") ? "partial" : "aligned";
    }
    return out;
  }

  const sumMinutes = segs => (segs || []).reduce((n, s) => n + (Number(s.minutes) || 0), 0);

  // Module 3, Page 4: a timed outline with practice and feedback.
  function analyzeSession(session) {
    const s = session || {};
    const issues = [];
    const segs = (s.segments || []).filter(x => x.method || x.what);
    const total = sumMinutes(segs);
    const length = Number(s.length) || 0;
    if (length && total > length) issues.push(issue("overtime", "partial",
      `Segments add up to ${total} minutes in a ${length}-minute session. Cut content to protect the activities.`, "protect_time"));
    if (segs.length) {
      let run = 0, longest = 0;
      segs.forEach(x => { if (x.method === "lecture" || x.method === "worked_example") { run += Number(x.minutes) || 0; longest = Math.max(longest, run); } else run = 0; });
      if (longest >= 30) issues.push(issue("long_lecture", "note",
        `${longest} minutes of explanation in a row. Not because attention collapses at 10 minutes (that rule has weak support), but because learners need practice and feedback.`, "attention_myth"));
      if (!segs.some(x => x.method === "retrieval")) issues.push(issue("no_retrieval", "note",
        "No retrieval opener yet. Three no-stakes questions on last week's content take about 3 minutes.", "retrieval"));
    }
    if (segs.length && !String(s.feedbackDuring || "").trim()) issues.push(issue("no_feedback", "partial",
      "How will learners find out during the session whether they were right, and why?", "plan_feedback"));
    return { total, issues };
  }

  const VAGUE_DESCRIPTORS = ["good", "poor", "excellent", "adequate", "satisfactory", "great", "weak", "strong", "fine", "nice"];
  const PERSON_PRAISE = /(you'?re|you are) (a )?(great|strong|smart|good|excellent|bright)|good job|great job|well done|nice work/i;
  const NEXT_STEP = /\b(next time|try|add|consider|start|list|before you|instead|rank|check|revise|include)\b/i;

  // Module 4: assessment, rubrics and feedback.
  function analyzeAssessment(a) {
    const x = a || {};
    const issues = [];
    const crit = (x.rubric || []).filter(r => String(r.criterion || "").trim());
    if (crit.length && (crit.length < 3 || crit.length > 5)) issues.push(issue("criteria_count", "note",
      `${crit.length} criteria. Three to five, each tied to the outcome, keeps scoring consistent and fast.`, "rubric_size"));
    crit.forEach(r => {
      const w = words(r.meets);
      const vague = VAGUE_DESCRIPTORS.find(v => w.includes(v));
      if (vague && w.length < 8) issues.push(issue("vague_descriptor", "partial",
        `"${r.criterion}": "${vague}" is not observable. Describe what Meets looks like.`, "rubric_observable"));
    });
    const fb = String(x.feedbackSample || "").trim();
    if (fb) {
      if (PERSON_PRAISE.test(fb)) issues.push(issue("self_level", "partial",
        "Praise of the person adds little information. Say what was done well in the task.", "feedback_levels"));
      if (!NEXT_STEP.test(fb)) issues.push(issue("no_next_step", "partial",
        "Feedback that changes performance answers \"where to next?\" Add one specific next step.", "feedback_where_next"));
    }
    if (x.type && !String(x.formative || "").trim()) issues.push(issue("no_formative", "partial",
      "Plan at least one low-stakes attempt with feedback before the graded task.", "formative"));
    return { issues };
  }

  // Module 5: AI level chosen from the outcome.
  function analyzeAI(design) {
    const ai = (design && design.ai) || {};
    const miller = Number(design && design.outcome && design.outcome.miller) || 0;
    const issues = [];
    const level = Number(ai.level) || 0;
    if (level >= 3 && (miller >= 3 || String(ai.withoutAI || "").trim())) issues.push(issue("ai_core_skill", "partial",
      "This outcome is a core skill learners must show on their own. Consider no AI for the graded task, with AI allowed in practice.", "ai_level_choose"));
    if (level >= 2 && !String(ai.document || "").trim()) issues.push(issue("ai_document", "partial",
      "Say what learners document about their AI use: the tool, how they used it, what they changed.", "ai_document"));
    const wording = String(ai.wording || "").toLowerCase();
    if (wording && /responsibl|appropriate(ly)?\b|ethical(ly)?\b/.test(wording) && !/assignment|for\s+\w+ing/.test(wording)) issues.push(issue("ai_vague_policy", "partial",
      "\"Use AI responsibly\" leaves learners guessing. Name allowed uses, the assignments, and what to document.", "ai_syllabus"));
    if (/detector|turnitin|gptzero|ai score/i.test(String(ai.misuse || ""))) issues.push(issue("ai_detector", "gap",
      "Detector scores have misclassified non-native English writing. Talk with the student about their process instead.", "ai_detectors"));
    return { issues };
  }

  // Mission lens (draft for review): woven through, not bolted on.
  function analyzeMission(design) {
    const m = (design && design.mission) || {};
    const chosen = (m.dimensions || []).filter(d => d && d.id);
    const issues = [];
    if (!chosen.length) return { chosen: 0, woven: 0, issues };
    const woven = chosen.filter(d => d.outcome || d.activity || d.assessment);
    chosen.filter(d => !(d.outcome || d.activity || d.assessment)).forEach(d => issues.push(issue("bolted_on", "partial",
      "Chosen, but not yet in the outcome, an activity or the assessment. Mission that lives only in a list is bolted on, not woven in.", "mission_woven")));
    if (woven.length && !woven.some(d => d.assessment)) issues.push(issue("mission_unassessed", "note",
      "What we value, we make visible. Could one rubric criterion or reflection prompt show this growth?", "mission_assessed"));
    return { chosen: chosen.length, woven: woven.length, issues };
  }

  // PHI guard: never send patient identifiers to an AI tool (Module 5, Page 4).
  const PHI_PATTERNS = [
    { re: /\b\d{3}-\d{2}-\d{4}\b/, what: "a Social Security number" },
    { re: /\b(mrn|medical record( number)?)\s*[:#]?\s*\d{4,}/i, what: "a medical record number" },
    { re: /\b(dob|date of birth|born)\s*[:]?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/i, what: "a date of birth" },
    { re: /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/, what: "a phone number" },
    { re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, what: "an email address" },
    { re: /\b(patient|pt)\s+(name\s*[:]\s*)?(mr|mrs|ms|miss)\.?\s+[A-Z][a-z]+/, what: "a patient name" },
  ];
  function scanForPHI(text) {
    const s = String(text || "");
    const hit = PHI_PATTERNS.find(p => p.re.test(s));
    return hit ? hit.what : null;
  }

  // Capstone self-check: an estimate against the five criteria. A reviewer decides.
  function capstoneEstimate(design) {
    const d = design || {};
    const has = v => String(v || "").trim().length > 0;
    const out = analyzeOutcome(d.outcome && d.outcome.text);
    const al = alignment(d);
    const ses = analyzeSession(d.session);
    const asm = analyzeAssessment(d.assessment);
    const ai = analyzeAI(d);
    const rate = (meets, approaching) => (meets ? "meets" : approaching ? "approaching" : "notyet");
    const outcomeClean = has(d.outcome && d.outcome.text) && !out.issues.some(i => i.severity === "gap");
    const segs = ((d.session && d.session.segments) || []).filter(s => s.method);
    const rubricOK = ((d.assessment && d.assessment.rubric) || []).filter(r => has(r.criterion) && has(r.meets)).length >= 3;
    const criteria = [
      { id: "alignment", label: "Outcome alignment",
        rating: rate(outcomeClean && al.level.status === "aligned", outcomeClean && al.level.status !== "gap" && al.level.status !== "pending") },
      { id: "active", label: "Modality and active learning",
        rating: rate(has(d.session && d.session.modalityReason) && al.practice.status === "aligned" && has(d.session && d.session.feedbackDuring),
          segs.length > 0 && al.practice.status !== "gap") },
      { id: "assessment", label: "Assessment quality",
        rating: rate(al.assessment.status === "aligned" && rubricOK && has(d.assessment && d.assessment.feedbackRoutine) && !asm.issues.some(i => i.severity !== "note"),
          has(d.assessment && d.assessment.type) && al.assessment.status !== "gap") },
      { id: "ai", label: "AI approach",
        rating: ai.issues.some(i => i.code === "ai_detector") || !(d.ai && d.ai.level) ? "notyet"
          : rate(has(d.ai.reason) && has(d.ai.visible) && has(d.ai.wording) && !ai.issues.length, true) },
      { id: "feasibility", label: "Feasibility and evaluation",
        rating: rate(has(d.evaluation && d.evaluation.measure) && has(d.evaluation && d.evaluation.firstStep) && has(d.evaluation && d.evaluation.firstDate) && !ses.issues.some(i => i.code === "overtime"),
          has(d.evaluation && d.evaluation.firstStep) || has(d.evaluation && d.evaluation.measure)) },
    ];
    const meets = criteria.filter(c => c.rating === "meets").length;
    const notyet = criteria.filter(c => c.rating === "notyet").length;
    return { criteria, meets, notyet, badgeLikely: meets >= 4 && notyet === 0 };
  }

  const api = {
    BLOOM, MILLER, ASSESSMENTS, ACTIVITIES, PERFORMANCE_VERBS,
    analyzeOutcome, alignment, analyzeSession, analyzeAssessment, analyzeAI, analyzeMission,
    scanForPHI, capstoneEstimate, sumMinutes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Checks = api;
})(typeof window !== "undefined" ? window : globalThis);
