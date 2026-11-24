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
      "document", "dose", "examine", "obtain", "elicit", "carry", "adjust", "modify", "titrate", "monitor", "adapt", "convert"],
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
  // One chain: an outcome's level, the methods that practice it, the assessment formats that show it.
  function chainStatus(bloom, miller, methods, assessmentTypes) {
    const act = levelOf(methods, ACTIVITIES);
    const asm = levelOf(assessmentTypes, ASSESSMENTS);
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

  function outcomeLevel(o) {
    const x = o || {};
    return { bloom: Number(x.bloom) || analyzeOutcome(x.text).bloom, miller: Number(x.miller) || null };
  }

  // Single-chain view, used for the capstone's focus outcome.
  function alignment(design) {
    const d = design || {};
    const lv = outcomeLevel(d.outcome);
    const methods = ((d.session && d.session.segments) || []).map(s => s.method).filter(Boolean);
    const type = d.assessment && d.assessment.type;
    return chainStatus(lv.bloom, lv.miller, methods, type ? [type] : []);
  }

  // ---------- Course level ----------
  const worst = list => (list.includes("gap") ? "gap" : list.includes("partial") ? "partial" : list.every(s => s === "aligned") && list.length ? "aligned" : "pending");

  // The alignment matrix: every outcome against the weeks that practice it and the assessments that show it.
  function courseMatrix(course) {
    const c = course || {};
    const outcomes = (c.outcomes || []).filter(o => String(o.text || "").trim());
    const weeks = (c.weeks || []).filter(w => w && (String(w.topic || "").trim() || (w.outcomes || []).length || (w.methods || []).length));
    const assessments = (c.assessments || []).filter(a => a && (String(a.name || "").trim() || a.type));
    const rows = outcomes.map(o => {
      const lv = outcomeLevel(o);
      const ws = weeks.filter(w => (w.outcomes || []).includes(o.id));
      const as = assessments.filter(a => (a.outcomes || []).includes(o.id));
      const methods = [...new Set(ws.flatMap(w => w.methods || []))];
      const chain = chainStatus(lv.bloom, lv.miller, methods, as.map(a => a.type).filter(Boolean));
      const issues = chain.practice.issues.concat(chain.assessment.issues);
      const oa = analyzeOutcome(o.text);
      if (oa.issues.some(i => i.code === "vague_verb")) issues.unshift(issue("vague_outcome", "gap", "The verb does not say what learners will do, so it cannot be aligned. Rewrite it in step 2.", "outcome_verb"));
      else if (!lv.bloom) issues.unshift(issue("no_level", "partial", "Set a Bloom level for this outcome in step 2. Its verb did not suggest one.", "bloom"));
      if (!ws.length) {
        chain.practice.status = "gap";
        issues.unshift(issue("never_practiced", "gap", "No week practices this outcome yet. Tag the weeks where learners work on it.", "alignment_chain"));
      } else if (!methods.length) {
        issues.unshift(issue("no_methods", "partial", "The weeks for this outcome have no learning methods yet.", "method_fit"));
      }
      if (!as.length) {
        chain.assessment.status = "gap";
        issues.push(issue("never_assessed", "gap", "No assessment shows this outcome. An outcome you never assess is a hope, not an outcome.", "alignment_chain"));
      }
      const summ = as.filter(a => !a.formative);
      const form = as.filter(a => a.formative);
      if (summ.length && !form.length) issues.push(issue("no_formative", "partial", "Graded only. Add a low-stakes attempt with feedback before the graded one.", "formative"));
      else if (summ.length && form.length) {
        const firstGraded = Math.min(...summ.map(a => Number(a.week) || 99));
        if (!form.some(a => (Number(a.week) || 0) <= firstGraded)) issues.push(issue("formative_late", "partial", "The practice attempt comes after the first graded one. Move it earlier.", "formative"));
      }
      const nums = [...new Set(ws.map(w => Number(w.n)).filter(Boolean))].sort((a, b) => a - b);
      if (nums.length === 1 && weeks.length >= 4) issues.push(issue("not_spaced", "note", `Taught in week ${nums[0]} only. Revisit it in later weeks.`, "spacing"));
      const status = issues.some(i => i.code === "vague_outcome") ? "gap" : worst([chain.practice.status, chain.assessment.status]);
      return { outcome: o, bloom: lv.bloom, miller: lv.miller, weeks: nums, assessments: as, chain, issues, status };
    });
    const orphans = assessments.filter(a => !(a.outcomes || []).length).map(a => issue("orphan_assessment", "partial",
      `"${a.name || "Untitled assessment"}" is tied to no outcome. Tie it to one, or consider cutting it.`, "pattern_never_taught"));
    const weekOrphans = weeks.filter(w => String(w.topic || "").trim() && !(w.outcomes || []).length).map(w => issue("orphan_week", "note",
      `Week ${w.n} (${w.topic}) serves no outcome yet.`, "alignment_chain"));
    const issues = [];
    if (outcomes.length > 8) issues.push(issue("too_many", "note", `${outcomes.length} outcomes. Fewer, stronger outcomes are easier to teach and assess.`, "few_outcomes"));
    return { rows, orphans, weekOrphans, issues, status: rows.length ? worst(rows.map(r => r.status)) : "pending" };
  }

  // Assessment weights and stakes (Module 4, Page 1).
  function analyzeWeights(course) {
    const as = ((course && course.assessments) || []).filter(a => a && (a.name || a.type));
    const issues = [];
    const total = as.reduce((n, a) => n + (Number(a.weight) || 0), 0);
    if (as.length && total !== 100) issues.push(issue("weights_total", "partial", `Weights add up to ${total}%, not 100%.`, "weights"));
    const big = as.filter(a => (Number(a.weight) || 0) >= 40);
    big.forEach(a => issues.push(issue("high_stakes", "note", `"${a.name}" carries ${a.weight}% of the grade. Learners need practice and feedback before an event this large.`, "formative")));
    if (as.length && !as.some(a => a.formative)) issues.push(issue("no_formative_course", "partial", "No low-stakes practice anywhere in the course.", "formative"));
    return { total, issues };
  }

  // Term workload against the federal credit-hour definition: about 1 hour in class and 2 hours
  // outside class per credit per week. LLU programs mostly run on quarters.
  function analyzeWorkload(course) {
    const c = (course && course.course) || {};
    const credits = Number(c.credits) || 0;
    const nWeeks = Number(c.weeks) || 0;
    const weeks = (course && course.weeks) || [];
    const classHours = weeks.reduce((n, w) => n + (Number(w.classMinutes) || 0) / 60, 0);
    const outHours = weeks.reduce((n, w) => n + (Number(w.outHours) || 0), 0);
    const asmHours = ((course && course.assessments) || []).reduce((n, a) => n + (Number(a.hours) || 0), 0);
    const planned = Math.round(classHours + outHours + asmHours);
    const expected = credits && nWeeks ? credits * 3 * nWeeks : 0;
    const issues = [];
    if (expected && planned > expected * 1.15) issues.push(issue("over_workload", "partial",
      `About ${planned} hours planned against roughly ${expected} expected for ${credits} credits over ${nWeeks} weeks. Cut something to make room.`, "workload"));
    else if (expected && planned && planned < expected * 0.6) issues.push(issue("under_workload", "note",
      `About ${planned} hours planned against roughly ${expected} expected. Is some learner work not yet listed?`, "workload"));
    return { credits, weeks: nWeeks, classHours: Math.round(classHours), outHours: Math.round(outHours), asmHours: Math.round(asmHours), planned, expected, issues };
  }

  // AI level per assessment, chosen from the outcomes it shows (Module 5, Page 2).
  function analyzeAssessmentAI(a, outcomes) {
    const linked = (outcomes || []).filter(o => ((a && a.outcomes) || []).includes(o.id));
    const miller = Math.max(0, ...linked.map(o => Number(o.miller) || 0));
    const issues = [];
    const level = Number(a && a.aiLevel) || 0;
    if (a && !a.formative && level >= 3 && miller >= 3) issues.push(issue("ai_core_skill", "partial",
      `"${a.name}" assesses a skill learners must show on their own. Consider no AI for this graded task, with AI allowed in practice.`, "ai_level_choose"));
    return { level, miller, issues };
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
    const lives = d => d.outcome || d.activity || d.assessment || (d.outcomes || []).length || (d.weeks || []).length || (d.assessments || []).length;
    const assessed = d => d.assessment || (d.assessments || []).length;
    const woven = chosen.filter(lives);
    chosen.filter(d => !lives(d)).forEach(d => issues.push(issue("bolted_on", "partial",
      "Chosen, but not yet in the outcome, an activity or the assessment. Mission that lives only in a list is bolted on, not woven in.", "mission_woven")));
    if (woven.length && !woven.some(assessed)) issues.push(issue("mission_unassessed", "note",
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
    analyzeOutcome, outcomeLevel, chainStatus, alignment, courseMatrix, analyzeWeights, analyzeWorkload, analyzeAssessmentAI, analyzeSession, analyzeAssessment, analyzeAI, analyzeMission,
    scanForPHI, capstoneEstimate, sumMinutes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Checks = api;
})(typeof window !== "undefined" ? window : globalThis);
