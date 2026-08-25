/* ==========================================================
   BONUS HUNT — Stream Tracker + Viewer Predictions (USD/English
   ========================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "ag_bonus_hunt_v1";

  const DEFAULT_STATE = {
    mode: "collecting",
    startBalance: 0,
    currentBalance: 0,
    bonuses: []
  };

  const DEFAULT_PRED = {
    phase: "idle",
    predictionCount: 0,
    predictions: [],
    myPrediction: null,
    winner: null,
    totalWin: 0,
    totalBet: 0,
    breakEven: 0,
    startBalance: 0,
    currentBalance: 0
  };

  let state = loadState();
  let predState = structuredClone(DEFAULT_PRED);
  let pollTimer = null;

  /* ---------- UTILS ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (_) {
      return structuredClone(DEFAULT_STATE);
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }
  // USD currency format — $1,234
  function fmt(n) {
    if (!isFinite(n)) return "0";
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function fmtRaw(n) {
    if (!isFinite(n)) return "0";
    return Math.round(n).toLocaleString("en-US");
  }
  function fmtMult(m) {
    if (!isFinite(m)) return "";
    return m.toFixed(m >= 100 ? 0 : m >= 10 ? 1 : 2).replace(/\.0+$/, "") + "x";
  }
  function multOf(bet, win) {
    if (!bet || bet <= 0 || !isFinite(win)) return null;
    return win / bet;
  }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }
  function currentTotalWin() {
    return state.bonuses.reduce((s, b) => s + (b.win || 0), 0);
  }
  function currentTotalBet() {
    return state.bonuses.reduce((s, b) => s + (b.bet || 0), 0);
  }
  function isAdminUser() {
    const FORCE_ADMIN_IDS = new Set(["853584962351661078"]);
    try {
      const w = window.__ag;
      if (w && typeof w.getCurrentProfile === "function") {
        const cp = w.getCurrentProfile();
        if (cp && FORCE_ADMIN_IDS.has(String(cp.discordId))) return true;
        if (cp && cp.isAdmin) return true;
      }
      if (w && typeof w.isCurrentUserAdmin === "function") {
        if (w.isCurrentUserAdmin()) return true;
      }
    } catch (_) {}
    try {
      const p = (typeof window.__ag?.loadStoredProfile || (() => {
        try { return JSON.parse(localStorage.getItem("ag_auth_profile") || "null"); } catch(_){return null;}
      }))();
      if (p) {
        if (FORCE_ADMIN_IDS.has(String(p.discordId))) return true;
        if (p.isAdmin) return true;
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem("ag_auth_profile") || localStorage.getItem("discord_user");
      if (raw) {
        let p = null; try { p = JSON.parse(raw); } catch(_){}
        if (p && FORCE_ADMIN_IDS.has(String(p.discordId))) return true;
        if (p?.isAdmin) return true;
      }
    } catch (_) {}
    return false;
  }
  function isLoggedIn() {
    try {
      const raw = localStorage.getItem("ag_auth_profile") || localStorage.getItem("discord_user");
      if (raw) return true;
    } catch (_) {}
    try {
      if (document.cookie.indexOf("ag_session_token") !== -1) return true;
    } catch (_) {}
    return false;
  }

  /* ---------- DOM ---------- */
  const $ = (s, p = document) => p.querySelector(s);

  const elModeBtns = document.querySelectorAll("[data-bh-mode]");
  const elStartBalance = $("#bh-start-balance");
  const elCurrentBalance = $("#bh-current-balance");
  const elCountOpened = $("#bh-count-opened");
  const elCountTotal = $("#bh-count-total");
  const elTotalBet = $("#bh-total-bet");
  const elTotalWin = $("#bh-total-win");
  const elBestWin = $("#bh-best-win");
  const elBestMult = $("#bh-best-mult");
  const elBreakEven = $("#bh-break-even");
  const elList = $("#bh-list");
  const elEmpty = $("#bh-empty");
  const elActions = $(".bh-actions");

  const elBtnAdd = $("#bh-btn-add");
  const elBtnReset = $("#bh-btn-reset");
  const elBtnCopy = $("#bh-btn-copy");
  const elBhp = $("#bhp-app");

  const elModal = $("#bh-modal");
  const elModalBg = $("#bh-modal-bg");
  const elModalClose = $("#bh-modal-close");
  const elModalCancel = $("#bh-modal-cancel");
  const elModalConfirm = $("#bh-modal-confirm");
  const elFieldName = $("#bh-field-name");
  const elFieldBet = $("#bh-field-bet");

  /* ---------- ADMIN ACTION BUTTONS (inject into bh-actions) ---------- */
  function renderAdminButtons() {
    if (Boolean(window.__NO_ADMIN_PUBLIC_UI__)) return;
    document.querySelectorAll("[data-bh-admin]").forEach(e => e.remove());
    document.querySelectorAll(".bh-actions-spacer").forEach(e => e.remove());
    document.querySelectorAll(".bhp-cta-wrap").forEach(e => e.remove());
    if (!isAdminUser()) return;

    const phase = predState.phase || "idle";
    const spacer = `<span class="bh-actions-spacer" aria-hidden="true"></span>`;

    /* ---------- PRIMARY BIG CTA (only one per phase — the thing admin will press next) ---------- */
    let primary = "";
    if (phase === "idle") {
      primary = `<button class="bh-btn bh-btn--primary-huge" data-bh-admin="start">
        <span class="bh-cta-icon">🚀</span>
        <span class="bh-cta-texts">
          <span class="bh-cta-title">Start Bonus Hunt</span>
          <span class="bh-cta-sub">Open bets for all viewers to predict</span>
        </span>
      </button>`;
    } else if (phase === "predicting") {
      primary = `<button class="bh-btn bh-btn--primary-huge bh-btn--primary-red" data-bh-admin="close">
        <span class="bh-cta-icon">🔒</span>
        <span class="bh-cta-texts">
          <span class="bh-cta-title">Close Bets &amp; Go Live</span>
          <span class="bh-cta-sub">Lock all predictions — start the real hunt</span>
        </span>
      </button>`;
    } else if (phase === "live") {
      primary = `<button class="bh-btn bh-btn--primary-huge bh-btn--primary-gold" data-bh-admin="finalize">
        <span class="bh-cta-icon">🏆</span>
        <span class="bh-cta-texts">
          <span class="bh-cta-title">Finalize &amp; Pick Winner</span>
          <span class="bh-cta-sub">Tally results and announce the closest guess</span>
        </span>
      </button>`;
    } else if (phase === "done") {
      primary = `<button class="bh-btn bh-btn--primary-huge" data-bh-admin="reset">
        <span class="bh-cta-icon">🔄</span>
        <span class="bh-cta-texts">
          <span class="bh-cta-title">Start New Bonus Hunt</span>
          <span class="bh-cta-sub">Reset everything and open betting round</span>
        </span>
      </button>`;
    }

    /* ---------- SECONDARY SMALL BUTTONS (everything else — muted, top right) ---------- */
    const secondaries = [];
    if (phase !== "idle") {
      secondaries.push(`<button class="bh-btn bh-btn--ghost bh-btn--sm" data-bh-admin="reset" title="Start brand new bonus hunt">🔄 New Hunt</button>`);
    }
    if (phase === "predicting") {
      // Already primary close, but also allow open-bets after this state:
    } else if (phase === "live") {
      secondaries.push(`<button class="bh-btn bh-btn--ghost bh-btn--sm" data-bh-admin="open" title="Re-open bets for viewers">🔓 Open Bets Again</button>`);
    } else if (phase === "done") {
      secondaries.push(`<button class="bh-btn bh-btn--ghost bh-btn--sm" data-bh-admin="open" title="Re-open bets on this hunt (keep history)">🔓 Open Bets Again</button>`);
    }
    const secondaryRow = secondaries.length
      ? `<span class="bh-secondary-group">${secondaries.join("")}</span>`
      : "";

    /* ---------- RENDER: Primary CTA goes ABOVE stream-tool as own row for max visibility ---------- */
    if (primary) {
      const wrap = document.createElement("div");
      wrap.className = "bhp-cta-wrap";
      wrap.innerHTML = primary;
      const streamTool = document.querySelector(".bh-title")?.parentElement;
      if (streamTool) {
        streamTool.parentElement.insertBefore(wrap, streamTool);
      } else {
        document.querySelector(".bh-wrap")?.insertBefore(wrap, document.querySelector(".bh-wrap").firstChild);
      }
    }

    /* Also: small admin quick-actions inside .bh-actions row (right side) */
    elActions.insertAdjacentHTML("beforeend", spacer + secondaryRow);
  }

  elActions.addEventListener("click", async (e) => {
    const adminBtn = e.target.closest("[data-bh-admin]");
    if (!adminBtn) return;
    const act = adminBtn.getAttribute("data-bh-admin");
    if (act === "reset")  { await adminReset(); return; }
    if (act === "start")  { await adminStartHunt(); return; }
    if (act === "open")   { await adminOpenPreds(); return; }
    if (act === "close")  { await adminClosePreds(); return; }
    if (act === "finalize") { await adminFinalizeHunt(); return; }
  });
  /* Also: catch clicks on HUGE primary CTA button (which lives OUTSIDE .bh-actions, in bhp-cta-wrap) */
  document.addEventListener("click", async (e) => {
    const adminBtn = e.target.closest("[data-bh-admin]");
    if (!adminBtn) return;
    if (adminBtn.closest(".bh-actions")) return; /* already handled */
    const act = adminBtn.getAttribute("data-bh-admin");
    if (act === "reset")  { await adminReset(); return; }
    if (act === "start")  { await adminStartHunt(); return; }
    if (act === "open")   { await adminOpenPreds(); return; }
    if (act === "close")  { await adminClosePreds(); return; }
    if (act === "finalize") { await adminFinalizeHunt(); return; }
  });

  /* ---------- PREDICTION API ---------- */
  async function fetchHunt() {
    try {
      const r = await fetch("/api/bonus-hunt", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }
  async function submitPrediction(amount) {
    try {
      const r = await fetch("/api/bonus-hunt/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ amount })
      });
      const d = await r.json();
      if (!r.ok) return { ok: false, error: (d && d.error) || "Failed" };
      return { ok: true, data: d.state };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function deletePrediction() {
    try {
      const r = await fetch("/api/bonus-hunt/predict", {
        method: "DELETE",
        credentials: "same-origin"
      });
      return r.ok;
    } catch (_) {}
    return false;
  }
  async function adminReset() {
    if (!confirm("Start a brand new Bonus Hunt? All predictions will be cleared!")) return false;
    try {
      const r = await fetch("/api/admin/bonus-hunt/reset", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();
      predState = Object.assign(structuredClone(DEFAULT_PRED), data.state || {});
      renderAdminButtons();
      renderPredictions();
      return true;
    } catch (_) {
      alert("Could not reset bonus hunt (admin only)");
      return false;
    }
  }
  async function adminOpenPreds() {
    if (!confirm("Re-open prediction betting? Viewers can change/create their bets again.")) return false;
    try {
      const r = await fetch("/api/admin/bonus-hunt/open-predictions", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();
      predState = Object.assign(structuredClone(DEFAULT_PRED), data.state || {});
      renderAdminButtons();
      renderPredictions();
      return true;
    } catch (_) {
      alert("Could not open predictions (admin only)");
      return false;
    }
  }
  async function adminClosePreds() {
    if (!confirm("Close betting? Viewers will no longer be able to change predictions.")) return false;
    try {
      const r = await fetch("/api/admin/bonus-hunt/close-predictions", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();
      predState = Object.assign(structuredClone(DEFAULT_PRED), data.state || {});
      renderAdminButtons();
      renderPredictions();
      return true;
    } catch (_) {
      alert("Could not close predictions (admin only)");
      return false;
    }
  }
  async function adminStartHunt() {
    const phase = predState.phase || "idle";
    const msg = phase === "idle"
      ? "Start bonus hunt and open bets for viewers?"
      : "Start the live hunt now and lock all predictions?";
    if (!confirm(msg)) return false;
    try {
      const r = await fetch("/api/admin/bonus-hunt/start", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();
      predState = Object.assign(structuredClone(DEFAULT_PRED), data.state || {});
      renderAdminButtons();
      renderPredictions();
      return true;
    } catch (_) {
      alert("Could not start hunt (admin only)");
      return false;
    }
  }
  async function adminFinalizeHunt() {
    const ok = confirm("Finalize hunt & declare winner based on current total win?");
    if (!ok) return false;
    try {
      const payload = {
      startBalance: state.startBalance || 0,
      currentBalance: state.currentBalance || 0,
      breakEven: currentTotalBet(),
      totalWin: currentTotalWin(),
      bonuses: state.bonuses
    };
      const r = await fetch("/api/admin/bonus-hunt/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("bad");
      const data = await r.json();
      predState = Object.assign(structuredClone(DEFAULT_PRED), data.state || {});
      renderAdminButtons();
      renderPredictions();
      setTimeout(() => celebrateIfNewWinner(), 50);
      return true;
    } catch (_) {
      alert("Could not finalize hunt (admin only)");
      return false;
    }
  }

  /* ---------- MODAL ---------- */
  function openModal() {
    elFieldName.value = "";
    elFieldBet.value = "";
    elModal.hidden = false;
    elModalBg.hidden = false;
    setTimeout(() => elFieldName.focus(), 50);
  }
  function closeModal() {
    elModal.hidden = true;
    elModalBg.hidden = true;
  }
  elBtnAdd.addEventListener("click", openModal);
  if (elModalClose) elModalClose.addEventListener("click", closeModal);
  if (elModalCancel) elModalCancel.addEventListener("click", closeModal);
  if (elModalBg) elModalBg.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      openModal();
    }
  });

  if (elModalConfirm) {
    elModalConfirm.addEventListener("click", () => {
      const name = (elFieldName.value || "").trim();
      const bet = parseFloat(elFieldBet.value);
      if (!name) { elFieldName.focus(); return; }
      if (!isFinite(bet) || bet <= 0) { elFieldBet.focus(); return; }
      state.bonuses.push({
        id: uid(),
        name,
        bet,
        win: null,
        opened: false
      });
      saveState();
      render();
      closeModal();
    });
  }

  /* ---------- MODE SWITCH ---------- */
  elModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.getAttribute("data-bh-mode") || "collecting";
      saveState();
      render();
    });
  });

  /* ---------- BALANCE INPUTS ---------- */
  if (elStartBalance) {
    elStartBalance.addEventListener("input", () => {
      state.startBalance = parseFloat(elStartBalance.value) || 0;
      saveState();
      renderStats();
    });
  }
  if (elCurrentBalance) {
    elCurrentBalance.addEventListener("input", () => {
      state.currentBalance = parseFloat(elCurrentBalance.value) || 0;
      saveState();
      renderStats();
    });
  }

  /* ---------- RESET LOCAL ---------- */
  if (elBtnReset) {
    elBtnReset.addEventListener("click", () => {
      if (!confirm("Clear local bonus list? (Predictions NOT cleared — use admin reset for that)")) return;
      state = structuredClone(DEFAULT_STATE);
      saveState();
      render();
    });
  }

  /* ---------- COPY RESULT ---------- */
  if (elBtnCopy) {
    elBtnCopy.addEventListener("click", () => {
      const total = state.bonuses.length;
      const opened = state.bonuses.filter(b => b.opened).length;
      const totalBet = currentTotalBet();
      const totalWin = currentTotalWin();
      const best = state.bonuses.reduce((mx, b) => (b.win && b.win > mx.win ? b : mx), { win: 0 });
      const mult = totalBet > 0 ? (totalWin / totalBet) : 0;

      const lines = [
        "🎰 BONUS HUNT RESULT",
        "Bonuses: " + opened + "/" + total,
        "Total Bet: " + fmt(totalBet),
        "Total Win: " + fmt(totalWin),
        "Multiplier: " + fmtMult(mult),
        best.win > 0 ? "Best Win: " + fmt(best.win) + " (" + fmtMult(multOf(best.bet, best.win)) + ") — " + best.name : "",
        "Balance: " + fmt(state.startBalance) + " → " + fmt(state.currentBalance)
      ].filter(Boolean);

      if (state.bonuses.length) {
        lines.push("", "––––––––––––––");
        state.bonuses.forEach((b, i) => {
          const status = b.opened ? fmt(b.win) + " (" + fmtMult(multOf(b.bet, b.win)) + ")" : "READY";
          lines.push((i + 1) + ". " + b.name + " — Bet " + fmt(b.bet) + " · " + status);
        });
      }
      if (predState.winner) {
        lines.unshift("", "🏆 Prediction Winner: @" + predState.winner.username + " — " + fmt(predState.winner.amount));
      }
      const text = lines.join("\n");
      navigator.clipboard.writeText(text).then(() => {
        elBtnCopy.classList.add("is-success");
        setTimeout(() => elBtnCopy.classList.remove("is-success"), 1500);
      }).catch(() => {});
    });
  }

  /* ---------- LIST EVENTS (delegate) ---------- */
  if (elList) {
    elList.addEventListener("click", (e) => {
      const id = e.target.closest("[data-bh-id]") && e.target.closest("[data-bh-id]").getAttribute("data-bh-id");
      if (!id) return;
      const b = state.bonuses.find(x => x.id === id);
      if (!b) return;

      if (e.target.matches("[data-bh-save-win]")) {
        const row = e.target.closest(".bh-row");
        const inp = row && row.querySelector("[data-bh-win-input]");
        if (!inp) return;
        const win = parseFloat(inp.value);
        if (!isFinite(win) || win < 0) { inp.focus(); return; }
        b.win = win;
        b.opened = true;
        saveState();
        render();
        return;
      }
      if (e.target.matches("[data-bh-edit-bet]")) {
        const current = String(b.bet);
        const val = prompt("Change bet for \"" + b.name + "\" (USD)", current);
        if (val == null) return;
        const bet = parseFloat(val);
        if (!isFinite(bet) || bet <= 0) return;
        b.bet = bet;
        saveState();
        render();
        return;
      }
      if (e.target.matches("[data-bh-rename]")) {
        const val = prompt("Rename \"" + b.name + "\"", b.name);
        if (val == null) return;
        const clean = val.trim();
        if (!clean) return;
        b.name = clean;
        saveState();
        render();
        return;
      }
      if (e.target.matches("[data-bh-delete]")) {
        if (!confirm("Delete \"" + b.name + "\"?")) return;
        state.bonuses = state.bonuses.filter(x => x.id !== id);
        saveState();
        render();
        return;
      }
      if (e.target.matches("[data-bh-undo]")) {
        b.win = null;
        b.opened = false;
        saveState();
        render();
        return;
      }
    });

    elList.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("[data-bh-win-input]")) {
        const row = e.target.closest(".bh-row");
        const btn = row && row.querySelector("[data-bh-save-win]");
        if (btn) btn.click();
      }
    });
  }

  /* ---------- PREDICTIONS UI RENDER ---------- */
  function phaseLabel(p) {
    if (p.phase === "idle") return { text: "WAITING FOR ADMIN TO START", cls: "bhp-phase--idle", icon: "⏳" };
    if (p.phase === "predicting") return { text: "BETTING OPEN", cls: "bhp-phase--predicting", icon: "🎯" };
    if (p.phase === "live") return { text: "HUNT LIVE — BETS LOCKED", cls: "bhp-phase--live", icon: "🎰" };
    return { text: "HUNT COMPLETE", cls: "bhp-phase--done", icon: "🏆" };
  }

  function renderPredictions() {
    if (!elBhp) return;
    const phaseInfo = phaseLabel(predState);
    const loggedIn = isLoggedIn();
    const myAmount = predState.myPrediction ? predState.myPrediction.amount : null;

    let winnerHtml = "";
    if (predState.phase === "done" && predState.winner) {
      const w = predState.winner;
      const tw = predState.totalWin || 0;
      const diff = Math.abs((w.amount || 0) - tw);
      winnerHtml =
        '<div class="bhp-winner">' +
          '<div class="bhp-winner-glow"></div>' +
          '<div class="bhp-winner-row">' +
            '<div class="bhp-winner-trophy">🏆</div>' +
            '<img class="bhp-winner-avatar" src="' + escapeHtml(w.avatarUrl) + '" alt="" onerror="this.style.display=\'none\'"/>' +
            '<div class="bhp-winner-info">' +
              '<div class="bhp-winner-tag">WINNER!</div>' +
              '<div class="bhp-winner-name">@' + escapeHtml(w.username) + '</div>' +
              '<div class="bhp-winner-bet">' +
                '<span>Guessed: <strong>' + fmt(w.amount) + '</strong></span>' +
                '<span class="bhp-winner-diff">(Closest: ' + fmt(diff) + ' away from ' + fmt(tw) + ' total)</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    } else if (predState.phase === "done" && predState.predictionCount === 0) {
      winnerHtml = '<div class="bhp-winner bhp-winner--empty"><p>No predictions were made for this hunt 🤷</p></div>';
    }

    let predictHtml = "";
    if (predState.phase === "idle") {
      predictHtml =
        '<div class="bhp-predict-box bhp-predict-box--locked">' +
          '<span class="bhp-muted">' +
            '⏳ ' + (isAdminUser()
              ? 'Hit the <strong>"Start Hunt"</strong> button below to open bets for viewers!'
              : 'Bonus Hunt has not started yet. Waiting for admin to open bets...') +
          '</span>' +
        '</div>';
    } else if (predState.phase === "predicting") {
      if (loggedIn) {
        const labelHtml = myAmount != null
          ? '<span class="bhp-predict-yours">Your Prediction</span>'
          : '<span>Predict Final Payout</span>';
        const delBtn = myAmount != null
          ? '<button class="bh-btn bh-btn--ghost" id="bhp-predict-delete" type="button" title="Remove my prediction">×</button>'
          : '';
        const submitText = myAmount != null ? 'Update' : 'Save Bet';
        const valAttr = myAmount != null ? ' value="' + fmtRaw(myAmount) + '"' : '';
        predictHtml =
          '<div class="bhp-predict-box">' +
            '<label class="bhp-predict-label">' + labelHtml + '</label>' +
            '<div class="bhp-predict-row">' +
              '<span class="bhp-predict-prefix">$</span>' +
              '<input type="number" min="0" step="1" id="bhp-predict-input" class="bhp-predict-input" placeholder="0"' + valAttr + '/>' +
              '<button class="bh-btn bh-btn--add" id="bhp-predict-submit" type="button">' + submitText + '</button>' +
              delBtn +
            '</div>' +
          '</div>';
      } else {
        predictHtml =
          '<div class="bhp-predict-box">' +
            '<div class="bhp-login-hint">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' +
              '<span>Sign in with Discord to place your bet!</span>' +
            '</div>' +
          '</div>';
      }
    } else if (predState.phase === "live" || predState.phase === "done") {
      if (myAmount != null) {
        predictHtml =
          '<div class="bhp-predict-box bhp-predict-box--locked">' +
            '<strong>Your locked bet:</strong>&nbsp;&nbsp;' +
            '<span class="bhp-predict-locked-amount">' + fmt(myAmount) + '</span>' +
          '</div>';
      } else if (predState.phase === "live") {
        predictHtml =
          '<div class="bhp-predict-box bhp-predict-box--locked">' +
            '<span class="bhp-muted">You did not place a bet for this hunt.</span>' +
          '</div>';
      }
    }

    let listHtml = "";
    if (predState.predictions && predState.predictions.length) {
      const items = predState.predictions.map((p, i) => {
        let rankBadge = "";
        if (predState.phase === "done") {
          const medalj = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1) + ".";
          rankBadge = '<span class="bhp-pred-rank">' + medalj + '</span>';
        } else {
          rankBadge = '<span class="bhp-pred-rank">#' + (i + 1) + '</span>';
        }
        let diffHtml = "";
        if (predState.phase === "done" && predState.totalWin != null) {
          const diff = Math.abs((p.amount || 0) - (predState.totalWin || 0));
          diffHtml = '<span class="bhp-pred-diff">' + fmt(diff) + ' off</span>';
        }
        const mineMark = p.isMine ? '<span class="bhp-pred-mine">You</span>' : '';
        const clsMine = p.isMine ? ' is-mine' : '';
        const clsWin = (predState.phase === "done" && predState.winner && predState.winner.id === p.id) ? ' is-winner' : '';
        return (
          '<div class="bhp-pred-item' + clsMine + clsWin + '">' +
            rankBadge +
            '<img class="bhp-pred-avatar" src="' + escapeHtml(p.avatarUrl) + '" alt="" onerror="this.style.display=\'none\'"/>' +
            '<div class="bhp-pred-info">' +
              '<div class="bhp-pred-name">@' + escapeHtml(p.username) + mineMark + '</div>' +
            '</div>' +
            '<div class="bhp-pred-amount">' + fmt(p.amount) + '</div>' +
            diffHtml +
          '</div>'
        );
      }).join("");
      const countHtml = '<span>Bets <strong>(' + predState.predictionCount + ')</strong></span>';
      const hint = predState.phase === "done" ? '<span>Closest → wins!</span>' : '';
      listHtml =
        '<div class="bhp-preds-head">' + countHtml + hint + '</div>' +
        '<div class="bhp-preds-grid">' + items + '</div>';
    } else if (predState.phase !== "done") {
      listHtml =
        '<div class="bhp-empty-preds">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' +
          '<p><strong>No bets yet.</strong><br/>Be the first one!</p>' +
        '</div>';
    }

    const phaseBanner =
      '<div class="bhp-phase ' + phaseInfo.cls + '">' +
        '<span class="bhp-phase-icon">' + phaseInfo.icon + '</span>' +
        '<span class="bhp-phase-text">' + phaseInfo.text + '</span>' +
        '<span class="bhp-phase-count">' + predState.predictionCount + ' bets</span>' +
      '</div>';

    elBhp.innerHTML = phaseBanner + winnerHtml + predictHtml + listHtml;

    const sub = document.getElementById("bhp-predict-submit");
    if (sub) {
      sub.addEventListener("click", async () => {
        const inp = document.getElementById("bhp-predict-input");
        if (!inp) return;
        const amount = parseFloat(inp.value);
        if (!isFinite(amount) || amount < 0) { inp.focus(); return; }
        sub.disabled = true;
        const result = await submitPrediction(amount);
        sub.disabled = false;
        if (result.ok) {
          predState = Object.assign(structuredClone(DEFAULT_PRED), result.data || {});
          renderAdminButtons();
          renderPredictions();
        } else {
          alert("Could not save bet: " + (result.error || "unknown error"));
        }
      });
    }
    const del = document.getElementById("bhp-predict-delete");
    if (del) {
      del.addEventListener("click", async () => {
        if (!confirm("Remove your bet?")) return;
        const ok = await deletePrediction();
        if (ok) {
          const fresh = await fetchHunt();
          if (fresh) predState = Object.assign(structuredClone(DEFAULT_PRED), fresh);
          renderPredictions();
        }
      });
    }
  }

  /* ---------- RENDER BONUS HUNT ---------- */
  function renderStats() {
    if (!elCountOpened) return;
    const opened = state.bonuses.filter(b => b.opened).length;
    elCountOpened.textContent = opened;
    elCountTotal.textContent = state.bonuses.length;

    const totalBet = currentTotalBet();
    const totalWin = currentTotalWin();
    if (elTotalBet) elTotalBet.textContent = fmtRaw(totalBet);
    if (elTotalWin) elTotalWin.textContent = fmtRaw(totalWin);

    let best = null;
    state.bonuses.forEach(b => {
      if (b.opened && b.win != null && (best == null || b.win > best.win)) best = b;
    });
    if (elBestWin && elBestMult) {
      if (best) {
        elBestWin.textContent = fmtRaw(best.win);
        elBestMult.textContent = best.bet > 0 ? fmtMult(best.win / best.bet) : "";
      } else {
        elBestWin.textContent = "0";
        elBestMult.textContent = "";
      }
    }
    if (elBreakEven) elBreakEven.textContent = fmtRaw(totalBet);
    if (elStartBalance) elStartBalance.value = state.startBalance || "";
    if (elCurrentBalance) elCurrentBalance.value = state.currentBalance || "";
  }

  function renderList() {
    if (!elList) return;
    if (!state.bonuses.length) {
      if (elEmpty) {
        elEmpty.style.display = "";
        // Replace text
        const p = elEmpty.querySelector("p");
        if (p) p.innerHTML = '<strong>No bonuses yet.</strong><br/>Hit "Add Bonus" to start collecting!</p>';
      }
      [...elList.querySelectorAll(".bh-row")].forEach(x => x.remove());
      return;
    }
    if (elEmpty) elEmpty.style.display = "none";
    [...elList.querySelectorAll(".bh-row")].forEach(x => x.remove());
    const isOpening = state.mode === "opening";

    let bestId = null;
    const opened = state.bonuses.filter(b => b.opened);
    if (opened.length) {
      let best = opened[0];
      opened.forEach(b => { if (b.win > best.win) best = b; });
      bestId = best.id;
    }
    const nextReadyId = state.bonuses.find(b => !b.opened) && state.bonuses.find(b => !b.opened).id;
    const frag = document.createDocumentFragment();

    state.bonuses.forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "bh-row";
      row.setAttribute("data-bh-id", b.id);
      row.setAttribute("role", "listitem");
      if (isOpening && !b.opened && b.id === nextReadyId) row.classList.add("is-active");
      if (b.id === bestId) row.classList.add("is-best");
      if (b.opened) row.classList.add("is-opened");
      const mult = multOf(b.bet, b.win);
      const multClassWin = mult != null && mult >= 1 ? "is-win" : "is-loss";
      const winDisplay = b.opened
        ? '<span class="bh-win-num ' + multClassWin + '">' + fmtRaw(b.win) + '</span>' +
          '<span class="bh-win-mult ' + multClassWin + '">' + fmtMult(mult) + '</span>'
        : '<span class="bh-ready-pill">READY</span>';
      const actions = isOpening
        ? (b.opened
            ? '<button class="bh-row-btn" data-bh-undo title="Mark as unread again">' +
                 '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
               '</button>'
            : '<div class="bh-row-win-input">' +
                 '<input type="number" min="0" step="1" placeholder="Win" data-bh-win-input />' +
                 '<button class="bh-row-save" data-bh-save-win>Save</button>' +
               '</div>')
        : '<div class="bh-row-tools">' +
             '<span class="bh-ready-pill">READY</span>' +
           '</div>';
      const rowToolsRight =
        '<div class="bh-row-actions">' +
          '<button class="bh-row-btn" data-bh-rename title="Rename">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
          '</button>' +
          '<button class="bh-row-btn" data-bh-edit-bet title="Change bet">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>' +
          '</button>' +
          '<button class="bh-row-btn bh-row-btn--danger" data-bh-delete title="Delete">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
          '</button>' +
        '</div>';

      row.innerHTML =
        '<div class="bh-row-index">' + String(i + 1).padStart(2, "0") + '</div>' +
        '<div class="bh-row-name">' +
          '<div class="bh-row-title">' + escapeHtml(b.name) + '</div>' +
          '<div class="bh-row-sub">Bet: <strong>' + fmt(b.bet) + '</strong></div>' +
        '</div>' +
        '<div class="bh-row-status">' + actions + '</div>' +
        (isOpening ? '<div class="bh-row-result">' + winDisplay + '</div>' : '') +
        rowToolsRight;

      frag.appendChild(row);
    });

    elList.appendChild(frag);
  }

  function applyModeButtons() {
    elModeBtns.forEach(b => {
      const on = b.getAttribute("data-bh-mode") === state.mode;
      b.classList.toggle("is-active", !!on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function render() {
    renderAdminButtons();
    applyModeButtons();
    renderStats();
    renderList();
    try {
      document.documentElement.setAttribute("data-bh-mode", state.mode);
    } catch (_) {}
  }

  /* ---------- POLLING ---------- */
  let lastIsAdmin = false;
  let lastCelebratedWinnerId = null;

  /* ---------- WINNER CONFETTI / CELEBRATION ---------- */
  function spawnConfetti() {
    if (!elBhp) return;
    try {
      const colors = ["#ffd35a", "#f59e4b", "#ff8a3d", "#ffea8e", "#ff5d5d", "#39d353", "#7dd3fc"];
      const wrap = document.createElement("div");
      wrap.className = "bhp-confetti-layer";
      wrap.setAttribute("aria-hidden", "true");
      const total = 140;
      let html = "";
      for (let i = 0; i < total; i++) {
        const size = 6 + Math.random() * 10;
        const left = Math.random() * 100;
        const delay = (Math.random() * 0.6).toFixed(3);
        const dur = (1.8 + Math.random() * 2.4).toFixed(3);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const rot = Math.floor(Math.random() * 360);
        const drift = (Math.random() * 180 - 90).toFixed(0);
        html += `<span style="
          position:absolute;top:-20px;left:${left}%;
          width:${size}px;height:${size}px;background:${color};
          border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
          transform:rotate(${rot}deg);
          opacity:${(0.7 + Math.random()*0.3).toFixed(2)};
          animation: bhpConfettiFall ${dur}s cubic-bezier(.2,.6,.3,1) ${delay}s forwards;
          --bhp-drift:${drift}px;
          box-shadow:0 0 8px ${color}66;
        "></span>`;
      }
      wrap.innerHTML = html;
      elBhp.appendChild(wrap);
      setTimeout(() => { try { wrap.remove(); } catch (_) {} }, 5200);
    } catch (_) {}
  }
  function celebrateIfNewWinner() {
    if (predState.phase !== "done" || !predState.winner) return;
    const wid = predState.winner.id || predState.winner.discordId;
    if (!wid || wid === lastCelebratedWinnerId) return;
    lastCelebratedWinnerId = wid;
    spawnConfetti();
  }

  async function pollOnce() {
    const isAdminNow = isAdminUser();
    if (isAdminNow !== lastIsAdmin) {
      lastIsAdmin = isAdminNow;
      renderAdminButtons(); // admin status changed (late sync from /api/me) → re-render!
    }
    const fresh = await fetchHunt();
    if (fresh) {
      const oldPhase = predState.phase;
      const oldWinnerId = predState.winner?.id || predState.winner?.discordId || null;
      predState = Object.assign(structuredClone(DEFAULT_PRED), fresh);
      const newWinnerId = predState.winner?.id || predState.winner?.discordId || null;
      if (predState.phase !== oldPhase) {
        renderAdminButtons(); // phase changed → update admin buttons!
      }
      renderPredictions();
      if (newWinnerId && oldWinnerId !== newWinnerId) {
        celebrateIfNewWinner();
      } else if (predState.phase === "done" && predState.winner) {
        celebrateIfNewWinner();
      }
    }
  }

  /* ---------- BOOT ---------- */
  async function forceAdminSync() {
    try {
      const w = window.__ag;
      if (w && typeof w.syncProfileFromServer === "function") {
        await w.syncProfileFromServer();
      }
    } catch (_) {}
    try {
      const h = window.__ag?.getAuthHeaders ? window.__ag.getAuthHeaders() : (() => {
        try {
          const raw = localStorage.getItem("ag_auth_token");
          if (raw) return { Authorization: `Bearer ${raw}` };
        } catch (_) {}
        return {};
      })();
      if (h && Object.keys(h).length) {
        const r = await fetch("/api/me", { headers: h, credentials: "same-origin" });
        if (r.ok) {
          const d = await r.json();
          if (d?.profile && window.__ag?.setCurrentProfile) {
            try { window.__ag.setCurrentProfile(d.profile); } catch(_){}
          }
        }
      }
    } catch (_) {}
  }
  function boot() {
    render();
    renderPredictions();
    pollOnce();
    pollTimer = setInterval(pollOnce, 2000);
    // Force fetch fresh admin profile from server (bypasses stale localStorage)
    forceAdminSync();
    // Extra admin-sync re-renders to catch late /api/me sync from server:
    setTimeout(renderAdminButtons, 1500);
    setTimeout(renderAdminButtons, 4000);
    setTimeout(renderAdminButtons, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
