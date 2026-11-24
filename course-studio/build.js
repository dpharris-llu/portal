// Builds dist/course-studio.html: one self-contained page for a click-through preview.
// The preview has no server, so the AI coach is off; everything else works.
// Run with: node build.js
const fs = require("fs");
const path = require("path");
const src = f => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const html = src("index.html");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script src="[^"]+"><\/script>\s*/g, "");
const scripts = ["content/course.js", "content/mission.js", "checks.js", "app.js"]
  .map(f => `<script>\n${src(f)}</script>`).join("\n");
const page = `<title>LLU Course Studio</title>
<style>
${src("styles.css")}</style>
${body.trim()}
<script>window.STUDIO_EMBEDDED = true;</script>
${scripts}
`;
fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "course-studio.html"), page);
console.log(`built dist/course-studio.html (${Math.round(page.length / 1024)} KB)`);
