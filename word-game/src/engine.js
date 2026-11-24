// Assessment engine for Five Letter Hunt.
// Pure functions, no DOM. Works in the browser (window.WordEngine) and in Node (module.exports).
//
// Two dictionaries are kept separate:
//   guesses - every word the player is permitted to type
//   answers - every word the player should treat as a possible answer
// All counts, recommendations and guarantees are computed against these two lists only.
(function (root) {
  "use strict";

  const SOLVED = 242; // pattern code for five greens (2,2,2,2,2 in base 3)
  const GRADES = ["Poor", "Weak", "Fair", "Good", "Excellent", "Optimal"];

  // Estimated further guesses needed to finish once k answers remain (including the guess that solves).
  // Exact for k = 1 and 2; a calibrated estimate above that. Used only to compare moves, never to claim guarantees.
  const finishCost = k => (k <= 1 ? 1 : 1.5 + 0.21 * Math.log(k - 1));

  function createEngine(opts) {
    const guesses = opts.guesses, answers = opts.answers;
    const G = guesses.length, A = answers.length;
    const gIndex = new Map(), aIndex = new Map();
    const gCodes = new Uint8Array(G * 5), aCodes = new Uint8Array(A * 5);
    guesses.forEach((w, i) => { gIndex.set(w, i); for (let k = 0; k < 5; k++) gCodes[i * 5 + k] = w.charCodeAt(k) - 97; });
    answers.forEach((w, i) => { aIndex.set(w, i); for (let k = 0; k < 5; k++) aCodes[i * 5 + k] = w.charCodeAt(k) - 97; });
    const ansToGuess = new Int32Array(A).fill(-1);
    answers.forEach((w, i) => { const g = gIndex.get(w); if (g !== undefined) ansToGuess[i] = g; });
    const openers = opts.openers || null;

    // ---- Exact feedback rules (greens first, then yellows limited by unmatched letters) ----
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

    // ---- Statistics of one guess against a set of possible answers ----
    const CNT = new Int32Array(243);
    function fillCounts(gi, set) { CNT.fill(0); for (let j = 0; j < set.length; j++) CNT[pattern(gi, set[j])]++; }
    function summarize(n) {
      let sq = 0, worst = 0, groups = 0, cost = 0;
      for (let p = 0; p < 243; p++) {
        const k = CNT[p]; if (!k) continue;
        groups++; sq += k * k; if (k > worst) worst = k;
        if (p !== SOLVED) cost += k * finishCost(k);
      }
      return { expected: sq / n, worst, groups, isCandidate: CNT[SOLVED] > 0, solveChance: CNT[SOLVED] / n, eg: 1 + cost / n };
    }
    function stats(gi, set) {
      fillCounts(gi, set);
      const s = summarize(set.length);
      s.word = guesses[gi]; s.gi = gi;
      return s;
    }
    function buckets(gi, set) {
      const m = new Map();
      for (const a of set) { const p = pattern(gi, a); if (!m.has(p)) m.set(p, []); m.get(p).push(a); }
      return m;
    }

    // Score every permitted guess against the set (cost: guesses x answers).
    function scanAll(set) {
      const n = set.length;
      const eg = new Float64Array(G), expected = new Float64Array(G);
      const worst = new Int32Array(G), groups = new Int32Array(G), cand = new Uint8Array(G);
      for (let gi = 0; gi < G; gi++) {
        fillCounts(gi, set);
        const s = summarize(n);
        eg[gi] = s.eg; expected[gi] = s.expected; worst[gi] = s.worst; groups[gi] = s.groups; cand[gi] = s.isCandidate ? 1 : 0;
      }
      return { eg, expected, worst, groups, cand };
    }
    const byInfo = sc => (a, b) => sc.eg[a] - sc.eg[b] || sc.cand[b] - sc.cand[a] || sc.worst[a] - sc.worst[b];
    const bySafety = sc => (a, b) => sc.worst[a] - sc.worst[b] || sc.eg[a] - sc.eg[b] || sc.cand[b] - sc.cand[a];
    function topBy(sc, cmp, k) { const idx = Array.from({ length: G }, (_, i) => i); idx.sort(cmp(sc)); return idx.slice(0, k); }

    // ---- Recursive guarantee search ----
    // canSolve(set, t): can every answer in `set` be found within t more guesses?
    // Returns true (verified), false (proven impossible) or null (not determined within the search limits).
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
      const key = t + ":" + set.join(",");
      if (memo.has(key)) return memo.get(key);
      let res;
      if (t === 2) {
        // Needs one guess that gives every remaining answer its own color pattern. Exhaustive search.
        res = false;
        for (const a of set) { const gi = ansToGuess[a]; if (gi >= 0 && splitsFully(gi, set)) { res = true; break; } }
        if (!res) {
          budget -= G * n; if (budget < 0) throw OUT_OF_BUDGET;
          for (let gi = 0; gi < G; gi++) if (splitsFully(gi, set)) { res = true; break; }
        }
      } else {
        // Try the most promising guesses; a found strategy is a real proof, a miss is left undetermined.
        budget -= G * n; if (budget < 0) throw OUT_OF_BUDGET;
        const sc = scanAll(set);
        const tries = [...new Set([...topBy(sc, bySafety, t >= 4 ? 2 : 4), ...topBy(sc, byInfo, t >= 4 ? 1 : 2)])];
        res = null;
        for (const gi of tries) { if (guaranteesAfter(gi, set, t) === true) { res = true; break; } }
      }
      memo.set(key, res);
      return res;
    }
    // If the player guesses gi now with t turns left (including this one), is a win guaranteed?
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
    function safeGuarantee(gi, set, t, limit) {
      budget = limit;
      try { return guaranteesAfter(gi, set, t); }
      catch (e) { if (e === OUT_OF_BUDGET) return null; throw e; }
    }

    const VERIFY_LIMIT = 400; // above this many answers, guarantees are not searched

    // ---- Analyze one decision ----
    // set: sorted answer indices still possible; T: turns left including this one; userGi: the guess played.
    function analyzePosition(set, T, userGi, answerIdx) {
      const n = set.length;
      memo.clear();
      const user = stats(userGi, set);
      user.pWin = T === 1 ? user.solveChance : T === 2 ? user.groups / n : null;
      const atOpening = openers && n === A;
      let sc = null, alts;
      if (atOpening) {
        alts = openers.map(o => Object.assign({}, o, { gi: gIndex.get(o.word) }));
      } else {
        if (n > 2500) {
          // Very large lists: shortlist on an evenly spaced sample, then measure the shortlist exactly.
          const step = n / 2000, sample = [];
          for (let i = 0; i < 2000; i++) sample.push(set[Math.floor(i * step)]);
          const ssc = scanAll(sample);
          alts = topBy(ssc, byInfo, 20).map(gi => stats(gi, set));
        } else sc = scanAll(set);
        if (sc) alts = [...new Set([...topBy(sc, byInfo, 8), ...topBy(sc, bySafety, 6), ...(T === 2 ? topBy(sc, s => (a, b) => s.groups[b] - s.groups[a] || s.cand[b] - s.cand[a] || s.eg[a] - s.eg[b], 6) : [])])];
        if (sc) alts = alts.map(gi => stats(gi, set));
      }
      alts.forEach(a => { a.pWin = T === 1 ? a.solveChance : T === 2 ? a.groups / n : null; });

      // Guarantees
      let guaranteeAvailable = null;
      if (n === 1) { guaranteeAvailable = true; user.guaranteed = user.isCandidate; alts.forEach(a => a.guaranteed = a.isCandidate); }
      else if (T === 1) { guaranteeAvailable = false; user.guaranteed = false; alts.forEach(a => a.guaranteed = false); }
      else if (T === 2) {
        // Exact: a guarantee needs a guess that gives every answer its own pattern.
        user.guaranteed = user.groups === n;
        alts.forEach(a => a.guaranteed = a.groups === n);
        guaranteeAvailable = n <= 243 && sc ? sc.groups.some(g => g === n) : false;
      } else if (n <= VERIFY_LIMIT) {
        user.guaranteed = safeGuarantee(userGi, set, T, 4e7);
        // Check the strongest alternatives first; stop early once several verified options are known.
        alts.sort((a, b) => a.eg - b.eg);
        let found = 0;
        for (const a of alts) {
          if (a.gi === userGi) { a.guaranteed = user.guaranteed; continue; }
          a.guaranteed = found >= 3 ? undefined : safeGuarantee(a.gi, set, T, 1.2e7);
          if (a.guaranteed === true) found++;
        }
        alts = alts.filter(a => a.guaranteed !== undefined);
        guaranteeAvailable = user.guaranteed === true || alts.some(a => a.guaranteed === true) ? true : null;
      } else {
        user.guaranteed = null; alts.forEach(a => a.guaranteed = null);
      }

      // Pick the best move for this stage of the game
      let ranked;
      if (n === 1 || T === 1) {
        // Final guess or forced answer: only a possible answer can win.
        const cands = set.map(a => ansToGuess[a]).filter(g => g >= 0).map(gi => stats(gi, set));
        cands.forEach(a => { a.pWin = a.solveChance; a.guaranteed = n === 1; });
        ranked = cands;
      } else if (guaranteeAvailable === true) {
        const g = alts.filter(a => a.guaranteed === true);
        if (user.guaranteed === true && !g.some(a => a.gi === userGi)) g.push(user);
        ranked = g.sort((a, b) => a.eg - b.eg || b.isCandidate - a.isCandidate || a.worst - b.worst);
      } else if (T === 2) {
        ranked = alts.slice().sort((a, b) => b.pWin - a.pWin || b.isCandidate - a.isCandidate || a.eg - b.eg);
      } else {
        ranked = alts.slice().sort((a, b) => a.eg - b.eg || b.isCandidate - a.isCandidate || a.worst - b.worst);
      }
      const best = ranked[0];

      // Grade the decision (never looks at the actual feedback)
      let grade, designation, cost = 0, reason = "";
      const isUserBest = best && best.gi === userGi;
      if (n === 1) {
        designation = "Forced";
        if (user.isCandidate) grade = "Optimal";
        else { grade = "Poor"; cost = 1.5; reason = "missedForced"; }
      } else if (T === 1) {
        if (user.isCandidate) { grade = "Optimal"; designation = "Informed guess"; }
        else { grade = "Poor"; designation = "Risky"; cost = 1.5; reason = "finalNotAnswer"; }
      } else if (user.groups === 1 && !user.isCandidate) {
        grade = "Poor"; designation = "Scouting guess"; cost = 1; reason = "noInfo";
      } else {
        designation = user.guaranteed === true ? "Guaranteed solution" : user.isCandidate ? "Informed guess" : "Scouting guess";
        if (guaranteeAvailable === true && user.guaranteed === false) {
          designation = "Risky"; reason = "lostGuarantee";
          const loss = T === 2 ? best.pWin - user.pWin : 0.25;
          grade = loss >= 0.25 ? "Poor" : "Weak"; cost = 1 + loss;
        } else if (T === 2) {
          const loss = Math.max(0, best.pWin - user.pWin);
          grade = isUserBest || loss <= 1e-9 ? "Optimal" : loss <= 0.05 ? "Excellent" : loss <= 0.12 ? "Good" : loss <= 0.25 ? "Fair" : "Weak";
          cost = loss * 2;
        } else {
          const d = Math.max(0, user.eg - best.eg);
          grade = isUserBest || d <= 0.015 ? "Optimal" : d <= 0.08 ? "Excellent" : d <= 0.2 ? "Good" : d <= 0.4 ? "Fair" : d <= 0.8 ? "Weak" : "Poor";
          cost = d;
        }
      }

      // Outcome and luck (reported separately from the grade)
      const actual = answerIdx == null ? null : pattern(userGi, answerIdx);
      let after = null, luck = null;
      if (actual != null) {
        const bs = buckets(userGi, set);
        after = bs.get(actual);
        const m = after.length;
        if (user.groups > 1) {
          let below = 0, equal = 0;
          for (const b of bs.values()) { if (b.length < m) below += b.length; else if (b.length === m) equal += b.length; }
          const q = (below + 0.5 * equal) / n;
          luck = { q, label: q < 0.1 ? "Very favorable" : q < 0.3 ? "Favorable" : q <= 0.7 ? "Typical" : q <= 0.9 ? "Unfavorable" : "Very unfavorable" };
        } else luck = { q: 0.5, label: n === 1 ? "No luck involved" : "Typical" };
      }

      const words = arr => arr.map(a => answers[a]);
      const groupsOf = gi => [...buckets(gi, set).entries()].map(([p, b]) => ({ colors: patternToColors(p), words: words(b) })).sort((x, y) => y.words.length - x.words.length);

      return {
        n, T, user, best, alternatives: ranked.filter(a => a.gi !== userGi).slice(0, 3),
        guaranteeAvailable, grade, gradeScore: GRADES.indexOf(grade), designation, reason, cost, luck,
        solved: actual === SOLVED,
        afterCount: after ? (actual === SOLVED ? 0 : after.length) : null,
        afterSet: after,
        candidatesBefore: n <= 10 ? words(set) : null,
        afterWords: after && after.length <= 10 && actual !== SOLVED ? words(after) : null,
        userGroups: n <= 10 ? groupsOf(userGi) : null,
        bestGroups: n <= 10 && best && !isUserBest ? groupsOf(best.gi) : null,
        isUserBest,
      };
    }

    // ---- Review a whole game ----
    function reviewGame(guessWords, answerWord, maxTurns) {
      maxTurns = maxTurns || 6;
      const ai = aIndex.get(answerWord);
      if (ai === undefined) throw new Error("Answer is not in the possible-answer list");
      let set = Array.from({ length: A }, (_, i) => i);
      const moves = [];
      guessWords.forEach((w, idx) => {
        const gi = gIndex.get(w);
        if (gi === undefined) throw new Error("Guess is not in the permitted-guess list: " + w);
        const pos = analyzePosition(set, maxTurns - idx, gi, ai);
        pos.index = idx;
        moves.push(pos);
        set = pos.afterSet;
      });
      moves.forEach(m => { delete m.afterSet; });
      return { moves, won: guessWords[guessWords.length - 1] === answerWord, answer: answerWord, maxTurns };
    }

    // Analyze a hand-picked position (used by the tests).
    function analyzeWords(candidateWords, T, guessWord, answerWord) {
      const set = candidateWords.map(w => { const i = aIndex.get(w); if (i === undefined) throw new Error("Not a possible answer: " + w); return i; }).sort((a, b) => a - b);
      const gi = gIndex.get(guessWord);
      if (gi === undefined) throw new Error("Not a permitted guess: " + guessWord);
      const res = analyzePosition(set, T, gi, answerWord ? aIndex.get(answerWord) : null);
      delete res.afterSet;
      return res;
    }

    function topOpeners(k) {
      const all = Array.from({ length: A }, (_, i) => i);
      const sc = scanAll(all);
      return topBy(sc, byInfo, k).map(gi => { const s = stats(gi, all); delete s.gi; return s; });
    }

    return { reviewGame, analyzeWords, topOpeners, counts: { guesses: G, answers: A } };
  }

  const api = { createEngine, GRADES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WordEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
