(() => {
  const ag = window.__ag || {};
  const STORE_PACKAGES = ag.STORE_PACKAGES || Object.freeze({
    basic:  { id: "basic",  name: "Unlock $10",  usdOut: 10,  usdBaseOut: 10,  agCost: 10000,  agCostNoBonus: 10000,  bonusPercent: 0,  popular: false, tier: 1, cashPerAg: 0.001  },
    value:  { id: "value",  name: "Unlock $22",  usdOut: 22,  usdBaseOut: 20,  agCost: 20000,  agCostNoBonus: 22000,  bonusPercent: 10, popular: false, tier: 2, cashPerAg: 0.0011 },
    pro:    { id: "pro",    name: "Unlock $60",  usdOut: 60,  usdBaseOut: 50,  agCost: 50000,  agCostNoBonus: 60000,  bonusPercent: 20, popular: false, tier: 3, cashPerAg: 0.0012 },
    whale:  { id: "whale",  name: "Unlock $150", usdOut: 150, usdBaseOut: 100, agCost: 100000, agCostNoBonus: 150000, bonusPercent: 50, popular: true,  tier: 4, cashPerAg: 0.0015 },
    legend: { id: "legend", name: "Unlock $400", usdOut: 400, usdBaseOut: 250, agCost: 250000, agCostNoBonus: 400000, bonusPercent: 60, popular: false, tier: 5, cashPerAg: 0.0016 },
  });

  const fmtNum = ag.formatNumber || ((n) => Number(n || 0).toLocaleString("en-US"));
  const fmtUsd = ag.formatUsd || ((n) => `$${Number(n || 0).toFixed(2)}`);
  const getCurBalance = () => {
    try {
      if (typeof window.__ag?.getCurrentProfile === "function") {
        const p = window.__ag.getCurrentProfile();
        if (p && typeof p.points === "number") return p.points;
      }
      if (typeof window.loadStoredProfile === "function") {
        const p = window.loadStoredProfile();
        if (p && typeof p.points === "number") return p.points;
      }
    } catch {}
    return 0;
  };

  let selectedPackage = null;
  let isBuying = false;

  const openAnimatedModalCompat = (modal) => {
    if (!modal) return;
    if (typeof window.openAnimatedModal === "function") {
      window.openAnimatedModal(modal);
      return;
    }
    modal.style.display = "flex";
    requestAnimationFrame(() => {
      modal.classList.add("is-visible");
      modal.setAttribute("aria-hidden", "false");
    });
  };

  const closeAnimatedModalCompat = (modal) => {
    if (!modal) return;
    if (typeof window.closeAnimatedModal === "function") {
      window.closeAnimatedModal(modal);
      return;
    }
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    setTimeout(() => { modal.style.display = "none"; }, 200);
  };

  const openWalletAfterRedemption = () => {
    try {
      const walletBtn = document.getElementById("wallet-btn") || document.querySelector(".top-wallet-btn, [data-open-wallet]");
      if (walletBtn) {
        walletBtn.click();
        return;
      }
      const walletModal = document.getElementById("wallet-modal");
      if (walletModal && typeof window.openAnimatedModal === "function") {
        window.openAnimatedModal(walletModal);
      }
    } catch (err) {
      console.warn("Could not open wallet after redemption:", err);
    }
  };

  const renderConfirmBody = (modal, pkg) => {
    const confirmBody = modal.querySelector("#store-confirm-body");
    const successBody = modal.querySelector("#store-success-body");
    const actions = modal.querySelector("#store-confirm-actions");
    const confirmContent = modal.querySelector("#store-confirm-content");
    const confirmBuyBtn = modal.querySelector("#store-confirm-buy-btn");
    const balance = getCurBalance();
    const notEnough = typeof balance === "number" && balance < pkg.agCost;

    if (successBody) successBody.style.display = "none";
    if (confirmBody) confirmBody.style.display = "";
    if (actions) actions.style.display = "flex";

    if (confirmContent && pkg) {
      const bonusLine = pkg.bonusPercent > 0
        ? `<div class="scb-row scb-row--bonus">
             <span class="scb-label">Bonus cash</span>
             <span class="scb-value scb-value--bonus">+${pkg.bonusPercent}% · ${fmtUsd((pkg.usdOut - pkg.usdBaseOut))}</span>
           </div>`
        : "";
      const notEnoughWarn = notEnough
        ? `<div class="scb-insufficient" style="margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,80,80,0.25);background:rgba(255,80,80,0.06);color:#ff9b9b;font-size:13px;">
             ⚠️ Not enough Coins right now. Need <b>${fmtNum(pkg.agCost)} AG</b>, you have <b>${fmtNum(balance)} AG</b>. Earn more Coins in the Live Stream, Daily Login or by playing games.
           </div>`
        : "";
      confirmContent.innerHTML = `
        <div class="store-confirm-body-card">
          <div class="scb-col scb-col--left">
            <div class="scb-row">
              <span class="scb-label">Package</span>
              <span class="scb-value">${pkg.name}</span>
            </div>
            <div class="scb-row">
              <span class="scb-label">Coins spent</span>
              <span class="scb-value scb-value--muted">-${fmtNum(pkg.agCost)} AG</span>
            </div>
            ${bonusLine}
            <div class="scb-row scb-row--total-ag">
              <span class="scb-label">New Coin balance</span>
              <span class="scb-value">${fmtNum(Math.max(0, balance - pkg.agCost))} AG</span>
            </div>
          </div>
          <div class="scb-col scb-col--right">
            <div class="scb-row">
              <span class="scb-label">Base cash value</span>
              <span class="scb-value">${fmtUsd(pkg.usdBaseOut)}</span>
            </div>
            <div class="scb-row">
              <span class="scb-label">Bonus value</span>
              <span class="scb-value scb-value--gold">+ ${fmtUsd(pkg.usdOut - pkg.usdBaseOut)}</span>
            </div>
            <div class="scb-row scb-row--grand-total">
              <span class="scb-label">Unlocks</span>
              <span class="scb-value scb-value--grand scb-value--gold">${fmtUsd(pkg.usdOut)}</span>
            </div>
          </div>
        </div>
        ${notEnoughWarn}
      `;
    }

    if (confirmBuyBtn && pkg) {
      confirmBuyBtn.disabled = Boolean(notEnough) || false;
      confirmBuyBtn.textContent = notEnough ? `NEED ${fmtNum(pkg.agCost)} AG MORE` : `CONFIRM & UNLOCK ${fmtUsd(pkg.usdOut)}`;
      confirmBuyBtn.dataset.packageId = pkg.id;
    }
  };

  const renderSuccessBody = (modal, pkg, payload) => {
    const confirmBody = modal.querySelector("#store-confirm-body");
    const successBody = modal.querySelector("#store-success-body");
    const actions = modal.querySelector("#store-confirm-actions");
    const summary = modal.querySelector("#store-success-summary");

    if (confirmBody) confirmBody.style.display = "none";
    if (actions) actions.style.display = "none";
    if (successBody) successBody.style.display = "";

    if (summary && pkg && payload) {
      const deductAg = payload.deductedAg || pkg.agCost;
      const addedCash = payload.addedCash || pkg.usdOut;
      const prevAg = typeof payload.previousAg === "number" ? payload.previousAg : 0;
      const newAg = typeof payload.newAg === "number" ? payload.newAg : Math.max(0, prevAg - deductAg);
      const prevCash = typeof payload.previousCashBalance === "number" ? payload.previousCashBalance : 0;
      const newCash = typeof payload.newCashBalance === "number" ? payload.newCashBalance : (prevCash + addedCash);
      const bonusLine = pkg.bonusPercent > 0
        ? `<div class="sss-row"><span>Bonus cash unlocked</span><span class="sss-gold">+${pkg.bonusPercent}% · ${fmtUsd(pkg.usdOut - pkg.usdBaseOut)}</span></div>`
        : "";
      summary.innerHTML = `
        <div class="sss-row"><span>Package</span><span>${pkg.name}</span></div>
        <div class="sss-row"><span>Coins deducted</span><span class="sss-mute">- ${fmtNum(deductAg)} AG</span></div>
        ${bonusLine}
        <div class="sss-row sss-row--add"><span>Cash added to wallet</span><span class="sss-gold sss-big">+ ${fmtUsd(addedCash)}</span></div>
        <div class="sss-row"><span>Previous cash balance</span><span>${fmtUsd(prevCash)}</span></div>
        <div class="sss-row sss-row--newbal"><span>New cash balance</span><span class="sss-gold sss-big">${fmtUsd(newCash)}</span></div>
        <div class="sss-row"><span>Coin balance after</span><span>${fmtNum(newAg)} AG</span></div>
      `;
    }
  };

  const handleBuyButtonClick = (e) => {
    const btn = e.target.closest("[data-buy-package]");
    if (!btn || isBuying) return;
    const card = btn.closest(".store-card") || btn;
    const pkgId = String(card.dataset.packageId || btn.dataset.packageId || "").trim().toLowerCase();
    const pkg = STORE_PACKAGES[pkgId];
    if (!pkg) {
      alert("Sorry, this redemption package isn't available right now.");
      return;
    }

    if (typeof ag.buyAgPointsPackage !== "function" && typeof window.__ag?.buyAgPointsPackage !== "function") {
      alert("Redemption checkout is not available. Please refresh the page and try again.");
      return;
    }

    if (typeof window.hasActiveSession === "function" && !window.hasActiveSession()) {
      if (typeof window.openLoginModal === "function") {
        window.openLoginModal();
      } else {
        alert("Please log in with Discord to unlock real cash.");
      }
      return;
    }

    selectedPackage = pkg;
    const modal = document.getElementById("store-confirm-modal");
    if (!modal) return;
    renderConfirmBody(modal, pkg);
    openAnimatedModalCompat(modal);
  };

  const handleConfirmBuy = async () => {
    if (isBuying || !selectedPackage) return;
    const pkg = selectedPackage;
    const modal = document.getElementById("store-confirm-modal");
    const confirmBuyBtn = modal ? modal.querySelector("#store-confirm-buy-btn") : null;

    isBuying = true;
    if (confirmBuyBtn) {
      confirmBuyBtn.disabled = true;
      confirmBuyBtn.dataset.originalText = confirmBuyBtn.textContent;
      confirmBuyBtn.textContent = "UNLOCKING CASH...";
    }

    try {
      const payload = typeof ag.buyAgPointsPackage === "function"
        ? await ag.buyAgPointsPackage(pkg.id, { requireSessionFirst: true, showToasts: true })
        : await window.__ag.buyAgPointsPackage(pkg.id, { requireSessionFirst: true, showToasts: true });

      if (modal) renderSuccessBody(modal, pkg, payload);
    } catch (err) {
      console.error("Store redemption failed:", err);
      isBuying = false;
      if (confirmBuyBtn) {
        confirmBuyBtn.disabled = false;
        if (confirmBuyBtn.dataset.originalText) {
          confirmBuyBtn.textContent = confirmBuyBtn.dataset.originalText;
        }
      }
      const msg = err?.message || "Something went wrong while unlocking your cash.";
      if (err?.insufficientCoins) {
        if (modal) renderConfirmBody(modal, pkg);
      } else {
        alert(msg);
      }
      return;
    } finally {
      isBuying = false;
      if (confirmBuyBtn) {
        confirmBuyBtn.disabled = false;
        if (confirmBuyBtn.dataset.originalText) {
          confirmBuyBtn.textContent = confirmBuyBtn.dataset.originalText;
        }
      }
    }
  };

  const handleCloseModal = (e, openWalletAfter = false) => {
    const modal = document.getElementById("store-confirm-modal");
    if (!modal) return;
    if (e.type === "click") {
      const target = e.target;
      const closeBtn = target.closest("[data-store-close]");
      if (!closeBtn && target !== modal) return;
      if (closeBtn) {
        const btnText = (closeBtn.textContent || "").trim().toUpperCase();
        if (btnText.includes("OPEN WALLET") || btnText.includes("WITHDRAW")) {
          openWalletAfterRedemption();
        }
      }
    }
    if (e.type === "keydown" && e.key !== "Escape") return;
    closeAnimatedModalCompat(modal);
  };

  const init = () => {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-buy-package]")) {
        handleBuyButtonClick(e);
        return;
      }
      if (e.target.closest("#store-confirm-buy-btn")) {
        e.preventDefault();
        handleConfirmBuy();
        return;
      }
      if (e.target.closest("[data-store-close]") || e.target.id === "store-confirm-modal") {
        handleCloseModal(e);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.getElementById("store-confirm-modal");
        if (modal && modal.getAttribute("aria-hidden") === "false") {
          closeAnimatedModalCompat(modal);
        }
      }
    });

    const cards = document.querySelectorAll(".store-card");
    cards.forEach((card) => {
      let id = String(card.id || "").replace("package-", "").trim();
      if (!id && card.dataset.packageId) id = card.dataset.packageId;
      const pkg = STORE_PACKAGES[id];
      if (pkg) {
        if (!card.dataset.packageId) card.dataset.packageId = pkg.id;
        if (!card.dataset.agCost && pkg.agCost) card.dataset.agCost = String(pkg.agCost);
        if (!card.dataset.usdOut && pkg.usdOut) card.dataset.usdOut = String(pkg.usdOut);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
