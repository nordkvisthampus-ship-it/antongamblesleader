(function () {
  "use strict";

  const KENO_MIN_SPOTS = 1;
  const KENO_MAX_SPOTS = 10;
  const KENO_MIN = 1;
  const KENO_MAX = 40;
  const KENO_DRAW = 10;
  const KENO_MIN_BET = 1;
  const KENO_MAX_BET = 25000;
  const CACHE_KEY = "ag_last_keno_bet";
  const RISK_KEY = "ag_last_keno_risk";

  const RISK_MULT = {
    low: { label: "Low", factor: 0.7, draw: 12 },
    classic: { label: "Classic", factor: 1, draw: 10 },
    medium: { label: "Medium", factor: 1.7, draw: 8 },
    high: { label: "High", factor: 3, draw: 6 },
  };

  const BASE_PAYOUTS = {
    1: { 0: 0, 1: 2.5 },
    2: { 0: 0, 1: 1, 2: 7 },
    3: { 0: 0, 1: 1, 2: 2.5, 3: 15 },
    4: { 0: 0, 1: 0.5, 2: 2, 3: 4, 4: 30 },
    5: { 0: 0, 1: 0.5, 2: 1.5, 3: 3, 4: 9, 5: 75 },
    6: { 0: 0, 1: 0.5, 2: 1, 3: 2, 4: 5, 5: 18, 6: 200 },
    7: { 0: 0, 1: 0.25, 2: 0.8, 3: 1.5, 4: 3, 5: 10, 6: 45, 7: 500 },
    8: { 0: 0, 1: 0.25, 2: 0.6, 3: 1, 4: 2.2, 5: 6, 6: 22, 7: 140, 8: 1200 },
    9: { 0: 0, 1: 0.25, 2: 0.4, 3: 0.8, 4: 1.8, 5: 4, 6: 12, 7: 55, 8: 350, 9: 3000 },
    10: { 0: 0, 1: 0, 2: 0.3, 3: 0.7, 4: 1.3, 5: 2.8, 6: 7, 7: 28, 8: 160, 9: 900, 10: 7500 },
  };

  const payoutsForRisk = (riskKey) => {
    const factor = Number(RISK_MULT[riskKey]?.factor ?? 1);
    const out = {};
    Object.keys(BASE_PAYOUTS).forEach((k) => {
      const s = Number(k);
      out[s] = {};
      Object.keys(BASE_PAYOUTS[s]).forEach((h) => {
        const raw = Number(BASE_PAYOUTS[s][h]);
        if (raw <= 0) { out[s][h] = 0; return; }
        const v = Number((raw * factor).toFixed(2));
        out[s][h] = v < 0.1 ? 0 : v;
      });
    });
    return out;
  };

  const currentRiskKey = () => {
    const tab = document.querySelector('.keno-risk-btn.is-active');
    const k = tab?.getAttribute("data-risk") || "classic";
    return Object.prototype.hasOwnProperty.call(RISK_MULT, k) ? k : "classic";
  };

  const currentDrawCount = () => Number(RISK_MULT[currentRiskKey()]?.draw ?? KENO_DRAW);

  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    win: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 9.5 8.5 2 9.2l5.5 5.2L6.5 22 12 18.3 17.5 22l-1-7.6 5.5-5.2-7.5-.7L12 2Z" opacity="0.95"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
  const TITLES = { success: "LYCKADES!", win: "KENO VINST! 🎊", error: "HOPPASAN!", info: "INFO" };
  const DURATIONS = { success: 3800, win: 5800, error: 4200, info: 3400 };

  const showKenoToast = (message, variant = "info", opts = {}) => {
    const host = document.getElementById("toast-container");
    if (!host) return;
    const v = variant === "win" ? "win" : ["success", "error", "info"].includes(variant) ? variant : "info";
    const duration = Number(opts.duration || DURATIONS[v] || 3500);
    const title = opts.title || TITLES[v];
    const el = document.createElement("div");
    el.className = `toast toast--${v}`;
    el.innerHTML = `
      <div class="toast-icon">${ICONS[v]}</div>
      <div class="toast-copy">
        ${title ? `<p class="toast-title">${title}</p>` : ""}
        <p class="toast-msg">${String(message)}</p>
      </div>
      <button class="toast-close" type="button" aria-label="Stäng notis">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="toast-progress"><div class="toast-progress-bar" style="animation-duration:${duration}ms"></div></div>
    `;
    host.appendChild(el);
    const closeBtn = el.querySelector(".toast-close");
    const dismiss = () => {
      if (el.classList.contains("toast--out")) return;
      el.classList.add("toast--out");
      setTimeout(() => el.remove(), 320);
    };
    if (closeBtn) closeBtn.addEventListener("click", dismiss);
    const timer = setTimeout(dismiss, duration);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
  };

  const fmt = (n) => Math.floor(Number(n || 0)).toLocaleString("sv-SE");

  const getAuthHeaders = () => {
    const tokenKey = "ag_session_token";
    const cookie = String(document.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${tokenKey}=`));
    const cookieToken = cookie ? decodeURIComponent(cookie.slice(tokenKey.length + 1)) : "";
    const storageToken = localStorage.getItem(tokenKey) || "";
    const token = cookieToken || storageToken;
    return token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  };

  const isLoggedIn = () => Boolean(getAuthHeaders().Authorization);

  const selected = new Set();
  const drawnSet = new Set();
  let localBalance = 0;
  let isDrawing = false;
  let lastSession = null;

  const state = {
    $board: null,
    $bet: null,
    $draw: null,
    $balance: null,
    $spots: null,
    $match: null,
    $potential: null,
    $status: null,
    $drawnChips: null,
    $drawnStatus: null,
    $quick: null,
    $clear: null,
    $payTable: null,
  };

  const initBoard = () => {
    const $board = state.$board;
    if (!$board) return;
    $board.innerHTML = "";
    for (let n = KENO_MIN; n <= KENO_MAX; n += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "keno-cell";
      cell.dataset.number = String(n);
      cell.textContent = n;
      cell.setAttribute("aria-pressed", "false");
      cell.setAttribute("aria-label", `Keno number ${n}`);
      $board.appendChild(cell);
    }
  };

  const renderSelected = () => {
    document.querySelectorAll(".keno-cell").forEach((cell) => {
      const n = Number(cell.dataset.number);
      const isSelected = selected.has(n);
      cell.classList.toggle("keno-cell--selected", isSelected);
      cell.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    state.$spots.textContent = String(selected.size);
    renderPotential();
    updateDrawBtn();
    renderPaytable();
  };

  const renderDrawnHighlights = (drawnArr = [], stagger = 110) => {
    document.querySelectorAll(".keno-cell").forEach((cell) => {
      const n = Number(cell.dataset.number);
      const isDrawn = drawnSet.has(n);
      const isHit = isDrawn && selected.has(n);
      cell.classList.remove("keno-cell--drawn", "keno-cell--hit");
      if (isHit) cell.classList.add("keno-cell--hit");
      else if (isDrawn) cell.classList.add("keno-cell--drawn");
    });
    drawnArr.forEach((n, i) => {
      setTimeout(() => {
        const cell = state.$board?.querySelector(`[data-number="${n}"]`);
        if (!cell) return;
        cell.classList.remove("keno-cell--hit");
        cell.classList.remove("keno-cell--drawn");
        void cell.offsetWidth;
        const isHit = selected.has(n);
        cell.classList.add(isHit ? "keno-cell--hit" : "keno-cell--drawn");
      }, i * stagger);
    });
  };

  const clearHighlights = () => {
    document.querySelectorAll(".keno-cell").forEach((cell) => {
      cell.classList.remove("keno-cell--drawn", "keno-cell--hit");
    });
  };

  const renderChips = (drawnArr = [], matches = 0, stagger = 110) => {
    const wrap = state.$drawnChips;
    if (!wrap) return;
    if (!Array.isArray(drawnArr) || drawnArr.length === 0) {
      wrap.innerHTML = `<span class="k2-chip-placeholder">—</span>`;
      return;
    }
    wrap.innerHTML = "";
    drawnArr.forEach((n, i) => {
      const chip = document.createElement("span");
      chip.className = "k2-lastdraw-chip" + (selected.has(n) ? " k2-chip--hit" : "");
      chip.textContent = n;
      chip.style.animationDelay = `${i * stagger}ms`;
      wrap.appendChild(chip);
    });
    if (state.$drawnStatus) {
      state.$drawnStatus.textContent = `${matches}/${selected.size || "-"} MATCH`;
    }
  };

  const currentPayoutMultiplier = () => {
    const spots = selected.size;
    const payouts = payoutsForRisk(currentRiskKey());
    if (spots < KENO_MIN_SPOTS || spots > KENO_MAX_SPOTS) return 0;
    const hits = Math.min(spots, currentDrawCount());
    let best = 0;
    for (let h = 0; h <= hits; h += 1) best = Math.max(best, Number(payouts[spots]?.[h] ?? 0));
    return best;
  };

  const renderPotential = () => {
    const bet = clampBet(Number(state.$bet?.value || 0));
    const mult = currentPayoutMultiplier();
    const potential = Math.floor(bet * mult);
    if (state.$potential) state.$potential.textContent = fmt(potential);
  };

  const clampBet = (n) => {
    if (!Number.isFinite(n)) return KENO_MIN_BET;
    return Math.max(KENO_MIN_BET, Math.min(KENO_MAX_BET, Math.floor(n)));
  };

  const setBetInput = (n) => {
    if (!state.$bet) return;
    const clamped = clampBet(Number(n));
    state.$bet.value = String(clamped);
    const usdtLabel = document.querySelector(".k2-bet-usdt");
    if (usdtLabel) usdtLabel.textContent = `${fmt(clamped)}.00000000 COINS`;
    renderPotential();
  };

  const updateDrawBtn = () => {
    if (!state.$draw) return;
    const bet = clampBet(Number(state.$bet?.value || 0));
    const ok =
      !isDrawing &&
      selected.size >= KENO_MIN_SPOTS &&
      selected.size <= KENO_MAX_SPOTS &&
      bet >= KENO_MIN_BET &&
      bet <= KENO_MAX_BET &&
      bet <= Math.max(0, localBalance);
    state.$draw.disabled = !ok;
  };

  const setStatus = (msg) => {
    if (state.$status) state.$status.textContent = msg;
  };

  const setBalance = (n) => {
    localBalance = Math.max(0, Math.floor(Number(n || 0)));
    if (state.$balance) state.$balance.textContent = fmt(localBalance);
    updateDrawBtn();
  };

  const setMatch = (n) => {
    if (state.$match) state.$match.textContent = String(Number(n || 0));
  };

  const toggleNumber = (n) => {
    if (isDrawing) return;
    const num = Number(n);
    if (num < KENO_MIN || num > KENO_MAX) return;
    if (selected.has(num)) {
      selected.delete(num);
    } else {
      if (selected.size >= KENO_MAX_SPOTS) {
        showKenoToast(`Max ${KENO_MAX_SPOTS} siffror! Tryck CLEAR först.`, "info");
        return;
      }
      selected.add(num);
    }
    clearHighlights();
    if (drawnSet.size > 0) {
      document.querySelectorAll(".keno-cell").forEach((cell) => {
        const cn = Number(cell.dataset.number);
        if (!drawnSet.has(cn)) return;
        cell.classList.add(selected.has(cn) ? "keno-cell--hit" : "keno-cell--drawn");
      });
    }
    renderSelected();
  };

  const quickPick10 = () => {
    if (isDrawing) return;
    const pool = [];
    for (let i = KENO_MIN; i <= KENO_MAX; i += 1) pool.push(i);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    selected.clear();
    clearHighlights();
    pool.slice(0, KENO_MAX_SPOTS).forEach((n) => selected.add(n));
    renderSelected();
    showKenoToast("Quick Pick 10 valda! 🎲", "success", { title: "SLUMPAT" });
  };

  const clearAll = () => {
    if (isDrawing) return;
    selected.clear();
    drawnSet.clear();
    clearHighlights();
    renderChips([], 0);
    if (state.$drawnStatus) state.$drawnStatus.textContent = "—";
    setMatch(0);
    renderSelected();
  };

  const renderPaytable = () => {
    const host = state.$payTable;
    if (!host) return;
    const payouts = payoutsForRisk(currentRiskKey());
    const spots = selected.size || 0;
    const rows = [];
    for (let s = KENO_MAX_SPOTS; s >= KENO_MIN_SPOTS; s -= 1) {
      const tbl = payouts[s];
      const entries = Object.keys(tbl)
        .map((k) => [Number(k), Number(tbl[k])])
        .sort((a, b) => a[0] - b[0]);
      const isActive = s === spots;
      const lastMatches = lastSession?.spots?.length === s ? Number(lastSession.matches ?? 0) : -1;
      const items = entries
        .map(([h, m]) => {
          const zero = m === 0;
          const hit = lastMatches === h && isActive && lastMatches >= 0;
          const best = entries.length > 0 && h === entries[entries.length - 1][0] && m > 0;
          const cls =
            `k2-pay-mult` +
            (zero ? ` is-zero` : ``) +
            (hit ? ` is-hit` : ``) +
            (best ? ` is-best` : ``);
          if (zero) return `<div class="${cls}">0×</div>`;
          const fmtM = Number.isInteger(m) ? `${m}×` : `${m.toFixed(1)}×`;
          return `<div class="${cls}" title="${h} träff">${fmtM}</div>`;
        })
        .join("");
      const winActive = isActive && lastSession && lastMatches >= 0 && (lastSession.payout || 0) > 0;
      const cls =
        `k2-pay-row` + (isActive ? ` is-current-spots` : ``) + (winActive ? `` : ``);
      const spotCls = `k2-pay-spots` + (winActive ? ` k2-ps--hit` : ``);
      rows.push(`
        <div class="${cls}">
          <div class="${spotCls}">${s}x</div>
          <div class="k2-pay-mults">${items}</div>
        </div>
      `);
    }
    host.innerHTML = rows.join("");
  };

  const fetchState = async () => {
    try {
      const res = await fetch("/api/keno/state", { headers: getAuthHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.balance !== undefined) setBalance(data.balance);
      if (data.session) {
        lastSession = data.session;
        if (Array.isArray(data.session.spots) && !selected.size) {
          selected.clear();
          data.session.spots.forEach((n) => selected.add(n));
          renderSelected();
        }
        if (Array.isArray(data.session.drawn) && !drawnSet.size) {
          drawnSet.clear();
          data.session.drawn.forEach((n) => drawnSet.add(n));
          renderDrawnHighlights(data.session.drawn);
          renderChips(data.session.drawn, data.session.matches || 0);
          setMatch(data.session.matches || 0);
        }
        renderPaytable();
      }
      return data;
    } catch (e) {
      return null;
    }
  };

  const readBet = () => {
    const bet = clampBet(Number(state.$bet?.value || 0));
    setBetInput(bet);
    return bet;
  };

  const tryDraw = async () => {
    if (isDrawing) return;
    if (!isLoggedIn()) {
      showKenoToast("Logga in först med Discord för att spela Keno.", "info", { title: "LOGGA IN" });
      document.getElementById("discord-login-btn")?.click();
      return;
    }
    if (selected.size < KENO_MIN_SPOTS || selected.size > KENO_MAX_SPOTS) {
      showKenoToast(`Välj 1–10 siffror (${selected.size} valda nu).`, "error");
      return;
    }
    const bet = readBet();
    if (bet < KENO_MIN_BET || bet > KENO_MAX_BET) {
      showKenoToast(`Insats mellan ${KENO_MIN_BET} och ${KENO_MAX_BET} coins.`, "error");
      return;
    }
    if (bet > localBalance) {
      showKenoToast("Inte tillräckligt med coins på kontot.", "error");
      return;
    }
    isDrawing = true;
    updateDrawBtn();
    const drawN = currentDrawCount();
    const risk = currentRiskKey();
    setStatus(`DRAR ${drawN} SIFFROR · ${RISK_MULT[risk].label.toUpperCase()}`);
    clearHighlights();
    drawnSet.clear();
    setMatch(0);
    state.$drawnChips && (state.$drawnChips.innerHTML = `<span class="keno-chip keno-chip--placeholder">…</span>`);
    state.$drawnStatus && (state.$drawnStatus.textContent = "DRAR…");

    try {
      const res = await fetch("/api/keno/draw", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          bet,
          spots: Array.from(selected).sort((a, b) => a - b),
          risk,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Misslyckades med dragningen");
      }
      lastSession = data.session;
      localStorage.setItem(CACHE_KEY, String(bet));
      localStorage.setItem(RISK_KEY, risk);
      const drawnArr = Array.isArray(data.session?.drawn) ? data.session.drawn.slice() : [];
      drawnArr.forEach((n) => drawnSet.add(n));
      const matches = Number(data.session?.matches ?? 0);
      const payout = Number(data.session?.payout ?? 0);
      const multiplier = Number(data.session?.multiplier ?? 0);
      const netWin = Number(data.netWin || 0);
      setMatch(matches);
      setBalance(data.balance ?? localBalance);

      const stagger = drawN >= 20 ? 65 : drawN >= 15 ? 85 : 110;
      renderDrawnHighlights(drawnArr, stagger);
      renderChips(drawnArr, matches, stagger);

      const revealMs = drawnArr.length * stagger + 650;
      await new Promise((r) => setTimeout(r, revealMs));
      renderPaytable();

      if (payout > 0) {
        if (matches === selected.size && multiplier >= 50) {
          setStatus(`🎉 FULL HIT ${matches}/${selected.size}! PAYOUT ${fmt(payout)} coins`);
          showKenoToast(
            `${matches}/${selected.size} träff ×${multiplier}! +${fmt(payout)} coins`,
            "win",
            { title: `JACKPOT! ${multiplier}×` }
          );
        } else {
          setStatus(`✅ ${matches}/${selected.size} träff · ${fmt(payout)} coins UTBETALNING`);
          showKenoToast(
            `${matches}/${selected.size} träff ×${multiplier} → ${fmt(payout)} coins. Netto ${netWin >= 0 ? "+" : ""}${fmt(netWin)}`,
            "win"
          );
        }
      } else {
        setStatus(`❌ ${matches}/${selected.size} träff · ingen utbetalning`);
        if (netWin < 0) {
          showKenoToast(
            `${matches}/${selected.size} träff. Ingen utbetalning. Insats ${fmt(bet)} coins gick till huset.`,
            "info",
            { title: "INGEN VINST" }
          );
        }
      }
      renderPotential();
    } catch (err) {
      setStatus("Något gick fel. Försök igen.");
      showKenoToast(err.message || "Kunde inte slutföra dragningen.", "error");
      renderChips([], 0);
      state.$drawnStatus && (state.$drawnStatus.textContent = "—");
    } finally {
      isDrawing = false;
      updateDrawBtn();
    }
  };

  const wireUp = () => {
    state.$board = document.getElementById("keno-board");
    state.$bet = document.getElementById("keno-bet-input");
    state.$draw = document.getElementById("keno-draw-btn");
    state.$balance = document.getElementById("keno-balance");
    state.$spots = document.getElementById("keno-spots-count");
    state.$match = document.getElementById("keno-match-count");
    state.$potential = document.getElementById("keno-potential");
    state.$status = document.getElementById("keno-status-text");
    state.$drawnChips = document.getElementById("keno-drawn-chips");
    state.$drawnStatus = document.getElementById("keno-drawn-status");
    state.$quick = document.getElementById("keno-quick-pick");
    state.$clear = document.getElementById("keno-clear-btn");
    state.$payTable = document.getElementById("keno-pay-table");

    initBoard();
    renderChips([], 0);
    state.$drawnStatus && (state.$drawnStatus.textContent = "—");
    const initialBet = clampBet(Number(state.$bet?.value || 10));
    const usdtLabel = document.querySelector(".k2-bet-usdt");
    if (usdtLabel) usdtLabel.textContent = `${fmt(initialBet)}.00000000 COINS`;

    state.$board?.addEventListener("click", (e) => {
      const t = e.target;
      const cell = t.closest?.(".keno-cell");
      if (cell) toggleNumber(cell.dataset.number);
    });

    state.$bet?.addEventListener("input", () => {
      const v = Number(state.$bet.value);
      if (Number.isFinite(v)) {
        const clamped = clampBet(v);
        state.$bet.value = String(clamped);
        if (usdtLabel) usdtLabel.textContent = `${fmt(clamped)}.00000000 COINS`;
      }
      renderPotential();
      updateDrawBtn();
    });
    state.$bet?.addEventListener("change", () => {
      const clamped = readBet();
      if (usdtLabel) usdtLabel.textContent = `${fmt(clamped)}.00000000 COINS`;
      renderPotential();
      updateDrawBtn();
    });

    document.querySelectorAll("[data-bet-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-bet-chip");
        if (kind === "max") {
          setBetInput(Math.min(KENO_MAX_BET, Math.max(KENO_MIN_BET, localBalance)));
        } else {
          const n = Number(kind);
          if (Number.isFinite(n)) setBetInput(n);
        }
        updateDrawBtn();
      });
    });

    document.querySelectorAll("[data-bet-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-bet-act");
        const current = clampBet(Number(state.$bet?.value || 0));
        if (act === "half") setBetInput(Math.max(KENO_MIN_BET, Math.floor(current / 2)));
        if (act === "double") setBetInput(Math.min(KENO_MAX_BET, current * 2));
        updateDrawBtn();
      });
    });

    document.querySelectorAll(".k2-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".k2-mode-btn").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
      });
    });

    state.$quick?.addEventListener("click", quickPick10);
    state.$clear?.addEventListener("click", clearAll);
    state.$draw?.addEventListener("click", tryDraw);

    const applyRisk = (riskKey, persist = false) => {
      const valid = Object.prototype.hasOwnProperty.call(RISK_MULT, riskKey) ? riskKey : "classic";
      document.querySelectorAll(".keno-risk-btn").forEach((btn) => {
        const on = btn.getAttribute("data-risk") === valid;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      const diffSel = document.getElementById("keno-diff-select");
      if (diffSel && diffSel.value !== valid) {
        diffSel.value = valid;
      }
      if (persist) {
        try { localStorage.setItem(RISK_KEY, valid); } catch (_) {}
      }
      renderPotential();
      renderPaytable();
    };

    document.querySelectorAll(".keno-risk-btn").forEach((btn) => {
      btn.addEventListener("click", () => applyRisk(btn.getAttribute("data-risk"), true));
    });

    const diffSel = document.getElementById("keno-diff-select");
    if (diffSel) {
      diffSel.addEventListener("change", () => applyRisk(diffSel.value, true));
    }

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest?.("#discord-login-btn") || t.closest?.("#discord-modal-btn")) {
        setStatus("Koppla din Discord för att spela Keno med coins.");
        setTimeout(() => {
          if (isLoggedIn()) {
            fetchState().then(() => {
              renderSelected();
              updateDrawBtn();
            });
          }
        }, 650);
      }
    });

    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setBetInput(Number(cached));
      const cachedRisk = localStorage.getItem(RISK_KEY);
      if (cachedRisk) applyRisk(cachedRisk, false);
    } catch (_) {}

    renderSelected();
    updateDrawBtn();
    fetchState();

    setInterval(() => {
      if (isDrawing) return;
      if (!isLoggedIn()) return;
      fetchState();
    }, 10000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUp);
  } else {
    wireUp();
  }
})();
