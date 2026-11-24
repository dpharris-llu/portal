// Assessment engine for Five Letter Hunt.
// Pure functions, no DOM. Works in the browser (window.WordEngine), in a worker, and in Node (module.exports).
//
// Three ideas are kept apart:
//   Possible  - every permitted word consistent with the feedback. Used for elimination and for strict guarantees.
//   Plausible - possible words with likelihood >= 0.5 (common, answer-shaped words).
//   Probable  - every possible word weighted by its likelihood. Used for expected values, chances and recommendations.
// Two dictionaries are kept separate: `guesses` (permitted guesses) and `answers` (possible answers).
(function (root) {
  "use strict";

  const SOLVED = 242; // pattern code for five greens
  const GRADES = ["Poor", "Weak", "Fair", "Good", "Excellent", "Optimal"];
  const PLAUSIBLE = 0.5; // also the bar for a "common" guess word
  const MIN_WEIGHT = 0.002; // a possible word is never impossible, only unlikely

  // Estimated further guesses needed once the likely answers are spread over `k` effective words
  // (including the guess that solves). Exact for k = 1 and k = 2, a calibrated estimate above that.
  const finishCost = k => (k <= 1 ? 1 : k <= 2 ? 1 + 0.5 * (k - 1) : 1.5 + 0.21 * Math.log(k - 1));

  function createEngine(opts) {
    const guesses = opts.guesses, answers = opts.answers;
    const G = guesses.length, A = answers.length;
    const gIndex = new Map(), aIndex = new Map();
    const gCodes = new Uint8Array(G * 5), aCodes = new Uint8Array(A * 5);
    guesses.forEach((w, i) => { gIndex.set(w, i); for (let k = 0; k < 5; k++) gCodes[i * 5 + k] = w.charCodeAt(k) - 97; });
    answers.forEach((w, i) => { aIndex.set(w, i); for (let k = 0; k < 5; k++) aCodes[i * 5 + k] = w.charCodeAt(k) - 97; });
    const ansToGuess = new Int32Array(A).fill(-1);
    answers.forEach((w, i) => { const g = gIndex.get(w); if (g !== undefined) ansToGuess[i] = g; });
    // Likelihood of each possible answer (1 = uniform when no model is given)
    const weight = new Float64Array(A).fill(1);
    if (opts.weights) for (let i = 0; i < A; i++) weight[i] = Math.max(MIN_WEIGHT, opts.weights[i]);
    const guessWeight = new Float64Array(G);
    for (let gi = 0; gi < G; gi++) { const a = aIndex.get(guesses[gi]); guessWeight[gi] = a === undefined ? 0 : weight[a]; }
    const openers = opts.openers || null;

    // ---- Exact feedback rules ----
    const PC = new Uint8Array(26), PR = new Uint8Array(5);
    function pattern(gi, ai) {
      const g = gi * 5, a = ai * 5;
      for (let i = 0; i < 5; i++) { PC[aCodes[a + i]] = 0; PC[gCodes[g + i]] = 0; }
      for (let i = 0; i < 5; i++) {
        const gc = gCodes[g + i], ac = aCodes[a + i];
        if (gc === ac) PR[i] = 2; else { PR[i] = 0; PC[ac]++; }
      }
      let p = 0;
      for (let i = 0; i < 5; i++) {
        if (PR[i] !== 2) { const gc = gCodes[g + i]; if (PC[gc] > 0) { PR[i] = 1; PC[gc]--; } }
        p = p * 3 + PR[i];
      }
      return p;
    }
    const patternToColors = p => { const out = []; for (let i = 4; i >= 0; i--) { out[i] = ["miss", "near", "hit"][p % 3]; p = Math.floor(p / 3); } return out; };

    // ---- Statistics of one guess against a set ----
    const CNT = new Int32Array(243), CW = new Float64Array(243), CW2 = new Float64Array(243), CMAX = new Float64Array(243);
    function fill(gi, set) {
      CNT.fill(0); CW.fill(0); CW2.fill(0); CMAX.fill(0);
      for (let j = 0; j < set.length; j++) {
        const a = set[j], p = pattern(gi, a), w = weight[a];
        CNT[p]++; CW[p] += w; CW2[p] += w * w; if (w > CMAX[p]) CMAX[p] = w;
      }
    }
    function summarize(n, W) {
      let groups = 0, worst = 0, expected = 0, uniformExpected = 0, cost = 0, nextBest = 0;
      for (let p = 0; p < 243; p++) {
        const k = CNT[p]; if (!k) continue;
        groups++; if (k > worst) worst = k;
        const prob = CW[p] / W;
        expected += prob * k;              // expected possible words left, using the likelihood model
        uniformExpected += k * k / n;       // same with every word equally likely
        if (p !== SOLVED) { cost += prob * finishCost(CW[p] * CW[p] / CW2[p]); nextBest += CMAX[p]; }
      }
      const solveChance = CW[SOLVED] / W;
      return {
        groups, worst, expected, uniformExpected, isCandidate: CNT[SOLVED] > 0, solveChance,
        eg: 1 + cost,                       // expected guesses to finish, this one included
        pWin2: (CW[SOLVED] + nextBest) / W, // exact chance of finishing within this guess and one more
      };
    }
    const totalWeight = set => { let W = 0; for (const a of set) W += weight[a]; return W; };
    function stats(gi, set, W) {
      fill(gi, set);
      const s = summarize(set.length, W || totalWeight(set));
      s.word = guesses[gi]; s.gi = gi; s.common = guessWeight[gi];
      return s;
    }
    function buckets(gi, set) {
      const m = new Map();
      for (const a of set) { const p = pattern(gi, a); if (!m.has(p)) m.set(p, []); m.get(p).push(a); }
      return m;
    }

    function scanAll(set) {
      const n = set.length, W = totalWeight(set);
      const eg = new Float64Array(G), worst = new Int32Array(G), groups = new Int32Array(G), pWin2 = new Float64Array(G), cand = new Uint8Array(G);
      for (let gi = 0; gi < G; gi++) {
        fill(gi, set);
        const s = summarize(n, W);
        eg[gi] = s.eg; worst[gi] = s.worst; groups[gi] = s.groups; pWin2[gi] = s.pWin2; cand[gi] = s.isCandidate ? 1 : 0;
      }
      return { eg, worst, groups, pWin2, cand };
    }
    // Near-ties go to a common word that could be the answer.
    const key = (sc, gi) => sc.eg[gi] - 0.02 * guessWeight[gi];
    const byInfo = sc => (a, b) => key(sc, a) - key(sc, b) || sc.worst[a] - sc.worst[b];
    const bySafety = sc => (a, b) => sc.worst[a] - sc.worst[b] || key(sc, a) - key(sc, b);
    const byWin2 = sc => (a, b) => sc.pWin2[b] - sc.pWin2[a] || key(sc, a) - key(sc, b);
    const rare = gi => (guessWeight[gi] < PLAUSIBLE ? 1 : 0);
    const commonFirst = cmp => sc => { const c = cmp(sc); return (a, b) => rare(a) - rare(b) || c(a, b); };
    function topBy(sc, cmp, k) { const idx = Array.from({ length: G }, (_, i) => i); idx.sort(cmp(sc)); return idx.slice(0, k); }

    // ---- Guarantees (over every possible word, ignoring likelihood) ----
    // canSolve(set, t): true = verified strategy exists, false = proven impossible, null = undetermined.
    const OUT_OF_BUDGET = { budget: true };
    let budget = 0;
    const memo = new Map();
    const SEEN = new Int32Array(243); let stamp = 0;
    function splitsFully(gi, set) {
      stamp++;
      for (const a of set) { const p = pattern(gi, a); if (SEEN[p] === stamp) return false; SEEN[p] = stamp; }
      return true;
    }
    function canSolve(set, t) {
      const n = set.length;
      if (n === 0) return true;
      if (n === 1) return t >= 1;
      if (t <= 1) return false;
      if (t === 2 && n > 243) return false;
      const k = t + ":" + set.join(",");
      if (memo.has(k)) return memo.get(k);
      let res;
      if (t === 2) {
        res = false; // exhaustive: is there a guess that gives every answer its own pattern?
        for (const a of set) { const gi = ansToGuess[a]; if (gi >= 0 && splitsFully(gi, set)) { res = true; break; } }
        if (!res) {
          budget -= G * n; if (budget < 0) throw OUT_OF_BUDGET;
          for (let gi = 0; gi < G; gi++) if (splitsFully(gi, set)) { res = true; break; }
        }
      } else {
        budget -= G * n; if (budget < 0) throw OUT_OF_BUDGET;
        const sc = scanAll(set);
        const tries = [...new Set([...topBy(sc, bySafety, t >= 4 ? 2 : 4), ...topBy(sc, byInfo, t >= 4 ? 1 : 2)])];
        res = null; // a found strategy is a proof; a miss stays undetermined
        for (const gi of tries) { if (guaranteesAfter(gi, set, t) === true) { res = true; break; } }
      }
      memo.set(k, res);
      return res;
    }
    function guaranteesAfter(gi, set, t) {
      if (t < 1) return false;
      const bs = [...buckets(gi, set).entries()].filter(([p]) => p !== SOLVED).map(([, b]) => b);
      if (!bs.length) return true;
      bs.sort((x, y) => y.length - x.length);
      let unknown = false;
      for (const b of bs) {
        const r = canSolve(b, t - 1);
        if (r === false) return false;
        if (r !== true) unknown = true;
      }
      return unknown ? null : true;
    }
    function guarded(fn, limit) {
      budget = limit;
      try { return fn(); } catch (e) { if (e === OUT_OF_BUDGET) return null; throw e; }
    }
    // Fewest guesses (this one included) that can guarantee a finish, searched up to `maxT`.
    function minGuaranteed(set, maxT) {
      if (set.length === 1) return 1;
      for (let t = 2; t <= maxT; t++) {
        const r = guarded(() => canSolve(set, t), 3e7);
        if (r === true) return t;
        if (r === null) return null;
      }
      return null;
    }

    // How often each letter of a guess appears among the likely answers (share by likelihood).
    function letterShares(gi, set, W) {
      const out = [], seen = new Set();
      for (let i = 0; i < 5; i++) {
        const c = gCodes[gi * 5 + i];
        if (seen.has(c)) continue; seen.add(c);
        let inWord = 0, atSpot = 0;
        for (const a of set) {
          let has = false;
          for (let k = 0; k < 5; k++) if (aCodes[a * 5 + k] === c) { has = true; break; }
          if (has) inWord += weight[a];
          if (aCodes[a * 5 + i] === c) atSpot += weight[a];
        }
        out.push({ letter: String.fromCharCode(97 + c), spot: i + 1, share: inWord / W, spotShare: atSpot / W });
      }
      return out;
    }

    const VERIFY_LIMIT = 400;

    // ---- Analyze one decision ----
    function analyzePosition(set, T, userGi, answerIdx, turnIndex) {
      const n = set.length, W = totalWeight(set);
      memo.clear();
      const plausibleBefore = set.reduce((s, a) => s + (weight[a] >= PLAUSIBLE ? 1 : 0), 0);
      const user = stats(userGi, set, W);
      const atOpening = openers && n === A;
      let sc = null, alts;
      if (atOpening) alts = openers.map(o => Object.assign({}, o, { gi: gIndex.get(o.word) }));
      else {
        if (n > 2500) {
          const step = n / 2000, sample = [];
          for (let i = 0; i < 2000; i++) sample.push(set[Math.floor(i * step)]);
          const ssc = scanAll(sample);
          alts = [...new Set([...topBy(ssc, byInfo, 12), ...topBy(ssc, commonFirst(byInfo), 12)])];
        } else {
          sc = scanAll(set);
          alts = [...new Set([...topBy(sc, byInfo, 6), ...topBy(sc, commonFirst(byInfo), 8), ...topBy(sc, bySafety, 3),
            ...(T === 2 ? [...topBy(sc, byWin2, 4), ...topBy(sc, commonFirst(byWin2), 6)] : [])])];
        }
        alts = alts.map(gi => stats(gi, set, W));
      }

      // Strict guarantees, over every possible word
      let guaranteeAvailable = null, fewest = null;
      if (n === 1) { guaranteeAvailable = true; fewest = 1; user.guaranteed = user.isCandidate; alts.forEach(a => a.guaranteed = a.isCandidate); }
      else if (T === 1) { guaranteeAvailable = false; user.guaranteed = false; alts.forEach(a => a.guaranteed = false); }
      else if (T === 2) {
        user.guaranteed = user.groups === n;
        alts.forEach(a => a.guaranteed = a.groups === n);
        guaranteeAvailable = n <= 243 && sc ? sc.groups.some(g => g === n) : false;
        fewest = guaranteeAvailable ? 2 : null;
      } else if (n <= VERIFY_LIMIT && !(T >= 5 && n > 100)) {
        fewest = minGuaranteed(set, T);
        user.guaranteed = guarded(() => guaranteesAfter(userGi, set, T), 4e7);
        // Common words are all checked; rarer ones until three verified options are known.
        alts.sort((a, b) => (a.common < PLAUSIBLE) - (b.common < PLAUSIBLE) || a.eg - b.eg);
        let found = 0;
        for (const a of alts) {
          if (a.gi === userGi) { a.guaranteed = user.guaranteed; continue; }
          a.guaranteed = a.common < PLAUSIBLE && found >= 3 ? undefined : guarded(() => guaranteesAfter(a.gi, set, T), 1.2e7);
          if (a.guaranteed === true) found++;
        }
        alts = alts.filter(a => a.guaranteed !== undefined);
        // Fewest guesses that can guarantee a finish: also try the strongest moves with fewer turns.
        if (fewest === null && n <= 150) {
          const tryList = alts.slice().sort((a, b) => a.worst - b.worst).slice(0, 4);
          for (let t = 3; t <= Math.min(T, 4) && fewest === null; t++) {
            memo.clear();
            for (const a of tryList) if (guarded(() => guaranteesAfter(a.gi, set, t), 1e7) === true) { fewest = t; break; }
          }
          memo.clear();
        }
        guaranteeAvailable = fewest !== null || user.guaranteed === true || alts.some(a => a.guaranteed === true) ? true : null;
      } else { user.guaranteed = null; alts.forEach(a => a.guaranteed = null); }

      // Choose the best move for this stage
      const rk = a => a.eg - 0.02 * a.common;
      let ranked;
      if (n === 1 || T === 1) {
        ranked = set.map(a => ansToGuess[a]).filter(g => g >= 0).map(gi => stats(gi, set, W)).sort((a, b) => b.solveChance - a.solveChance);
        ranked.forEach(a => a.guaranteed = n === 1);
      } else if (guaranteeAvailable === true && T >= 3 && alts.some(a => a.guaranteed === true)) {
        const g = alts.filter(a => a.guaranteed === true);
        if (user.guaranteed === true && !g.some(a => a.gi === userGi)) g.push(user);
        ranked = g.sort((a, b) => rk(a) - rk(b));
      } else if (T === 2) {
        ranked = alts.slice().sort((a, b) => b.pWin2 - a.pWin2 || rk(a) - rk(b));
      } else {
        ranked = alts.slice().sort((a, b) => rk(a) - rk(b) || a.worst - b.worst);
      }
      // Benchmark against the best common word: the move a strong human player could find.
      // The strongest rare word is reported separately when it is meaningfully better.
      const bestOverall = ranked[0];
      const best = ranked.find(a => a.common >= PLAUSIBLE) || bestOverall;
      const isUserBest = best && best.gi === userGi;
      const rareBetter = bestOverall && best && bestOverall.gi !== best.gi && bestOverall.gi !== userGi && best.eg - bestOverall.eg > 0.03 ? bestOverall : null;

      // Win chance with this guess and the turns after it (exact where it can be computed)
      const winChance = a => T === 1 ? a.solveChance : T === 2 ? a.pWin2 : a.guaranteed === true ? 1 : null;
      user.winChance = winChance(user); if (best) best.winChance = winChance(best);

      // Grade the decision (never uses the actual feedback)
      let grade, designation, cost = 0, reason = "";
      if (n === 1) {
        designation = "Forced";
        if (user.isCandidate) grade = "Optimal"; else { grade = "Poor"; cost = 1.5; reason = "missedForced"; }
      } else if (T === 1) {
        // Last turn: the most likely remaining answer is the best play
        const ratio = best.solveChance ? user.solveChance / best.solveChance : 0;
        if (!user.isCandidate) { grade = "Poor"; designation = "Risky"; cost = 1.5; reason = "finalNotAnswer"; }
        else { designation = "Informed guess"; grade = ratio >= 0.9 ? "Optimal" : ratio >= 0.5 ? "Good" : "Fair"; cost = (1 - ratio) * best.solveChance; reason = ratio < 0.9 ? "unlikelyFinal" : ""; }
      } else if (user.groups === 1 && !user.isCandidate) {
        grade = "Poor"; designation = "Scouting guess"; cost = 1; reason = "noInfo";
      } else {
        // Call it a guaranteed solution only when the guarantee is tight enough to matter.
        // Late in the game, when a guarantee is hard to keep, it's worth calling out.
        const meaningful = user.guaranteed === true && T <= 3;
        designation = turnIndex === 0 ? "Opener" : meaningful ? "Guaranteed solution" : user.isCandidate ? "Informed guess" : "Scouting guess";
        if (guaranteeAvailable === true && user.guaranteed === false) {
          designation = "Risky"; reason = "lostGuarantee";
          const loss = T === 2 ? best.pWin2 - user.pWin2 : 0.25, d = Math.max(0, user.eg - best.eg);
          grade = loss >= 0.25 || d > 0.8 ? "Poor" : "Weak"; cost = 1 + Math.max(loss, d);
        } else if (T === 2) {
          // Two turns left: judge both the chance of finishing and the expected number of guesses.
          const loss = Math.max(0, best.pWin2 - user.pWin2), d = Math.max(0, user.eg - best.eg);
          const byWin = isUserBest || loss <= 0.01 ? 5 : loss <= 0.05 ? 4 : loss <= 0.12 ? 3 : loss <= 0.25 ? 2 : 1;
          const byEg = isUserBest || d <= 0.02 ? 5 : d <= 0.08 ? 4 : d <= 0.2 ? 3 : d <= 0.4 ? 2 : d <= 0.8 ? 1 : 0;
          grade = GRADES[Math.min(byWin, byEg)];
          cost = Math.max(loss * 2, d);
        } else {
          const d = Math.max(0, user.eg - best.eg);
          grade = isUserBest || d <= 0.02 ? "Optimal" : d <= 0.08 ? "Excellent" : d <= 0.2 ? "Good" : d <= 0.4 ? "Fair" : d <= 0.8 ? "Weak" : "Poor";
          cost = d;
        }
      }

      // Outcome and luck (never affects the grade)
      const actual = answerIdx == null ? null : pattern(userGi, answerIdx);
      let after = null, luck = null, realized = null;
      if (actual != null) {
        const bs = buckets(userGi, set);
        after = bs.get(actual);
        const m = after.length;
        let wa = 0, wa2 = 0; for (const a of after) { wa += weight[a]; wa2 += weight[a] * weight[a]; }
        // Outlook after the colors, in expected guesses to finish (this guess included)
        const outlook = (p, b) => { if (p === SOLVED) return 1; let x = 0, x2 = 0; for (const a of b) { x += weight[a]; x2 += weight[a] * weight[a]; } return 1 + finishCost(x * x / x2); };
        realized = outlook(actual, after);
        if (user.groups > 1) {
          // Luck = where your colors fall among all possible color results, by how many guesses they leave you needing.
          let below = 0, equal = 0;
          for (const [p, b] of bs.entries()) {
            let bw = 0; for (const a of b) bw += weight[a];
            const o = outlook(p, b);
            if (o < realized - 1e-9) below += bw; else if (Math.abs(o - realized) <= 1e-9) equal += bw;
          }
          const q = (below + 0.5 * equal) / W;
          luck = { q, label: q < 0.1 ? "Very favorable" : q < 0.3 ? "Favorable" : q <= 0.7 ? "Typical" : q <= 0.9 ? "Unfavorable" : "Very unfavorable" };
        } else luck = { q: 0.5, label: n === 1 ? "No luck involved" : "Typical" };
      }

      const words = arr => arr.map(a => answers[a]);
      const byLikelihood = arr => arr.slice().sort((x, y) => weight[y] - weight[x]);
      const groupsOf = gi => [...buckets(gi, set).entries()].map(([p, b]) => ({ colors: patternToColors(p), words: words(byLikelihood(b)) })).sort((x, y) => y.words.length - x.words.length);
      const plausibleList = arr => words(byLikelihood(arr.filter(a => weight[a] >= PLAUSIBLE)));

      return {
        swing: realized == null ? 0 : user.eg - realized, // positive: the colors helped more than expected
        index: turnIndex, n, T, plausibleBefore, user, best, rareBetter,
        alternatives: ranked.filter(a => a.gi !== userGi && a.common >= PLAUSIBLE).slice(0, 3),
        guaranteeAvailable, fewestGuaranteed: fewest, grade, gradeScore: GRADES.indexOf(grade), designation, reason, cost, luck, realized,
        solved: actual === SOLVED,
        afterCount: after ? (actual === SOLVED ? 0 : after.length) : null,
        plausibleAfter: after ? (actual === SOLVED ? 0 : after.filter(a => weight[a] >= PLAUSIBLE).length) : null,
        afterSet: after,
        candidatesBefore: n <= 10 ? words(byLikelihood(set)) : null,
        plausibleBeforeList: plausibleBefore <= 10 ? plausibleList(set) : null,
        afterWords: after && actual !== SOLVED && after.length <= 10 ? words(byLikelihood(after)) : null,
        plausibleAfterList: after && actual !== SOLVED ? plausibleList(after).slice(0, 10) : null,
        userGroups: n <= 10 ? groupsOf(userGi) : null,
        bestGroups: n <= 10 && best && !isUserBest ? groupsOf(best.gi) : null,
        userLetters: letterShares(userGi, set, W),
        bestLetters: best && !isUserBest ? letterShares(best.gi, set, W) : null,
        isUserBest,
      };
    }

    function reviewGame(guessWords, answerWord, maxTurns) {
      maxTurns = maxTurns || 6;
      const ai = aIndex.get(answerWord);
      if (ai === undefined) throw new Error("Answer is not in the possible-answer list");
      let set = Array.from({ length: A }, (_, i) => i);
      const moves = [];
      guessWords.forEach((w, idx) => {
        const gi = gIndex.get(w);
        if (gi === undefined) throw new Error("Guess is not in the permitted-guess list: " + w);
        const pos = analyzePosition(set, maxTurns - idx, gi, ai, idx);
        moves.push(pos);
        set = pos.afterSet;
      });
      moves.forEach(m => { delete m.afterSet; });
      return { moves, won: guessWords[guessWords.length - 1] === answerWord, answer: answerWord, maxTurns };
    }

    function analyzeWords(candidateWords, T, guessWord, answerWord) {
      const set = candidateWords.map(w => { const i = aIndex.get(w); if (i === undefined) throw new Error("Not a possible answer: " + w); return i; }).sort((a, b) => a - b);
      const gi = gIndex.get(guessWord);
      if (gi === undefined) throw new Error("Not a permitted guess: " + guessWord);
      const res = analyzePosition(set, T, gi, answerWord ? aIndex.get(answerWord) : null, 1);
      delete res.afterSet;
      return res;
    }

    function topOpeners(k) {
      const all = Array.from({ length: A }, (_, i) => i), W = totalWeight(all);
      const sc = scanAll(all);
      return [...new Set([...topBy(sc, byInfo, k), ...topBy(sc, commonFirst(byInfo), k)])].map(gi => { const s = stats(gi, all, W); delete s.gi; return s; });
    }

    return { reviewGame, analyzeWords, topOpeners, counts: { guesses: G, answers: A } };
  }

  // Decode the likelihood string (one base-36 character per word, 0-35) into weights 0..1.
  function decodeLikelihood(str) { const out = new Float64Array(str.length); for (let i = 0; i < str.length; i++) out[i] = parseInt(str[i], 36) / 35; return out; }

  const api = { createEngine, decodeLikelihood, GRADES, PLAUSIBLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WordEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
