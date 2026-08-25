(() => {
  const MAX_LEVEL = 100;
  const COINS_PER_LEVEL = 100;

  const MILESTONES = [
    { level: 1, threshold: 0, perk: "Starting level. Welcome to the site.", badge: "I" },
    { level: 10, threshold: 900, perk: "Site flair + profile ring unlocked.", badge: "X" },
    { level: 25, threshold: 2400, perk: "+10% bonus on daily login rewards.", badge: "XXV" },
    { level: 50, threshold: 4900, perk: "Elite site status + custom name tint.", badge: "L" },
    { level: 100, threshold: 9900, perk: "MAX · Legend badge. Private invite to cash channel.", badge: "C" },
  ];

  const MILESTONE_SET = new Set(MILESTONES.map((m) => m.level));

  function coinsForLevel(lvl) {
    return (lvl - 1) * COINS_PER_LEVEL;
  }

  function getMyLevel() {
    try {
      const points = Number((window.currentProfile?.points) ?? 0);
      const stored = Number(localStorage.getItem("ag_points") || 0);
      const total = Math.max(points, stored);
      const level = Math.min(MAX_LEVEL, Math.floor(total / COINS_PER_LEVEL) + 1);
      const into = total - coinsForLevel(level);
      const pct = level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, (into / COINS_PER_LEVEL) * 100));
      const nextLevel = level >= MAX_LEVEL ? null : level + 1;
      return { total, level, into, pct, nextLevel };
    } catch (err) {
      return { total: 0, level: 1, into: 0, pct: 0, nextLevel: 2 };
    }
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function renderHero(me) {
    const num = document.getElementById("lvl-current-num");
    const points = document.getElementById("lvl-current-points");
    const max = document.getElementById("lvl-max-points");
    const prog = document.getElementById("lvl-current-progress");
    const next = document.getElementById("lvl-next-label");

    if (num) num.textContent = me.level;
    if (points) points.textContent = `${fmtNum(me.total)} Coins`;
    if (max) max.textContent = `${fmtNum(Math.max(0, coinsForLevel(MAX_LEVEL) - me.total))} Coins to MAX`;
    if (prog) {
      requestAnimationFrame(() => { prog.style.width = `${me.pct}%`; });
    }
    if (next) {
      next.textContent = me.nextLevel ? `LVL ${me.nextLevel}` : "MAX · Reached";
    }
  }

  function renderMilestones(me) {
    const wrap = document.getElementById("lvl-milestones");
    if (!wrap) return;
    wrap.innerHTML = MILESTONES.map((ms) => {
      const unlocked = me.total >= ms.threshold;
      const isMax = ms.level === MAX_LEVEL;
      const cls = [
        "lvl-ms-card",
        unlocked ? "unlocked" : "",
        isMax ? "is-max" : "",
      ].filter(Boolean).join(" ");
      const lockTag = unlocked ? "" : `<span class="lvl-ms-lock is-locked">Locked</span>`;
      return `
        <div class="${cls}">
          ${lockTag}
          <div class="lvl-ms-badge">${ms.badge}</div>
          <h3 class="lvl-ms-level">LVL ${ms.level}</h3>
          <div class="lvl-ms-threshold">
            <strong>${fmtNum(ms.threshold)}</strong> Coins required
          </div>
          <div class="lvl-ms-perk">${ms.perk}</div>
        </div>
      `;
    }).join("");
  }

  function renderGrid(me) {
    const wrap = document.getElementById("lvl-grid");
    if (!wrap) return;
    const cells = [];
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const threshold = coinsForLevel(lvl);
      const classes = ["lvl-cell"];
      if (lvl === me.level) classes.push("current");
      else if (lvl < me.level) classes.push("unlocked");
      if (MILESTONE_SET.has(lvl)) classes.push("milestone");

      const coinsText = `${fmtNum(threshold)}`;
      cells.push(`
        <div class="${classes.join(" ")}" title="LVL ${lvl} · ${fmtNum(threshold)} Coins">
          <div class="lvl-cell-num">${lvl}</div>
          <div class="lvl-cell-mini">${coinsText}</div>
        </div>
      `);
    }
    wrap.innerHTML = cells.join("");
  }

  function scrollToCurrent() {
    const current = document.querySelector(".lvl-cell.current");
    if (!current) return;
    try {
      current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } catch (_) { /* noop */ }
  }

  function refreshAll() {
    const me = getMyLevel();
    renderHero(me);
    renderMilestones(me);
    renderGrid(me);
    setTimeout(scrollToCurrent, 450);
  }

  document.addEventListener("DOMContentLoaded", refreshAll);
  window.addEventListener("load", () => setTimeout(refreshAll, 30), { once: true });
  window.addEventListener("agp:profile:changed", refreshAll);
  window.addEventListener("agp:coins:changed", refreshAll);
})();
