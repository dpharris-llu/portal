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
          if (d.init) { E = WordEngine.createEngine({ guesses: d.words, answers: d.words.slice(), openers: d.openers }); return; }
          try { postMessage({ id: d.id, result: E.reviewGame(d.guesses, d.answer, 6) }); }
          catch (err) { postMessage({ id: d.id, error: String(err && err.message || err) }); }
        };`;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = ev => { const cb = pending.get(ev.data.id); pending.delete(ev.data.id); if (cb) cb(ev.data); };
      worker.onerror = () => { workerFailed = true; worker = null; pending.forEach(cb => cb({ fallback: true })); pending.clear(); };
      worker.postMessage({ init: true, words: VALID_STR.split(" "), openers: OPENERS });
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  function analyze(guesses, answer) {
    const key = guesses.join(",") + ">" + answer;
    if (reviewCache.has(key)) return Promise.resolve(reviewCache.get(key));
    const runSync = () => {
      if (!syncEngine) syncEngine = window.WordEngine.createEngine({ guesses: VALID_STR.split(" "), answers: VALID_STR.split(" "), openers: OPENERS });
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
    const after = m.solved ? "Solved" : m.afterCount.toLocaleString();
    const canBe = u.isCandidate ? `Yes (1 in ${m.n.toLocaleString()})` : "No";
    let guarAvail;
    if (m.n === 1) guarAvail = "Forced answer";
    else if (m.T === 1) guarAvail = "No (last turn)";
    else if (m.guaranteeAvailable === true) guarAvail = "Yes, verified";
    else if (m.guaranteeAvailable === false) guarAvail = "No";
    else guarAvail = m.n > 400 ? "Too early to check" : "None found";
    const facts = `<dl class="facts">
      <div><dt>Possible before</dt><dd>${m.n.toLocaleString()}</dd></div>
      <div><dt>Possible after</dt><dd>${after}</dd></div>
      <div><dt>Expected left</dt><dd>${num(u.expected)}</dd></div>
      <div><dt>Worst case</dt><dd>${u.worst.toLocaleString()}</dd></div>
      <div><dt>Could be answer</dt><dd>${canBe}</dd></div>
      <div><dt>Guaranteed win available</dt><dd>${guarAvail}</dd></div>
      ${m.T >= 2 && m.n > 1 && m.n <= 400 ? `<div><dt>Your guess keeps a guarantee</dt><dd>${guarText(u.guaranteed)}</dd></div>` : ""}
      ${m.T === 2 && m.n > 1 ? `<div><dt>Win chance from here</dt><dd>${pct(u.pWin)}</dd></div>` : ""}
    </dl>`;
    const lines = [];
    if (m.candidatesBefore && m.n > 1) lines.push(`<p>Possible answers: ${W(m.candidatesBefore.join(", "))}</p>`);
    // What went right or wrong in the decision
    if (m.reason === "missedForced") lines.push(`<p class="flag">Only ${W(m.candidatesBefore[0])} fit your clues. Any other word wastes a turn.</p>`);
    else if (m.reason === "finalNotAnswer") lines.push(`<p class="flag">On the last turn only a possible answer can win, and ${W(u.word)} wasn't one.</p>`);
    else if (m.reason === "noInfo") lines.push(`<p class="flag">Every possible answer would show the same colors for ${W(u.word)}, so it couldn't tell any of them apart.</p>`);
    else if (m.reason === "lostGuarantee") lines.push(`<p class="flag">A guaranteed win was available with ${turnsLeftText(m.T)}, but ${W(u.word)} left a chance of running out of turns.</p>`);
    if (m.n === 1 && u.isCandidate) lines.push(`<p class="good">Only one word fit, and you played it.</p>`);
    else if (m.T === 1 && u.isCandidate) lines.push(`<p class="good">Last turn, and you played a possible answer: the best you could do was a 1-in-${m.n} shot.</p>`);
    else if (m.isUserBest || m.grade === "Optimal") lines.push(`<p class="good">Among the best moves available here.</p>`);
    // Best alternative and why
    if (b && !m.isUserBest && m.grade !== "Optimal" && m.n > 1) {
      const why = [];
      if (m.n === 1 || m.T === 1) {
        why.push(`play a word that can still win: ${W(m.candidatesBefore ? m.candidatesBefore.join(", ") : b.word)}.`);
      } else {
        if (b.guaranteed === true && u.guaranteed !== true) why.push(`it guarantees a win within ${turnsLeftText(m.T)}`);
        if (m.T === 2) why.push(`your win chance would be ${pct(b.pWin)} instead of ${pct(u.pWin)}`);
        why.push(`it splits the ${plural(m.n, "answer")} into ${b.groups} groups (largest ${b.worst}, about ${num(b.expected)} left on average); yours made ${u.groups} (largest ${u.worst}, about ${num(u.expected)})`);
        if (b.isCandidate && !u.isCandidate) why.push(`it could also have been the answer itself`);
      }
      lines.push(`<p><b>Better option:</b> ${W(b.word)}${m.alternatives.length > 1 ? ` (also good: ${W(m.alternatives.filter(a => a.word !== b.word).slice(0, 2).map(a => a.word).join(", "))})` : ""}. ${m.n === 1 || m.T === 1 ? "On this turn, " + why[0] : "It's stronger because " + why.join("; ") + "."}</p>`);
      if (m.bestGroups && m.userGroups && m.T > 1) {
        lines.push(`<p>How ${W(b.word)} would sort them:</p>${splitHTML(m.bestGroups)}`);
        lines.push(`<p>How ${W(u.word)} sorted them (outlined in red: words it couldn't tell apart):</p>${splitHTML(m.userGroups)}`);
      }
    }
    if (m.afterWords && m.afterWords.length > 1) lines.push(`<p>Left after the colors: ${W(m.afterWords.join(", "))}</p>`);
    return `<div class="move">${head}${facts}<div class="move-body">${lines.join("")}</div></div>`;
  }

  function summaryHTML(rev) {
    const ms = rev.moves;
    const result = rev.won ? `Solved in ${plural(ms.length, "guess", "guesses")}.` : `Not solved. The word was ${W(rev.answer)}.`;
    const avg = ms.reduce((s, m) => s + m.gradeScore, 0) / ms.length;
    const counts = ["Optimal", "Excellent", "Good", "Fair", "Weak", "Poor"].map(g => [g, ms.filter(m => m.grade === g).length]).filter(([, n]) => n).map(([g, n]) => `${n} ${g.toLowerCase()}`).join(", ");
    const quality = (avg >= 4.5 ? "Excellent. " : avg >= 3.5 ? "Good. " : avg >= 2.5 ? "Mixed. " : "Needs work. ") + `Your moves: ${counts}.`;
    const lucky = ms.filter(m => m.luck && m.luck.label !== "No luck involved" && m.n > 1);
    let luckText = "No luck involved: every guess had only one possible outcome.";
    if (lucky.length) {
      const q = lucky.reduce((s, m) => s + m.luck.q, 0) / lucky.length;
      const label = q < 0.2 ? "Very favorable" : q < 0.4 ? "Favorable" : q <= 0.6 ? "Typical" : q <= 0.8 ? "Unfavorable" : "Very unfavorable";
      const ex = lucky.slice().sort((a, b) => Math.abs(b.luck.q - 0.5) - Math.abs(a.luck.q - 0.5))[0];
      luckText = `${label} overall.` + (Math.abs(ex.luck.q - 0.5) > 0.2 ? ` Biggest swing: guess ${ex.index + 1} (${W(ex.user.word)}) left ${ex.solved ? "nothing (solved)" : ex.afterCount.toLocaleString()} when about ${num(ex.user.expected)} was typical.` : "");
    }
    const risky = ms.filter(m => m.designation === "Risky" || m.reason === "missedForced");
    const secured = ms.find(m => m.n > 1 && m.user.guaranteed === true);
    let risk;
    if (risky.length) risk = risky.map(m => m.reason === "missedForced" ? `Guess ${m.index + 1}: only one word fit, but you played ${W(m.user.word)}.` : m.reason === "finalNotAnswer" ? `Guess ${m.index + 1}: your last guess couldn't have been the answer.` : `Guess ${m.index + 1}: ${W(m.user.word)} gave up a guaranteed win (${W(m.best.word)} kept it).`).join(" ");
    else if (secured) risk = `No avoidable risks. From guess ${secured.index + 1} (${W(secured.user.word)}) your win was guaranteed with correct play.`;
    else risk = "No avoidable risks taken.";
    const tp = ms.slice().sort((a, b) => b.cost - a.cost)[0];
    let turning, improve;
    if (tp && tp.cost > 0.05) {
      turning = `Guess ${tp.index + 1}, ${W(tp.user.word)} (${tp.grade.toLowerCase()}) with ${plural(tp.n, "possible answer")} left.`;
      const b = tp.best;
      if (tp.reason === "missedForced") improve = `On guess ${tp.index + 1} only ${W(tp.candidatesBefore[0])} fit. Before you type, check your word against every green, yellow and gray clue so far.`;
      else if (tp.reason === "finalNotAnswer") improve = `On your final guess, choose only from words that still fit: ${W((tp.candidatesBefore || [b.word]).join(", "))}.`;
      else if (tp.reason === "noInfo") improve = `On guess ${tp.index + 1}, ${W(tp.user.word)} gave the same colors for every possible answer. ${W(b.word)} would have split the ${plural(tp.n, "answer")} into ${b.groups} groups. Before playing a scouting word, check that its letters differ across the words still in play.`;
      else if (tp.bestGroups) improve = `On guess ${tp.index + 1} the answers were ${W(tp.candidatesBefore.join(", "))}. ${W(tp.user.word)} left ${tp.userGroups.filter(g => g.words.length > 1).map(g => W(g.words.join(" & "))).join(", ") || "some"} together; ${W(b.word)} would have separated ${b.groups === tp.n ? "all of them" : `them into ${b.groups} groups`}. When few words remain, look for the letter positions where they differ and pick a word that tests those.`;
      else improve = `On guess ${tp.index + 1}, ${W(b.word)} would have left about ${num(b.expected)} answers on average (worst ${b.worst.toLocaleString()}) versus about ${num(tp.user.expected)} (worst ${tp.user.worst.toLocaleString()}) for ${W(tp.user.word)}.` + (tp.index === 0 ? " An opener built from the most common letters in their most common spots, like TARES or LARES, cuts the field much further." : ` With ${plural(tp.n, "answer")} left, pick a word that tests several unconfirmed common letters in new spots, even if it can't be the answer.`);
    } else {
      turning = "No single decision cost you much. Every move was close to the best available.";
      const near = ms.filter(m => !m.isUserBest && m.best && m.n > 1 && m.T > 1).sort((a, b) => b.cost - a.cost)[0];
      improve = near ? `Your closest call was guess ${near.index + 1}: ${W(near.best.word)} was slightly better than ${W(near.user.word)} (about ${num(near.best.expected)} vs ${num(near.user.expected)} answers left on average).` : "Every move was the best available. Nothing to fix in this game.";
    }
    return `<div class="summary"><h3>Summary</h3><dl>
      <div><dt>Result</dt><dd>${result}</dd></div>
      <div><dt>Strategic quality</dt><dd>${quality}</dd></div>
      <div><dt>Luck</dt><dd>${luckText}</dd></div>
      <div><dt>Risk management</dt><dd>${risk}</dd></div>
      <div><dt>Turning point</dt><dd>${turning}</dd></div>
      <div><dt>Improvement opportunity</dt><dd>${improve}</dd></div>
    </dl></div>`;
  }

  function renderReview() {
    const el = document.getElementById("review");
    if (!state.done || !state.guesses.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    const lead = `<p class="lead">Each guess is graded only on what you knew before playing it, against all ${TOTAL_WORDS.toLocaleString()} allowed words, each treated as an equally likely answer. Luck is reported separately and never changes a grade.</p>`;
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
