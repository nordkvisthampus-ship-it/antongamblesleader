(function () {
  "use strict";

  const BJ_CACHE_KEY = "ag_last_bj_bet";

  const SUIT_SYMBOLS = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
  };
  const SUIT_RED = new Set(["hearts", "diamonds"]);

  let localBalance = 0;
  let currentSession = null;
  let actionInFlight = false;

  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    win: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 9.5 8.5 2 9.2l5.5 5.2L6.5 22 12 18.3 17.5 22l-1-7.6 5.5-5.2-7.5-.7L12 2Z" opacity="0.95"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };
  const TITLES = {
    success: "LYCKADES!",
    win: "VINST! 🎉",
    error: "HOPPASAN!",
    info: "INFO",
  };
  const DURATIONS = {
    success: 3800,
    win: 5200,
    error: 4200,
    info: 3400,
  };

  const showBjToast = (message, variant = "info", opts = {}) => {
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

  const hasSession = () => {
    const key = "ag_session_token";
    const cookieOk = document.cookie.includes(`${key}=`);
    const storedOk = Boolean(localStorage.getItem(key));
    const profileOk = Boolean(localStorage.getItem("ag_profile"));
    return cookieOk || (storedOk && profileOk);
  };

  const ensureLogin = () => {
    if (hasSession()) return true;
    const modal = document.getElementById("login-modal");
    if (modal && window.openAnimatedModal) {
      window.openAnimatedModal(modal);
    } else if (modal) {
      modal.classList.add("active");
      if (window.applyModalBodyLock) window.applyModalBodyLock();
    }
    showBjToast("Logga in med Discord för att spela Blackjack", "info");
    return false;
  };

  const getBetInputEl = () => document.getElementById("bj-bet-input");
  const getBalanceEl = () => document.getElementById("bj-balance");
  const getStatusEl = () => document.getElementById("bj-status-text");
  const getDealerScoreEl = () => document.getElementById("bj-dealer-score");
  const getPlayerScoreEl = () => document.getElementById("bj-player-score");
  const getDealerHandEl = () => document.getElementById("bj-dealer-hand");
  const getPlayerHandEl = () => document.getElementById("bj-player-hand");

  const getActionButtons = () => ({
    deal: document.getElementById("bj-deal-btn"),
    hit: document.getElementById("bj-hit-btn"),
    stand: document.getElementById("bj-stand-btn"),
    double: document.getElementById("bj-double-btn"),
  });

  const setButtonsDisabled = (playing) => {
    const { deal, hit, stand, double } = getActionButtons();
    if (!deal) return;
    const profile = (() => {
      try {
        const raw = localStorage.getItem("ag_profile");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();
    const profileBalance =
      profile && typeof profile.points === "number" ? profile.points : 0;
    const balance = Math.max(localBalance || 0, profileBalance);
    const minBet = 1;
    const currentBet = parseBet();
    const canDeal =
      !playing &&
      balance >= minBet &&
      currentBet >= minBet &&
      currentBet <= balance &&
      !actionInFlight;
    deal.disabled = !canDeal;
    if (hit) hit.disabled = !playing || actionInFlight;
    if (stand) stand.disabled = !playing || actionInFlight;
    if (double) {
      const canDouble =
        playing &&
        !actionInFlight &&
        currentSession &&
        currentSession.playerHand &&
        currentSession.playerHand.length === 2 &&
        balance >= (currentSession?.bet || 0);
      double.disabled = !canDouble;
    }
  };

  const parseBet = () => {
    const input = getBetInputEl();
    if (!input) return 0;
    const raw = parseInt(input.value, 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  };

  const setBetInput = (value) => {
    const input = getBetInputEl();
    if (!input) return;
    const clamped = Math.max(1, Math.min(localBalance || 1, Math.floor(Number(value) || 0)));
    input.value = String(clamped);
    localStorage.setItem(BJ_CACHE_KEY, String(clamped));
    const usdt = document.getElementById("bj-bet-usdt");
    if (usdt) {
      usdt.textContent = `${Number(clamped).toLocaleString() + ".00000000"} COINS`;
    }
  };

  const updateBalanceDisplay = (value) => {
    if (typeof value === "number") localBalance = value;
    const el = getBalanceEl();
    if (!el) return;
    el.textContent = Number(localBalance || 0).toLocaleString();
  };

  const updateScores = (session) => {
    const dealerScoreEl = getDealerScoreEl();
    const playerScoreEl = getPlayerScoreEl();
    const dInline = document.getElementById("bj-dealer-score-inline");
    const pInline = document.getElementById("bj-player-score-inline");
    const dealerVal = session ? String(session.dealerScore ?? "–") : "–";
    const playerVal = session ? String(session.playerScore ?? "–") : "–";
    if (dealerScoreEl) dealerScoreEl.textContent = dealerVal;
    if (playerScoreEl) playerScoreEl.textContent = playerVal;
    if (dInline) {
      dInline.textContent = dealerVal;
      const ds = Number(session?.dealerScore ?? 0);
      dInline.dataset.bust = String(ds > 21);
      dInline.dataset.bj = String(ds === 21 && session?.dealerHand?.length === 2);
    }
    if (pInline) {
      pInline.textContent = playerVal;
      const ps = Number(session?.playerScore ?? 0);
      pInline.dataset.bust = String(ps > 21);
      pInline.dataset.bj = String(ps === 21 && session?.playerHand?.length === 2);
    }
  };

  const renderCard = (card) => {
    const wrap = document.createElement("div");
    wrap.className = "bj-card";
    if (card && card.hidden) {
      wrap.classList.add("bj-card--hidden");
      const back = document.createElement("div");
      back.className = "bj-card-back";
      back.innerHTML = `<span class="bj-card-back-logo">AG</span>`;
      wrap.appendChild(back);
      return wrap;
    }
    const suit = String(card?.suit || "");
    const rank = String(card?.rank || "");
    const isRed = SUIT_RED.has(suit);
    wrap.classList.add(isRed ? "bj-card--red" : "bj-card--black");
    const symbol = SUIT_SYMBOLS[suit] || "";
    const topLeft = document.createElement("div");
    topLeft.className = "bj-card-corner bj-card-corner--tl";
    topLeft.innerHTML = `<span class="bj-card-rank">${rank}</span><span class="bj-card-suit">${symbol}</span>`;
    const center = document.createElement("div");
    center.className = "bj-card-center";
    center.innerHTML = `<span class="bj-card-suit bj-card-suit--big">${symbol}</span>`;
    const botRight = document.createElement("div");
    botRight.className = "bj-card-corner bj-card-corner--br";
    botRight.innerHTML = `<span class="bj-card-rank">${rank}</span><span class="bj-card-suit">${symbol}</span>`;
    wrap.appendChild(topLeft);
    wrap.appendChild(center);
    wrap.appendChild(botRight);
    return wrap;
  };

  const detectHoleReveal = (prevCards, nextCards) => {
    if (!prevCards || !nextCards) return null;
    for (let i = 0; i < Math.min(prevCards.length, nextCards.length); i++) {
      const p = prevCards[i] || {};
      const n = nextCards[i] || {};
      if (p.hidden && !n.hidden) return i;
    }
    return null;
  };

  const renderHand = (el, cards = [], opts = {}) => {
    if (!el) return;
    const { animateLast = false, revealIndex = -1, staggerMs = 260, revealMs = 560 } = opts;
    const existingCards = Array.from(el.children);
    const revealWas = revealIndex >= 0 && revealIndex < existingCards.length;
    el.innerHTML = "";
    cards.forEach((card, i) => {
      const node = renderCard(card);
      if (revealWas && i === revealIndex) {
        node.style.animationDelay = `${revealMs}ms`;
        node.classList.add("bj-card--reveal");
      } else if (animateLast) {
        const delayBase = i < existingCards.length ? 0 : i - Math.max(0, existingCards.length - 1);
        const delay = Math.min(delayBase * staggerMs, 1200);
        node.style.animationDelay = `${delay}ms`;
        node.classList.add("bj-card--dealt");
      }
      el.appendChild(node);
    });
  };

  const clearHands = () => {
    const dh = getDealerHandEl();
    const ph = getPlayerHandEl();
    if (dh) dh.innerHTML = "";
    if (ph) ph.innerHTML = "";
  };

  const setStatusText = (text) => {
    const el = getStatusEl();
    if (el) el.textContent = text;
  };

  const prevDealerHand = () => (currentSession && Array.isArray(currentSession.dealerHand) ? currentSession.dealerHand : []);
  const prevPlayerHand = () => (currentSession && Array.isArray(currentSession.playerHand) ? currentSession.playerHand : []);

  const applySession = (session, { fromServer = false, justSettled = false } = {}) => {
    const oldDealer = prevDealerHand();
    const oldPlayer = prevPlayerHand();
    currentSession = session;
    if (!session) {
      clearHands();
      updateScores(null);
      setButtonsDisabled(false);
      setStatusText("PLACE YOUR BET TO START");
      return;
    }
    const dealerRevealIdx = detectHoleReveal(oldDealer, session.dealerHand || []);
    renderHand(getDealerHandEl(), session.dealerHand || [], { animateLast: true, revealIndex: dealerRevealIdx });
    renderHand(getPlayerHandEl(), session.playerHand || [], { animateLast: true });
    updateScores(session);
    const playing = session.status === "playing";
    setButtonsDisabled(playing);
    if (session.status === "settled") {
      const res = session.result;
      const bet = session.bet || 0;
      const payout = session.payout || 0;
      const doubled = session.doubled ? " (DOUBLE)" : "";
      if (res === "blackjack") {
        setStatusText(`BLACKJACK${doubled}! YOU WON ${Number(payout - (session.doubled ? 2 * bet : bet)).toLocaleString()} COINS`);
      } else if (res === "win") {
        setStatusText(`WIN${doubled}! +${Number(payout - (session.doubled ? 2 * bet : bet)).toLocaleString()} COINS`);
      } else if (res === "lose") {
        setStatusText(`LOSE${doubled}. BET OF ${Number(session.doubled ? 2 * bet : bet).toLocaleString()} GOES TO THE HOUSE`);
      } else if (res === "push") {
        setStatusText(`PUSH${doubled}. BET RETURNED`);
      } else {
        setStatusText("HAND COMPLETE — PLACE A NEW BET");
      }
    } else if (session.status === "dealer") {
      setStatusText("DEALER DRAWS…");
    } else if (session.status === "playing") {
      setStatusText("YOUR MOVE — HIT, STAND OR DOUBLE");
    }
  };

  const fetchState = async () => {
    if (!hasSession()) return null;
    try {
      const res = await fetch("/api/blackjack/state", { headers: getAuthHeaders() });
      if (res.status === 401) return null;
      const payload = await res.json().catch(() => ({}));
      if (typeof payload.balance === "number") updateBalanceDisplay(payload.balance);
      if (payload.session) applySession(payload.session, { fromServer: true });
      return payload;
    } catch (e) {
      return null;
    }
  };

  const syncWalletDrops = () => {
    const walletDropdownBtn = document.getElementById("top-wallet-dropdown");
    if (!walletDropdownBtn) return;
    const valueSpan = walletDropdownBtn.querySelector(".wallet-balance-value") || walletDropdownBtn.querySelectorAll("span")[1];
    if (!valueSpan) return;
    const balance = Number(localBalance || 0).toLocaleString();
    if (valueSpan && !valueSpan.classList.contains("wallet-chevron") && !valueSpan.classList.contains("wallet-label")) {
      valueSpan.textContent = `${balance} Coins`;
    }
  };

  const updateStoredProfilePoints = (newPoints) => {
    try {
      const raw = localStorage.getItem("ag_profile");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.points = Number(newPoints);
      localStorage.setItem("ag_profile", JSON.stringify(parsed));
    } catch {}
    if (window.currentProfile && typeof window.currentProfile === "object") {
      window.currentProfile.points = Number(newPoints);
    }
  };

  const setNewBalance = (val) => {
    updateBalanceDisplay(val);
    syncWalletDrops();
    updateStoredProfilePoints(val);
  };

  const callAction = async (endpoint, body = null) => {
    if (!ensureLogin()) return null;
    if (actionInFlight) return null;
    actionInFlight = true;
    setButtonsDisabled(currentSession?.status === "playing");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        showBjToast(getFriendlyError(payload.error || "Request failed"), "error");
        return null;
      }
      if (typeof payload.balance === "number") setNewBalance(payload.balance);
      if (payload.session) applySession(payload.session, { fromServer: true, justSettled: Boolean(payload.settlement) });
      if (payload.settlement) {
        const r = payload.settlement.result;
        const bet = Number(payload.settlement.bet || payload.session?.bet || 0);
        const payout = Number(payload.settlement.payout || payload.session?.payout || 0);
        const doubled = payload.session?.doubled;
        const netWin = Number(payout - (doubled ? 2 * bet : bet));
        if (r === "blackjack") {
          showBjToast(
            `BLACKJACK! 🎊 Du vann <strong>+${netWin.toLocaleString()}</strong> coins${doubled ? " (DOUBLE)" : ""}.`,
            "win",
            { title: "⚡️ NATURLIG BLACKJACK!" }
          );
        } else if (r === "win") {
          showBjToast(
            `Du slog dealern! 🎉 <strong>+${netWin.toLocaleString()}</strong> coins${doubled ? " (DOUBLE)" : ""}.`,
            "win",
            { title: "VINST!" }
          );
        } else if (r === "lose") {
          showBjToast(
            `Dealern vann denna gång. Insats på <strong style="color:#fecaca">${Number(doubled ? 2 * bet : bet).toLocaleString()}</strong> coins gick till huset 💸`,
            "info",
            { title: "FÖRLUST" }
          );
        } else if (r === "push") {
          showBjToast(
            `Lika! Din insats på <strong>${bet.toLocaleString()}</strong> coins återbetalas tillbaka.`,
            "info",
            { title: "PUSH" }
          );
        }
      }
      return payload;
    } catch (e) {
      showBjToast("Nätverksfel, försök igen", "error");
      return null;
    } finally {
      actionInFlight = false;
      setButtonsDisabled(currentSession?.status === "playing");
    }
  };

  const getFriendlyError = (msg) => {
    const raw = String(msg || "").toLowerCase();
    if (raw.includes("not enough coins")) return "Inte tillräckligt med Coins";
    if (raw.includes("bet must be between")) return "Insatsen måste vara mellan 1 och 25 000 Coins";
    if (raw.includes("hand already in progress")) return "Avsluta nuvarande hand först";
    if (raw.includes("no active hand")) return "Ingen aktiv hand — place en bet först";
    if (raw.includes("double only allowed")) return "Double down bara tillåtet på de två första korten";
    if (raw.includes("unauthorized")) return "Logga in först";
    return String(msg || "Något gick fel");
  };

  const setupBetChips = () => {
    document.querySelectorAll("[data-bet-chip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-bet-chip");
        if (val === "max") {
          setBetInput(Math.max(1, Math.floor(localBalance || 1)));
        } else {
          const n = parseInt(val, 10);
          if (Number.isFinite(n)) setBetInput(n);
        }
        setButtonsDisabled(currentSession?.status === "playing");
      });
    });
    document.querySelectorAll("[data-bet-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-bet-act");
        const current = parseBet() || 1;
        if (act === "half") setBetInput(Math.max(1, Math.floor(current / 2)));
        else if (act === "double") setBetInput(Math.max(1, Math.min(localBalance || 1, current * 2)));
        setButtonsDisabled(currentSession?.status === "playing");
      });
    });
    const input = getBetInputEl();
    if (input) {
      input.addEventListener("change", () => {
        const clamped = Math.max(1, Math.min(localBalance || 1, Math.floor(parseInt(input.value, 10) || 1)));
        setBetInput(clamped);
        setButtonsDisabled(currentSession?.status === "playing");
      });
      input.addEventListener("input", () => {
        const usdt = document.getElementById("bj-bet-usdt");
        if (usdt) {
          const raw = Math.max(1, Math.floor(parseInt(input.value, 10) || 1));
          usdt.textContent = `${Number(raw).toLocaleString() + ".00000000"} COINS`;
        }
        setButtonsDisabled(currentSession?.status === "playing");
      });
    }
  };

  const setupActions = () => {
    const { deal, hit, stand, double } = getActionButtons();
    if (deal) {
      deal.addEventListener("click", async () => {
        if (!ensureLogin()) return;
        const bet = parseBet();
        if (bet < 1) {
          showBjToast("Välj en insats först", "info");
          return;
        }
        if (bet > (localBalance || 0)) {
          showBjToast("Inte tillräckligt med Coins", "error");
          return;
        }
        await callAction("/api/blackjack/deal", { bet });
      });
    }
    if (hit) {
      hit.addEventListener("click", () => callAction("/api/blackjack/hit"));
    }
    if (stand) {
      stand.addEventListener("click", () => callAction("/api/blackjack/stand"));
    }
    if (double) {
      double.addEventListener("click", () => callAction("/api/blackjack/double"));
    }
  };

  const restoreLastBet = () => {
    try {
      const last = parseInt(localStorage.getItem(BJ_CACHE_KEY) || "", 10);
      if (Number.isFinite(last) && last > 0) {
        setBetInput(last);
      } else {
        setBetInput(parseBet() || 10);
      }
    } catch {
      setBetInput(parseBet() || 10);
    }
  };

  const init = async () => {
    setupBetChips();
    setupActions();
    restoreLastBet();
    setStatusText("PLACE YOUR BET TO START");
    if (hasSession()) {
      const profile = (() => {
        try {
          const raw = localStorage.getItem("ag_profile");
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
      if (profile && typeof profile.points === "number") {
        setNewBalance(profile.points);
      }
      setButtonsDisabled(false);
      await fetchState();
      setButtonsDisabled(currentSession?.status === "playing");
    } else {
      setStatusText("LOGGA IN FÖR ATT SPELA BLACKJACK");
      setButtonsDisabled(false);
    }
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("#discord-login-btn") || t.closest("#discord-modal-btn")) {
        setTimeout(() => {
          if (hasSession()) fetchState();
        }, 500);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
