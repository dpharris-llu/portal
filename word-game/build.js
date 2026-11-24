// Builds game.html (claude.ai artifact page) and index.html (standalone page) from src/.
// Run with: node build.js
const fs = require("fs");
const path = require("path");
const src = f => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const secret = src("secret-words.txt").trim();
const words = src("words.txt").trim();
const openers = JSON.parse(src("openers.json"));
const body = [
  src("head.html"),
  `<script id="engine-src">\n${src("engine.js")}</script>`,
  `<script>\nconst ANSWERS_STR = "${secret}";\nconst VALID_STR = "${words}";\nconst OPENERS = ${JSON.stringify(openers)};\n${src("game.js")}</script>\n`,
].join("\n");
fs.writeFileSync(path.join(__dirname, "game.html"), body);
fs.writeFileSync(path.join(__dirname, "index.html"),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}</body>\n</html>\n`);
console.log("built game.html and index.html");
