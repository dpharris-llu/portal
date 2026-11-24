(function () {
  const ANSWERS = ANSWERS_STR.split(" ");
  const VALID = new Set(VALID_STR.split(" "));
  for (const w of ANSWERS) VALID.add(w);
  const ROWS = 6, COLS = 5;
  const RANK = { miss: 1, near: 2, hit: 3 };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const boardEl = document.getElementById("board");
  const alphaEl = document.getElementById("alpha");
  const statusEl = document.getElementById("status");
  const countsEl = document.getElementById("counts");

  let state;

  // Score is kept in this browser only.
  const STATS_KEY = "five-letter-hunt-stats";
  const blankStats = () => ({ played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });
  let stats = blankStats();
  try { const s = JSON.parse(localStorage.getItem(STATS_KEY)); if (s && Array.isArray(s.dist)) stats = s; } catch (e) {}
  function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {} }

  function recordResult() {
    if (state.recorded) return;
    state.recorded = true;
    stats.played++;
    if (state.won) {
      stats.wins++; stats.streak++; stats.best = Math.max(stats.best, stats.streak);
      stats.dist[state.guesses.length - 1]++;
    } else stats.streak = 0;
    saveStats();
  }

  function paintStats() {
    document.getElementById("sPlayed").textContent = stats.played;
    document.getElementById("sWin").textContent = stats.played ? Math.round(100 * stats.wins / stats.played) : 0;
    document.getElementById("sStreak").textContent = stats.streak;
    document.getElementById("sBest").textContent = stats.best;
    const dist = document.getElementById("dist");
    dist.innerHTML = "";
    const max = Math.max(1, ...stats.dist);
    stats.dist.forEach((n, i) => {
      const l = document.createElement("div"); l.className = "lbl"; l.textContent = i + 1;
      const b = document.createElement("div");
      b.className = "bar" + (state && state.won && state.guesses.length === i + 1 ? " now" : "");
      b.style.width = (n ? Math.max(8, 100 * n / max) : 0) + "%";
      b.textContent = n;
      b.setAttribute("aria-label", `${n} ${n === 1 ? "game" : "games"} solved in ${i + 1}`);
      dist.append(l, b);
    });
  }

  const resetBtn = document.getElementById("resetStats");
  let resetArmed = null;
  resetBtn.addEventListener("click", () => {
    if (!resetArmed) {
      resetBtn.textContent = "Tap again to erase score"; resetBtn.classList.add("confirm");
      resetArmed = setTimeout(() => { resetArmed = null; resetBtn.textContent = "Reset score"; resetBtn.classList.remove("confirm"); }, 4000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = null;
    resetBtn.textContent = "Reset score"; resetBtn.classList.remove("confirm");
    stats = blankStats(); saveStats(); paintStats();
  });

  // Score a guess: greens first, then yellows limited by the letters left over.
  function score(guess, answer) {
    const res = Array(COLS).fill("miss");
    const left = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) res[i] = "hit";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (res[i] !== "hit" && left[guess[i]] > 0) { res[i] = "near"; left[guess[i]]--; }
    }
    return res;
  }

  // ---------- Game review (analysis runs in a background worker) ----------
  const TOTAL_WORDS = VALID_STR.split(" ").length;
  let worker = null, workerFailed = false, syncEngine = null, pending = new Map(), reqId = 0;
  const reviewCache = new Map();
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      const src = document.getElementById("engine-src").textContent + `
        let E = null;
        onmessage = ev => {
          const d = ev.data;
          if (d.init) { E = WordEngine.createEngine({ guesses: d.words, answers: d.words.slice(), weights: WordEngine.decodeLikelihood(d.likelihood), openers: d.openers }); return; }
          try { postMessage({ id: d.id, result: E.reviewGame(d.guesses, d.answer, 6) }); }
          catch (err) { postMessage({ id: d.id, error: String(err && err.message || err) }); }
        };`;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = ev => { const cb = pending.get(ev.data.id); pending.delete(ev.data.id); if (cb) cb(ev.data); };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(cb => cb({ fallback: true })); pending.clear(); };
      worker.postMessage({ init: true, words: VALID_STR.split(" "), likelihood: LIKELIHOOD_STR, openers: OPENERS });
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  function analyze(guesses, answer) {
    const key = guesses.join(",") + ">" + answer;
    if (reviewCache.has(key)) return Promise.resolve(reviewCache.get(key));
    const runSync = () => {
      if (!syncEngine) syncEngine = window.WordEngine.createEngine({ guesses: VALID_STR.split(" "), answers: VALID_STR.split(" "), weights: window.WordEngine.decodeLikelihood(LIKELIHOOD_STR), openers: OPENERS });
      return syncEngine.reviewGame(guesses, answer, 6);
    };
    return new Promise((resolve, reject) => {
      const w = getWorker();
      const done = r => { reviewCache.set(key, r); resolve(r); };
      if (!w) { setTimeout(() => { try { done(runSync()); } catch (e) { reject(e); } }, 30); return; }
      const id = ++reqId;
      pending.set(id, d => {
        if (d.fallback) { try { done(runSync()); } catch (e) { reject(e); } }
        else if (d.error) reject(new Error(d.error)); else done(d.result);
      });
      w.postMessage({ id, guesses, answer });
    });
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const W = w => `<span class="words">${esc(w)}</span>`;
  const plural = (n, w, ws) => `${n.toLocaleString()} ${n === 1 ? w : (ws || w + "s")}`;
  const num = x => x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? x.toFixed(1) : x.toFixed(2);
  const pct = x => Math.round(x * 100) + "%";
  const gradeClass = g => ({ Optimal: "grade-hi", Excellent: "grade-hi", Good: "grade-mid", Fair: "grade-mid", Weak: "grade-lo", Poor: "grade-lo" })[g];
  const splitHTML = groups => `<div class="split">${groups.map(g => `<span class="${g.words.length > 1 ? "lump" : ""}">${g.words.map(esc).join(" · ")}</span>`).join("")}</div>`;
  const guarText = (g, T) => g === true ? "Yes" : g === false ? "No" : "Not verified";
  const turnsLeftText = T => T === 1 ? "this turn" : `${T} turns (this one included)`;

  function moveHTML(m) {
    const u = m.user, b = m.best;
    const tiles = [...u.word].map((ch, k) => `<span class="${state.fbCache[m.index][k]}">${esc(ch)}</span>`).join("");
    const head = `<div class="move-head"><b>Guess ${m.index + 1}</b><div class="mini">${tiles}</div>
      <span class="chip ${gradeClass(m.grade)}">${m.grade}</span>
      <span class="chip chip-outline">${esc(m.designation)}</span>
      <span class="chip chip-outline">Luck: ${esc(m.luck.label)}</span></div>`;
    const after = m.solved ? "Solved" : `${m.afterCount.toLocaleString()} (${m.plausibleAfter} likely)`;
    let guar;
    if (m.n === 1) guar = "Forced answer";
    else if (m.T === 1) guar = "No (last turn)";
    else if (m.guaranteeAvailable === true) {
      const f = m.fewestGuaranteed;
      guar = !f ? "Yes, verified" : f.exact ? `Yes, in ${plural(f.t, "guess", "guesses")} (the minimum)` : `Yes, in at most ${plural(f.t, "guess", "guesses")}`;
    }
    else if (m.guaranteeAvailable === false) guar = "No (proven)";
    else guar = m.n > 100 || m.T >= 5 ? "Not checked this early" : "None found";
    const win = u.winChance == null ? "" : `<div><dt>Win chance, rest of game</dt><dd>${u.winChance === 1 && u.guaranteed === true ? "100% (guaranteed)" : pct(u.winChance)}</dd></div>`;
    const facts = `<dl class="facts">
      <div><dt>Possible before</dt><dd>${m.n.toLocaleString()} (${m.plausibleBefore} likely)</dd></div>
      <div><dt>Possible after</dt><dd>${after}</dd></div>
      <div><dt>Expected guesses to finish</dt><dd>${u.eg.toFixed(2)}${b && !m.isUserBest && m.n > 1 ? ` <span style="color:var(--muted);font-weight:500">(best ${b.eg.toFixed(2)})</span>` : ""}</dd></div>
      <div><dt>Expected words left</dt><dd>${num(u.expected)}</dd></div>
      <div><dt>Worst case left</dt><dd>${u.worst.toLocaleString()}</dd></div>
      <div><dt>Chance to solve now</dt><dd>${u.isCandidate ? (u.solveChance < 0.005 ? "<1%" : pct(u.solveChance)) : "0% (not possible)"}</dd></div>
      <div><dt>Guaranteed win available</dt><dd>${guar}</dd></div>
      ${m.T >= 2 && m.n > 1 && u.guaranteed != null ? `<div><dt>Your guess keeps it</dt><dd>${guarText(u.guaranteed)}</dd></div>` : ""}
      ${win}
    </dl>`;
    const lines = [];
    if (m.candidatesBefore && m.n > 1) lines.push(`<p>Possible answers (most likely first): ${W(m.candidatesBefore.join(", "))}</p>`);
    else if (m.plausibleBeforeList && m.plausibleBeforeList.length && m.n > 1) lines.push(`<p>Likely answers: ${W(m.plausibleBeforeList.join(", "))}, plus ${plural(m.n - m.plausibleBeforeList.length, "rare word")}.</p>`);
    if (m.reason === "missedForced") lines.push(`<p class="flag">Only ${W(m.candidatesBefore[0])} fit your clues. Any other word wastes a turn.</p>`);
    else if (m.reason === "finalNotAnswer") lines.push(`<p class="flag">On the last turn only a possible answer can win, and ${W(u.word)} wasn't one.</p>`);
    else if (m.reason === "unlikelyFinal") lines.push(`<p class="flag">Last turn: ${W(b.word)} was the more likely answer (${pct(b.solveChance)} vs ${pct(u.solveChance)}).</p>`);
    else if (m.reason === "noInfo") lines.push(`<p class="flag">Every possible answer would show the same colors for ${W(u.word)}, so it couldn't tell any of them apart.</p>`);
    else if (m.reason === "lostGuarantee") lines.push(`<p class="flag">A guaranteed win was available with ${turnsLeftText(m.T)}, but ${W(u.word)} left a chance of running out of turns.</p>`);
    if (m.n === 1 && u.isCandidate) lines.push(`<p class="good">Only one word fit, and you played it.</p>`);
    else if (m.T === 1 && m.grade === "Optimal") lines.push(`<p class="good">Last turn, and you played the most likely answer.</p>`);
    else if (m.grade === "Optimal") {
      lines.push(`<p class="good">Among the best moves available here${!u.isCandidate && m.index > 0 ? ", even though it couldn't be the answer: it was the right moment to gather information" : ""}.</p>`);
      if (m.withinMargin) lines.push(`<p style="color:var(--muted)">${W(b.word)} scores marginally better (${b.eg.toFixed(2)} vs ${u.eg.toFixed(2)} guesses), but that gap is within the estimate's margin of error.</p>`);
    }
    if (b && !m.isUserBest && m.grade !== "Optimal" && m.n > 1) {
      if (m.T === 1 || m.n === 1) lines.push(`<p><b>Better option:</b> ${W(b.word)}, the most likely remaining answer.</p>`);
      else {
        // Reasons go in "why" only when they favor the better option; anything that favors your guess is a trade-off.
        const why = [], but = [];
        if (b.eg < u.eg - 0.005) why.push(`it needs about ${b.eg.toFixed(2)} guesses to finish on average, versus ${u.eg.toFixed(2)} for yours`);
        else if (b.eg > u.eg + 0.005) but.push(`it takes slightly more guesses on average (${b.eg.toFixed(2)} vs ${u.eg.toFixed(2)})`);
        if (b.guaranteed === true && u.guaranteed !== true) why.push(`it guarantees a win within ${turnsLeftText(m.T)}`);
        if (m.T === 2 && b.pWin2 > u.pWin2 + 0.005) why.push(`your chance of finishing would be ${pct(b.pWin2)} instead of ${pct(u.pWin2)}`);
        if (b.groups > u.groups) why.push(`it produces ${b.groups} different color patterns across the ${plural(m.n, "possible answer")}, versus ${u.groups} for yours, so you'd usually be left with fewer words`);
        else if (b.groups < u.groups) but.push(`it has fewer possible color patterns (${b.groups} vs ${u.groups})`);
        if (b.worst < u.worst) why.push(`in the worst case it leaves ${b.worst.toLocaleString()} ${b.worst === 1 ? "word" : "words"}, versus ${u.worst.toLocaleString()} for yours`);
        else if (b.worst > u.worst) but.push(`its worst case leaves more words (${b.worst.toLocaleString()} vs ${u.worst.toLocaleString()})`);
        if (b.isCandidate && !u.isCandidate) why.push(`it could also have been the answer (${pct(b.solveChance)} chance)`);
        else if (u.isCandidate && !b.isCandidate) but.push(`it couldn't be the answer itself, while yours had a ${u.solveChance < 0.005 ? "small" : pct(u.solveChance)} chance`);
        const others = m.alternatives.filter(a => a.word !== b.word).slice(0, 2).map(a => a.word);
        const reason = why.length ? ` It's stronger because ${why.join("; ")}.` : "";
        const tradeoff = but.length ? ` Trade-off: ${but.join("; ")}.` : "";
        lines.push(`<p><b>Better option:</b> ${W(b.word)}${others.length ? ` (also strong: ${W(others.join(", "))})` : ""}.${reason}${tradeoff}</p>`);
        const lt = letterNote(m);
        if (lt) lines.push(`<p>${lt}</p>`);
        if (m.bestGroups && m.userGroups) {
          lines.push(`<p>How ${W(b.word)} would sort them by color pattern:</p>${splitHTML(m.bestGroups)}`);
          lines.push(`<p>How ${W(u.word)} sorted them (outlined in red: words that share a color pattern, so it couldn't tell them apart):</p>${splitHTML(m.userGroups)}`);
        }
      }
      if (m.rareBetter) lines.push(`<p style="color:var(--muted)">Among rare words, ${W(m.rareBetter.word)} scores slightly higher (${m.rareBetter.eg.toFixed(2)} guesses). It isn't used as the benchmark because few players would think of it.</p>`);
    }
    if (m.afterWords && m.afterWords.length > 1) lines.push(`<p>Left after the colors: ${W(m.afterWords.join(", "))}</p>`);
    else if (m.plausibleAfterList && m.plausibleAfterList.length > 1 && !m.solved) lines.push(`<p>Likely answers left after the colors: ${W(m.plausibleAfterList.join(", "))}</p>`);
    return `<div class="move">${head}${facts}<div class="move-body">${lines.join("")}</div></div>`;
  }

  // Spot-by-spot explanation over the likely answers. Spots already confirmed green are never criticized:
  // keeping them is what lets a guess be the answer.
  function letterNote(m) {
    if (!m.bestSlots) return "";
    const L = s => `${s.letter.toUpperCase()} in spot ${s.spot}`;
    const confirmed = s => s.green >= 0.98;
    const flat = m.userSlots.filter(s => !confirmed(s) && s.bits < 0.25);
    const work = m.bestSlots.filter(s => s.bits >= 0.6).sort((a, b) => b.bits - a.bits).slice(0, 3);
    if (!flat.length || !work.length) return "";
    const same = s => s.gray >= s.yellow && s.gray >= s.green ? `gray for ${pct(s.gray)}` : s.yellow >= s.green ? `yellow for ${pct(s.yellow)}` : `green for ${pct(s.green)}`;
    const split = s => [s.green > 0.005 ? `green ${pct(s.green)}` : "", s.yellow > 0.005 ? `yellow ${pct(s.yellow)}` : "", s.gray > 0.005 ? `gray ${pct(s.gray)}` : ""].filter(Boolean).join(", ");
    return `Spot by spot, weighted by how likely each answer is: in ${W(m.user.word)}, ${flat.map(s => `${L(s)} would show ${same(s)} of answers`).join("; ")}, so ${flat.length === 1 ? "that spot" : "those spots"} told you almost nothing. In ${W(m.best.word)}, ${work.map(s => `${L(s)} would be ${split(s)}`).join("; ")}: real splits.`;
  }

  // One concrete lesson from the costliest decision.
  function lesson(t) {
    const u = t.user, b = t.best;
    const likely = t.plausibleBeforeList && t.plausibleBefore <= 8 ? `${plural(t.plausibleBefore, "likely answer")} left (${W(t.plausibleBeforeList.join(", "))})` : `${plural(t.n, "possible answer")} left (${t.plausibleBefore} likely)`;
    const describe = (g, mine) => (g.isCandidate ? `${W(g.word)} could win right away ${g.solveChance < 0.005 ? "less than 1%" : pct(g.solveChance)} of the time` : `${W(g.word)} couldn't win right away`) +
      ` and pinpoints the answer ${pct(g.pinpoint)} of the time`;
    let text = `On guess ${t.index + 1}, with ${likely}: ${describe(u)}, while ${describe(b)}. That's about ${b.eg.toFixed(2)} guesses to finish on average instead of ${u.eg.toFixed(2)}.`;
    if (u.isCandidate && !b.isCandidate) text += ` When the likely answers share most of their letters, a word that tests the letters where they differ usually beats guessing one of them.`;
    else if (!u.isCandidate && b.isCandidate) text += ` When a possible answer also splits the rest well, play it: you get a chance to win now without giving up information.`;
    else if (t.index === 0) text += ` Openers like ${W("raise, crate, slate")} cover the most common letters in their most common spots.`;
    else text += ` Look for the word whose letters show different colors across the likely answers.`;
    return text;
  }

  function summaryHTML(rev) {
    const ms = rev.moves;
    const result = rev.won ? `Solved in ${plural(ms.length, "guess", "guesses")}.` : `Not solved. The word was ${W(rev.answer)}.`;
    const avg = ms.reduce((s, m) => s + m.gradeScore, 0) / ms.length;
    const counts = ["Optimal", "Excellent", "Good", "Fair", "Weak", "Poor"].map(g => [g, ms.filter(m => m.grade === g).length]).filter(([, n]) => n).map(([g, n]) => `${n} ${g.toLowerCase()}`).join(", ");
    const quality = (avg >= 4.5 ? "Excellent. " : avg >= 3.5 ? "Good. " : avg >= 2.5 ? "Mixed. " : "Needs work. ") + `Your moves: ${counts}.`;
    // Luck in guesses: how much better or worse the colors left you than expected
    const luckMoves = ms.filter(m => m.n > 1 && m.user.groups > 1);
    let luckText = "No luck involved: every guess had only one possible outcome.";
    if (luckMoves.length) {
      const total = luckMoves.reduce((s, m) => s + m.swing, 0);
      const good = luckMoves.filter(m => m.luck.q < 0.3), bad = luckMoves.filter(m => m.luck.q > 0.7);
      const label = total > 0.5 ? "Favorable" : total > 0.15 ? "Slightly favorable" : total < -0.5 ? "Unfavorable" : total < -0.15 ? "Slightly unfavorable" : "About even";
      const parts = [];
      if (good.length) parts.push(`breaks on ${good.map(m => `guess ${m.index + 1} (${W(m.user.word)})`).join(", ")}`);
      if (bad.length) parts.push(`setbacks on ${bad.map(m => `guess ${m.index + 1} (${W(m.user.word)})`).join(", ")}`);
      luckText = `${label}: the colors saved you about ${Math.abs(total).toFixed(1)} ${total >= 0 ? "guesses" : "guesses fewer than"} compared with an average outcome.`.replace("guesses fewer than compared", "fewer guesses than") + (parts.length ? ` ${parts.join("; ").replace(/^./, c => c.toUpperCase())}.` : "");
      if (total < 0) luckText = `${label}: the colors cost you about ${Math.abs(total).toFixed(1)} guesses compared with an average outcome.` + (parts.length ? ` ${parts.join("; ").replace(/^./, c => c.toUpperCase())}.` : "");
    }
    const risky = ms.filter(m => m.designation === "Risky" || m.reason === "missedForced");
    const secured = ms.find(m => m.n > 1 && m.T <= 3 && m.user.guaranteed === true);
    let risk;
    if (risky.length) risk = risky.map(m => m.reason === "missedForced" ? `Guess ${m.index + 1}: only one word fit, but you played ${W(m.user.word)}.` : m.reason === "finalNotAnswer" ? `Guess ${m.index + 1}: your last guess couldn't have been the answer.` : `Guess ${m.index + 1}: ${W(m.user.word)} gave up a guaranteed win (${W(m.best.word)} kept it).`).join(" ");
    else if (secured) risk = `No avoidable risks. Your guess ${secured.index + 1} (${W(secured.user.word)}) locked in a guaranteed win with correct play.`;
    else risk = "No avoidable risks taken.";
    // Costliest decision: the biggest gap to the best move. Turning point: the biggest change in outlook, skill or luck.
    const worst = ms.slice().sort((a, b) => b.cost - a.cost)[0];
    const costly = worst && worst.cost > 0.05 ? worst : null;
    const costlyText = costly ? `Guess ${costly.index + 1}, ${W(costly.user.word)} (${costly.grade.toLowerCase()}): about ${costly.cost.toFixed(2)} more guesses expected than ${W(costly.best.word)}.` : "None. Every decision was within a whisker of the best available.";
    const tp = ms.filter(m => m.n > 1).map(m => ({ m, size: Math.abs(m.swing) + m.cost })).sort((a, b) => b.size - a.size)[0];
    let turning = "No single moment stood out.";
    if (tp && tp.size > 0.1) {
      const m = tp.m;
      const luckPart = Math.abs(m.swing) >= m.cost;
      turning = `Guess ${m.index + 1}, ${W(m.user.word)}: ${m.n.toLocaleString()} possible (${m.plausibleBefore} likely) became ${m.solved ? "solved" : `${m.afterCount.toLocaleString()} (${m.plausibleAfter} likely)`}. ` +
        (luckPart ? (m.swing > 0 ? `Your outlook improved by about ${m.swing.toFixed(1)} guesses, mostly from ${m.luck.label.toLowerCase()} colors on a ${m.grade.toLowerCase()} decision.` : `Your outlook worsened by about ${(-m.swing).toFixed(1)} guesses from ${m.luck.label.toLowerCase()} colors.`) : `The decision itself cost about ${m.cost.toFixed(2)} guesses.`);
    }
    let improve;
    if (costly) {
      const t = costly, b = t.best;
      if (t.reason === "missedForced") improve = `On guess ${t.index + 1} only ${W(t.candidatesBefore[0])} fit. Before you type, check your word against every green, yellow and gray clue so far.`;
      else if (t.reason === "finalNotAnswer" || t.reason === "unlikelyFinal") improve = `On your final guess, play the most likely word that still fits: ${W(b.word)}.`;
      else if (t.reason === "noInfo") improve = `On guess ${t.index + 1}, ${W(t.user.word)} gave the same colors for every possible answer. ${W(b.word)} would have given ${b.groups} different color patterns.`;
      else if (t.bestGroups) improve = lesson(t) + ` Here ${W(t.user.word)} left ${t.userGroups.filter(g => g.words.length > 1).map(g => W(g.words.join(" & "))).join(", ") || "some words"} together; ${W(b.word)} would have ${b.groups === t.n ? "given each one its own color pattern" : `sorted them into ${b.groups} color patterns`}.`;
      else improve = lesson(t);
    } else {
      const near = ms.filter(m => !m.isUserBest && m.best && m.n > 1 && m.T > 1).sort((a, b) => b.cost - a.cost)[0];
      improve = near ? `Your closest call was guess ${near.index + 1}: ${W(near.best.word)} was marginally better than ${W(near.user.word)} (${near.best.eg.toFixed(2)} vs ${near.user.eg.toFixed(2)} guesses to finish).` : "Every move was the best available. Nothing to fix in this game.";
    }
    return `<div class="summary"><h3>Summary</h3><dl>
      <div><dt>Result</dt><dd>${result}</dd></div>
      <div><dt>Strategic quality</dt><dd>${quality}</dd></div>
      <div><dt>Luck</dt><dd>${luckText}</dd></div>
      <div><dt>Risk management</dt><dd>${risk}</dd></div>
      <div><dt>Costliest decision</dt><dd>${costlyText}</dd></div>
      <div><dt>Turning point</dt><dd>${turning}</dd></div>
      <div><dt>Improvement opportunity</dt><dd>${improve}</dd></div>
    </dl></div>`;
  }

  function renderReview() {
    const el = document.getElementById("review");
    if (!state.done || !state.guesses.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    const lead = `<p class="lead">Each guess is graded only on what you knew before playing it. <b>Possible</b> counts every one of the ${TOTAL_WORDS.toLocaleString()} allowed words that fits your clues; guarantees use all of them. <b>Likely</b> words are common, answer-shaped words, and chances and recommendations weight each word by how common it is. Grades compare you with the best common word and are based on expected guesses to finish. Luck is reported separately and never changes a grade.</p>`;
    el.innerHTML = `<h2>Game review</h2>${lead}<p class="lead"><b>Analyzing your moves…</b></p>`;
    const g = state.guesses.slice(), a = state.answer;
    state.fbCache = g.map(w => score(w, a));
    analyze(g, a).then(rev => {
      if (state.answer !== a || state.guesses.length !== g.length) return;
      el.innerHTML = `<h2>Game review</h2>${lead}${rev.moves.map(moveHTML).join("")}${summaryHTML(rev)}`;
    }).catch(err => {
      el.innerHTML = `<h2>Game review</h2><p class="lead">The review couldn't be completed (${esc(err.message)}). Start a new game and try again.</p>`;
    });
  }

  function freshState() {
    return { answer: ANSWERS[Math.floor(Math.random() * ANSWERS.length)], guesses: [], current: "", done: false, won: false };
  }

  function letterStates() {
    const out = {};
    for (const g of state.guesses) {
      const s = score(g, state.answer);
      for (let i = 0; i < COLS; i++) {
        const c = g[i];
        if (!out[c] || RANK[s[i]] > RANK[out[c]]) out[c] = s[i];
      }
    }
    return out;
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "row"; row.setAttribute("role", "row");
      for (let c = 0; c < COLS; c++) {
        const t = document.createElement("div");
        t.className = "tile"; t.setAttribute("role", "gridcell");
        row.appendChild(t);
      }
      boardEl.appendChild(row);
    }
  }

  function buildAlpha() {
    alphaEl.innerHTML = "";
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    letters.forEach(ch => alphaEl.appendChild(makeKey(ch, ch)));
    alphaEl.appendChild(makeKey("back", "⌫ Delete", true));
    alphaEl.appendChild(makeKey("enter", "Enter", true));
  }
  function makeKey(val, label, wide) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "key" + (wide ? " wide" : "");
    b.dataset.key = val; b.textContent = label;
    b.addEventListener("click", () => { press(val); b.blur(); });
    return b;
  }

  function paintRow(r, animate) {
    const row = boardEl.children[r];
    const g = state.guesses[r];
    const s = score(g, state.answer);
    [...row.children].forEach((t, i) => {
      t.textContent = g[i];
      const apply = () => { t.className = "tile " + s[i]; t.setAttribute("aria-label", g[i] + " " + ({hit:"right spot",near:"wrong spot",miss:"not in word"})[s[i]]); };
      if (animate && !reduced) {
        setTimeout(() => { t.classList.add("flip"); setTimeout(apply, 220); }, i * 260);
      } else apply();
    });
  }

  function paintCurrent() {
    const r = state.guesses.length;
    if (r >= ROWS) return;
    const row = boardEl.children[r];
    [...row.children].forEach((t, i) => {
      const ch = state.current[i] || "";
      t.textContent = ch;
      t.className = "tile" + (ch ? " filled" : "");
    });
  }

  function paintAlpha() {
    const ls = letterStates();
    let unused = 0;
    alphaEl.querySelectorAll(".key").forEach(k => {
      const v = k.dataset.key;
      if (v.length !== 1) return;
      k.className = "key" + (ls[v] ? " " + ls[v] : "");
      if (!ls[v]) unused++;
      k.setAttribute("aria-label", v.toUpperCase() + (ls[v] ? ", " + ({hit:"right spot",near:"in word, wrong spot",miss:"not in word"})[ls[v]] : ", not tried yet"));
    });
    countsEl.textContent = `${unused} letters not tried yet · guess ${Math.min(state.guesses.length + (state.done ? 0 : 1), ROWS)} of ${ROWS}`;
  }

  function say(text, opts = {}) {
    statusEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "msg" + (opts.error ? " error" : "");
    p.textContent = text;
    statusEl.appendChild(p);
    if (opts.word) {
      const w = document.createElement("div"); w.className = "word"; w.textContent = state.answer.toUpperCase();
      statusEl.appendChild(w);
    }
    if (opts.again) {
      const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "Play again";
      b.addEventListener("click", newGame); statusEl.appendChild(b);
    }
  }

  function shake() {
    const row = boardEl.children[state.guesses.length];
    row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake");
  }

  let busy = false;
  function submit() {
    if (state.current.length < COLS) { say("Not enough letters. Fill all five boxes.", { error: true }); shake(); return; }
    if (!VALID.has(state.current)) { say(`"${state.current.toUpperCase()}" isn't in the word list. Try another word.`, { error: true }); shake(); return; }
    const r = state.guesses.length;
    state.guesses.push(state.current); state.current = "";
    busy = true;
    paintRow(r, true);
    const delay = reduced ? 0 : COLS * 260 + 250;
    setTimeout(() => {
      busy = false;
      paintAlpha();
      const last = state.guesses[r];
      if (last === state.answer) {
        state.done = true; state.won = true;
        const praise = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][r];
        say(`${praise} Solved in ${r + 1} ${r === 0 ? "guess" : "guesses"}.`, { again: true });
        if (!reduced) boardEl.children[r].classList.add("win");
        recordResult();
      } else if (state.guesses.length === ROWS) {
        state.done = true;
        recordResult();
        say("Out of guesses. The word was:", { word: true, again: true });
      } else {
        say(`${ROWS - state.guesses.length} ${ROWS - state.guesses.length === 1 ? "guess" : "guesses"} left.`);
      }
      paintAlpha();
      paintStats();
      renderReview();
    }, delay);
  }

  function press(k) {
    if (state.done || busy) return;
    if (k === "enter") return submit();
    if (k === "back") { state.current = state.current.slice(0, -1); paintCurrent(); return; }
    if (/^[a-z]$/.test(k) && state.current.length < COLS) { state.current += k; paintCurrent(); }
  }

  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
    const k = e.key.toLowerCase();
    if (k === "enter") { e.preventDefault(); press("enter"); }
    else if (k === "backspace") { e.preventDefault(); press("back"); }
    else if (/^[a-z]$/.test(k)) press(k);
  });

  function render() {
    buildBoard();
    state.guesses.forEach((_, r) => paintRow(r, false));
    paintCurrent();
    paintAlpha();
    paintStats();
    renderReview();
    if (state.done) {
      if (state.won) say(`Solved in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}.`, { again: true });
      else say("Out of guesses. The word was:", { word: true, again: true });
    } else if (state.guesses.length) say(`${ROWS - state.guesses.length} guesses left.`);
    else say("Type a five-letter word and press Enter.");
  }

  function newGame() {
    if (!state.done && state.guesses.length > 0) { state.done = true; state.won = false; recordResult(); }
    state = freshState(); render();
  }
  document.getElementById("newGame").addEventListener("click", e => { newGame(); e.currentTarget.blur(); });

  function start(saved) {
    buildAlpha();
    state = saved && saved.state && saved.state.answer ? saved.state : freshState();
    render();
  }
  window.claude?.hot?.snapshot?.(() => ({ state }));
  window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
