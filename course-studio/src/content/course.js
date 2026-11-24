// Content from "Teaching Well in Higher Ed" (Learning Innovation; draft for build and pilot).
// The studio reads this file; it does not rewrite the course. Edit here when the course changes.
// Evidence strengths are the course author's ratings. Citations are flagged in the course as
// needing verification before publication, and that flag carries through to the studio.
(function (root) {
  "use strict";

  const SOURCE = {
    title: "Teaching Well in Higher Ed",
    owner: "Learning Innovation",
    status: "Draft for build and pilot. Citations and the badge threshold need verification before publication.",
    lastReviewed: "2026-11 (draft)",
  };

  // Evidence marks. Text always accompanies the symbol, so color is never the only signal.
  const STRENGTH = {
    strong: { label: "Strong evidence", short: "Strong", dots: 3 },
    moderate: { label: "Moderate evidence", short: "Moderate", dots: 2 },
    limited: { label: "Limited evidence", short: "Limited", dots: 1 },
    framework: { label: "Framework: a planning tool, not a tested law", short: "Framework", dots: 0 },
    design: { label: "Design choice: tested by this program's own evaluation", short: "Design choice", dots: 0 },
    mission: { label: "Mission: a value LLU holds, not an empirical claim", short: "Mission", dots: 0 },
  };

  // Rows from the Evidence section of each module.
  const EVIDENCE = {
    retrieval_spacing: { claim: "Practice testing and spacing are the most useful common study techniques", strength: "strong", support: "Large review of ten techniques (Dunlosky et al. 2013)", module: 1 },
    neuromyths: { claim: "Learning-style matching and similar beliefs are neuromyths", strength: "strong", support: "Surveys and reviews of educators (Howard-Jones 2014; Dekker et al. 2012)", module: 1 },
    cognitive_load: { claim: "Cognitive load limits learning; conventional problem solving can slow schema building", strength: "strong", support: "Foundational theory and experiments (Sweller 1988)", module: 1 },
    expert_blind_spot: { claim: "Experts overlook novices' difficulties", strength: "moderate", support: "Studies of teachers and mathematics expertise (Nathan & Petrosino 2003)", caveat: "Transfer to clinical teaching is plausible but untested.", module: 1 },
    andragogy: { claim: "Andragogy's assumptions fit what cognitive science shows", strength: "limited", support: "Conceptual reviews (Hagen & Park 2016)", caveat: "Indirect support. Novices often need more structure than the framework suggests.", module: 1 },
    backward_design: { claim: "Plan backward from desired results, then evidence, then activities", strength: "framework", support: "Understanding by Design (Wiggins & McTighe 2005)", module: 2 },
    alignment: { claim: "Aligning outcomes, activities and assessment improves learning", strength: "limited", support: "Small experimental and program studies (Biggs 1996; Zhang et al. 2022)", caveat: "Moderate to limited; studies cannot isolate alignment from other changes.", module: 2 },
    transfer_processing: { claim: "Practice should resemble the later task", strength: "moderate", support: "Transfer-appropriate processing (Morris, Bransford & Franks 1977)", caveat: "Lab-based.", module: 2 },
    miller: { claim: "Different competence levels need different assessment methods", strength: "framework", support: "Miller's pyramid (Miller 1990) and its critiques", module: 2 },
    bloom: { claim: "Bloom's levels help match outcomes to assessments", strength: "framework", support: "Revised taxonomy (Anderson & Krathwohl 2001)", module: 2 },
    active_learning: { claim: "Active learning improves exam performance and lowers failure rates compared with lecture", strength: "strong", support: "Freeman et al. 2014", caveat: "STEM undergraduates; not clinical specifically.", module: 3 },
    feeling_of_learning: { claim: "Learners can feel they learn less in active classes while learning more", strength: "moderate", support: "Deslauriers et al. 2019", caveat: "One randomized design, in physics.", module: 3 },
    flipped: { claim: "Flipped classrooms improve learning in health professions education", strength: "moderate", support: "Hew & Lo 2018 (28 comparative studies)", module: 3 },
    simulation: { claim: "Technology-enhanced simulation improves knowledge, skills and behaviors", strength: "strong", support: "Cook et al. 2011; Mitchell & Ivimey-Cook 2023", caveat: "Weaker for patient outcomes.", module: 3 },
    tbl: { claim: "Team-based learning looks beneficial in health professions education", strength: "limited", support: "Umbrella review 2024; BEME review", caveat: "Moderate to limited; reviews are uneven.", module: 3 },
    blended: { claim: "Blended designs show a modest advantage over face-to-face", strength: "limited", support: "Means et al. 2010", caveat: "Confounded by added time and instructional elements.", module: 3 },
    coi: { claim: "Community of Inquiry as a design framework", strength: "framework", support: "Garrison, Anderson & Archer 2000", module: 3 },
    attention_myth: { claim: "The 10 to 15 minute attention limit is poorly supported", strength: "moderate", support: "Wilson & Korn 2007; Bradbury 2016", module: 3 },
    udl: { claim: "Universal Design for Learning as a practical design approach", strength: "framework", support: "Presented for access and inclusion", caveat: "Its brain-network claims have been criticized as weakly supported.", module: 3 },
    testing_effect: { claim: "Testing improves delayed retention compared with restudying", strength: "strong", support: "Roediger & Karpicke 2006", module: 4 },
    formative: { claim: "Strengthening formative assessment can raise achievement", strength: "moderate", support: "Black & Wiliam 1998", caveat: "Review of varied studies; dated.", module: 4 },
    feedback_effect: { claim: "Feedback has a medium average effect, with large variation by type", strength: "moderate", support: "Wisniewski, Zierer & Hattie 2020 (435 studies); Hattie & Timperley 2007", module: 4 },
    feedback_levels: { claim: "Task, process and self-regulation feedback help more than praise of the person", strength: "moderate", support: "Hattie & Timperley 2007", module: 4 },
    rubrics: { claim: "Rubrics can support learning when learners use them", strength: "limited", support: "Panadero & Jonsson 2013 (21 studies)", caveat: "Findings are mixed; benefit depends on use.", module: 4 },
    feedback_principles: { claim: "Feedback principles that build learner self-regulation", strength: "framework", support: "Nicol & Macfarlane-Dick 2006", module: 4 },
    ai_crutch: { claim: "Unrestricted AI help can raise practice performance while lowering later unaided performance", strength: "moderate", support: "Bastani et al. 2025 (field experiment)", caveat: "One subject and age group; safeguards reduced the harm.", module: 5 },
    ai_offloading: { claim: "AI support can improve task output without improving knowledge gain or transfer", strength: "limited", support: "Fan et al. 2024 (117 university students)", caveat: "One task; preprint when retrieved.", module: 5 },
    ai_hpe: { claim: "Health professions learners use AI widely, with benefits and concerns", strength: "moderate", support: "Medical Education systematic review, 2025 (33 studies)", caveat: "Mostly self-report and short-term.", module: 5 },
    detectors: { claim: "GPT detectors misclassify non-native English writing", strength: "moderate", support: "Liang et al. 2023", caveat: "Detectors have changed since.", module: 5 },
    aias: { claim: "AI Assessment Scale for choosing levels of AI use", strength: "framework", support: "Perkins et al. 2024 and revised version", caveat: "Not tested for effects on learning; check the current wording.", module: 5 },
    faculty_dev: { claim: "Evidence for faculty development beyond satisfaction is thin", strength: "moderate", support: "Steinert et al. 2006, 2016; Leslie et al. 2013", module: 6 },
    capstone_design: { claim: "A reviewed capstone with a rubric improves teaching practice", strength: "design", support: "Not established; this program will test it", module: 6 },
  };

  // Hints: glance (symbol), hint (one line), deeper (the course page). kind sets the mark.
  const HINTS = {
    backward_design: { title: "Start from the outcome", hint: "Deciding the destination first tells you what to cut, what to practice and what to assess.", deeper: "Backward design plans in three stages: identify desired results, determine acceptable evidence, then plan learning experiences. Content is endless and time is not.", example: "Topic-first: \"Cover hypertension in 90 minutes.\" Outcome-first: \"Select and justify a first-line treatment for a patient with hypertension and a comorbidity.\" The second tells you the session needs a case and a decision, not a drug list.", source: [2, 1], evidence: ["backward_design"] },
    one_outcome: { title: "One outcome, all the way through", hint: "One outcome aligned from session to assessment is enough. Focused and realistic beats a whole-course rewrite.", deeper: "Pick one course you teach this term or soon, and one outcome to follow through every step. Small changes teach you more than a perfect plan.", source: [0, "Get the most from it"], evidence: ["capstone_design"], kind: "design" },
    outcome_formula: { title: "Verb + what + context", hint: "A useful outcome describes something learners can do that you could observe or check.", deeper: "By the end of [session or unit], learners will be able to [action verb] + [what] + [context or standard]. Write it in learner language, since learners will read it.", example: "Weak: \"Know the signs of sepsis.\" Stronger: \"Identify early signs of sepsis in a case vignette and state the first three actions.\"", source: [2, 2], evidence: ["bloom"] },
    outcome_verb: { title: "Replace vague verbs", hint: "\"Understand,\" \"know\" and \"appreciate\" cannot be taught toward or assessed. Name the thinking you want.", deeper: "Vague verbs do not say what the learner will do. Replace them with a verb that shows the thinking: explain, select, justify, perform, appraise.", example: "\"Appreciate the role of the interprofessional team\" becomes \"Describe how each team member contributes to a discharge plan and identify a gap in a sample plan.\"", source: [2, 2], evidence: ["bloom"] },
    one_verb: { title: "One verb per outcome?", hint: "\"Describe and evaluate\" is two outcomes with two different assessments.", deeper: "If two verbs need different evidence, split them. If they form one task, such as \"select and justify,\" keep them together and assess them together.", source: [2, 2], evidence: ["bloom"] },
    few_outcomes: { title: "A few strong outcomes", hint: "Fewer, stronger outcomes are easier to teach and assess, which makes alignment possible.", deeper: "Fourteen outcomes in a one-hour session cannot all be practiced and assessed. Prioritize, combine or cut.", source: [2, 5], evidence: ["alignment"] },
    bloom: { title: "Name the level of thinking", hint: "An outcome pitched at the wrong level means the activity and exam test something different from what you meant.", deeper: "Revised Bloom's: remember, understand, apply, analyze, evaluate, create. Higher is not better for every outcome; it is right when the work requires it.", source: [2, 3], evidence: ["bloom"] },
    miller: { title: "Name the level of competence", hint: "Each level of Miller's pyramid calls for a different kind of assessment.", deeper: "Knows (written exam), knows how (case-based questions), shows how (simulation, standardized patient, OSCE), does (direct observation in practice). If the outcome is \"shows how\" or \"does,\" a written exam alone cannot assess it.", source: [2, 3], evidence: ["miller"] },
    alignment_chain: { title: "Practice, assessment, level", hint: "Learners do best when what they practice is what they are assessed on.", deeper: "For every outcome ask: do learners practice it? Does the assessment ask them to show it? Do all three sit at the same level? Any outcome missing from an activity or an assessment is a gap. Any activity or assessment tied to no outcome is a candidate to cut.", source: [2, 4], evidence: ["alignment", "transfer_processing"] },
    pattern_outcome_above: { title: "Outcome higher than the assessment", hint: "The outcome says \"analyze,\" but the exam only asks for recall.", deeper: "Fix: add case-based or open-ended questions at the stated level, or lower the outcome honestly.", source: [2, 5], evidence: ["alignment", "bloom"] },
    pattern_instruction_below: { title: "Assessment higher than the instruction", hint: "The exam asks for application, but class time was lecture only.", deeper: "Fix: add practice with feedback before the assessment. If learners only listen but are assessed on applying knowledge to new cases, they have not practiced the task.", source: [2, 5], evidence: ["alignment", "transfer_processing"] },
    pattern_wrong_tool: { title: "Wrong tool for the level", hint: "A performance skill assessed only by a written test.", deeper: "Fix: use observation, simulation or a checklist. A written test cannot show performance.", example: "\"Demonstrate a focused cardiac exam\" taught by video and assessed by a written test of the steps is not aligned.", source: [2, 5], evidence: ["miller"] },
    pattern_never_taught: { title: "Content never taught", hint: "Does the exam cover anything not in the outcomes or activities?", deeper: "Teach it, or remove it from the exam.", source: [2, 5], evidence: ["alignment"] },

    andragogy: { title: "Open with why it matters", hint: "Adults commit effort when they see how learning connects to their role.", deeper: "Need to know, self-concept, experience, readiness, problem orientation, internal motivation. Open with the clinical or professional problem the content solves. A framework to design with, not a rulebook.", source: [1, 1], evidence: ["andragogy"] },
    retrieval: { title: "Start with retrieval", hint: "Recalling from memory strengthens learning more than rereading. Three no-stakes questions take about 3 minutes.", deeper: "Quizzing is not only measurement; recall strengthens memory. Tell learners why, because they tend to prefer rereading.", source: [1, 2], evidence: ["retrieval_spacing", "testing_effect"] },
    spacing: { title: "Space it", hint: "Revisit key content in weeks 2, 4 and 8 instead of covering it once.", deeper: "Distributed practice is one of the two highest-utility strategies. It takes a few minutes of planning.", source: [1, 2], evidence: ["retrieval_spacing"] },
    concrete_first: { title: "Concrete before abstract", hint: "Give a case first, then name the principle.", deeper: "Adults prefer learning organized around problems, not subjects. Reordering existing content is often enough.", source: [1, 5], evidence: ["andragogy"] },
    cognitive_load: { title: "Cut extraneous load", hint: "Working memory is limited. Remove what does not serve the goal.", deeper: "You cannot change a topic's inherent complexity much, but you can remove decorative images and slides that duplicate what you say, and chunk new concepts across practice.", source: [1, 4], evidence: ["cognitive_load"] },
    expert_blind_spot: { title: "Make the steps visible", hint: "Steps you perform automatically become invisible, so explanations skip them.", deeper: "Break complex explanations into steps and say the \"obvious\" parts aloud. Use worked examples before asking learners to solve alone. Ask a recent learner where they got lost.", example: "An attending explains a differential in one fluent pass. The resident nods, but did not catch how each finding narrowed the list.", source: [1, 4], evidence: ["expert_blind_spot", "cognitive_load"] },
    neuromyth_styles: { title: "Learning styles are a myth", hint: "Matching instruction to a preferred style is not supported. Choose the format the content calls for.", deeper: "Show an anatomy diagram; practice a procedure hands-on. Offer more than one way to engage because it helps everyone and improves access.", source: [1, 3], evidence: ["neuromyths"] },

    active_why: { title: "Why active learning", hint: "Learners remember and use what they do more than what they only hear.", deeper: "Active learning raised exam performance by close to half a standard deviation in a large STEM meta-analysis; lecture-only students were about twice as likely to fail. It does not mean no lecture.", source: [3, 1], evidence: ["active_learning", "flipped"] },
    feels_worse: { title: "It may feel less effective", hint: "Effortful practice can feel like struggle. Tell learners early why the activities are there.", deeper: "In a randomized physics study, students in active classes learned more but rated their learning lower than students who heard polished lectures.", source: [3, 1], evidence: ["feeling_of_learning"] },
    method_fit: { title: "Choose the method for the outcome", hint: "Choosing a method because it fits your outcome is more useful than adopting a trend.", deeper: "Retrieval and polling, think-pair-share, case-based learning, team-based learning, flipped classroom, simulation. Start small: one well-run active segment beats a redesign you cannot sustain.", source: [3, 2], evidence: ["active_learning", "simulation", "tbl"] },
    modality: { title: "Modality serves the outcome", hint: "Pick the modality that lets learners practice the outcome with feedback.", deeper: "Hands-on skills and team coordination: in person or simulation. Real-time discussion: synchronous. Foundational content: asynchronous with retrieval checks. Reflection: asynchronous. A mix: asynchronous preparation, then live application. Design quality matters more than delivery format.", source: [3, 3], evidence: ["blended"] },
    protect_time: { title: "Protect time", hint: "Activities fail when they are rushed. Cut content to make room.", deeper: "Identify the two or three ideas learners must grasp; move the rest to pre-class material. Time-box each segment and have a fallback.", source: [3, 4], evidence: ["active_learning"] },
    attention_myth: { title: "The 10-minute rule", hint: "Break up a lecture to add practice and feedback, not to catch a wandering mind.", deeper: "A review found little support for a fixed 10 to 15 minute attention limit. You do not need to chop sessions by a stopwatch.", source: [3, 4], evidence: ["attention_myth"] },
    plan_feedback: { title: "Plan feedback", hint: "Learners need to learn whether their answer was right and why.", deeper: "Debrief after each activity and correct misconceptions. End with a muddiest point to plan your next session.", source: [3, 2], evidence: ["feedback_effect"] },
    presence: { title: "Presence online", hint: "Online learners can feel invisible. Plan teaching, social and cognitive presence.", deeper: "Clear instructions and timely feedback; short introductions and small groups; open prompts that require reasoning.", source: [3, 5], evidence: ["coi"] },
    udl: { title: "Design for every learner", hint: "Caption, use real headings and alt text, and offer more than one way to show learning.", deeper: "Universal Design for Learning plans for variability up front. The case rests on access and inclusion, not neuroscience.", source: [3, 5], evidence: ["udl"] },
    tell_why: { title: "Tell learners why", hint: "Explaining the purpose of an activity counters the feeling that struggle means poor teaching.", deeper: "Say early that effort is a sign of learning. Name the outcome the activity serves.", source: [3, 1], evidence: ["feeling_of_learning"] },

    formative: { title: "Practice before the graded event", hint: "Low-stakes attempts with feedback let learners practice retrieval and correct errors.", deeper: "Students who took memory tests remembered more a week later than students who restudied, even though restudying made them feel more confident.", source: [4, 1], evidence: ["testing_effect", "formative"] },
    authentic: { title: "Assess what the outcome says", hint: "If a learner succeeds on the task, does that show they can do what the outcome says?", deeper: "Authentic assessment asks learners to perform tasks like those in practice: cases, simulations, observed performance, portfolios, structured reflection. Multiple-choice still works for knowledge, best when distractors reflect real misconceptions.", example: "Outcome \"counsel a patient on a new medication\": weak match is MCQ recall of side effects; stronger is a simulated counseling encounter scored with a rubric.", source: [4, 2], evidence: ["transfer_processing"] },
    rubric_size: { title: "Three to five criteria", hint: "Each criterion tied to the outcome keeps scoring consistent and fast.", deeper: "List the criteria you will judge and describe what each level of performance looks like.", source: [4, 3], evidence: ["rubrics"] },
    rubric_observable: { title: "Describe what you can observe", hint: "Words like \"good\" or \"poor\" do not tell learners what good looks like.", deeper: "Meets: \"Justifies the decision using patient data and evidence.\" Not: \"Good reasoning.\"", source: [4, 3], evidence: ["rubrics"] },
    rubric_use: { title: "Rubrics help when learners use them", hint: "Share the rubric with the assignment; have learners check their own or a peer's draft.", deeper: "A review of 21 studies found results were not uniform. The benefit depends on how rubrics are used, not on whether one exists.", source: [4, 3], evidence: ["rubrics"] },
    feedback_where_next: { title: "Where am I going, how, where next?", hint: "Feedback that answers \"where to next\" gives learners something to act on.", deeper: "Give it while learners can still use it, limit it to two or three points, and ask learners what they will change.", source: [4, 4], evidence: ["feedback_effect"] },
    feedback_levels: { title: "Feedback on the task, not the person", hint: "Task, process and self-regulation feedback help most. Praise of the person adds little information.", deeper: "Task: \"Your differential misses the cardiac causes.\" Process: \"Try ranking dangerous causes first.\" Self-regulation: \"Check your plan against the rubric.\" Self: \"You're a great student\" (least useful).", source: [4, 4], evidence: ["feedback_levels"] },
    feedback_scale: { title: "Feedback you can sustain", hint: "Good feedback is only useful if you can keep giving it.", deeper: "Auto-graded practice with explanations, common-error comments, peer feedback with a rubric, self-assessment before submission, audio feedback, or feedback on one or two criteria.", source: [4, 5], evidence: ["feedback_principles"] },
    fairness: { title: "Fairness", hint: "Score against the rubric, not other learners; plan accommodations in advance.", deeper: "Grade without names where you can, and offer a clear process for questions or re-reviews.", source: [4, 5], evidence: [], kind: "design" },

    ai_performance: { title: "Performance is not learning", hint: "AI can raise performance on a task without raising learning.", deeper: "Students with unrestricted AI practice did 48% better during practice but 17% worse on a later exam without AI. A version with safeguards largely avoided the harm.", source: [5, 1], evidence: ["ai_crutch", "ai_offloading"] },
    ai_level_choose: { title: "Choose the AI level from the outcome", hint: "What must the learner be able to do alone? Pick the lowest level that still serves the learning.", deeper: "Ask whether AI would replace the thinking you want to measure or merely support it. State the level on the assignment, and revisit as tools change.", source: [5, 2], evidence: ["aias"] },
    ai_visible: { title: "Make the learner's thinking visible", hint: "Redesigning the assessment holds up better than trying to catch AI use.", deeper: "Process evidence (plan, drafts, what changed), a brief oral defense, in-class components for core skills, personal clinical context, critique of AI output, staged tasks.", source: [5, 3], evidence: ["ai_crutch"] },
    ai_detectors: { title: "Do not rely on detectors", hint: "Detectors misclassified more than half of essays by non-native English writers.", deeper: "A detector score is not good evidence of misconduct. Talk with the student, ask them to explain their work, and follow institutional process.", source: [5, 3], evidence: ["detectors"] },
    ai_document: { title: "What learners document", hint: "The tool, how they used it, and what they changed.", deeper: "Documentation keeps the learner accountable for accuracy and makes their judgment visible.", source: [5, 5], evidence: ["aias"], kind: "design" },
    ai_verify: { title: "Teach verification", hint: "Treat AI output as a draft from an unreliable source.", deeper: "Check claims against primary sources and guidelines; look for invented citations and missing context. Have learners try first, then compare with AI.", source: [5, 4], evidence: ["ai_hpe"] },
    ai_syllabus: { title: "Clear AI expectations", hint: "Name allowed uses, the assignments, and what to document.", deeper: "\"AI may be used for brainstorming in Assignment 2 with a note on how you used it; it may not be used for the case analysis in Assignment 3.\" Not: \"Use AI responsibly.\"", source: [5, 5], evidence: ["aias"] },
    ai_privacy: { title: "Never enter patient identifiers", hint: "Use invented details, and only tools your institution has approved.", deeper: "The clinician, not the tool, is responsible for decisions. Do not paste student work or identifiable information into unapproved tools.", source: [5, 4], evidence: [], kind: "design" },
    try_first: { title: "Try first, then compare", hint: "The coach opens after you draft. Offloading the thinking is the risk the course warns about, for faculty too.", deeper: "Learners who started from AI's answer showed \"metacognitive laziness.\" The studio applies the same rule to you: write your own version, then ask the coach to critique it.", source: [5, 4], evidence: ["ai_offloading"] },

    evaluate_change: { title: "How will you know it worked?", hint: "Decide in advance what evidence will show whether the change worked.", deeper: "A quiz result, a student comment, a colleague's observation, or your own notes. Evidence for faculty development beyond satisfaction is thin, so this plan is how you find out.", source: [6, 2], evidence: ["faculty_dev"] },
    first_step: { title: "One first step, with a date", hint: "A small, specific plan is far more likely to happen than a general intention.", deeper: "Make the first change you named, on the date you set. Ask a colleague to observe one session.", source: [6, 4], evidence: [], kind: "design" },
    capstone_rubric: { title: "The reviewer's rubric", hint: "The same five criteria a reviewer will use, so you know the standard in advance.", deeper: "Outcome alignment; modality and active learning; assessment quality; AI approach; feasibility and evaluation. Rated Meets, Approaching or Not yet.", source: [6, 3], evidence: ["capstone_design"] },
    badge_threshold: { title: "Badge standard (draft)", hint: "Meets on at least four criteria and none Not yet. A draft threshold to confirm with the review team.", deeper: "This studio estimates ratings from your entries. A trained reviewer decides.", source: [6, 3], evidence: ["capstone_design"], kind: "design" },
  };

  const MODULES = ["Orientation", "Module 1: How Adults Learn", "Module 2: Outcomes and Alignment",
    "Module 3: Active Learning and Modality Choices", "Module 4: Assessment and Feedback",
    "Module 5: Generative AI in Teaching", "Capstone and Next Steps"];

  // Module 1 audit strategies.
  const AUDIT = [
    { id: "retrieval", label: "Retrieval practice", hint: "retrieval" },
    { id: "spacing", label: "Spacing of key content", hint: "spacing" },
    { id: "concrete", label: "Concrete example before abstraction", hint: "concrete_first" },
    { id: "problem", label: "Problem-centered framing", hint: "andragogy" },
    { id: "load", label: "Reduced extraneous load", hint: "cognitive_load" },
    { id: "steps", label: "Steps made visible (expert blind spot)", hint: "expert_blind_spot" },
  ];

  const MODALITIES = [
    { id: "in_person", label: "In person", fit: "Hands-on skills, physical practice, team coordination" },
    { id: "simulation", label: "Simulation", fit: "Performance with immediate feedback in a safe setting" },
    { id: "sync_online", label: "Synchronous online", fit: "Real-time discussion and group problem solving" },
    { id: "async", label: "Asynchronous", fit: "Foundational content with retrieval checks; reflection and writing" },
    { id: "blended", label: "Blended", fit: "Asynchronous preparation, then live application" },
  ];

  // AI Assessment Scale; the course notes the published wording has been revised.
  const AI_LEVELS = [
    { level: 1, label: "No AI", meaning: "Completed without any AI assistance", fit: "Core skills you must verify, such as clinical reasoning or procedures" },
    { level: 2, label: "AI for planning", meaning: "AI may help brainstorm or outline; the final work is the learner's", fit: "Early-stage ideas where the product still shows their thinking" },
    { level: 3, label: "AI collaboration", meaning: "AI may draft or help; learner critiques, revises and documents use", fit: "Tasks where editing and judging AI output is itself the skill" },
    { level: 4, label: "Full AI", meaning: "AI used throughout, with learner direction", fit: "Tasks about using AI well in the profession" },
    { level: 5, label: "AI exploration", meaning: "Learners explore creative or novel uses with AI", fit: "Advanced or experimental work" },
  ];

  const WORKLOAD = [
    "Auto-graded practice quizzes with built-in feedback",
    "Common-error feedback written once",
    "Peer feedback with a rubric",
    "Self-assessment before submission",
    "Audio or video feedback (with captions or transcript)",
    "Feedback on one or two criteria",
  ];

  // The guided path. Each step is one apply-it template from the course.
  const STEPS = [
    { id: "course", n: 1, title: "Course and outcome", module: 2, produces: "Course, learners and one measurable outcome", why: "Everything else in your course is chosen to serve the outcome. Unclear outcomes are a common reason a well-taught session still misses the mark." },
    { id: "audit", n: 2, title: "Learning-science audit", module: 1, produces: "Module 1 apply-it: learning-science audit", why: "Most of us teach the way we were taught. Auditing one real session shows which high-yield strategies are already there and which are cheap to add." },
    { id: "session", n: 3, title: "Session and modality", module: 3, produces: "Module 3 apply-it: session redesign plan", why: "Learners remember and use what they do more than what they only hear. Modality and method are tools for reaching the outcome." },
    { id: "assessment", n: 4, title: "Assessment and feedback", module: 4, produces: "Module 4 apply-it: assessment and feedback plan", why: "Assessment shapes what learners study. If it does not require the skill named in the outcome, the grade says little about what learners can do." },
    { id: "alignment", n: 5, title: "Alignment map", module: 2, produces: "Module 2 apply-it: alignment map", why: "Misalignment is easy to miss in your own course. Seeing outcome, activity and assessment side by side lets you fix it before learners pay for it." },
    { id: "ai", n: 6, title: "AI approach", module: 5, produces: "Module 5 apply-it: AI approach for one assignment", why: "Your learners are likely already using AI. Deciding where it belongs starts with what they must still be able to do themselves." },
    { id: "mission", n: 7, title: "Mission lens", module: null, produces: "Scholarship for Service: where the mission lives in this design", why: "At Loma Linda, the mission is a design input, not a paragraph pasted into the syllabus." },
    { id: "plan", n: 8, title: "Plan and self-check", module: 6, produces: "Capstone: Teaching Improvement Plan", why: "The plan assembles itself from your steps. Check it against the reviewer's rubric before anyone else sees it." },
  ];

  const api = { SOURCE, STRENGTH, EVIDENCE, HINTS, MODULES, AUDIT, MODALITIES, AI_LEVELS, WORKLOAD, STEPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.COURSE = api;
})(typeof window !== "undefined" ? window : globalThis);
