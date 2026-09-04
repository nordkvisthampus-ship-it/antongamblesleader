const express = require("express");
const path = require("path");
const fsSync = require("fs");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");
const {
  upsertDiscordUser,
  getUserProfile,
  claimReward,
  getLeaderboard,
  getChatMessages,
  getGiveawayOverview,
  getGiveawayOverviewReadOnly,
  enterGiveaway,
  createGiveaway,
  drawGiveaway,
  getGiveawayHistory,
  getStats,
  getUserAdminSnapshot,
  recordUserPresence,
  adjustPoints,
  getRecentEvents,
  resetUserProgress,
  recordRewardHeartbeat,
  searchUsers,
  sendChatMessage,
  sendChatAnnouncement,
  sendChatTip,
  setPoints,
  clearChatMessages,
  syncDiscordMemberAccess,
  createDepositGiveaway,
  getDepositGiveawayOverview,
  submitDepositGiveawayEntry,
  reviewDepositGiveawayEntry,
  setDepositGiveawayPhase,
  drawDepositGiveawayWinners,
  resetDepositGiveaway,
  buyAgPointsPackage,
} = require("./store");
const { createDiscordBot } = require("./discord-bot");
require("dotenv").config();

// #region debug-point A:server-crash-loop
const reportServerCrashDebug = (hypothesisId, msg, data = {}, runId = "pre-fix") => {
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "server-crash-loop",
      runId: process.env.DEBUG_RUN_ID || runId,
      hypothesisId,
      location: "server.js",
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};

const reportGiveawayServerDebug = (hypothesisId, msg, data = {}, runId = "pre-fix") => {
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "giveaway-regression",
      runId: process.env.DEBUG_RUN_ID || runId,
      hypothesisId,
      location: "server.js",
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};

process.on("beforeExit", (code) => {
  reportServerCrashDebug("A", "process beforeExit fired", { code });
});

process.on("exit", (code) => {
  reportServerCrashDebug("A", "process exit fired", { code });
});

process.on("uncaughtException", (error) => {
  reportServerCrashDebug("C", "uncaughtException", {
    message: error?.message || null,
    stack: error?.stack || null,
  });
});

process.on("unhandledRejection", (reason) => {
  reportServerCrashDebug("B", "unhandledRejection", {
    message: reason?.message || String(reason),
    stack: reason?.stack || null,
  });
});
// #endregion

// #region debug-point oauth-coins-railway-report
const OAUTH_COINS_DEBUG_ENV_FILE = path.join(__dirname, ".dbg", "oauth-coins-railway.env");
const reportOauthCoinsDebug = (hypothesisId, msg, data = {}, runId = "pre-fix") => {
  let debugUrl = "http://127.0.0.1:7777/event";
  let sessionId = "oauth-coins-railway";
  try {
    const envContent = fsSync.readFileSync(OAUTH_COINS_DEBUG_ENV_FILE, "utf8");
    debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugUrl;
    sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch {}

  fetch(debugUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      runId: process.env.DEBUG_RUN_ID || runId,
      hypothesisId,
      location: "server.js",
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

const app = express();
const PORT = Number.parseInt(process.env.PORT || "8000", 10);
const AFFILIATE_REDIRECTS = Object.freeze({});
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET || "antongambles-local-dev-session-secret-change-me";
const SESSION_COOKIE_NAME = "ag_session_token";
const DISABLE_VISIT_DURATION_POINTS = String(process.env.DISABLE_VISIT_DURATION_POINTS || "").toLowerCase() === "true";
const DISABLE_GUILD_CHECK_LOCAL = String(process.env.DISABLE_LOCAL_GUILD_CHECK || "").toLowerCase() === "true";
const DISABLE_GIVEAWAY_ADMIN_CHECK = String(process.env.DISABLE_GIVEAWAY_ADMIN_CHECK || "").toLowerCase() === "true";

const REQUIRED_LOGIN_GUILD_ID = DISABLE_GUILD_CHECK_LOCAL
  ? ""
  : String(
      process.env.DISCORD_REQUIRED_GUILD_ID || process.env.DISCORD_BOT_GUILD_ID || process.env.DISCORD_GUILD_ID || ""
    ).trim();
const ADMIN_USER_IDS = new Set(
  String(process.env.DISCORD_ADMIN_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const finalizeAdminProfile = (profile) => {
  if (!profile) return profile;
  const adminBypass = Boolean(profile.discordId) && (
    DISABLE_GIVEAWAY_ADMIN_CHECK ||
    (ADMIN_USER_IDS.size > 0 && ADMIN_USER_IDS.has(String(profile.discordId)))
  );
  const out = { ...profile, isAdmin: Boolean(profile.isAdmin) || adminBypass };
  return out;
};

if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is missing. Using local development fallback secret.");
}
const discordBot = createDiscordBot({
  upsertDiscordUser,
  getUserProfile,
  claimReward,
  getLeaderboard,
  getGiveawayOverview: getGiveawayOverviewReadOnly,
  enterGiveaway,
  createGiveaway,
  drawGiveaway,
  getGiveawayHistory,
  getStats,
  getUserAdminSnapshot,
  adjustPoints,
  getRecentEvents,
  resetUserProgress,
  searchUsers,
  setPoints,
});

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get("/go/:offer", (req, res) => {
  const offerKey = String(req.params.offer || "").trim().toLowerCase();
  const redirectUrl = AFFILIATE_REDIRECTS[offerKey];

  if (!redirectUrl) {
    res.status(404).send("Offer not found");
    return;
  }

  res.set("Cache-Control", "no-store");
  res.redirect(302, redirectUrl);
});

const CASINO_ROUTES = Object.freeze([
  "duel",
  "duelbits",
  "flush",
  "gambid",
  "ivibet",
  "lollyspins",
  "nvcasino",
  "pubs",
  "ritzo",
  "shakebet",
  "stakeprix",
  "thunderpick",
]);

const casinoRouteSet = new Set(CASINO_ROUTES);

const STATIC_PAGE_ROUTES = Object.freeze([
  "leaderboard",
  "levels",
  "giveaways",
  "shop",
  "bonus-hunt",
  "blackjack",
  "keno",
  "admin",
]);
const staticPageSet = new Set(STATIC_PAGE_ROUTES);

app.get(
  ["/:casino", "/:casino/"],
  (req, res, next) => {
    const casino = String(req.params.casino || "").trim().toLowerCase();
    if (!casinoRouteSet.has(casino)) {
      if (staticPageSet.has(casino)) {
        res.set("Cache-Control", "no-store");
        res.sendFile(path.join(__dirname, casino, "index.html"));
        return;
      }
      next();
      return;
    }
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, casino, "index.html"));
  }
);

const SITE_URL = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, "") : "";

const getRequestOrigin = (req) => {
  if (SITE_URL) {
    try {
      const u = new URL(SITE_URL);
      return `${u.protocol}//${u.host}`;
    } catch (_) {}
  }
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${req.get("host")}`;
};

const parseCookieHeader = (cookieHeader = "") =>
  String(cookieHeader || "")
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) return cookies;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});

const createSessionToken = (discordId) => {
  const payload = {
    sub: discordId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const verifySessionToken = (token) => {
  if (!token || !token.includes(".")) return null;

  try {
    const [encodedPayload, signature] = token.split(".");
    const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

const logServerError = (label, error, extra = {}) => {
  console.error(label, {
    message: error?.message || String(error),
    statusCode: error?.statusCode || error?.response?.status || null,
    data: error?.response?.data || null,
    stack: error?.stack || null,
    ...extra,
  });
};

const runOptionalDiscordTask = async (label, task) => {
  try {
    return await task();
  } catch (error) {
    logServerError(label, error);
    return null;
  }
};

const runOptionalDiscordTasks = (tasks = []) =>
  Promise.allSettled(
    tasks.map((entry) =>
      runOptionalDiscordTask(entry.label, entry.task)
    )
  );

const syncDiscordRankRole = async (profile) => {
  if (!profile?.discordId || typeof discordBot.syncRankRole !== "function") return null;
  return runOptionalDiscordTask("Discord rank sync failed", () => discordBot.syncRankRole(profile));
};

const mergeProfileAccess = (profile, access = {}) => {
  if (!profile) return null;

  return {
    ...profile,
    isAdmin: Boolean(access.isAdmin ?? ADMIN_USER_IDS.has(profile.discordId)),
    discordRoleIds: Array.isArray(access.roleIds)
      ? [...new Set(access.roleIds.filter(Boolean))]
      : Array.isArray(profile.discordRoleIds)
        ? [...new Set(profile.discordRoleIds.filter(Boolean))]
        : [],
    discordRoleNames: Array.isArray(access.roleNames)
      ? [...new Set(access.roleNames.filter(Boolean))]
      : Array.isArray(profile.discordRoleNames)
        ? [...new Set(profile.discordRoleNames.filter(Boolean))]
        : [],
  };
};

const syncProfileAccess = async (profile) => {
  if (!profile?.discordId) return profile || null;

  const fallbackProfile = mergeProfileAccess(profile);
  if (typeof discordBot.getMemberAccessProfile !== "function") {
    return fallbackProfile;
  }

  try {
    const access = await discordBot.getMemberAccessProfile(profile.discordId);
    if (!access) {
      return fallbackProfile;
    }

    const mergedProfile = mergeProfileAccess(profile, access);
    const persistedProfile = await syncDiscordMemberAccess({
      discordId: profile.discordId,
      isAdmin: mergedProfile.isAdmin,
      roleIds: mergedProfile.discordRoleIds,
      roleNames: mergedProfile.discordRoleNames,
    });

    return persistedProfile || mergedProfile;
  } catch (error) {
    logServerError("Discord access sync failed", error, {
      discordId: profile.discordId,
    });
    return fallbackProfile;
  }
};

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : cookies[SESSION_COOKIE_NAME] || null;
  const payload = verifySessionToken(token);

  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.discordId = payload.sub;
  next();
};

const requireAdmin = async (req, res, next) => {
  const profile = await syncProfileAccess(await getUserProfile(req.discordId));
  const envAdminBypass =
    DISABLE_GIVEAWAY_ADMIN_CHECK ||
    (ADMIN_USER_IDS.size > 0 && req.discordId && ADMIN_USER_IDS.has(String(req.discordId)));
  const isAuthed = Boolean(profile?.isAdmin) || envAdminBypass;
  if (!isAuthed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (profile) {
    profile.isAdmin = true;
    req.profile = profile;
  } else {
    req.profile = { discordId: req.discordId, isAdmin: true };
  }
  next();
};

app.get("/api/discord/callback", async (req, res) => {
  const { code } = req.query;
  const requestId = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!code) {
    reportOauthCoinsDebug("A", "oauth callback missing code", { requestId });
    res.set("x-auth-request-id", requestId);
    res.status(400).json({ error: "Missing Discord code" });
    return;
  }

  try {
    reportOauthCoinsDebug("A", "oauth callback start", {
      requestId,
      hasCode: Boolean(code),
      origin: getRequestOrigin(req),
    });
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "1521498901792690226",
        client_secret: process.env.DISCORD_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: `${getRequestOrigin(req)}/login-loading.html`,
        scope: "identify email guilds",
      }),
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    reportOauthCoinsDebug("A", "oauth token exchange complete", {
      requestId,
      hasAccessToken: Boolean(tokenResponse.data?.access_token),
    });

    const accessToken = tokenResponse.data.access_token;
    const [userResponse, guildsResponse] = await Promise.all([
      axios.get("https://discord.com/api/users/@me", {
        timeout: 15000,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get("https://discord.com/api/users/@me/guilds", {
        timeout: 15000,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);
    reportOauthCoinsDebug("A", "oauth discord identity fetched", {
      requestId,
      discordId: userResponse.data?.id || null,
      guildCount: Array.isArray(guildsResponse.data) ? guildsResponse.data.length : null,
    });

    const guilds = Array.isArray(guildsResponse.data) ? guildsResponse.data : [];
    const isInOauthGuildList = !REQUIRED_LOGIN_GUILD_ID || guilds.some((guild) => guild?.id === REQUIRED_LOGIN_GUILD_ID);
    let isInRequiredGuild = isInOauthGuildList;
    let guildCheckSource = isInOauthGuildList ? "oauth-guilds" : "none";

    if (!isInRequiredGuild && REQUIRED_LOGIN_GUILD_ID && typeof discordBot.getMemberAccessProfile === "function") {
      try {
        const accessProfile = await discordBot.getMemberAccessProfile(userResponse.data?.id || "");
        const isMemberViaBot = Array.isArray(accessProfile?.roleIds) && accessProfile.roleIds.length > 0;
        if (isMemberViaBot) {
          isInRequiredGuild = true;
          guildCheckSource = "bot-member-access";
        }
      } catch (membershipError) {
        console.warn("Discord guild membership fallback check failed:", membershipError?.message || membershipError);
      }
    }

    if (!isInRequiredGuild) {
      reportOauthCoinsDebug("A", "oauth blocked because user is not in required guild", {
        requestId,
        discordId: userResponse.data?.id || null,
        requiredGuildId: REQUIRED_LOGIN_GUILD_ID,
        guildCheckSource,
      });
      res.set("x-auth-request-id", requestId);
      res.status(403).json({
        error: "You must be in the AntonGambles Discord to log in.",
        code: "DISCORD_GUILD_REQUIRED",
      });
      return;
    }

    const syncResult = await upsertDiscordUser(userResponse.data, guilds);
    const sessionToken = createSessionToken(userResponse.data.id);
    reportOauthCoinsDebug("A", "oauth storage sync complete", {
      requestId,
      discordId: syncResult.profile?.discordId || null,
      isNew: Boolean(syncResult.isNew),
      guildCheckSource,
    });
    let profileSyncStartStep = "syncProfileAccess";
    const profileAccess = await syncProfileAccess(syncResult.profile).catch((spErr) => {
      reportOauthCoinsDebug("A", "oauth syncProfileAccess non-fatal error", {
        requestId,
        message: spErr?.message || null,
      });
      return syncResult.profile || null;
    });

    const finalProfile = finalizeAdminProfile(profileAccess);

    const responsePayload = {
      user: userResponse.data,
      guilds,
      profile: finalProfile,
      sessionToken,
    };

    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: String(req.get("x-forwarded-proto") || req.protocol).includes("https"),
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
    res.set("Cache-Control", "no-store");
    res.set("x-auth-request-id", requestId);
    res.json(responsePayload);
    reportOauthCoinsDebug("A", "oauth response sent", {
      requestId,
      discordId: syncResult.profile?.discordId || null,
      isNew: Boolean(syncResult.isNew),
    });

    const optionalTasks = [];
    if (syncResult.isNew) {
      optionalTasks.push({
        label: "Discord signup audit message failed",
        task: () =>
          discordBot.sendAuditMessage(
            `Ny account: ${syncResult.profile.globalName || syncResult.profile.username} (${syncResult.profile.discordId}) skapade konto pa sajten.`,
            { dedupeKey: `signup-audit:${syncResult.profile.discordId}` }
          ),
      });
      optionalTasks.push({
        label: "Discord signup feed message failed",
        task: () =>
          discordBot.sendUserSignupMessage({
            profile: syncResult.profile,
            discordUser: userResponse.data,
            guilds,
          }),
      });
    } else {
      optionalTasks.push({
        label: "Discord login audit message failed",
        task: () =>
          discordBot.sendAuditMessage(
            `Login: ${syncResult.profile.globalName || syncResult.profile.username} (${syncResult.profile.discordId}) loggade in.`,
            { dedupeKey: `login:${syncResult.profile.discordId}`, dedupeWindowMs: 60000 }
          ),
      });
    }
    optionalTasks.push({
      label: "Discord rank sync after login failed",
      task: () => syncDiscordRankRole(syncResult.profile),
    });

    reportOauthCoinsDebug("A", "oauth optional tasks scheduled", {
      requestId,
      taskCount: optionalTasks.length,
    });
    try {
      void runOptionalDiscordTasks(optionalTasks);
    } catch (optionalError) {
      reportOauthCoinsDebug("A", "oauth optional task scheduling error", {
        requestId,
        message: optionalError?.message || null,
        stack: optionalError?.stack || null,
      });
      logServerError("Discord OAuth optional task scheduling error", optionalError, {
        discordId: syncResult.profile?.discordId || null,
      });
    }
  } catch (error) {
    reportOauthCoinsDebug("A", "oauth callback error", {
      requestId,
      message: error?.message || null,
      status: error?.status || error?.response?.status || null,
      stack: error?.stack || null,
      data: error?.response?.data || null,
    });
    logServerError("Discord OAuth error", error);
    const rawMessage = error?.message || String(error || "");
    const isRateLimit = /sending messages too fast|rate.limit|429/i.test(rawMessage);
    const isTimeout = /timeout|abort|timed out|ETIMEDOUT|ECONNRESET/i.test(rawMessage);
    let publicMessage = "Failed to authenticate with Discord";
    if (isRateLimit) {
      publicMessage = "Discord is rate limiting traffic right now. Please wait 30 seconds and try again.";
    } else if (isTimeout) {
      publicMessage = "Authentication timed out. Please try again.";
    } else if (rawMessage && rawMessage.length < 200) {
      publicMessage = rawMessage;
    }
    res.set("x-auth-request-id", requestId);
    res.status(500).json({
      error: publicMessage,
      code: isRateLimit ? "DISCORD_RATE_LIMIT" : (isTimeout ? "DISCORD_TIMEOUT" : "DISCORD_AUTH_ERROR"),
    });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  const profile = await getUserProfile(req.discordId);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const syncedProfile = await syncProfileAccess(profile).catch(() => profile);
  res.json({ profile: finalizeAdminProfile(syncedProfile) });
});

app.get("/api/me/activity", requireAuth, async (req, res) => {
  const events = await getRecentEvents(12, req.discordId);
  res.json({ events });
});

app.post("/api/points/claim", requireAuth, async (req, res) => {
  const { action, bonusKey } = req.body || {};
  const requestId = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (action === "visit-duration" && DISABLE_VISIT_DURATION_POINTS) {
      const profile = await getUserProfile(req.discordId);
      reportOauthCoinsDebug("B", "points claim skipped because visit-duration is disabled", {
        requestId,
        discordId: req.discordId,
      });
      res.json({
        applied: false,
        amount: 0,
        action,
        reason: "Visit-duration points are disabled",
        remainingMs: 0,
        disabled: true,
        profile,
      });
      return;
    }

    reportOauthCoinsDebug("B", "points claim start", {
      requestId,
      discordId: req.discordId,
      action,
      bonusKey,
    });
    const result = await claimReward({
      discordId: req.discordId,
      action,
      bonusKey,
    });
    reportOauthCoinsDebug("B", "points claim result", {
      requestId,
      discordId: req.discordId,
      action,
      applied: Boolean(result?.applied),
      remainingMs: result?.remainingMs ?? null,
      points: result?.profile?.points ?? null,
    });
    res.json(result);
  } catch (error) {
    if (action === "visit-duration" && Number(error?.statusCode || 0) === 429) {
      const profile = await getUserProfile(req.discordId).catch(() => null);
      const fallbackPayload = {
        applied: false,
        amount: 0,
        action,
        reason: error?.message || "Visit-duration throttled",
        remainingMs: Number.isFinite(error?.remainingMs) ? error.remainingMs : 60 * 1000,
        throttled: true,
        profile,
      };
      reportOauthCoinsDebug("B", "points claim throttled fallback", {
        requestId,
        discordId: req.discordId,
        action,
        message: error?.message || null,
        statusCode: error?.statusCode || null,
      });
      logServerError("Points claim throttled fallback", error, { action, bonusKey, discordId: req.discordId });
      res.json(fallbackPayload);
      return;
    }

    reportOauthCoinsDebug("B", "points claim error", {
      requestId,
      discordId: req.discordId,
      action,
      bonusKey,
      message: error?.message || null,
      statusCode: error?.statusCode || null,
      stack: error?.stack || null,
    });
    logServerError("Points claim error", error, { action, bonusKey, discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to claim reward" });
  }
});

app.post("/api/store/buy", requireAuth, async (req, res) => {
  const { packageId } = req.body || {};
  const requestId = `store-buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    reportOauthCoinsDebug("B", "store buy start", {
      requestId,
      discordId: req.discordId,
      packageId: packageId || null,
    });

    const result = await buyAgPointsPackage({
      discordId: req.discordId,
      packageId,
    });

    const syncedProfile = await syncProfileAccess(result.profile).catch(() => result.profile);
    const finalProfile = finalizeAdminProfile(syncedProfile);

    reportOauthCoinsDebug("B", "store buy success", {
      requestId,
      discordId: req.discordId,
      packageId: result?.packageId || null,
      deductedAg: result?.deductedAg || null,
      addedCash: result?.addedCash || null,
      newAg: result?.newAg || null,
      newCash: result?.newCashBalance || null,
    });

    res.json({
      success: true,
      packageId: result.packageId,
      packageName: result.packageName,
      usdOut: result.usdOut,
      bonusPercent: result.bonusPercent,
      deductedAg: result.deductedAg,
      addedCash: result.addedCash,
      previousAg: result.previousAg,
      newAg: result.newAg,
      previousCashBalance: result.previousCashBalance,
      newCashBalance: result.newCashBalance,
      savedAgVsStandalone: result.savedAgVsStandalone,
      cashPerAg: result.cashPerAg,
      insufficientCoins: false,
      event: result.event,
      profile: finalProfile,
    });
  } catch (error) {
    const insufficientCoins = Boolean(error?.insufficientCoins);
    reportOauthCoinsDebug("B", "store buy error", {
      requestId,
      discordId: req.discordId,
      packageId: packageId || null,
      insufficientCoins,
      requiredAg: error?.requiredAg || null,
      currentAg: error?.currentAg || null,
      message: error?.message || null,
      statusCode: error?.statusCode || null,
      stack: error?.stack || null,
    });
    logServerError("Store buy error", error, { packageId, discordId: req.discordId });
    res.status(error.statusCode || 500).json({
      error: error.message || "Failed to complete redemption",
      insufficientCoins,
      requiredAg: error?.requiredAg || null,
      currentAg: error?.currentAg || null,
    });
  }
});

app.post("/api/points/heartbeat", requireAuth, async (req, res) => {
  const reward = typeof req.body?.reward === "string" ? req.body.reward : "";
  const requestId = `heartbeat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (reward === "visit-duration" && DISABLE_VISIT_DURATION_POINTS) {
      reportOauthCoinsDebug("B", "points heartbeat skipped because visit-duration is disabled", {
        requestId,
        discordId: req.discordId,
      });
      res.json({
        reward,
        accumulatedMs: 0,
        remainingMs: 0,
        disabled: true,
      });
      return;
    }

    reportOauthCoinsDebug("B", "points heartbeat start", {
      requestId,
      discordId: req.discordId,
      reward,
    });
    const progress = await recordRewardHeartbeat({
      discordId: req.discordId,
      reward,
    });
    reportOauthCoinsDebug("B", "points heartbeat result", {
      requestId,
      discordId: req.discordId,
      reward,
      accumulatedMs: progress?.accumulatedMs ?? null,
      remainingMs: progress?.remainingMs ?? null,
    });
    res.json(progress);
  } catch (error) {
    reportOauthCoinsDebug("B", "points heartbeat error", {
      requestId,
      discordId: req.discordId,
      reward,
      message: error?.message || null,
      statusCode: error?.statusCode || null,
      stack: error?.stack || null,
    });
    logServerError("Points heartbeat error", error, { reward, discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to record reward heartbeat" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 25);
  const leaderboard = await getLeaderboard(limit);
  res.json({ leaderboard });
});

/* ============================================================
   GAMBIT WAGER RACE API (PUBLIC, NO KEY!)
   — Hämtar LIVE leaderboard för Anton's $5,000 Wager Race från Gambid
   — Docs: https://gambid.gg/api/public/race/antons-5k-wager-race
   — Ingen API key behövs, CORS = *, 30s edge cache på Gambids sida
   ============================================================ */
const GAMBID_WAGER_RACE_DEFAULT_URL =
  "https://gambid.gg/api/public/race/antons-5k-wager-race?limit=100";
const GAMBID_WAGER_RACE_REFERRAL_URL =
  "https://gambid.gg/promotions/antons-5k-wager-race?r=anton";
const GAMBID_WAGER_RACE_CACHE_MS = 30 * 1000; // 30s = matcha Gambids edge cache
let gambidWagerRaceCache = { data: null, updatedAt: 0 };

const GAMBID_PRIZE_MAP = Object.freeze({
   1: 3000,   2: 1000,   3: 600,   4: 150,   5: 75,
   6:   50,   7:   40,   8:  35,   9:  30,  10: 20,
});

const fmtPrize = (usd) => usd == null ? null : `$${Number(usd).toLocaleString("en-US")}`;

const GAMBID_MOCK_PLAYERS = Object.freeze([
  { rank: 1, player: "AntonGambles",  score: 1245600, scoreFormatted: "$1,245,600", prize: 3000, prizeFormatted: "$3,000" },
  { rank: 2, player: "HighRoller99",  score:  842900, scoreFormatted: "$842,900",   prize: 1000, prizeFormatted: "$1,000" },
  { rank: 3, player: "CashAddict",    score:  612300, scoreFormatted: "$612,300",   prize:  600, prizeFormatted: "$600" },
  { rank: 4, player: "LuckyLars",     score:  428120, scoreFormatted: "$428,120",   prize:  150, prizeFormatted: "$150" },
  { rank: 5, player: "SlotQueen",     score:  384500, scoreFormatted: "$384,500",   prize:   75, prizeFormatted: "$75" },
  { rank: 6, player: "VikingGains",   score:  284500, scoreFormatted: "$284,500",   prize:   50, prizeFormatted: "$50" },
  { rank: 7, player: "KenoKungen",    score:  241480, scoreFormatted: "$241,480",   prize:   40, prizeFormatted: "$40" },
  { rank: 8, player: "DealMeOut",     score:  228500, scoreFormatted: "$228,500",   prize:   35, prizeFormatted: "$35" },
  { rank: 9, player: "BlackjackBen",  score:  196800, scoreFormatted: "$196,800",   prize:   30, prizeFormatted: "$30" },
  { rank: 10, player: "CryptoCarl",   score:  182400, scoreFormatted: "$182,400",   prize:   20, prizeFormatted: "$20" },
  { rank: 11, player: "FreeSpinFiona",score:  165200, scoreFormatted: "$165,200",   prize: null, prizeFormatted: null },
  { rank: 12, player: "RakebackRob",  score:  148900, scoreFormatted: "$148,900",   prize: null, prizeFormatted: null },
  { rank: 13, player: "MaxBetMia",    score:  132000, scoreFormatted: "$132,000",   prize: null, prizeFormatted: null },
  { rank: 14, player: "NoLossNina",   score:  118500, scoreFormatted: "$118,500",   prize: null, prizeFormatted: null },
  { rank: 15, player: "BonusHunter",  score:  105200, scoreFormatted: "$105,200",   prize: null, prizeFormatted: null },
]);

const GAMBID_MOCK_RACE_META = Object.freeze({
  slug: "antons-5k-wager-race",
  name: "Anton’s $5,000 Monthly Race",
  status: "active",
  scoredBy: "wagered",
  startsAt: "2026-08-24T22:47:00.000Z",
  endsAt:   "2026-09-25T22:42:00.000Z",
  currency: "USDSM",
  prizePool: 5000,
  prizePoolFormatted: "$5,000",
  description: "Compete throughout the month and climb the leaderboard based on your total wagering. Top 10 split $5,000.",
  imageUrl: null,
  url: "https://gambid.gg/promotions/antons-5k-wager-race",
  leaderboardCount: 15,
});

/**
 * Hämta RIKTIG data från Gambids public race API.
 * Returnerar null om API:et är nere/failar.
 */
async function fetchGambidWagerRaceLive() {
  const url = process.env.GAMBID_API_URL || GAMBID_WAGER_RACE_DEFAULT_URL;
  try {
    const { data, status } = await axios({
      method: "GET",
      url,
      timeout: 8000,
      validateStatus: (s) => s === 200,
    });
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (error) {
    logServerError("Gambid Wager Race public API fetch failed (fallback to mock)", error, { url });
    return null;
  }
}

/**
 * Normalisera spelar-rader från Gambids public API response till vårt internt format.
 * Gambid public: [{ rank, player, score, scoreFormatted, prize, prizeFormatted }]
 * Vårt format: [{ rank, username, handle, wageredUsd, wageredFormatted, coins, prizeUsd, prizeFormatted, avatar, initials }]
 */
function normalizeGambidLeaderboard(rawRows = [], fallbackCount = 0) {
  const rows = Array.isArray(rawRows) && rawRows.length ? rawRows : [];
  return rows
    .map((p, idx) => {
      const wageredUsd =
        typeof p.score === "number" ? p.score :
        typeof p.wageredUsd === "number" ? p.wageredUsd :
        typeof p.wagered === "number" ? p.wagered : 0;
      const coins = Math.round(wageredUsd * 1000);

      const rankNum =
        typeof p.rank === "number" ? p.rank : idx + 1;
      const prizeUsd =
        typeof p.prize === "number" ? p.prize :
        typeof p.prizeUsd === "number" ? p.prizeUsd :
        GAMBID_PRIZE_MAP[rankNum] ?? null;
      const prizeFormatted = p.prizeFormatted || fmtPrize(prizeUsd);
      const wageredFormatted = p.scoreFormatted ||
        (typeof wageredUsd === "number"
          ? "$" + wageredUsd.toLocaleString("en-US")
          : null);

      return {
        rank: rankNum,
        username: p.player || p.username || p.name || p.playerName || `Player ${idx + 1}`,
        handle: p.handle || null,
        avatar: p.avatar || p.avatarUrl || p.profilePicture || null,
        wageredUsd,
        wageredFormatted,
        coins,
        prizeUsd,
        prizeFormatted,
      };
    })
    .sort((a, b) => (b.wageredUsd || 0) - (a.wageredUsd || 0))
    .map((p, i) => {
      const finalRank = i + 1;
      const prizeUsd =
        typeof p.prizeUsd === "number" ? p.prizeUsd :
        GAMBID_PRIZE_MAP[finalRank] ?? null;
      return {
        ...p,
        rank: finalRank,
        prizeUsd,
        prizeFormatted: p.prizeFormatted || fmtPrize(prizeUsd),
      };
    });
}

app.get("/api/gambid/wager-race", async (req, res) => {
  const force = req.query.force === "1";
  const forceMock = req.query.mock === "1";
  const now = Date.now();
  const hasOverrideUrl = Boolean(process.env.GAMBID_API_URL);

  if (!force && gambidWagerRaceCache.data && (now - gambidWagerRaceCache.updatedAt < GAMBID_WAGER_RACE_CACHE_MS)) {
    res.setHeader("X-Cache", "HIT");
    res.json(gambidWagerRaceCache.data);
    return;
  }

  let players = null;
  let raceMeta = null;
  let source = "mock";

  if (!forceMock) {
    const raw = await fetchGambidWagerRaceLive();
    if (raw && Array.isArray(raw.leaderboard)) {
      players = normalizeGambidLeaderboard(raw.leaderboard);
      raceMeta = {
        slug: raw.slug || "antons-5k-wager-race",
        name: raw.name || "Anton's $5,000 Wager Race",
        status: raw.status || "active",
        scoredBy: raw.scoredBy || "wagered",
        startsAt: raw.startsAt || null,
        endsAt: raw.endsAt || null,
        currency: raw.currency || "USDSM",
        prizePool: typeof raw.prizePool === "number" ? raw.prizePool : 5000,
        prizePoolFormatted: raw.prizePoolFormatted || "$5,000",
        description: raw.description || null,
        imageUrl: raw.imageUrl || null,
        url: raw.url || GAMBID_WAGER_RACE_REFERRAL_URL,
        leaderboardCount: typeof raw.leaderboardCount === "number" ? raw.leaderboardCount : players.length,
        fetchedAt: raw.fetchedAt || new Date(now).toISOString(),
      };
      source = "gambid-api";
    }
  }

  if (!players) {
    players = normalizeGambidLeaderboard(GAMBID_MOCK_PLAYERS);
    raceMeta = {
      ...GAMBID_MOCK_RACE_META,
      fetchedAt: new Date(now).toISOString(),
    };
    source = forceMock ? "mock" : (hasOverrideUrl ? "mock-fallback" : "mock");
  }

  const response = {
    race: {
      id: raceMeta.slug,
      name: raceMeta.name,
      status: raceMeta.status,
      scoredBy: raceMeta.scoredBy,
      startsAt: raceMeta.startsAt,
      endsAt: raceMeta.endsAt,
      currency: raceMeta.currency,
      prizePoolUsd: raceMeta.prizePool,
      prizePoolFormatted: raceMeta.prizePoolFormatted,
      description: raceMeta.description,
      imageUrl: raceMeta.imageUrl,
      promotionUrl: GAMBID_WAGER_RACE_REFERRAL_URL,
      gambidUrl: raceMeta.url,
      referralCode: "anton",
      leaderboardCount: raceMeta.leaderboardCount,
      fetchedAt: raceMeta.fetchedAt,
      updatedAt: now,
      source,
    },
    players,
    totalPlayers: players.length,
  };

  gambidWagerRaceCache = { data: response, updatedAt: now };
  res.setHeader("X-Cache", force ? "BYPASS" : "MISS");
  res.setHeader("X-Data-Source", source);
  res.json(response);
});

app.get("/api/chat/messages", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
  const messages = await getChatMessages(limit);
  res.json({ messages });
});

app.get("/api/chat/users", requireAuth, async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : "";
  const users = await searchUsers({
    query,
    limit: 5,
    sortBy: "recent",
  });
  res.json({ users });
});

app.post("/api/presence/heartbeat", requireAuth, async (req, res) => {
  try {
    const profile = await recordUserPresence(req.discordId);
    res.json({ ok: true, profile: finalizeAdminProfile(profile) });
  } catch (error) {
    logServerError("Presence heartbeat error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to record presence" });
  }
});

app.post("/api/chat/messages", requireAuth, async (req, res) => {
  try {
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const replyToId = typeof req.body?.replyToId === "string" ? req.body.replyToId : "";
    const result = await sendChatMessage({
      discordId: req.discordId,
      content,
      replyToId,
    });
    res.json(result);
  } catch (error) {
    logServerError("Chat message error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({
      error: error.message || "Failed to send chat message",
      remainingMs: error.remainingMs || 0,
      mutedUntil: error.mutedUntil || null,
    });
  }
});

app.post("/api/chat/tip", requireAuth, async (req, res) => {
  try {
    const recipientId = typeof req.body?.recipientId === "string" ? req.body.recipientId : "";
    const recipientQuery = typeof req.body?.recipientQuery === "string" ? req.body.recipientQuery : "";
    const amount = Number(req.body?.amount);
    const result = await sendChatTip({
      discordId: req.discordId,
      recipientId,
      recipientQuery,
      amount,
    });
    res.json(result);
    void runOptionalDiscordTasks([
      {
        label: "Discord tip audit message failed",
        task: () =>
          discordBot.sendAuditMessage(
            `Coins tip: ${req.discordId} tipped ${Number.isFinite(amount) ? amount : 0} Coins to ${
              result.recipientProfile?.discordId || recipientId || recipientQuery || "unknown"
            }.`,
            {
              dedupeKey: `tip:${req.discordId}:${result.recipientProfile?.discordId || recipientId || recipientQuery || "unknown"}`,
            }
          ),
      },
      {
        label: "Discord sender rank sync after tip failed",
        task: () => syncDiscordRankRole(result.senderProfile),
      },
      {
        label: "Discord recipient rank sync after tip failed",
        task: () => syncDiscordRankRole(result.recipientProfile),
      },
    ]);
  } catch (error) {
    logServerError("Chat tip error", error, { discordId: req.discordId, recipientId, recipientQuery, amount });
    res.status(error.statusCode || 500).json({
      error: error.message || "Failed to send tip",
      remainingMs: error.remainingMs || 0,
      mutedUntil: error.mutedUntil || null,
    });
  }
});

app.post("/api/admin/chat/clear", requireAuth, requireAdmin, async (req, res) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const result = await clearChatMessages({
      actor: req.profile?.discordId || req.discordId,
      reason: reason || "Chat cleared by admin",
    });
    res.json(result);
  } catch (error) {
    logServerError("Admin chat clear error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to clear chat" });
  }
});

app.post("/api/admin/chat/announce", requireAuth, requireAdmin, async (req, res) => {
  try {
    const casinoName = typeof req.body?.casinoName === "string" ? req.body.casinoName : "";
    const result = await sendChatAnnouncement({
      actor: req.profile?.discordId || req.discordId,
      casinoName,
    });
    res.json(result);
    void runOptionalDiscordTasks([
      {
        label: "Discord admin announce audit message failed",
        task: () =>
          discordBot.sendAuditMessage(`Chat announce sent for ${result.message?.casinoName || casinoName || "casino"}.`, {
            dedupeKey: `chat-announce:${(result.message?.casinoName || casinoName || "casino").toLowerCase()}`,
          }),
      },
    ]);
  } catch (error) {
    logServerError("Admin chat announce error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to send announcement" });
  }
});

app.get("/api/giveaway", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifySessionToken(token);
  reportGiveawayServerDebug("B", "GET /api/giveaway", {
    hasToken: Boolean(token),
    tokenValid: Boolean(payload?.sub),
    discordId: payload?.sub || null,
  });
  const overview = await getGiveawayOverviewReadOnly(payload?.sub || null);
  reportGiveawayServerDebug("B", "GET /api/giveaway result", {
    hasCampaign: Boolean(overview?.activeCampaign),
    campaignStatus: overview?.activeCampaign?.status || null,
    meLoggedIn: overview?.activeCampaign?.me?.isLoggedIn ?? null,
    mePoints: overview?.activeCampaign?.me?.points ?? null,
  });
  res.json(overview);
});

app.get("/api/giveaway/history", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "5", 10), 10);
  const history = await getGiveawayHistory(limit);
  res.json({ history });
});

app.post("/api/giveaway/enter", requireAuth, async (req, res) => {
  try {
    const stake = Number(req.body?.stake);
    reportGiveawayServerDebug("D", "POST /api/giveaway/enter", {
      discordId: req.discordId,
      stake,
    });
    const result = await enterGiveaway({ discordId: req.discordId, stake });
    reportGiveawayServerDebug("D", "POST /api/giveaway/enter result", {
      discordId: req.discordId,
      ok: true,
      meLoggedIn: result?.giveaway?.me?.isLoggedIn ?? null,
      meStake: result?.giveaway?.me?.stake ?? null,
      mePoints: result?.giveaway?.me?.points ?? null,
    });
    res.json(result);
    void runOptionalDiscordTasks([
      {
        label: "Discord giveaway entry audit failed",
        task: () =>
          discordBot.sendAuditMessage(
            `Giveaway entry: ${req.discordId} staked ${Number.isFinite(stake) ? stake : 0} Coins in ${
              result.giveaway?.title || "active giveaway"
            }.`,
            { dedupeKey: `giveaway-entry:${req.discordId}:${result.giveaway?.id || "active"}` }
          ),
      },
      {
        label: "Discord rank sync after giveaway entry failed",
        task: async () => syncDiscordRankRole(await getUserProfile(req.discordId)),
      },
    ]);
  } catch (error) {
    reportGiveawayServerDebug("D", "POST /api/giveaway/enter error", {
      discordId: req.discordId,
      message: error?.message || null,
      statusCode: error?.statusCode || 500,
    });
    logServerError("Giveaway entry error", error, { discordId: req.discordId, stake });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to enter giveaway" });
  }
});

app.get("/api/admin/history", requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
  const discordId = typeof req.query.discordId === "string" ? req.query.discordId : null;
  const events = await getRecentEvents(limit, discordId);
  res.json({ events });
});

app.post("/api/dev/grant-coins", requireAuth, async (req, res) => {
  const host = String(req.headers.host || "");
  const safe = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) || process.env.NODE_ENV !== "production";
  if (!safe) {
    res.status(403).json({ error: "Forbidden — dev endpoint only on localhost" });
    return;
  }
  try {
    const amountRaw = req.body?.amount;
    const amount = amountRaw === undefined ? 1000 : Math.max(1, Math.floor(Number(amountRaw) || 0));
    if (!amount || amount < 1) {
      res.status(400).json({ error: "Bad amount" });
      return;
    }
    const profile = await adjustPoints({
      discordId: req.discordId,
      amount,
      reason: "dev_grant",
      actor: req.discordId,
    });
    res.json({ ok: true, amount, profile: profile ?? null });
  } catch (error) {
    logServerError("Dev grant coins error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed" });
  }
});

app.get("/api/health", async (req, res) => {
  const stats = await getStats();
  res.json({
    ok: true,
    port: PORT,
    uptimeSeconds: Math.round(process.uptime()),
    bot: discordBot.getStatus(),
    giveaway: await getGiveawayOverview(),
    totals: {
      users: stats.totalUsers,
      points: stats.totalPoints,
      lifetimePoints: stats.totalLifetimePoints,
    },
  });
});

// #region Deposit Giveaway Proof-of-Screenshot
const UPLOADS_DIR = path.join(__dirname, "uploads");
const GW_UPLOADS_DIR = path.join(UPLOADS_DIR, "giveaways");
try { fsSync.mkdirSync(GW_UPLOADS_DIR, { recursive: true }); } catch {}
if (!fsSync.existsSync(UPLOADS_DIR)) fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });

const DECODE_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;

const safeRandomHex = (n = 16) => crypto.randomBytes(n).toString("hex");

const decodeDataUriToFile = async ({ dataUri, uploadDir, filenamePrefix = "image" }) => {
  if (!dataUri || typeof dataUri !== "string") {
    const error = new Error("Missing image data");
    error.statusCode = 400;
    throw error;
  }
  const match = dataUri.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
  if (!match) {
    const error = new Error("Unsupported image format. Use PNG/JPG/WEBP/GIF");
    error.statusCode = 400;
    throw error;
  }
  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  if (base64.length > DECODE_IMAGE_LIMIT_BYTES) {
    const error = new Error("Image is too large. Max 10MB");
    error.statusCode = 413;
    throw error;
  }
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.replace("image/", "");
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filename = `${filenamePrefix}-${safeRandomHex(10)}-${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
  return {
    path: filePath,
    url: `/uploads/giveaways/${filename}`,
    filename,
    mimeType,
  };
};

app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "30d" }));

app.get("/api/deposit-giveaway", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = verifySessionToken(token);
  let isAdmin = false;
  if (payload?.sub) {
    const profile = await getUserProfile(payload.sub);
    const envAdminBypass =
      DISABLE_GIVEAWAY_ADMIN_CHECK ||
      (ADMIN_USER_IDS.size > 0 && ADMIN_USER_IDS.has(String(payload.sub)));
    isAdmin = Boolean(profile?.isAdmin) || envAdminBypass;
  }
  const overview = await getDepositGiveawayOverview(payload?.sub || null, isAdmin);
  overview.isAdmin = isAdmin;
  const isEnvBypassActive =
    payload?.sub &&
    (DISABLE_GIVEAWAY_ADMIN_CHECK ||
      (ADMIN_USER_IDS.size > 0 && ADMIN_USER_IDS.has(String(payload.sub))));
  if (isEnvBypassActive) {
    overview.isGiveawayAdminBypass = true;
    if (!overview.me) {
      overview.me = { discordId: payload.sub, isLoggedIn: true, isAdmin: true };
    } else {
      overview.me.isAdmin = true;
    }
  }
  res.json(overview);
});

app.post("/api/deposit-giveaway/upload", requireAuth, express.json({ limit: "12mb" }), async (req, res) => {
  try {
    const { imageData, note = "" } = req.body || {};
    if (!imageData) {
      res.status(400).json({ error: "Screenshot is required" });
      return;
    }
    const saved = await decodeDataUriToFile({
      dataUri: String(imageData),
      uploadDir: GW_UPLOADS_DIR,
      filenamePrefix: `gw-${req.discordId}`,
    });
    res.json({ ok: true, imageUrl: saved.url, filename: saved.filename });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to upload image" });
  }
});

app.post("/api/deposit-giveaway/enter", requireAuth, async (req, res) => {
  try {
    const { imageUrl, note = "" } = req.body || {};
    const result = await submitDepositGiveawayEntry({ discordId: req.discordId, imageUrl, note });
    res.json(result);
    void runOptionalDiscordTasks([
      {
        label: "Discord giveaway entry audit failed",
        task: () =>
          discordBot.sendAuditMessage(
            `Deposit entry submitted: ${req.discordId} ${imageUrl || "(no image)"}.`,
            { dedupeKey: `deposit-entry:${req.discordId}:${result?.campaign?.id || ""}:${Date.now()}` }
          ),
      },
    ]);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to submit entry" });
  }
});

app.post("/api/admin/deposit-giveaway/entry/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { entryId, status } = req.body || {};
    const result = await reviewDepositGiveawayEntry({ actor: req.discordId, entryId, status });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to review entry" });
  }
});

app.post("/api/admin/deposit-giveaway/phase", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { phase } = req.body || {};
    const result = await setDepositGiveawayPhase({ actor: req.discordId, phase });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to set phase" });
  }
});

app.post("/api/admin/deposit-giveaway/create", requireAuth, requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await createDepositGiveaway({
      ...payload,
      actor: req.discordId,
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to create giveaway" });
  }
});

app.post("/api/admin/deposit-giveaway/draw", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await drawDepositGiveawayWinners({ actor: req.discordId });
    res.json(result);
    if (result.status === "drawn") {
      void runOptionalDiscordTasks([
        {
          label: "Discord giveaway draw audit failed",
          task: () =>
            discordBot.sendAuditMessage(
              `Deposit giveaway drawn for "${result?.campaign?.title || "giveaway"}: ${(result.winners || []).map((w) => w.globalName || w.username || w.discordId).join(", ") || "no winners"}`,
              { dedupeKey: `deposit-draw:${result?.campaign?.id || ""}:${Date.now()}` }
            ),
        },
      ]);
    }
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to draw giveaway" });
  }
});

app.post("/api/admin/deposit-giveaway/reset", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await resetDepositGiveaway({ actor: req.discordId });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to reset giveaway" });
  }
});
// #endregion

// #region Blackjack
const BJ_MIN_BET = 1;
const BJ_MAX_BET = 25000;

const BJ_SUITS = ["spades", "hearts", "diamonds", "clubs"];
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const createDeck = () => {
  const deck = [];
  for (let d = 0; d < 6; d += 1) {
    for (const suit of BJ_SUITS) {
      for (const rank of BJ_RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const bjCardValue = (rank) => {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return parseInt(rank, 10);
};

const bjHandScore = (cards = []) => {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += bjCardValue(card.rank);
    if (card.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
};

const bjIsBlackjack = (cards = []) =>
  cards.length === 2 && bjHandScore(cards) === 21;

const bjSessions = new Map();

const clearBjSession = (discordId) => {
  bjSessions.delete(discordId);
};

const getBjSession = (discordId) => bjSessions.get(discordId) || null;

const serializeBjCard = (card, hidden = false) => ({
  rank: hidden ? "?" : card.rank,
  suit: hidden ? "?" : card.suit,
  hidden: Boolean(hidden),
});

const serializeBjSession = (session, revealHole = false) => {
  if (!session) return null;
  const dealerCards = session.dealerHand.map((card, i) =>
    i === 1 && !revealHole ? serializeBjCard(card, true) : serializeBjCard(card)
  );
  const dealerScore = revealHole
    ? bjHandScore(session.dealerHand)
    : (() => {
        const visible = session.dealerHand.filter((_, i) => i !== 1);
        if (visible.length === 0) return 0;
        const s = bjHandScore(visible);
        return session.dealerHand.length >= 2 ? (s === 11 ? "11 or 21" : String(s)) : String(s);
      })();
  const playerScore = bjHandScore(session.playerHand);
  return {
    id: session.id,
    bet: session.bet,
    doubled: Boolean(session.doubled),
    status: session.status, // betting|playing|dealer|settled
    result: session.result || null, // win|lose|push|blackjack
    payout: session.payout || 0,
    playerHand: session.playerHand.map((c) => serializeBjCard(c)),
    dealerHand: dealerCards,
    playerScore,
    dealerScore,
    revealHole,
  };
};

app.post("/api/blackjack/deal", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  const requestId = `bj-deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const profile = await getUserProfile(discordId);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    const rawBet = Number(req.body?.bet);
    const bet = Math.floor(Number.isFinite(rawBet) ? rawBet : 0);
    if (!Number.isFinite(bet) || bet < BJ_MIN_BET || bet > BJ_MAX_BET) {
      res.status(400).json({ error: `Bet must be between ${BJ_MIN_BET} and ${BJ_MAX_BET} Coins` });
      return;
    }
    const balance = profile.points || 0;
    if (bet > balance) {
      res.status(400).json({ error: "Not enough Coins" });
      return;
    }
    const existing = getBjSession(discordId);
    if (existing && existing.status !== "settled") {
      res.status(409).json({ error: "Hand already in progress, finish it first" });
      return;
    }
    await adjustPoints({
      discordId,
      amount: -bet,
      reason: `Blackjack bet (${bet} Coins)`,
      actor: "system-blackjack",
    });
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];
    const session = {
      id: `bj_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      deck,
      playerHand,
      dealerHand,
      bet,
      doubled: false,
      status: "playing",
      result: null,
      payout: 0,
      createdAt: Date.now(),
    };
    const playerNatural = bjIsBlackjack(playerHand);
    const dealerNatural = bjIsBlackjack(dealerHand);
    if (playerNatural || dealerNatural) {
      let result = "push";
      let payout = 0;
      if (playerNatural && !dealerNatural) {
        result = "blackjack";
        payout = Math.floor(bet * 2.5);
        if (payout > bet) {
          await adjustPoints({
            discordId,
            amount: payout,
            reason: `Blackjack win 3:2 (+${payout - bet} net)`,
            actor: "system-blackjack",
          });
        } else {
          await adjustPoints({
            discordId,
            amount: bet,
            reason: `Blackjack push (refund)`,
            actor: "system-blackjack",
          });
        }
      } else if (!playerNatural && dealerNatural) {
        result = "lose";
        payout = 0;
      } else {
        result = "push";
        payout = bet;
        await adjustPoints({
          discordId,
          amount: bet,
          reason: `Blackjack push (refund)`,
          actor: "system-blackjack",
        });
      }
      session.status = "settled";
      session.result = result;
      session.payout = payout;
      bjSessions.set(discordId, session);
      const fresh = await getUserProfile(discordId);
      res.json({
        session: serializeBjSession(session, true),
        balance: fresh?.points ?? 0,
        settlement: { result, payout },
      });
      return;
    }
    bjSessions.set(discordId, session);
    const fresh = await getUserProfile(discordId);
    res.json({
      session: serializeBjSession(session, false),
      balance: fresh?.points ?? 0,
    });
  } catch (error) {
    logServerError("Blackjack deal error", error, { discordId, requestId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to deal hand" });
  }
});

app.post("/api/blackjack/hit", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const session = getBjSession(discordId);
    if (!session) {
      res.status(404).json({ error: "No active hand" });
      return;
    }
    if (session.status !== "playing") {
      res.status(409).json({ error: "Hand not in play state" });
      return;
    }
    if (session.deck.length < 1) {
      session.deck = createDeck();
    }
    session.playerHand.push(session.deck.pop());
    const score = bjHandScore(session.playerHand);
    if (score > 21) {
      session.status = "settled";
      session.result = "lose";
      session.payout = 0;
      const fresh = await getUserProfile(discordId);
      res.json({
        session: serializeBjSession(session, true),
        balance: fresh?.points ?? 0,
        settlement: { result: "lose", payout: 0 },
      });
      return;
    }
    if (score === 21) {
      // Auto stand on 21
    }
    bjSessions.set(discordId, session);
    const fresh = await getUserProfile(discordId);
    res.json({
      session: serializeBjSession(session, false),
      balance: fresh?.points ?? 0,
    });
  } catch (error) {
    logServerError("Blackjack hit error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to hit" });
  }
});

const runDealerAndSettle = async (discordId, session) => {
  while (true) {
    const score = bjHandScore(session.dealerHand);
    if (score >= 17) break;
    if (session.deck.length < 1) session.deck = createDeck();
    session.dealerHand.push(session.deck.pop());
  }
  const playerScore = bjHandScore(session.playerHand);
  const dealerScore = bjHandScore(session.dealerHand);
  let result = "push";
  let payout = 0;
  const totalBet = session.bet * (session.doubled ? 2 : 1);
  if (dealerScore > 21) {
    result = "win";
    payout = totalBet * 2;
  } else if (playerScore > dealerScore) {
    result = "win";
    payout = totalBet * 2;
  } else if (dealerScore > playerScore) {
    result = "lose";
    payout = 0;
  } else {
    result = "push";
    payout = totalBet;
  }
  const refund = session.doubled ? session.bet : 0;
  let netCredit = payout - refund;
  if (netCredit > 0) {
    let reason = `Blackjack ${result}`;
    if (result === "push") reason = `Blackjack push (refund)`;
    await adjustPoints({
      discordId,
      amount: netCredit,
      reason,
      actor: "system-blackjack",
    });
  }
  session.status = "settled";
  session.result = result;
  session.payout = payout;
  bjSessions.set(discordId, session);
  return { result, payout };
};

app.post("/api/blackjack/stand", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const session = getBjSession(discordId);
    if (!session) {
      res.status(404).json({ error: "No active hand" });
      return;
    }
    if (session.status !== "playing") {
      res.status(409).json({ error: "Hand not in play state" });
      return;
    }
    session.status = "dealer";
    const settlement = await runDealerAndSettle(discordId, session);
    const fresh = await getUserProfile(discordId);
    res.json({
      session: serializeBjSession(session, true),
      balance: fresh?.points ?? 0,
      settlement,
    });
  } catch (error) {
    logServerError("Blackjack stand error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to stand" });
  }
});

app.post("/api/blackjack/double", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const session = getBjSession(discordId);
    if (!session) {
      res.status(404).json({ error: "No active hand" });
      return;
    }
    if (session.status !== "playing") {
      res.status(409).json({ error: "Hand not in play state" });
      return;
    }
    if (session.playerHand.length !== 2) {
      res.status(400).json({ error: "Double only allowed on first two cards" });
      return;
    }
    const profile = await getUserProfile(discordId);
    const balance = profile?.points || 0;
    if (balance < session.bet) {
      res.status(400).json({ error: "Not enough Coins to double down" });
      return;
    }
    await adjustPoints({
      discordId,
      amount: -session.bet,
      reason: `Blackjack double down (${session.bet} Coins)`,
      actor: "system-blackjack",
    });
    session.doubled = true;
    if (session.deck.length < 1) session.deck = createDeck();
    session.playerHand.push(session.deck.pop());
    const score = bjHandScore(session.playerHand);
    if (score > 21) {
      session.status = "settled";
      session.result = "lose";
      session.payout = 0;
      const fresh = await getUserProfile(discordId);
      res.json({
        session: serializeBjSession(session, true),
        balance: fresh?.points ?? 0,
        settlement: { result: "lose", payout: 0 },
      });
      return;
    }
    session.status = "dealer";
    const settlement = await runDealerAndSettle(discordId, session);
    const fresh = await getUserProfile(discordId);
    res.json({
      session: serializeBjSession(session, true),
      balance: fresh?.points ?? 0,
      settlement,
    });
  } catch (error) {
    logServerError("Blackjack double error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to double" });
  }
});

app.get("/api/blackjack/state", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const session = getBjSession(discordId);
    const profile = await getUserProfile(discordId);
    const settled = session?.status === "settled";
    res.json({
      session: session ? serializeBjSession(session, settled) : null,
      balance: profile?.points || 0,
    });
  } catch (error) {
    logServerError("Blackjack state error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to get state" });
  }
});
// #endregion

// #region Keno
const KENO_MIN_BET = 1;
const KENO_MAX_BET = 25000;
const KENO_MIN_SPOTS = 1;
const KENO_MAX_SPOTS = 10;
const KENO_NUMBERS_MIN = 1;
const KENO_NUMBERS_MAX = 40;
const KENO_RISK_DEFAULTS = {
  low: { draw: 12, factor: 0.7 },
  classic: { draw: 10, factor: 1 },
  medium: { draw: 8, factor: 1.7 },
  high: { draw: 6, factor: 3 },
};

const KENO_BASE_PAYOUTS = {
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

const normalizeKenoRisk = (riskKey) => {
  const k = typeof riskKey === "string" ? riskKey.trim().toLowerCase() : "classic";
  return Object.prototype.hasOwnProperty.call(KENO_RISK_DEFAULTS, k) ? k : "classic";
};

const kenoDrawCountForRisk = (riskKey) =>
  Number(KENO_RISK_DEFAULTS[normalizeKenoRisk(riskKey)]?.draw ?? 40);

const payoutsForRisk = (riskKey) => {
  const factor = Number(KENO_RISK_DEFAULTS[normalizeKenoRisk(riskKey)]?.factor ?? 1);
  const out = {};
  Object.keys(KENO_BASE_PAYOUTS).forEach((k) => {
    const s = Number(k);
    out[s] = {};
    Object.keys(KENO_BASE_PAYOUTS[s]).forEach((h) => {
      const raw = Number(KENO_BASE_PAYOUTS[s][h]);
      if (raw <= 0) { out[s][h] = 0; return; }
      const v = Number((raw * factor).toFixed(2));
      out[s][h] = v < 0.1 ? 0 : v;
    });
  });
  return out;
};

const kenoSessions = new Map();

const kenoPayoutMultiplier = (spots, hits, risk = "classic") => {
  const payouts = payoutsForRisk(risk);
  const table = payouts[Number(spots)];
  if (!table) return 0;
  return Number(table[Number(hits)] ?? 0);
};

const getKenoSession = (discordId) => kenoSessions.get(discordId) || null;
const clearKenoSession = (discordId) => kenoSessions.delete(discordId);

const pickKenoDraw = (count = 40) => {
  const all = [];
  for (let i = KENO_NUMBERS_MIN; i <= KENO_NUMBERS_MAX; i += 1) all.push(i);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const pick = count >= KENO_NUMBERS_MIN ? Math.min(KENO_NUMBERS_MAX, count) : 40;
  return all.slice(0, pick).sort((a, b) => a - b);
};

const countMatches = (spots = [], draw = []) => {
  const d = new Set(draw.map(Number));
  return spots.map(Number).filter((n) => d.has(n)).length;
};

const serializeKenoSession = (session) => {
  if (!session) return null;
  return {
    id: session.id,
    bet: session.bet || 0,
    spots: Array.isArray(session.spots) ? session.spots.slice().sort((a, b) => a - b) : [],
    drawn: Array.isArray(session.drawn) ? session.drawn.slice().sort((a, b) => a - b) : null,
    matches: Number(session.matches ?? 0),
    payout: Number(session.payout ?? 0),
    status: session.status || "idle",
    multiplier: Number(session.multiplier ?? 0),
    risk: session.risk || "classic",
    drawCount: Number(session.drawCount ?? 40),
    createdAt: session.createdAt || Date.now(),
  };
};

app.post("/api/keno/draw", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const profile = await getUserProfile(discordId);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    const rawBet = Number(req.body?.bet);
    const spotsRaw = Array.isArray(req.body?.spots) ? req.body.spots : [];
    const risk = normalizeKenoRisk(req.body?.risk);
    const drawCount = kenoDrawCountForRisk(risk);
    const bet = Math.floor(Number.isFinite(rawBet) ? rawBet : 0);
    const spots = spotsRaw
      .map((n) => Math.floor(Number(n)))
      .filter((n) => Number.isFinite(n) && n >= KENO_NUMBERS_MIN && n <= KENO_NUMBERS_MAX)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort((a, b) => a - b);
    if (!Number.isFinite(bet) || bet < KENO_MIN_BET || bet > KENO_MAX_BET) {
      res.status(400).json({ error: `Bet must be between ${KENO_MIN_BET} and ${KENO_MAX_BET} Coins` });
      return;
    }
    if (spots.length < KENO_MIN_SPOTS || spots.length > KENO_MAX_SPOTS) {
      res.status(400).json({ error: `Pick between ${KENO_MIN_SPOTS} and ${KENO_MAX_SPOTS} numbers` });
      return;
    }
    const balance = profile.points || 0;
    if (bet > balance) {
      res.status(400).json({ error: "Not enough Coins" });
      return;
    }
    const existing = getKenoSession(discordId);
    if (existing && existing.status !== "settled") {
      res.status(409).json({ error: "Round already in progress" });
      return;
    }
    await adjustPoints({
      discordId,
      amount: -bet,
      reason: `Keno bet ${spots.length} spots (${bet} Coins) ${risk}`,
      actor: "system-keno",
    });
    const drawn = pickKenoDraw(drawCount);
    const matches = countMatches(spots, drawn);
    const multiplier = kenoPayoutMultiplier(spots.length, matches, risk);
    const payout = Math.floor(bet * multiplier);
    const netWin = payout - bet;
    if (payout > 0) {
      await adjustPoints({
        discordId,
        amount: payout,
        reason: `Keno payout ${matches}/${spots.length} ×${multiplier} (${risk})`,
        actor: "system-keno",
      });
    }
    const session = {
      id: `keno_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      bet,
      spots,
      drawn,
      matches,
      payout,
      status: "settled",
      multiplier,
      risk,
      drawCount,
      netWin,
      createdAt: Date.now(),
    };
    kenoSessions.set(discordId, session);
    const refreshed = await getUserProfile(discordId);
    res.json({
      ok: true,
      risk,
      drawCount,
      session: serializeKenoSession(session),
      balance: refreshed?.points ?? (balance - bet + payout),
      netWin: Number(session.netWin || 0),
    });
  } catch (error) {
    logServerError("Keno draw error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Keno draw failed" });
  }
});

app.get("/api/keno/state", requireAuth, async (req, res) => {
  const discordId = req.discordId;
  try {
    const session = getKenoSession(discordId);
    const profile = await getUserProfile(discordId);
    res.json({
      session: session ? serializeKenoSession(session) : null,
      balance: profile?.points || 0,
    });
  } catch (error) {
    logServerError("Keno state error", error, { discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to get keno state" });
  }
});
// #endregion

// ============== BONUS HUNT PREDICTIONS ==============
const defaultBonusHuntState = () => ({
  phase: "idle", // "idle" | "predicting" | "live" | "done"
  startBalance: 0,
  currentBalance: 0,
  bonuses: [],
  totalWin: 0,
  breakEven: 0,
  predictions: [], // [{ id, discordId, username, avatarUrl, amount, timestamp }]
  winner: null,
  createdAt: Date.now(),
  startedAt: null,
  endedAt: null,
});
let BONUS_HUNT = defaultBonusHuntState();

const bhAvatarUrl = (discordId, avatarHash) => {
  if (avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=128`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${(Number(discordId) >>> 0) % 5}.png`;
};

const bhCalculateWinner = () => {
  if (!BONUS_HUNT.predictions.length || BONUS_HUNT.totalWin <= 0) return null;
  let best = null;
  for (const pred of BONUS_HUNT.predictions) {
    const diff = Math.abs(pred.amount - BONUS_HUNT.totalWin);
    if (!best || diff < best.closestDiff) {
      best = {
        id: pred.id,
        discordId: pred.discordId,
        username: pred.username,
        avatarUrl: pred.avatarUrl,
        amount: pred.amount,
        closestDiff: diff,
      };
    }
  }
  return best;
};

const bhPublicState = (viewerDiscordId = null) => {
  const myPrediction = viewerDiscordId
    ? BONUS_HUNT.predictions.find((p) => p.discordId === viewerDiscordId) || null
    : null;
  return {
    phase: BONUS_HUNT.phase,
    startBalance: BONUS_HUNT.startBalance,
    currentBalance: BONUS_HUNT.currentBalance,
    bonuses: BONUS_HUNT.bonuses,
    totalWin: BONUS_HUNT.totalWin,
    breakEven: BONUS_HUNT.breakEven,
    predictionCount: BONUS_HUNT.predictions.length,
    predictions: BONUS_HUNT.predictions
      .slice()
      .sort((a, b) => {
        if (BONUS_HUNT.phase === "done") {
          return Math.abs(a.amount - BONUS_HUNT.totalWin) - Math.abs(b.amount - BONUS_HUNT.totalWin);
        }
        return b.timestamp - a.timestamp;
      })
      .map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatarUrl,
        amount: p.amount,
        isMine: Boolean(viewerDiscordId && p.discordId === viewerDiscordId),
      })),
    winner: BONUS_HUNT.winner,
    myPrediction: myPrediction
      ? { id: myPrediction.id, amount: myPrediction.amount, timestamp: myPrediction.timestamp }
      : null,
    timestamps: {
      createdAt: BONUS_HUNT.createdAt,
      startedAt: BONUS_HUNT.startedAt,
      endedAt: BONUS_HUNT.endedAt,
    },
  };
};

app.get("/api/bonus-hunt", async (req, res) => {
  try {
    let viewerDiscordId = null;
    const authHeader = req.headers.authorization || "";
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : cookies[SESSION_COOKIE_NAME] || null;
    const payload = verifySessionToken(token);
    if (payload) viewerDiscordId = payload.sub;

    res.json(bhPublicState(viewerDiscordId));
  } catch (error) {
    logServerError("Bonus hunt get error", error);
    res.status(500).json({ error: "Failed to get bonus hunt state" });
  }
});

app.post("/api/bonus-hunt/predict", requireAuth, async (req, res) => {
  try {
    if (BONUS_HUNT.phase !== "predicting") {
      const msg = BONUS_HUNT.phase === "idle"
        ? "Hunt has not started yet — wait for admin to start it"
        : "Predictions are closed";
      res.status(400).json({ error: msg });
      return;
    }
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    const profile = await getUserProfile(req.discordId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const now = Date.now();
    const username = profile.displayName || profile.username || profile.discordUsername || `User ${req.discordId.slice(-4)}`;
    const avatarUrl = bhAvatarUrl(req.discordId, profile.avatarHash);

    const existingIdx = BONUS_HUNT.predictions.findIndex((p) => p.discordId === req.discordId);
    if (existingIdx >= 0) {
      BONUS_HUNT.predictions[existingIdx] = {
        ...BONUS_HUNT.predictions[existingIdx],
        amount,
        timestamp: now,
      };
    } else {
      BONUS_HUNT.predictions.push({
        id: `pred_${now}_${Math.random().toString(36).slice(2, 8)}`,
        discordId: req.discordId,
        username,
        avatarUrl,
        amount,
        timestamp: now,
      });
    }
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("Bonus hunt predict error", error, { discordId: req.discordId });
    res.status(error.statusCode || 500).json({ error: error.message || "Failed to save prediction" });
  }
});

app.delete("/api/bonus-hunt/predict", requireAuth, async (req, res) => {
  try {
    BONUS_HUNT.predictions = BONUS_HUNT.predictions.filter((p) => p.discordId !== req.discordId);
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("Bonus hunt predict delete error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to delete prediction" });
  }
});

app.post("/api/admin/bonus-hunt/reset", requireAuth, requireAdmin, async (req, res) => {
  try {
    BONUS_HUNT = defaultBonusHuntState();
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("Bonus hunt admin reset error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to reset bonus hunt" });
  }
});

/* 🔓 Admin: Re-open predictions (even after closing / during live) */
app.post("/api/admin/bonus-hunt/open-predictions", requireAuth, requireAdmin, async (req, res) => {
  try {
    BONUS_HUNT.phase = "predicting";
    BONUS_HUNT.winner = null;
    BONUS_HUNT.endedAt = null;
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("BH admin open-predictions error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to open predictions" });
  }
});

/* 🔒 Admin: Close predictions WITHOUT changing to live (mid-collecting state — viewers cannot change bet anymore) */
app.post("/api/admin/bonus-hunt/close-predictions", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (BONUS_HUNT.phase === "done") {
      res.status(400).json({ error: "Hunt is already finalized" });
      return;
    }
    BONUS_HUNT.phase = "live";
    if (!BONUS_HUNT.startedAt) BONUS_HUNT.startedAt = Date.now();
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("BH admin close-predictions error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to close predictions" });
  }
});

/* ▶️ Admin: Start bonus hunt — opens predictions (idle → predicting) OR starts live hunt (predicting → live) */
app.post("/api/admin/bonus-hunt/start", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (BONUS_HUNT.phase === "done") {
      res.status(400).json({ error: "Hunt is already finalized; hit Reset first" });
      return;
    }
    if (BONUS_HUNT.phase === "idle") {
      // Fresh start: go into betting-open (predicting) phase so viewers can place bets
      BONUS_HUNT.phase = "predicting";
    } else if (BONUS_HUNT.phase === "predicting") {
      // Bets open → now lock them and go live
      BONUS_HUNT.phase = "live";
      BONUS_HUNT.startedAt = BONUS_HUNT.startedAt || Date.now();
    }
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("Bonus hunt admin start error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to start bonus hunt" });
  }
});

/* ✅ Admin: Finalize results */
app.post("/api/admin/bonus-hunt/finalize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startBalance = 0, currentBalance = 0, bonuses = [], totalWin = 0, breakEven = 0 } = req.body || {};
    BONUS_HUNT.startBalance = Number(startBalance) || 0;
    BONUS_HUNT.currentBalance = Number(currentBalance) || 0;
    BONUS_HUNT.breakEven = Number(breakEven) || 0;
    BONUS_HUNT.totalWin = Number(totalWin) || 0;
    BONUS_HUNT.bonuses = Array.isArray(bonuses) ? bonuses : [];
    BONUS_HUNT.winner = bhCalculateWinner();
    BONUS_HUNT.phase = "done";
    BONUS_HUNT.endedAt = Date.now();
    res.json({ ok: true, state: bhPublicState(req.discordId) });
  } catch (error) {
    logServerError("Bonus hunt admin finalize error", error, { discordId: req.discordId });
    res.status(500).json({ error: "Failed to finalize bonus hunt" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const start = async () => {
  try {
    reportServerCrashDebug("A", "start invoked", { port: PORT });
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(PORT, () => resolve(instance));
      instance.once("error", reject);
    });

    reportServerCrashDebug("A", "http server listening", { port: PORT });
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log("Press Ctrl+C to stop the server");
    reportServerCrashDebug("B", "discord bot start begin");
    await discordBot.start();
    reportServerCrashDebug("B", "discord bot start complete");
    return server;
  } catch (error) {
    reportServerCrashDebug("B", "start failed", {
      code: error?.code || null,
      message: error?.message || null,
      stack: error?.stack || null,
    });
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the old server process and try again.`);
    } else {
      console.error("Server failed to start:", error.message);
    }
    process.exit(1);
  }
};

start();
