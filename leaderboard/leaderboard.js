/* ============================================================
   LEADERBOARD.JS — AntonGambles / Gambid.gg WAGER RACE
   ============================================================
   - Använder /api/gambid/wager-race (server.js route)
   - Automatisk: source gambid-api → LIVE grön, mock → grå, fallback → gul
   - Auto refresh var 30:e sekund (matchar Gambids 30s edge cache)
   - Använder GAMBIDS egna formaterade strängar (wageredFormatted / prizeFormatted)
   - Empty-state om ännu inga spelare (viktigt per Gambid docs!)
   ============================================================ */

const REFRESH_MS = 30 * 1000;
let refreshTimer = null;
let countdownTimer = null;

/* ---------- Helpers ---------- */
function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).trim().slice(0, 2).toUpperCase();
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const fmtTimeAgo = (ts) => {
  const diff = Math.max(0, Date.now() - Number(ts || Date.now()));
  const s = Math.floor(diff / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

const fmtCountdownTo = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0)  return `${d}d ${h}h left`;
  if (h > 0)  return `${h}h ${m}m left`;
  return `${m}m left`;
};

const getCountdownParts = (iso) => {
  const diff = new Date(iso).getTime() - Date.now();
  const zero = { days: 0, hours: 0, mins: 0, secs: 0, active: false };
  if (!iso || diff <= 0) return zero;
  zero.active = true;
  zero.days = Math.floor(diff / 86400000);
  zero.hours = Math.floor((diff % 86400000) / 3600000);
  zero.mins = Math.floor((diff % 3600000) / 60000);
  zero.secs = Math.floor((diff % 60000) / 1000);
  return zero;
};
const pad2 = (n) => String(Math.max(0, Math.min(99, Number(n) | 0))).padStart(2, '0');

function updateCountdownUI(raceInfo) {
  const box = document.getElementById('lb-countdown');
  if (!box) return;
  const elD = document.getElementById('lbc-days');
  const elH = document.getElementById('lbc-hours');
  const elM = document.getElementById('lbc-mins');
  const elS = document.getElementById('lbc-secs');
  const elStatus = document.getElementById('lbc-status');
  const elStatusLabel = document.getElementById('lbc-status-label');
  const elTitle = document.getElementById('lbc-race-title');
  const elPrize = document.getElementById('lbc-prize');
  const elCount = document.getElementById('lbc-count');

  if (elPrize && raceInfo?.prizePoolFormatted) elPrize.textContent = raceInfo.prizePoolFormatted;
  if (elTitle && raceInfo?.name) elTitle.textContent = raceInfo.name;
  if (elCount) {
    const n = raceInfo?.leaderboardCount;
    elCount.textContent = typeof n === 'number' ? String(n) : '0';
  }

  const st = String(raceInfo?.status || 'active').toLowerCase();
  const statusLabel = STATUS_LABEL[st] || st.toUpperCase();
  const isLive = raceInfo?.source === 'gambid-api';
  const isWarn = raceInfo?.source === 'mock-fallback';

  if (elStatus) {
    elStatus.classList.remove('is-live', 'is-warn', 'is-mock');
    elStatus.classList.add(isLive ? 'is-live' : (isWarn ? 'is-warn' : 'is-mock'));
  }
  if (elStatusLabel) {
    const src = isLive ? 'LIVE' : (isWarn ? 'API DOWN' : 'MOCK');
    elStatusLabel.textContent = `${src} · ${statusLabel}`;
  }

  const target = st === 'active' ? raceInfo?.endsAt : (st === 'upcoming' ? raceInfo?.startsAt : null);
  const tick = () => {
    const p = getCountdownParts(target);
    if (elD) elD.textContent = pad2(p.days);
    if (elH) elH.textContent = pad2(p.hours);
    if (elM) elM.textContent = pad2(p.mins);
    if (elS) elS.textContent = pad2(p.secs);
  };
  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
}

const strip$ = (s) => String(s ?? "").replace(/^\$/, "").trim();

const current = {
  data: null,
  race: null,
};

/* ---------- Status & LIVE badges ---------- */
const STATUS_LABEL = Object.freeze({
  upcoming: "UPCOMING",
  active:   "ACTIVE",
  ended:    "FINAL",
});
const STATUS_CLASS = Object.freeze({
  upcoming: "is-warn",
  active:   "is-live",
  ended:    "is-mock",
});

function updateLiveBadge(raceInfo) {
  const metaLine = document.getElementById('lb-meta-line');
  const updateEl = document.getElementById('lb-update-time');

  const isLive = raceInfo?.source === 'gambid-api';

  const dot = isLive
    ? '<span class="lb-dot lb-dot--live"></span>'
    : (raceInfo?.source === 'mock-fallback'
      ? '<span class="lb-dot lb-dot--warn"></span>'
      : '');

  if (metaLine) {
    metaLine.innerHTML = `${dot}<span>Auto-refreshes every 30 seconds</span>`;
  }
  if (updateEl && raceInfo?.updatedAt) {
    updateEl.textContent = `Updated ${fmtTimeAgo(raceInfo.updatedAt)}`;
  } else if (updateEl) {
    updateEl.textContent = '';
  }
}

/* ---------- Transform Gambid-normaliserade players → UI format ---------- */
function transformPlayers(players = []) {
  return players.map(p => ({
    rank: p.rank,
    username: p.username,
    tag: p.handle || ('@' + String(p.username).toLowerCase()),
    wagered: Number(p.wageredUsd != null ? p.wageredUsd : 0),
    wageredStr: p.wageredFormatted || `$${Number(p.wageredUsd || 0).toLocaleString('en-US')}`,
    prizeUsd: Number(p.prizeUsd || 0),
    prizeStr: p.prizeFormatted || (Number(p.prizeUsd || 0) > 0 ? `$${Number(p.prizeUsd).toLocaleString('en-US')}` : null),
    initials: p.initials || getInitials(p.username),
    avatar: p.avatar || null,
    isYou: Boolean(p.isYou),
  }));
}

/* ---------- Fetch from our backend bridge ---------- */
async function fetchRaceData() {
  try {
    const res = await fetch('/api/gambid/wager-race', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('[leaderboard] Failed to fetch wager race, fallback local mock', err);
    return null;
  }
}

/* ---------- Rendering: Podium (top 3) ---------- */
function renderPodium(data) {
  const top = data.slice(0, 3);
  const positions = ['1', '2', '3'];
  positions.forEach((pos, idx) => {
    const p = top[idx];
    const rank = parseInt(pos, 10);
    const avatarEl = document.getElementById(`lb-avatar-${pos}`);
    const nameEl   = document.getElementById(`lb-name-${pos}`);
    const scoreEl  = document.getElementById(`lb-score-${pos}`);
    if (!avatarEl || !nameEl || !scoreEl) return;

    if (!p) {
      avatarEl.innerHTML = `<span class="lb-podium-initials">—</span>`;
      nameEl.textContent = '—';
      scoreEl.innerHTML =
        `<span class="lb-ps-label">Wagered</span>` +
        ` <span class="lb-ps-amount"><span class="lb-dollar-icon">$</span>0</span>`;
      const prizeEl = document.getElementById(`lb-prize-${pos}`);
      if (prizeEl) prizeEl.textContent = '';
      return;
    }

    const safeName = escapeHTML(p.username);
    if (p.avatar) {
      avatarEl.innerHTML =
        `<img src="${escapeHTML(p.avatar)}" alt="${safeName}" referrerpolicy="no-referrer" ` +
        `onerror="this.remove();const t=this.parentElement;if(t)t.innerHTML='<span class=&quot;lb-podium-initials${rank === 1 ? ' lb-podium-initials--gold' : ''}&quot;>${p.initials}</span>'"/>`;
    } else {
      avatarEl.innerHTML = `<span class="lb-podium-initials${rank === 1 ? ' lb-podium-initials--gold' : ''}">${p.initials}</span>`;
    }
    nameEl.textContent = p.username;
    const wageredRaw = strip$(p.wageredStr);
    scoreEl.innerHTML =
      `<span class="lb-ps-label">Wagered</span>` +
      ` <span class="lb-ps-amount"><span class="lb-dollar-icon">$</span>${wageredRaw}</span>`;

    let prizeEl = document.getElementById(`lb-prize-${pos}`);
    if (!prizeEl) {
      prizeEl = document.createElement('div');
      prizeEl.id = `lb-prize-${pos}`;
      prizeEl.className = 'lb-podium-prize';
      scoreEl.after(prizeEl);
    }
    if (p.prizeStr) prizeEl.textContent = `Wins ${p.prizeStr} prize`;
    else prizeEl.textContent = '';
  });
}

/* ---------- Rendering: List rows (from rank 4 onwards) ---------- */
let currentData = [];

function renderEmptyState(body) {
  if (!body) return;
  body.innerHTML = `
    <div class="lb-empty" style="padding:60px 24px;text-align:center;color:var(--text-3);font-family:&quot;Plus Jakarta Sans&quot;,sans-serif;">
      <div style="font-size:42px;margin-bottom:14px;">🎰</div>
      <h3 style="color:#fff;margin:0 0 6px;font-weight:800;">No entries yet</h3>
      <p style="margin:0 0 22px;opacity:0.85;font-size:14px;">Be the first on the board — join the race on Gambid.gg!</p>
      <a href="https://gambid.gg/promotions/antons-5k-wager-race?r=anton" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;padding:13px 24px;border-radius:14px;font-weight:800;text-decoration:none;color:#111;background:linear-gradient(135deg,#fcd34d,#f59e0b);box-shadow:0 10px 30px -12px rgba(245,158,11,0.55);">
        Join The Race →
      </a>
    </div>
  `;
}

function renderRows(data, start = 3) {
  const body = document.getElementById('lb-list-body');
  if (!body) return;
  body.innerHTML = '';
  if (!data.length) { renderEmptyState(body); return; }

  const rows = data.slice(start);
  rows.forEach((p, i) => {
    const rank = start + i + 1;
    const youCls = p.isYou ? ' is-you' : '';
    const top10Cls = rank <= 10 ? ' is-top10' : '';
    const wgrStr = strip$(p.wageredStr);
    const prizeStr = p.prizeStr;
    const prizeCls = prizeStr ? ' is-winner' : '';
    const safeName = escapeHTML(p.username);
    const safeTag  = escapeHTML(p.tag);

    const row = document.createElement('div');
    row.className = `lb-row${youCls}${top10Cls}`;

    let avatarContent;
    if (p.avatar) {
      avatarContent =
        `<div class="lb-player-avatar"><img src="${escapeHTML(p.avatar)}" alt="${safeName}" referrerpolicy="no-referrer" ` +
        `onerror="this.remove();const t=this.parentElement;if(t)t.textContent='${p.initials}'"/></div>`;
    } else {
      avatarContent = `<div class="lb-player-avatar">${p.initials}</div>`;
    }

    row.innerHTML = `
      <span class="lb-col-rank lb-rank">${rank}</span>
      <div class="lb-player">
        ${avatarContent}
        <div class="lb-player-meta">
          <span class="lb-player-name">${safeName}</span>
          <span class="lb-player-tag">${safeTag}</span>
        </div>
      </div>
      <div class="lb-wager">
        <span class="lb-wager-value">Wagered <span class="lb-wager-amount"><span class="lb-dollar-icon">$</span>${wgrStr}</span></span>
      </div>
      <div class="lb-prize-wrap">
        <span class="lb-prize${prizeCls}">${prizeStr ? `Prize ${prizeStr}` : 'No prize yet'}</span>
      </div>
    `;
    body.appendChild(row);
  });
}

/* ---------- Empty podium + rows when 0 players ---------- */
function renderEverythingEmpty() {
  renderPodium([]);
  renderRows([], 3);
}

/* ---------- Boot loader ---------- */
async function loadLeaderboard() {
  const payload = await fetchRaceData();
  let players = [];
  let raceInfo = null;

  if (payload && Array.isArray(payload.players)) {
    raceInfo = payload.race || null;
    players = transformPlayers(payload.players);
  }

  if (!raceInfo) {
    raceInfo = {
      id: 'antons-5k-wager-race',
      name: "Anton's $5,000 Wager Race",
      status: 'active',
      prizePoolFormatted: '$5,000',
      prizePoolUsd: 5000,
      updatedAt: Date.now(),
      source: 'mock',
    };
  }

  current.data = payload;
  current.race = raceInfo;
  currentData = players;

  if (!players.length) renderEverythingEmpty();
  else { renderPodium(players); renderRows(players, 3); }
  updateLiveBadge(raceInfo);
  updateCountdownUI(raceInfo);
}

/* ---------- Auto refresh every 30s (match Gambids cache) ---------- */
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    try { await loadLeaderboard(); } catch (e) { /* ignore – screen keeps old data */ }
  }, REFRESH_MS);
}

/* ---------- Boot on DOM ready ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadLeaderboard();
  startAutoRefresh();
});
