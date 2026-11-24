// Course Studio server: serves src/ and provides the AI coach at POST /api/coach.
// Run: ANTHROPIC_API_KEY=... npm start   (the studio works without a key; only the coach needs one)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const COURSE = require("./src/content/course.js");
const MISSION = require("./src/content/mission.js");
const Checks = require("./src/checks.js");

const PORT = Number(process.env.PORT) || 8080;
const ROOT = path.join(__dirname, "src");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

let client = null;
try { client = new Anthropic(); } catch (e) { client = null; }
const aiEnabled = () => !!client && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// The coach critiques; it does not write the design for the faculty member.
const SYSTEM = `You are the coach inside Course Studio, a course design workbench for faculty at Loma Linda University Health.
The studio embeds the faculty development course "Teaching Well in Higher Ed" (Learning Innovation). Ground every observation in that course's guidance, which is provided with each request.

How you help:
- Critique the faculty member's own draft of their course. Do not rewrite their course for them or hand them a finished outcome, rubric or plan. The course warns that offloading the thinking to AI can raise performance without raising learning, and that applies to faculty too. You may give one short example phrase when it makes a point clearer.
- Be specific to their course and discipline. Name what is already strong before what is missing.
- Tie each observation to the course: name the module, framework or misalignment pattern it comes from (for example "Module 2: outcome higher than the assessment" or "Miller: shows how").
- Be honest about evidence in the way the course is. Do not overstate. Do not cite studies, authors or statistics that are not in the guidance provided, and never invent a citation.
- Ask questions that help them decide, rather than deciding for them.
- The mission lens (Scholarship for Service) is a draft for review. Treat mission prompts as invitations rooted in Loma Linda's values, never as evidence claims, and never pressure anyone about personal faith.
- If the design appears to contain patient identifiers or other protected information, say so first and do not repeat it.
Keep it brief: at most five observations and three questions.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "observations", "questions"],
  properties: {
    summary: { type: "string", description: "One or two sentences on the state of this step." },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "course_link"],
        properties: {
          kind: { type: "string", enum: ["strength", "gap", "question", "mission"] },
          text: { type: "string" },
          course_link: { type: "string", description: "The module, framework or pattern this comes from." },
        },
      },
    },
    questions: { type: "array", items: { type: "string" } },
  },
};

function guidanceFor(stepId) {
  const step = COURSE.STEPS.find(s => s.id === stepId);
  if (!step) return "";
  const lines = [`Step: ${step.title}. ${step.why}`];
  if (step.module != null) {
    lines.push(`Course module: ${COURSE.MODULES[step.module]}.`);
    Object.values(COURSE.HINTS).filter(h => h.source && h.source[0] === step.module).forEach(h => {
      const ev = (h.evidence || []).map(id => COURSE.EVIDENCE[id]).filter(Boolean).map(e => `${e.strength}: ${e.claim}`).join("; ");
      lines.push(`- ${h.title}: ${h.hint} ${h.deeper}${ev ? ` [Evidence: ${ev}]` : ""}`);
    });
  }
  if (stepId === "alignment" || stepId === "outcomes" || stepId === "assessments") {
    ["alignment_chain", "pattern_outcome_above", "pattern_instruction_below", "pattern_wrong_tool", "pattern_never_taught", "miller", "bloom"].forEach(id => {
      const h = COURSE.HINTS[id];
      lines.push(`- ${h.title}: ${h.hint} ${h.deeper}`);
    });
  }
  if (stepId === "mission") {
    lines.push(`Mission (wording to confirm): ${MISSION.ANCHORS.mission.text}. Themes (draft): ${MISSION.ANCHORS.themes.map(t => `${t.name} (${t.who}): ${t.draft}`).join(" ")}`);
    MISSION.DIMENSIONS.forEach(d => lines.push(`- ${d.label}: ${d.short}. Outcome: ${d.outcome} Activity: ${d.activity} Assessment: ${d.assessment}`));
    Object.values(MISSION.HINTS).forEach(h => lines.push(`- ${h.title}: ${h.hint}`));
  }
  return lines.join("\n");
}

function automatedChecks(course) {
  const m = Checks.courseMatrix(course);
  const all = [].concat(
    ...(course.outcomes || []).map((o, i) => Checks.analyzeOutcome(o.text).issues.map(x => Object.assign({}, x, { who: "O" + (i + 1) }))),
    ...m.rows.map(r => r.issues.map(x => Object.assign({}, x, { who: (r.outcome.text || "").slice(0, 40) }))),
    m.orphans, m.issues, Checks.analyzeWeights(course).issues, Checks.analyzeWorkload(course).issues,
    Checks.analyzeSession(course.session).issues, Checks.analyzeMission(course).issues,
    ...(course.assessments || []).map(a => Checks.analyzeAssessmentAI(a, course.outcomes).issues));
  return all.map(i => `- [${i.severity}]${i.who ? " " + i.who + ":" : ""} ${i.message}`).join("\n") || "- none";
}

async function coach(body) {
  const stepId = String(body.step || "");
  const course = body.course && typeof body.course === "object" ? body.course : {};
  const raw = JSON.stringify(course);
  if (raw.length > 120000) return { status: 413, json: { error: "That course is too large to send to the coach." } };
  const phi = Checks.scanForPHI(raw);
  if (phi) return { status: 400, json: { error: `This looks like it contains ${phi}. Remove identifiers before asking the coach.` } };
  if (!COURSE.STEPS.some(s => s.id === stepId)) return { status: 400, json: { error: "Unknown step." } };

  const user = `<course_guidance>\n${guidanceFor(stepId)}\n</course_guidance>\n\n<automated_checks>\n${automatedChecks(course)}\n</automated_checks>\n\n<course step="${stepId}">\n${JSON.stringify(course, null, 2)}\n</course>\n\nCritique the "${stepId}" step of this course design. The automated checks have already been shown to the faculty member, so add what they cannot see rather than repeating them.`;

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") return { status: 422, json: { error: "The coach could not help with this request. Try rephrasing the step." } };
    if (response.stop_reason === "max_tokens") return { status: 502, json: { error: "The coach's answer was cut off. Try again." } };
    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    return { status: 200, json: JSON.parse(text) };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { status: 503, json: { error: "The coach's API key was rejected." } };
    if (err instanceof Anthropic.RateLimitError) return { status: 503, json: { error: "The coach is busy. Try again in a minute." } };
    if (err instanceof Anthropic.APIError) return { status: 502, json: { error: `The coach is unavailable (${err.status || "error"}).` } };
    if (err instanceof SyntaxError) return { status: 502, json: { error: "The coach returned an unreadable answer. Try again." } };
    throw err;
  }
}

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/health") return send(res, 200, { ai: aiEnabled() });
  if (url.pathname === "/api/coach" && req.method === "POST") {
    if (!aiEnabled()) return send(res, 503, { error: "The coach is not configured on this server." });
    let data = "";
    req.on("data", c => { data += c; if (data.length > 400000) req.destroy(); });
    req.on("end", async () => {
      let body;
      try { body = JSON.parse(data); } catch (e) { return send(res, 400, { error: "Invalid request." }); }
      try { const r = await coach(body); send(res, r.status, r.json); }
      catch (e) { console.error(e); send(res, 500, { error: "The coach hit an unexpected error." }); }
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Course Studio on http://localhost:${PORT}`);
    console.log(aiEnabled() ? "AI coach: on (claude-opus-5-5)" : "AI coach: off. Set ANTHROPIC_API_KEY to turn it on.");
  });
}
module.exports = { server, guidanceFor, SYSTEM, SCHEMA };
