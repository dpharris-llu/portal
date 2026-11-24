// Course Studio app. Vanilla JS, no build step. State lives in this browser (localStorage).
// Rendering: a step renders once when you arrive; typing updates state and refreshes only the
// live regions (analysis, nav, why panel), so inputs keep focus.
(function () {
  "use strict";
  const C = window.COURSE, M = window.MISSION, K = window.Checks;
  const STORE = "llu-course-studio-v1";
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const has = v => String(v == null ? "" : v).trim().length > 0;
  const uid = () => "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ALL_HINTS = Object.assign({}, C.HINTS, M.HINTS);
  // Preview build (a single published page): no print dialog or file downloads, so copy instead.
  const EMBEDDED = !!window.STUDIO_EMBEDDED;

  // ---------- State ----------
  function blankDesign(title) {
    return {
      id: uid(), title: title || "Untitled design", updatedAt: Date.now(),
      course: {}, outcome: {}, audit: {}, session: { segments: [{}, {}, {}] },
      assessment: { rubric: [{}, {}, {}], workload: [] }, alignment: {}, ai: {}, mission: { dimensions: [] }, evaluation: {},
    };
  }
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* storage unavailable */ }
    if (!data || !data.designs) data = { designs: {}, current: null, prefs: { hints: true } };
    if (!data.current || !data.designs[data.current]) {
      const d = blankDesign(); data.designs[d.id] = d; data.current = d.id;
    }
    return data;
  }
  function save() {
    design.updatedAt = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* not saved; page still works */ }
  }
  let db = load();
  let design = db.designs[db.current];
  let stepId = (location.hash || "").replace("#", "") || "course";
  let focusHint = null;
  let coachState = { available: null, loading: false, result: null, error: null, step: null };

  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split(".");
    let a = o;
    ks.slice(0, -1).forEach((k, i) => { if (a[k] == null) a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; });
    a[ks[ks.length - 1]] = v;
  }

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
    for (let i = 1; i <= 6; i++) bars += `<rect x="${(i - 1) * 3.4}" y="${12 - i * 2}" width="2.6" height="${i * 2}" ${i <= level ? 'fill="currentColor"' : 'fill="currentColor" opacity=".22"'}/>`;
    return `<span class="mark bloom" title="Bloom's revised taxonomy, level ${level} of 6">${`<svg width="21" height="12" viewBox="0 0 21 12" aria-hidden="true">${bars}</svg>`}${prefix || "Bloom"} ${level} · ${esc(K.BLOOM[level])}</span>`;
  }
  function millerMark(level, prefix) {
    if (!level) return "";
    // Pyramid with four bands; band 1 (knows) at the base.
    const bands = [[0, 12, 16, 9], [2.25, 9, 13.75, 6], [4.5, 6, 11.5, 3], [6.75, 3, 9.25, 0]];
    const paths = bands.map((b, i) => { const [l, yb, r, yt] = b; const lt = l + 2.25, rt = r - 2.25;
      return `<path d="M${l} ${yb} L${r} ${yb} L${rt} ${yt} L${lt} ${yt}Z" fill="currentColor" opacity="${i + 1 === level ? 1 : .22}"/>`; }).join("");
    return `<span class="mark miller" title="Miller's pyramid, level ${level} of 4">${`<svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">${paths}</svg>`}${prefix || "Miller"} · ${esc(K.MILLER[level])}</span>`;
  }
  function aiMark(level) {
    if (!level) return "";
    const L = C.AI_LEVELS[level - 1];
    let s = "";
    for (let i = 1; i <= 5; i++) s += `<rect x="${(i - 1) * 4}" y="${10 - i * 2}" width="3.2" height="${i * 2}" ${i <= level ? 'fill="currentColor"' : 'fill="currentColor" opacity=".22"'}/>`;
    return `<span class="mark ai" title="AI Assessment Scale level ${level} of 5">${`<svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true">${s}</svg>`}AI ${level} · ${esc(L.label)}</span>`;
  }
  const STATUS = {
    aligned: ["✓", "Aligned"], partial: ["◐", "Partly"], gap: ["✕", "Gap"], pending: ["○", "Not yet set"], note: ["i", "Consider"],
    meets: ["✓", "Meets"], approaching: ["◐", "Approaching"], notyet: ["✕", "Not yet"],
  };
  const statusMark = (s, label) => `<span class="status ${s}"><span aria-hidden="true">${STATUS[s][0]}</span> ${esc(label || STATUS[s][1])}</span>`;

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
    const mission = hintKind(h) === "mission";
    return `<button type="button" class="why${mission ? " mission" : ""}" data-hint="${id}" aria-label="Why: ${esc(h.title)}">${esc(label || "Why")}</button>`;
  }
  function hintLine(id) {
    const h = ALL_HINTS[id];
    if (!h) return "";
    return `<p class="hint-line">${strengthMark(hintKind(h))} <span>${esc(h.hint)}</span></p>`;
  }

  // ---------- Field builders ----------
  let fid = 0;
  function field(o) {
    const id = "f" + (++fid);
    const v = getPath(design, o.path);
    let input;
    if (o.type === "textarea") input = `<textarea id="${id}" data-path="${o.path}" rows="${o.rows || 3}" placeholder="${esc(o.placeholder || "")}">${esc(v)}</textarea>`;
    else if (o.type === "select") input = `<select id="${id}" data-path="${o.path}"${o.num ? " data-num" : ""}><option value="">${esc(o.empty || "Choose…")}</option>${o.options.map(op => `<option value="${esc(op.value)}"${String(v) === String(op.value) ? " selected" : ""}>${esc(op.label)}</option>`).join("")}</select>`;
    else input = `<input id="${id}" type="${o.type || "text"}" data-path="${o.path}"${o.type === "number" ? " data-num min=\"0\"" : ""} value="${esc(v)}" placeholder="${esc(o.placeholder || "")}">`;
    return `<div class="field"><div class="label-row"><label for="${id}">${esc(o.label)}${o.optional ? ' <span class="optional">(optional)</span>' : ""}</label>${o.hint ? whyBtn(o.hint) : ""}</div>${o.hint && !o.noLine ? hintLine(o.hint) : ""}${input}${o.after || ""}</div>`;
  }
  const live = name => `<div class="analysis" data-live="${name}"></div>`;

  // ---------- Steps ----------
  const SCHOOLS = ["Allied Health Professions", "Behavioral Health", "Dentistry", "Medicine", "Nursing", "Pharmacy", "Public Health", "Religion", "Graduate Studies", "Other"];
  const LEVELS = ["Undergraduate", "Graduate", "Professional (entry-level clinical)", "Residency or fellowship", "Continuing education"];
  const lettersOpts = list => list.map(x => ({ value: x, label: x }));

  const RENDER = {
    course() {
      return `
      <div class="card">
        <h2>Your course</h2>
        ${hintLine("one_outcome")}
        <div class="row">
          ${field({ path: "course.name", label: "Course name", placeholder: "e.g. Pharmacotherapy II" })}
          ${field({ path: "course.code", label: "Course code", optional: true, placeholder: "e.g. RXRX 742" })}
        </div>
        <div class="row">
          ${field({ path: "course.school", label: "School", type: "select", options: lettersOpts(SCHOOLS) })}
          ${field({ path: "course.level", label: "Level", type: "select", options: lettersOpts(LEVELS) })}
          ${field({ path: "course.size", label: "Class size", type: "number" })}
        </div>
        ${field({ path: "course.learners", label: "Who are the learners?", type: "textarea", rows: 2, hint: "andragogy", placeholder: "e.g. Second-year pharmacy students starting ambulatory care rotations" })}
      </div>
      <div class="card">
        <h2>One outcome to follow all the way through</h2>
        ${hintLine("backward_design")}
        ${field({ path: "outcome.text", label: "By the end, learners will be able to…", type: "textarea", rows: 3, hint: "outcome_formula", noLine: true, placeholder: "Action verb + what + context or standard" , after: live("outcome") })}
        <div class="row">
          ${field({ path: "outcome.bloom", label: "Level of thinking (Bloom)", type: "select", num: true, empty: "Use the suggestion", hint: "bloom", noLine: true, options: [1, 2, 3, 4, 5, 6].map(l => ({ value: l, label: `${l}. ${K.BLOOM[l]}` })) })}
          ${field({ path: "outcome.miller", label: "Level of competence (Miller)", type: "select", num: true, hint: "miller", noLine: true, options: [1, 2, 3, 4].map(l => ({ value: l, label: `${l}. ${K.MILLER[l]}` })) })}
        </div>
        <div data-live="millerHelp"></div>
      </div>
      <div class="card">
        ${field({ path: "outcome.others", label: "Other outcomes for this course", optional: true, type: "textarea", rows: 3, hint: "few_outcomes", placeholder: "One per line. You will focus on the outcome above.", after: live("others") })}
      </div>`;
    },

    audit() {
      const rows = C.AUDIT.map(a => `
        <tr>
          <td><span class="label">${esc(a.label)}</span> ${whyBtn(a.hint)}</td>
          <td><select data-path="audit.${a.id}.status" aria-label="${esc(a.label)}: already in my session?">
            ${["", "yes", "partly", "no"].map(v => `<option value="${v}"${getPath(design, `audit.${a.id}.status`) === v ? " selected" : ""}>${v ? v[0].toUpperCase() + v.slice(1) : "…"}</option>`).join("")}
          </select></td>
          <td><input data-path="audit.${a.id}.where" value="${esc(getPath(design, `audit.${a.id}.where`))}" aria-label="${esc(a.label)}: where or how"></td>
          <td><input data-path="audit.${a.id}.change" value="${esc(getPath(design, `audit.${a.id}.change`))}" aria-label="${esc(a.label)}: one change I could make"></td>
        </tr>`).join("");
      return `
      <div class="card">
        ${field({ path: "audit.session", label: "Which session are you auditing?", placeholder: "e.g. Week 4: hypertension management" })}
        <table class="grid stack">
          <thead><tr><th>Strategy</th><th>Already in my session?</th><th>Where or how</th><th>One change I could make</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${live("audit")}
      </div>
      <div class="card">
        <h2>Two changes you will make</h2>
        <p class="muted">“In my session on ___, I currently ___. I will add ___ by ___.”</p>
        ${field({ path: "audit.change1", label: "Change 1", type: "textarea", rows: 2 })}
        ${field({ path: "audit.change2", label: "Change 2", type: "textarea", rows: 2 })}
        <p class="hint-line">${strengthMark("design")} Self-check: Can you realistically make these next term? Does each connect to your outcome? Did you name what you will do, not only what you want to improve?</p>
      </div>
      <div class="card">
        <h3>Myth or fact? ${whyBtn("neuromyth_styles")}</h3>
        <p>“Students learn better when taught in their preferred learning style.”</p>
        <details><summary>Reveal</summary><p><strong>Myth.</strong> Choose the format the content calls for, and offer more than one way to engage because it helps everyone.</p></details>
      </div>`;
    },

    session() {
      const s = design.session;
      const segs = s.segments || [];
      const methodOpts = Object.entries(K.ACTIVITIES).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join("");
      const rows = segs.map((g, i) => `
        <tr>
          <td><input class="seg-min" type="number" min="0" data-num data-path="session.segments.${i}.minutes" value="${esc(g.minutes)}" aria-label="Segment ${i + 1} minutes"></td>
          <td><select data-path="session.segments.${i}.method" aria-label="Segment ${i + 1} method"><option value="">Method…</option>${methodOpts.replace(`value="${g.method}"`, `value="${g.method}" selected`)}</select></td>
          <td><input data-path="session.segments.${i}.what" value="${esc(g.what)}" aria-label="Segment ${i + 1}: what learners do" placeholder="What learners do"></td>
          <td><button type="button" class="btn link" data-action="removeSegment" data-i="${i}" aria-label="Remove segment ${i + 1}">Remove</button></td>
        </tr>`).join("");
      return `
      <div class="card">
        <h2>Modality ${whyBtn("modality")}</h2>
        ${hintLine("modality")}
        <div class="choices" role="group" aria-label="Modality">
          ${C.MODALITIES.map(m => `<button type="button" class="choice" data-action="setModality" data-v="${m.id}" aria-pressed="${s.modality === m.id}"><span class="c-title">${esc(m.label)}</span><span class="c-sub">${esc(m.fit)}</span></button>`).join("")}
        </div>
        ${field({ path: "session.modalityReason", label: "Why this modality fits the outcome", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>Timed outline ${whyBtn("method_fit")}</h2>
        ${hintLine("active_why")}
        <div class="row">${field({ path: "session.length", label: "Session length (minutes)", type: "number" })}</div>
        <table class="grid stack">
          <thead><tr><th>Min</th><th>Method</th><th>What learners do</th><th><span class="sr">Remove</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p><button type="button" class="btn small ghost" data-action="addSegment">Add segment</button></p>
        <div data-live="timebar"></div>
        ${live("session")}
      </div>
      <div class="card">
        ${field({ path: "session.feedbackDuring", label: "How learners get feedback during the session", type: "textarea", rows: 2, hint: "plan_feedback" })}
        ${field({ path: "session.cut", label: "What you will cut or move to pre-class", type: "textarea", rows: 2, hint: "protect_time" })}
        ${field({ path: "session.tellWhy", label: "How you will tell learners why the activity is there", type: "textarea", rows: 2, hint: "feels_worse" })}
        <div class="field"><div class="label-row"><span class="label">Accessibility checks</span>${whyBtn("udl")}</div>${hintLine("udl")}
          <div class="weave">${["Captions or transcripts", "Real headings", "Alt text for images", "Another way to show learning"].map((a, i) =>
            `<label><input type="checkbox" data-path="session.access.${i}"${getPath(design, `session.access.${i}`) ? " checked" : ""}> ${esc(a)}</label>`).join("")}</div>
        </div>
        ${s.modality === "async" || s.modality === "sync_online" || s.modality === "blended" ? `<p class="hint-line">${strengthMark("framework")} Online: plan teaching, social and cognitive presence. ${whyBtn("presence")}</p>` : ""}
      </div>`;
    },

    assessment() {
      const a = design.assessment;
      const rub = a.rubric || [];
      const rows = rub.map((r, i) => `
        <tr>
          <td><input data-path="assessment.rubric.${i}.criterion" value="${esc(r.criterion)}" aria-label="Criterion ${i + 1}" placeholder="e.g. Clinical reasoning"></td>
          <td><input data-path="assessment.rubric.${i}.meets" value="${esc(r.meets)}" aria-label="Criterion ${i + 1}: what Meets looks like" placeholder="What Meets looks like"></td>
          <td><button type="button" class="btn link" data-action="removeRubric" data-i="${i}" aria-label="Remove criterion ${i + 1}">Remove</button></td>
        </tr>`).join("");
      return `
      <div class="card">
        <h2>Practice before the graded task</h2>
        ${field({ path: "assessment.formative", label: "Formative practice: what, when, stakes", type: "textarea", rows: 2, hint: "formative" })}
      </div>
      <div class="card">
        <h2>The graded task</h2>
        ${hintLine("authentic")}
        ${field({ path: "assessment.type", label: "Assessment format", type: "select", hint: "authentic", noLine: true, options: Object.entries(K.ASSESSMENTS).map(([k, v]) => ({ value: k, label: v.label })), after: live("assessmentFit") })}
        ${field({ path: "assessment.task", label: "What learners must do", type: "textarea", rows: 2 })}
        ${field({ path: "assessment.whyMatches", label: "Why this task matches the outcome verb", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>Rubric ${whyBtn("rubric_use")}</h2>
        ${hintLine("rubric_observable")}
        <table class="grid stack"><thead><tr><th>Criterion</th><th>Meets</th><th><span class="sr">Remove</span></th></tr></thead><tbody>${rows}</tbody></table>
        <p><button type="button" class="btn small ghost" data-action="addRubric">Add criterion</button></p>
        ${field({ path: "assessment.rubricShared", label: "When and how learners see the rubric and examples", type: "textarea", rows: 2, hint: "rubric_use", noLine: true })}
      </div>
      <div class="card">
        <h2>Feedback</h2>
        ${field({ path: "assessment.feedbackRoutine", label: "Feedback routine: when, what form, what learners do with it", type: "textarea", rows: 2, hint: "feedback_where_next" })}
        ${field({ path: "assessment.feedbackSample", label: "Rewrite one comment you have given: a strength, a gap and a next step", type: "textarea", rows: 2, hint: "feedback_levels", noLine: true, after: live("feedback") })}
        <div class="field"><div class="label-row"><span class="label">Workload plan</span>${whyBtn("feedback_scale")}</div>${hintLine("feedback_scale")}
          <div class="weave">${C.WORKLOAD.map((w, i) => `<label><input type="checkbox" data-path="assessment.workload.${i}"${getPath(design, `assessment.workload.${i}`) ? " checked" : ""}> ${esc(w)}</label>`).join("")}</div>
        </div>
        ${field({ path: "assessment.fairness", label: "Fairness checks", type: "textarea", rows: 2, hint: "fairness", placeholder: "Consistent scoring, a clear review process, accommodations" })}
      </div>`;
    },

    alignment() {
      return `
      <div class="card">
        <h2>Outcome → practice → assessment ${whyBtn("alignment_chain")}</h2>
        ${hintLine("alignment_chain")}
        <div data-live="chain"></div>
        ${live("alignmentIssues")}
      </div>
      <div class="card">
        <h2>Checks a computer cannot make</h2>
        <div class="weave" style="flex-direction:column">
          <label><input type="checkbox" data-path="alignment.taughtAll"${design.alignment.taughtAll ? " checked" : ""}> The assessment covers nothing that is not in the outcome or the activities. ${whyBtn("pattern_never_taught")}</label>
          <label><input type="checkbox" data-path="alignment.noOrphans"${design.alignment.noOrphans ? " checked" : ""}> Every activity and assessment in this session ties to an outcome.</label>
        </div>
        ${field({ path: "alignment.biggest", label: "“The biggest misalignment in my session is ___, and I will fix it by ___.”", type: "textarea", rows: 2 })}
      </div>`;
    },

    ai() {
      const ai = design.ai;
      return `
      <div class="card">
        <h2>Start from the outcome ${whyBtn("ai_performance")}</h2>
        ${hintLine("ai_performance")}
        ${field({ path: "ai.withoutAI", label: "What must learners be able to do without AI?", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>Level of AI use for the graded task ${whyBtn("ai_level_choose")}</h2>
        ${hintLine("ai_level_choose")}
        <div class="choices" role="group" aria-label="AI level">
          ${C.AI_LEVELS.map(l => `<button type="button" class="choice" data-action="setAI" data-v="${l.level}" aria-pressed="${Number(ai.level) === l.level}"><span class="c-title">${aiMark(l.level)}</span><span class="c-sub">${esc(l.meaning)}</span><span class="c-sub"><em>Fits:</em> ${esc(l.fit)}</span></button>`).join("")}
        </div>
        <p class="hint-line">${strengthMark("framework")} The published scale has been revised; check the current wording before adopting it.</p>
        ${field({ path: "ai.reason", label: "Why this level", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        ${field({ path: "ai.visible", label: "How the assignment makes the learner's own thinking visible", type: "textarea", rows: 2, hint: "ai_visible" })}
        ${field({ path: "ai.document", label: "What learners must document about AI use", type: "textarea", rows: 2, hint: "ai_document" })}
        ${field({ path: "ai.verify", label: "Verification expectation for learners", type: "textarea", rows: 2, hint: "ai_verify" })}
        ${field({ path: "ai.wording", label: "Syllabus or assignment wording", type: "textarea", rows: 4, hint: "ai_syllabus", after: `<p class="no-print"><button type="button" class="btn small ghost" data-action="insertWording">Start from the course template</button></p>` })}
        ${field({ path: "ai.misuse", label: "How you will respond to suspected misuse", type: "textarea", rows: 2, hint: "ai_detectors" })}
        ${live("ai")}
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
            <div class="weave" role="group" aria-label="Where ${esc(d.label)} lives in this design">
              <span class="label">Where it lives:</span>
              ${["outcome", "activity", "assessment"].map(k => `<label><input type="checkbox" data-path="mission.dimensions.${idx}.${k}"${c[k] ? " checked" : ""}> ${k === "outcome" ? "The outcome" : k === "activity" ? "An activity" : "The assessment"}</label>`).join("")}
            </div>
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

    plan() {
      return `
      <div class="card">
        <h2>Evaluation and first step</h2>
        ${field({ path: "evaluation.measure", label: "What you will look at to see whether it worked, and when", type: "textarea", rows: 2, hint: "evaluate_change" })}
        <div class="row">
          ${field({ path: "evaluation.firstStep", label: "The one change you will make first", hint: "first_step", noLine: true })}
          ${field({ path: "evaluation.firstDate", label: "Date", type: "date" })}
        </div>
        ${field({ path: "evaluation.feasibility", label: "Time, resources and support you need", type: "textarea", rows: 2 })}
      </div>
      <div class="card">
        <h2>Self-check against the reviewer's rubric ${whyBtn("capstone_rubric")}</h2>
        ${hintLine("badge_threshold")}
        <div data-live="selfcheck"></div>
      </div>
      <div class="card" id="planDoc">
        <div class="label-row" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
          <h2 style="margin:0">Teaching Improvement Plan</h2>
          <span class="no-print">${EMBEDDED
            ? `<button type="button" class="btn small" data-action="copyPlan">Copy plan text</button>
          <button type="button" class="btn small ghost" data-action="copyJSON">Copy design data</button>`
            : `<button type="button" class="btn small" data-action="print">Print or save as PDF</button>
          <button type="button" class="btn small ghost" data-action="export">Export JSON</button>`}
          <button type="button" class="btn small ghost" data-action="import">Import JSON</button></span>
        </div>
        <p class="muted no-print" id="planMsg" role="status"></p>
        <div data-live="plan"></div>
      </div>`;
    },
  };

  // ---------- Live regions ----------
  function issueList(issues, okText) {
    if (!issues.length) return okText ? `<p class="ok-line">✓ ${esc(okText)}</p>` : "";
    return issues.map(i => `<div class="issue">${statusMark(i.severity)}<div>${esc(i.message)} ${i.hint ? `<button type="button" class="btn link" data-hint="${i.hint}">Why?</button>` : ""}</div></div>`).join("");
  }
  const activityLabel = id => (K.ACTIVITIES[id] || {}).label || id;

  const LIVE = {
    outcome() {
      const t = design.outcome.text;
      if (!has(t)) return `<p class="muted">Write your outcome, and the studio will check the verb and suggest a level.</p>`;
      const r = K.analyzeOutcome(t);
      const chips = [];
      if (r.verbs.length) chips.push(`<span class="muted">Verbs:</span> ${r.verbs.map(v => `<strong>${esc(v)}</strong>`).join(", ")}`);
      if (r.bloom) chips.push(bloomMark(r.bloom, "Suggested Bloom"));
      if (r.millerFloor && !design.outcome.miller) chips.push(millerMark(r.millerFloor, "At least Miller"));
      return `<div class="chips">${chips.join(" ")}</div>${issueList(r.issues, "Observable verb with what and context.")}`;
    },
    millerHelp() {
      const m = Number(design.outcome.miller);
      const typical = { 1: "Written exam, multiple-choice", 2: "Case-based or extended questions", 3: "Simulation, standardized patient, OSCE", 4: "Direct observation, workplace-based assessment" };
      return m ? `<p class="hint-line">${millerMark(m)} Typical assessment: ${esc(typical[m])}.</p>` : "";
    },
    others() {
      const n = String(design.outcome.others || "").split("\n").filter(has).length + (has(design.outcome.text) ? 1 : 0);
      if (n > 8) return issueList([{ severity: "note", message: `${n} outcomes. Fewer, stronger outcomes are easier to teach and assess.`, hint: "few_outcomes" }]);
      return n > 1 ? `<p class="muted">${n} course outcomes listed.</p>` : "";
    },
    audit() {
      const no = C.AUDIT.filter(a => getPath(design, `audit.${a.id}.status`) === "no");
      const set = C.AUDIT.filter(a => getPath(design, `audit.${a.id}.status`));
      if (!set.length) return "";
      const msgs = [];
      if (no.some(a => a.id === "retrieval" || a.id === "spacing")) msgs.push({ severity: "note", message: "Retrieval and spacing have the strongest evidence and are cheap to add. Start there.", hint: "retrieval" });
      return `<p class="muted">${set.length - no.length} of ${set.length} strategies at least partly present.</p>${issueList(msgs)}`;
    },
    timebar() {
      const segs = (design.session.segments || []).filter(s => Number(s.minutes) > 0);
      const total = K.sumMinutes(segs);
      const length = Number(design.session.length) || total;
      if (!total) return "";
      const scale = Math.max(total, length);
      const bars = segs.map(s => {
        const a = K.ACTIVITIES[s.method];
        const cls = !a ? "t-listen" : a.practice ? "t-do" : "t-listen";
        return `<span class="${cls}" style="width:${(Number(s.minutes) / scale) * 100}%" title="${esc((a && a.label) || "Unspecified")}: ${s.minutes} min"></span>`;
      }).join("");
      const doing = segs.filter(s => K.ACTIVITIES[s.method] && K.ACTIVITIES[s.method].practice).reduce((n, s) => n + Number(s.minutes), 0);
      return `<div class="timebar" role="img" aria-label="${doing} of ${total} minutes have learners doing something">${bars}</div>
        <div class="legend-inline"><span><i class="sw" style="background:var(--accent)"></i>Learners doing: ${doing} min</span><span><i class="sw" style="background:var(--framework);opacity:.55"></i>Listening or watching: ${total - doing} min</span><span>Total ${total}${design.session.length ? ` of ${design.session.length}` : ""} min</span></div>`;
    },
    session() {
      const r = K.analyzeSession(design.session);
      const al = K.alignment(design);
      const issues = r.issues.concat(al.practice.issues);
      const methods = (design.session.segments || []).filter(s => s.method);
      if (!methods.length) return "";
      return `<div class="chips">${statusMark(al.practice.status, al.practice.status === "pending" ? "Practice: set an outcome first" : "Practice vs. outcome: " + STATUS[al.practice.status][1])}</div>${issueList(issues, "Practice and feedback are built into the session.")}`;
    },
    assessmentFit() {
      const t = design.assessment.type;
      if (!t) return "";
      const a = K.ASSESSMENTS[t];
      const al = K.alignment(design);
      return `<div class="chips"><span class="muted">This format can show up to</span> ${bloomMark(a.bloomMax)} ${millerMark(a.millerMax)} ${statusMark(al.assessment.status, al.assessment.status === "pending" ? "Set an outcome first" : "Match: " + STATUS[al.assessment.status][1])}</div>${issueList(al.assessment.issues)}`;
    },
    feedback() {
      const r = K.analyzeAssessment(design.assessment);
      const fbIssues = r.issues.filter(i => i.code === "self_level" || i.code === "no_next_step");
      return has(design.assessment.feedbackSample) ? issueList(fbIssues, "Specific, about the task, with a next step.") : "";
    },
    chain() {
      const al = K.alignment(design);
      const methods = (design.session.segments || []).map(s => s.method).filter(Boolean);
      const uniq = [...new Set(methods)];
      const t = design.assessment.type;
      const conn = (st, label) => `<div class="connector"><span class="arrow" aria-hidden="true">→</span><span class="eyebrow">${label}</span>${statusMark(st)}</div>`;
      return `<div class="chain">
        <div class="link-box"><h3>Outcome</h3><p>${has(design.outcome.text) ? esc(design.outcome.text) : '<span class="muted">Not written yet</span>'}</p>
          <div class="chips">${bloomMark(al.outcome.bloom)} ${millerMark(al.outcome.miller)}</div></div>
        ${conn(al.practice.status, "Practice")}
        <div class="link-box"><h3>Learning activity</h3><p>${uniq.length ? uniq.map(m => esc(activityLabel(m))).join(", ") : '<span class="muted">No methods yet</span>'}</p></div>
        ${conn(al.assessment.status, "Assessment")}
        <div class="link-box"><h3>Assessment</h3><p>${t ? esc(K.ASSESSMENTS[t].label) : '<span class="muted">Not chosen yet</span>'}</p>
          ${has(design.assessment.task) ? `<p class="muted">${esc(design.assessment.task)}</p>` : ""}</div>
      </div>
      <p>Overall: ${statusMark(al.level.status, al.level.status === "pending" ? "Complete steps 1, 3 and 4 to see alignment" : "Level: " + STATUS[al.level.status][1])}</p>`;
    },
    alignmentIssues() {
      const al = K.alignment(design);
      const issues = al.practice.issues.concat(al.assessment.issues);
      return al.level.status === "pending" ? "" : issueList(issues, "Outcome, practice and assessment sit at the same level.");
    },
    ai() { return issueList(K.analyzeAI(design).issues); },
    mission() {
      const r = K.analyzeMission(design);
      if (!r.chosen) return `<p class="muted">No dimensions chosen yet.</p>`;
      const many = r.chosen > 3 ? [{ severity: "note", message: "More than three. One dimension done well beats several mentioned.", hint: "mission_woven" }] : [];
      return `<p>${statusMark(r.woven === r.chosen ? "aligned" : "partial", `${r.woven} of ${r.chosen} woven into the design`)}</p>${issueList(many.concat(dedupe(r.issues)))}`;
    },
    selfcheck() {
      const e = K.capstoneEstimate(design);
      const rows = e.criteria.map(c => `<tr><td>${esc(c.label)}</td><td>${statusMark(c.rating)}</td></tr>`).join("");
      return `<table class="grid rubric-table"><thead><tr><th>Criterion</th><th>Estimate</th></tr></thead><tbody>${rows}</tbody></table>
        <p style="margin-top:.6rem">${e.badgeLikely ? statusMark("meets", "Likely meets the badge standard") : statusMark("approaching", `${e.meets} of 5 Meets so far`)} <span class="muted">An estimate from your entries. A trained reviewer decides.</span></p>`;
    },
    plan() { return planHTML(); },
  };
  function dedupe(issues) { const seen = new Set(); return issues.filter(i => (seen.has(i.code) ? false : seen.add(i.code))); }

  function planHTML() {
    const d = design, c = d.course;
    const sec = (n, title, body) => `<div class="plan-section"><h3>${n}. ${esc(title)}</h3>${body && body.trim() ? body : '<p class="empty">Not yet written.</p>'}</div>`;
    const p = v => (has(v) ? `<p>${esc(v)}</p>` : "");
    const segs = (d.session.segments || []).filter(s => s.method || s.what);
    const rub = (d.assessment.rubric || []).filter(r => has(r.criterion));
    const auditChanges = [d.audit.change1, d.audit.change2].filter(has);
    const dims = (d.mission.dimensions || []).map(x => ({ x, def: M.DIMENSIONS.find(m => m.id === x.id) })).filter(o => o.def);
    const access = ["Captions or transcripts", "Real headings", "Alt text for images", "Another way to show learning"].filter((a, i) => getPath(d, `session.access.${i}`));
    return [
      sec(1, "Course and learners", p([c.name, c.code, c.school, c.level, c.size ? `${c.size} learners` : "", d.session.modality ? (C.MODALITIES.find(m => m.id === d.session.modality) || {}).label : ""].filter(has).join(" · ")) + p(c.learners)),
      sec(2, "Outcome", has(d.outcome.text) ? `<p>${esc(d.outcome.text)}</p><div class="chips">${bloomMark(K.alignment(d).outcome.bloom)} ${millerMark(Number(d.outcome.miller))}</div>` : ""),
      sec(3, "Current state", p(d.audit.session) + (auditChanges.length ? `<ul>${auditChanges.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "")),
      sec(4, "The change: session", p(d.session.modalityReason) + (segs.length ? `<ul>${segs.map(s => `<li>${esc(s.minutes || "?")} min · ${esc(activityLabel(s.method) || "")}${has(s.what) ? ": " + esc(s.what) : ""}</li>`).join("")}</ul>` : "") + (has(d.session.feedbackDuring) ? `<p><strong>Feedback:</strong> ${esc(d.session.feedbackDuring)}</p>` : "")),
      sec(5, "The change: assessment", (d.assessment.type ? `<p><strong>${esc(K.ASSESSMENTS[d.assessment.type].label)}.</strong> ${esc(d.assessment.task || "")}</p>` : "") + p(d.assessment.whyMatches) + (rub.length ? `<ul>${rub.map(r => `<li><strong>${esc(r.criterion)}:</strong> ${esc(r.meets || "")}</li>`).join("")}</ul>` : "") + (has(d.assessment.feedbackRoutine) ? `<p><strong>Feedback routine:</strong> ${esc(d.assessment.feedbackRoutine)}</p>` : "")),
      sec(6, "AI approach", (d.ai.level ? `<p>${aiMark(Number(d.ai.level))}</p>` : "") + p(d.ai.reason) + p(d.ai.document) + (has(d.ai.wording) ? `<blockquote>${esc(d.ai.wording)}</blockquote>` : "")),
      sec(7, "Feasibility", p(d.evaluation.feasibility) + p(d.session.cut)),
      sec(8, "Evaluation", p(d.evaluation.measure)),
      sec(9, "First step", has(d.evaluation.firstStep) ? `<p>${esc(d.evaluation.firstStep)}${has(d.evaluation.firstDate) ? ` · ${esc(d.evaluation.firstDate)}` : ""}</p>` : ""),
      sec(10, "Accessibility", access.length ? `<p>${access.map(esc).join(", ")}</p>` : ""),
      `<div class="plan-section"><h3>${ICONS.mission} Mission lens: Scholarship for Service <span class="draft-flag">Proposed addition</span></h3>${dims.length ? `<ul>${dims.map(o => `<li><strong>${esc(o.def.label)}</strong>${["outcome", "activity", "assessment"].filter(k => o.x[k]).length ? ` (in ${["outcome", "activity", "assessment"].filter(k => o.x[k]).join(", ")})` : " (not yet woven in)"}${has(o.x.how) ? `: ${esc(o.x.how)}` : ""}</li>`).join("")}</ul>` : '<p class="empty">Not yet written.</p>'}</div>`,
    ].join("");
  }

  function refreshLive() {
    document.querySelectorAll("[data-live]").forEach(el => {
      const fn = LIVE[el.dataset.live];
      if (fn) el.innerHTML = fn();
    });
    renderNav();
    renderWhy();
  }

  // ---------- Progress ----------
  function progress(id) {
    const d = design;
    const checks = {
      course: [d.course.name, d.course.learners, d.outcome.text, d.outcome.miller],
      audit: [d.audit.session, ...C.AUDIT.map(a => getPath(d, `audit.${a.id}.status`)), d.audit.change1],
      session: [d.session.modality, d.session.modalityReason, (d.session.segments || []).some(s => s.method) ? 1 : "", d.session.feedbackDuring],
      assessment: [d.assessment.formative, d.assessment.type, d.assessment.task, (d.assessment.rubric || []).filter(r => has(r.criterion) && has(r.meets)).length >= 3 ? 1 : "", d.assessment.feedbackRoutine],
      alignment: [K.alignment(d).level.status !== "pending" ? 1 : "", d.alignment.taughtAll ? 1 : "", d.alignment.biggest],
      ai: [d.ai.withoutAI, d.ai.level, d.ai.reason, d.ai.wording],
      mission: [K.analyzeMission(d).woven ? 1 : ""],
      plan: [d.evaluation.measure, d.evaluation.firstStep, d.evaluation.firstDate],
    }[id] || [];
    const done = checks.filter(has).length;
    return { done, total: checks.length, state: done === 0 ? "empty" : done === checks.length ? "done" : "started" };
  }
  function stepIssues(id) {
    const d = design, al = K.alignment(d);
    switch (id) {
      case "course": return K.analyzeOutcome(d.outcome.text).issues;
      case "session": return K.analyzeSession(d.session).issues.concat(al.practice.issues);
      case "assessment": return K.analyzeAssessment(d.assessment).issues.concat(al.assessment.issues);
      case "alignment": return al.practice.issues.concat(al.assessment.issues);
      case "ai": return K.analyzeAI(d).issues;
      case "mission": return dedupe(K.analyzeMission(d).issues);
      default: return [];
    }
  }

  function renderNav() {
    $("#stepNav").innerHTML = C.STEPS.map(s => {
      const pr = progress(s.id);
      const gaps = stepIssues(s.id).filter(i => i.severity === "gap").length;
      const cls = pr.state === "done" ? "done" : pr.state === "started" ? "started" : s.id === "mission" ? "mission" : "";
      const meta = s.module ? C.MODULES[s.module].replace(/: .*/, "") : s.id === "mission" ? "Scholarship for Service" : "";
      return `<li><a href="#${s.id}"${s.id === stepId ? ' aria-current="step"' : ""}>
        <span class="step-num ${cls}" aria-hidden="true">${pr.state === "done" ? "✓" : s.n}</span>
        <span>${esc(s.title)}${gaps ? ` <span class="step-flag" title="${gaps} gap(s)">✕${gaps}</span>` : ""}<span class="step-meta">${esc(meta)}</span>
        <span class="sr">${pr.state === "done" ? "complete" : pr.state === "started" ? "in progress" : "not started"}${gaps ? `, ${gaps} gaps` : ""}</span></span></a></li>`;
    }).join("");
  }

  // ---------- Why panel ----------
  function hintCard(id) {
    const h = ALL_HINTS[id];
    if (!h) return "";
    const kind = hintKind(h);
    const src = h.source ? `<p class="source-chip">Source: ${esc(C.MODULES[h.source[0]])}${typeof h.source[1] === "number" ? `, Page ${h.source[1]}` : h.source[1] ? `, ${esc(h.source[1])}` : ""}</p>` : kind === "mission" ? `<p class="source-chip">Mission lens <span class="draft-flag">Draft for review</span></p>` : "";
    const ev = (h.evidence || []).map(e => C.EVIDENCE[e]).filter(Boolean).map(e => `<div class="ev-row">${strengthMark(e.strength)} ${esc(e.claim)}. <span class="muted">${esc(e.support)}.</span>${e.caveat ? ` <span class="caveat">${esc(e.caveat)}</span>` : ""}</div>`).join("");
    return `<div class="hint-card${kind === "mission" ? " mission" : ""}">
      <h3>${esc(h.title)}</h3>
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
    const draftLen = stepDraftLength(stepId);
    const coachReady = draftLen >= 40;
    let coach = "";
    if (stepId !== "plan") {
      const res = coachState.step === stepId ? coachState : {};
      coach = `<div class="panel-section"><h3>Coach ${whyBtn("try_first")}</h3>
        ${coachState.available === false ? `<p class="muted">${EMBEDDED ? "The AI coach runs when the studio is hosted on its own server. This preview has every other feature." : "The AI coach runs on the studio's server (npm start with an API key). Everything else works without it."}</p>` : `
        <p class="muted">${coachReady ? "Your draft is ready for a critique." : "Draft this step first. The coach critiques your thinking; it does not replace it."}</p>
        <button type="button" class="btn small" data-action="coach" ${coachReady && !coachState.loading && coachState.available ? "" : "disabled"}>${coachState.loading && res.step ? "Thinking…" : "Ask the coach to critique this step"}</button>`}
        ${res.error ? `<p class="status gap" style="margin-top:.5rem">${esc(res.error)}</p>` : ""}
        ${res.result ? coachHTML(res.result) : ""}
      </div>`;
    }
    $("#whyPanel").innerHTML = `
      <h2>Why this step</h2>
      <p class="why-step">${esc(s.why)}</p>
      <p class="source-chip">${s.module != null ? esc(C.MODULES[s.module]) : '<span class="draft-flag">Mission lens · draft for review</span>'}</p>
      ${focusHint ? `<div class="panel-section"><h3>You asked why</h3>${hintCard(focusHint)}</div>` : `<p class="muted">Select any <span class="why" style="pointer-events:none">Why</span> button to see the reasoning and the evidence behind it.</p>`}
      ${issues.length ? `<div class="panel-section"><h3>Checks on this step</h3>${issueList(issues)}</div>` : ""}
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
    const pick = {
      course: [design.outcome.text, design.course.learners], audit: [design.audit.change1, design.audit.change2, ...C.AUDIT.map(a => getPath(design, `audit.${a.id}.change`))],
      session: [design.session.modalityReason, design.session.feedbackDuring, ...(design.session.segments || []).map(s => s.what)],
      assessment: [design.assessment.task, design.assessment.formative, design.assessment.feedbackRoutine, ...(design.assessment.rubric || []).map(r => r.meets)],
      alignment: [design.alignment.biggest, design.outcome.text], ai: [design.ai.withoutAI, design.ai.reason, design.ai.wording],
      mission: (design.mission.dimensions || []).map(d => d.how),
    }[id] || [];
    return pick.filter(has).join(" ").length;
  }

  // ---------- Coach ----------
  async function checkCoach() {
    try {
      const r = await fetch("api/health", { cache: "no-store" });
      const j = await r.json();
      coachState.available = !!j.ai;
    } catch (e) { coachState.available = false; }
    renderWhy();
  }
  async function askCoach() {
    const payload = { step: stepId, design: stripForCoach(design) };
    const phi = K.scanForPHI(JSON.stringify(payload));
    coachState = Object.assign(coachState, { step: stepId, result: null, error: null });
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
  function stripForCoach(d) {
    const copy = JSON.parse(JSON.stringify(d));
    delete copy.id; delete copy.updatedAt;
    return copy;
  }

  // ---------- Render step ----------
  function renderStep() {
    const s = C.STEPS.find(x => x.id === stepId) || C.STEPS[0];
    stepId = s.id;
    fid = 0;
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
    const list = Object.values(db.designs).sort((a, b) => b.updatedAt - a.updatedAt);
    $("#designSelect").innerHTML = list.map(d => `<option value="${d.id}"${d.id === design.id ? " selected" : ""}>${esc(d.course.name || d.title)}</option>`).join("");
  }
  function renderBanner() {
    $("#sourceBanner").innerHTML = `Built on <strong>${esc(C.SOURCE.title)}</strong> by ${esc(C.SOURCE.owner)} · ${esc(C.SOURCE.status)} · Mission lens: <span class="draft-flag">draft for review</span> · Your work is saved in this browser only.`;
  }
  function renderLegend() {
    $("#legend").innerHTML = `
      <h2 id="legendTitle" style="margin-top:0">Symbols</h2>
      <p class="muted">Every symbol answers a question. A word always accompanies the shape.</p>
      <h3>How sure are we?</h3>
      <div class="legend-grid">
        ${["strong", "moderate", "limited", "framework", "design"].map(k => `${strengthMark(k)}<span>${esc(C.STRENGTH[k].label)}</span>`).join("")}
      </div>
      <h3>How does this form the whole person?</h3>
      <div class="legend-grid">${strengthMark("mission")}<span>${esc(C.STRENGTH.mission.label)}. Mission hints never carry an evidence rating.</span></div>
      <h3>What kind of thinking, competence and AI use?</h3>
      <div class="legend-grid">
        ${bloomMark(5)}<span>Bloom's revised taxonomy: remember → create</span>
        ${millerMark(3)}<span>Miller's pyramid: knows → knows how → shows how → does</span>
        ${aiMark(2)}<span>AI Assessment Scale: 1 (no AI) → 5 (AI exploration)</span>
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

  // ---------- Example ----------
  function exampleDesign() {
    const d = blankDesign("Example: hypertension");
    Object.assign(d.course, { name: "Pharmacotherapy II (example)", code: "EXAMPLE 742", school: "Pharmacy", level: "Professional (entry-level clinical)", size: 80,
      learners: "Second-year pharmacy students who start ambulatory care rotations next term." });
    Object.assign(d.outcome, { text: "Select and justify a first-line treatment for a patient with hypertension and a comorbidity.", miller: 2,
      others: "Explain the mechanism of each major antihypertensive class\nCounsel a patient starting an ACE inhibitor\nAdjust therapy for a patient with chronic kidney disease" });
    d.audit = { session: "Week 4: hypertension management",
      retrieval: { status: "no", where: "", change: "Open with three polling questions on last week's renal content" },
      spacing: { status: "partly", where: "Revisited on the final exam", change: "Revisit in weeks 6 and 9" },
      concrete: { status: "no", where: "Starts with drug classes", change: "Open with a patient case" },
      problem: { status: "partly", where: "", change: "" }, load: { status: "partly", where: "62 slides", change: "Cut decorative slides" },
      steps: { status: "no", where: "", change: "Narrate how I choose between classes" },
      change1: "In my session on hypertension, I currently lecture through drug classes. I will add a patient case at the start by reordering my slides." };
    d.session = { modality: "in_person", modalityReason: "Live case discussion with immediate feedback.", length: 50,
      segments: [{ minutes: 40, method: "lecture", what: "Drug classes, mechanisms and guidelines" }, { minutes: 10, method: "case", what: "One case worked together at the end" }],
      feedbackDuring: "", cut: "", tellWhy: "" };
    d.assessment = { formative: "", type: "mcq_recall", task: "20 multiple-choice questions on drug classes", whyMatches: "",
      rubric: [{ criterion: "Clinical reasoning", meets: "Good reasoning" }, {}, {}], workload: [], feedbackRoutine: "", feedbackSample: "Good job overall!" };
    return d;
  }

  // ---------- Events ----------
  document.addEventListener("input", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.path) return;
    let v = t.type === "checkbox" ? t.checked : t.value;
    if (t.hasAttribute("data-num") && v !== "") v = Number(v);
    setPath(design, t.dataset.path, v);
    save();
    if (t.dataset.path === "course.name") renderDesignSelect();
    refreshLive();
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
      case "addSegment": design.session.segments = (design.session.segments || []).concat([{}]); save(); renderStep(); break;
      case "removeSegment": design.session.segments.splice(i, 1); save(); renderStep(); break;
      case "addRubric": design.assessment.rubric = (design.assessment.rubric || []).concat([{}]); save(); renderStep(); break;
      case "removeRubric": design.assessment.rubric.splice(i, 1); save(); renderStep(); break;
      case "setModality": design.session.modality = design.session.modality === v ? "" : v; save(); renderStep(); break;
      case "setAI": design.ai.level = Number(design.ai.level) === Number(v) ? "" : Number(v); save(); renderStep(); break;
      case "toggleDim": {
        const list = design.mission.dimensions || (design.mission.dimensions = []);
        const k = list.findIndex(x => x.id === v);
        if (k >= 0) list.splice(k, 1); else list.push({ id: v });
        focusHint = "mission_woven"; save(); renderStep(); break;
      }
      case "insertWording":
        if (!has(design.ai.wording)) {
          design.ai.wording = "AI tools may be used for [list allowed uses] in [named assignments]. They may not be used for [list restricted uses]. When you use AI, include a short note stating the tool, how you used it and what you changed. You are responsible for the accuracy of everything you submit. Using AI in ways not allowed for an assignment will be handled under [institutional policy]. If you are unsure, ask before you submit.";
          save(); renderStep();
        }
        break;
      case "coach": askCoach(); break;
      case "copyPlan": copyText($("[data-live=plan]").innerText, "Plan copied. Paste it into a document or the Canvas submission box."); break;
      case "copyJSON": copyText(JSON.stringify(design, null, 2), "Design data copied. Save it as a .json file to import later."); break;
      case "print": window.print(); break;
      case "export": {
        const blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = `${(design.course.name || "course-design").replace(/[^\w-]+/g, "-")}.json`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        break;
      }
      case "import": $("#importFile").click(); break;
      case "newDesign": switchTo(blankDesign()); break;
      case "loadExample": switchTo(exampleDesign()); location.hash = "#alignment"; break;
      case "legend": $("#legend").showModal(); break;
    }
  });

  function flash(msg) {
    const el = $("#planMsg") || $("#flash");
    if (el) el.textContent = msg;
  }
  async function copyText(text, ok) {
    try { await navigator.clipboard.writeText(text); flash(ok); }
    catch (e) { flash("Copying is blocked here. Select the plan text and copy it yourself."); }
  }
  function switchTo(d) {
    db.designs[d.id] = d; db.current = d.id; design = d; focusHint = null;
    coachState = Object.assign(coachState, { result: null, error: null, step: null });
    save(); renderDesignSelect(); renderStep();
  }

  $("#designSelect").addEventListener("change", e => {
    db.current = e.target.value; design = db.designs[db.current]; focusHint = null; save(); renderStep();
  });
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d !== "object" || !d.outcome) throw new Error("Not a Course Studio design file.");
      d.id = uid();
      switchTo(Object.assign(blankDesign(), d));
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
    if (C.STEPS.some(s => s.id === id)) { stepId = id; focusHint = null; renderStep(); $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); }
  });

  renderBanner(); renderLegend(); renderDesignSelect(); renderStep(); checkCoach();
})();
