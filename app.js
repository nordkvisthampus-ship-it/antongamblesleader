const setupLogoFallback = () => {
  const img = document.querySelector("#siteLogoImg");
  if (!img) return;
  img.addEventListener("error", () => {
    img.src = "assets/logo-placeholder.svg";
  });
};

const __siteOrigin = (() => {
  const meta = document.querySelector('meta[name="ag-site-url"]');
  if (meta?.content) {
    try {
      const u = new URL(meta.content);
      return `${u.protocol}//${u.host}`;
    } catch (_) {}
  }
  return window.location.origin.replace(/\/$/, "");
})();

const DISCORD_CONFIG = {
  clientId: "1521498901792690226",
  redirectUri: `${__siteOrigin}/login-loading.html`,
  scope: "identify email guilds",
  inviteUrl: "https://discord.gg/t7hNWHX6GW",
};

console.info(
  "%c[AntonGambles OAuth] redirect_uri:",
  "color:#ffb547;font-weight:bold",
  DISCORD_CONFIG.redirectUri,
  "\n👉 Kopiera hela ovanstående URL till Discord Developer Portal → OAuth2 → General → Redirects"
);

const STREAM_CONFIG = {
  channels: ["thatsanton", "antongambles"],
  preferredChannel: "thatsanton",
  liveCheckIntervalMs: 60 * 1000,
};

const cleanIndexHtmlPath = (path = "") => String(path || "").replace(/\/index\.html(?=\/?$|[?#])/, "/");

const applyCleanUrl = () => {
  if (!/^https?:$/i.test(window.location.protocol)) return;
  const cleanPathname = cleanIndexHtmlPath(window.location.pathname);
  if (cleanPathname === window.location.pathname) return;
  const nextUrl = `${cleanPathname}${window.location.search}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
};

const getFriendlyUiErrorMessage = (error, fallback = "Something went wrong") => {
  const rawMessage = String(error?.message || error || "").trim();
  if (!rawMessage) return fallback;

  const normalized = rawMessage.toLowerCase();
  if (normalized.includes("invalid bonuskey") || normalized.includes("bonuskey is required")) {
    return "Bonus is unavailable right now";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "Connection issue, try again";
  }
  if (normalized.includes("session expired")) {
    return "Session expired, log in again";
  }
  if (normalized.includes("profile reset")) {
    return "Profile unavailable, log in again";
  }
  return rawMessage;
};

const AUTH_STORAGE_KEYS = {
  sessionToken: "ag_session_token",
  profile: "ag_profile",
};

const POST_LOGIN_REDIRECT_KEY = "ag_post_login_redirect";

let currentProfile = null;
let streamIsLive = false;
let streamAutoOpened = false;
let activeStreamChannel = STREAM_CONFIG.preferredChannel;
let leaderboardEntries = [];
let activityEntries = [];
let chatEntries = [];
let promoInfoModal = null;
let chatPollIntervalId = null;
let activeChatTipTarget = null;
let activeChatReplyTarget = null;
let chatUserLookupTimeoutId = null;
let chatUserLookupRequestId = 0;
let activeChatUserMenu = null;
let presenceHeartbeatInFlight = false;
const MODAL_TRANSITION_MS = 280;
const REWARD_HEARTBEAT_INTERVAL_MS = 10 * 1000;
const rewardHeartbeatAt = {
  "visit-duration": 0,
  "stream-watch": 0,
};
let modalBodyLockScrollY = 0;
const CHAT_STORAGE_KEY = "ag_chat_open";
const CHAT_UI_CONFIG = {
  fetchLimit: 100,
  pollIntervalMs: 5000,
};
const CHAT_DESKTOP_BREAKPOINT = 1180;
const MOBILE_NAV_BREAKPOINT = 760;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 30 * 1000;

const normalizePromoText = (value, fallback = "") => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || /^(undefined|null|nan)$/i.test(text)) {
    return fallback;
  }

  return text;
};

const escapeHtml = (value) =>
  normalizePromoText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const PROMO_INFO_META = {
  lollyspins: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Nolimit City", "Evolution", "BGaming"],
    providerCopy: "Strong slot-first lineup with a mix of bonus-heavy games, live casino staples and high-volatility titles.",
    url: "https://record.joinaff.com/_5u42qskdAnnsfFSrtPYmMmNd7ZgqdRLk/1/?pg=0",
    tag: "TOP PICK",
    logo: "assets/lollyspins-banner.png",
    displayName: "Lollyspins",
    intro: "Claim 550% up to €4,000 + 550 Free Spins as your welcome package. 10,000+ slots & live games, fast payouts, weekly cashback. Join Lollyspins now!",
    richInfo: {
      bonusPct: "550%", bonusMax: "€4,000", freeSpins: "550",
      wager: "x30", minDep: "€20", maxWd: "€20,000 per month", wdTime: "Up to 72h",
      crypto: true, support: true, established: "2026",
      licences: "Curaçao",
      languages: "English, Spanish, French, Portuguese, German, Dutch, Greek, Swedish, Italian, Romanian, Polish, Slovenian, Slovak, Serbian, Bulgarian, Finnish, Danish, Czech, Croatian, Latvian, Japanese, Indonesian, Norwegian, Hungarian",
      payments: "Bank Transfer, Interac, MasterCard, Neosurf, Neteller, Skrill, Visa, MiFinity, Apple Pay, Google Pay, Jeton, Rapid Transfer, Cryptocurrency"
    }
  },
  shakebet: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Evolution", "Nolimit City", "BGaming"],
    providerCopy: "Leans into modern bonus buys, harder-hitting slot content and a live layer that fits the crypto-style feel.",
    url: "https://record.shakepartners.com/_K-XrH2B4Yplhg6WO2I1rgWNd7ZgqdRLk/1/?pg=1",
    tag: "HIGH VALUE",
    logo: "assets/shakebet-banner.png",
    displayName: "ShakeBet",
    intro: "ShakeBet welcome offer with 300 free spins, rakeback, weekly cashback and a stacked VIP program. Modern crypto-first casino with live dealer tables.",
    richInfo: {
      bonusPct: "225%", bonusMax: "$2,500", freeSpins: "300",
      wager: "x35", minDep: "$20", maxWd: "$100,000 per week", wdTime: "Up to 24h (crypto)",
      crypto: true, support: true, established: "2025",
      licences: "Curaçao",
      languages: "English, Spanish, French, German, Portuguese, Norwegian, Swedish, Finnish, Danish, Polish, Italian",
      payments: "Visa, Mastercard, Bitcoin, Ethereum, Litecoin, USDT, Dogecoin, Bitcoin Cash, Ripple, Stellar, Bank Transfer, Skrill, Neteller"
    }
  },
  duelbits: {
    providers: ["Pragmatic Play", "Evolution", "Hacksaw Gaming", "NetEnt", "Originals"],
    providerCopy: "Usually the appeal is the mix of slots, live tables and a sharper, more modern betting/originals vibe.",
    url: "https://record.dbpartners.io/_DAbYqxw7PMbUOsjNOfgKeWNd7ZgqdRLk/1/",
    tag: "FREE SPINS",
    logo: "assets/duelbits-banner.png",
    displayName: "Duelbits",
    intro: "Duelbits live with a massive free spins + cash bonus, casino originals, sportsbook and live dealer tables. Clean crypto-first lobby with instant withdrawals.",
    richInfo: {
      bonusPct: "100%", bonusMax: "$1,000", freeSpins: "200",
      wager: "x40", minDep: "$10", maxWd: "Unlimited", wdTime: "Instant",
      crypto: true, support: true, established: "2020",
      licences: "Curaçao",
      languages: "English, Spanish, Portuguese, German, French, Turkish, Polish, Russian, Japanese, Korean",
      payments: "Bitcoin, Ethereum, Litecoin, Dogecoin, Bitcoin Cash, USDT, USDC, Solana, Visa, Mastercard, Apple Pay, Google Pay"
    }
  },
  thunderpick: {
    providers: ["Pragmatic Play", "Evolution", "Originals", "Sportsbook", "Esports"],
    providerCopy: "More hybrid than pure casino-first, with casino providers backed by sportsbook and esports energy in the same ecosystem.",
    url: "https://go.thunder.partners/visit/?bta=37705&nci=5733&campaign=WELCOME",
    tag: "HYBRID",
    logo: "assets/thunderpick.png",
    displayName: "Thunderpick",
    intro: "Hybrid esports + casino powerhouse. 5,000+ slots, live tables, huge sportsbook/esports coverage and instant crypto payouts. Thunderpick welcome bonus live now.",
    richInfo: {
      bonusPct: "100%", bonusMax: "$500", freeSpins: "100",
      wager: "x30", minDep: "$20", maxWd: "$50,000 per month", wdTime: "2–12h (crypto)",
      crypto: true, support: true, established: "2017",
      licences: "Curaçao",
      languages: "English, Spanish, Portuguese, German, French, Turkish, Polish, Russian, Ukrainian, Vietnamese",
      payments: "Bitcoin, Ethereum, Litecoin, Ripple, Dogecoin, USDT, USDC, Bitcoin Cash, Tron, Skrill, Neteller, Visa, Mastercard"
    }
  },
  flush: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Nolimit City", "Evolution", "BGaming"],
    providerCopy: "Good fit if you want a modern slot-heavy mix with fast visuals, live support and plenty of high-risk sessions.",
    url: "https://flushlinks.com/d9wpjalf1",
    tag: "CRYPTO",
    logo: "assets/flush.png",
    displayName: "Flush",
    intro: "Modern slot-first casino with fast visuals, high volatility sessions, live casino support and instant crypto withdrawals. Clean lobby, plenty of bonus buys.",
    richInfo: {
      bonusPct: "150%", bonusMax: "$2,000", freeSpins: "200",
      wager: "x35", minDep: "$20", maxWd: "$20,000 per week", wdTime: "Instant (crypto)",
      crypto: true, support: true, established: "2024",
      licences: "Curaçao",
      languages: "English, Spanish, French, German, Portuguese, Swedish, Norwegian, Finnish, Polish, Italian",
      payments: "Bitcoin, Ethereum, USDT, Litecoin, Bitcoin Cash, Dogecoin, Monero, Visa, Mastercard, Bank Transfer"
    }
  },
  ivibet: {
    providers: ["Pragmatic Play", "Evolution", "Hacksaw Gaming", "Nolimit City", "BGaming"],
    providerCopy: "Feels more rounded than niche, with familiar slot studios and a live casino mix that covers the basics well.",
    url: "https://top.aglobally.com/redirect.aspx?pid=99420&lpid=683&bid=1478",
    tag: "ROUNDED",
    logo: "assets/ivibet.png",
    displayName: "Ivibet",
    intro: "Rounded all-round casino with familiar studios, solid live casino mix, welcome bonus package, sportsbook and FIAT + crypto payment options.",
    richInfo: {
      bonusPct: "135%", bonusMax: "€2,000", freeSpins: "170",
      wager: "x35", minDep: "€15", maxWd: "€10,000 per week", wdTime: "24–72h",
      crypto: true, support: true, established: "2022",
      licences: "Curaçao",
      languages: "English, German, French, Spanish, Portuguese, Italian, Polish, Russian, Turkish, Norwegian, Swedish, Finnish, Danish",
      payments: "Visa, Mastercard, Maestro, Bitcoin, Ethereum, Litecoin, USDT, Ripple, Skrill, Neteller, PaySafeCard, Rapid Transfer, Neosurf"
    }
  },
  ritzo: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Evolution", "BGaming", "Nolimit City"],
    providerCopy: "Built for players who want flashy slot content, recognizable bonus providers and a cleaner all-round lobby.",
    url: "https://balancer.ritzogo.com/m37d89efe",
    tag: "FLASHY",
    logo: "assets/ritzo-banner.png",
    displayName: "Ritzo",
    intro: "Flashy slot-first lineup with recognizable bonus providers, cleaner all-round lobby, VIP rewards, live dealer and instant payment options.",
    richInfo: {
      bonusPct: "200%", bonusMax: "$3,000", freeSpins: "300",
      wager: "x30", minDep: "$20", maxWd: "$25,000 per week", wdTime: "Instant (crypto)",
      crypto: true, support: true, established: "2025",
      licences: "Curaçao",
      languages: "English, German, Spanish, French, Portuguese, Italian, Norwegian, Swedish, Finnish, Greek, Polish",
      payments: "Visa, Mastercard, Bitcoin, Ethereum, Litecoin, USDT, Dogecoin, Bitcoin Cash, Skrill, Neteller, Trustly, Klarna"
    }
  },
  stakeprix: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Evolution", "BGaming", "Originals"],
    providerCopy: "No-wager focused crypto casino with referral bonuses, modern lobby visuals and high-variance slots.",
    url: "https://www.stakeprix.com/referral/bMIGoFn5a2hRxEX0",
    tag: "NO WAGER",
    logo: "assets/stakeprixbanner.png",
    displayName: "StakePrix",
    intro: "StakePrix zero-wager welcome bonus live now. Crypto-first casino with referral rewards, no wagering free spins, modern lobby visuals and high-volatility slots.",
    richInfo: {
      bonusPct: "200%", bonusMax: "€2,000", freeSpins: "100",
      wager: "x0", minDep: "€20", maxWd: "Unlimited", wdTime: "Instant (crypto)",
      crypto: true, support: true, established: "2025",
      licences: "Curaçao",
      languages: "English, Spanish, Portuguese, German, French, Norwegian, Swedish, Finnish, Danish, Polish",
      payments: "Bitcoin, Ethereum, Litecoin, USDT, USDC, Bitcoin Cash, Dogecoin, Tron, Solana, BNB, Visa, Mastercard"
    }
  },
  gambid: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Evolution", "Nolimit City", "BGaming"],
    providerCopy: "Curacao-licensed casino with exclusive offers, FIAT and crypto support, and a bonus-ready slot lineup.",
    url: "https://gambid.gg/?r=anton",
    tag: "EXCLUSIVE",
    logo: "assets/gambid.png",
    displayName: "Gambid.gg",
    intro: "AntonGambles Exclusive Gambid.gg bonus live now. 200% up to $3,000, unlimited withdrawals, AntonBack rakeback up to 10%, code ANTON. Fast withdrawals, exclusive offers.",
    richInfo: {
      bonusPct: "200%", bonusMax: "$3,000", freeSpins: "200",
      wager: "x35", minDep: "$20", maxWd: "Unlimited", wdTime: "Instant",
      crypto: true, support: true, established: "2024",
      licences: "Curaçao",
      languages: "English, German, Spanish, French, Portuguese, Italian, Norwegian, Swedish, Finnish, Dutch, Polish, Russian, Turkish, Japanese",
      payments: "Visa, Mastercard, Bitcoin, Ethereum, Litecoin, USDT, USDC, Dogecoin, Bitcoin Cash, Skrill, Neteller, Trustly, Klarna, Giropay, Sofort, Bank Transfer"
    }
  },
  nvcasino: {
    providers: ["Pragmatic Play", "Hacksaw Gaming", "Evolution", "Nolimit City", "BGaming"],
    providerCopy: "Solid all-round casino with familiar providers, welcome package, live casino layer and flexible FIAT + crypto payment options.",
    url: "https://nv.casino",
    tag: "ALL ROUND",
    logo: "assets/nvbanner.png",
    displayName: "NV Casino",
    intro: "NV Casino with welcome bonus package, 5,000+ slots, live dealer tables, sportsbook and flexible FIAT + crypto payment options with fast withdrawals.",
    richInfo: {
      bonusPct: "200%", bonusMax: "€2,000", freeSpins: "200",
      wager: "x35", minDep: "€20", maxWd: "€15,000 per month", wdTime: "Up to 48h",
      crypto: true, support: true, established: "2023",
      licences: "Curaçao",
      languages: "English, German, Spanish, French, Portuguese, Italian, Norwegian, Swedish, Finnish, Polish",
      payments: "Visa, Mastercard, Bitcoin, Ethereum, Litecoin, USDT, Skrill, Neteller, Trustly, Klarna, Bank Transfer"
    }
  },
  pubs: {
    providers: ["Pragmatic Play", "Evolution", "Hacksaw Gaming", "Nolimit City", "BGaming"],
    providerCopy: "Safe, trusted casino with crystal-clear bonus terms, instant payouts and a player-first approach to responsible gambling.",
    url: "https://record.affiliatedrinks.com/_lMtWuaUunJhZSuvhn4yj1mNd7ZgqdRLk/1/?pg=1",
    tag: "SAFE PLAY",
    logo: "assets/pubslogo.png",
    displayName: "Pubs.com",
    intro: "Pubs.com welcome offer: Double your first deposit up to 1,000 USDT. Safe Play, Clear Terms, Fast Payouts. Player-first casino with transparent bonuses and lightning-fast withdrawals.",
    richInfo: {
      bonusPct: "100%", bonusMax: "1,000 USDT", freeSpins: "0",
      wager: "x35", minDep: "20 USDT", maxWd: "Unlimited", wdTime: "Fast (crypto instant)",
      crypto: true, support: true, established: "2024",
      licences: "Curaçao",
      languages: "English, Spanish, French, German, Portuguese, Norwegian, Swedish, Finnish, Polish, Italian",
      payments: "Bitcoin, Ethereum, Litecoin, USDT, USDC, Visa, Mastercard, Bank Transfer, Skrill, Neteller"
    }
  },
};

const getPromoInfoMeta = (name) => {
  const key = normalizePromoText(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fallbackProviders = ["Pragmatic Play", "Evolution", "Hacksaw Gaming", "Nolimit City", "Live Casino"];

  return (
    PROMO_INFO_META[key] || {
      providers: fallbackProviders,
      providerCopy: "Provider lineups shift over time, but this style of casino usually focuses on a mix of modern slots, live casino and high-volatility studios.",
    }
  );
};

const getPromoCardName = (card) => {
  const ariaLabel = normalizePromoText(card?.getAttribute("aria-label"));
  const cleanedAria = ariaLabel.replace(/\s+bonus\s+card/i, "").trim();
  if (cleanedAria) return cleanedAria;

  const logoLabel = normalizePromoText(card?.querySelector(".promoLogo")?.getAttribute("aria-label"));
  if (logoLabel) return logoLabel;

  const imageAlt = normalizePromoText(card?.querySelector(".promoLogoImg")?.getAttribute("alt"));
  const cleanedAlt = imageAlt.replace(/\s+(banner|logo)$/i, "").trim();
  if (cleanedAlt) return cleanedAlt;

  return "Casino";
};

const getPromoCardFacts = (card) =>
  Array.from(card?.querySelectorAll(".promoFacts .fact") || [])
    .map((fact) => ({
      key: normalizePromoText(fact.querySelector(".factKey")?.textContent),
      value: normalizePromoText(fact.querySelector(".factVal")?.textContent),
    }))
    .filter((fact) => fact.key && fact.value);

const getPromoCardPayments = (card) =>
  Array.from(card?.querySelectorAll(".promoPays .payLogo") || [])
    .map((logo) => ({
      label: normalizePromoText(logo.getAttribute("alt")),
      src: normalizePromoText(logo.getAttribute("src")),
    }))
    .filter((payment) => payment.label || payment.src);

const getPromoCardSummary = (name, bonusText, facts, payments) => {
  const keyFacts = facts.slice(0, 3).map((fact) => `${fact.key.toLowerCase()} ${fact.value}`);
  const factSentence = keyFacts.length ? `${keyFacts.join(", ")}.` : "";
  const paymentLabels = payments.map((payment) => payment.label).filter(Boolean);
  const paymentSentence = paymentLabels.length ? ` Supports ${paymentLabels.join(", ")} payments.` : "";
  return `${name} is featured with ${bonusText}. ${factSentence}${paymentSentence} Always read the full bonus terms before claiming.`;
};
const applyModalBodyLock = () => {
  const isMobileViewport = window.innerWidth <= MOBILE_NAV_BREAKPOINT;
  modalBodyLockScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.dataset.modalLockScrollY = String(modalBodyLockScrollY);
  document.body.style.overflow = "hidden";
  if (isMobileViewport) {
    document.body.style.position = "fixed";
    document.body.style.top = `-${modalBodyLockScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }
};

const releaseModalBodyLock = () => {
  const lockedY = Number(document.body.dataset.modalLockScrollY || modalBodyLockScrollY || 0);
  const shouldRestoreScroll = document.body.style.position === "fixed";
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  delete document.body.dataset.modalLockScrollY;
  if (shouldRestoreScroll) {
    window.scrollTo(0, lockedY);
  }
};

const syncModalBodyLock = () => {
  if (document.querySelector(".modal-overlay.active")) {
    applyModalBodyLock();
  } else {
    releaseModalBodyLock();
  }
};

const openAnimatedModal = (modal) => {
  if (!modal) return;
  window.clearTimeout(modal.__closeTimer);
  applyModalBodyLock();
  window.requestAnimationFrame(() => {
    modal.classList.add("active");
  });
};

const closeAnimatedModal = (modal) => {
  if (!modal) return;
  modal.classList.remove("active");
  window.clearTimeout(modal.__closeTimer);
  modal.__closeTimer = window.setTimeout(() => {
    syncModalBodyLock();
  }, MODAL_TRANSITION_MS);
};

const CHAT_ANNOUNCE_PRESETS = {
  duelbits: {
    accent: "blue",
    kicker: "Free Spins",
    description: "Big Duelbits bonus live now. Clean up the free spins and claim while it is fresh.",
  },
  lollyspins: {
    accent: "gold",
    kicker: "Top Pick",
    description: "Anton top-pick bonus is live. One of the strongest featured claims on the page right now.",
  },
  shakebet: {
    accent: "green",
    kicker: "High Value",
    description: "Shakebet is live with a stacked bonus package. Good if you want a heavier claim.",
  },
  stakeprix: {
    accent: "emerald",
    kicker: "No Wager",
    description: "StakePrix is live. Zero-wager angle and crypto-first feel makes this one clean to claim.",
  },
  thunderpick: {
    accent: "violet",
    kicker: "Hybrid Pick",
    description: "Thunderpick is live now. Good if you want the casino bonus with that sharper esports vibe.",
  },
};

const getPromoStatCards = (bonusText, ratingCount, facts, paymentCount) => {
  const stats = [
    { label: "Rating", value: `${ratingCount}/5` },
    { label: "Offer", value: bonusText },
    ...facts.slice(0, 2).map((fact) => ({
      label: fact.key,
      value: fact.value,
    })),
    { label: "Payments", value: paymentCount > 0 ? `${paymentCount} methods` : "Check cashier" },
  ];

  return stats
    .map((stat) => ({
      label: normalizePromoText(stat.label, "Info"),
      value: normalizePromoText(stat.value, "N/A"),
    }))
    .filter((stat) => stat.label && stat.value)
    .slice(0, 4);
};

const normalizePromoLookupKey = (value = "") =>
  normalizePromoText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const getChatAnnouncementMeta = (entry = {}) => {
  const normalizedKey = normalizePromoLookupKey(entry.casinoKey || entry.casinoName);
  const preset = CHAT_ANNOUNCE_PRESETS[normalizedKey] || null;
  const promoCards = Array.from(document.querySelectorAll(".promoCard"));
  const matchedCard =
    promoCards.find((card) => normalizePromoLookupKey(getPromoCardName(card)) === normalizedKey) ||
    promoCards.find((card) => normalizePromoLookupKey(getPromoCardName(card)).includes(normalizedKey)) ||
    null;

  const name = normalizePromoText(entry.casinoName, matchedCard ? getPromoCardName(matchedCard) : "Casino");
  const bonusText = matchedCard
    ? normalizePromoText(matchedCard.querySelector(".promoBonusText")?.textContent, "Exclusive bonus live now")
    : "Exclusive bonus live now";
  const facts = matchedCard ? getPromoCardFacts(matchedCard).slice(0, 2) : [];
  const claimLink = matchedCard
    ? normalizePromoText(matchedCard.querySelector(".promoBtn")?.getAttribute("href"))
    : "";
  const footer = matchedCard
    ? normalizePromoText(matchedCard.querySelector(".promoFoot")?.textContent, "Terms apply")
    : "Terms apply";

  return {
    name,
    accent: preset?.accent || "gold",
    kicker: preset?.kicker || "Bonus Live",
    description:
      preset?.description || normalizePromoText(entry.content, `Claim the ${name} bonus now.`),
    bonusText,
    facts,
    claimLink,
    footer,
    cardLabel: matchedCard ? getPromoCardName(matchedCard) : name,
  };
};

const getPromoTrustItems = (licenseText, paymentCount, ratingCount) => [
  {
    label: "Licensed",
    value: normalizePromoText(licenseText, "Terms apply"),
  },
  {
    label: "Payments",
    value: paymentCount > 0 ? `${paymentCount} supported methods` : "Manual review",
  },
  {
    label: "Rating",
    value: `${ratingCount}/5 player rating`,
  },
];

const closePromoInfoModal = () => {
  if (!promoInfoModal) return;
  closeAnimatedModal(promoInfoModal);
};

const getPromoInfoModal = () => {
  if (promoInfoModal) return promoInfoModal;

  promoInfoModal = document.createElement("div");
  promoInfoModal.className = "modal-overlay promo-info-overlay";
  promoInfoModal.id = "promo-info-modal";
  promoInfoModal.innerHTML = `
    <div class="modal-content promo-info-content" role="dialog" aria-modal="true" aria-labelledby="promo-info-title">
      <button type="button" class="modal-close promo-info-close" aria-label="Close info box">&times;</button>
      <div id="promo-info-body"></div>
    </div>
  `;

  promoInfoModal.addEventListener("click", (event) => {
    if (event.target === promoInfoModal) {
      closePromoInfoModal();
    }
  });

  promoInfoModal.querySelector(".promo-info-close")?.addEventListener("click", closePromoInfoModal);
  document.body.appendChild(promoInfoModal);
  return promoInfoModal;
};

const openPromoInfoModal = (card) => {
  const modal = getPromoInfoModal();
  const body = modal.querySelector("#promo-info-body");
  if (!body || !card) return;

  const name = getPromoCardName(card);
  const bonusText = normalizePromoText(card.querySelector(".promoBonusText")?.textContent, "Exclusive offer");
  const facts = getPromoCardFacts(card);
  const payments = getPromoCardPayments(card);
  const claimLink = normalizePromoText(card.querySelector(".promoBtn")?.getAttribute("href"), "#");
  const logo = card.querySelector(".promoLogoImg");
  const logoSrc = normalizePromoText(logo?.getAttribute("src"));
  const logoAlt = normalizePromoText(logo?.getAttribute("alt"), `${name} logo`);
  const ratingCount = card.querySelectorAll(".promoStars .star").length || 5;
  const licenseText = normalizePromoText(card.querySelector(".promoFoot")?.textContent, "Terms apply");
  const screenSrc = getPromoScreenshot(card);
  const infoMeta = getPromoInfoMeta(name);
  const providerCards = Array.isArray(infoMeta.providers) && infoMeta.providers.length
    ? infoMeta.providers.map((provider) => normalizePromoText(provider)).filter(Boolean)
    : ["Live Casino", "Modern Slots"];
  const providerCopy = normalizePromoText(
    infoMeta.providerCopy,
    "Provider lineups can rotate, but this casino style usually mixes modern slots, live casino and high-volatility content."
  );
  const summary = normalizePromoText(getPromoCardSummary(name, bonusText, facts, payments), "Check the casino terms before claiming this offer.");
  const stats = getPromoStatCards(bonusText, ratingCount, facts, payments.length);
  const trustItems = getPromoTrustItems(licenseText, payments.length, ratingCount);
  const factCards = facts.length
    ? facts
    : [{ key: "Offer Status", value: "Details available on casino page" }];
  const paymentCards = payments.length
    ? payments
    : [{ label: "Casino cashier", src: "" }];

  body.innerHTML = `
    <div class="promo-info-shell">
      <div class="promo-info-hero">
        <div class="promo-info-head">
          <div class="promo-info-brand">
            <div class="promo-info-logo-wrap">
              ${logoSrc ? `<img class="promo-info-logo" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(logoAlt)}" />` : `<div class="promo-info-logo-fallback">${escapeHtml(name)}</div>`}
            </div>
            <div class="promo-info-head-copy">
              <div class="promo-info-kicker">Casino Info</div>
              <h2 id="promo-info-title" class="promo-info-title">${escapeHtml(name)}</h2>
              <div class="promo-info-license">${escapeHtml(licenseText)}</div>
            </div>
          </div>
          <div class="promo-info-badges">
            <span class="promo-info-badge">Featured Offer</span>
            <span class="promo-info-badge promo-info-badge-soft">${ratingCount} star rating</span>
          </div>
        </div>

        <div class="promo-info-offer-panel">
          <div class="promo-info-offer-label">Current Bonus</div>
          <div class="promo-info-offer-value">${escapeHtml(bonusText)}</div>
          <p class="promo-info-summary">${escapeHtml(summary)}</p>
        </div>

        <div class="promo-info-stats">
          ${stats
            .map(
              (stat) => `
                <article class="promo-info-stat">
                  <div class="promo-info-stat-label">${escapeHtml(stat.label)}</div>
                  <div class="promo-info-stat-value">${escapeHtml(stat.value)}</div>
                </article>
              `
            )
            .join("")}
        </div>
      </div>

      ${screenSrc ? `
        <div class="promo-screen-section">
          <div class="section-title promo-screen-title">
            <span>Site Preview</span>
            <span class="promo-screen-badge">Real screenshot</span>
          </div>
          <figure class="browser-mockup">
            <div class="browser-mockup-top">
              <div class="browser-dots">
                <span class="b-dot b-dot--red"></span>
                <span class="b-dot b-dot--amber"></span>
                <span class="b-dot b-dot--green"></span>
              </div>
              <div class="browser-bar">
                <span class="browser-lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <span class="browser-url">gambid.gg</span>
              </div>
            </div>
            <div class="browser-mockup-body">
              <img class="browser-mockup-img" src="${escapeHtml(screenSrc)}" alt="${escapeHtml(name)} casino preview screenshot" loading="lazy" />
            </div>
          </figure>
        </div>
      ` : ""}

      <div class="promo-info-main">
        <div class="promo-info-section promo-info-section-wide">
          <div class="section-title">Casino Info</div>
          <div class="promo-info-grid">
            ${factCards
              .map(
                (fact) => `
                  <div class="promo-info-item">
                    <div class="promo-info-item-label">${escapeHtml(fact.key)}</div>
                    <div class="promo-info-item-value">${escapeHtml(fact.value)}</div>
                  </div>
                `
              )
              .join("")}
            <div class="promo-info-item">
              <div class="promo-info-item-label">License</div>
              <div class="promo-info-item-value">${escapeHtml(licenseText)}</div>
            </div>
          </div>
        </div>

        <div class="promo-info-section">
          <div class="section-title">Payments</div>
          <div class="promo-info-payments">
            ${paymentCards
              .map(
                (payment) => `
                  <span class="promo-info-pay-chip">
                    ${
                      payment.src
                        ? `<img class="promo-info-pay-logo" src="${escapeHtml(payment.src)}" alt="${escapeHtml(
                            payment.label || "Payment method"
                          )}" />`
                        : ""
                    }
                    <span class="promo-info-pay-label">${escapeHtml(payment.label || "Payment method")}</span>
                  </span>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="promo-info-section">
          <div class="section-title">Game Providers</div>
          <p class="promo-info-section-copy">${escapeHtml(providerCopy)}</p>
          <div class="promo-info-provider-grid">
            ${providerCards
              .map(
                (provider) => `
                  <span class="promo-info-provider-chip">${escapeHtml(provider)}</span>
                `
              )
              .join("")}
          </div>
        </div>

        <div class="promo-info-section">
          <div class="section-title">Why It Stands Out</div>
          <div class="promo-info-trust-list">
            ${trustItems
              .map(
                (item) => `
                  <div class="promo-info-trust-item">
                    <div class="promo-info-trust-label">${escapeHtml(item.label)}</div>
                    <div class="promo-info-trust-value">${escapeHtml(item.value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </div>

      <div class="promo-info-actions">
        <button type="button" class="profile-secondary-btn promo-info-secondary">Close</button>
        <a class="promo-info-primary" href="${escapeHtml(claimLink)}" target="_blank" rel="noopener noreferrer">Claim Bonus</a>
      </div>
    </div>
  `;

  body.querySelector(".promo-info-secondary")?.addEventListener("click", closePromoInfoModal);
  openAnimatedModal(modal);
};

const focusPromoCardByName = (casinoName = "") => {
  const normalizedTarget = normalizePromoLookupKey(casinoName);
  if (!normalizedTarget) return false;

  const promoCards = Array.from(document.querySelectorAll(".promoCard"));
  const targetCard =
    promoCards.find((card) => normalizePromoLookupKey(getPromoCardName(card)) === normalizedTarget) ||
    promoCards.find((card) => normalizePromoLookupKey(getPromoCardName(card)).includes(normalizedTarget)) ||
    null;

  if (!targetCard) return false;

  targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
  targetCard.classList.add("is-chat-announce-focus");
  window.setTimeout(() => targetCard.classList.remove("is-chat-announce-focus"), 2200);
  return true;
};

const PROMO_SCREENSHOT_MAP = Object.freeze({
  gambid: "assets/gscreen.png",
  duelbits: "assets/duelbitsscreen.png",
  flush: "assets/flushscreen.png",
  ivibet: "assets/ivibetscreen.png",
  lollyspins: "assets/lollyscreen.png",
  ritzo: "assets/ritzoscreen.png",
  shakebet: "assets/shakescreen.png",
  stakeprix: "assets/stakeprixscreen.png",
  thunderpick: "assets/thunderscreen.png",
  pubs: "assets/pubsscreen.png",
});

const getPromoScreenshot = (providerOrCard) => {
  if (!providerOrCard) return null;
  const key = typeof providerOrCard === "string"
    ? normalizePromoLookupKey(providerOrCard)
    : normalizePromoLookupKey(providerOrCard.getAttribute("data-provider") || getPromoCardName(providerOrCard));
  return PROMO_SCREENSHOT_MAP[key] || null;
};

const setupPromoInfoBoxes = () => {
  const promoCards = document.querySelectorAll(".promoCard");
  if (promoCards.length === 0) return;

  promoCards.forEach((card) => {
    const promoTop = card.querySelector(".promoTop");
    if (!promoTop || promoTop.querySelector(".promoInfoBtn")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "promoInfoBtn";
    button.setAttribute("aria-label", `Open info box for ${getPromoCardName(card)}`);
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"></circle>
        <path d="M12 10.2v5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        <circle cx="12" cy="7.5" r="1.1" fill="currentColor"></circle>
      </svg>
      <span>Info</span>
    `;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPromoInfoModal(card);
    });

    promoTop.appendChild(button);
  });
};

const clearAuthState = () => {
  localStorage.removeItem("discord_auth_code");
  localStorage.removeItem("discord_logged_in");
  localStorage.removeItem("discord_user");
  localStorage.removeItem("discord_guilds");
  localStorage.removeItem("ag_points");
  sessionStorage.removeItem("discord_state");
  sessionStorage.removeItem("discord_nonce");
  clearSessionToken();
  setCurrentProfile(null);
  leaderboardEntries = [];
  activityEntries = [];
};

const getSessionToken = () => localStorage.getItem(AUTH_STORAGE_KEYS.sessionToken);

const setSessionToken = (token) => {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.sessionToken, token);
  }
};

const clearSessionToken = () => {
  localStorage.removeItem(AUTH_STORAGE_KEYS.sessionToken);
};

const persistDiscordUiUser = (profile) => {
  if (!profile?.discordId) return;

  let existingUser = null;
  try {
    const raw = localStorage.getItem("discord_user");
    existingUser = raw ? JSON.parse(raw) : null;
  } catch {
    existingUser = null;
  }

  const uiUser = {
    ...(existingUser && typeof existingUser === "object" ? existingUser : {}),
    id: profile.discordId,
    username: profile.username || existingUser?.username || "user",
    global_name: profile.globalName || existingUser?.global_name || profile.username || "user",
    avatar: profile.avatar || existingUser?.avatar || null,
  };

  localStorage.setItem("discord_user", JSON.stringify(uiUser));
  localStorage.setItem("discord_logged_in", "true");
};

const setCurrentProfile = (profile) => {
  currentProfile = profile || null;

  if (profile) {
    localStorage.setItem(AUTH_STORAGE_KEYS.profile, JSON.stringify(profile));
    persistDiscordUiUser(profile);
    if (typeof profile.points === "number") {
      localStorage.setItem("ag_points", profile.points.toString());
    }
    const existingPrompt = document.querySelector(".wallet-guest-popover");
    const walletCombo = document.getElementById("wallet-btn");
    if (existingPrompt) existingPrompt.remove();
    if (walletCombo) {
      walletCombo.classList.remove("is-open");
      walletCombo.setAttribute("aria-expanded", "false");
    }
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEYS.profile);
  }

  try {
    window.dispatchEvent(new CustomEvent("ag:auth-changed", { detail: { profile: currentProfile || null } }));
  } catch {}

  if (typeof updateLoginButton === "function") {
    try {
      updateLoginButton();
    } catch (_) {}
  }
  if (typeof updateTopWalletDisplay === "function") {
    try { updateTopWalletDisplay(profile); } catch (_) {}
  }
};

const loadStoredProfile = () => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEYS.profile);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getStoredDiscordUser = () => {
  const raw = localStorage.getItem("discord_user");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getUiUser = () => {
  const discordUser = getStoredDiscordUser();
  if (discordUser) {
    return discordUser;
  }

  const profile = currentProfile || loadStoredProfile();
  if (!profile) {
    return null;
  }

  return {
    id: profile.discordId,
    username: profile.username,
    global_name: profile.globalName,
    avatar: profile.avatar,
  };
};

const getAuthHeaders = () => {
  const token = getSessionToken();
  return token
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : null;
};

const hasActiveSession = () => {
  const token = getSessionToken();
  const profile = currentProfile || loadStoredProfile();
  if (token && profile) return true;
  if (profile && (profile.discordId || profile.id)) {
    const storedAgPoints = localStorage.getItem("ag_points");
    const hasPoints = typeof profile.points === "number" || storedAgPoints;
    if (hasPoints) return true;
  }
  return false;
};

const generateState = () => {
  const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem("discord_state", state);
  return state;
};

const generateNonce = () => {
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem("discord_nonce", nonce);
  return nonce;
};

const storePostLoginRedirect = () => {
  const currentPath = `${cleanIndexHtmlPath(window.location.pathname)}${window.location.search}${window.location.hash}`;
  const safePath = currentPath && currentPath !== "/login-loading.html" ? currentPath : "/";
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safePath);
};

const handleDiscordLogin = () => {
  const state = generateState();
  const nonce = generateNonce();
  storePostLoginRedirect();
  
  const params = new URLSearchParams({
    client_id: DISCORD_CONFIG.clientId,
    redirect_uri: DISCORD_CONFIG.redirectUri,
    response_type: "code",
    scope: DISCORD_CONFIG.scope,
    state: state,
    nonce: nonce,
    prompt: "consent",
  });
  
  window.location.href = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
};

const handleDiscordCallback = async () => {
  if (window.location.pathname.endsWith("/login-loading.html")) {
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const error = urlParams.get("error");

  if (code || error) {
    const loadingUrl = `${window.location.origin}/login-loading.html${window.location.search}`;
    window.location.replace(loadingUrl);
    return;
  }

  if (!code) {
    const uiUser = getUiUser();
    if (uiUser && hasActiveSession()) {
      updateLoginButton();
      showUserProfile(uiUser);
    }
    return;
  }
};

const getAvatarUrl = (user) => {
  const userId = user?.id || user?.discordId;
  if (userId && user?.avatar) {
    return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`;
  }

  const fallbackSeed = parseInt(user?.discriminator || user?.username?.slice(-2) || "0", 10);
  return `https://cdn.discordapp.com/embed/avatars/${Number.isFinite(fallbackSeed) ? fallbackSeed % 5 : 0}.png`;
};

const showUserProfile = (user) => {
  const btn = document.getElementById("discord-login-btn");
  if (btn && user) {
    const profile = currentProfile || loadStoredProfile();
    const levelInfo = getAgpLevelInfo(profile?.points || 0);
    const safeUsername = escapeHtml(user.username || "User");
    const safeDisplayName = escapeHtml(user.global_name || user.globalName || user.username || "User");
    const safeAvatarUrl = escapeHtml(getAvatarUrl(user));
    const safeBadge = escapeHtml(levelInfo.current.navBadge || "1");
    const safePointsValue = `${(profile?.points || 0).toLocaleString()}`;
    const safePoints = escapeHtml(safePointsValue);
    const safeLevel = escapeHtml(levelInfo.current.name || "LVL 1");
    btn.classList.add("is-authenticated");
    btn.innerHTML = `
      <span class="nav-avatar-stack">
        <img src="${safeAvatarUrl}" alt="${safeUsername}" class="nav-avatar">
        <span class="nav-rank-badge" title="${safeLevel}">${safeBadge}</span>
      </span>
      <span class="nav-user-meta">
        <span class="nav-username">${safeDisplayName}</span>
        <span class="nav-user-sub">
          <span class="nav-user-level">${safeLevel}</span>
          <span class="nav-user-sep">·</span>
          <span>${safePoints} Coins</span>
        </span>
      </span>
      <span class="nav-user-chevron" aria-hidden="true"></span>
    `;
    btn.title = "Open profile menu";
  }
};

const updateWalletButtonVisibility = () => {
  const walletBtn = document.getElementById("wallet-btn");
  if (!walletBtn) return;

  walletBtn.hidden = false;
  walletBtn.classList.remove("is-guest", "is-open");
  walletBtn.setAttribute("aria-expanded", "false");
};

const ensureGuestWalletPrompt = (walletBtn) => {
  return null;
};

const closeGuestWalletPrompt = (walletBtn, prompt) => {
  if (prompt) {
    prompt.classList.remove("active");
  }
  if (walletBtn) {
    walletBtn.classList.remove("is-open");
    walletBtn.setAttribute("aria-expanded", "false");
  }
};

const toggleGuestWalletPrompt = (walletBtn, prompt) => {
  if (!walletBtn || !prompt) return;
  const willOpen = !prompt.classList.contains("active");
  closeGuestWalletPrompt(walletBtn, prompt);
  if (willOpen) {
    prompt.classList.add("active");
    walletBtn.classList.add("is-open");
    walletBtn.setAttribute("aria-expanded", "true");
  }
};

const openLoginModal = () => {
  if (typeof window.openLoginComingSoonModal === "function") {
    window.openLoginComingSoonModal();
    return;
  }
  const modal = document.getElementById("login-modal");
  const ageConfirm = document.getElementById("age-confirm");
  const joinedConfirm = document.getElementById("discord-joined-confirm");
  const discordModalBtn = document.getElementById("discord-modal-btn");
  const discordJoinBtn = document.getElementById("discord-join-btn");
  const feedback = document.getElementById("login-modal-feedback");
  const requirementCard = document.getElementById("login-requirement-card");
  if (!modal) return;

  openAnimatedModal(modal);
  if (ageConfirm) ageConfirm.checked = false;
  if (joinedConfirm) joinedConfirm.checked = false;
  if (discordModalBtn) discordModalBtn.disabled = false;
  if (discordJoinBtn) discordJoinBtn.href = DISCORD_CONFIG.inviteUrl;
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("is-visible", "is-error");
  }
  if (requirementCard) {
    requirementCard.classList.remove("is-highlighted");
  }
};

const updateLoginButton = () => {
  const btn = document.getElementById("discord-login-btn");
  const dropdown = document.getElementById("profile-dropdown-menu");
  const adminBtn = document.getElementById("admin-dashboard-btn");
  const user = getUiUser();
  const hasSession = hasActiveSession();
  updateWalletButtonVisibility();

  if (adminBtn) {
    const profile = currentProfile || loadStoredProfile();
    const isAdmin = Boolean(profile && profile.isAdmin);
    adminBtn.style.display = isAdmin ? "flex" : "none";
    console.info(
      `%c[AntonGambles Admin]`,
      "color:#ffb547;font-weight:bold",
      `isAdmin=${isAdmin} | discordId=${profile?.discordId || "—"} | button=${isAdmin ? "VISIBLE" : "hidden"}`
    );
  }

  if (btn && dropdown) {
    btn.setAttribute("aria-expanded", "false");
    if (user && hasSession) {
      showUserProfile(user);
      dropdown.style.display = "block";
    } else {
      btn.classList.remove("is-authenticated");
      btn.innerHTML = `
        <span class="nav-login-icon-shell" aria-hidden="true">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.54 4.5a16.6 16.6 0 0 0-4.1-1.3l-.5 1.1a15.4 15.4 0 0 0-4.9 0l-.5-1.1a16.6 16.6 0 0 0-4.1 1.3C2.9 8 2.4 11.4 2.6 14.8c1.6 1.2 3.3 2.1 5.2 2.7l1-1.7c-.6-.2-1.2-.5-1.8-.9l.4-.3c3.3 1.5 7 1.5 10.4 0l.4.3c-.6.4-1.2.7-1.8.9l1 1.7c1.9-.6 3.6-1.5 5.2-2.7.3-3.7-.3-7.1-2.8-10.3ZM9.3 13.3c-.7 0-1.3-.7-1.3-1.5 0-.8.6-1.5 1.3-1.5s1.3.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5Zm5.4 0c-.7 0-1.3-.7-1.3-1.5 0-.8.6-1.5 1.3-1.5s1.3.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5Z"/>
          </svg>
        </span>
        <span class="nav-login-copy">
          <span class="nav-login-kicker">Coming</span>
          <span class="nav-login-title">Soon</span>
        </span>
        <span class="nav-login-arrow" aria-hidden="true"></span>
      `;
      btn.title = "Login coming soon";
      dropdown.style.display = "none";
      dropdown.classList.remove("active");
    }
  }

  updateChatComposerState();
  renderChatMessages();
};

const toggleDropdown = () => {
  const btn = document.getElementById("discord-login-btn");
  const menu = document.getElementById("profile-dropdown-menu");
  if (menu) {
    const willOpen = !menu.classList.contains("active");
    menu.classList.toggle("active", willOpen);
    btn?.setAttribute("aria-expanded", willOpen ? "true" : "false");
  }
};

const closeDropdown = () => {
  const btn = document.getElementById("discord-login-btn");
  const menu = document.getElementById("profile-dropdown-menu");
  if (menu) {
    menu.classList.remove("active");
  }
  btn?.setAttribute("aria-expanded", "false");
};

const formatProfileDateTime = (isoString) => {
  if (!isoString) return "Not available";

  try {
    return new Date(isoString).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "Not available";
  }
};

const ensureProfileModal = () => {
  let modal = document.getElementById("profile-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "profile-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content profile-modal-content profile-modal-new">
      <button id="close-profile-modal" class="modal-close profile-modal-close" type="button" aria-label="Close profile">&times;</button>

      <div class="pm-hero">
        <div class="pm-hero-glow"></div>
        <div class="pm-avatar-ring">
          <img id="pm-avatar" class="pm-avatar" src="" alt="Profile avatar" />
        </div>
        <div class="pm-hero-copy">
          <div class="pm-eyebrow">AntonGambles Account</div>
          <h2 id="pm-name" class="pm-name">Loading...</h2>
          <div class="pm-badges">
            <span id="pm-tier-badge" class="pm-badge pm-badge--tier">Rookie</span>
            <span id="pm-admin-badge" class="pm-badge pm-badge--admin" hidden>Moderator</span>
          </div>
        </div>
      </div>

      <div class="pm-stats">
        <div class="pm-stat pm-stat--coins">
          <div class="pm-stat-eyebrow">Coins Balance</div>
          <div id="pm-coins" class="pm-stat-value">0</div>
          <div class="pm-stat-foot">Site Currency</div>
        </div>
        <div class="pm-stat pm-stat--cash">
          <div class="pm-stat-eyebrow">Real Cash Won</div>
          <div id="pm-cash" class="pm-stat-value pm-stat-value--cash">$0.00</div>
          <div class="pm-stat-foot pm-stat-foot--accent">Lifetime total</div>
        </div>
        <div class="pm-stat pm-stat--rank">
          <div class="pm-stat-eyebrow">Leaderboard</div>
          <div id="pm-rank" class="pm-stat-value pm-stat-value--rank">—</div>
          <div id="pm-rank-foot" class="pm-stat-foot">Top Players</div>
        </div>
        <div class="pm-stat pm-stat--streak">
          <div class="pm-stat-eyebrow">Daily Streak</div>
          <div id="pm-streak" class="pm-stat-value">0 days</div>
          <div id="pm-streak-foot" class="pm-stat-foot">Keep it going!</div>
        </div>
      </div>

      <div class="pm-progress">
        <div class="pm-progress-head">
          <div class="pm-progress-label">Tier Progress</div>
          <div id="pm-progress-next" class="pm-progress-next">Next Tier — 235 to Grinder</div>
        </div>
        <div class="pm-progress-bar">
          <div id="pm-progress-fill" class="pm-progress-fill" style="width: 6%"></div>
        </div>
        <div class="pm-progress-foot">
          <span id="pm-progress-current" class="pm-progress-current">LVL 1 · Rookie</span>
          <span id="pm-progress-max" class="pm-progress-max">235 Coins to LVL 2</span>
        </div>
      </div>

      <div class="pm-actions">
        <button id="pm-wallet-btn" class="pm-btn pm-btn--primary" type="button">
          <span class="pm-btn-glow"></span>
          <span class="pm-btn-label">Open Wallet</span>
        </button>
        <button id="pm-copy-btn" class="pm-btn pm-btn--ghost" type="button">Copy Profile</button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  const closeProfileModal = () => {
    closeAnimatedModal(modal);
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeProfileModal();
    }
  });
  modal.querySelector("#close-profile-modal").addEventListener("click", closeProfileModal);

  const walletBtn = modal.querySelector("#pm-wallet-btn");
  if (walletBtn) {
    walletBtn.addEventListener("click", () => {
      closeProfileModal();
      setTimeout(() => {
        try {
          if (window.openWalletModal) {
            window.openWalletModal();
          } else {
            const wBtn = document.getElementById("wallet-btn");
            if (wBtn) wBtn.click();
          }
        } catch (_) {}
      }, 120);
    });
  }

  const copyBtn = modal.querySelector("#pm-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const profile = currentProfile || loadStoredProfile();
      const name = document.getElementById("pm-name")?.textContent || "Player";
      const rankText = document.getElementById("pm-rank")?.textContent || "#—";
      const cashText = document.getElementById("pm-cash")?.textContent || "$0.00";
      const text = `${name} on AntonGambles · Rank ${rankText} · Real Cash Won ${cashText}`;
      try {
        await navigator.clipboard.writeText(text);
        const original = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("is-copied");
        setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.classList.remove("is-copied");
        }, 1800);
      } catch (_) {
        copyBtn.textContent = "Copy failed";
        setTimeout(() => (copyBtn.textContent = "Copy Profile"), 1500);
      }
    });
  }

  return modal;
};

const estimateCashFromCoins = (coins) => {
  const rate = 1000;
  const usd = (coins || 0) / rate;
  return usd;
};

const formatCash = (usd) => {
  const amount = Number(usd) || 0;
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return "< $0.01";
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const renderProfileModal = (profile, user, options = {}) => {
  const modal = ensureProfileModal();
  const avatar = modal.querySelector("#pm-avatar");
  const eyebrow = modal.querySelector(".pm-eyebrow");
  const name = modal.querySelector("#pm-name");
  const tierBadge = modal.querySelector("#pm-tier-badge");
  const adminBadge = modal.querySelector("#pm-admin-badge");

  const coinsEl = modal.querySelector("#pm-coins");
  const cashEl = modal.querySelector("#pm-cash");
  const rankEl = modal.querySelector("#pm-rank");
  const rankFoot = modal.querySelector("#pm-rank-foot");
  const streakEl = modal.querySelector("#pm-streak");
  const streakFoot = modal.querySelector("#pm-streak-foot");

  const progressNext = modal.querySelector("#pm-progress-next");
  const progressFill = modal.querySelector("#pm-progress-fill");
  const progressCurrent = modal.querySelector("#pm-progress-current");
  const progressMax = modal.querySelector("#pm-progress-max");

  const walletBtn = modal.querySelector("#pm-wallet-btn");

  const normalizedUser =
    user ||
    (profile
      ? {
          id: profile.discordId,
          username: profile.username,
          global_name: profile.globalName,
          avatar: profile.avatar,
        }
      : null);

  if (!profile || !normalizedUser) {
    if (name) name.textContent = "Profile unavailable";
    if (tierBadge) tierBadge.textContent = "—";
    return;
  }

  const levelInfo = getAgpLevelInfo(profile.points || 0);
  const isPublicView = Boolean(options.isPublicView);
  const leaderboardRank = profile.discordId
    ? leaderboardEntries.findIndex((entry) => entry.discordId === profile.discordId) + 1
    : 0;
  const lifetimePoints = typeof profile.lifetimePoints === "number" ? profile.lifetimePoints : profile.points || 0;
  const avatarUser = {
    id: normalizedUser.id || profile.discordId,
    username: normalizedUser.username || profile.username,
    avatar: normalizedUser.avatar || profile.avatar,
    discriminator: normalizedUser.discriminator,
  };

  if (avatar) {
    avatar.src = getAvatarUrl(avatarUser);
    avatar.alt = `${getDisplayName(profile)} avatar`;
  }
  if (eyebrow) {
    eyebrow.textContent = options.eyebrowText || (isPublicView ? "Community Profile" : "AntonGambles Account");
  }
  if (name) name.textContent = getDisplayName(profile);
  if (tierBadge) {
    tierBadge.textContent = levelInfo.current.name;
  }
  if (adminBadge) {
    adminBadge.hidden = !Boolean(profile.isAdmin);
  }

  const coinsVal = profile.points || 0;
  if (coinsEl) coinsEl.textContent = coinsVal.toLocaleString("en-US");

  const cashEstimate = estimateCashFromCoins(lifetimePoints);
  if (cashEl) {
    cashEl.textContent = formatCash(cashEstimate);
  }

  if (rankEl) {
    if (leaderboardRank > 0) {
      rankEl.textContent = `#${leaderboardRank}`;
    } else {
      rankEl.textContent = "—";
    }
  }
  if (rankFoot) {
    if (leaderboardRank === 1) {
      rankFoot.textContent = "Top of the leaderboard";
    } else if (leaderboardRank > 0 && leaderboardRank <= 10) {
      rankFoot.textContent = "Top 10 player";
    } else if (leaderboardRank > 0 && leaderboardRank <= 100) {
      rankFoot.textContent = "Top 100 player";
    } else if (leaderboardRank > 0) {
      rankFoot.textContent = "Keep climbing!";
    } else {
      rankFoot.textContent = "Play to get ranked";
    }
  }

  const streakVal = Number.isFinite(profile.dailyStreak) ? profile.dailyStreak || 0 : 0;
  if (streakEl) streakEl.textContent = `${streakVal} day${streakVal === 1 ? "" : "s"}`;
  if (streakFoot) {
    if (streakVal === 0) streakFoot.textContent = "Claim today to start";
    else if (streakVal >= 30) streakFoot.textContent = "Legendary streak 🔥";
    else if (streakVal >= 7) streakFoot.textContent = "Week warrior ⚡";
    else streakFoot.textContent = "Keep it going!";
  }

  if (progressNext) {
    progressNext.textContent = levelInfo.next
      ? `Next · ${levelInfo.next.name}`
      : "Max level reached";
  }

  if (progressFill) {
    progressFill.style.width = `${Math.max(2, Math.min(100, levelInfo.progressPercent || 0))}%`;
  }
  if (progressCurrent) {
    progressCurrent.textContent = levelInfo.current.name;
  }
  if (progressMax) {
    progressMax.textContent = levelInfo.next
      ? `${levelInfo.remainingPoints.toLocaleString("en-US")} Coins to ${levelInfo.next.name}`
      : "Maximum level";
  }

  if (walletBtn) {
    walletBtn.hidden = Boolean(options.hideWalletAction);
  }
};

const showProfileModal = () => {
  const modal = ensureProfileModal();
  closeDropdown();
  openAnimatedModal(modal);

  const fallbackProfile = currentProfile || loadStoredProfile();
  const fallbackUser = getStoredDiscordUser();
  renderProfileModal(fallbackProfile, fallbackUser);

  Promise.resolve()
    .then(async () => {
      await syncProfileFromServer();
      await refreshAgpMeta();
      renderProfileModal(currentProfile || fallbackProfile, getStoredDiscordUser() || fallbackUser);
    })
    .catch((error) => {
      console.error("Failed to load profile modal:", error);
      renderProfileModal(currentProfile || fallbackProfile, getStoredDiscordUser() || fallbackUser);
    });
};

const showChatMemberProfile = (member) => {
  if (!member?.discordId) return;

  const modal = ensureProfileModal();
  closeDropdown();
  closeChatUserMenu();
  openAnimatedModal(modal);

  const publicProfile = {
    discordId: member.discordId,
    username: member.username,
    globalName: member.globalName,
    avatar: member.avatar,
    points: member.points || 0,
    lifetimePoints: typeof member.lifetimePoints === "number" ? member.lifetimePoints : null,
    dailyStreak: null,
    bestDailyStreak: null,
    createdAt: null,
    lastLoginAt: null,
    lastDailyClaimAt: null,
    isAdmin: Boolean(member.isAdmin),
  };

  const publicUser = {
    id: member.discordId,
    username: member.username,
    global_name: member.globalName,
    avatar: member.avatar,
  };

  renderProfileModal(publicProfile, publicUser, {
    isPublicView: true,
    hideWalletAction: true,
    eyebrowText: "Community Profile",
  });
};

const handleLogout = () => {
  closeDropdown();
  window.location.href = `${window.location.origin}/logout-loading.html`;
};

const isMobileNavViewport = () => window.innerWidth <= MOBILE_NAV_BREAKPOINT;

const closeMobileNav = () => {
  const nav = document.querySelector(".site-nav");
  const toggle = document.querySelector(".nav-menu-toggle");
  nav?.classList.remove("is-mobile-nav-open");
  toggle?.setAttribute("aria-expanded", "false");
};

const setupMobileNav = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  const nav = document.querySelector(".site-nav");
  const container = nav?.querySelector(".nav-container");
  const actions = nav?.querySelector(".nav-actions");
  const brand = nav?.querySelector(".nav-brand");
  if (!nav || !container || !actions || !brand) return;

  actions.id = actions.id || "site-nav-actions";

  let toggle = container.querySelector(".nav-menu-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-menu-toggle";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.setAttribute("aria-controls", actions.id);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `
      <span class="nav-menu-toggle-line"></span>
      <span class="nav-menu-toggle-line"></span>
      <span class="nav-menu-toggle-line"></span>
    `;
    container.appendChild(toggle);
  }

  actions.querySelectorAll("a.nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!/giveaways/i.test(href)) {
      link.textContent = "Casino Bonuses";
    } else {
      link.textContent = "Giveaways";
    }
  });

  let lastScrollY = window.scrollY;
  const updateMobileNavVisibility = () => {
    if (!isMobileNavViewport()) {
      nav.classList.remove("is-mobile-hidden", "is-mobile-nav-open");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.setAttribute("aria-label", "Open menu");
      lastScrollY = window.scrollY;
      return;
    }

    const currentY = window.scrollY;
    if (nav.classList.contains("is-mobile-nav-open")) {
      nav.classList.remove("is-mobile-hidden");
      lastScrollY = currentY;
      return;
    }

    if (currentY <= 12) {
      nav.classList.remove("is-mobile-hidden");
      lastScrollY = currentY;
      return;
    }

    if (currentY > lastScrollY + 8) {
      nav.classList.add("is-mobile-hidden");
      closeDropdown();
    } else if (currentY < lastScrollY - 8) {
      nav.classList.remove("is-mobile-hidden");
    }

    lastScrollY = currentY;
  };

  if (!toggle.dataset.bound) {
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !nav.classList.contains("is-mobile-nav-open");
      nav.classList.toggle("is-mobile-nav-open", willOpen);
      nav.classList.remove("is-mobile-hidden");
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      toggle.setAttribute("aria-label", willOpen ? "Close menu" : "Open menu");
      if (!willOpen) {
        closeDropdown();
      }
    });
  }

  if (!actions.dataset.boundMobileNav) {
    actions.dataset.boundMobileNav = "true";
    actions.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("a.nav-link")) {
        closeMobileNav();
        closeDropdown();
      }
    });
  }

  if (!document.body.dataset.boundMobileNav) {
    document.body.dataset.boundMobileNav = "true";
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!isMobileNavViewport()) return;
      if (target.closest(".site-nav")) return;
      closeMobileNav();
      closeDropdown();
    });
    window.addEventListener(
      "scroll",
      () => {
        updateMobileNavVisibility();
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      updateMobileNavVisibility();
    });
  }

  updateMobileNavVisibility();
};

const setupDiscordLogin = () => {
  const btn = document.getElementById("discord-login-btn");
  const adminDashBtn = document.getElementById("admin-dashboard-btn");
  const profileBtn = document.getElementById("view-profile-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const modal = document.getElementById("login-modal");
  const closeModalBtn = document.getElementById("close-modal");
  const ageConfirm = document.getElementById("age-confirm");
  const joinedConfirm = document.getElementById("discord-joined-confirm");
  const discordModalBtn = document.getElementById("discord-modal-btn");
  const discordJoinBtn = document.getElementById("discord-join-btn");
  const feedback = document.getElementById("login-modal-feedback");
  const requirementCard = document.getElementById("login-requirement-card");

  const setLoginFeedback = (message = "", type = "") => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-visible", Boolean(message));
    feedback.classList.toggle("is-info", type === "info");
    feedback.classList.toggle("is-error", type === "error");
  };

  const focusJoinRequirement = (message) => {
    setLoginFeedback(message, "error");
    if (requirementCard) {
      requirementCard.classList.add("is-highlighted");
      requirementCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (discordJoinBtn) {
      window.setTimeout(() => discordJoinBtn.focus(), 140);
    }
  };

  const clearJoinRequirementState = () => {
    if (requirementCard) {
      requirementCard.classList.remove("is-highlighted");
    }
    if (joinedConfirm?.checked) {
      setLoginFeedback("");
    }
  };

  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hasActiveSession() && getUiUser()) {
        toggleDropdown();
      } else if (modal) {
        closeMobileNav();
        if (typeof window.openLoginComingSoonModal === "function") {
          window.openLoginComingSoonModal();
        }
      }
    });
  }

  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener("click", () => {
      closeAnimatedModal(modal);
      setLoginFeedback("");
      requirementCard?.classList.remove("is-highlighted");
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeAnimatedModal(modal);
        setLoginFeedback("");
        requirementCard?.classList.remove("is-highlighted");
      }
    });
  }

  if (ageConfirm) {
    ageConfirm.addEventListener("change", () => {
      if (ageConfirm.checked) {
        setLoginFeedback("");
      }
    });
  }

  if (joinedConfirm) {
    joinedConfirm.addEventListener("change", clearJoinRequirementState);
  }

  if (discordJoinBtn) {
    discordJoinBtn.href = DISCORD_CONFIG.inviteUrl;
    discordJoinBtn.addEventListener("click", () => {
      setLoginFeedback("After joining Discord, come back here and confirm that you joined the server.", "info");
      requirementCard?.classList.remove("is-highlighted");
    });
  }

  if (discordModalBtn && modal) {
    discordModalBtn.addEventListener("click", () => {
      if (!joinedConfirm?.checked) {
        focusJoinRequirement("Join Discord first, then confirm it before you continue.");
        return;
      }

      if (!ageConfirm?.checked) {
        setLoginFeedback("Confirm that you are 18+ before continuing with Discord login.", "error");
        ageConfirm?.focus();
        return;
      }

      modal.classList.remove("active");
      setLoginFeedback("");
      requirementCard?.classList.remove("is-highlighted");
      handleDiscordLogin();
    });
  }

  if (adminDashBtn) {
    adminDashBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown();
      window.open("/admin/", "_blank", "noopener,noreferrer");
    });
  }

  if (profileBtn) {
    profileBtn.addEventListener("click", showProfileModal);
  }

  const levelsBtn = document.getElementById("levels-btn");
  if (levelsBtn) {
    levelsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown();
      const base = (window.__siteOrigin || location.origin) + "/";
      window.location.href = base + "levels/";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    closeDropdown();
  });

  updateLoginButton();
  handleDiscordCallback();
};

const getStreamChannelsCopy = () => STREAM_CONFIG.channels.join(" or ");

const pickActiveStreamChannel = (liveChannels = []) => {
  if (liveChannels.includes(activeStreamChannel)) {
    return activeStreamChannel;
  }

  if (liveChannels.includes(STREAM_CONFIG.preferredChannel)) {
    return STREAM_CONFIG.preferredChannel;
  }

  return liveChannels[0] || STREAM_CONFIG.preferredChannel;
};

const setupTwitchWidget = (channel = activeStreamChannel) => {
  const iframe = document.getElementById("stream-player-iframe");
  if (!iframe) return;

  const streamChannel = normalizePromoText(channel, STREAM_CONFIG.preferredChannel).toLowerCase();
  if (!streamChannel) return;
  if (iframe.dataset.channel === streamChannel && iframe.src) return;

  const parents = Array.from(
    new Set(
      [window.location.hostname, "localhost", "127.0.0.1", "antongambles.com", "www.antongambles.com"].filter(Boolean)
    )
  );

  const params = new URLSearchParams({
    channel: streamChannel,
    autoplay: "true",
    muted: "true",
  });

  parents.forEach((parent) => params.append("parent", parent));
  iframe.dataset.channel = streamChannel;
  iframe.src = `https://player.twitch.tv/?${params.toString()}`;
};

const checkSingleTwitchLiveStatus = async (channel) => {
  try {
    const response = await fetch(
      `https://decapi.me/twitch/uptime/${channel}?offline_msg=offline`,
      { cache: "no-store" }
    );
    const text = (await response.text()).trim().toLowerCase();
    return text !== "offline" && !text.includes("offline");
  } catch (error) {
    console.error(`Failed to check Twitch live status for ${channel}:`, error);
    return false;
  }
};

const checkTwitchLiveStatus = async () => {
  const liveChecks = await Promise.all(
    STREAM_CONFIG.channels.map(async (channel) => ({
      channel,
      isLive: await checkSingleTwitchLiveStatus(channel),
    }))
  );

  const liveChannels = liveChecks.filter((entry) => entry.isLive).map((entry) => entry.channel);
  return {
    isLive: liveChannels.length > 0,
    liveChannels,
    activeChannel: pickActiveStreamChannel(liveChannels),
  };
};

const syncProfileFromServer = async () => {
  const headers = getAuthHeaders();
  if (!headers) {
    return null;
  }

  try {
    const response = await fetch("/api/me", {
      headers,
    });

    if (response.status === 401) {
      clearAuthState();
      updateLoginButton();
      return null;
    }

    if (response.status === 404) {
      clearAuthState();
      updateLoginButton();
      return null;
    }

    if (!response.ok) {
      throw new Error(`Profile sync failed with status ${response.status}`);
    }

    const data = await response.json();
    setCurrentProfile(data.profile || null);
    updatePointsDisplay();
    return data.profile || null;
  } catch (error) {
    console.error("Failed to sync profile:", error);
    return currentProfile;
  }
};

const syncPresenceHeartbeat = async () => {
  if (presenceHeartbeatInFlight || !hasActiveSession()) {
    return currentProfile || loadStoredProfile();
  }

  const headers = getAuthHeaders();
  if (!headers) {
    return null;
  }

  presenceHeartbeatInFlight = true;
  try {
    const response = await fetch("/api/presence/heartbeat", {
      method: "POST",
      headers,
    });

    if (response.status === 401) {
      clearAuthState();
      updateLoginButton();
      return null;
    }

    if (!response.ok) {
      throw new Error(`Presence heartbeat failed with status ${response.status}`);
    }

    const data = await response.json();
    if (data.profile) {
      setCurrentProfile(data.profile);
      updatePointsDisplay();
      updateChatComposerState();
    }
    return data.profile || currentProfile || loadStoredProfile();
  } catch (error) {
    console.error("Presence heartbeat failed:", error);
    return currentProfile || loadStoredProfile();
  } finally {
    presenceHeartbeatInFlight = false;
  }
};

// ============== AG POINTS SYSTEM ==============
const AG_POINTS_CONFIG = {
  dailyReward: 10,
  visitReward: 5,
  visitDurationMs: 5 * 60 * 1000,
  bonusReward: 2,
  bonusCooldownMs: 2 * 60 * 60 * 1000,
  streamReward: 15,
  streamWatchMs: 60 * 60 * 1000,
  streamCooldownMs: 12 * 60 * 60 * 1000,
};

const AG_STORAGE_KEYS = {
  points: "ag_points",
  visitRewardDay: "ag_visit_reward_day",
  visitStartTime: "ag_visit_start_time",
  streamProgress: "ag_stream_progress",
};

const AGP_MAX_LEVEL = 100;
const AGP_COINS_PER_LEVEL = 100;

const buildLevel = (lvl) => ({
  key: `lvl-${lvl}`,
  name: `LVL ${lvl}`,
  threshold: (lvl - 1) * AGP_COINS_PER_LEVEL,
  badge: `LVL ${lvl}`,
  navBadge: String(lvl),
});

const getDisplayName = (profileLike) =>
  profileLike?.globalName || profileLike?.username || profileLike?.name || "Unknown";

const getAgpLevelInfo = (points = 0) => {
  const safePoints = Math.max(0, Number(points) || 0);
  const currentLevelNum = Math.min(
    AGP_MAX_LEVEL,
    Math.floor(safePoints / AGP_COINS_PER_LEVEL) + 1
  );
  const current = buildLevel(currentLevelNum);

  const nextLevelNum = currentLevelNum >= AGP_MAX_LEVEL ? null : currentLevelNum + 1;
  const next = nextLevelNum ? buildLevel(nextLevelNum) : null;

  if (!next) {
    return {
      current,
      next: null,
      progressPercent: 100,
      remainingPoints: 0,
    };
  }

  const span = AGP_COINS_PER_LEVEL;
  const progress = safePoints - current.threshold;
  return {
    current,
    next,
    progressPercent: Math.max(0, Math.min(100, (progress / span) * 100)),
    remainingPoints: Math.max(0, next.threshold - safePoints),
  };
};

const getRankKeyFromProfile = (profile = {}) => {
  return getAgpLevelInfo(profile.points || 0).current.key;
};

const isCurrentUserAdmin = () => Boolean((currentProfile || loadStoredProfile())?.isAdmin);

const formatRelativeTime = (isoString) => {
  if (!isoString) return "just now";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (diffMs < 60 * 1000) return "just now";
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))}m ago`;
  if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
  return `${Math.floor(diffMs / (24 * 60 * 60 * 1000))}d ago`;
};

const getPresenceSummary = (profileLike) => {
  if (profileLike?.isOnline) {
    return {
      tone: "online",
      shortLabel: "Online now",
      detailLabel: "Online on site",
    };
  }

  if (profileLike?.lastSeenAt) {
    return {
      tone: "offline",
      shortLabel: `Last active ${formatRelativeTime(profileLike.lastSeenAt)}`,
      detailLabel: `Offline | last active ${formatRelativeTime(profileLike.lastSeenAt)}`,
    };
  }

  return {
    tone: "offline",
    shortLabel: "Offline",
    detailLabel: "Offline on site",
  };
};

const describeActivityEvent = (event) => {
  if (!event) {
    return {
      title: "No activity",
      copy: "Start earning Coins to populate your feed.",
    };
  }

  if (event.type === "points_awarded") {
    return {
      title: `+${event.amount || 0} Coins`,
      copy: event.reason || "Points awarded",
    };
  }

  if (event.type === "user_created") {
    return {
      title: "Account Created",
      copy: "You joined the Coins system.",
    };
  }

  if (event.type === "user_login") {
    return {
      title: "Discord Login",
      copy: "Session refreshed and ready to earn points.",
    };
  }

  if (event.type === "points_adjusted" || event.type === "points_set") {
    return {
      title: "Balance Updated",
      copy: event.reason || "An admin adjusted the balance.",
    };
  }

  if (event.type === "giveaway_entered") {
    if (!event.stake) {
      return {
        title: "Giveaway Entered",
        copy: `You entered ${event.title || "the giveaway"}.`,
      };
    }
    return {
      title: "Giveaway Stake",
      copy: `You burned ${(event.stake || 0).toLocaleString()} Coins to enter ${event.title || "the giveaway"}.`,
    };
  }

  if (event.type === "points_tipped") {
    return {
      title: `-${event.amount || 0} Coins Tipped`,
      copy: `You tipped ${event.recipientGlobalName || event.recipientUsername || "a user"}.`,
    };
  }

  return {
    title: event.type || "Activity",
    copy: event.reason || "A new activity entry was recorded.",
  };
};

const renderAgpDashboard = () => {
  const points = currentProfile?.points ?? getPoints();
  const lifetimePoints = currentProfile?.lifetimePoints ?? points;
  const streak = currentProfile?.dailyStreak ?? 0;
  const levelInfo = getAgpLevelInfo(points);
  const rank = currentProfile?.discordId
    ? leaderboardEntries.findIndex((entry) => entry.discordId === currentProfile.discordId) + 1
    : 0;

  const levelName = document.getElementById("agp-level-name");
  const levelBadge = document.getElementById("agp-level-badge");
  const levelProgressCopy = document.getElementById("agp-level-progress-copy");
  const levelProgressFill = document.getElementById("agp-level-progress-fill");
  const streakValue = document.getElementById("agp-streak-value");
  const lifetimeValue = document.getElementById("agp-lifetime-value");
  const rankValue = document.getElementById("agp-rank-value");
  const leaderboardList = document.getElementById("agp-leaderboard-list");
  const activityFeed = document.getElementById("agp-activity-feed");

  if (levelName) levelName.textContent = levelInfo.current.name;
  if (levelBadge) levelBadge.textContent = String(
    levelInfo.current.navBadge || "1"
  );
  if (levelProgressCopy) {
    levelProgressCopy.textContent = levelInfo.next
      ? `${levelInfo.remainingPoints.toLocaleString()} Coins until ${levelInfo.next.name}`
      : "Max level reached.";
  }
  if (levelProgressFill) {
    levelProgressFill.style.width = `${levelInfo.progressPercent}%`;
  }
  if (streakValue) streakValue.textContent = streak.toLocaleString();
  if (lifetimeValue) lifetimeValue.textContent = lifetimePoints.toLocaleString();
  if (rankValue) rankValue.textContent = rank > 0 ? `#${rank}` : "-";

  [1, 10, 25, 50, 100].forEach((lvl) => {
    const card = document.getElementById(`perk-card-lvl-${lvl}`);
    if (!card) return;
    const threshold = (lvl - 1) * AGP_COINS_PER_LEVEL;
    const unlocked = points >= threshold;
    card.classList.toggle("unlocked", unlocked);
    card.classList.toggle("locked", !unlocked);
    if (lvl === 100) card.classList.toggle("is-legend", true);
  });

  if (leaderboardList) {
    if (!leaderboardEntries.length) {
      leaderboardList.innerHTML = '<div class="agp-empty">No leaderboard data yet.</div>';
    } else {
      leaderboardList.innerHTML = leaderboardEntries
        .slice(0, 5)
        .map((entry, index) => {
          const isCurrent = currentProfile?.discordId && entry.discordId === currentProfile.discordId;
          const levelInfo = getAgpLevelInfo(entry.points || 0);
          const rankKey = levelInfo.current.key;
          const displayName = escapeHtml(getDisplayName(entry));
          const placement = index + 1;
          const placementClass = placement <= 3 ? ` is-top-${placement}` : "";
          const avatarUrl = getAvatarUrl({
            id: entry.discordId,
            username: entry.username || entry.globalName || entry.name || "user",
            discriminator: entry.discriminator || "0",
            avatar: entry.avatar || null,
          });
          return `
            <div class="agp-leaderboard-item agp-rank-shell-${rankKey}${isCurrent ? " is-current-user" : ""}">
              <div class="agp-leaderboard-left">
                <div class="agp-leaderboard-rank-badge${placementClass}">
                  <span class="agp-leaderboard-rank-hash">#</span>
                  <span class="agp-leaderboard-rank-num">${placement}</span>
                </div>
                <img class="agp-leaderboard-avatar agp-rank-avatar-${rankKey}" src="${avatarUrl}" alt="${displayName} avatar">
                <div class="agp-leaderboard-meta">
                  <div class="agp-leaderboard-name-row">
                    <div class="agp-leaderboard-name">${displayName}</div>
                    ${isCurrent ? '<span class="agp-leaderboard-you">You</span>' : ""}
                  </div>
                  <div class="agp-leaderboard-subline">
                    <div class="agp-leaderboard-badges">
                      <span class="agp-rank-chip agp-rank-chip-${rankKey}">${levelInfo.current.name}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="agp-leaderboard-right">
                <div class="agp-leaderboard-points">${(entry.points || 0).toLocaleString()}</div>
                <div class="agp-leaderboard-points-label">Balance</div>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  if (activityFeed) {
    if (!hasActiveSession()) {
      activityFeed.innerHTML = '<div class="agp-empty">Log in with Discord to view your Coins feed.</div>';
    } else if (!activityEntries.length) {
      activityFeed.innerHTML = '<div class="agp-empty">No rewards claimed yet.</div>';
    } else {
      activityFeed.innerHTML = activityEntries
        .slice(0, 6)
        .map((event) => {
          const details = describeActivityEvent(event);
          return `
            <div class="agp-activity-item">
              <div>
                <div class="agp-leaderboard-name">${details.title}</div>
                <div class="agp-activity-copy">${details.copy}</div>
              </div>
              <div class="agp-activity-time">${formatRelativeTime(event.timestamp)}</div>
            </div>
          `;
        })
        .join("");
    }
  }
};

const getPoints = () => {
  const stored = localStorage.getItem(AG_STORAGE_KEYS.points);
  const parsed = stored ? parseInt(stored, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTodayKey = () => new Date().toDateString();

const getStoredNumber = (storage, key) => {
  const raw = storage.getItem(key);
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const savePoints = (points) => {
  localStorage.setItem(AG_STORAGE_KEYS.points, points.toString());
  updatePointsDisplay();
};

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const formatClock = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const parseCompactCoinsAmount = (value = "") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");

  if (!normalized) return null;

  const match = normalized.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;

  const baseValue = Number(match[1]);
  const multiplier = match[2] === "m" ? 1000000 : match[2] === "k" ? 1000 : 1;
  const amount = Math.floor(baseValue * multiplier);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const normalizeTipRecipientInput = (value = "") => {
  const trimmed = String(value || "").trim();
  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return mentionMatch[1];
  }

  return trimmed.replace(/^@+/, "").trim();
};

const parseTipDraftDetails = (content = "") => {
  const trimmed = String(content || "").trim();
  if (!trimmed.toLowerCase().startsWith("/tip")) {
    return null;
  }

  const remainder = trimmed.slice(4).trim();
  if (!remainder) {
    return {
      type: "tip-draft",
      recipientQuery: "",
      amount: null,
      isComplete: false,
    };
  }

  const lastSpaceIndex = remainder.lastIndexOf(" ");
  if (lastSpaceIndex <= 0) {
    return {
      type: "tip-draft",
      recipientQuery: normalizeTipRecipientInput(remainder),
      amount: null,
      isComplete: false,
    };
  }

  const possibleAmount = parseCompactCoinsAmount(remainder.slice(lastSpaceIndex + 1));
  if (possibleAmount) {
    return {
      type: "tip-draft",
      recipientQuery: normalizeTipRecipientInput(remainder.slice(0, lastSpaceIndex)),
      amount: possibleAmount,
      isComplete: true,
    };
  }

  return {
    type: "tip-draft",
    recipientQuery: normalizeTipRecipientInput(remainder),
    amount: null,
    isComplete: false,
  };
};

const showPointsPopup = (text, variant = "reward") => {
  const popup = document.createElement("div");
  popup.className = `points-popup${variant === "info" ? " is-info" : ""}`;
  popup.textContent = text;

  const walletBtn = document.getElementById("wallet-btn");
  if (walletBtn) {
    const rect = walletBtn.getBoundingClientRect();
    popup.style.left = rect.left + rect.width / 2 + "px";
    popup.style.top = rect.top + "px";
  } else {
    popup.style.left = "50%";
    popup.style.top = "20%";
  }

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 1400);
};

const getChatPanelElements = () => ({
  launcher: document.getElementById("site-chat-launcher"),
  panel: document.getElementById("site-chat-panel"),
  status: document.getElementById("site-chat-status"),
  messages: document.getElementById("site-chat-messages"),
  userMenu: document.getElementById("site-chat-user-menu"),
  form: document.getElementById("site-chat-form"),
  input: document.getElementById("site-chat-input"),
  preview: document.getElementById("site-chat-preview"),
  replyBar: document.getElementById("site-chat-replybar"),
  replyLabel: document.getElementById("site-chat-reply-label"),
  replyText: document.getElementById("site-chat-reply-text"),
  replyCancel: document.getElementById("site-chat-reply-cancel"),
  send: document.getElementById("site-chat-send"),
  hint: document.getElementById("site-chat-hint"),
  tipBar: document.getElementById("site-chat-tipbar"),
  tipName: document.getElementById("site-chat-tip-name"),
  tipMeta: document.getElementById("site-chat-tip-meta"),
  tipInput: document.getElementById("site-chat-tip-input"),
  tipSubmit: document.getElementById("site-chat-tip-submit"),
});

const isChatOpen = () => localStorage.getItem(CHAT_STORAGE_KEY) === "1";

const setChatOpenPreference = (isOpen) => {
  localStorage.setItem(CHAT_STORAGE_KEY, isOpen ? "1" : "0");
};

const hasDesktopChatSidebar = () => window.innerWidth >= CHAT_DESKTOP_BREAKPOINT;

const updateChatStatus = (text, tone = "default") => {
  const { status } = getChatPanelElements();
  if (!status) return;
  status.textContent = text;
  status.dataset.tone = tone;
};

const updateChatPreview = (text = "", tone = "default") => {
  const { preview } = getChatPanelElements();
  if (!preview) return;
  preview.textContent = text;
  preview.dataset.tone = tone;
  preview.classList.toggle("is-visible", Boolean(text));
};

const truncateChatReplyText = (value = "", maxLength = 90) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const getChatReplySummary = (entry) => {
  if (!entry?.id) return null;

  if (entry.type === "announce") {
    return {
      id: entry.id,
      authorName: "Antongambles",
      text: truncateChatReplyText(entry.casinoName ? `Announcement: ${entry.casinoName}` : entry.content || "Announcement"),
    };
  }

  if (entry.type === "tip") {
    return {
      id: entry.id,
      authorName: getDisplayName(entry.sender || {}),
      text: truncateChatReplyText(
        `tipped ${getDisplayName(entry.recipient || {})} ${Number(entry.amount || 0).toLocaleString()} Coins`
      ),
    };
  }

  return {
    id: entry.id,
    authorName: getDisplayName(entry.sender || {}),
    text: truncateChatReplyText(entry.content || "Message"),
  };
};

const closeChatReplyComposer = () => {
  activeChatReplyTarget = null;
  const { replyBar } = getChatPanelElements();
  replyBar?.classList.remove("active");
};

const closeChatTipComposer = () => {
  activeChatTipTarget = null;
  const { tipBar, tipInput } = getChatPanelElements();
  if (tipBar) {
    tipBar.classList.remove("active");
  }
  if (tipInput) {
    tipInput.value = "";
  }
};

const focusChatMessageById = (messageId) => {
  if (!messageId) return false;
  const { messages } = getChatPanelElements();
  const target = messages?.querySelector(`[data-chat-entry-id="${CSS.escape(messageId)}"]`);
  if (!messages || !target) return false;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("is-reply-focus");
  window.setTimeout(() => {
    target.classList.remove("is-reply-focus");
  }, 1400);
  return true;
};

const openChatReplyComposer = (messageId) => {
  const targetEntry = chatEntries.find((entry) => entry?.id === messageId);
  if (!targetEntry) return;
  if (!hasActiveSession()) {
    openLoginModal();
    return;
  }

  if (activeChatReplyTarget?.id === targetEntry.id) {
    closeChatReplyComposer();
    updateChatComposerState();
    return;
  }

  closeChatUserMenu();
  closeChatTipComposer();
  activeChatReplyTarget = getChatReplySummary(targetEntry);
  updateChatComposerState();
  getChatPanelElements().input?.focus();
};

const closeChatUserMenu = () => {
  const { userMenu } = getChatPanelElements();
  if (!userMenu) return;

  userMenu.classList.remove("active");
  userMenu.innerHTML = "";
  activeChatUserMenu?.anchor?.setAttribute("aria-expanded", "false");
  activeChatUserMenu = null;
};

const setChatPanelOpen = (isOpen) => {
  const { launcher, panel, messages, input } = getChatPanelElements();
  if (!launcher || !panel) return;

  panel.classList.toggle("is-open", isOpen);
  launcher.classList.toggle("is-hidden", isOpen);
  document.body.classList.toggle("site-chat-expanded", isOpen);
  setChatOpenPreference(isOpen);

  if (isOpen && messages) {
    closeDropdown();
    closeMobileNav();
    messages.scrollTop = messages.scrollHeight;
    if (window.innerWidth <= 720 && hasActiveSession() && input) {
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
    }
  } else if (!isOpen) {
    input?.blur();
    closeChatUserMenu();
    closeChatTipComposer();
    closeChatReplyComposer();
  }
};

const openChatTipComposer = (target) => {
  if (!target) return;
  if (!hasActiveSession()) {
    openLoginModal();
    return;
  }

  if (activeChatTipTarget?.discordId && activeChatTipTarget.discordId === target.discordId) {
    closeChatTipComposer();
    updateChatComposerState();
    return;
  }

  closeChatUserMenu();
  closeChatReplyComposer();
  activeChatTipTarget = target;
  const { tipBar, tipName, tipInput } = getChatPanelElements();
  if (tipName) {
    tipName.textContent = `Tip ${getDisplayName(target)}`;
  }
  if (tipInput) {
    tipInput.value = "";
  }
  if (tipBar) {
    tipBar.classList.add("active");
  }
  updateChatComposerState();
  tipInput?.focus();
};

const positionChatUserMenu = (anchor) => {
  const { panel, userMenu } = getChatPanelElements();
  if (!panel || !userMenu || !anchor) return;

  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const menuWidth = userMenu.offsetWidth || 240;
  const menuHeight = userMenu.offsetHeight || 220;
  const horizontalPadding = 14;
  const verticalPadding = 12;

  let left = anchorRect.left - panelRect.left;
  let top = anchorRect.bottom - panelRect.top + 10;

  if (left + menuWidth > panelRect.width - horizontalPadding) {
    left = panelRect.width - menuWidth - horizontalPadding;
  }

  if (left < horizontalPadding) {
    left = horizontalPadding;
  }

  if (top + menuHeight > panelRect.height - verticalPadding) {
    top = anchorRect.top - panelRect.top - menuHeight - 10;
  }

  if (top < verticalPadding) {
    top = verticalPadding;
  }

  userMenu.style.left = `${Math.round(left)}px`;
  userMenu.style.top = `${Math.round(top)}px`;
};

const openChatUserMenu = ({ anchor, sender, messageId = "" }) => {
  const { userMenu } = getChatPanelElements();
  if (!anchor || !sender?.discordId || !userMenu) return;

  const selfId = currentProfile?.discordId || loadStoredProfile()?.discordId || null;
  const isSelf = Boolean(selfId && sender.discordId === selfId);
  const canTipTarget = hasActiveSession() && !isSelf;
  const rankKey = getRankKeyFromProfile(sender);
  const levelInfo = getAgpLevelInfo(sender.points || 0);
  const displayName = escapeHtml(getDisplayName(sender));
  const presence = getPresenceSummary(sender);
  const avatarUrl = getAvatarUrl({
    id: sender.discordId,
    username: sender.username || sender.globalName || "user",
    avatar: sender.avatar || null,
  });

  if (
    activeChatUserMenu &&
    activeChatUserMenu.anchor === anchor &&
    activeChatUserMenu.senderId === sender.discordId &&
    userMenu.classList.contains("active")
  ) {
    closeChatUserMenu();
    return;
  }

  closeChatUserMenu();
  userMenu.innerHTML = `
    <div class="site-chat-user-menu-card site-chat-rank-shell-${rankKey}">
      <div class="site-chat-user-menu-head">
        <img class="site-chat-user-menu-avatar site-chat-rank-${rankKey}" src="${avatarUrl}" alt="${displayName} avatar" />
        <div class="site-chat-user-menu-copy">
          <div class="site-chat-user-menu-name-row">
            <div class="site-chat-user-menu-name site-chat-rank-${rankKey}">${displayName}</div>
            ${sender.isAdmin ? '<span class="site-chat-role-tag is-compact">Moderator</span>' : ""}
          </div>
          <div class="site-chat-user-menu-subline is-${presence.tone}">
            <span class="site-chat-user-menu-dot is-${presence.tone}"></span>
            <span>${escapeHtml(presence.detailLabel)}</span>
          </div>
          <div class="site-chat-user-menu-meta">
            <span class="site-chat-level site-chat-rank-${rankKey}">${escapeHtml(levelInfo.current.name || "LVL 1")}</span>
          </div>
        </div>
      </div>
      <div class="site-chat-user-menu-balance-row">
        <span class="site-chat-user-menu-balance-label">Balance</span>
        <strong class="site-chat-user-menu-balance-value">${Number(sender.points || 0).toLocaleString()} Coins</strong>
      </div>
      <div class="site-chat-user-menu-actions">
        <button type="button" class="site-chat-user-menu-btn" data-chat-menu-action="profile">Profile</button>
        ${messageId ? '<button type="button" class="site-chat-user-menu-btn" data-chat-menu-action="reply">Reply</button>' : ""}
        ${
          canTipTarget
            ? '<button type="button" class="site-chat-user-menu-btn is-primary" data-chat-menu-action="tip">Tip</button>'
            : ""
        }
      </div>
    </div>
  `;

  activeChatUserMenu = {
    anchor,
    senderId: sender.discordId,
    sender,
    messageId,
  };

  anchor.setAttribute("aria-expanded", "true");
  userMenu.classList.add("active");
  requestAnimationFrame(() => positionChatUserMenu(anchor));
};

const updateChatComposerState = () => {
  const { input, send, hint, replyBar, replyLabel, replyText, tipBar, tipMeta, tipInput, tipSubmit } = getChatPanelElements();
  const loggedIn = hasActiveSession();
  const profile = currentProfile || loadStoredProfile();
  const balance = profile?.points || 0;
  const tipAmount = parseCompactCoinsAmount(tipInput?.value || "");
  const hasValidTipAmount = Number.isFinite(tipAmount) && tipAmount > 0 && tipAmount <= balance;

  if (!loggedIn && activeChatTipTarget) {
    activeChatTipTarget = null;
  }

  if (!loggedIn && activeChatReplyTarget) {
    activeChatReplyTarget = null;
  }

  if (input) {
    input.disabled = !loggedIn;
    input.placeholder = loggedIn ? "Send a message..." : "Log in with Discord to join the chat";
  }

  if (send) {
    send.disabled = !loggedIn;
  }

  if (hint) {
    hint.textContent = !loggedIn
      ? "Read-only until you log in"
      : `${balance.toLocaleString()} Coins available | Use /tip user coins${
          isCurrentUserAdmin() ? " | /clear | /announce casino" : ""
        }`;
  }

  if (tipSubmit) {
    tipSubmit.disabled = !loggedIn || !activeChatTipTarget || !hasValidTipAmount;
  }

  if (tipInput) {
    tipInput.disabled = !loggedIn || !activeChatTipTarget;
    tipInput.placeholder = activeChatTipTarget ? `Max ${balance.toLocaleString()} Coins` : "Coins";
  }

  if (tipMeta) {
    tipMeta.textContent = activeChatTipTarget
      ? `${balance.toLocaleString()} Coins available`
      : "Choose a user to send Coins";
  }

  if (replyLabel) {
    replyLabel.innerHTML = activeChatReplyTarget
      ? `Replying to <span class="site-chat-reply-mention">@${escapeHtml(activeChatReplyTarget.authorName)}</span>`
      : "";
  }

  if (replyText) {
    replyText.textContent = activeChatReplyTarget?.text || "";
  }

  if (replyBar) {
    replyBar.classList.toggle("active", Boolean(activeChatReplyTarget));
  }

  if (!activeChatTipTarget && tipBar) {
    tipBar.classList.remove("active");
  }

  if (!loggedIn) {
    updateChatPreview("");
  }
};

const runAdminChatAction = async (endpoint, body, successMessage) => {
  const headers = getAuthHeaders();
  if (!headers) {
    openLoginModal();
    return null;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearAuthState();
    updateLoginButton();
    openLoginModal();
    return null;
  }

  if (response.status === 403) {
    throw new Error(payload.error || "Admin access required");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Admin action failed");
  }

  const currentDiscordId = currentProfile?.discordId || loadStoredProfile()?.discordId || null;
  if (payload.profile && payload.profile.discordId && payload.profile.discordId === currentDiscordId) {
    setCurrentProfile(payload.profile);
    updatePointsDisplay();
  }

  await fetchChatMessages({ silent: true });
  updateChatComposerState();
  if (successMessage) {
    updateChatStatus(successMessage, "success");
  }
  return payload;
};

const clearChatAsAdmin = async () => runAdminChatAction("/api/admin/chat/clear", {}, "Chat cleared");
const announceChatAsAdmin = async (casinoName) =>
  runAdminChatAction("/api/admin/chat/announce", { casinoName }, `Announcement sent for ${casinoName}`);

const getChatMessageHtml = (entry) => {
  if (!entry) return "";

  if (entry.type === "announce") {
    const meta = getChatAnnouncementMeta(entry);
    const casinoName = escapeHtml(meta.name);
    const content = escapeHtml(meta.description);
    const bonusText = escapeHtml(meta.bonusText);
    const footer = escapeHtml(meta.footer);
    const factsHtml = meta.facts.length
      ? meta.facts
          .map(
            (fact) => `
              <span class="site-chat-announce-chip">
                <span class="site-chat-announce-chip-key">${escapeHtml(fact.key)}</span>
                <span class="site-chat-announce-chip-value">${escapeHtml(fact.value)}</span>
              </span>
            `
          )
          .join("")
      : "";
    const ctaHtml = meta.claimLink
      ? `<a class="site-chat-announce-cta" href="${escapeHtml(meta.claimLink)}" target="_blank" rel="noopener noreferrer">Claim Bonus</a>`
      : `<button type="button" class="site-chat-announce-cta is-ghost" data-chat-announce-card="${escapeHtml(
          meta.cardLabel
        )}">View Bonus</button>`;
    return `
      <div class="site-chat-system-message site-chat-system-message-announce is-${escapeHtml(meta.accent)}">
        <div class="site-chat-announce-head">
          <div class="site-chat-system-copy">
            <span class="site-chat-announce-badge">Antongambles</span>
            <span class="site-chat-announce-kicker">${escapeHtml(meta.kicker)}</span>
          </div>
          <div class="site-chat-actions">
            <span class="site-chat-system-time">${formatRelativeTime(entry.createdAt)}</span>
          </div>
        </div>
        <div class="site-chat-announce-title">${casinoName}</div>
        <div class="site-chat-announce-bonus">${bonusText}</div>
        <div class="site-chat-announce-copy">${content}</div>
        ${factsHtml ? `<div class="site-chat-announce-chips">${factsHtml}</div>` : ""}
        <div class="site-chat-announce-footer">
          <span class="site-chat-announce-footnote">${footer}</span>
          ${ctaHtml}
        </div>
      </div>
    `;
  }

  if (entry.type === "tip") {
    const senderName = escapeHtml(getDisplayName(entry.sender));
    const recipientName = escapeHtml(getDisplayName(entry.recipient));
    const amount = Number(entry.amount || 0).toLocaleString();
    return `
      <div class="site-chat-system-message" data-chat-entry-id="${escapeHtml(entry.id)}">
        <div class="site-chat-system-row">
          <div class="site-chat-system-copy"><strong>${senderName}</strong> tipped <strong>${recipientName}</strong> ${amount} Coins</div>
          <div class="site-chat-actions">
            <span class="site-chat-system-time">${formatRelativeTime(entry.createdAt)}</span>
          </div>
        </div>
      </div>
    `;
  }

  const sender = entry.sender || {};
  const selfId = currentProfile?.discordId || loadStoredProfile()?.discordId || null;
  const isSelf = selfId && sender.discordId === selfId;
  const avatarUrl = getAvatarUrl({
    id: sender.discordId,
    username: sender.username || sender.globalName || "user",
    avatar: sender.avatar || null,
  });
  const rankKey = getRankKeyFromProfile(sender);
  const levelInfo = getAgpLevelInfo(sender.points || 0);
  const levelLabel = escapeHtml(levelInfo.current.name || "LVL 1");
  const displayName = escapeHtml(getDisplayName(sender));
  const replyPreviewHtml = entry.replyTo?.id
    ? `
        <button type="button" class="site-chat-reply-preview" data-chat-scroll-id="${escapeHtml(entry.replyTo.id)}" title="Jump to replied message">
          <span class="site-chat-reply-preview-line" aria-hidden="true"></span>
          <img
            class="site-chat-reply-preview-avatar"
            src="${escapeHtml(
              entry.replyTo.authorId === "antongambles"
                ? "assets/gambidbanner.png"
                : getAvatarUrl({
                    id: entry.replyTo.authorId,
                    username: entry.replyTo.authorName || "user",
                    avatar: entry.replyTo.authorAvatar || null,
                  })
            )}"
            alt="${escapeHtml(entry.replyTo.authorName || "User")} avatar"
          />
          <span class="site-chat-reply-preview-head">
            <span class="site-chat-reply-preview-author">@${escapeHtml(entry.replyTo.authorName || "User")}</span>
            <span class="site-chat-reply-preview-text">${escapeHtml(entry.replyTo.content || "")}</span>
          </span>
        </button>
      `
    : "";
  const moderatorTag = sender.isAdmin
    ? '<span class="site-chat-role-tag">Moderator</span>'
    : "";
  const nameButton = sender.discordId
    ? `<button type="button" class="site-chat-name-btn site-chat-rank-${rankKey}" data-user-id="${escapeHtml(
        sender.discordId
      )}" data-message-id="${escapeHtml(entry.id)}" aria-haspopup="menu" aria-expanded="false" title="${
        isSelf ? "Open your menu" : "Open user menu"
      }">
        <span class="site-chat-name-label">${displayName}</span>
        <span class="site-chat-name-caret" aria-hidden="true"></span>
      </button>`
    : `<span class="site-chat-name site-chat-rank-${rankKey}">${displayName}</span>`;

  return `
    <article class="site-chat-message site-chat-rank-shell-${rankKey}${isSelf ? " is-self" : ""}" data-chat-entry-id="${escapeHtml(
      entry.id
    )}">
      <img class="site-chat-avatar site-chat-rank-${rankKey}" src="${avatarUrl}" alt="${displayName} avatar" />
      <div class="site-chat-message-body">
        <div class="site-chat-message-top">
          <div class="site-chat-message-meta">
            <div class="site-chat-identity-line">
              <div class="site-chat-primary-row">
                ${nameButton}
                ${moderatorTag}
                <div class="site-chat-actions">
                  <span class="site-chat-time">${formatRelativeTime(entry.createdAt)}</span>
                  <button type="button" class="site-chat-action-btn" data-chat-reply-id="${escapeHtml(entry.id)}">Reply</button>
                </div>
              </div>
              <div class="site-chat-badge-row">
                <span class="site-chat-level site-chat-rank-${rankKey}">${levelLabel}</span>
              </div>
            </div>
          </div>
        </div>
        ${replyPreviewHtml}
        <div class="site-chat-copy">${escapeHtml(entry.content || "")}</div>
      </div>
    </article>
  `;
};

const renderChatMessages = (stickToBottom = false) => {
  const { messages } = getChatPanelElements();
  if (!messages) return;

  const shouldStick =
    stickToBottom || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;

  if (!chatEntries.length) {
    closeChatUserMenu();
    messages.innerHTML = '<div class="site-chat-empty">No messages yet. Start the chat.</div>';
    return;
  }

  closeChatUserMenu();
  messages.innerHTML = chatEntries.map((entry) => getChatMessageHtml(entry)).join("");

  if (shouldStick) {
    messages.scrollTop = messages.scrollHeight;
  }
};

const fetchChatMessages = async ({ silent = false } = {}) => {
  const { messages } = getChatPanelElements();
  const shouldStick =
    !messages || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;

  if (!silent) {
    updateChatStatus("Loading chat...", "muted");
  }

  try {
    const response = await fetch(`/api/chat/messages?limit=${CHAT_UI_CONFIG.fetchLimit}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Chat request failed with status ${response.status}`);
    }

    const data = await response.json();
    chatEntries = Array.isArray(data.messages) ? data.messages : [];
    renderChatMessages(shouldStick);
    updateChatStatus("Community chat live", "default");
  } catch (error) {
    console.error("Failed to load chat messages:", error);
    updateChatStatus("Chat unavailable right now", "error");
  }
};

const parseChatCommand = (content = "") => {
  const trimmed = String(content || "").trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const tipDraft = parseTipDraftDetails(trimmed);
  if (tipDraft?.isComplete && tipDraft.recipientQuery && tipDraft.amount) {
    return {
      type: "tip",
      recipientQuery: tipDraft.recipientQuery,
      amount: tipDraft.amount,
    };
  }

  if (trimmed.toLowerCase() === "/clear") {
    return {
      type: "admin-clear",
    };
  }

  const announceMatch = trimmed.match(/^\/announce\s+(.+)$/i);
  if (announceMatch) {
    return {
      type: "admin-announce",
      casinoName: announceMatch[1].trim(),
    };
  }

  return {
    type: "unknown",
    raw: trimmed,
  };
};

const parseChatTipDraft = (content = "") => {
  return parseTipDraftDetails(content);
};

const fetchChatUserPreview = async (query, amount = null) => {
  const headers = getAuthHeaders();
  if (!headers) {
    updateChatPreview("");
    return;
  }

  const requestId = ++chatUserLookupRequestId;
  try {
    const response = await fetch(`/api/chat/users?query=${encodeURIComponent(query)}`, {
      headers,
      cache: "no-store",
    });

    if (requestId !== chatUserLookupRequestId) {
      return;
    }

    if (response.status === 401) {
      clearAuthState();
      updateLoginButton();
      updateChatPreview("");
      return;
    }

    if (!response.ok) {
      throw new Error(`Lookup failed with status ${response.status}`);
    }

    const data = await response.json();
    const users = Array.isArray(data.users) ? data.users : [];

    if (!users.length) {
      updateChatPreview("No matching user found", "error");
      return;
    }

    const primaryUser = users[0];
    const primaryName = getDisplayName(primaryUser);
    const primaryLevel = getAgpLevelInfo(primaryUser?.points || 0).current.name;
    const amountLabel = Number.isFinite(amount) && amount > 0 ? ` | ${amount.toLocaleString()} Coins` : "";

    if (users.length === 1) {
      updateChatPreview(
        `Tip target: ${primaryName} | ${primaryLevel} | ${(primaryUser?.points || 0).toLocaleString()} Coins${amountLabel}`,
        "success"
      );
      return;
    }

    const otherNames = users
      .slice(1, 3)
      .map((user) => getDisplayName(user))
      .filter(Boolean);

    updateChatPreview(
      `Best match: ${primaryName}${amountLabel}${otherNames.length ? ` | Also: ${otherNames.join(", ")}` : ""}`,
      "default"
    );
  } catch (error) {
    console.error("Failed to preview chat tip target:", error);
    if (requestId === chatUserLookupRequestId) {
      updateChatPreview("Could not preview tip target", "error");
    }
  }
};

const handleChatInputPreview = () => {
  const { input } = getChatPanelElements();
  const value = String(input?.value || "");
  const draft = parseChatTipDraft(value);

  if (chatUserLookupTimeoutId) {
    clearTimeout(chatUserLookupTimeoutId);
    chatUserLookupTimeoutId = null;
  }

  if (!draft) {
    updateChatPreview("");
    return;
  }

  if (!hasActiveSession()) {
    updateChatPreview("Log in to use /tip", "error");
    return;
  }

  if (!draft.recipientQuery) {
    updateChatPreview("Use /tip user coins", "default");
    return;
  }

  const balance = (currentProfile || loadStoredProfile())?.points || 0;
  if (Number.isFinite(draft.amount) && draft.amount > balance) {
    updateChatPreview(`Not enough Coins | You have ${balance.toLocaleString()}`, "error");
    return;
  }

  if (!draft.isComplete) {
    updateChatPreview(`Target: ${draft.recipientQuery} | Add an amount`, "default");
    return;
  }

  chatUserLookupTimeoutId = window.setTimeout(async () => {
    await fetchChatUserPreview(draft.recipientQuery, draft.amount);
  }, 180);
};

const executeChatTip = async ({ recipientId = "", recipientQuery = "", amount }) => {
  const response = await fetch("/api/chat/tip", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      recipientId,
      recipientQuery,
      amount,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearAuthState();
    updateLoginButton();
    openLoginModal();
    return { ok: false, unauthorized: true, payload };
  }

  if (!response.ok) {
    if (payload.remainingMs) {
      showPointsPopup(`Tip cooldown: ${formatDuration(payload.remainingMs)}`, "info");
    }
    throw new Error(payload.error || "Failed to send tip");
  }

  if (payload.senderProfile) {
    setCurrentProfile(payload.senderProfile);
    savePoints(payload.senderProfile.points || 0);
    updatePointsDisplay();
    refreshAgpMeta().catch((error) => {
      console.error("Failed to refresh leaderboard after tip:", error);
    });
  }

  closeChatTipComposer();
  await fetchChatMessages({ silent: true });
  updateLoginButton();
  showPointsPopup(
    `Sent ${Number(amount || 0).toLocaleString()} Coins to ${getDisplayName(payload.recipientProfile || {}) || "user"}`,
    "info"
  );

  return {
    ok: true,
    payload,
  };
};

const submitChatMessage = async (event) => {
  event.preventDefault();
  if (!hasActiveSession()) {
    openLoginModal();
    return;
  }

  const { input, send } = getChatPanelElements();
  const content = String(input?.value || "").trim();
  if (!content) return;

  if (send) send.disabled = true;
  const command = parseChatCommand(content);
  updateChatStatus(
    command?.type === "tip"
      ? "Sending Coins..."
      : command?.type === "admin-announce"
        ? "Sending announcement..."
        : "Sending message...",
    "muted"
  );

  try {
    if (command?.type === "unknown") {
      throw new Error("Unknown command. Use /tip user coins, /clear or /announce casino");
    }

    if (command?.type === "admin-clear") {
      if (!isCurrentUserAdmin()) {
        throw new Error("Only admins can use /clear");
      }
      await clearChatAsAdmin();
      if (input) input.value = "";
      return;
    }

    if (command?.type === "admin-announce") {
      if (!isCurrentUserAdmin()) {
        throw new Error("Only admins can use /announce");
      }
      if (!command.casinoName) {
        throw new Error("Use /announce casino");
      }
      await announceChatAsAdmin(command.casinoName);
      if (input) input.value = "";
      return;
    }

    if (command?.type === "tip") {
      const result = await executeChatTip({
        recipientQuery: command.recipientQuery,
        amount: command.amount,
      });
      if (result?.unauthorized) {
        return;
      }

      if (input) input.value = "";
      updateChatStatus("Tip sent", "success");
    } else {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          content,
          replyToId: activeChatReplyTarget?.id || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        clearAuthState();
        updateLoginButton();
        openLoginModal();
        return;
      }

      if (!response.ok) {
        if (payload.remainingMs) {
          showPointsPopup(`Chat cooldown: ${formatDuration(payload.remainingMs)}`, "info");
        }
        throw new Error(payload.error || "Failed to send message");
      }

      if (input) input.value = "";
      closeChatReplyComposer();
      await fetchChatMessages({ silent: true });
      updateChatStatus("Message sent", "success");
    }
  } catch (error) {
    console.error("Failed to send chat message:", error);
    updateChatStatus(getFriendlyUiErrorMessage(error, "Message failed"), "error");
  } finally {
    updateChatComposerState();
  }
};

const submitChatTip = async (event) => {
  event.preventDefault();
  if (!hasActiveSession()) {
    openLoginModal();
    return;
  }

  if (!activeChatTipTarget?.discordId) {
    closeChatTipComposer();
    return;
  }

  const { tipInput, tipSubmit } = getChatPanelElements();
  const amount = parseCompactCoinsAmount(tipInput?.value || "");
  const balance = (currentProfile || loadStoredProfile())?.points || 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    updateChatStatus("Enter a valid Coins amount", "error");
    return;
  }

  if (amount > balance) {
    updateChatStatus(`Not enough Coins | You have ${balance.toLocaleString()}`, "error");
    return;
  }

  if (tipSubmit) tipSubmit.disabled = true;
  updateChatStatus("Sending Coins...", "muted");

  try {
    const result = await executeChatTip({
      recipientId: activeChatTipTarget.discordId,
      amount,
    });
    if (result?.unauthorized) {
      return;
    }
    updateChatStatus("Tip sent", "success");
  } catch (error) {
    console.error("Failed to send tip:", error);
    updateChatStatus(getFriendlyUiErrorMessage(error, "Tip failed"), "error");
  } finally {
    updateChatComposerState();
  }
};

const setupChatPanel = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  if (document.getElementById("site-chat-panel")) {
    return;
  }

  const launcher = document.createElement("button");
  launcher.id = "site-chat-launcher";
  launcher.className = "site-chat-launcher";
  launcher.type = "button";
  launcher.innerHTML = `<span class="site-chat-launcher-title">Community Chat</span><span class="site-chat-launcher-copy">Talk and tip Coins</span>`;

  const panel = document.createElement("section");
  panel.id = "site-chat-panel";
  panel.className = "site-chat-panel";
  panel.innerHTML = `
    <div class="site-chat-header">
      <div>
        <div class="site-chat-eyebrow">Community Channel</div>
        <h3 class="site-chat-title"># live-chat</h3>
      </div>
      <div class="site-chat-header-actions">
        <button id="site-chat-close" class="site-chat-close" type="button" aria-label="Close chat">&times;</button>
      </div>
    </div>
    <div id="site-chat-status" class="site-chat-status">Loading chat...</div>
    <div id="site-chat-messages" class="site-chat-messages"></div>
    <div id="site-chat-user-menu" class="site-chat-user-menu" role="menu" aria-hidden="true"></div>
    <form id="site-chat-tipbar" class="site-chat-tipbar" novalidate>
      <div class="site-chat-tipbar-top">
        <div>
          <div id="site-chat-tip-name" class="site-chat-tip-name">Tip user</div>
          <div id="site-chat-tip-meta" class="site-chat-tip-meta">Choose a user to send Coins</div>
        </div>
        <button id="site-chat-tip-cancel" class="site-chat-tip-cancel" type="button">Cancel</button>
      </div>
      <div class="site-chat-tip-quick">
        <button class="site-chat-tip-quick-btn" type="button" data-tip-amount="10">10</button>
        <button class="site-chat-tip-quick-btn" type="button" data-tip-amount="25">25</button>
        <button class="site-chat-tip-quick-btn" type="button" data-tip-amount="100">100</button>
        <button class="site-chat-tip-quick-btn" type="button" data-tip-amount="max">Max</button>
      </div>
      <div class="site-chat-tipbar-row">
        <input id="site-chat-tip-input" class="site-chat-tip-input" type="text" inputmode="numeric" placeholder="Coins" />
        <button id="site-chat-tip-submit" class="site-chat-tip-submit" type="submit">Send Tip</button>
      </div>
    </form>
    <form id="site-chat-form" class="site-chat-form" novalidate>
      <div id="site-chat-replybar" class="site-chat-replybar">
        <div class="site-chat-replybar-copy">
          <div id="site-chat-reply-label" class="site-chat-reply-label"></div>
          <div id="site-chat-reply-text" class="site-chat-reply-text"></div>
        </div>
        <button id="site-chat-reply-cancel" class="site-chat-reply-cancel" type="button" aria-label="Cancel reply">&times;</button>
      </div>
      <textarea id="site-chat-input" class="site-chat-input" rows="2" maxlength="280" placeholder="Message #live-chat"></textarea>
      <div id="site-chat-preview" class="site-chat-preview"></div>
      <div class="site-chat-form-row">
        <button id="site-chat-send" class="site-chat-send" type="submit">Send</button>
      </div>
    </form>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  launcher.addEventListener("click", () => setChatPanelOpen(true));
  panel.querySelector("#site-chat-close")?.addEventListener("click", () => setChatPanelOpen(false));
  panel.querySelector("#site-chat-form")?.addEventListener("submit", submitChatMessage);
  panel.querySelector("#site-chat-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      panel.querySelector("#site-chat-form")?.requestSubmit();
    }
  });
  panel.querySelector("#site-chat-input")?.addEventListener("input", handleChatInputPreview);
  panel.querySelector("#site-chat-tipbar")?.addEventListener("submit", submitChatTip);
  panel.querySelector("#site-chat-tip-input")?.addEventListener("input", updateChatComposerState);
  panel.querySelector("#site-chat-tip-cancel")?.addEventListener("click", closeChatTipComposer);
  panel.querySelector("#site-chat-reply-cancel")?.addEventListener("click", () => {
    closeChatReplyComposer();
    updateChatComposerState();
    panel.querySelector("#site-chat-input")?.focus();
  });
  panel.querySelector("#site-chat-messages")?.addEventListener("scroll", closeChatUserMenu, { passive: true });
  panel.querySelector("#site-chat-tipbar")?.addEventListener("click", (event) => {
    const quickButton = event.target.closest("[data-tip-amount]");
    if (!quickButton) return;

    const { tipInput } = getChatPanelElements();
    const rawAmount = quickButton.getAttribute("data-tip-amount") || "";
    const balance = (currentProfile || loadStoredProfile())?.points || 0;
    const nextAmount = rawAmount === "max" ? balance : parseCompactCoinsAmount(rawAmount);
    if (!tipInput || !Number.isFinite(nextAmount) || nextAmount <= 0) return;

    tipInput.value = String(nextAmount);
    updateChatComposerState();
    tipInput.focus();
  });
  const handleChatPanelClick = (event) => {
    const announceButton = event.target.closest("[data-chat-announce-card]");
    if (announceButton) {
      const casinoName = announceButton.getAttribute("data-chat-announce-card") || "";
      if (focusPromoCardByName(casinoName)) {
        updateChatStatus(`${casinoName} bonus highlighted`, "success");
      }
      return;
    }

    const replyPreview = event.target.closest("[data-chat-scroll-id]");
    if (replyPreview) {
      const targetId = replyPreview.getAttribute("data-chat-scroll-id") || "";
      focusChatMessageById(targetId);
      return;
    }

    const replyButton = event.target.closest("[data-chat-reply-id]");
    if (replyButton) {
      const targetId = replyButton.getAttribute("data-chat-reply-id") || "";
      openChatReplyComposer(targetId);
      return;
    }

    const menuButton = event.target.closest("[data-chat-menu-action]");
    if (menuButton) {
      const action = menuButton.getAttribute("data-chat-menu-action");
      const context = activeChatUserMenu;
      const sender = context?.sender;
      if (!action || !sender?.discordId) return;

      if (action === "profile") {
        showChatMemberProfile(sender);
        return;
      }

      if (action === "tip") {
        closeChatUserMenu();
        openChatTipComposer(sender);
        return;
      }

      if (action === "reply") {
        closeChatUserMenu();
        if (context?.messageId) {
          openChatReplyComposer(context.messageId);
        }
        return;
      }
      return;
    }

    const button = event.target.closest(".site-chat-name-btn[data-user-id]");
    if (!button) return;

    const targetId = button.getAttribute("data-user-id");
    if (!targetId) return;

    const targetMessage = [...chatEntries]
      .reverse()
      .find((entry) => entry.type === "text" && entry.sender?.discordId === targetId);
    if (!targetMessage?.sender) return;

    openChatUserMenu({
      anchor: button,
      sender: targetMessage.sender,
      messageId: button.getAttribute("data-message-id") || targetMessage.id || "",
    });
  };
  panel.querySelector("#site-chat-messages")?.addEventListener("click", handleChatPanelClick);
  panel.querySelector("#site-chat-user-menu")?.addEventListener("click", handleChatPanelClick);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#site-chat-user-menu") || target.closest(".site-chat-name-btn")) return;
    closeChatUserMenu();
  });

  updateChatComposerState();
  const preferredOpen = localStorage.getItem(CHAT_STORAGE_KEY);
  setChatPanelOpen(preferredOpen === null ? hasDesktopChatSidebar() : isChatOpen());
  fetchChatMessages();

  if (chatPollIntervalId) {
    clearInterval(chatPollIntervalId);
  }
  chatPollIntervalId = window.setInterval(() => {
    fetchChatMessages({ silent: true });
  }, CHAT_UI_CONFIG.pollIntervalMs);

  window.addEventListener("resize", () => {
    document.body.classList.remove("site-chat-expanded");
    if (activeChatUserMenu?.anchor) {
      positionChatUserMenu(activeChatUserMenu.anchor);
    }
  });
};

const setActivityStatus = (id, text, completed = false) => {
  const status = document.getElementById(id);
  if (!status) return;

  status.textContent = text;
  status.classList.toggle("completed", completed);
};

const isSameCalendarDay = (isoString) => {
  if (!isoString) return false;
  return new Date(isoString).toDateString() === new Date().toDateString();
};

const getProfileBonusCooldowns = () => currentProfile?.bonusCooldowns || {};

const getStreamCooldownRemaining = () => {
  const cooldownUntil = currentProfile?.streamCooldownUntil;
  if (!cooldownUntil) return 0;
  return Math.max(0, new Date(cooldownUntil).getTime() - Date.now());
};

const claimReward = async (action, payload = {}) => {
  const headers = getAuthHeaders();
  if (!headers) {
    showPointsPopup("Log in with Discord to earn Coins", "info");
    return { applied: false, requiresLogin: true, profile: currentProfile };
  }

  const response = await fetch("/api/points/claim", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  if (response.status === 401 || response.status === 404) {
    clearAuthState();
    updateLoginButton();
    updatePointsDisplay();
    throw new Error(response.status === 404 ? "Profile reset" : "Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Reward claim failed");
  }

  if (data.profile) {
    setCurrentProfile(data.profile);
    updatePointsDisplay();
  }

  if (data.applied) {
    savePoints(data.profile.points);
    showPointsPopup(`+${data.amount} Coins`);
  }

  await refreshAgpMeta();

  return data;
};

const syncVisitTimerFromRemaining = (remainingMs) => {
  if (!Number.isFinite(remainingMs)) return;
  const elapsed = Math.max(0, AG_POINTS_CONFIG.visitDurationMs - remainingMs);
  sessionStorage.setItem(AG_STORAGE_KEYS.visitStartTime, String(Date.now() - elapsed));
};

const syncStreamProgressFromRemaining = (remainingMs) => {
  if (!Number.isFinite(remainingMs)) return;
  const progress = Math.max(0, AG_POINTS_CONFIG.streamWatchMs - remainingMs);
  saveStreamProgress(progress);
};

const sendRewardHeartbeat = async (reward, { force = false } = {}) => {
  const headers = getAuthHeaders();
  if (!headers) return null;

  const now = Date.now();
  if (!force && now - (rewardHeartbeatAt[reward] || 0) < REWARD_HEARTBEAT_INTERVAL_MS) {
    return null;
  }

  rewardHeartbeatAt[reward] = now;
  const response = await fetch("/api/points/heartbeat", {
    method: "POST",
    headers,
    body: JSON.stringify({ reward }),
  });

  if (response.status === 401 || response.status === 404) {
    clearAuthState();
    updateLoginButton();
    updatePointsDisplay();
    throw new Error(response.status === 404 ? "Profile reset" : "Session expired");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Reward heartbeat failed");
  }

  return data;
};

const updatePointsDisplay = () => {
  const points = getPoints();
  const display = document.getElementById("points-display");
  const walletPoints = document.getElementById("wallet-points");
  const isLoggedIn = hasActiveSession();

  if (display) {
    display.textContent = isLoggedIn ? `${points} Coins` : "Open Wallet";
  }
  if (walletPoints) {
    walletPoints.textContent = points.toLocaleString();
  }

  renderAgpDashboard();
  updateLoginButton();
};

const syncLeaderboard = async () => {
  try {
    const response = await fetch("/api/leaderboard?limit=8");
    if (!response.ok) {
      throw new Error(`Leaderboard sync failed with status ${response.status}`);
    }
    const data = await response.json();
    leaderboardEntries = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  } catch (error) {
    console.error("Failed to sync leaderboard:", error);
  }

  renderAgpDashboard();
};

const syncActivityFeed = async () => {
  const headers = getAuthHeaders();
  if (!headers) {
    activityEntries = [];
    renderAgpDashboard();
    return;
  }

  try {
    const response = await fetch("/api/me/activity", { headers });
    if (response.status === 401) {
      clearAuthState();
      updateLoginButton();
      activityEntries = [];
      renderAgpDashboard();
      return;
    }
    if (!response.ok) {
      throw new Error(`Activity sync failed with status ${response.status}`);
    }

    const data = await response.json();
    activityEntries = Array.isArray(data.events) ? data.events : [];
  } catch (error) {
    console.error("Failed to sync activity feed:", error);
  }

  renderAgpDashboard();
};

const refreshAgpMeta = async () => {
  await Promise.all([syncLeaderboard(), syncActivityFeed()]);
  renderAgpDashboard();
};

const updateDailyStatus = () => {
  if (!hasActiveSession()) {
    setActivityStatus("daily-status", "Login Required", false);
    return;
  }

  if (isSameCalendarDay(currentProfile?.lastDailyClaimAt)) {
    setActivityStatus("daily-status", "Done Today", true);
    return;
  }

  setActivityStatus("daily-status", "Ready Today", false);
};

const checkDailyLogin = async () => {
  if (hasActiveSession() && !isSameCalendarDay(currentProfile?.lastDailyClaimAt)) {
    try {
      await claimReward("daily-login");
    } catch (error) {
      console.error("Daily login reward failed:", error);
    }
  }

  updateDailyStatus();
};

const getVisitStartTime = () => {
  const stored = getStoredNumber(sessionStorage, AG_STORAGE_KEYS.visitStartTime);
  if (stored > 0) return stored;

  const now = Date.now();
  sessionStorage.setItem(AG_STORAGE_KEYS.visitStartTime, now.toString());
  return now;
};

const hasVisitRewardToday = () => isSameCalendarDay(currentProfile?.lastVisitRewardAt);

const updateVisitStatus = () => {
  if (hasVisitRewardToday()) {
    setActivityStatus("visit-status", "Done Today", true);
    return;
  }

  if (!hasActiveSession()) {
    setActivityStatus("visit-status", "Login Required", false);
    return;
  }

  const elapsed = Date.now() - getVisitStartTime();
  const remaining = Math.max(0, AG_POINTS_CONFIG.visitDurationMs - elapsed);

  if (remaining <= 0) {
    setActivityStatus("visit-status", "Ready Today", false);
    return;
  }

  setActivityStatus("visit-status", formatClock(remaining), false);
};

const checkVisitDuration = async () => {
  if (hasVisitRewardToday()) {
    updateVisitStatus();
    return;
  }

  if (!hasActiveSession()) {
    updateVisitStatus();
    return;
  }

  if (document.visibilityState === "visible") {
    try {
      const heartbeat = await sendRewardHeartbeat("visit-duration");
      if (heartbeat && Number.isFinite(heartbeat.remainingMs)) {
        syncVisitTimerFromRemaining(heartbeat.remainingMs);
      }
    } catch (error) {
      console.error("Visit heartbeat failed:", error);
    }
  }

  const elapsed = Date.now() - getVisitStartTime();
  if (elapsed >= AG_POINTS_CONFIG.visitDurationMs) {
    try {
      const result = await claimReward("visit-duration");
      if (!result.applied && Number.isFinite(result.remainingMs)) {
        syncVisitTimerFromRemaining(result.remainingMs);
      }
    } catch (error) {
      console.error("Visit reward failed:", error);
    }
  }

  updateVisitStatus();
};

const getBonusRewardKey = (btn) => {
  if (btn.dataset.rewardKey) return btn.dataset.rewardKey;

  const card = btn.closest(".promoCard");
  if (!card) return null;

  const rawLabel = card.getAttribute("aria-label") || card.querySelector(".promoBonusText")?.textContent || "";

  const normalized = rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  btn.dataset.rewardKey = normalized;
  return btn.dataset.rewardKey;
};

const getBonusRewardMeta = (btn) => {
  let meta = btn.parentElement?.querySelector(".promoBtnRewardMeta");
  if (meta) return meta;

  meta = document.createElement("div");
  meta.className = "promoBtnRewardMeta";
  btn.insertAdjacentElement("afterend", meta);
  return meta;
};

const getBonusCooldownRemaining = (btn) => {
  const key = getBonusRewardKey(btn);
  if (!key) return 0;
  const cooldownAt = getProfileBonusCooldowns()[key];
  if (!cooldownAt) return 0;
  return Math.max(0, new Date(cooldownAt).getTime() + AG_POINTS_CONFIG.bonusCooldownMs - Date.now());
};

const updateBonusButtonState = (btn) => {
  const meta = getBonusRewardMeta(btn);
  const remaining = getBonusCooldownRemaining(btn);

  if (remaining > 0) {
    meta.textContent = `Coins ready again in ${formatDuration(remaining)}`;
    meta.classList.add("is-cooldown");
    meta.classList.remove("is-ready");
    btn.classList.remove("is-cooldown");
    return remaining;
  }

  meta.textContent = hasActiveSession() ? `+${AG_POINTS_CONFIG.bonusReward} Coins available` : "Log in to earn Coins";
  meta.classList.add("is-ready");
  meta.classList.remove("is-cooldown");
  btn.classList.remove("is-cooldown");
  return 0;
};

const updateBonusStatus = () => {
  const promoBtns = Array.from(document.querySelectorAll(".promoCard .promoBtn[href]"));
  if (promoBtns.length === 0) return;

  const cooldowns = promoBtns.map((btn) => updateBonusButtonState(btn));
  const readyCount = cooldowns.filter((remaining) => remaining === 0).length;
  const shortestCooldown = cooldowns.filter((remaining) => remaining > 0).sort((a, b) => a - b)[0];

  if (readyCount > 0) {
    setActivityStatus("bonus-status", `${readyCount} Ready`, true);
    return;
  }

  if (shortestCooldown) {
    setActivityStatus("bonus-status", `Next Bonus ${formatDuration(shortestCooldown)}`, false);
    return;
  }

  setActivityStatus("bonus-status", "Bonus Ready", false);
};

const setupCasinoClickRewards = () => {
  const promoBtns = document.querySelectorAll(".promoCard .promoBtn[href]");

  promoBtns.forEach((btn) => {
    updateBonusButtonState(btn);

    btn.addEventListener("click", async () => {
      if (!hasActiveSession()) {
        updateBonusStatus();
        return;
      }

      const rewardKey = getBonusRewardKey(btn);
      if (!rewardKey) return;
      const remaining = getBonusCooldownRemaining(btn);

      if (remaining > 0) {
        updateBonusStatus();
        return;
      }

      try {
        await claimReward("bonus-click", { bonusKey: rewardKey });
      } catch (error) {
        console.error("Bonus reward failed:", error);
      } finally {
        updateBonusStatus();
        updateStreamStatus();
      }
    });
  });

  updateBonusStatus();
};

const getStreamProgress = () => getStoredNumber(sessionStorage, AG_STORAGE_KEYS.streamProgress);

const saveStreamProgress = (progress) => {
  sessionStorage.setItem(AG_STORAGE_KEYS.streamProgress, progress.toString());
};

const updateStreamStatus = () => {
  const progress = getStreamProgress();
  const remainingCooldown = getStreamCooldownRemaining();
  const player = document.getElementById("stream-player");
  const streamTitle = document.getElementById("stream-player-title") || document.querySelector(".stream-player-title");
  const streamSubtitle = document.getElementById("stream-player-subtitle");
  const streamProgressCopy = document.getElementById("stream-progress-copy");
  const streamProgressFill = document.getElementById("stream-progress-fill");
  const dock = document.getElementById("stream-player-dock");
  const activeChannelLabel = normalizePromoText(activeStreamChannel, STREAM_CONFIG.preferredChannel);
  const shouldShowDock =
    streamIsLive && (!player || !player.classList.contains("visible") || player.classList.contains("minimized"));

  if (streamTitle) {
    streamTitle.textContent = activeChannelLabel;
  }

  if (dock) {
    dock.classList.toggle("visible", shouldShowDock);
  }

  if (!streamIsLive) {
    if (player) {
      player.classList.remove("visible", "minimized");
    }
    if (dock) {
      dock.classList.remove("visible");
    }
    setActivityStatus("stream-status", "Offline", false);
    if (streamSubtitle) {
      streamSubtitle.textContent = "Goes live here automatically";
    }
    if (streamProgressCopy) {
      streamProgressCopy.textContent = `The player appears down here automatically whenever ${getStreamChannelsCopy()} goes live on Twitch.`;
    }
    if (streamProgressFill) {
      streamProgressFill.style.width = "0%";
    }
    return;
  }

  if (streamProgressFill) {
    const progressPercent = remainingCooldown > 0 ? 100 : Math.min(100, (progress / AG_POINTS_CONFIG.streamWatchMs) * 100);
    streamProgressFill.style.width = `${progressPercent}%`;
  }

  if (remainingCooldown > 0) {
    const cooldownText = `Cooldown ${formatDuration(remainingCooldown)}`;
    setActivityStatus("stream-status", cooldownText, false);

    if (streamSubtitle) {
      streamSubtitle.textContent = `${activeChannelLabel} live | next reward in ${formatDuration(remainingCooldown)}`;
    }
    if (streamProgressCopy) {
      streamProgressCopy.textContent = `Come back after the cooldown for another +${AG_POINTS_CONFIG.streamReward} Coins.`;
    }
    return;
  }

  if (!hasActiveSession()) {
    setActivityStatus("stream-status", "Login Required", false);
    if (streamSubtitle) {
      streamSubtitle.textContent = `${activeChannelLabel} live | Discord login required for rewards`;
    }
    if (streamProgressCopy) {
      streamProgressCopy.textContent = "Log in with Discord before you farm Coins through the stream.";
    }
    return;
  }

  const progressText = `${formatClock(progress)} / ${formatClock(AG_POINTS_CONFIG.streamWatchMs)}`;
  setActivityStatus("stream-status", progress > 0 ? progressText : "Start Watch", progress >= AG_POINTS_CONFIG.streamWatchMs);

  if (streamSubtitle) {
    streamSubtitle.textContent =
      progress > 0
        ? `${activeChannelLabel} live | progress ${progressText}`
        : `${activeChannelLabel} live | watch 1h for +${AG_POINTS_CONFIG.streamReward} Coins`;
  }
  if (streamProgressCopy) {
    streamProgressCopy.textContent =
      progress > 0
        ? `Keep the player open until the timer reaches 1 hour.`
        : `Open the player and stay on the page for 1 hour to earn points.`;
  }
};

const setupStreamPlayer = () => {
  const player = document.getElementById("stream-player");
  if (!player) return;

  const header = document.getElementById("stream-player-header");
  const dock = document.getElementById("stream-player-dock");
  const closeBtn = document.getElementById("stream-player-close");
  const minimizeBtn = document.getElementById("stream-player-minimize");

  let dragState = null;

  const openPlayer = () => {
    if (!streamIsLive) return;
    player.classList.add("visible");
    player.classList.remove("minimized");
    streamAutoOpened = true;
    if (dock) {
      dock.classList.remove("visible");
    }
    updateStreamStatus();
  };

  const minimizePlayer = () => {
    player.classList.remove("visible");
    player.classList.add("minimized");
    if (dock) {
      dock.classList.add("visible");
    }
    updateStreamStatus();
  };

  const closePlayer = () => {
    player.classList.remove("visible", "minimized");
    if (dock) {
      dock.classList.add("visible");
    }
  };

  const syncLivePlayerState = async () => {
    const liveState = await checkTwitchLiveStatus();
    const wasLive = streamIsLive;
    streamIsLive = liveState.isLive;
    activeStreamChannel = liveState.activeChannel;

    if (streamIsLive && activeStreamChannel) {
      setupTwitchWidget(activeStreamChannel);
    }

    if (streamIsLive && (!wasLive || !streamAutoOpened)) {
      openPlayer();
    }

    if (!streamIsLive) {
      streamAutoOpened = false;
      closePlayer();
    }

    updateStreamStatus();
  };

  const isWatchEligible = () =>
    hasActiveSession() &&
    streamIsLive &&
    player.classList.contains("visible") &&
    !player.classList.contains("minimized") &&
    document.visibilityState === "visible" &&
    getStreamCooldownRemaining() <= 0;

  if (dock) {
    dock.addEventListener("click", openPlayer);
    dock.classList.add("visible");
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", closePlayer);
  }
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", minimizePlayer);
  }

  if (header) {
    header.addEventListener("mousedown", (event) => {
      if (event.target.closest(".stream-player-action")) return;

      const rect = player.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };

      player.classList.add("dragging");
      player.style.left = `${rect.left}px`;
      player.style.top = `${rect.top}px`;
      player.style.right = "auto";
      player.style.bottom = "auto";
    });
  }

  document.addEventListener("mousemove", (event) => {
    if (!dragState) return;

    player.style.left = `${Math.max(12, event.clientX - dragState.offsetX)}px`;
    player.style.top = `${Math.max(84, event.clientY - dragState.offsetY)}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!dragState) return;
    dragState = null;
    player.classList.remove("dragging");
  });

  window.setInterval(async () => {
    if (!isWatchEligible()) {
      updateStreamStatus();
      return;
    }

    const nextProgress = Math.min(AG_POINTS_CONFIG.streamWatchMs, getStreamProgress() + 1000);
    saveStreamProgress(nextProgress);

    try {
      const heartbeat = await sendRewardHeartbeat("stream-watch");
      if (heartbeat && Number.isFinite(heartbeat.remainingMs)) {
        syncStreamProgressFromRemaining(heartbeat.remainingMs);
      }
    } catch (error) {
      console.error("Stream heartbeat failed:", error);
    }

    if (nextProgress >= AG_POINTS_CONFIG.streamWatchMs) {
      saveStreamProgress(0);
      try {
        const result = await claimReward("stream-watch");
        if (!result.applied && result.remainingMs) {
          syncStreamProgressFromRemaining(result.remainingMs);
          showPointsPopup(`Stream cooldown: ${formatDuration(result.remainingMs)}`, "info");
        } else if (result.applied) {
          showPointsPopup("Stream reward claimed", "info");
        }
      } catch (error) {
        console.error("Stream reward failed:", error);
      }
    }

    updateStreamStatus();
  }, 1000);

  document.addEventListener("visibilitychange", updateStreamStatus);
  syncLivePlayerState();
  window.setInterval(syncLivePlayerState, STREAM_CONFIG.liveCheckIntervalMs);
  updateStreamStatus();
};

const updateTopWalletDisplay = (profile) => {
  const cashEl = document.getElementById("twp-cash");
  const coinsEl = document.getElementById("twp-coins");
  if (cashEl) cashEl.textContent = "COMING";
  if (coinsEl) coinsEl.textContent = "SOON";
};

const ensureWalletModal = () => {
  let modal = document.getElementById("wallet-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "wallet-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content wallet-content wallet-coming-soon">
      <button id="close-wallet" class="modal-close wallet-close" type="button" aria-label="Close wallet">&times;</button>
      <div class="cs-inner">
        <div class="cs-glow" aria-hidden="true"></div>
        <div class="cs-badge">✨ WALLET</div>
        <h2 class="cs-title">Coming <span class="cs-gold">Soon</span></h2>
        <p class="cs-copy">We're polishing the AntonGambles Wallet experience. Check back soon for Coins, Cash & Rewards.</p>
        <div class="cs-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="cs-foot">Launching very soon 🚀</div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeWalletModal = () => closeAnimatedModal(modal);
  modal.querySelector("#close-wallet").addEventListener("click", closeWalletModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeWalletModal(); });

  return modal;
};

const ensureLoginComingSoonModal = () => {
  let modal = document.getElementById("login-coming-soon-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "login-coming-soon-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content wallet-content wallet-coming-soon">
      <button id="close-login-cs" class="modal-close wallet-close" type="button" aria-label="Close">&times;</button>
      <div class="cs-inner">
        <div class="cs-glow" aria-hidden="true"></div>
        <div class="cs-badge">🔐 LOGIN</div>
        <h2 class="cs-title">Coming <span class="cs-gold">Soon</span></h2>
        <p class="cs-copy">Discord Login is being secured. Soon you'll sign in and unlock Coins, Rewards and the full AntonGambles experience.</p>
        <div class="cs-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="cs-foot">Launching very soon 🚀</div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => closeAnimatedModal(modal);
  modal.querySelector("#close-login-cs").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  return modal;
};

window.openLoginComingSoonModal = () => {
  const modal = ensureLoginComingSoonModal();
  openAnimatedModal(modal);
};

let __walletToastTimer = null;
const flashWalletToast = (msg) => {
  let toast = document.getElementById("wallet-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "wallet-toast";
    toast.className = "wallet-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("is-visible");
  if (__walletToastTimer) window.clearTimeout(__walletToastTimer);
  __walletToastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
};

const updateWalletModalContents = (profile) => {
  updateTopWalletDisplay(profile);
};

window.openWalletModal = async () => {
  const modal = ensureWalletModal();
  const combo = document.getElementById("wallet-btn");
  const pill = document.getElementById("top-wallet-dropdown");
  pill?.setAttribute("aria-expanded", "true");
  combo?.classList.add("is-open");
  openAnimatedModal(modal);
  await syncProfileFromServer();
  await refreshAgpMeta();
  updateWalletModalContents();
  updateDailyStatus();
  updateVisitStatus();
  updateBonusStatus();
  updateStreamStatus();
  modal.querySelector("#wallet-search")?.focus();
};

const setupWalletModal = () => {
  const walletCombo = document.getElementById("wallet-btn");
  const walletPill = document.getElementById("top-wallet-dropdown");
  const walletCta = document.getElementById("top-wallet-cta");
  const walletModal = ensureWalletModal();
  if (walletCombo) {
    const stalePrompt = walletCombo.parentElement?.querySelector(".wallet-guest-popover");
    if (stalePrompt) stalePrompt.remove();
    walletCombo.classList.remove("is-open");
  }

  const closeWalletModal = () => {
    if (!walletModal) return;
    closeAnimatedModal(walletModal);
    walletCombo?.classList.remove("is-open");
    walletPill?.setAttribute("aria-expanded", "false");
  };

  const tryOpenWallet = async (event) => {
    if (event) event.preventDefault();
    await window.openWalletModal();
  };

  if (walletCombo) {
    walletCombo.addEventListener("click", async (event) => {
      const target = event.target;
      if (target && walletCta && walletCta.contains(target)) {
        event.preventDefault();
        await tryOpenWallet(event);
        return;
      }
      if (target && walletPill && walletPill.contains(target)) {
        event.preventDefault();
        await tryOpenWallet(event);
        return;
      }
      if (!walletPill && !walletCta) {
        await tryOpenWallet(event);
      }
    });
  }

  if (walletPill) {
    walletPill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tryOpenWallet(e);
      }
    });
  }
  if (walletCta) {
    walletCta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tryOpenWallet(e);
      }
    });
  }

  const closeBtn = document.getElementById("close-wallet");
  if (closeBtn && walletModal) {
    closeBtn.addEventListener("click", closeWalletModal);
  }

  if (walletModal) {
    walletModal.addEventListener("click", (e) => {
      if (e.target === walletModal) closeWalletModal();
    });
  }

  document.addEventListener("click", (event) => {
    if (!guestPrompt || !walletCombo || hasActiveSession()) return;
    if (walletCombo.contains(event.target) || guestPrompt.contains(event.target)) return;
    closeGuestWalletPrompt(walletCombo, guestPrompt);
  });

  updateTopWalletDisplay();
};

const setupPointsSystem = async () => {
  setCurrentProfile(loadStoredProfile());
  if (currentProfile?.points != null) {
    savePoints(currentProfile.points);
  }
  updatePointsDisplay();
  await syncProfileFromServer();
  await syncPresenceHeartbeat();
  await refreshAgpMeta();
  await checkDailyLogin();
  updateVisitStatus();
  setupWalletModal();
  setupPromoInfoBoxes();
  setupCasinoClickRewards();
  setupStreamPlayer();
  setupChatPanel();
  updateBonusStatus();
  updateStreamStatus();

  setInterval(() => {
    checkVisitDuration().catch((error) => {
      console.error("Visit duration loop failed:", error);
    });
  }, 10000);
  setInterval(() => {
    syncPresenceHeartbeat().catch((error) => {
      console.error("Presence loop failed:", error);
    });
  }, PRESENCE_HEARTBEAT_INTERVAL_MS);
  await checkVisitDuration();
};
// ============== END AG POINTS SYSTEM ==============

// ============== PARTICLE & BACKGROUND FX ==============
const createBackgroundParticles = () => {
  const container = document.getElementById("bg-particles");
  if (!container) return;

  const PARTICLE_COUNT = window.innerWidth < 760 ? 36 : 78;
  const frag = document.createDocumentFragment();
  const COLORS = ["gold", "cyan", "green", "gold", "cyan", "gold"];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement("span");
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const size = 1.6 + Math.random() * 3.6;
    const left = Math.random() * 100;
    const top = 5 + Math.random() * 95;
    const duration = 11 + Math.random() * 24;
    const delay = -Math.random() * duration;
    const dx = (Math.random() - 0.5) * 80;
    const dy = -100 - Math.random() * 200;
    const opacity = 0.35 + Math.random() * 0.55;

    p.className = "particle";
    p.dataset.color = color;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${left}%`;
    p.style.top = `${top}%`;
    p.style.opacity = String(opacity);
    p.style.animationDuration = `${duration}s`;
    p.style.animationDelay = `${delay}s`;
    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);
    p.style.borderRadius = "999px";
    if (color === "gold") p.style.background = "#ffe084";
    else if (color === "cyan") p.style.background = "#5fd1ff";
    else p.style.background = "#4ade80";
    frag.appendChild(p);
  }

  container.appendChild(frag);
};

const createFloatingCoins = () => {
  const container = document.getElementById("floating-coins");
  if (!container) return;

  const COUNT = 5;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < COUNT; i++) {
    const c = document.createElement("span");
    c.className = "float-coin";
    const size = 14 + Math.random() * 26;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    c.style.left = `${5 + Math.random() * 90}%`;
    c.style.top = `${15 + Math.random() * 70}%`;
    c.style.animationDuration = `${5 + Math.random() * 7}s`;
    c.style.animationDelay = `${-Math.random() * 6}s`;
    c.style.opacity = String(0.25 + Math.random() * 0.45);
    frag.appendChild(c);
  }
  container.appendChild(frag);
};

// ============== SIDEBAR SETUP ==============
const syncSidebarPointsBadge = () => {
  const badge = document.getElementById("sidebar-points-badge");
  const navMini = document.getElementById("points-display-mini");
  const display = document.getElementById("points-display");
  try {
    let points = 0;
    if (display) {
      const m = display.textContent.trim().match(/([\d\s,.]+)/);
      if (m) points = parseInt(m[1].replace(/[\s,.]/g, ""), 10) || 0;
    }
    if (!points && currentProfile?.points != null) points = currentProfile.points;
    const fullText = points === 1 ? "1 Coin" : `${points.toLocaleString()} Coins`;
    const shortBadge = points >= 10000 ? `${(points / 1000).toFixed(1)}k` : String(points);
    if (badge) badge.textContent = shortBadge;
    if (navMini) navMini.textContent = fullText;
    if (display && points > 0 && !display.textContent.trim()) display.textContent = fullText;
  } catch {
    if (badge) badge.textContent = "0";
    if (navMini) navMini.textContent = "0 Coins";
  }
};

const setupSidebar = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  const sidebar = document.querySelector(".app-sidebar");
  if (!sidebar) return;

  // Live button -> scroll to stream
  const liveBtn = document.getElementById("sidebar-live-btn");
  if (liveBtn) {
    liveBtn.addEventListener("click", (e) => {
      const target = document.getElementById("live") || document.getElementById("stream-player") || document.querySelector(".stream-section");
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Wallet button -> open wallet modal (trigger same as top wallet-btn)
  const sidebarWalletBtn = document.getElementById("sidebar-wallet-btn");
  const walletBtn = document.getElementById("wallet-btn");
  if (sidebarWalletBtn) {
    sidebarWalletBtn.addEventListener("click", () => {
      if (walletBtn) {
        walletBtn.click();
      } else {
        const modal = document.getElementById("wallet-modal");
        if (modal && typeof openAnimatedModal === "function") openAnimatedModal(modal);
      }
    });
  }

  // Create account button -> open login coming soon modal
  const createBtn = document.getElementById("sidebar-create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      if (typeof window.openLoginComingSoonModal === "function") window.openLoginComingSoonModal();
    });
  }

  // Minimize / collapse sidebar (desktop only)
  const collapseBtn = document.getElementById("sidebar-collapse") || document.querySelector(".sidebar-collapse-btn");
  const COLLAPSED_KEY = "ag_sidebar_minimized";
  const MOBILE_BREAKPOINT = 1024;
  const applyCollapsed = (collapsed, { force = false } = {}) => {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (!force && isMobile) {
      document.body.classList.remove("sidebar-collapsed");
      return;
    }
    if (collapsed) {
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.classList.remove("sidebar-collapsed");
    }
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("ag:sidebarResize"));
    }
  };
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY) === "1";
    applyCollapsed(saved);
  } catch {}
  if (collapseBtn) {
    collapseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      try { localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch {}
      applyCollapsed(collapsed, { force: true });
    });
  }
  // If user resizes to mobile, drop forced collapse; restore state when resizing back to desktop
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
      if (isMobile) {
        document.body.classList.remove("sidebar-collapsed");
      } else {
        try {
          const saved = localStorage.getItem(COLLAPSED_KEY) === "1";
          applyCollapsed(saved);
        } catch {}
      }
    }, 120);
  });

  // Active nav highlight on click
  const navItems = sidebar.querySelectorAll(".sidebar-nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
    });
  });

  // Initial points sync + hook into updatePointsDisplay
  syncSidebarPointsBadge();
  const origUpdate = typeof updatePointsDisplay === "function" ? updatePointsDisplay : null;
  if (origUpdate) {
    window.updatePointsDisplay = function () {
      const r = origUpdate.apply(this, arguments);
      requestAnimationFrame(syncSidebarPointsBadge);
      return r;
    };
  }
};

// ============== SMOOTH SCROLL FOR INTERNAL LINKS ==============
const setupSmoothAnchorScroll = () => {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href === "#" || href.length < 2) return;
    a.addEventListener("click", (e) => {
      const id = href.slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    });
  });
};

const setupSidebarCollapses = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  document.querySelectorAll(".sidebar-collapse-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wasOpen = btn.getAttribute("aria-expanded") === "true";
      const sub = btn.parentElement.querySelector(".sidebar-nav-submenu");
      btn.setAttribute("aria-expanded", String(!wasOpen));
      if (sub) sub.hidden = wasOpen;
    });
  });
};

const setupRoshteinLoginButtons = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  const loginModal = document.getElementById("login-modal");
  const topBtn = document.getElementById("discord-login-btn-top");
  const modalBtn = document.getElementById("discord-login-btn-modal");
  const legacyBtn = document.getElementById("discord-login-btn");

  const openLoginCs = () => {
    if (typeof window.openLoginComingSoonModal === "function") {
      window.openLoginComingSoonModal();
    }
  };

  topBtn && topBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLoginCs();
  });

  modalBtn && modalBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openLoginCs();
  });

  legacyBtn && legacyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasActiveSession() && getUiUser()) {
      toggleDropdown();
      return;
    }
    openLoginCs();
  });

  document.querySelectorAll("[data-modal-close]").forEach((c) => {
    c.addEventListener("click", () => {
      const m = c.closest(".modal-overlay");
      if (!m) return;
      if (m.id === "promo-info-modal" && typeof closePromoInfoModal === "function") {
        closePromoInfoModal();
      } else {
        closeAnimatedModal(m);
      }
    });
  });

  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        closeAnimatedModal(loginModal);
      }
    });
  }
};

const setupFilterBar = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  const cards = Array.from(document.querySelectorAll(".casino-card"));
  const searchEl = document.getElementById("filter-search");
  const sortEl = document.getElementById("filter-sort");
  const sortChips = Array.from(document.querySelectorAll(".filter-chip--sort, .fbar-chip--sort, .fb-chip--sort"));
  const tagChips = Array.from(document.querySelectorAll(".filter-chip--tag, .fbar-chip--tag, .fb-chip--tag"));
  const resetBtn = document.getElementById("filter-reset");
  const resultNumEl = document.getElementById("filter-result-num");
  const resultWrap = document.getElementById("filter-result-count");

  const activeTags = new Set();

  const getCardText = (card) => {
    const prov = card.getAttribute("data-provider") || "";
    const metaProv = PROMO_INFO_META && PROMO_INFO_META[prov];
    const providers = metaProv && metaProv.providers ? metaProv.providers.join(" ") : "";
    return (prov + " " + providers + " " + (card.textContent || "")).toLowerCase();
  };

  const getCardProviders = (card) => {
    const prov = card.getAttribute("data-provider") || "";
    const metaProv = PROMO_INFO_META && PROMO_INFO_META[prov];
    return (metaProv && metaProv.providers) || [];
  };

  const parseBonusPct = (card) => {
    const labels = card.querySelectorAll("[class*='-stat-label']");
    for (const lab of labels) {
      const t = (lab.textContent || "").toUpperCase();
      if (t.includes("UP TO") && t.includes("%")) {
        const m = (lab.textContent || "").match(/(\d+)\s*%/);
        if (m) return parseInt(m[1], 10);
        const val = lab.parentElement.querySelector("[class*='-stat-value']");
        if (val) {
          const raw = lab.textContent + " " + val.textContent;
          const m2 = raw.match(/(\d+)\s*%/);
          return m2 ? parseInt(m2[1], 10) : 0;
        }
      }
    }
    const txt = card.textContent || "";
    const m = txt.match(/(\d+)\s*%\s*UP\s*TO/i);
    if (m) return parseInt(m[1], 10);
    return 0;
  };

  const parseSpins = (card) => {
    const labels = card.querySelectorAll("[class*='-stat-label']");
    for (const lab of labels) {
      const t = (lab.textContent || "").toUpperCase();
      if (t.includes("FREE SPINS") || t.includes("SPINS")) {
        const val = lab.parentElement.querySelector("[class*='-stat-value']");
        if (val) {
          const n = parseInt((val.textContent || "").replace(/[^0-9]/g, ""), 10);
          if (!isNaN(n)) return n;
        }
      }
    }
    const m = (card.textContent || "").match(/(\d+)\s*(FREE\s*)?SPINS/i);
    return m ? parseInt(m[1], 10) : 0;
  };

  // Tag-regler: vilken casinon matchar vilka tags
  const CRYPTO_PROVIDERS = new Set(["shakebet", "duelbits", "stakeprix", "flush", "ritzo", "pubs"]);
  const FAST_PAYOUT_PROVIDERS = new Set(["gambid", "duelbits", "stakeprix", "shakebet", "flush", "pubs"]);
  const LIVE_CASINO_PROVIDERS = new Set(["lollyspins", "shakebet", "duelbits", "thunderpick", "flush", "ivibet", "ritzo", "gambid", "pubs"]);
  const EXCLUSIVE_PROVIDERS = new Set(["gambid", "stakeprix", "lollyspins", "shakebet", "pubs"]);
  const RECOMMENDED_ORDER = ["gambid", "stakeprix", "lollyspins", "shakebet", "duelbits", "thunderpick", "ivibet", "flush", "ritzo", "simsino", "wildroll", "nvbwin", "pubs"];
  const NEWEST_ORDER = ["pubs", "gambid", "stakeprix", "lollyspins", "shakebet", "duelbits", "thunderpick", "ivibet", "flush", "ritzo"];
  const getRecommendedRank = (card, order = RECOMMENDED_ORDER) => {
    const idx = order.indexOf((card.getAttribute("data-provider") || "").toLowerCase());
    return idx === -1 ? 999 : idx;
  };
  const getNewestRank = (card) => getRecommendedRank(card, NEWEST_ORDER);

  const cardMatchesTag = (card, tag) => {
    const prov = (card.getAttribute("data-provider") || "").toLowerCase();
    switch (tag) {
      case "free-spins":
        return parseSpins(card) > 0 || (card.textContent || "").toLowerCase().includes("spin");
      case "crypto":
        return CRYPTO_PROVIDERS.has(prov) || getCardProviders(card).some((p) => /crypto|bitcoin|ethereum|originals/i.test(p));
      case "fast-payout":
        return FAST_PAYOUT_PROVIDERS.has(prov) || (card.textContent || "").toLowerCase().includes("instant") || (card.textContent || "").toLowerCase().includes("fast");
      case "live-casino":
        return LIVE_CASINO_PROVIDERS.has(prov) || getCardProviders(card).some((p) => /live|evolution/i.test(p));
      case "exclusive":
        return EXCLUSIVE_PROVIDERS.has(prov) || /(exclusive|only here|anton|antongambles)/i.test(card.textContent || "");
      default:
        return true;
    }
  };

  const setSortChipActive = (sortValue) => {
    sortChips.forEach((chip) => {
      const isActive = chip.getAttribute("data-sort") === sortValue;
      chip.classList.toggle("is-active", isActive);
      chip.setAttribute("aria-selected", String(isActive));
    });
  };

  const updateCount = (visibleCards) => {
    if (!resultNumEl) return;
    resultNumEl.textContent = String(visibleCards.length);
    if (resultWrap) {
      resultWrap.style.animation = "none";
      void resultWrap.offsetWidth;
      resultWrap.style.animation = "";
    }
  };

  const applyAll = () => {
    const searchVal = searchEl ? searchEl.value : "";
    const sortVal = sortEl ? sortEl.value : "recommended";
    const q = (searchVal || "").trim().toLowerCase();

    let visible = cards.filter((c) => {
      if (q && !getCardText(c).includes(q)) return false;
      for (const tag of activeTags) {
        if (!cardMatchesTag(c, tag)) return false;
      }
      return true;
    });

    const sorted = [...visible];
    switch (sortVal) {
      case "recommended":
        sorted.sort((a, b) => getRecommendedRank(a) - getRecommendedRank(b));
        break;
      case "newest":
        sorted.sort((a, b) => getNewestRank(a) - getNewestRank(b));
        break;
      case "bonus-desc":
        sorted.sort((a, b) => parseBonusPct(b) - parseBonusPct(a));
        break;
      case "bonus-asc":
        sorted.sort((a, b) => parseBonusPct(a) - parseBonusPct(b));
        break;
      case "spins-desc":
        sorted.sort((a, b) => parseSpins(b) - parseSpins(a));
        break;
      case "name":
        sorted.sort((a, b) => (a.getAttribute("data-provider") || "").localeCompare(b.getAttribute("data-provider") || ""));
        break;
    }

    cards.forEach((c) => { c.style.display = visible.includes(c) ? "" : "none"; });

    sorted.forEach((c) => {
      if (c.parentNode) c.parentNode.appendChild(c);
    });

    updateCount(visible);
  };

  // ---------------- listeners: chips ----------------
  sortChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = chip.getAttribute("data-sort");
      if (sortEl && sortEl.value !== val) sortEl.value = val;
      setSortChipActive(val);
      if (sortEl) sortEl.dispatchEvent(new Event("change", { bubbles: true }));
      applyAll();
    });
  });

  tagChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const tag = chip.getAttribute("data-filter");
      if (!tag) return;
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        chip.classList.remove("is-active");
      } else {
        activeTags.add(tag);
        chip.classList.add("is-active");
      }
      applyAll();
    });
  });

  // ---------------- listeners: original + search/sort sync ----------
  searchEl && searchEl.addEventListener("input", () => applyAll());
  sortEl && sortEl.addEventListener("change", () => {
    setSortChipActive(sortEl.value);
    applyAll();
  });

  resetBtn && resetBtn.addEventListener("click", () => {
    if (searchEl) searchEl.value = "";
    if (sortEl) sortEl.value = "recommended";
    setSortChipActive("recommended");
    activeTags.clear();
    tagChips.forEach((c) => c.classList.remove("is-active"));
    applyAll();
  });

  // ⌘K / Ctrl+K shortcut → focus search
  document.addEventListener("keydown", (e) => {
    const isShortcut = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
    if (isShortcut && searchEl) {
      e.preventDefault();
      searchEl.focus({ preventScroll: false });
      searchEl.select();
    }
  });

  // ESC to clear search if focused
  searchEl && searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchEl.value = "";
      applyAll();
      searchEl.blur();
    }
  });

  // Initial uppdatering — tvinga ALWAYS Recommended på sidladdning / reload
  if (sortEl) sortEl.value = "recommended";
  setSortChipActive("recommended");
  applyAll();
  updateCount(cards);
};

const setupClaimButtons = () => {
  if (window.__GIVEAWAYS_SKIP_APP_FX__) return;
  document.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const prov = btn.getAttribute("data-claim");
      const toasts = document.getElementById("toast-container");
      if (toasts) {
        const t = document.createElement("div");
        t.className = "toast toast--success";
        t.textContent = `Launching ${prov ? prov.toUpperCase() : "casino"}…`;
        toasts.appendChild(t);
        setTimeout(() => t.remove(), 2800);
      }
      try {
        const info = PROMO_INFO_META && PROMO_INFO_META[prov];
        if (info && info.url) {
          window.open(info.url, "_blank", "noopener,noreferrer");
        } else {
          // Fallback: route to provider subpage if exists
          window.open(`${prov}/`, "_blank", "noopener,noreferrer");
        }
      } catch (_) {
        // No-op if PROMO_INFO_META not ready
      }
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  applyCleanUrl();
  createBackgroundParticles();
  createFloatingCoins();
  setupSidebar();
  setupSmoothAnchorScroll();
  setupLogoFallback();
  setupTwitchWidget();
  setupMobileNav();
  setupDiscordLogin();
  setupSidebarCollapses();
  setupRoshteinLoginButtons();
  setupFilterBar();
  setupClaimButtons();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const loginModal = document.getElementById("login-modal");
      if (loginModal && loginModal.classList.contains("active")) {
        closeAnimatedModal(loginModal);
      }
      const walletModal = document.getElementById("wallet-modal");
      if (walletModal && walletModal.classList.contains("active")) {
        closeAnimatedModal(walletModal);
      }
      closePromoInfoModal();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncPresenceHeartbeat().catch((error) => {
        console.error("Presence visibility sync failed:", error);
      });
    }
  });
  setupPointsSystem().catch((error) => {
    console.error("Failed to initialize points system:", error);
  });

  /* AntonGambles AG Points Store (global) — REDEEM Coins → Real Cash */
  const STORE_PACKAGES = Object.freeze({
    basic:  { id: "basic",  name: "Unlock $10",  usdOut: 10,  usdBaseOut: 10,  agCost: 10000,  agCostNoBonus: 10000,  bonusPercent: 0,  popular: false, tier: 1, cashPerAg: 0.001  },
    value:  { id: "value",  name: "Unlock $22",  usdOut: 22,  usdBaseOut: 20,  agCost: 20000,  agCostNoBonus: 22000,  bonusPercent: 10, popular: false, tier: 2, cashPerAg: 0.0011 },
    pro:    { id: "pro",    name: "Unlock $60",  usdOut: 60,  usdBaseOut: 50,  agCost: 50000,  agCostNoBonus: 60000,  bonusPercent: 20, popular: false, tier: 3, cashPerAg: 0.0012 },
    whale:  { id: "whale",  name: "Unlock $150", usdOut: 150, usdBaseOut: 100, agCost: 100000, agCostNoBonus: 150000, bonusPercent: 50, popular: true,  tier: 4, cashPerAg: 0.0015 },
    legend: { id: "legend", name: "Unlock $400", usdOut: 400, usdBaseOut: 250, agCost: 250000, agCostNoBonus: 400000, bonusPercent: 60, popular: false, tier: 5, cashPerAg: 0.0016 },
  });

  const triggerStoreConfetti = ({ durationMs = 3000, pieceCount = 80 } = {}) => {
    if (!document.body) return;
    try {
      let container = document.querySelector(".store-confetti-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "store-confetti-container";
        container.setAttribute("aria-hidden", "true");
        document.body.appendChild(container);
      } else {
        container.innerHTML = "";
      }
      const colors = ["#d4af37", "#ffd46a", "#ff8a00", "#ff6200", "#ffffff", "#ffa500"];
      const frag = document.createDocumentFragment();
      for (let i = 0; i < pieceCount; i++) {
        const piece = document.createElement("span");
        piece.className = "confetti-piece";
        const leftPct = Math.random() * 100;
        const size = 6 + Math.random() * 9;
        const delay = Math.random() * 0.25;
        const duration = 2.2 + Math.random() * 1.6;
        const color = colors[Math.floor(Math.random() * colors.length)];
        piece.style.left = `${leftPct}%`;
        piece.style.width = `${size}px`;
        piece.style.height = `${size * 1.45}px`;
        piece.style.background = color;
        piece.style.animationDuration = `${duration}s`;
        piece.style.animationDelay = `${delay}s`;
        piece.style.borderRadius = Math.random() > 0.5 ? "2px" : "999px";
        frag.appendChild(piece);
      }
      container.appendChild(frag);
      setTimeout(() => {
        if (container && container.parentNode) container.remove();
      }, durationMs + 1500);
    } catch (err) {
      console.warn("Confetti failed:", err);
    }
  };

  const formatNumber = (n) => {
    const num = Number(n) || 0;
    return num.toLocaleString("en-US");
  };

  const formatUsd = (n) => `$${Number(n || 0).toFixed(2)}`;

  const buyAgPointsPackage = async (packageId, { requireSessionFirst = true, showToasts = true } = {}) => {
    const pkg = STORE_PACKAGES[String(packageId || "").trim().toLowerCase()];
    if (!pkg) throw new Error("Invalid package");

    if (requireSessionFirst && typeof hasActiveSession === "function" && !hasActiveSession()) {
      if (typeof openLoginModal === "function") openLoginModal();
      throw new Error("Login required");
    }

    const profile = typeof getCurrentProfile === "function" ? getCurrentProfile() : null;
    const balance = profile?.points ?? (typeof loadStoredProfile === "function" ? (loadStoredProfile()?.points ?? 0) : 0);
    if (typeof balance === "number" && balance < pkg.agCost) {
      const err = new Error(`Not enough Coins — need ${formatNumber(pkg.agCost)} AG, you have ${formatNumber(balance)} AG.`);
      err.insufficientCoins = true;
      err.requiredAg = pkg.agCost;
      err.currentAg = balance;
      throw err;
    }

    let authHeaders = {};
    if (typeof getAuthHeaders === "function") authHeaders = getAuthHeaders() || {};

    const res = await fetch("/api/store/buy", {
      method: "POST",
      credentials: "same-origin",
      headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, authHeaders),
      body: JSON.stringify({ packageId: pkg.id }),
    });

    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok || !payload?.success) {
      const errMsg = payload?.error || `Redemption failed (HTTP ${res.status})`;
      const err = new Error(errMsg);
      err.statusCode = res.status;
      err.payload = payload;
      err.insufficientCoins = Boolean(payload?.insufficientCoins);
      err.requiredAg = payload?.requiredAg || null;
      err.currentAg = payload?.currentAg || null;
      throw err;
    }

    if (payload.profile && typeof setCurrentProfile === "function") {
      setCurrentProfile(payload.profile);
    } else if (typeof syncProfileFromServer === "function") {
      try { await syncProfileFromServer(); } catch { /* ignore */ }
    }

    if (showToasts) {
      try { triggerStoreConfetti(); } catch { /* ignore */ }
      if (typeof flashWalletToast === "function") {
        flashWalletToast(`Unlocked ${formatUsd(payload.addedCash || pkg.usdOut)} cash! 🎉`);
      }
    }

    return payload;
  };

  /* Exported global helpers (for bonus-hunt.js, leaderboard, etc) */
  window.__ag = {
    loadStoredProfile,
    isCurrentUserAdmin,
    getAuthHeaders,
    setCurrentProfile,
    syncProfileFromServer,
    getCurrentProfile: () => currentProfile,
    STORE_PACKAGES,
    buyAgPointsPackage,
    triggerStoreConfetti,
    formatNumber,
    formatUsd,
  };
  
  // Listen for storage changes from other tabs
  window.addEventListener("storage", (e) => {
    console.log("Storage event fired!", e);
    if (
      e.key === "discord_user" ||
      e.key === "discord_logged_in" ||
      e.key === AUTH_STORAGE_KEYS.sessionToken
    ) {
      console.log("Updating login button from storage event");
      updateLoginButton();
      checkDailyLogin().catch((error) => {
        console.error("Daily login sync failed:", error);
      });
    }
    if (
      e.key === AG_STORAGE_KEYS.points ||
      e.key === AUTH_STORAGE_KEYS.profile ||
      e.key === AUTH_STORAGE_KEYS.sessionToken ||
      e.key === "discord_user"
    ) {
      currentProfile = loadStoredProfile();
      updatePointsDisplay();
      refreshAgpMeta().catch((error) => {
        console.error("AGP meta sync failed:", error);
      });
      updateDailyStatus();
      updateVisitStatus();
      updateBonusStatus();
      updateStreamStatus();
      updateChatComposerState();
      renderChatMessages();
    }
  });

  /* =========================================================
     CASINO INFO MODAL (ⓘ button on every casino card)
     ========================================================= */
  const FALLBACK_RICH = {
    bonusPct: "200%", bonusMax: "$2,000", freeSpins: "200",
    wager: "x35", minDep: "$20", maxWd: "Unlimited", wdTime: "Instant",
    crypto: true, support: true, established: "2024",
    licences: "Curaçao",
    languages: "English, Spanish, French, German, Portuguese, Norwegian, Swedish, Finnish",
    payments: "Visa, Mastercard, Bitcoin, Ethereum, Litecoin, USDT, Bank Transfer"
  };
  function $id(id) { return document.getElementById(id); }
  function setTextSafe(id, text) { const el = $id(id); if (el) el.textContent = normalizePromoText(text, "—"); }
  function setHtmlSafe(id, html) { const el = $id(id); if (el) el.innerHTML = String(html ?? ""); }

  function getCasinoRichInfo(key) {
    const meta = getPromoInfoMeta(key);
    const rich = Object.assign({}, FALLBACK_RICH, meta.richInfo || {});
    return {
      tag: meta.tag || "CASINO",
      logo: meta.logo || "",
      displayName: meta.displayName || normalizePromoText(key, "Casino"),
      intro: meta.intro || meta.providerCopy || FALLBACK_RICH_INTRO,
      url: meta.url || "#",
      rich
    };
  }
  const FALLBACK_RICH_INTRO = "Solid casino lineup with modern slots, live dealer tables and a straightforward welcome bonus package. Always read full terms before claiming.";

  function fillCasinoInfoModal(providerKey) {
    const info = getCasinoRichInfo(providerKey);
    setTextSafe("ci-tag", info.tag);
    setTextSafe("ci-name", info.displayName);
    setTextSafe("ci-intro", info.intro);
    const logo = $id("ci-logo");
    if (logo) {
      logo.src = info.logo || "";
      logo.alt = `${info.displayName} logo`;
      logo.style.display = info.logo ? "block" : "none";
    }
    const screenSrc = getPromoScreenshot(providerKey);
    const screenSection = $id("ci-screen-section");
    const screenImg = $id("ci-browser-img");
    const screenUrl = $id("ci-browser-url");
    if (screenSection) {
      if (screenSrc) {
        screenSection.style.display = "";
        if (screenImg) {
          screenImg.src = screenSrc;
          screenImg.alt = `${info.displayName} site preview screenshot`;
        }
        if (screenUrl) {
          try {
            const host = new URL(info.url || "https://example.com").hostname.replace(/^www\./, "");
            screenUrl.textContent = host || "casino";
          } catch (_) { screenUrl.textContent = "casino"; }
        }
      } else {
        screenSection.style.display = "none";
      }
    }
    const r = info.rich;
    setTextSafe("ci-bonus-pct", r.bonusPct);
    setTextSafe("ci-bonus-max", r.bonusMax);
    setTextSafe("ci-freespins", r.freeSpins);
    setTextSafe("ci-wager", r.wager);
    setTextSafe("ci-min-dep", r.minDep);
    setTextSafe("ci-max-wd", r.maxWd);
    setTextSafe("ci-wd-time", r.wdTime);
    setTextSafe("ci-crypto", r.crypto ? "Yes" : "No");
    setTextSafe("ci-support", r.support ? "Yes" : "No");
    setTextSafe("ci-established", r.established);
    setTextSafe("ci-licences", r.licences);
    setTextSafe("ci-languages", r.languages);
    setTextSafe("ci-payments", r.payments);
    const claim = $id("ci-claim-btn");
    if (claim) {
      claim.dataset.claimUrl = info.url || "#";
    }

    const screenBtn = $id("ci-browser-mockup-btn");
    if (screenBtn && screenSrc) {
      const open = () => openScreenshotLightbox({
        src: screenSrc,
        title: `${info.displayName} — Site Preview`,
        siteUrl: info.url || "#"
      });
      screenBtn.onclick = (ev) => { ev.preventDefault(); open(); };
    } else if (screenBtn) {
      screenBtn.onclick = null;
    }
  }

  function openScreenshotLightbox({ src, title, siteUrl }) {
    const lb = $id("screenshot-lightbox");
    if (!lb || !src) return;
    const img = $id("screenshot-lightbox-img");
    const tEl = $id("screenshot-lightbox-title");
    const openEl = $id("screenshot-lightbox-open");
    if (img) { img.src = src; img.alt = title || "Expanded casino site preview"; }
    if (tEl) tEl.textContent = title || "Site Preview";
    if (openEl) {
      openEl.href = siteUrl || "#";
      openEl.style.pointerEvents = (!siteUrl || siteUrl === "#") ? "none" : "";
      openEl.style.opacity = (!siteUrl || siteUrl === "#") ? "0.5" : "";
    }
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeScreenshotLightbox() {
    const lb = $id("screenshot-lightbox");
    if (!lb) return;
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  const _initScreenshotLightbox = () => {
    const lb = $id("screenshot-lightbox");
    if (!lb || lb.dataset.screenshotLightboxBound === "1") return;
    lb.dataset.screenshotLightboxBound = "1";
    lb.addEventListener("click", (e) => {
      if (e.target.closest(".screenshot-lightbox-close") || e.target === lb) {
        e.preventDefault();
        closeScreenshotLightbox();
      }
    });
  };
  document.addEventListener("DOMContentLoaded", _initScreenshotLightbox);
  if (document.readyState !== "loading") _initScreenshotLightbox();
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const lb = $id("screenshot-lightbox");
      if (lb && lb.classList.contains("is-open")) closeScreenshotLightbox();
    }
  });

  function openCasinoInfoModal(providerKey) {
    fillCasinoInfoModal(providerKey);
    const modal = $id("casino-info-modal");
    if (modal) openAnimatedModal(modal);
  }
  window.openCasinoInfoModal = openCasinoInfoModal;

  /* Click handler for ⓘ buttons (delegated — catches dynamically rendered too) */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-info-trigger]");
    if (btn) {
      const card = btn.closest("[data-provider]");
      const provider = normalizePromoLookupKey(
        card?.getAttribute("data-provider")
        || btn.getAttribute("data-provider")
        || card?.id?.replace(/-bonus-card$|-list-bonus-card$/ig, "")
        || ""
      );
      if (provider) openCasinoInfoModal(provider);
      return;
    }
    /* Click on Claim Bonus inside modal */
    const claimBtn = e.target.closest("#ci-claim-btn");
    if (claimBtn) {
      const url = claimBtn.getAttribute("data-claim-url") || "#";
      if (!url || url === "#") {
        alert("Claim link not available for this casino yet.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });
});
