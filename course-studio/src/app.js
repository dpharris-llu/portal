// Course Studio: a course builder with the training built into the building.
// Vanilla JS, no build step. Courses are saved in this browser (localStorage).
// A step renders once when you arrive; typing updates state and refreshes only the live
// regions (analysis, nav, why panel), so inputs keep focus.
(function () {
  "use strict";
  const C = window.COURSE, M = window.MISSION, K = window.Checks;
  const STORE = "llu-course-studio-v2";
  const EMBEDDED = !!window.STUDIO_EMBEDDED;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const has = v => String(v == null ? "" : v).trim().length > 0;
  const uid = p => (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ALL_HINTS = Object.assign({}, C.HINTS, M.HINTS);

  // ---------- State ----------
  function blankCourse() {
    return {
      id: uid("c"), version: 2, updatedAt: Date.now(),
      course: { term: "quarter", weeks: 10 },
      outcomes: [{ id: uid("o") }, { id: uid("o") }, { id: uid("o") }],
      weeks: [],
      session: { segments: [{}, {}, {}], audit: {} },
      assessments: [],
      ai: {},
      mission: { dimensions: [] },
      plan: {},
    };
  }
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* storage unavailable */ }
    if (!data || !data.courses) data = { courses: {}, current: null, prefs: { hints: true }, learning: {} };
    data.learning = data.learning || {};
    if (!data.current || !data.courses[data.current]) {
      const d = exampleCourse(); data.courses[d.id] = d; data.current = d.id;
    }
    return data;
  }
  function save() {
    design.updatedAt = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* not saved; page still works */ }
  }
  let db, design;
  let stepId = (location.hash || "").replace("#", "") || "foundations";
  let focusHint = null;
  let kcState = {}; // questionId -> chosen option index (this visit)
  let coachState = { available: null, loading: false, result: null, error: null, step: null };

  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split(".");
    let a = o;
    ks.slice(0, -1).forEach((k, i) => { if (a[k] == null) a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; });
    a[ks[ks.length - 1]] = v;
  }

  // Keep one week row per week of the term.
  function ensureWeeks() {
    const n = Math.min(Math.max(Number(design.course.weeks) || 0, 0), 20);
    design.weeks = design.weeks || [];
    for (let i = 0; i < n; i++) if (!design.weeks[i]) design.weeks[i] = { n: i + 1, outcomes: [], methods: [] };
    const extra = design.weeks.slice(n);
    if (extra.every(w => !has(w.topic) && !(w.outcomes || []).length && !(w.methods || []).length)) design.weeks.length = n;
    design.weeks.forEach((w, i) => { w.n = i + 1; w.outcomes = w.outcomes || []; w.methods = w.methods || []; });
  }
  const liveOutcomes = () => (design.outcomes || []).filter(o => has(o.text));
  const oLabel = id => { const i = (design.outcomes || []).findIndex(o => o.id === id); return i >= 0 ? "O" + (i + 1) : "?"; };
  const oText = id => ((design.outcomes || []).find(o => o.id === id) || {}).text || "";

  // ---------- Symbols ----------
  function dots(n) {
    let s = "";
    for (let i = 0; i < 3; i++) s += `<circle cx="${4 + i * 8}" cy="5" r="3" ${i < n ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.2"'}/>`;
    return `<svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true">${s}</svg>`;
  }
  const ICONS = {
    framework: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    design: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    mission: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.8" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="2.6" fill="currentColor"/></svg>',
  };
  function strengthMark(key) {
    const s = C.STRENGTH[key];
    if (!s) return "";
    const icon = s.dots ? dots(s.dots) : ICONS[key] || "";
    return `<span class="mark ${key}" title="${esc(s.label)}">${icon}${esc(s.short)}</span>`;
  }
  function bloomMark(level, prefix) {
    if (!level) return "";
    let bars = "";
    for (let i = 1; i <= 6; i++) bars += `<rect x="${(i - 1) * 3.4}" y="${12 - i * 2}" width="2.6" height="${i * 2}" fill="currentColor"${i <= level ? "" : ' opacity=".22"'}/>`;
    return `<span class="mark bloom" title="Bloom's revised taxonomy, level ${level} of 6"><svg width="21" height="12" viewBox="0 0 21 12" aria-hidden="true">${bars}</svg>${prefix || "Bloom"} ${level} · ${esc(K.BLOOM[level])}</span>`;
  }
  function millerMark(level, prefix) {
    if (!level) return "";
    const bands = [[0, 12, 16, 9], [2.25, 9, 13.75, 6], [4.5, 6, 11.5, 3], [6.75, 3, 9.25, 0]];
    const paths = bands.map((b, i) => { const [l, yb, r, yt] = b;
      return `<path d="M${l} ${yb} L${r} ${yb} L${r - 2.25} ${yt} L${l + 2.25} ${yt}Z" fill="currentColor" opacity="${i + 1 === level ? 1 : .22}"/>`; }).join("");
    return `<span class="mark miller" title="Miller's pyramid, level ${level} of 4"><svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">${paths}</svg>${prefix || "Miller"} · ${esc(K.MILLER[level])}</span>`;
  }
  function aiMark(level) {
    if (!level) return "";
    const L = C.AI_LEVELS[level - 1];
    let s = "";
    for (let i = 1; i <= 5; i++) s += `<rect x="${(i - 1) * 4}" y="${10 - i * 2}" width="3.2" height="${i * 2}" fill="currentColor"${i <= level ? "" : ' opacity=".22"'}/>`;
    return `<span class="mark ai" title="AI Assessment Scale level ${level} of 5"><svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">${s}</svg>AI ${level} · ${esc(L.label)}</span>`;
  }
  const STATUS = {
    aligned: ["✓", "Aligned"], partial: ["◐", "Partly"], gap: ["✕", "Gap"], pending: ["○", "Not yet set"], note: ["i", "Consider"],
    meets: ["✓", "Meets"], approaching: ["◐", "Approaching"], notyet: ["✕", "Not yet"],
  };
  const statusMark = (s, label) => `<span class="status ${s}"><span aria-hidden="true">${STATUS[s][0]}</span> ${esc(label || STATUS[s][1])}</span>`;
  const oChip = id => `<span class="ochip" title="${esc(oText(id))}">${oLabel(id)}</span>`;

  function hintKind(h) {
    if (!h) return null;
    if (h.kind) return h.kind;
    const order = ["strong", "moderate", "limited", "framework", "design"];
    const ks = (h.evidence || []).map(id => C.EVIDENCE[id] && C.EVIDENCE[id].strength).filter(Boolean);
    return ks.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] || "framework";
  }
  function whyBtn(id, label) {
    const h = ALL_HINTS[id];
    if (!h) return "";
    return `<button type="button" class="why${hintKind(h) === "mission" ? " mission" : ""}" data-hint="${id}" aria-label="Why: ${esc(h.title)}">${esc(label || "Why")}</button>`;
  }
  function hintLine(id) {
    const h = ALL_HINTS[id];
    return h ? `<p class="hint-line">${strengthMark(hintKind(h))} <span>${esc(h.hint)}</span></p>` : "";
  }

  // ---------- Field builders ----------
  let fid = 0;
  function field(o) {
    const id = o.id || "f-" + o.path.replace(/\./g, "-");
    const v = getPath(design, o.path);
    let input;
    if (o.type === "textarea") input = `<textarea id="${id}" data-path="${o.path}" rows="${o.rows || 3}" placeholder="${esc(o.placeholder || "")}">${esc(v)}</textarea>`;
    else if (o.type === "select") input = `<select id="${id}" data-path="${o.path}"${o.num ? " data-num" : ""}${o.rerender ? " data-rerender" : ""}><option value="">${esc(o.empty || "Choose…")}</option>${o.options.map(op => `<option value="${esc(op.value)}"${String(v) === String(op.value) ? " selected" : ""}>${esc(op.label)}</option>`).join("")}</select>`;
    else input = `<input id="${id}" type="${o.type || "text"}" data-path="${o.path}"${o.type === "number" ? ` data-num min="0"${o.max ? ` max="${o.max}"` : ""}` : ""}${o.rerender ? " data-rerender" : ""} value="${esc(v)}" placeholder="${esc(o.placeholder || "")}">`;
    return `<div class="field"><div class="label-row"><label for="${id}">${esc(o.label)}${o.optional ? ' <span class="optional">(optional)</span>' : ""}</label>${o.hint ? whyBtn(o.hint) : ""}</div>${o.hint && !o.noLine ? hintLine(o.hint) : ""}${input}${o.after || ""}</div>`;
  }
  const live = name => `<div class="analysis" data-live="${name}"></div>`;
  function chipSet(path, items, label) {
    const cur = getPath(design, path) || [];
    if (!items.length) return `<span class="muted">Write outcomes in step 2 first.</span>`;
    return `<div class="chipset" role="group" aria-label="${esc(label || "Choose")}">${items.map(it => {
      const on = cur.includes(it.value);
      return `<label class="chip${on ? " on" : ""}" title="${esc(it.title || "")}"><input type="checkbox" data-listpath="${path}" value="${esc(it.value)}"${on ? " checked" : ""}> ${esc(it.label)}</label>`;
    }).join("")}</div>`;
  }
  const outcomeItems = () => liveOutcomes().map(o => ({ value: o.id, label: oLabel(o.id), title: o.text }));

  // ---------- Steps ----------
  const SCHOOLS = ["Allied Health Professions", "Behavioral Health", "Dentistry", "Medicine", "Nursing", "Pharmacy", "Public Health", "Religion", "Graduate Studies", "Other"];
  const LEVELS = ["Undergraduate", "Graduate", "Professional (entry-level clinical)", "Residency or fellowship", "Continuing education"];
  const opts = list => list.map(x => ({ value: x, label: x }));
  const activityLabel = id => (K.ACTIVITIES[id] || {}).label || id;

  const RENDER = {
    foundations() {
      return `
      <div class="card">
        <h2>Your course</h2>
        <div class="row">
          ${field({ path: "course.name", label: "Course name", placeholder: "e.g. Pharmacotherapy II" })}
          ${field({ path: "course.code", label: "Course code", optional: true })}
        </div>
        <div class="row">
          ${field({ path: "course.school", label: "School", type: "select", options: opts(SCHOOLS) })}
          ${field({ path: "course.level", label: "Level", type: "select", options: opts(LEVELS) })}
          ${field({ path: "course.size", label: "Class size", type: "number" })}
        </div>
        <div class="row">
          ${field({ path: "course.term", label: "Term", type: "select", options: [{ value: "quarter", label: "Quarter" }, { value: "semester", label: "Semester" }] })}
          ${field({ path: "course.weeks", label: "Weeks", type: "number", max: 20, rerender: true })}
          ${field({ path: "course.credits", label: "Credits", type: "number" })}
        </div>
        <p class="hint-line">${strengthMark("design")} Credits set an hours budget: about 1 hour in class and 2 outside per credit, per week. ${whyBtn("workload")}</p>
        ${live("budget")}
      </div>
      <div class="card">
        ${field({ path: "course.learners", label: "Who are the learners, and what role are they preparing for?", type: "textarea", rows: 2, hint: "andragogy" })}
        ${field({ path: "course.problem", label: "What professional problem does this course help them solve?", type: "textarea", rows: 2, hint: "concrete_first" })}
        ${field({ path: "course.description", label: "Course description", type: "textarea", rows: 3, optional: true })}
      </div>`;
    },

    outcomes() {
      const list = design.outcomes.map((o, i) => `
        <div class="card ocard">
          <div class="label-row" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem">
            <label for="o-${o.id}" class="label"><span class="ochip">O${i + 1}</span> By the end, learners will be able to…</label>
            <button type="button" class="btn link" data-action="removeOutcome" data-i="${i}" aria-label="Remove outcome ${i + 1}">Remove</button>
          </div>
          <textarea id="o-${o.id}" data-path="outcomes.${i}.text" rows="2" placeholder="Action verb + what + context or standard">${esc(o.text)}</textarea>
          ${live("outcome:" + i)}
          <div class="row">
            ${field({ id: `ob-${o.id}`, path: `outcomes.${i}.bloom`, label: "Level of thinking (Bloom)", type: "select", num: true, empty: "Use the suggestion", hint: "bloom", noLine: true, options: [1, 2, 3, 4, 5, 6].map(l => ({ value: l, label: `${l}. ${K.BLOOM[l]}` })) })}
            ${field({ id: `om-${o.id}`, path: `outcomes.${i}.miller`, label: "Level of competence (Miller)", type: "select", num: true, hint: "miller", noLine: true, options: [1, 2, 3, 4].map(l => ({ value: l, label: `${l}. ${K.MILLER[l]}` })) })}
          </div>
        </div>`).join("");
      return `
      <div class="card intro">
        ${hintLine("backward_design")}
        ${hintLine("outcome_formula")}
        ${hintLine("few_outcomes")}
      </div>
      ${list}
      <p><button type="button" class="btn ghost" data-action="addOutcome">Add outcome</button></p>
      ${live("outcomeCount")}`;
    },

    map() {
      ensureWeeks();
      if (!design.weeks.length) return `<div class="card"><p>Set the number of weeks in step 1 to build the map.</p></div>`;
      const rows = design.weeks.map((w, i) => `
        <tr>
          <th scope="row">Week ${w.n}</th>
          <td><input data-path="weeks.${i}.topic" value="${esc(w.topic)}" aria-label="Week ${w.n} topic" placeholder="Topic"></td>
          <td>${chipSet(`weeks.${i}.outcomes`, outcomeItems(), `Outcomes served in week ${w.n}`)}</td>
        </tr>`).join("");
      return `
      <div class="card">
        <h2>Weeks and the outcomes they serve ${whyBtn("course_map")}</h2>
        ${hintLine("course_map")}
        <div class="table-wrap"><table class="grid stack map-table">
          <thead><tr><th>Week</th><th>Topic</th><th>Outcomes served</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Where each outcome returns ${whyBtn("spacing")}</h2>
        ${hintLine("spacing")}
        <div data-live="heat"></div>
        ${live("mapIssues")}
      </div>`;
    },

    activities() {
      ensureWeeks();
      const methodOpts = Object.entries(K.ACTIVITIES).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("");
      const rows = design.weeks.map((w, i) => `
        <tr>
          <th scope="row">Week ${w.n}<span class="cell-sub">${esc(w.topic || "")}</span><span class="cell-sub">${(w.outcomes || []).map(oChip).join(" ")}</span></th>
          <td>
            <div class="chipset">${(w.methods || []).map(m => `<span class="chip on ${K.ACTIVITIES[m] && K.ACTIVITIES[m].practice ? "do" : "listen"}">${esc(activityLabel(m))} <button type="button" class="chip-x" data-action="removeMethod" data-i="${i}" data-v="${m}" aria-label="Remove ${esc(activityLabel(m))} from week ${w.n}">×</button></span>`).join("")}</div>
            <select data-addto="weeks.${i}.methods" aria-label="Add a method to week ${w.n}"><option value="">Add method…</option>${methodOpts}</select>
          </td>
          <td><input type="number" min="0" data-num data-path="weeks.${i}.classMinutes" value="${esc(w.classMinutes)}" aria-label="Week ${w.n} class minutes"></td>
          <td><input type="number" min="0" data-num data-path="weeks.${i}.outHours" value="${esc(w.outHours)}" aria-label="Week ${w.n} hours outside class"></td>
        </tr>`).join("");
      return `
      <div class="card">
        <h2>Methods for each week ${whyBtn("method_fit")}</h2>
        ${hintLine("active_why")}
        <div class="legend-inline"><span><i class="sw" style="background:var(--accent)"></i>Learners practice</span><span><i class="sw" style="background:var(--framework);opacity:.55"></i>Learners listen or watch</span></div>
        <div class="table-wrap"><table class="grid stack">
          <thead><tr><th>Week</th><th>Methods</th><th>Class min</th><th>Hours outside</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${live("weekMethods")}
      </div>
      ${sessionDesigner()}`;
    },

    assessments() {
      const cards = (design.assessments || []).map((a, i) => `
        <div class="card acard">
          <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center">
            <h3 style="margin:0">${esc(a.name || "Untitled assessment")}</h3>
            <button type="button" class="btn link" data-action="removeAssessment" data-i="${i}">Remove</button>
          </div>
          <div class="row">
            ${field({ path: `assessments.${i}.name`, label: "Name" })}
            ${field({ path: `assessments.${i}.type`, label: "Format", type: "select", hint: "authentic", noLine: true, options: Object.entries(K.ASSESSMENTS).map(([k, v]) => ({ value: k, label: v.label })) })}
          </div>
          <div class="row">
            ${field({ path: `assessments.${i}.week`, label: "Week", type: "number" })}
            ${field({ path: `assessments.${i}.weight`, label: "Weight %", type: "number", hint: "weights", noLine: true })}
            ${field({ path: `assessments.${i}.hours`, label: "Learner hours", type: "number", hint: "workload", noLine: true })}
          </div>
          <div class="field"><label class="label"><input type="checkbox" data-path="assessments.${i}.formative"${a.formative ? " checked" : ""}> Low-stakes practice with feedback (formative)</label> ${whyBtn("formative")}</div>
          <div class="field"><div class="label-row"><span class="label">Outcomes it shows</span>${whyBtn("alignment_chain")}</div>${chipSet(`assessments.${i}.outcomes`, outcomeItems(), "Outcomes this assessment shows")}</div>
          ${live("afit:" + i)}
          ${field({ path: `assessments.${i}.task`, label: "What learners must do", type: "textarea", rows: 2 })}
          <details${(a.rubric || []).some(r => has(r.criterion)) ? " open" : ""}><summary>Rubric criteria and feedback</summary>
            ${hintLine("rubric_observable")}
            <table class="grid stack"><thead><tr><th>Criterion</th><th>Meets</th></tr></thead><tbody>
              ${[0, 1, 2, 3].map(r => `<tr><td><input data-path="assessments.${i}.rubric.${r}.criterion" value="${esc(getPath(design, `assessments.${i}.rubric.${r}.criterion`))}" aria-label="Criterion ${r + 1}"></td><td><input data-path="assessments.${i}.rubric.${r}.meets" value="${esc(getPath(design, `assessments.${i}.rubric.${r}.meets`))}" aria-label="Criterion ${r + 1}: what Meets looks like"></td></tr>`).join("")}
            </tbody></table>
            ${field({ path: `assessments.${i}.feedback`, label: "Feedback routine: when, what form, what learners do with it", type: "textarea", rows: 2, hint: "feedback_where_next", noLine: true })}
          </details>
        </div>`).join("");
      return `
      <div class="card intro">${hintLine("formative")}${hintLine("authentic")}</div>
      ${cards || '<div class="card"><p class="muted">No assessments yet.</p></div>'}
      <p><button type="button" class="btn ghost" data-action="addAssessment">Add assessment</button></p>
      <div class="card">
        <h2>Weights ${whyBtn("weights")}</h2>
        <div data-live="weights"></div>
      </div>
      <div class="card">
        ${field({ path: "plan.feedbackSample", label: "Practice: rewrite one comment you have given, with a strength, a gap and a next step", type: "textarea", rows: 2, hint: "feedback_levels", after: live("feedback") })}
        <div class="field"><div class="label-row"><span class="label">Feedback you can sustain</span>${whyBtn("feedback_scale")}</div>
          <div class="weave">${C.WORKLOAD.map((w, i) => `<label><input type="checkbox" data-path="plan.workload.${i}"${getPath(design, `plan.workload.${i}`) ? " checked" : ""}> ${esc(w)}</label>`).join("")}</div></div>
      </div>`;
    },

    alignment() {
      return `
      <div class="card">
        <h2>Every outcome, its practice and its evidence ${whyBtn("alignment_chain")}</h2>
        ${hintLine("alignment_chain")}
        <div data-live="matrix"></div>
      </div>
      ${live("matrixIssues")}
      <div class="card">
        <h2>Checks a computer cannot make</h2>
        <div class="weave" style="flex-direction:column">
          <label><input type="checkbox" data-path="plan.taughtAll"${design.plan.taughtAll ? " checked" : ""}> Assessments cover nothing that is not in the outcomes or the activities. ${whyBtn("pattern_never_taught")}</label>
          <label><input type="checkbox" data-path="plan.levelsHonest"${design.plan.levelsHonest ? " checked" : ""}> Each outcome's level is what the course can really teach and assess in the time it has.</label>
        </div>
        ${field({ path: "plan.biggest", label: "“The biggest misalignment in my course is ___, and I will fix it by ___.”", type: "textarea", rows: 2 })}
      </div>`;
    },

    ai() {
      const rows = (design.assessments || []).map((a, i) => `
        <tr>
          <th scope="row">${esc(a.name || "Untitled")}<span class="cell-sub">${a.formative ? "Practice" : "Graded"}${(a.outcomes || []).length ? " · " + a.outcomes.map(oChip).join(" ") : ""}</span></th>
          <td><select data-path="assessments.${i}.aiLevel" data-num aria-label="AI level for ${esc(a.name || "assessment")}"><option value="">Choose…</option>${C.AI_LEVELS.map(l => `<option value="${l.level}"${Number(a.aiLevel) === l.level ? " selected" : ""}>${l.level}. ${esc(l.label)}</option>`).join("")}</select></td>
          <td data-live="aiRow:${i}"></td>
        </tr>`).join("");
      return `
      <div class="card">
        <h2>Start from what learners must do alone ${whyBtn("ai_performance")}</h2>
        ${hintLine("ai_performance")}
        ${field({ path: "ai.withoutAI", label: "What must learners be able to do without AI by the end of this course?", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>A level for each assessment ${whyBtn("ai_level_choose")}</h2>
        ${hintLine("ai_level_choose")}
        <div class="ai-scale">${C.AI_LEVELS.map(l => `<div>${aiMark(l.level)}<span class="c-sub">${esc(l.meaning)}</span></div>`).join("")}</div>
        ${rows ? `<div class="table-wrap"><table class="grid stack"><thead><tr><th>Assessment</th><th>AI level</th><th>Check</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Add assessments in step 5 first.</p>'}
        <p class="hint-line">${strengthMark("framework")} The published scale has been revised; check the current wording before adopting it.</p>
      </div>
      <div class="card">
        <h2>Course AI statement</h2>
        ${field({ path: "ai.wording", label: "Syllabus wording", type: "textarea", rows: 4, hint: "ai_syllabus", after: `<p class="no-print"><button type="button" class="btn small ghost" data-action="insertWording">Start from the course template</button></p>` })}
        ${field({ path: "ai.document", label: "What learners must document about AI use", type: "textarea", rows: 2, hint: "ai_document", noLine: true })}
        ${field({ path: "ai.verify", label: "Verification expectation", type: "textarea", rows: 2, hint: "ai_verify", noLine: true })}
        ${field({ path: "ai.misuse", label: "How you will respond to suspected misuse", type: "textarea", rows: 2, hint: "ai_detectors" })}
        ${live("aiCourse")}
        <p class="hint-line">${strengthMark("design")} Never enter patient identifiers into tools your institution has not approved. ${whyBtn("ai_privacy")}</p>
      </div>`;
    },

    mission() {
      const chosen = id => (design.mission.dimensions || []).find(d => d.id === id);
      const themes = M.ANCHORS.themes.map(t => `
        <div class="theme${t.current ? " current" : ""}">
          <div class="eyebrow">${esc(t.who)}${t.current ? " · current theme" : ""}</div>
          <div class="t-name">${esc(t.name)}</div>
          <p>${esc(t.draft)}</p>
          <span class="draft-flag">Draft wording</span>
        </div>`).join("");
      const weekItems = (design.weeks || []).filter(w => has(w.topic)).map(w => ({ value: String(w.n), label: "Wk " + w.n, title: w.topic }));
      const asmItems = (design.assessments || []).filter(a => has(a.name)).map(a => ({ value: a.id, label: a.name }));
      const dims = M.DIMENSIONS.map(d => {
        const c = chosen(d.id);
        const idx = (design.mission.dimensions || []).findIndex(x => x.id === d.id);
        return `
        <div class="card mission-card">
          <button type="button" class="choice mission-choice" style="width:100%" data-action="toggleDim" data-v="${d.id}" aria-pressed="${!!c}">
            <span class="c-title">${ICONS.mission} ${esc(d.label)}</span><span class="c-sub">${esc(d.short)}</span>
          </button>
          ${d.id === "identity" ? `<p class="hint-line">${strengthMark("framework")} Connects to Miller's pyramid. ${whyBtn("mission_identity")}</p>` : ""}
          ${c ? `<div class="dim-detail">
            <p><strong>Outcome:</strong> ${esc(d.outcome)}</p>
            <p><strong>Activity:</strong> ${esc(d.activity)}</p>
            <p><strong>Assessment:</strong> ${esc(d.assessment)}</p>
            <p class="hint-line">${strengthMark("mission")} Example: ${esc(d.example)}</p>
            <div class="field"><span class="label">In which outcomes?</span>${chipSet(`mission.dimensions.${idx}.outcomes`, outcomeItems(), "Outcomes")}</div>
            <div class="field"><span class="label">In which weeks?</span>${weekItems.length ? chipSet(`mission.dimensions.${idx}.weeks`, weekItems, "Weeks") : '<span class="muted">Name your weeks in step 3 first.</span>'}</div>
            <div class="field"><span class="label">In which assessments?</span>${asmItems.length ? chipSet(`mission.dimensions.${idx}.assessments`, asmItems, "Assessments") : '<span class="muted">Add assessments in step 5 first.</span>'}</div>
            ${field({ path: `mission.dimensions.${idx}.how`, label: "How, specifically", type: "textarea", rows: 2 })}
          </div>` : ""}
        </div>`;
      }).join("");
      return `
      <div class="card mission-card">
        <p><span class="draft-flag">${esc(M.REVIEW.status)}</span> <span class="muted">Reviewer: ${esc(M.REVIEW.reviewer)}. ${esc(M.REVIEW.note)}</span></p>
        <p class="why-step">${esc(M.ANCHORS.mission.text)}. <span class="muted">(${esc(M.ANCHORS.mission.label)}; wording to confirm)</span></p>
        <div class="theme-row">${themes}</div>
        ${hintLine("mission_design_input")}
        <p class="hint-line">${strengthMark("mission")} Mission hints state values, not research findings. ${whyBtn("mission_honest")}</p>
      </div>
      <h2>Choose one to three dimensions that genuinely fit ${whyBtn("mission_woven")}</h2>
      ${hintLine("mission_woven")}
      ${live("mission")}
      ${dims}`;
    },

    syllabus() {
      const focusOpts = liveOutcomes().map(o => ({ value: o.id, label: `${oLabel(o.id)}: ${o.text.slice(0, 80)}` }));
      return `
      <div class="card">
        <h2>Workload ${whyBtn("workload")}</h2>
        <div data-live="workload"></div>
      </div>
      <div class="card" id="syllabusDoc">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
          <h2 style="margin:0">Syllabus draft</h2>
          <span class="no-print">${EMBEDDED ? `<button type="button" class="btn small" data-action="copySyllabus">Copy syllabus text</button>` : `<button type="button" class="btn small" data-action="print">Print or save as PDF</button>`}</span>
        </div>
        <p class="muted no-print">Assembled from your design. Add your school's required policy language before you publish it.</p>
        <div data-live="syllabus"></div>
      </div>
      <div class="card">
        <h2>Your Teaching Improvement Plan ${whyBtn("focus_outcome")}</h2>
        ${hintLine("focus_outcome")}
        ${field({ path: "plan.focus", label: "Focus outcome", type: "select", options: focusOpts, rerender: true })}
        ${field({ path: "plan.aiReason", label: "Why this AI level for the main assessment of this outcome", type: "textarea", rows: 2, hint: "ai_level_choose", noLine: true })}
        ${field({ path: "plan.visible", label: "How that assessment makes learners' own thinking visible", type: "textarea", rows: 2, hint: "ai_visible", noLine: true })}
        ${field({ path: "plan.measure", label: "What you will look at to see whether it worked, and when", type: "textarea", rows: 2, hint: "evaluate_change" })}
        <div class="row">
          ${field({ path: "plan.firstStep", label: "The one change you will make first", hint: "first_step", noLine: true })}
          ${field({ path: "plan.firstDate", label: "Date", type: "date" })}
        </div>
        ${field({ path: "plan.feasibility", label: "Time, resources and support you need", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>Self-check against the reviewer's rubric ${whyBtn("capstone_rubric")}</h2>
        ${hintLine("badge_threshold")}
        <div data-live="selfcheck"></div>
      </div>
      <div class="card" id="planDoc">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
          <h2 style="margin:0">Teaching Improvement Plan</h2>
          <span class="no-print">${EMBEDDED
            ? `<button type="button" class="btn small" data-action="copyPlan">Copy plan text</button> <button type="button" class="btn small ghost" data-action="copyJSON">Copy course data</button>`
            : `<button type="button" class="btn small ghost" data-action="export">Export course (JSON)</button>`}
          <button type="button" class="btn small ghost" data-action="import">Import course</button></span>
        </div>
        <p class="muted no-print" id="planMsg" role="status"></p>
        <div data-live="plan"></div>
      </div>`;
    },
  };

  // One session designed in detail, with the Module 1 audit.
  function sessionDesigner() {
    const s = design.session;
    const segs = s.segments || [];
    const methodOpts = Object.entries(K.ACTIVITIES).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("");
    const weekOpts = (design.weeks || []).map(w => ({ value: w.n, label: `Week ${w.n}${has(w.topic) ? ": " + w.topic : ""}` }));
    const rows = segs.map((g, i) => `
      <tr>
        <td><input class="seg-min" type="number" min="0" data-num data-path="session.segments.${i}.minutes" value="${esc(g.minutes)}" aria-label="Segment ${i + 1} minutes"></td>
        <td><select data-path="session.segments.${i}.method" aria-label="Segment ${i + 1} method"><option value="">Method…</option>${methodOpts.replace(`value="${g.method}"`, `value="${g.method}" selected`)}</select></td>
        <td><input data-path="session.segments.${i}.what" value="${esc(g.what)}" aria-label="Segment ${i + 1}: what learners do" placeholder="What learners do"></td>
        <td><button type="button" class="btn link" data-action="removeSegment" data-i="${i}" aria-label="Remove segment ${i + 1}">Remove</button></td>
      </tr>`).join("");
    const audit = C.AUDIT.map(a => `
      <tr>
        <td><span class="label">${esc(a.label)}</span> ${whyBtn(a.hint)}</td>
        <td><select data-path="session.audit.${a.id}.status" aria-label="${esc(a.label)}: already in this session?">
          ${["", "yes", "partly", "no"].map(v => `<option value="${v}"${getPath(design, `session.audit.${a.id}.status`) === v ? " selected" : ""}>${v ? v[0].toUpperCase() + v.slice(1) : "…"}</option>`).join("")}
        </select></td>
        <td><input data-path="session.audit.${a.id}.change" value="${esc(getPath(design, `session.audit.${a.id}.change`))}" aria-label="${esc(a.label)}: one change"></td>
      </tr>`).join("");
    return `
      <div class="card">
        <h2>Design one session in detail ${whyBtn("protect_time")}</h2>
        <p class="muted">Pick the session you most want to improve. It becomes part of your Teaching Improvement Plan.</p>
        <div class="row">
          ${field({ path: "session.week", label: "Which session", type: "select", num: true, options: weekOpts })}
          ${field({ path: "session.length", label: "Length (minutes)", type: "number" })}
        </div>
        <h3>Learning-science audit ${whyBtn("retrieval")}</h3>
        <div class="table-wrap"><table class="grid stack"><thead><tr><th>Strategy</th><th>In this session now?</th><th>One change</th></tr></thead><tbody>${audit}</tbody></table></div>
        <h3>Timed outline ${whyBtn("attention_myth")}</h3>
        <div class="table-wrap"><table class="grid stack">
          <thead><tr><th>Min</th><th>Method</th><th>What learners do</th><th><span class="sr">Remove</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <p><button type="button" class="btn small ghost" data-action="addSegment">Add segment</button></p>
        <div data-live="timebar"></div>
        ${live("session")}
        ${field({ path: "session.feedbackDuring", label: "How learners get feedback during the session", type: "textarea", rows: 2, hint: "plan_feedback", noLine: true })}
        ${field({ path: "session.cut", label: "What you will cut or move to pre-class", type: "textarea", rows: 2, hint: "protect_time", noLine: true })}
        ${field({ path: "session.tellWhy", label: "How you will tell learners why the activity is there", type: "textarea", rows: 2, hint: "feels_worse", noLine: true })}
        <div class="field"><div class="label-row"><span class="label">Accessibility checks</span>${whyBtn("udl")}</div>
          <div class="weave">${["Captions or transcripts", "Real headings", "Alt text for images", "Another way to show learning"].map((a, i) =>
            `<label><input type="checkbox" data-path="session.access.${i}"${getPath(design, `session.access.${i}`) ? " checked" : ""}> ${esc(a)}</label>`).join("")}</div>
        </div>
      </div>`;
  }

  // ---------- Derived views ----------
  // The capstone carries one focus outcome through the course design.
  function focusDesign() {
    const d = design;
    const focus = (d.outcomes || []).find(o => o.id === d.plan.focus) || liveOutcomes()[0] || {};
    const linked = (d.assessments || []).filter(a => (a.outcomes || []).includes(focus.id));
    const graded = linked.filter(a => !a.formative).sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
    const main = graded[0] || linked[0] || {};
    const practice = linked.filter(a => a.formative).map(a => a.name).filter(has).join("; ");
    return {
      focus, main,
      outcome: { text: focus.text, bloom: focus.bloom, miller: focus.miller },
      session: d.session,
      assessment: { type: main.type, task: main.task, formative: practice, rubric: main.rubric || [], feedbackRoutine: main.feedback },
      ai: { level: main.aiLevel, reason: d.plan.aiReason, visible: d.plan.visible, wording: d.ai.wording, document: d.ai.document, misuse: d.ai.misuse },
      evaluation: { measure: d.plan.measure, firstStep: d.plan.firstStep, firstDate: d.plan.firstDate },
    };
  }

  function issueList(issues, okText) {
    if (!issues.length) return okText ? `<p class="ok-line">✓ ${esc(okText)}</p>` : "";
    return issues.map(i => `<div class="issue">${statusMark(i.severity)}<div>${i.who ? `<strong>${esc(i.who)}</strong> ` : ""}${esc(i.message)} ${i.hint ? `<button type="button" class="btn link" data-hint="${i.hint}">Why?</button>` : ""}</div></div>`).join("");
  }
  const tag = (who, list) => list.map(i => Object.assign({}, i, { who }));
  function dedupe(issues) { const seen = new Set(); return issues.filter(i => { const k = i.code + (i.who || "") + i.message; return seen.has(k) ? false : seen.add(k); }); }

  const LIVE = {
    budget() {
      const w = K.analyzeWorkload(design);
      return w.expected ? `<p class="muted">Hours budget: about <strong>${w.expected}</strong> learner hours for ${w.credits} credits over ${w.weeks} weeks.</p>` : "";
    },
    outcome(i) {
      const o = design.outcomes[i];
      if (!o || !has(o.text)) return `<p class="muted">Write the outcome, and the studio will check the verb and suggest a level.</p>`;
      const r = K.analyzeOutcome(o.text);
      const chips = [];
      if (r.verbs.length) chips.push(`<span class="muted">Verbs:</span> ${r.verbs.map(v => `<strong>${esc(v)}</strong>`).join(", ")}`);
      if (r.bloom) chips.push(bloomMark(r.bloom, "Suggested Bloom"));
      if (r.millerFloor && !o.miller) chips.push(millerMark(r.millerFloor, "At least Miller"));
      return `<div class="chips">${chips.join(" ")}</div>${issueList(r.issues, "Observable verb with what and context.")}`;
    },
    outcomeCount() {
      const n = liveOutcomes().length;
      if (n > 8) return issueList([{ severity: "note", message: `${n} outcomes. Fewer, stronger outcomes are easier to teach and assess.`, hint: "few_outcomes" }]);
      return n ? `<p class="muted">${n} outcome${n === 1 ? "" : "s"} written. Three to eight is typical for a course.</p>` : "";
    },
    heat() {
      const outs = liveOutcomes();
      const weeks = design.weeks || [];
      if (!outs.length || !weeks.length) return `<p class="muted">Tag weeks with outcomes to see where each one returns.</p>`;
      const head = weeks.map(w => `<th scope="col" title="${esc(w.topic || "")}">${w.n}</th>`).join("");
      const body = outs.map(o => {
        const hits = weeks.filter(w => (w.outcomes || []).includes(o.id)).length;
        return `<tr><th scope="row">${oChip(o.id)}</th>${weeks.map(w => (w.outcomes || []).includes(o.id) ? `<td class="hit"><span aria-hidden="true">●</span><span class="sr">week ${w.n}</span></td>` : "<td></td>").join("")}<td class="count">${hits ? `${hits} week${hits === 1 ? "" : "s"}` : statusMark("gap", "None")}</td></tr>`;
      }).join("");
      return `<div class="table-wrap"><table class="heat"><thead><tr><th>Outcome</th>${head}<th>Taught in</th></tr></thead><tbody>${body}</tbody></table></div>`;
    },
    mapIssues() {
      const m = K.courseMatrix(design);
      const issues = [];
      m.rows.forEach(r => r.issues.filter(i => i.code === "not_spaced" || i.code === "never_practiced").forEach(i => issues.push(Object.assign({}, i, { who: oLabel(r.outcome.id) }))));
      return issueList(issues.concat(m.weekOrphans), liveOutcomes().length ? "Every outcome returns across the term." : "");
    },
    weekMethods() {
      const issues = (design.weeks || []).filter(w => (w.methods || []).length && !(w.methods || []).some(m => K.ACTIVITIES[m] && K.ACTIVITIES[m].practice))
        .map(w => ({ severity: "note", who: `Week ${w.n}`, message: "Learners only listen or watch this week. Where could they practice with feedback?", hint: "active_why" }));
      return issueList(issues);
    },
    timebar() {
      const segs = (design.session.segments || []).filter(s => Number(s.minutes) > 0);
      const total = K.sumMinutes(segs);
      const length = Number(design.session.length) || total;
      if (!total) return "";
      const scale = Math.max(total, length);
      const bars = segs.map(s => {
        const a = K.ACTIVITIES[s.method];
        return `<span class="${a && a.practice ? "t-do" : "t-listen"}" style="width:${(Number(s.minutes) / scale) * 100}%" title="${esc((a && a.label) || "Unspecified")}: ${s.minutes} min"></span>`;
      }).join("");
      const doing = segs.filter(s => K.ACTIVITIES[s.method] && K.ACTIVITIES[s.method].practice).reduce((n, s) => n + Number(s.minutes), 0);
      return `<div class="timebar" role="img" aria-label="${doing} of ${total} minutes have learners practicing">${bars}</div>
        <div class="legend-inline"><span>Learners practicing: ${doing} min</span><span>Listening or watching: ${total - doing} min</span><span>Total ${total}${design.session.length ? ` of ${design.session.length}` : ""} min</span></div>`;
    },
    session() {
      if (!(design.session.segments || []).some(s => s.method)) return "";
      return issueList(K.analyzeSession(design.session).issues, "Practice and feedback are built into the session.");
    },
    afit(i) {
      const a = design.assessments[i];
      if (!a || !a.type) return "";
      const fmt = K.ASSESSMENTS[a.type];
      const linked = (a.outcomes || []).map(id => design.outcomes.find(o => o.id === id)).filter(o => o && has(o.text));
      const per = linked.map(o => {
        const lv = K.outcomeLevel(o);
        const ch = K.chainStatus(lv.bloom, lv.miller, [], [a.type]);
        return { o, st: ch.assessment.status, issues: ch.assessment.issues };
      });
      const ai = K.analyzeAssessmentAI(a, design.outcomes).issues;
      return `<div class="chips"><span class="muted">This format can show up to</span> ${bloomMark(fmt.bloomMax)} ${millerMark(fmt.millerMax)}</div>
        ${per.length ? `<div class="chips">${per.map(p => `${oChip(p.o.id)} ${statusMark(p.st === "pending" ? "pending" : p.st)}`).join(" ")}</div>` : `<div class="issue">${statusMark("partial")}<div>Tie this assessment to the outcomes it shows. <button type="button" class="btn link" data-hint="pattern_never_taught">Why?</button></div></div>`}
        ${issueList(dedupe(per.flatMap(p => tag(oLabel(p.o.id), p.issues)).concat(ai)))}`;
    },
    weights() {
      const as = (design.assessments || []).filter(a => a.name || a.type);
      if (!as.length) return `<p class="muted">Add assessments to see the weights.</p>`;
      const w = K.analyzeWeights(design);
      const bar = as.map(a => `<span class="${a.formative ? "t-listen" : "t-do"}" style="width:${Math.max(0, Number(a.weight) || 0) / Math.max(100, w.total) * 100}%" title="${esc(a.name)}: ${a.weight || 0}%"></span>`).join("");
      return `<div class="timebar tall" role="img" aria-label="Grade weights total ${w.total}%">${bar}</div>
        <div class="legend-inline">${as.map(a => `<span>${esc(a.name || "Untitled")}: ${a.weight || 0}%${a.formative ? " (practice)" : ""}</span>`).join("")}<span><strong>Total ${w.total}%</strong></span></div>
        ${issueList(w.issues, "Weights add up and the stakes are spread.")}`;
    },
    feedback() {
      if (!has(design.plan.feedbackSample)) return "";
      const r = K.analyzeAssessment({ feedbackSample: design.plan.feedbackSample });
      return issueList(r.issues, "Specific, about the task, with a next step.");
    },
    matrix() {
      const m = K.courseMatrix(design);
      if (!m.rows.length) return `<p class="muted">Write outcomes in step 2 to build the matrix.</p>`;
      const body = m.rows.map(r => `
        <tr>
          <th scope="row">${oChip(r.outcome.id)} <span class="o-text">${esc(r.outcome.text)}</span><span class="chips">${bloomMark(r.bloom)} ${millerMark(r.miller)}</span></th>
          <td>${r.weeks.length ? `Weeks ${r.weeks.join(", ")}` : '<span class="muted">None</span>'}<span class="cell-sub">${[...new Set((design.weeks || []).filter(w => r.weeks.includes(w.n)).flatMap(w => w.methods || []))].map(activityLabel).map(esc).join(", ")}</span></td>
          <td>${statusMark(r.chain.practice.status)}</td>
          <td>${r.assessments.length ? r.assessments.map(a => `${esc(a.name || "Untitled")}${a.formative ? " (practice)" : ""}`).join("<br>") : '<span class="muted">None</span>'}</td>
          <td>${statusMark(r.chain.assessment.status)}</td>
        </tr>`).join("");
      return `<div class="table-wrap"><table class="grid matrix stack">
        <thead><tr><th>Outcome</th><th>Practiced in</th><th>Practice</th><th>Shown by</th><th>Evidence</th></tr></thead>
        <tbody>${body}</tbody></table></div>
        <p>Course: ${statusMark(m.status, m.status === "aligned" ? "Every outcome is practiced and shown at its level" : m.status === "pending" ? "Not yet set" : "Some outcomes need work")}</p>`;
    },
    matrixIssues() {
      const m = K.courseMatrix(design);
      const blocks = m.rows.filter(r => r.issues.length).map(r => `<div class="card"><h3>${oChip(r.outcome.id)} ${esc(r.outcome.text)}</h3>${issueList(dedupe(r.issues))}</div>`).join("");
      const other = m.orphans.concat(m.issues);
      return blocks + (other.length ? `<div class="card"><h3>Across the course</h3>${issueList(other)}</div>` : "");
    },
    aiRow(i) {
      const a = design.assessments[i];
      if (!a) return "";
      const r = K.analyzeAssessmentAI(a, design.outcomes);
      if (!r.level) return statusMark("pending", "Choose a level");
      return r.issues.length ? issueList(r.issues) : `${aiMark(r.level)}`;
    },
    aiCourse() {
      const r = K.analyzeAI({ outcome: {}, ai: Object.assign({ level: Math.max(0, ...(design.assessments || []).map(a => Number(a.aiLevel) || 0)) }, design.ai) });
      return issueList(r.issues.filter(i => i.code !== "ai_core_skill"));
    },
    mission() {
      const r = K.analyzeMission(design);
      if (!r.chosen) return `<p class="muted">No dimensions chosen yet.</p>`;
      const many = r.chosen > 3 ? [{ severity: "note", message: "More than three. One dimension done well beats several mentioned.", hint: "mission_woven" }] : [];
      return `<p>${statusMark(r.woven === r.chosen ? "aligned" : "partial", `${r.woven} of ${r.chosen} woven into the course`)}</p>${issueList(many.concat(dedupe(r.issues)))}`;
    },
    workload() {
      const w = K.analyzeWorkload(design);
      if (!w.expected) return `<p class="muted">Set credits and weeks in step 1 to see the workload check.</p>`;
      const scale = Math.max(w.planned, w.expected) || 1;
      return `<div class="wl">
          <div><span class="label">Planned</span><div class="timebar tall"><span class="t-listen" style="width:${w.classHours / scale * 100}%" title="In class"></span><span class="t-do" style="width:${w.outHours / scale * 100}%" title="Outside class"></span><span class="t-asm" style="width:${w.asmHours / scale * 100}%" title="Assessments"></span></div></div>
          <div><span class="label">Expected</span><div class="timebar tall"><span class="t-exp" style="width:${w.expected / scale * 100}%"></span></div></div>
        </div>
        <div class="legend-inline"><span>In class ${w.classHours} h</span><span>Outside class ${w.outHours} h</span><span>Assessments ${w.asmHours} h</span><span><strong>Planned ${w.planned} h</strong></span><span>Expected about ${w.expected} h</span></div>
        ${issueList(w.issues, "Planned learner hours fit the credits.")}`;
    },
    syllabus() { return syllabusHTML(); },
    selfcheck() {
      const e = K.capstoneEstimate(focusDesign());
      const rows = e.criteria.map(c => `<tr><td>${esc(c.label)}</td><td>${statusMark(c.rating)}</td></tr>`).join("");
      return `<table class="grid rubric-table"><thead><tr><th>Criterion</th><th>Estimate</th></tr></thead><tbody>${rows}</tbody></table>
        <p style="margin-top:.6rem">${e.badgeLikely ? statusMark("meets", "Likely meets the badge standard") : statusMark("approaching", `${e.meets} of 5 Meets so far`)} <span class="muted">An estimate from your entries. A trained reviewer decides.</span></p>`;
    },
    plan() { return planHTML(); },
  };

  function syllabusHTML() {
    const d = design, c = d.course;
    const outs = liveOutcomes();
    const weeks = (d.weeks || []).filter(w => has(w.topic));
    const as = (d.assessments || []).filter(a => has(a.name));
    const dims = (d.mission.dimensions || []).map(x => ({ x, def: M.DIMENSIONS.find(m => m.id === x.id) })).filter(o => o.def && has(o.x.how));
    return `
      <h3>${esc([c.code, c.name].filter(has).join(" · ") || "Untitled course")}</h3>
      <p class="muted">${esc([c.school, c.level, c.credits ? `${c.credits} credits` : "", c.weeks ? `${c.weeks}-week ${c.term || "term"}` : ""].filter(has).join(" · "))}</p>
      ${has(c.description) ? `<p>${esc(c.description)}</p>` : ""}
      ${has(c.problem) ? `<p><strong>Why this course matters:</strong> ${esc(c.problem)}</p>` : ""}
      <h4>Learning outcomes</h4>
      ${outs.length ? `<p>By the end of this course, you will be able to:</p><ol>${outs.map(o => `<li>${esc(o.text)}</li>`).join("")}</ol>` : '<p class="empty">Not yet written.</p>'}
      <h4>Schedule</h4>
      ${weeks.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th>Week</th><th>Topic</th><th>Outcomes</th><th>Due</th></tr></thead><tbody>${weeks.map(w => `<tr><td>${w.n}</td><td>${esc(w.topic)}</td><td>${(w.outcomes || []).map(oLabel).join(", ")}</td><td>${as.filter(a => Number(a.week) === w.n).map(a => esc(a.name)).join(", ")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">Not yet written.</p>'}
      <h4>Assessments</h4>
      ${as.length ? `<div class="table-wrap"><table class="grid"><thead><tr><th>Assessment</th><th>Week</th><th>Weight</th><th>Outcomes</th><th>AI use</th></tr></thead><tbody>${as.map(a => `<tr><td>${esc(a.name)}${a.formative ? " (practice)" : ""}</td><td>${esc(a.week || "")}</td><td>${esc(a.weight || 0)}%</td><td>${(a.outcomes || []).map(oLabel).join(", ")}</td><td>${a.aiLevel ? esc(`Level ${a.aiLevel}: ${C.AI_LEVELS[a.aiLevel - 1].label}`) : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">Not yet written.</p>'}
      <h4>Use of AI</h4>
      ${has(d.ai.wording) ? `<p>${esc(d.ai.wording)}</p>` : '<p class="empty">Not yet written.</p>'}
      ${dims.length ? `<h4>Scholarship for Service <span class="draft-flag">Draft</span></h4><ul>${dims.map(o => `<li>${esc(o.x.how)}</li>`).join("")}</ul>` : ""}
      <h4>Accessibility and accommodations</h4>
      <p class="empty">Add your school's required accessibility and accommodations statement.</p>`;
  }

  function planHTML() {
    const f = focusDesign(), d = design, c = d.course;
    const sec = (n, title, body) => `<div class="plan-section"><h3>${n}. ${esc(title)}</h3>${body && body.trim() ? body : '<p class="empty">Not yet written.</p>'}</div>`;
    const p = v => (has(v) ? `<p>${esc(v)}</p>` : "");
    const segs = (d.session.segments || []).filter(s => s.method || s.what);
    const rub = (f.main.rubric || []).filter(r => has(r.criterion));
    const auditChanges = C.AUDIT.map(a => getPath(d, `session.audit.${a.id}.change`)).filter(has);
    const dims = (d.mission.dimensions || []).map(x => ({ x, def: M.DIMENSIONS.find(m => m.id === x.id) })).filter(o => o.def);
    const access = ["Captions or transcripts", "Real headings", "Alt text for images", "Another way to show learning"].filter((a, i) => getPath(d, `session.access.${i}`));
    const week = (d.weeks || []).find(w => w.n === Number(d.session.week));
    const lv = K.outcomeLevel(f.focus);
    return [
      sec(1, "Course and learners", p([c.name, c.code, c.school, c.level, c.size ? `${c.size} learners` : ""].filter(has).join(" · ")) + p(c.learners)),
      sec(2, "Outcome", has(f.focus.text) ? `<p>${esc(f.focus.text)}</p><div class="chips">${bloomMark(lv.bloom)} ${millerMark(lv.miller)}</div>` : ""),
      sec(3, "Current state", (week ? p(`Week ${week.n}: ${week.topic || ""}`) : "") + (auditChanges.length ? `<ul>${auditChanges.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "")),
      sec(4, "The change: session", (segs.length ? `<ul>${segs.map(s => `<li>${esc(s.minutes || "?")} min · ${esc(activityLabel(s.method) || "")}${has(s.what) ? ": " + esc(s.what) : ""}</li>`).join("")}</ul>` : "") + (has(d.session.feedbackDuring) ? `<p><strong>Feedback:</strong> ${esc(d.session.feedbackDuring)}</p>` : "")),
      sec(5, "The change: assessment", (f.main.type ? `<p><strong>${esc(f.main.name || "")}</strong> · ${esc(K.ASSESSMENTS[f.main.type].label)}. ${esc(f.main.task || "")}</p>` : "") + (has(f.assessment.formative) ? `<p><strong>Practice first:</strong> ${esc(f.assessment.formative)}</p>` : "") + (rub.length ? `<ul>${rub.map(r => `<li><strong>${esc(r.criterion)}:</strong> ${esc(r.meets || "")}</li>`).join("")}</ul>` : "") + (has(f.main.feedback) ? `<p><strong>Feedback routine:</strong> ${esc(f.main.feedback)}</p>` : "")),
      sec(6, "AI approach", (f.main.aiLevel ? `<p>${aiMark(Number(f.main.aiLevel))}</p>` : "") + p(d.plan.aiReason) + p(d.plan.visible) + (has(d.ai.wording) ? `<blockquote>${esc(d.ai.wording)}</blockquote>` : "")),
      sec(7, "Feasibility", p(d.plan.feasibility) + p(d.session.cut)),
      sec(8, "Evaluation", p(d.plan.measure)),
      sec(9, "First step", has(d.plan.firstStep) ? `<p>${esc(d.plan.firstStep)}${has(d.plan.firstDate) ? ` · ${esc(d.plan.firstDate)}` : ""}</p>` : ""),
      sec(10, "Accessibility", access.length ? `<p>${access.map(esc).join(", ")}</p>` : ""),
      `<div class="plan-section"><h3>${ICONS.mission} Mission lens: Scholarship for Service <span class="draft-flag">Proposed addition</span></h3>${dims.length ? `<ul>${dims.map(o => `<li><strong>${esc(o.def.label)}</strong>${has(o.x.how) ? `: ${esc(o.x.how)}` : " (not yet described)"}</li>`).join("")}</ul>` : '<p class="empty">Not yet written.</p>'}</div>`,
    ].join("");
  }

  function refreshLive() {
    document.querySelectorAll("[data-live]").forEach(el => {
      const [name, arg] = el.dataset.live.split(":");
      const fn = LIVE[name];
      if (fn) el.innerHTML = fn(arg == null ? undefined : Number(arg));
    });
    renderNav();
    renderWhy();
    renderLearning();
  }

  // ---------- Progress and issues per step ----------
  function progress(id) {
    const d = design;
    const outs = liveOutcomes();
    const m = K.courseMatrix(d);
    const checks = {
      foundations: [d.course.name, d.course.credits, d.course.weeks, d.course.learners],
      outcomes: [outs.length >= 2 ? 1 : "", outs.length && outs.every(o => o.miller) ? 1 : ""],
      map: [(d.weeks || []).some(w => has(w.topic)) ? 1 : "", outs.length && m.rows.every(r => r.weeks.length) ? 1 : ""],
      activities: [(d.weeks || []).some(w => (w.methods || []).length) ? 1 : "", (d.session.segments || []).some(s => s.method) ? 1 : "", d.session.feedbackDuring],
      assessments: [(d.assessments || []).length ? 1 : "", (d.assessments || []).length && K.analyzeWeights(d).total === 100 ? 1 : ""],
      alignment: [m.rows.length ? 1 : "", d.plan.biggest],
      ai: [d.ai.withoutAI, (d.assessments || []).length && d.assessments.every(a => a.aiLevel) ? 1 : "", d.ai.wording],
      mission: [K.analyzeMission(d).woven ? 1 : ""],
      syllabus: [d.plan.focus, d.plan.measure, d.plan.firstStep, d.plan.firstDate],
    }[id] || [];
    const done = checks.filter(has).length;
    return { state: done === 0 ? "empty" : done === checks.length ? "done" : "started" };
  }
  function stepIssues(id) {
    const d = design;
    switch (id) {
      case "outcomes": return d.outcomes.flatMap((o, i) => tag("O" + (i + 1), K.analyzeOutcome(o.text).issues));
      case "map": { const m = K.courseMatrix(d); return m.rows.flatMap(r => tag(oLabel(r.outcome.id), r.issues.filter(i => i.code === "not_spaced" || i.code === "never_practiced"))).concat(m.weekOrphans); }
      case "activities": return K.analyzeSession(d.session).issues;
      case "assessments": return K.analyzeWeights(d).issues.concat((d.assessments || []).flatMap(a => tag(a.name || "Assessment", K.analyzeAssessmentAI(a, d.outcomes).issues)));
      case "alignment": { const m = K.courseMatrix(d); return m.rows.flatMap(r => tag(oLabel(r.outcome.id), r.issues)).concat(m.orphans, m.issues); }
      case "ai": return (d.assessments || []).flatMap(a => tag(a.name || "Assessment", K.analyzeAssessmentAI(a, d.outcomes).issues));
      case "mission": return K.analyzeMission(d).issues;
      case "syllabus": return K.analyzeWorkload(d).issues;
      default: return [];
    }
  }

  function renderNav() {
    $("#stepNav").innerHTML = C.STEPS.map(s => {
      const pr = progress(s.id);
      const gaps = stepIssues(s.id).filter(i => i.severity === "gap").length;
      const cls = pr.state === "done" ? "done" : pr.state === "started" ? "started" : s.id === "mission" ? "mission" : "";
      const meta = s.module ? C.MODULES[s.module].replace(/: .*/, "") : "Scholarship for Service";
      return `<li><a href="#${s.id}"${s.id === stepId ? ' aria-current="step"' : ""}>
        <span class="step-num ${cls}" aria-hidden="true">${pr.state === "done" ? "✓" : s.n}</span>
        <span>${esc(s.title)}${gaps ? ` <span class="step-flag" title="${gaps} gap(s)">✕${gaps}</span>` : ""}<span class="step-meta">${esc(meta)}</span>
        <span class="sr">${pr.state === "done" ? "complete" : pr.state === "started" ? "in progress" : "not started"}${gaps ? `, ${gaps} gaps` : ""}</span></span></a></li>`;
    }).join("");
  }

  // ---------- Learning: knowledge checks inside the build ----------
  function kcHTML() {
    const qs = C.KNOWLEDGE.filter(k => k.step === stepId);
    if (!qs.length) return "";
    const done = qs.filter(k => db.learning[k.id]).length;
    const current = (kcState.current && qs.find(k => k.id === kcState.current)) || qs.find(k => !db.learning[k.id]) || null;
    let body;
    if (!current) {
      body = `<p class="ok-line">✓ All ${qs.length} checks for this step done.</p><button type="button" class="btn small ghost" data-action="kcReview">Review them</button>`;
    } else {
      const pick = kcState[current.id];
      const answered = pick != null;
      const right = answered && pick === current.correct;
      body = `<p class="kc-q">${esc(current.q)}</p>
        <div class="kc-opts" role="group" aria-label="Answers">${current.options.map((o, i) => `<button type="button" class="kc-opt${answered && i === pick ? (right ? " right" : " wrong") : ""}" data-action="kcAnswer" data-q="${current.id}" data-i="${i}"${answered && right ? " disabled" : ""}>${esc(o)}</button>`).join("")}</div>
        ${answered ? `<p class="kc-fb ${right ? "right" : "wrong"}" role="status">${right ? "✓ Right." : "Not quite. Try again."} ${right ? esc(current.feedback) : ""}</p>` : ""}
        ${answered && right ? `<button type="button" class="btn small" data-action="kcNext">${qs.filter(k => !db.learning[k.id]).length ? "Next question" : "Done"}</button>` : ""}`;
    }
    return `<div class="panel-section kc"><h3>Check your understanding <span class="muted">${done} of ${qs.length}</span></h3>
      <p class="source-chip">From ${esc(C.MODULES[qs[0].module])} · unlimited tries, not graded</p>${body}</div>`;
  }
  function renderLearning() {
    const total = C.KNOWLEDGE.length;
    const done = C.KNOWLEDGE.filter(k => db.learning[k.id]).length;
    const b = $("#learnBtn");
    if (b) b.innerHTML = `Learning <span class="pill">${done}/${total}</span>`;
  }
  function renderLearningDialog() {
    const mods = [1, 2, 3, 4, 5, 6].map(m => {
      const qs = C.KNOWLEDGE.filter(k => k.module === m);
      const done = qs.filter(k => db.learning[k.id]).length;
      const steps = [...new Set(qs.map(k => k.step))].map(id => C.STEPS.find(s => s.id === id));
      return `<div class="lm"><div class="lm-head"><strong>${esc(C.MODULES[m])}</strong><span>${done} of ${qs.length}</span></div>
        <div class="timebar"><span class="t-do" style="width:${qs.length ? done / qs.length * 100 : 0}%"></span></div>
        <p class="muted">Practiced in: ${steps.map(s => `<a href="#${s.id}" data-action="closeDialog">${esc(s.title)}</a>`).join(", ")}</p></div>`;
    }).join("");
    $("#learning").innerHTML = `
      <h2 style="margin-top:0">Your learning</h2>
      <p class="muted">Teaching Well in Higher Ed is built into the steps. Each check sits where you use the idea. Progress is saved in this browser and does not grant the certificate; the formal course stays in Canvas.</p>
      ${mods}
      <form method="dialog" style="margin-top:1rem;text-align:right"><button class="btn">Close</button></form>`;
  }

  // ---------- Why panel ----------
  function hintCard(id) {
    const h = ALL_HINTS[id];
    if (!h) return "";
    const kind = hintKind(h);
    const src = h.source ? `<p class="source-chip">Source: ${esc(C.MODULES[h.source[0]])}${typeof h.source[1] === "number" ? `, Page ${h.source[1]}` : h.source[1] ? `, ${esc(h.source[1])}` : ""}</p>` : kind === "mission" ? `<p class="source-chip">Mission lens <span class="draft-flag">Draft for review</span></p>` : "";
    const ev = (h.evidence || []).map(e => C.EVIDENCE[e]).filter(Boolean).map(e => `<div class="ev-row">${strengthMark(e.strength)} ${esc(e.claim)}. <span class="muted">${esc(e.support)}.</span>${e.caveat ? ` <span class="caveat">${esc(e.caveat)}</span>` : ""}</div>`).join("");
    return `<div class="hint-card${kind === "mission" ? " mission" : ""}">
      <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:start"><h3>${esc(h.title)}</h3><button type="button" class="btn link" data-action="closeHint" aria-label="Close this explanation">Close</button></div>
      <p>${strengthMark(kind)}</p>
      <p class="one-line">${esc(h.hint)}</p>
      <p>${esc(h.deeper)}</p>
      ${h.example ? `<div class="example">${esc(h.example)}</div>` : ""}
      ${ev}
      ${src}
    </div>`;
  }
  function renderWhy() {
    const s = C.STEPS.find(x => x.id === stepId);
    const issues = dedupe(stepIssues(stepId));
    const coachReady = stepDraftLength(stepId) >= 40;
    const res = coachState.step === stepId ? coachState : {};
    const coach = `<div class="panel-section"><h3>Coach ${whyBtn("try_first")}</h3>
      ${coachState.available === false ? `<p class="muted">${EMBEDDED ? "The AI coach runs when the studio is hosted on its own server. This preview has every other feature." : "The AI coach runs on the studio's server (npm start with an API key). Everything else works without it."}</p>` : `
      <p class="muted">${coachReady ? "Your draft is ready for a critique." : "Draft this step first. The coach critiques your thinking; it does not replace it."}</p>
      <button type="button" class="btn small" data-action="coach" ${coachReady && !coachState.loading && coachState.available ? "" : "disabled"}>${coachState.loading && res.step ? "Thinking…" : "Ask the coach to critique this step"}</button>`}
      ${res.error ? `<p class="status gap" style="margin-top:.5rem">${esc(res.error)}</p>` : ""}
      ${res.result ? coachHTML(res.result) : ""}
    </div>`;
    $("#whyPanel").innerHTML = `
      <h2>Why this step</h2>
      <p class="why-step">${esc(s.why)}</p>
      <p class="source-chip">${s.module != null ? esc(C.MODULES[s.module]) : '<span class="draft-flag">Mission lens · draft for review</span>'}</p>
      ${s.learn ? `<div class="learn-card"><span class="eyebrow">The idea to use here</span><p>${esc(s.learn)}</p></div>` : ""}
      ${focusHint ? `<div class="panel-section"><h3>You asked why</h3>${hintCard(focusHint)}</div>` : ""}
      ${issues.length ? `<div class="panel-section"><h3>Checks on this step</h3>${issueList(issues.slice(0, 8))}${issues.length > 8 ? `<p class="muted">And ${issues.length - 8} more in the step.</p>` : ""}</div>` : ""}
      ${kcHTML()}
      ${coach}`;
  }
  function coachHTML(r) {
    const kindLabel = { strength: ["aligned", "Strength"], gap: ["gap", "Gap"], question: ["note", "Question"], mission: ["note", "Mission"] };
    return `<div class="coach-out">
      ${has(r.summary) ? `<p>${esc(r.summary)}</p>` : ""}
      <ul>${(r.observations || []).map(o => `<li>${statusMark(...(kindLabel[o.kind] || kindLabel.question))} ${esc(o.text)}${o.course_link ? ` <span class="muted">(${esc(o.course_link)})</span>` : ""}</li>`).join("")}</ul>
      ${(r.questions || []).length ? `<p><strong>Questions to consider</strong></p><ul>${r.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}
      <p class="muted">AI critique. Check it against your own judgment and the course.</p>
    </div>`;
  }
  function stepDraftLength(id) {
    const d = design;
    const pick = {
      foundations: [d.course.learners, d.course.problem, d.course.description],
      outcomes: d.outcomes.map(o => o.text),
      map: (d.weeks || []).map(w => w.topic),
      activities: [d.session.feedbackDuring, ...(d.session.segments || []).map(s => s.what)],
      assessments: (d.assessments || []).map(a => [a.name, a.task].join(" ")),
      alignment: [d.plan.biggest, ...d.outcomes.map(o => o.text)],
      ai: [d.ai.withoutAI, d.ai.wording],
      mission: (d.mission.dimensions || []).map(x => x.how),
      syllabus: [d.plan.measure, d.plan.firstStep, d.plan.aiReason],
    }[id] || [];
    return pick.filter(has).join(" ").length;
  }

  // ---------- Coach ----------
  async function checkCoach() {
    try { const r = await fetch("api/health", { cache: "no-store" }); coachState.available = !!(await r.json()).ai; }
    catch (e) { coachState.available = false; }
    renderWhy();
  }
  async function askCoach() {
    const copy = JSON.parse(JSON.stringify(design)); delete copy.id; delete copy.updatedAt;
    const payload = { step: stepId, course: copy };
    const phi = K.scanForPHI(JSON.stringify(payload));
    Object.assign(coachState, { step: stepId, result: null, error: null });
    if (phi) { coachState.error = `This looks like it contains ${phi}. Remove patient or personal identifiers before asking the coach.`; renderWhy(); return; }
    coachState.loading = true; renderWhy();
    try {
      const r = await fetch("api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "The coach could not respond.");
      coachState.result = j;
    } catch (e) { coachState.error = e.message || "The coach could not respond."; }
    coachState.loading = false; renderWhy();
  }

  // ---------- Render step ----------
  function renderStep() {
    const s = C.STEPS.find(x => x.id === stepId) || C.STEPS[0];
    stepId = s.id;
    ensureWeeks();
    const idx = C.STEPS.indexOf(s);
    const prev = C.STEPS[idx - 1], next = C.STEPS[idx + 1];
    $("#main").innerHTML = `
      <div class="step-head">
        <div class="eyebrow">Step ${s.n} of ${C.STEPS.length}${s.module != null ? ` · ${esc(C.MODULES[s.module])}` : " · Mission lens"}</div>
        <h1>${esc(s.title)}</h1>
        <p class="produces">${esc(s.produces)}</p>
      </div>
      ${RENDER[s.id]()}
      <div class="no-print" style="display:flex;justify-content:space-between;margin-top:1.5rem;gap:.5rem">
        ${prev ? `<a class="btn ghost" href="#${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a class="btn" href="#${next.id}">${esc(next.title)} →</a>` : ""}
      </div>`;
    refreshLive();
  }
  function renderDesignSelect() {
    const list = Object.values(db.courses).sort((a, b) => b.updatedAt - a.updatedAt);
    $("#designSelect").innerHTML = list.map(d => `<option value="${d.id}"${d.id === design.id ? " selected" : ""}>${esc(d.course.name || "Untitled course")}</option>`).join("");
  }
  function renderBanner() {
    $("#sourceBanner").innerHTML = `Built on <strong>${esc(C.SOURCE.title)}</strong> by ${esc(C.SOURCE.owner)} · ${esc(C.SOURCE.status)} · Mission lens: <span class="draft-flag">draft for review</span> · Your work is saved in this browser only.`;
  }
  function renderLegend() {
    $("#legend").innerHTML = `
      <h2 id="legendTitle" style="margin-top:0">Symbols</h2>
      <p class="muted">Every symbol answers a question. A word always accompanies the shape.</p>
      <h3>How sure are we?</h3>
      <div class="legend-grid">${["strong", "moderate", "limited", "framework", "design"].map(k => `${strengthMark(k)}<span>${esc(C.STRENGTH[k].label)}</span>`).join("")}</div>
      <h3>How does this form the whole person?</h3>
      <div class="legend-grid">${strengthMark("mission")}<span>${esc(C.STRENGTH.mission.label)}. Mission hints never carry an evidence rating.</span></div>
      <h3>What kind of thinking, competence and AI use?</h3>
      <div class="legend-grid">
        ${bloomMark(5)}<span>Bloom's revised taxonomy: remember → create</span>
        ${millerMark(3)}<span>Miller's pyramid: knows → knows how → shows how → does</span>
        ${aiMark(2)}<span>AI Assessment Scale: 1 (no AI) → 5 (AI exploration)</span>
        <span class="ochip">O1</span><span>A course outcome, numbered in step 2</span>
      </div>
      <h3>Do the pieces line up?</h3>
      <div class="legend-grid">
        ${statusMark("aligned")}<span>Outcome, practice and assessment match</span>
        ${statusMark("partial")}<span>Close; one piece is a level short</span>
        ${statusMark("gap")}<span>A misalignment pattern from Module 2</span>
        ${statusMark("note")}<span>Worth considering</span>
      </div>
      <h3>Why?</h3>
      <div class="legend-grid"><span class="why" style="pointer-events:none">Why</span><span>Opens the reasoning, the course page and the evidence</span></div>
      <form method="dialog" style="margin-top:1rem;text-align:right"><button class="btn">Close</button></form>`;
  }

  // ---------- Example course ----------
  function exampleCourse() {
    const d = blankCourse();
    const o = [uid("o"), uid("o"), uid("o"), uid("o")];
    Object.assign(d.course, { name: "Pharmacotherapy II (example)", code: "EXAMPLE 742", school: "Pharmacy", level: "Professional (entry-level clinical)",
      size: 80, term: "quarter", weeks: 10, credits: 4,
      learners: "Second-year pharmacy students who start ambulatory care rotations next term.",
      problem: "Choosing, adjusting and explaining antihypertensive therapy for real patients with other conditions.",
      description: "Pharmacotherapy of hypertension and kidney disease, with an emphasis on patient-specific decisions and counseling." });
    d.outcomes = [
      { id: o[0], text: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity.", miller: 2 },
      { id: o[1], text: "Counsel a patient starting a new antihypertensive medication, using teach-back to confirm understanding.", miller: 3 },
      { id: o[2], text: "Adjust drug therapy for a patient with chronic kidney disease using current guidelines.", miller: 2 },
      { id: o[3], text: "Understand the mechanisms of the major antihypertensive classes.", miller: 1 },
    ];
    const wk = (topic, outs, methods, classMinutes, outHours) => ({ topic, outcomes: outs, methods, classMinutes, outHours });
    d.weeks = [
      wk("Antihypertensive classes I", [o[3]], ["lecture"], 200, 8),
      wk("Antihypertensive classes II", [o[3]], ["lecture", "retrieval"], 200, 8),
      wk("Choosing first-line therapy", [o[0]], ["lecture", "case"], 200, 8),
      wk("Hypertension with comorbidities", [o[0]], ["case", "tbl"], 200, 8),
      wk("Midterm week", [o[0], o[3]], ["retrieval"], 200, 8),
      wk("Kidney disease basics", [o[2]], ["lecture"], 200, 8),
      wk("Dosing in kidney disease", [o[2]], ["lecture"], 200, 8),
      wk("Patient counseling", [o[1]], ["lecture", "worked_example"], 200, 8),
      wk("Special populations", [o[0], o[2]], ["case"], 200, 8),
      wk("Review", [], ["lecture"], 200, 8),
    ].map((w, i) => Object.assign(w, { n: i + 1 }));
    d.assessments = [
      { id: uid("a"), name: "Weekly quizzes", type: "mcq_recall", week: 1, weight: 10, formative: true, outcomes: [o[3], o[0]], hours: 5, aiLevel: 1, task: "Ten-question quiz each week on prior content", rubric: [] },
      { id: uid("a"), name: "Midterm exam", type: "mcq_recall", week: 5, weight: 30, outcomes: [o[0], o[3]], hours: 10, aiLevel: 1, task: "60 multiple-choice questions", rubric: [] },
      { id: uid("a"), name: "Final exam", type: "mcq_case", week: 10, weight: 45, outcomes: [o[0], o[1], o[2]], hours: 15, aiLevel: 1, task: "Case-based multiple-choice questions", rubric: [] },
      { id: uid("a"), name: "Reflection paper", type: "essay", week: 9, weight: 15, outcomes: [], hours: 8, aiLevel: 4, task: "Reflect on a patient encounter from introductory practice experience", rubric: [{ criterion: "Reflection", meets: "Good reflection" }] },
    ];
    d.session = { week: 3, length: 50, segments: [{ minutes: 40, method: "lecture", what: "Drug classes and guidelines" }, { minutes: 10, method: "case", what: "One case worked together at the end" }],
      audit: { retrieval: { status: "no", change: "Open with three polling questions on last week's classes" }, spacing: { status: "partly" }, concrete: { status: "no", change: "Open with the patient case" } } };
    d.plan = { focus: o[0], feedbackSample: "Good job overall!" };
    return d;
  }

  // ---------- Events ----------
  document.addEventListener("input", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.listpath) {
      const arr = getPath(design, t.dataset.listpath) || [];
      const v = t.value, k = arr.indexOf(v);
      if (t.checked && k < 0) arr.push(v); else if (!t.checked && k >= 0) arr.splice(k, 1);
      setPath(design, t.dataset.listpath, arr);
      t.parentElement.classList.toggle("on", t.checked);
      save(); refreshLive(); return;
    }
    if (t.dataset.addto) {
      if (t.value) { const arr = getPath(design, t.dataset.addto) || []; if (!arr.includes(t.value)) arr.push(t.value); setPath(design, t.dataset.addto, arr); save(); renderStep(); }
      return;
    }
    if (!t.dataset.path) return;
    let v = t.type === "checkbox" ? t.checked : t.value;
    if (t.hasAttribute("data-num") && v !== "") v = Number(v);
    setPath(design, t.dataset.path, v);
    save();
    if (t.dataset.path === "course.name") renderDesignSelect();
    refreshLive();
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.hasAttribute && t.hasAttribute("data-rerender")) renderStep();
  });

  document.addEventListener("click", e => {
    const h = e.target.closest("[data-hint]");
    if (h && !h.closest("#legend")) {
      focusHint = h.dataset.hint;
      renderWhy();
      if (window.matchMedia("(max-width: 1150px)").matches) $("#whyPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const act = a.dataset.action, i = Number(a.dataset.i), v = a.dataset.v;
    switch (act) {
      case "addOutcome": design.outcomes.push({ id: uid("o") }); save(); renderStep(); break;
      case "removeOutcome": {
        const gone = design.outcomes.splice(i, 1)[0];
        if (gone) [design.weeks, design.assessments, design.mission.dimensions].forEach(list => (list || []).forEach(x => { if (x.outcomes) x.outcomes = x.outcomes.filter(id => id !== gone.id); }));
        save(); renderStep(); break;
      }
      case "addAssessment": design.assessments.push({ id: uid("a"), outcomes: [], rubric: [] }); save(); renderStep(); break;
      case "removeAssessment": design.assessments.splice(i, 1); save(); renderStep(); break;
      case "removeMethod": design.weeks[i].methods = design.weeks[i].methods.filter(m => m !== v); save(); renderStep(); break;
      case "addSegment": design.session.segments = (design.session.segments || []).concat([{}]); save(); renderStep(); break;
      case "removeSegment": design.session.segments.splice(i, 1); save(); renderStep(); break;
      case "toggleDim": {
        const list = design.mission.dimensions || (design.mission.dimensions = []);
        const k = list.findIndex(x => x.id === v);
        if (k >= 0) list.splice(k, 1); else list.push({ id: v, outcomes: [], weeks: [], assessments: [] });
        focusHint = "mission_woven"; save(); renderStep(); break;
      }
      case "insertWording":
        if (!has(design.ai.wording)) {
          design.ai.wording = "AI tools may be used for [list allowed uses] in [named assignments]. They may not be used for [list restricted uses]. When you use AI, include a short note stating the tool, how you used it and what you changed. You are responsible for the accuracy of everything you submit. Using AI in ways not allowed for an assignment will be handled under [institutional policy]. If you are unsure, ask before you submit.";
          save(); renderStep();
        }
        break;
      case "kcAnswer": {
        const q = C.KNOWLEDGE.find(k => k.id === a.dataset.q);
        kcState[q.id] = i; kcState.current = q.id;
        if (i === q.correct) { db.learning[q.id] = true; save(); }
        renderWhy(); renderLearning(); break;
      }
      case "kcNext": kcState = {}; renderWhy(); break;
      case "kcReview": C.KNOWLEDGE.filter(k => k.step === stepId).forEach(k => { delete db.learning[k.id]; }); kcState = {}; save(); renderWhy(); renderLearning(); break;
      case "closeHint": focusHint = null; renderWhy(); break;
      case "coach": askCoach(); break;
      case "print": window.print(); break;
      case "copyPlan": copyText($("[data-live=plan]").innerText, "Plan copied. Paste it into a document or the Canvas submission box."); break;
      case "copySyllabus": copyText($("[data-live=syllabus]").innerText, "Syllabus copied."); break;
      case "copyJSON": copyText(JSON.stringify(design, null, 2), "Course data copied. Save it as a .json file to import later."); break;
      case "export": {
        const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `${(design.course.name || "course").replace(/[^\w-]+/g, "-")}.json`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        break;
      }
      case "import": $("#importFile").click(); break;
      case "newDesign": switchTo(blankCourse()); location.hash = "#foundations"; break;
      case "loadExample": switchTo(exampleCourse()); location.hash = "#alignment"; break;
      case "legend": $("#legend").showModal(); break;
      case "learning": renderLearningDialog(); $("#learning").showModal(); break;
      case "closeDialog": $("#learning").close(); break;
    }
  });

  function flash(msg) { const el = $("#planMsg") || $("#flash"); if (el) el.textContent = msg; }
  async function copyText(text, ok) {
    try { await navigator.clipboard.writeText(text); flash(ok); }
    catch (e) { flash("Copying is blocked here. Select the text and copy it yourself."); }
  }
  function switchTo(d) {
    db.courses[d.id] = d; db.current = d.id; design = d; focusHint = null; kcState = {};
    Object.assign(coachState, { result: null, error: null, step: null });
    save(); renderDesignSelect(); renderStep();
  }

  db = load();
  design = db.courses[db.current];
  $("#designSelect").addEventListener("change", e => { db.current = e.target.value; design = db.courses[db.current]; focusHint = null; save(); renderStep(); });
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== "object" || !Array.isArray(d.outcomes)) throw new Error("That is not a Course Studio course file.");
      d.id = uid("c");
      switchTo(Object.assign(blankCourse(), d));
    } catch (err) { flash((err.message || "Could not import that file.") + " Choose a file exported from Course Studio."); }
    e.target.value = "";
  });
  const hintToggle = $("#hintToggle");
  hintToggle.checked = db.prefs ? db.prefs.hints !== false : true;
  document.body.classList.toggle("hints-off", !hintToggle.checked);
  hintToggle.addEventListener("change", () => {
    db.prefs = db.prefs || {}; db.prefs.hints = hintToggle.checked;
    document.body.classList.toggle("hints-off", !hintToggle.checked); save();
  });
  window.addEventListener("hashchange", () => {
    const id = location.hash.replace("#", "");
    if (C.STEPS.some(s => s.id === id)) {
      stepId = id; focusHint = null; kcState = {};
      if ($("#learning").open) $("#learning").close();
      renderStep(); $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0);
    }
  });

  renderBanner(); renderLegend(); renderDesignSelect(); renderStep(); checkCoach();
})();
