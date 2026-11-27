// Post-build for the demo file:
// 1. Move the <title> to the top, where page hosts look for it.
// 2. Escape non-ASCII characters in scripts and styles, so the page works
//    even when a server does not declare UTF-8.
import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("./dist/index.html", import.meta.url);
let html = readFileSync(file, "utf8");

const jsEscape = (s) =>
  s.replace(/[^\x00-\x7f]/g, (c) => {
    const code = c.charCodeAt(0);
    return "\\u" + code.toString(16).padStart(4, "0");
  });
const cssEscape = (s) => s.replace(/[^\x00-\x7f]/gu, (c) => "\\" + c.codePointAt(0).toString(16) + " ");

html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (_, a, body, z) => a + jsEscape(body) + z);
html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_, a, body, z) => a + cssEscape(body) + z);
html = html.replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);

const m = html.match(/<title>[^<]*<\/title>/);
if (m) html = m[0] + "\n" + html.replace(m[0], "");
writeFileSync(file, html);
if (/[^\x00-\x7f]/.test(html)) throw new Error("Non-ASCII characters remain");
console.log(`demo/dist/index.html: ${(html.length / 1024).toFixed(0)} KB`);
