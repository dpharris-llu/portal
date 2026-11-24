// Run with: node engine.test.js
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { createEngine, decodeLikelihood } = require("./src/engine.js");

const words = fs.readFileSync(path.join(__dirname, "src/words.txt"), "utf8").trim().split(" ");
// Uniform engine: every possible word equally likely (matches the hand-worked scenario below).
const engine = createEngine({ guesses: words, answers: words.slice() });
// Weighted engine: the likelihood model the game uses.
const likelihood = decodeLikelihood(fs.readFileSync(path.join(__dirname, "src/likelihood.txt"), "utf8").trim());
const weighted = createEngine({ guesses: words, answers: words.slice(), weights: likelihood });
const close = (a, b) => Math.abs(a - b) < 0.01;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("ok -", name); };

// Validation scenario: FLAME, FLAKE, GLAZE remain, two turns left (this guess + one more).
const SET = ["flame", "flake", "glaze"];
const r = w => engine.analyzeWords(SET, 2, w);

test("CLAVE gives no distinguishing information", () => {
  const a = r("clave");
  assert(close(a.user.expected, 3) && a.user.worst === 3 && a.user.groups === 1);
  assert.strictEqual(a.grade, "Poor");
  assert.strictEqual(a.reason, "noInfo");
});
test("GLAZE could be the answer but leaves FLAME and FLAKE together", () => {
  const a = r("glaze");
  assert(close(a.user.expected, 5 / 3) && a.user.worst === 2);
  assert(a.user.isCandidate && close(a.user.solveChance, 1 / 3));
  assert.strictEqual(a.user.guaranteed, false);
  assert.strictEqual(a.designation, "Risky");
  assert(["Weak", "Poor"].includes(a.grade));
});
test("FLAME and FLAKE separate all three answers and guarantee a win", () => {
  for (const w of ["flame", "flake"]) {
    const a = r(w);
    assert(close(a.user.expected, 1) && a.user.worst === 1 && a.user.groups === 3);
    assert.strictEqual(a.user.guaranteed, true);
    assert.strictEqual(a.guaranteeAvailable, true);
    assert.strictEqual(a.grade, "Optimal");
    assert.strictEqual(a.designation, "Guaranteed solution");
  }
});
test("FLAME and FLAKE rank above GLAZE", () => {
  const a = r("glaze");
  assert(["flame", "flake"].includes(a.best.word) || a.best.groups === 3);
  assert(r("flame").user.eg < a.user.eg);
});
test("Grades ignore the outcome: a lucky GLAZE is still a weak decision", () => {
  const lucky = engine.analyzeWords(SET, 2, "glaze", "glaze");
  assert.strictEqual(lucky.solved, true);
  assert.strictEqual(lucky.grade, r("glaze").grade);
  assert.strictEqual(lucky.luck.label, "Favorable");
});
test("Final guess: only a possible answer is acceptable", () => {
  assert.strictEqual(engine.analyzeWords(SET, 1, "flame").grade, "Optimal");
  assert.strictEqual(engine.analyzeWords(SET, 1, "clave").grade, "Poor");
});
test("Forced answer is recognised", () => {
  const a = engine.analyzeWords(["flame"], 3, "flame", "flame");
  assert.strictEqual(a.designation, "Forced");
  assert.strictEqual(a.grade, "Optimal");
  assert.strictEqual(engine.analyzeWords(["flame"], 3, "glaze", "flame").grade, "Poor");
});
test("Guarantee with three turns is verified recursively", () => {
  const set = ["fight", "light", "might", "night", "right", "sight", "tight", "wight"];
  const a = engine.analyzeWords(set, 3, "night");
  assert.strictEqual(a.guaranteeAvailable, true);
  assert.strictEqual(a.best.guaranteed, true);
});
test("Duplicate letters follow the exact feedback rules", () => {
  // SPEED vs ABIDE: one E is yellow, the other gray; D is yellow.
  const a = engine.analyzeWords(["abide", "erase"], 2, "speed", "abide");
  assert.strictEqual(a.afterCount, 1);
});
test("Likelihood model: common words outweigh obscure ones", () => {
  const w = x => likelihood[words.indexOf(x)];
  assert(w("raise") > 0.9 && w("pixel") > 0.9);
  assert(w("tares") < 0.05 && w("dynel") < 0.05);
});
test("Weighted scenario still separates FLAME/FLAKE/GLAZE correctly", () => {
  const a = weighted.analyzeWords(SET, 2, "flake");
  assert.strictEqual(a.user.guaranteed, true);
  assert.strictEqual(a.user.worst, 1);
  assert.strictEqual(a.grade, "Optimal");
});
test("Win chance with two turns left is exact", () => {
  const a = engine.analyzeWords(SET, 2, "glaze");
  assert(close(a.user.pWin2, 2 / 3));
});
test("Full game review runs and grades every move", () => {
  const t = Date.now();
  const rev = weighted.reviewGame(["house", "crane", "moist"], "sixth");
  assert.strictEqual(rev.moves.length, 3);
  rev.moves.forEach(m => assert(m.grade && m.luck));
  console.log("   review time", Date.now() - t, "ms");
});
console.log(passed + " tests passed");
