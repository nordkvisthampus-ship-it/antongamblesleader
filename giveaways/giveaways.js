(() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const PHASE = {
    IDLE: "idle",
    ACCEPTING: "accepting",
    CLOSED: "closed",
    DRAWN: "drawn",
  };

  const PHASE_META = {
    [PHASE.IDLE]:       { text: "IDLE",     cls: "gw-phase-idle",     long: "Waiting to start", cta: "Start Accepting Entries", cta2: null },
    [PHASE.ACCEPTING]:  { text: "LIVE",     cls: "gw-phase-live",     long: "Accepting entries", cta: "Close Entries", cta2: "Draw Winner Now" },
    [PHASE.CLOSED]:     { text: "CLOSED",   cls: "gw-phase-closed",   long: "Entries closed",    cta: "Draw Winner", cta2: "Reopen Entries" },
    [PHASE.DRAWN]:      { text: "COMPLETE", cls: "gw-phase-drawn",    long: "Winner announced",  cta: null, cta2: null },
  };

  let isAdmin = false;
  let currentOverview = null;
  let selectedFile = null;
  let selectedFileDataUri = null;
  let gwRefreshTimer = null;
  let lastWinnersDrawnKey = null;

  const getHeaders = () => {
    const token = localStorage.getItem("ag_session_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...getHeaders(), ...(opts.headers || {}) },
      ...opts,
    });
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
      opts.body = JSON.stringify(opts.body);
    }
    return res;
  };

  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const setText = (id, val) => { const el = $(id); if (el) el.textContent = val ?? ""; };

  const getAvatarUrl = (e) => {
    if (!e?.avatar || !e?.discordId) return "https://cdn.discordapp.com/embed/avatars/0.png";
    return `https://cdn.discordapp.com/avatars/${e.discordId}/${e.avatar}.png?size=128`;
  };
  const displayName = (e) => e?.globalName || e?.username || "User";

  const showFeedback = (msg, kind = "info") => {
    const el = $("gw-feedback");
    if (!el) return;
    el.className = `gw-feedback gw-feedback-${kind}`;
    el.textContent = msg || "";
    if (msg && kind !== "error") {
      clearTimeout(showFeedback._t);
      showFeedback._t = setTimeout(() => { if (el.className.includes(`gw-feedback-${kind}`)) el.textContent = ""; }, 6000);
    }
  };

  const runConfetti = () => {
    if (typeof window.runBigPrizeConfetti === "function") {
      try { window.runBigPrizeConfetti(); } catch {}
    } else if (typeof window.runConfetti === "function") {
      try { window.runConfetti(); } catch {}
    }
  };

  // ========== Load overview ==========
  const loadOverview = async () => {
    try {
      const res = await fetch("/api/deposit-giveaway", { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      currentOverview = data;
      isAdmin = Boolean(data.isAdmin);
      renderOverview(data);
    } catch (err) {
      console.warn("loadOverview failed:", err);
    }
  };

  // ========== Render ==========
  const renderOverview = (data) => {
    const c = data.activeCampaign;
    const isLogged = Boolean(data.activeCampaign?.me?.isLoggedIn || data.isAdmin);

    // Admin section always available for admin, even when no active campaign
    const adminSection = $("gw-admin-section");
    const noPublicAdminUi = Boolean(window.__NO_ADMIN_PUBLIC_UI__);
    if (adminSection) adminSection.style.display = (isAdmin && !noPublicAdminUi) ? "" : "none";

    // Debug info for logged-in users (visible at top)
    const debugEl = $("gw-auth-debug");
    if (debugEl) {
      if (isLogged) {
        const me = (c && c.me) || data.me || {};
        const roles = Array.isArray(data.myDiscordRoles) ? data.myDiscordRoles : (me.discordRoleNames || []);
        debugEl.innerHTML = `
          <div class="gw-auth-debug-card" style="padding:14px 18px;background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,0.25);border-radius:14px;margin-bottom:18px;font-size:13px;line-height:1.55;color:#cfc9bb">
            <div style="display:flex;flex-wrap:wrap;gap:10px 26px;align-items:center">
              <div><strong style="color:#f5efe0">Logged in:</strong> ${escapeHtml(me.globalName || me.username || (data.me && data.me.username) || "-")}</div>
              <div><strong style="color:#f5efe0">Discord ID:</strong> <code style="background:rgba(0,0,0,0.4);padding:2px 8px;border-radius:6px;color:#d4af37">${escapeHtml(me.discordId || (data.me && data.me.discordId) || "-")}</code></div>
              <div><strong style="color:#f5efe0">isAdmin:</strong> <span style="font-weight:800;color:${isAdmin ? "#39d98a" : "#ff6b6b"}">${isAdmin ? "YES ✅" : "NO ❌"}</span></div>
              <div><strong style="color:#f5efe0">Roles:</strong> ${roles.length ? roles.map(r=>`<span style="display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;background:rgba(212,175,55,0.12);color:#e9daa8;font-size:12px">${escapeHtml(r)}</span>`).join("") : "<em style=\"opacity:0.55\">none detected</em>"}</div>
            </div>
            <div style="margin-top:8px;opacity:0.7;font-size:12px">Not admin? Send your Discord ID to the system owner so it can be added to OWNER/ADMIN list.</div>
          </div>`;
      } else {
        debugEl.innerHTML = "";
      }
    }

    // History always rendered
    renderHistory(data.history || []);

    // === NO ACTIVE CAMPAIGN STATE ===
    if (!c) {
      setText("gw-title", "No Active Giveaway");
      setText("gw-subtitle", isAdmin
        ? "Create your first deposit-proof giveaway below and launch it instantly."
        : "Check back soon — a new deposit giveaway will go live shortly!");
      setText("gw-prize", "--");
      setText("gw-min-dep", "--");
      setText("gw-entries", "0");
      setText("gw-winners-count", "1");

      const badge = $("gw-phase-badge");
      if (badge) { badge.textContent = "SOON"; badge.className = "gw-phase-badge gw-phase-idle"; }
      setText("gw-phase-long", "Giveaway not started");
      setText("gw-kpi-approved", "0");

      const approvedHead = $("gw-approved-head-count");
      if (approvedHead) approvedHead.textContent = "(0)";

      const pendingCard = $("gw-pending-card");
      if (pendingCard) pendingCard.style.display = "none";
      setText("gw-pending-count", "0");
      setText("gw-kpi-my", "0");

      const formSection = $("gw-form-section");
      if (formSection) formSection.style.display = "none";

      if (isAdmin) {
        renderPhaseControls({ phase: "__none__" });
      } else {
        const wrap = $("gw-phase-controls");
        if (wrap) wrap.innerHTML = "";
      }
      renderPendingList([]);

      const wrap = $("gw-cta-wrap");
      if (wrap) {
        if (isAdmin) {
          wrap.innerHTML = `
            <div class="gw-cta-enter-row" style="justify-content:center">
              <a href="#gw-admin-create-card" class="promoBtn promoBtn--primary gw-jump-create" style="min-width:320px;font-size:16px;height:56px">🚀 Create &amp; Launch Giveaway Now</a>
            </div>`;
          wrap.querySelector(".gw-jump-create")?.addEventListener("click", (e) => {
            e.preventDefault();
            $("gw-admin-create-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        } else {
          wrap.innerHTML = `<div class="gw-cta-info gw-cta-info-closed"><span class="gw-cta-info-dot gw-cta-info-dot-closed"></span>Giveaway hasn't opened yet. Check back when admin launches a new event.</div>`;
        }
      }

      const me = data.activeCampaign?.me;
      const myPanel = $("gw-my-panel");
      if (myPanel) {
        if (!isLogged) {
          myPanel.innerHTML = `<div class="gw-my-login-note">Log in to track your entries.</div>`;
        } else {
          myPanel.innerHTML = `<h2 class="section-title">Your Entries</h2><div class="agp-empty">No entries yet — no active giveaway.</div>`;
        }
      }
      renderApprovedList([]);
      renderWinnerCard(null);
      return;
    }

    setText("gw-title", c.title || "Deposit Giveaway");
    setText("gw-subtitle", c.subtitle || "");
    setText("gw-prize", c.prize || "--");
    setText("gw-min-dep", `${c.minDepositAmount || 0} ${c.minDepositCurrency || ""}`.trim());
    setText("gw-entries", String(c.entryCount || 0));
    setText("gw-winners-count", String(c.winnersCount || 1));

    // Phase badge
    const meta = PHASE_META[c.phase] || PHASE_META[PHASE.IDLE];
    const badge = $("gw-phase-badge");
    if (badge) {
      badge.textContent = meta.text;
      badge.className = `gw-phase-badge ${meta.cls}`;
    }
    setText("gw-phase-long", meta.long);
    setText("gw-kpi-approved", String(c.entryCount || 0));

    // Approved entries head count
    const approvedHead = $("gw-approved-head-count");
    if (approvedHead) approvedHead.textContent = `(${c.entryCount || 0})`;

    // Pending visible only for admin (not on public pages when UI is consolidated)
    const pendingCard = $("gw-pending-card");
    const noPublicAdminUi = Boolean(window.__NO_ADMIN_PUBLIC_UI__);
    const pendingCount = (isAdmin && !noPublicAdminUi) ? (c.pendingCount ?? 0) : 0;
    if (pendingCard) pendingCard.style.display = (isAdmin && !noPublicAdminUi) ? "" : "none";
    setText("gw-pending-count", String(pendingCount));
    setText("gw-kpi-my", String(c.me?.myApprovedCount ?? c.me?.myEntries?.filter((e)=>e.status==="approved").length ?? 0));

    const noPublicAdminUi2 = Boolean(window.__NO_ADMIN_PUBLIC_UI__);
    if (isAdmin && !noPublicAdminUi2) {
      const headN = $("gw-pending-head-count");
      if (headN) headN.textContent = `(${pendingCount})`;
      renderPhaseControls(c);
      renderPendingList(c.pendingEntries || []);
    }

    // Entry form visibility
    const formSection = $("gw-form-section");
    const canEnter = c.phase === PHASE.ACCEPTING && c.me?.isLoggedIn;
    formSection.style.display = canEnter ? "" : "none";

    // CTA block under hero
    renderCtas(c);

    // My panel
    renderMyPanel(c);
    renderApprovedList(c.approvedEntries || []);
    renderWinnerCard(c);
  };

  const renderCtas = (c) => {
    const wrap = $("gw-cta-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const loggedIn = Boolean(c.me?.isLoggedIn);
    if (!loggedIn) {
      wrap.innerHTML = `
        <div class="gw-cta-guest">
          <button type="button" class="promoBtn promoBtn--primary gw-guest-login" style="min-width:260px">Log In To Enter</button>
          <div class="gw-cta-guest-sub">Log in with Discord to submit deposit proof.</div>
        </div>`;
      wrap.querySelector(".gw-guest-login")?.addEventListener("click", () => {
        const btn = document.getElementById("discord-login-btn");
        if (btn) btn.click();
      });
      return;
    }

    if (c.phase === PHASE.IDLE) {
      wrap.innerHTML = `<div class="gw-cta-info"><span class="gw-cta-info-dot"></span>Giveaway hasn't opened yet. Check back when admin starts accepting entries.</div>`;
      return;
    }
    if (c.phase === PHASE.ACCEPTING) {
      const cnt = c.me?.myEntries?.length || 0;
      const pending = c.me?.myPendingCount || c.me?.myEntries?.filter((e)=>e.status==="pending").length || 0;
      const approved = c.me?.myApprovedCount || c.me?.myEntries?.filter((e)=>e.status==="approved").length || 0;
      wrap.innerHTML = `
        <div class="gw-cta-enter-row">
          <a href="#gw-form-section" class="promoBtn promoBtn--primary gw-jump-form" style="min-width:260px">📸 Submit Deposit Proof</a>
          <div class="gw-cta-enter-stats">
            <span>You have <strong>${approved}</strong> approved ${approved===1?"ticket":"tickets"}${pending?` · ⏳ ${pending} under review`:""}</span>
          </div>
        </div>`;
      const jump = wrap.querySelector(".gw-jump-form");
      if (jump) jump.addEventListener("click", (e) => {
        e.preventDefault();
        $("gw-form-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    if (c.phase === PHASE.CLOSED) {
      wrap.innerHTML = `<div class="gw-cta-info gw-cta-info-closed"><span class="gw-cta-info-dot gw-cta-info-dot-closed"></span>Entries are now closed. Admin will draw the winner soon.</div>`;
      return;
    }
    if (c.phase === PHASE.DRAWN) {
      wrap.innerHTML = `<div class="gw-cta-info gw-cta-info-drawn"><span class="gw-cta-info-dot gw-cta-info-dot-drawn"></span>Giveaway complete! Winners announced below.</div>`;
    }
  };

  const renderPhaseControls = (c) => {
    const wrap = $("gw-phase-controls");
    if (!wrap) return;

    const btn = (label, phase, opts = {}) =>
      `<button type="button" class="promoBtn ${opts.primary ? "promoBtn--primary" : opts.danger ? "promoBtn--ghost promoBtn--ghostDanger" : "promoBtn--ghost"} gw-phase-btn" data-phase="${phase}">${label}</button>`;

    let html = `<div class="gw-phase-controls-head">Admin Phase Controls</div><div class="gw-phase-controls-row">`;

    if (c.phase === "__none__") {
      html += `<button type="button" class="promoBtn promoBtn--primary gw-jump-create-2" style="min-width:300px">🚀 Create &amp; Start Giveaway</button>`;
      html += `</div>`;
      wrap.innerHTML = html;
      wrap.querySelector(".gw-jump-create-2")?.addEventListener("click", () => {
        $("gw-admin-create-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    const meta = PHASE_META[c.phase] || PHASE_META[PHASE.IDLE];

    if (c.phase === PHASE.IDLE) {
      html += btn(meta.cta, PHASE.ACCEPTING, { primary: true });
    } else if (c.phase === PHASE.ACCEPTING) {
      html += btn(meta.cta, PHASE.CLOSED, { danger: true });
      html += btn("✨ Draw Winner (skip close)", "draw", { primary: true });
    } else if (c.phase === PHASE.CLOSED) {
      html += btn(meta.cta, "draw", { primary: true });
      html += btn(meta.cta2, PHASE.ACCEPTING);
    } else if (c.phase === PHASE.DRAWN) {
      html += btn("🔁 Reset to Idle (wipe entries)", "reset", { danger: true });
    }
    html += `</div>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll(".gw-phase-btn").forEach((b) => {
      b.addEventListener("click", async () => {
        const target = b.getAttribute("data-phase");
        if (target === "draw") return runDrawWinners();
        if (target === "reset") return runReset();
        return runSetPhase(target);
      });
    });
  };

  // ========== My panel ==========
  const renderMyPanel = (c) => {
    const el = $("gw-my-panel");
    if (!el) return;
    const me = c.me;
    if (!me?.isLoggedIn) {
      el.innerHTML = `<div class="gw-my-login-note">Log in to track your entries.</div>`;
      return;
    }
    const entries = me.myEntries || [];
    const approved = entries.filter((e) => e.status === "approved").length;
    const pending = entries.filter((e) => e.status === "pending").length;
    const rejected = entries.filter((e) => e.status === "rejected").length;

    const rows = entries.slice(0, 5).map((e) => {
      const color =
        e.status === "approved" ? "gw-mypill-app" :
        e.status === "pending"  ? "gw-mypill-pend" : "gw-mypill-rej";
      const label =
        e.status === "approved" ? "APPROVED" :
        e.status === "pending"  ? "PENDING" : "REJECTED";
      return `<div class="gw-my-entry">
        <button type="button" class="gw-my-entry-thumb" data-image="${escapeHtml(e.imageUrl)}">
          <img src="${escapeHtml(e.imageUrl)}" alt="thumb" referrerpolicy="no-referrer"/>
        </button>
        <div class="gw-my-entry-meta">
          <div class="gw-my-entry-status"><span class="gw-mypill ${color}">${label}</span></div>
          <div class="gw-my-entry-when">${escapeHtml(new Date(e.submittedAt || 0).toLocaleString("en-GB",{dateStyle:"short",timeStyle:"short"}))}</div>
          ${e.note ? `<div class="gw-my-entry-note">${escapeHtml(e.note)}</div>` : ""}
        </div>
      </div>`;
    }).join("") || `<div class="agp-empty">No entries yet.</div>`;

    el.innerHTML = `
      <h2 class="section-title">Your Entries</h2>
      <div class="giveaway-me-stats">
        <div class="giveaway-me-stat"><span class="giveaway-me-label">Approved</span><strong class="giveaway-me-value">${approved}</strong></div>
        <div class="giveaway-me-stat"><span class="giveaway-me-label">Pending</span><strong class="giveaway-me-value">${pending}</strong></div>
        <div class="giveaway-me-stat"><span class="giveaway-me-label">Rejected</span><strong class="giveaway-me-value">${rejected}</strong></div>
        <div class="giveaway-me-stat"><span class="giveaway-me-label">Total</span><strong class="giveaway-me-value">${entries.length}</strong></div>
      </div>
      <div class="gw-my-list">${rows}</div>
    `;

    el.querySelectorAll(".gw-my-entry-thumb").forEach((b) => {
      b.addEventListener("click", () => openImageModal(b.getAttribute("data-image")));
    });
  };

  // ========== Approved list ==========
  const renderApprovedList = (entries) => {
    const el = $("gw-approved-list");
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = `<div class="agp-empty">No approved entries yet.</div>`;
      return;
    }
    el.innerHTML = entries.map((e, i) => {
      const rank = i + 1;
      return `<div class="giveaway-list-item">
        <div class="giveaway-list-rank">${rank}</div>
        <img class="giveaway-list-avatar" src="${escapeHtml(getAvatarUrl(e))}" alt="" referrerpolicy="no-referrer"/>
        <div class="giveaway-list-main">
          <div class="giveaway-list-name">${escapeHtml(displayName(e))} <span class="gw-level-pill">${escapeHtml(e.levelName || "Rookie")}</span></div>
          <div class="giveaway-list-foot">Submitted ${escapeHtml(new Date(e.submittedAt || 0).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}))}</div>
        </div>
        <button type="button" class="gw-thumb-btn" data-image="${escapeHtml(e.imageUrl)}" title="Open screenshot">👁</button>
      </div>`;
    }).join("");
    el.querySelectorAll(".gw-thumb-btn").forEach((b) => {
          b.addEventListener("click", () => openImageModal(b.getAttribute("data-image")));
        });
  };

  // ========== Pending list ==========
  const renderPendingList = (entries) => {
    const el = $("gw-pending-list");
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = `<div class="agp-empty">No pending entries to review.</div>`;
      return;
    }
    el.innerHTML = entries.map((e) => `
      <div class="gw-entry-card">
        <div class="gw-entry-head">
          <img class="giveaway-list-avatar" src="${escapeHtml(getAvatarUrl(e))}" alt="" referrerpolicy="no-referrer"/>
          <div class="gw-entry-user">
            <div class="gw-entry-name">${escapeHtml(displayName(e))}</div>
            <div class="gw-entry-sub">${escapeHtml(new Date(e.submittedAt || 0).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}))}</div>
          </div>
        </div>
        <button type="button" class="gw-entry-image" data-image="${escapeHtml(e.imageUrl)}">
          <img src="${escapeHtml(e.imageUrl)}" alt="screenshot" referrerpolicy="no-referrer"/>
        </button>
        ${e.note ? `<div class="gw-entry-note">📝 ${escapeHtml(e.note)}</div>` : ""}
        <div class="gw-entry-actions">
          <button type="button" class="promoBtn promoBtn--primary gw-approve-btn" data-entry-id="${escapeHtml(e.id)}">✅ Approve</button>
          <button type="button" class="promoBtn promoBtn--ghost promoBtn--ghostDanger gw-reject-btn" data-entry-id="${escapeHtml(e.id)}">✕ Reject</button>
        </div>
      </div>
    `).join("");
    el.querySelectorAll(".gw-entry-image").forEach((b) => b.addEventListener("click", () => openImageModal(b.getAttribute("data-image"))));
    el.querySelectorAll(".gw-approve-btn").forEach((b) => b.addEventListener("click", () => runReview(b.getAttribute("data-entry-id"), "approved")));
    el.querySelectorAll(".gw-reject-btn").forEach((b) => b.addEventListener("click", () => runReview(b.getAttribute("data-entry-id"), "rejected")));
  };

  // ========== Winner Card ==========
  const renderWinnerCard = (c) => {
    const card = $("gw-winner-card");
    const spotlight = $("gw-winner-spotlight");
    const winTitle = $("gw-winner-title");
    const winCopy = $("gw-winner-copy");
    const winSummary = $("gw-winner-summary");
    const winList = $("gw-winners-list");
    const winners = c && Array.isArray(c.winners) ? c.winners : [];
    if (!winners.length || !c || c.phase !== PHASE.DRAWN) {
      card?.classList.add("is-empty");
      if (winTitle) winTitle.textContent = "No Draw Yet";
      if (winCopy) winCopy.textContent = "The winner will be revealed here after the live draw.";
      if (winSummary) winSummary.textContent = "";
      if (winList) winList.innerHTML = "";
      if (spotlight) spotlight.innerHTML = `
        <div class="giveaway-reveal-empty">
          <div class="giveaway-reveal-empty-icon"></div>
          <div class="giveaway-reveal-empty-title">No winner yet</div>
          <div class="giveaway-reveal-empty-copy">Once admin draws the winners, the lucky entries will be announced here with a live celebration.</div>
        </div>`;
      return;
    }

    const drawnTs = c.drawnAt ? new Date(c.drawnAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}) : "";
    card?.classList.remove("is-empty");
    if (winTitle) winTitle.textContent = winners.length === 1 ? "🎉 Winner" : `🎉 ${winners.length} Winners`;
    if (winCopy) winCopy.textContent = `${c.prize || "Prize"} · ${c.title || ""}`;
    if (winSummary) winSummary.textContent = `Drawn at ${drawnTs} · ${c.entryCount || 0} approved entries`;

    const big = winners[0];
    if (spotlight) spotlight.innerHTML = `
      <div class="gw-spotlight-winner">
        <div class="gw-spotlight-crown">👑</div>
        <img class="gw-spotlight-avatar" src="${escapeHtml(getAvatarUrl(big))}" alt="" referrerpolicy="no-referrer"/>
        <div class="gw-spotlight-name">${escapeHtml(displayName(big))}</div>
        <div class="gw-spotlight-sub">
          <span>${escapeHtml(big.winChance ?? "")}% chance</span>
          ${drawnTs ? `<span>· ${escapeHtml(drawnTs)}</span>` : ""}
        </div>
      </div>
    `;
    if (winList) {
      winList.innerHTML = winners.slice(1).map((w) => `
        <div class="giveaway-reveal-winner-slot">
          <img class="giveaway-list-avatar" src="${escapeHtml(getAvatarUrl(w))}" alt="" referrerpolicy="no-referrer"/>
          <div class="gw-slot-name">${escapeHtml(displayName(w))}</div>
          <div class="gw-slot-sub">${escapeHtml(w.winChance ?? "")}% chance</div>
        </div>
      `).join("");
    }
  };

  const renderHistory = (items) => {
    const el = $("gw-history-list");
    if (!el) return;
    if (!items.length) {
      el.innerHTML = `<div class="agp-empty">No previous draws.</div>`;
      return;
    }
    el.innerHTML = items.map((c) => {
      const w = c.winners?.[0];
      const drawnTs = c.drawnAt ? new Date(c.drawnAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "";
      return `<div class="gw-history-item">
        <div class="gw-history-head">
          <div class="gw-history-prize">${escapeHtml(c.prize || "Prize")}</div>
          <div class="gw-history-date">${escapeHtml(drawnTs)}</div>
        </div>
        <div class="gw-history-winner">
          ${w ? `<img class="giveaway-list-avatar" src="${escapeHtml(getAvatarUrl(w))}" alt="" referrerpolicy="no-referrer"/><span>${escapeHtml(displayName(w))}</span>` : `<span style="color:#9aa">No winner</span>`}
        </div>
        <div class="gw-history-sub">${escapeHtml(c.title || "")} · ${c.entryCount || 0} entries</div>
      </div>`;
    }).join("");
  };

  // ========== Modal image ==========
  const openImageModal = (url) => {
    if (!url) return;
    const modal = $("gw-image-modal");
    const img = $("gw-image-modal-img");
    if (!modal || !img) return;
    img.src = url;
    if (typeof window.openAnimatedModal === "function") window.openAnimatedModal(modal);
    else modal.classList.add("active");
    modal.classList.add("active");
  };
  const closeImageModal = () => {
    const modal = $("gw-image-modal");
    if (!modal) return;
    if (typeof window.closeAnimatedModal === "function") window.closeAnimatedModal(modal);
    else modal.classList.remove("active");
  };

  // ========== Dropzone & file ==========
  const setSelectedImage = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showFeedback("Image is too large. Max 10MB.", "error");
      return;
    }
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      showFeedback("Unsupported image format. Use PNG, JPG, WEBP or GIF.", "error");
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      selectedFileDataUri = String(reader.result || "");
      const prev = $("gw-preview-img");
      if (prev) {
        prev.src = selectedFileDataUri;
        prev.hidden = false;
      }
      const dz = $("gw-dropzone-text");
      if (dz) dz.innerHTML = `<div class="gw-dropzone-done">✅ ${escapeHtml(file.name)} · ${Math.round(file.size/1024)} KB</div>`;
      $("gw-submit-btn").disabled = false;
    };
    reader.readAsDataURL(file);
  };

  const clearForm = () => {
    selectedFile = null;
    selectedFileDataUri = null;
    const fileInput = $("gw-file-input");
    if (fileInput) fileInput.value = "";
    const prev = $("gw-preview-img");
    if (prev) { prev.hidden = true; prev.src = ""; }
    const dz = $("gw-dropzone-text");
    if (dz) dz.innerHTML = `Click or drag your screenshot here<br /><span>PNG · JPG · WEBP · max 10MB</span>`;
    const note = $("gw-note-input");
    if (note) note.value = "";
    $("gw-submit-btn").disabled = true;
  };

  const attachDropzone = () => {
    const dz = $("gw-dropzone");
    const fileInput = $("gw-file-input");
    if (!dz || !fileInput) return;
    dz.addEventListener("click", () => fileInput.click());
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("is-dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("is-dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("is-dragover");
      const f = e.dataTransfer?.files?.[0];
      if (f) setSelectedImage(f);
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) setSelectedImage(f);
    });
  };

  // ========== API wrappers ==========
  const runSetPhase = async (phase) => {
    try {
      const res = await fetch("/api/admin/deposit-giveaway/phase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ phase }),
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:"HTTP error"}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      showFeedback("Giveaway phase updated.", "ok");
      await loadOverview();
    } catch (err) {
      showFeedback(err.message || "Failed to update phase.", "error");
    }
  };

  const runDrawWinners = async () => {
    if (!confirm("Draw winners now? Approved entries will be randomized.")) return;
    try {
      const res = await fetch("/api/admin/deposit-giveaway/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: "{}",
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:"HTTP error"}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.status === "no_entries") {
        showFeedback("No approved entries to draw from.", "error");
        return;
      }
      const winners = data.winners || [];
      const key = (data.campaign?.id || "") + "::" + winners.map((w)=>w.discordId).join(",");
      if (lastWinnersDrawnKey !== key) {
        lastWinnersDrawnKey = key;
        runConfetti();
      }
      showFeedback(`Draw complete. ${winners.length} winner(s).`, "ok");
      await loadOverview();
    } catch (err) {
      showFeedback(err.message || "Failed to draw winners.", "error");
    }
  };

  const runReset = async () => {
    if (!confirm("Reset the active giveaway? All entries + winners will be wiped.")) return;
    try {
      const res = await fetch("/api/admin/deposit-giveaway/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: "{}",
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:"HTTP error"}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      showFeedback("Giveaway reset. Ready to start again.", "ok");
      await loadOverview();
    } catch (err) {
      showFeedback(err.message || "Failed to reset.", "error");
    }
  };

  const runReview = async (entryId, status) => {
    if (!entryId) return;
    try {
      const res = await fetch("/api/admin/deposit-giveaway/entry/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ entryId, status }),
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:"HTTP error"}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      showFeedback(status === "approved" ? "Entry approved." : "Entry rejected.", "ok");
      await loadOverview();
    } catch (err) {
      showFeedback(err.message || "Failed to review.", "error");
    }
  };

  const runCreate = async () => {
    const title = $("gw-create-title")?.value;
    const prize = $("gw-create-prize")?.value;
    const winnersCount = $("gw-create-winners")?.value;
    const minDepositAmount = $("gw-create-min")?.value;
    const minDepositCurrency = $("gw-create-cur")?.value;
    const subtitle = $("gw-create-sub")?.value;
    if (!confirm("Create and START new giveaway now? This will go LIVE immediately so users can enter.")) return;
    try {
      const res = await fetch("/api/admin/deposit-giveaway/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ title, prize, winnersCount, minDepositAmount, minDepositCurrency, subtitle, autoStart: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:"HTTP error"}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      showFeedback("🎉 Giveaway created and LIVE! Users can submit entries now.", "ok");
      await loadOverview();
      $("gw-admin-create-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      showFeedback(err.message || "Failed to create giveaway.", "error");
    }
  };

  const runSubmitEntry = async (e) => {
    e.preventDefault();
    if (!selectedFileDataUri) return;
    const submitBtn = $("gw-submit-btn");
    const note = ($("gw-note-input")?.value || "").slice(0, 500);
    const status = $("gw-form-status");
    try {
      submitBtn.disabled = true;
      if (status) status.textContent = "📤 Uploading screenshot…";
      const upRes = await fetch("/api/deposit-giveaway/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ imageData: selectedFileDataUri, note }),
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(()=>({error:"Upload failed"}));
        throw new Error(err.error || "Upload failed");
      }
      const upJson = await upRes.json();
      if (status) status.textContent = "📝 Submitting entry…";
      const res = await fetch("/api/deposit-giveaway/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ imageUrl: upJson.imageUrl, note }),
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({error:"Submit failed"}));
        throw new Error(err.error || "Submit failed");
      }
      showFeedback("✅ Entry submitted! Admin will review it shortly.", "ok");
      if (status) status.textContent = "";
      clearForm();
      await loadOverview();
    } catch (err) {
      if (status) status.textContent = "";
      showFeedback(err.message || "Submission failed.", "error");
      submitBtn.disabled = !selectedFileDataUri;
    }
  };

  // ========== Init ==========
  document.addEventListener("DOMContentLoaded", () => {
    attachDropzone();

    const form = $("gw-entry-form");
    if (form) form.addEventListener("submit", runSubmitEntry);

    $("gw-create-btn")?.addEventListener("click", runCreate);
    $("gw-reset-btn")?.addEventListener("click", runReset);

    $("gw-image-close")?.addEventListener("click", closeImageModal);
    const imgModal = $("gw-image-modal");
    imgModal?.addEventListener("click", (e) => { if (e.target === imgModal) closeImageModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeImageModal(); });

    const scheduledOverviewRefresh = () => {
      setTimeout(() => loadOverview(), 800);
      setTimeout(() => loadOverview(), 2500);
    };

    window.addEventListener("ag:auth-changed", () => {
      loadOverview().catch(() => {});
      scheduledOverviewRefresh();
    });

    loadOverview();
    scheduledOverviewRefresh();
    if (gwRefreshTimer) clearInterval(gwRefreshTimer);
    gwRefreshTimer = setInterval(loadOverview, 15000);
  });
})();
