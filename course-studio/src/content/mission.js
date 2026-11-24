// Mission lens: a PROPOSED addition to Teaching Well in Higher Ed.
// Drafted by Claude for the POC. Not institutional language. Pending review by the course owner.
// Mission hints carry the Mission mark, never an evidence-strength rating: they state values
// LLU holds, not research findings. Where a framework supports them, it is named as a framework.
(function (root) {
  "use strict";

  const REVIEW = {
    status: "Draft for review",
    reviewer: "Course owner",
    note: "All wording below is a draft written for this proof of concept. Confirm official mission wording and theme definitions before faculty see it.",
  };

  // Institutional anchors. Wording to confirm against official sources.
  const ANCHORS = {
    mission: { text: "To continue the teaching and healing ministry of Jesus Christ", label: "LLUH mission", confirm: true },
    motto: { text: "To make man whole", label: "University motto", confirm: true },
    themes: [
      { id: "sfs", name: "Scholarship for Service", who: "Current Chancellor and Provost", current: true,
        draft: "Rigorous, evidence-based learning pursued for the sake of others: patients, families, communities and the world. Scholarship is not the end; service is what it is for." },
      { id: "mfl", name: "Mission-Focused Learning", who: "Previous Provost", current: false,
        draft: "Learning in which the mission shapes the outcomes, experiences and assessment of a course, rather than being added on at the end." },
    ],
  };

  // Dimensions faculty can weave in. Each offers a question for the outcome, an activity, and the assessment.
  const DIMENSIONS = [
    { id: "whole_person", label: "Whole-person care", icon: "whole",
      short: "Physical, mental, social and spiritual dimensions of health",
      outcome: "Could the outcome ask learners to consider the whole person, not only the condition?",
      activity: "Could the case include the patient's family, beliefs, fears or social situation?",
      assessment: "Could one rubric criterion look for attention to the whole person?",
      example: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity, taking into account the patient's stated goals and circumstances." },
    { id: "service", label: "Scholarship for service", icon: "service",
      short: "Knowledge pursued for the sake of others",
      outcome: "Who is served when a learner masters this outcome? Can the outcome say so?",
      activity: "Could an activity connect the content to a real community, clinic or service need?",
      assessment: "Could the task produce something of use to someone beyond the grader?",
      example: "Appraise a study on opioid-sparing analgesia and write a one-page summary a community clinic could use." },
    { id: "compassion", label: "Compassion and presence", icon: "heart",
      short: "Seeing and responding to suffering",
      outcome: "Is there a moment in this outcome where how the learner is present matters as much as what they know?",
      activity: "Could learners hear a patient story, or practice delivering hard news with a standardized patient?",
      assessment: "Could observed communication or a reflection show growth in presence?",
      example: "Communicate a new diagnosis to a standardized patient using a structured, compassionate approach." },
    { id: "ethics", label: "Integrity and ethical reasoning", icon: "scale",
      short: "Doing right when it is costly or unclear",
      outcome: "Does this content carry an ethical decision learners will face in practice?",
      activity: "Could a case include a dilemma where the evidence and the patient's values pull apart?",
      assessment: "Could learners justify a decision in ethical as well as clinical terms?",
      example: "Justify a treatment plan when guideline evidence conflicts with a patient's stated wishes." },
    { id: "identity", label: "Professional identity formation", icon: "identity",
      short: "Becoming, not only knowing and doing",
      outcome: "Beyond \"does,\" who is the learner becoming? Some authors propose a fifth level above Miller's pyramid: \"is.\"",
      activity: "Could learners reflect on a role model, a mistake, or what kind of clinician they want to be?",
      assessment: "Could a structured reflection or portfolio entry show formation over time?",
      example: "Reflect on a clinical encounter in which your values were tested, and name what you will carry forward." },
    { id: "interprofessional", label: "Interprofessional collaboration", icon: "team",
      short: "No one heals alone",
      outcome: "Does this outcome involve another profession's role? Can it name it?",
      activity: "Could learners from another LLU school join one case or simulation?",
      assessment: "Could learners identify each team member's contribution, or a gap in a team plan?",
      example: "Describe how each team member contributes to a discharge plan and identify a gap in a sample plan." },
    { id: "equity", label: "Justice and health equity", icon: "equity",
      short: "Care for the underserved and the overlooked",
      outcome: "Whose access, cost or circumstances would change how this outcome plays out?",
      activity: "Could the case vary the patient's insurance, language or neighborhood and ask what changes?",
      assessment: "Could learners adapt their plan for a patient with fewer resources?",
      example: "Adapt a first-line treatment plan for a patient who cannot afford the preferred drug." },
    { id: "wholeness", label: "Wholeness for learners and faculty", icon: "rest",
      short: "Sustainable effort, rest, and care for the people doing the learning",
      outcome: "Is the workload this outcome asks for humane?",
      activity: "Does the session respect learners' time, and model rest rather than heroics?",
      assessment: "Is the feedback plan sustainable for you, too?",
      example: "Cut one low-value assignment to make room for practice with feedback." },
  ];

  const HINTS = {
    mission_design_input: { title: "Mission is a design input", hint: "Not a paragraph pasted into the syllabus, but a question asked at every step.", deeper: "Scholarship for Service asks what our learning is for. A course embodies the mission when its outcomes, experiences and assessments are shaped by that answer.", kind: "mission" },
    mission_woven: { title: "Woven, not bolted on", hint: "Mission that lives only in a list is decoration. Connect it to the outcome, an activity or the assessment.", deeper: "Choose one to three dimensions that genuinely fit this course, and show where each one lives. One dimension done well beats eight mentioned.", kind: "mission" },
    mission_assessed: { title: "What we value, we make visible", hint: "If a dimension never appears in assessment, learners may conclude it does not count.", deeper: "A rubric criterion, an observed behavior or a structured reflection can show growth without grading faith or character.", kind: "mission" },
    mission_identity: { title: "Becoming, not only doing", hint: "Professional identity formation has been proposed as a level above \"does\" on Miller's pyramid.", deeper: "The course cites this proposal (Academic Medicine, 2016). It is a framework, not a tested law, which fits how the course treats Miller's pyramid itself.", kind: "mission", evidence: ["miller"] },
    mission_honest: { title: "Values, stated as values", hint: "Mission hints carry this mark instead of an evidence rating.", deeper: "The course is careful to say how strong its evidence is. The mission lens keeps that honesty by stating LLU's commitments as commitments, not research findings.", kind: "mission" },
    mission_outcome: { title: "Who is served?", hint: "When a learner masters this outcome, who benefits? Can the outcome say so?", deeper: "Scholarship for Service: knowledge pursued for the sake of others. The service may be implied in many outcomes; naming it makes it teachable.", kind: "mission" },
  };

  const api = { REVIEW, ANCHORS, DIMENSIONS, HINTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MISSION = api;
})(typeof window !== "undefined" ? window : globalThis);
