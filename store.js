const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const LOCAL_DATA_DIR = path.join(__dirname, "data");
const CONFIGURED_DATA_DIR = String(
  process.env.DATA_DIR || process.env.AG_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || ""
).trim();
const DATA_DIR = CONFIGURED_DATA_DIR || LOCAL_DATA_DIR;
const DATA_FILE = path.join(DATA_DIR, "ag-data.json");
const DATA_FILE_TEMP = path.join(DATA_DIR, "ag-data.json.tmp");
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "ag-data.json");
const DEBUG_ENV_FILE = path.join(__dirname, ".dbg", "ag-data-live-writes.env");
const OAUTH_COINS_DEBUG_ENV_FILE = path.join(__dirname, ".dbg", "oauth-coins-railway.env");

const DEFAULT_DATA = {
  users: {},
  events: [],
  giveaways: {
    campaigns: [],
    activeCampaignId: null,
  },
  chat: {
    messages: [],
  },
};

let writeQueue = Promise.resolve();

// #region debug-point A:store-write-report
const reportStoreDebug = (hypothesisId, msg, data = {}) => {
  let debugUrl = "http://127.0.0.1:7777/event";
  let sessionId = "ag-data-live-writes";
  try {
    const envContent = fsSync.readFileSync(DEBUG_ENV_FILE, "utf8");
    debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugUrl;
    sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch {}

  fetch(debugUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      runId: process.env.DEBUG_RUN_ID || "pre-fix",
      hypothesisId,
      location: "store.js",
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

// #region debug-point oauth-coins-railway-store-report
const reportOauthCoinsStoreDebug = (hypothesisId, msg, data = {}) => {
  let debugUrl = "http://127.0.0.1:7777/event";
  let sessionId = "oauth-coins-railway";
  try {
    const envContent = fsSync.readFileSync(OAUTH_COINS_DEBUG_ENV_FILE, "utf8");
    debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugUrl;
    sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch {}

  fetch(debugUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      runId: process.env.DEBUG_RUN_ID || "pre-fix",
      hypothesisId,
      location: "store.js",
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

const clone = (value) => JSON.parse(JSON.stringify(value));

let dataStorageNoticePrinted = false;

const ensurePersistentDataBootstrap = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (DATA_FILE === LOCAL_DATA_FILE) {
    return;
  }

  try {
    await fs.access(DATA_FILE);
    return;
  } catch {}

  try {
    await fs.access(LOCAL_DATA_FILE);
    await fs.copyFile(LOCAL_DATA_FILE, DATA_FILE);
  } catch {}
};

const ensureDataFile = async () => {
  await ensurePersistentDataBootstrap();
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
  }

  if (!dataStorageNoticePrinted) {
    console.log(`[store] Using data file: ${DATA_FILE}`);
    dataStorageNoticePrinted = true;
  }
};

const readData = async () => {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  try {
    return { ...clone(DEFAULT_DATA), ...JSON.parse(raw) };
  } catch (error) {
    const dataError = new Error("Failed to parse ag-data.json. Refusing to continue to avoid data loss.");
    dataError.cause = error;
    dataError.statusCode = 500;
    throw dataError;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const atomicRenameWithRetry = async (src, dest, serialized) => {
  const attempts = 8;
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rename(src, dest);
      return;
    } catch (err) {
      lastError = err;
      const code = err && (err.code || String(err).match(/^([A-Z_]+):/)?.[1]);
      const isWindowsLock =
        code === "EPERM" ||
        code === "EACCES" ||
        code === "EBUSY" ||
        /operation not permitted|access is denied|being used by another process/i.test(String(err));
      if (!isWindowsLock) break;
      await delay(120 * Math.pow(2, i));
    }
  }

  try {
    await fs.unlink(src).catch(() => {});
  } catch {}

  try {
    await fs.writeFile(dest, serialized, "utf8");
    reportStoreDebug("A", "[DEBUG] writeData fell back to direct writeFile after rename EPERM", {
      code: lastError?.code || null,
      dataFile: dest,
    });
  } catch (fallbackErr) {
    throw lastError || fallbackErr;
  }
};

const writeData = async (data) => {
  const serialized = JSON.stringify(data, null, 2);
  await fs.writeFile(DATA_FILE_TEMP, serialized, "utf8");
  await atomicRenameWithRetry(DATA_FILE_TEMP, DATA_FILE, serialized);
};

const updateData = async (mutator) => {
  writeQueue = writeQueue.then(async () => {
    // #region debug-point A:updateData-enter
    reportStoreDebug("A", "[DEBUG] updateData entered", {
      pid: process.pid,
      dataFile: DATA_FILE,
      stack: (new Error().stack || "")
        .split("\n")
        .slice(2, 8)
        .map((line) => line.trim())
        .join(" | "),
    });
    // #endregion
    const data = await readData();
    const result = await mutator(data);
    // #region debug-point D:updateData-before-write
    reportStoreDebug("D", "[DEBUG] writeData about to persist", {
      pid: process.pid,
      users: Object.keys(data.users || {}).length,
      events: Array.isArray(data.events) ? data.events.length : 0,
      activeCampaignId: data.giveaways?.activeCampaignId || null,
    });
    // #endregion
    await writeData(data);
    // #region debug-point E:updateData-after-write
    reportStoreDebug("E", "[DEBUG] writeData persisted", {
      pid: process.pid,
      bytes: fsSync.existsSync(DATA_FILE) ? fsSync.statSync(DATA_FILE).size : 0,
      modifiedAt: fsSync.existsSync(DATA_FILE) ? fsSync.statSync(DATA_FILE).mtime.toISOString() : null,
    });
    // #endregion
    return result;
  });

  return writeQueue;
};

const nowIso = () => new Date().toISOString();
const isSameDay = (iso, compareDate = new Date()) => {
  if (!iso) return false;
  const date = new Date(iso);
  return date.toDateString() === compareDate.toDateString();
};

const trimEvents = (data, limit = 500) => {
  if (data.events.length > limit) {
    data.events = data.events.slice(0, limit);
  }
};

const buildPublicProfile = (user) => ({
  discordId: user.discordId,
  username: user.username,
  globalName: user.globalName,
  avatar: user.avatar,
  points: user.points || 0,
  lifetimePoints: user.lifetimePoints || 0,
  levelName: getLevelName(user.points || 0),
  ...getPresenceState(user),
});

const buildPrivateProfile = (user) => ({
  ...buildPublicProfile(user),
  email: user.email,
  isAdmin: Boolean(user.isAdmin),
  discordRoleIds: Array.isArray(user.discordRoleIds) ? [...user.discordRoleIds] : [],
  discordRoleNames: Array.isArray(user.discordRoleNames) ? [...user.discordRoleNames] : [],
  dailyStreak: user.dailyStreak || 0,
  bestDailyStreak: user.bestDailyStreak || 0,
  createdAt: user.createdAt || null,
  lastLoginAt: user.lastLoginAt || null,
  lastDailyClaimAt: user.lastDailyClaimAt || null,
  lastVisitRewardAt: user.lastVisitRewardAt || null,
  streamCooldownUntil: user.streamCooldownUntil || null,
  bonusCooldowns: user.bonusCooldowns || {},
  mutedUntil: user.mutedUntil || null,
  muteReason: user.muteReason || "",
});

const sanitizeLimit = (limit, fallback = 10, max = 100) => {
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const REWARD_CONFIG = {
  dailyReward: 10,
  visitDurationMs: 5 * 60 * 1000,
  visitReward: 5,
  bonusReward: 2,
  bonusCooldownMs: 2 * 60 * 60 * 1000,
  streamWatchMs: 60 * 60 * 1000,
  streamReward: 15,
  streamCooldownMs: 12 * 60 * 60 * 1000,
  rewardHeartbeatMaxStepMs: 15 * 1000,
};
const DISABLE_VISIT_DURATION_POINTS = String(process.env.DISABLE_VISIT_DURATION_POINTS || "").toLowerCase() === "true";
const VISIT_DURATION_CLAIM_COOLDOWN_MS = Math.max(
  60 * 1000,
  Number(process.env.VISIT_DURATION_CLAIM_COOLDOWN_MS) || 60 * 1000
);

const GIVEAWAY_STAKE_CONFIG = {
  minStake: 10,
};

const GIVEAWAY_DURATION_FALLBACK_MS = 72 * 60 * 60 * 1000;
const GIVEAWAY_DURATION_MIN_MS = 5 * 60 * 1000;
const GIVEAWAY_DURATION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

const CHAT_CONFIG = {
  maxMessages: 300,
  messageMaxLength: 280,
  messageCooldownMs: Math.max(0, Number(process.env.CHAT_MESSAGE_COOLDOWN_MS) || 0),
  tipCooldownMs: Math.max(0, Number(process.env.CHAT_TIP_COOLDOWN_MS) || 0),
};
const CHAT_ANNOUNCE_CASINO_MAP = {
  acebet: { key: "acebet", name: "AceBet" },
  duelbits: { key: "duelbits", name: "Duelbits" },
  flush: { key: "flush", name: "Flush" },
  fortunejack: { key: "fortunejack", name: "FortuneJack" },
  ivibet: { key: "ivibet", name: "Ivibet" },
  lollyspins: { key: "lollyspins", name: "Lollyspins" },
  nvcasino: { key: "nvcasino", name: "NV Casino" },
  ritzo: { key: "ritzo", name: "Ritzo" },
  shakebet: { key: "shakebet", name: "Shakebet" },
  simsinos: { key: "simsinos", name: "Simsinos" },
  stakeprix: { key: "stakeprix", name: "StakePrix" },
  thunderpick: { key: "thunderpick", name: "Thunderpick" },
};
const PRESENCE_CONFIG = {
  onlineWindowMs: Math.max(30 * 1000, Number(process.env.SITE_ONLINE_WINDOW_MS) || 90 * 1000),
  heartbeatWriteThrottleMs: Math.max(10 * 1000, Number(process.env.SITE_PRESENCE_WRITE_THROTTLE_MS) || 30 * 1000),
};

const BONUS_REWARD_KEYS = new Set([
  "acebet-bonus-card",
  "duelbits-bonus-card",
  "flush-bonus-card",
  "fortunejack-bonus-card",
  "gambid-bonus-card",
  "ivibet-bonus-card",
  "lollyspins-bonus-card",
  "nv-casino-bonus-card",
  "ritzo-bonus-card",
  "shakebet-bonus-card",
  "simsinos-bonus-card",
  "stakeprix-bonus-card",
  "thunderpick-bonus-card",
  "wildroll-bonus-card",
]);

const normalizeBonusKey = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const createRewardTrack = () => ({
  accumulatedMs: 0,
  lastHeartbeatAt: null,
});

const getRewardTrack = (user, kind) => {
  if (!user.rewardProgress || typeof user.rewardProgress !== "object") {
    user.rewardProgress = {};
  }

  if (!user.rewardProgress[kind] || typeof user.rewardProgress[kind] !== "object") {
    user.rewardProgress[kind] = createRewardTrack();
  }

  return user.rewardProgress[kind];
};

const resetRewardTrack = (user, kind) => {
  if (!user.rewardProgress || typeof user.rewardProgress !== "object") {
    user.rewardProgress = {};
  }

  user.rewardProgress[kind] = createRewardTrack();
};

const applyRewardHeartbeat = (track, nowTimestamp) => {
  const previousHeartbeatAt = track.lastHeartbeatAt ? new Date(track.lastHeartbeatAt).getTime() : 0;
  if (previousHeartbeatAt > 0) {
    const deltaMs = nowTimestamp - previousHeartbeatAt;
    if (deltaMs > 0 && deltaMs <= REWARD_CONFIG.rewardHeartbeatMaxStepMs) {
      track.accumulatedMs = Math.max(0, (track.accumulatedMs || 0) + deltaMs);
    }
  }

  track.lastHeartbeatAt = new Date(nowTimestamp).toISOString();
  return track.accumulatedMs || 0;
};

const getLevelName = (points = 0) => {
  if (points >= 7500) return "Legend";
  if (points >= 3000) return "Whale";
  if (points >= 1000) return "High Roller";
  if (points >= 250) return "Grinder";
  return "Rookie";
};

const createGiveawayId = () => `gw_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
const createChatId = (prefix = "chat") => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

const ensureGiveawayState = (data) => {
  if (!data.giveaways || typeof data.giveaways !== "object") {
    data.giveaways = { campaigns: [], activeCampaignId: null };
  }

  if (!Array.isArray(data.giveaways.campaigns)) {
    data.giveaways.campaigns = [];
  }

  if (typeof data.giveaways.activeCampaignId !== "string") {
    data.giveaways.activeCampaignId = null;
  }

  return data.giveaways;
};

const ensureChatState = (data) => {
  if (!data.chat || typeof data.chat !== "object") {
    data.chat = { messages: [] };
  }

  if (!Array.isArray(data.chat.messages)) {
    data.chat.messages = [];
  }

  return data.chat;
};

const trimChatMessages = (data, limit = CHAT_CONFIG.maxMessages) => {
  const chat = ensureChatState(data);
  if (chat.messages.length > limit) {
    chat.messages = chat.messages.slice(0, limit);
  }
};

const sanitizeChatContent = (value = "") =>
  String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

const truncateChatSnippet = (value = "", maxLength = 96) => {
  const normalized = sanitizeChatContent(value);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const getChatMemberDisplayName = (user) => {
  if (!user) return "User";
  return String(user.globalName || user.username || "User").trim() || "User";
};

const normalizeUserLookup = (value = "") =>
  String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

const extractDiscordMentionId = (value = "") => {
  const match = String(value ?? "")
    .trim()
    .match(/^<@!?(\d+)>$/);
  return match ? match[1] : "";
};

const normalizeTipLookup = (value = "") => {
  const raw = String(value ?? "").trim();
  const mentionId = extractDiscordMentionId(raw);
  if (mentionId) return mentionId;
  return normalizeUserLookup(raw);
};

const getUserLookupValues = (user) => [
  normalizeUserLookup(user?.discordId),
  normalizeUserLookup(user?.username),
  normalizeUserLookup(user?.globalName),
].filter(Boolean);

const getUserLookupScore = (user, normalizedQuery) => {
  if (!user || !normalizedQuery) return 0;

  const values = getUserLookupValues(user);
  if (values.includes(normalizedQuery)) {
    return 300;
  }

  if (values.some((value) => value.startsWith(normalizedQuery))) {
    return 200;
  }

  if (values.some((value) => value.includes(normalizedQuery))) {
    return 100;
  }

  return 0;
};

const sortLookupUsers = (users, normalizedQuery, sortBy = "recent") =>
  [...users].sort((a, b) => {
    const scoreDelta = getUserLookupScore(b, normalizedQuery) - getUserLookupScore(a, normalizedQuery);
    if (scoreDelta !== 0) return scoreDelta;

    if (sortBy === "lifetime") {
      return (b.lifetimePoints || 0) - (a.lifetimePoints || 0);
    }

    if (sortBy === "streak") {
      return (b.dailyStreak || 0) - (a.dailyStreak || 0);
    }

    if (sortBy === "points") {
      return (b.points || 0) - (a.points || 0);
    }

    return new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime();
  });

const getPresenceState = (user, nowTimestamp = Date.now()) => {
  const lastSeenAt = user?.lastSeenAt || null;
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const isOnline = lastSeenMs > 0 && nowTimestamp - lastSeenMs <= PRESENCE_CONFIG.onlineWindowMs;
  return {
    lastSeenAt,
    isOnline,
  };
};

const buildChatMember = (user) => ({
  discordId: user.discordId,
  username: user.username,
  globalName: user.globalName,
  avatar: user.avatar || null,
  points: user.points || 0,
  lifetimePoints: user.lifetimePoints || 0,
  levelName: getLevelName(user.points || 0),
  isAdmin: Boolean(user.isAdmin),
  ...getPresenceState(user),
});

const normalizeChatAnnounceCasino = (value = "") => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return CHAT_ANNOUNCE_CASINO_MAP[normalized] || null;
};

const serializeChatMessage = (message, data) => {
  if (!message || !data) return null;

  const buildReplyPreview = (replyToId) => {
    if (!replyToId) return null;

    const replyMessage = ensureChatState(data).messages.find((entry) => entry?.id === replyToId);
    if (!replyMessage) return null;

    if (replyMessage.type === "announce") {
      return {
        id: replyMessage.id,
        type: "announce",
        authorName: "Antongambles",
        authorId: "antongambles",
        authorAvatar: null,
        content: truncateChatSnippet(
          replyMessage.casinoName ? `Announcement: ${replyMessage.casinoName}` : replyMessage.content || "Announcement"
        ),
      };
    }

    const replySender = data.users[replyMessage.discordId];
    if (!replySender) return null;

    if (replyMessage.type === "tip") {
      const replyRecipient = data.users[replyMessage.recipientId];
      const recipientName = getChatMemberDisplayName(replyRecipient);
      return {
        id: replyMessage.id,
        type: "tip",
        authorName: getChatMemberDisplayName(replySender),
        authorId: replySender.discordId,
        authorAvatar: replySender.avatar || null,
        content: truncateChatSnippet(
          `tipped ${recipientName} ${(Number(replyMessage.amount) || 0).toLocaleString()} Coins`
        ),
      };
    }

    return {
      id: replyMessage.id,
      type: "text",
      authorName: getChatMemberDisplayName(replySender),
      authorId: replySender.discordId,
      authorAvatar: replySender.avatar || null,
      content: truncateChatSnippet(replyMessage.content || "Message"),
    };
  };

  if (message.type === "announce") {
    return {
      id: message.id,
      type: "announce",
      content: message.content || "",
      casinoName: message.casinoName || "",
      casinoKey: message.casinoKey || "",
      createdAt: message.createdAt,
      sender: {
        name: "Antongambles",
      },
    };
  }

  const sender = data.users[message.discordId];
  if (!sender) return null;

  if (message.type === "tip") {
    const recipient = data.users[message.recipientId];
    if (!recipient) return null;

    return {
      id: message.id,
      type: "tip",
      amount: Number(message.amount) || 0,
      createdAt: message.createdAt,
      sender: buildChatMember(sender),
      recipient: buildChatMember(recipient),
    };
  }

  return {
    id: message.id,
    type: "text",
    content: message.content || "",
    createdAt: message.createdAt,
    sender: buildChatMember(sender),
    replyTo: buildReplyPreview(message.replyToId),
  };
};

const resolveTipRecipient = (data, senderId, recipientId = "", recipientQuery = "") => {
  const users = Object.values(data.users || {});
  const normalizedId = extractDiscordMentionId(recipientId) || String(recipientId || "").trim();
  const normalizedQuery = normalizeTipLookup(recipientQuery);

  if (normalizedId) {
    const recipientById = data.users[normalizedId];
    if (recipientById && recipientById.discordId !== senderId) {
      return recipientById;
    }
  }

  if (!normalizedQuery) {
    return null;
  }

  const matches = sortLookupUsers(
    users.filter((user) => user && user.discordId !== senderId && getUserLookupScore(user, normalizedQuery) > 0),
    normalizedQuery
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    const topScore = getUserLookupScore(matches[0], normalizedQuery);
    const secondScore = getUserLookupScore(matches[1], normalizedQuery);
    if (topScore > secondScore) {
      return matches[0];
    }

    const error = new Error("Multiple users match that name. Be more specific.");
    error.statusCode = 400;
    throw error;
  }

  return null;
};

const GIVEAWAY_TYPE_STAKE = "stake";
const GIVEAWAY_TYPE_DEPOSIT = "deposit";
const GIVEAWAY_DEPOSIT_ENTRY_PENDING = "pending";
const GIVEAWAY_DEPOSIT_ENTRY_APPROVED = "approved";
const GIVEAWAY_DEPOSIT_ENTRY_REJECTED = "rejected";
const GIVEAWAY_DEPOSIT_PHASE_IDLE = "idle";
const GIVEAWAY_DEPOSIT_PHASE_ACCEPTING = "accepting";
const GIVEAWAY_DEPOSIT_PHASE_CLOSED = "closed";
const GIVEAWAY_DEPOSIT_PHASE_DRAWN = "drawn";

const createStarterGiveaway = () => {
  const now = Date.now();
  return {
    id: createGiveawayId(),
    title: "Anton Community Vault Drop",
    subtitle: "Stake Coins to fight for better odds without letting one wallet own every drop.",
    description:
      "Users burn Coins to enter, and draw power scales softly from the stake so smaller balances still have a shot.",
    prize: "1x VIP community drop",
    status: "active",
    winnersCount: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: "system",
    endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    entries: [],
    winners: [],
    type: GIVEAWAY_TYPE_STAKE,
  };
};

const createStarterDepositGiveaway = () => {
  const now = Date.now();
  return {
    id: createGiveawayId(),
    title: "Deposit Giveaway",
    subtitle: "Deposit at one of our casinos and submit a screenshot for a chance to win.",
    description:
      "Make a deposit at any casino using AntonGambles links. Upload a screenshot of your successful deposit to enter. Admin approves valid entries before the live draw.",
    prize: "$250 CASH",
    phase: GIVEAWAY_DEPOSIT_PHASE_IDLE,
    winnersCount: 1,
    minDepositAmount: 20,
    minDepositCurrency: "USD / EUR",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: "system",
    entries: [],
    winners: [],
    type: GIVEAWAY_TYPE_DEPOSIT,
  };
};

const getGiveawayWeight = (stake = 0) => {
  const normalizedStake = Math.max(0, Number(stake) || 0);
  return Math.max(1, Math.floor(Math.sqrt(normalizedStake)));
};

const hasValidStakeEntry = (entry) => {
  const stake = Number(entry?.stake);
  const weight = Number(entry?.weight);
  return Number.isFinite(stake) && stake >= GIVEAWAY_STAKE_CONFIG.minStake && Number.isFinite(weight) && weight > 0;
};

const sanitizeCampaignEntries = (campaign) => {
  if (!campaign || !Array.isArray(campaign.entries)) return false;

  const originalLength = campaign.entries.length;
  campaign.entries = campaign.entries.filter(hasValidStakeEntry);
  return campaign.entries.length !== originalLength;
};

const hydrateGiveawayEntry = (entry, data) => {
  const user = data.users[entry.discordId];
  if (!user) return null;

  return {
    discordId: entry.discordId,
    enteredAt: entry.enteredAt,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar || null,
    points: user.points || 0,
    stake: Math.max(0, Number(entry.stake) || 0),
    levelName: getLevelName(user.points || 0),
    weight: Math.max(1, Number(entry.weight) || getGiveawayWeight(entry.stake || 0)),
  };
};

const aggregateHydratedEntries = (entries = []) => {
  const groupedEntries = new Map();

  entries.forEach((entry) => {
    if (!entry?.discordId) return;

    const current = groupedEntries.get(entry.discordId);
    if (!current) {
      groupedEntries.set(entry.discordId, {
        ...entry,
        stake: Math.max(0, Number(entry.stake) || 0),
        weight: Math.max(0, Number(entry.weight) || 0),
      });
      return;
    }

    const currentEnteredAt = new Date(current.enteredAt || 0).getTime();
    const nextEnteredAt = new Date(entry.enteredAt || 0).getTime();
    groupedEntries.set(entry.discordId, {
      ...current,
      enteredAt: nextEnteredAt >= currentEnteredAt ? entry.enteredAt : current.enteredAt,
      stake: (current.stake || 0) + Math.max(0, Number(entry.stake) || 0),
      weight: (current.weight || 0) + Math.max(0, Number(entry.weight) || 0),
      points: Math.max(Number(current.points) || 0, Number(entry.points) || 0),
      username: entry.username || current.username,
      globalName: entry.globalName || current.globalName,
      avatar: entry.avatar || current.avatar,
      levelName: entry.levelName || current.levelName,
    });
  });

  return Array.from(groupedEntries.values());
};

const serializeGiveawayCampaign = (campaign, data, discordId = null) => {
  if (!campaign) return null;

  const hydratedEntries = aggregateHydratedEntries(
    (campaign.entries || [])
    .map((entry) => hydrateGiveawayEntry(entry, data))
    .filter(Boolean)
  )
    .sort((a, b) => b.stake - a.stake || b.weight - a.weight || b.points - a.points);

  const totalWeight = hydratedEntries.reduce((sum, entry) => sum + entry.weight, 0);
  const totalStaked = hydratedEntries.reduce((sum, entry) => sum + (entry.stake || 0), 0);
  const serializedWinners = Array.isArray(campaign.winners)
    ? campaign.winners.map((winner) => ({
        ...clone(winner),
        winChance: Number.isFinite(Number(winner?.winChance))
          ? Number(winner.winChance)
          : getWinnerChancePercent(winner, totalWeight),
      }))
    : [];
  const me = discordId
    ? (() => {
        const profile = data.users[discordId] || null;
        const entered = hydratedEntries.find((entry) => entry.discordId === discordId) || null;
        const estimatedChance = entered && totalWeight > 0 ? (entered.weight / totalWeight) * 100 : 0;
        return {
          isLoggedIn: Boolean(profile),
          isEntered: Boolean(entered),
          points: profile?.points || 0,
          balancePoints: profile?.points || 0,
          stake: entered?.stake || 0,
          weight: entered?.weight || 0,
          levelName: profile ? getLevelName(profile.points || 0) : null,
          estimatedChance,
        };
      })()
    : null;

  return {
    id: campaign.id,
    title: campaign.title,
    subtitle: campaign.subtitle,
    description: campaign.description,
    prize: campaign.prize,
    status: campaign.status,
    winnersCount: campaign.winnersCount,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    drawnAt: campaign.drawnAt || null,
    createdBy: campaign.createdBy,
    durationMs: Math.max(0, new Date(campaign.endsAt).getTime() - new Date(campaign.createdAt).getTime()),
    durationLabel: formatGiveawayDurationLabel(
      Math.max(0, new Date(campaign.endsAt).getTime() - new Date(campaign.createdAt).getTime())
    ),
    endsAt: campaign.endsAt,
    endsInMs: Math.max(0, new Date(campaign.endsAt).getTime() - Date.now()),
    entrantCount: hydratedEntries.length,
    totalStaked,
    totalWeight,
    averageStake: hydratedEntries.length ? totalStaked / hydratedEntries.length : 0,
    averageWeight: hydratedEntries.length ? totalWeight / hydratedEntries.length : 0,
    topEntries: hydratedEntries.map((entry) => ({
      ...entry,
      estimatedChance: getWinnerChancePercent(entry, totalWeight),
    })),
    winners: serializedWinners,
    me,
    stakeConfig: {
      minStake: GIVEAWAY_STAKE_CONFIG.minStake,
    },
    oddsNote:
      "Each user burns Coins to enter. Draw power scales from staked Coins with a soft curve, so bigger bets help without letting one wallet steamroll every drop.",
  };
};

const getActiveCampaignInternal = (data) => {
  const giveaways = ensureGiveawayState(data);
  const activeId = giveaways.activeCampaignId;
  if (!activeId) return null;
  return giveaways.campaigns.find((campaign) => campaign.id === activeId && campaign.status === "active") || null;
};

const ensureStarterDepositGiveaway = (data) => {
  const giveaways = ensureGiveawayState(data);
  const hasAnyDeposit = giveaways.campaigns.some((c) => c.type === GIVEAWAY_TYPE_DEPOSIT);
  if (hasAnyDeposit) return null;
  const starter = createStarterDepositGiveaway();
  giveaways.campaigns.unshift(starter);
  giveaways.activeDepositCampaignId = starter.id;
  return starter;
};

const hydrateDepositEntry = (entry, data) => {
  const user = data.users[entry.discordId];
  if (!user) return null;
  return {
    id: entry.id,
    discordId: entry.discordId,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar || null,
    imageUrl: entry.imageUrl || null,
    note: entry.note || "",
    status: entry.status || GIVEAWAY_DEPOSIT_ENTRY_PENDING,
    submittedAt: entry.submittedAt || entry.enteredAt,
    reviewedAt: entry.reviewedAt || null,
    reviewedBy: entry.reviewedBy || null,
    levelName: getLevelName(user.points || 0),
    points: user.points || 0,
  };
};

const serializeDepositCampaign = (campaign, data, discordId = null, isAdmin = false) => {
  if (!campaign) return null;
  const hydratedAll = (campaign.entries || [])
    .map((entry) => hydrateDepositEntry(entry, data))
    .filter(Boolean);
  const approvedEntries = hydratedAll.filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_APPROVED);
  const pendingEntries = hydratedAll.filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_PENDING);
  const rejectedEntries = hydratedAll.filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_REJECTED);
  const serializedWinners = Array.isArray(campaign.winners) ? campaign.winners.map((winner) => ({ ...clone(winner) })) : [];

  const myEntries = discordId
    ? hydratedAll.filter((e) => e.discordId === discordId).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    : [];

  return {
    id: campaign.id,
    title: campaign.title,
    subtitle: campaign.subtitle,
    description: campaign.description,
    prize: campaign.prize,
    phase: campaign.phase,
    winnersCount: campaign.winnersCount,
    minDepositAmount: campaign.minDepositAmount,
    minDepositCurrency: campaign.minDepositCurrency,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    drawnAt: campaign.drawnAt || null,
    createdBy: campaign.createdBy,
    type: campaign.type,
    entryCount: approvedEntries.length,
    totalEntryCount: hydratedAll.length,
    pendingCount: isAdmin ? pendingEntries.length : null,
    approvedEntries: approvedEntries.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
    pendingEntries: isAdmin ? pendingEntries.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)) : [],
    rejectedEntries: isAdmin ? rejectedEntries : [],
    winners: serializedWinners,
    me: discordId ? {
      isLoggedIn: Boolean(data.users[discordId]),
      myEntries,
      myApprovedCount: myEntries.filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_APPROVED).length,
      myPendingCount: myEntries.filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_PENDING).length,
    } : null,
  };
};

const getActiveDepositCampaignInternal = (data) => {
  const giveaways = ensureGiveawayState(data);
  if (typeof giveaways.activeDepositCampaignId !== "string" || !giveaways.activeDepositCampaignId) {
    const firstDeposit = giveaways.campaigns.find((c) => c.type === GIVEAWAY_TYPE_DEPOSIT);
    if (firstDeposit) {
      giveaways.activeDepositCampaignId = firstDeposit.id;
      return firstDeposit;
    }
    return null;
  }
  return giveaways.campaigns.find((c) => c.id === giveaways.activeDepositCampaignId) || null;
};

const getDepositGiveawayOverviewInternal = (data, discordId = null, isAdmin = false) => {
  const active = getActiveDepositCampaignInternal(data);
  const history = ensureGiveawayState(data).campaigns
    .filter((c) => c.type === GIVEAWAY_TYPE_DEPOSIT && c.phase === GIVEAWAY_DEPOSIT_PHASE_DRAWN)
    .slice(0, 5)
    .map((c) => serializeDepositCampaign(c, data, discordId, isAdmin));
  const overview = {
    activeCampaign: active ? serializeDepositCampaign(active, data, discordId, isAdmin) : null,
    history,
  };

  // Add profile snapshot for logged-in users (debug + my panel info)
  if (discordId && data.users[discordId]) {
    const user = data.users[discordId];
    overview.me = {
      discordId,
      username: user.username,
      globalName: user.globalName || user.username,
      avatar: user.avatar || null,
      isAdmin: Boolean(user.isAdmin),
      discordRoleIds: Array.isArray(user.discordRoleIds) ? [...user.discordRoleIds] : [],
      discordRoleNames: Array.isArray(user.discordRoleNames) ? [...user.discordRoleNames] : [],
      points: typeof user.points === "number" ? user.points : 0,
      isLoggedIn: true,
      createdAt: user.createdAt || null,
      lastLoginAt: user.lastLoginAt || null,
    };
    overview.myDiscordRoles = overview.me.discordRoleNames;
  } else if (discordId) {
    overview.me = { discordId, isLoggedIn: false };
    overview.myDiscordRoles = [];
  }

  return overview;
};

const getDepositGiveawayOverview = async (discordId = null, isAdmin = false) =>
  updateData(async (data) => getDepositGiveawayOverviewInternal(data, discordId, isAdmin));

const createDepositGiveaway = async ({
  title,
  subtitle = "",
  description = "",
  prize,
  winnersCount = 1,
  minDepositAmount = 20,
  minDepositCurrency = "USD / EUR",
  actor = "admin",
  autoStart = true,
}) =>
  updateData(async (data) => {
    const giveaways = ensureGiveawayState(data);
    const prev = getActiveDepositCampaignInternal(data);
    if (prev && prev.phase === GIVEAWAY_DEPOSIT_PHASE_ACCEPTING) {
      prev.phase = GIVEAWAY_DEPOSIT_PHASE_CLOSED;
      prev.updatedAt = nowIso();
    }
    const campaign = {
      id: createGiveawayId(),
      title: String(title || "Deposit Giveaway").trim(),
      subtitle: String(subtitle || "").trim(),
      description: String(description || "").trim(),
      prize: String(prize || "$250 CASH").trim(),
      phase: autoStart ? GIVEAWAY_DEPOSIT_PHASE_ACCEPTING : GIVEAWAY_DEPOSIT_PHASE_IDLE,
      winnersCount: Math.min(Math.max(parseInt(winnersCount, 10) || 1, 1), 10),
      minDepositAmount: Math.max(1, Number(minDepositAmount) || 20),
      minDepositCurrency: String(minDepositCurrency || "USD / EUR").trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor,
      entries: [],
      winners: [],
      type: GIVEAWAY_TYPE_DEPOSIT,
    };
    giveaways.campaigns.unshift(campaign);
    giveaways.activeDepositCampaignId = campaign.id;
    data.events.unshift({
      type: "giveaway_created",
      actor,
      campaignId: campaign.id,
      title: campaign.title,
      prize: campaign.prize,
      depositGiveaway: true,
      timestamp: nowIso(),
    });
    if (autoStart) {
      data.events.unshift({
        type: "giveaway_phase_change",
        actor,
        campaignId: campaign.id,
        from: GIVEAWAY_DEPOSIT_PHASE_IDLE,
        to: GIVEAWAY_DEPOSIT_PHASE_ACCEPTING,
        depositGiveaway: true,
        timestamp: nowIso(),
      });
    }
    trimEvents(data);
    return serializeDepositCampaign(campaign, data, null, true);
  });

const submitDepositGiveawayEntry = async ({
  discordId,
  imageUrl,
  note = "",
}) =>
  updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }
    const campaign = getActiveDepositCampaignInternal(data);
    if (!campaign || campaign.phase !== GIVEAWAY_DEPOSIT_PHASE_ACCEPTING) {
      const error = new Error("Giveaway is not accepting entries right now");
      error.statusCode = 400;
      throw error;
    }
    const entry = {
      id: `gwe_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      discordId,
      imageUrl: String(imageUrl || "").trim(),
      note: String(note || "").slice(0, 500),
      status: GIVEAWAY_DEPOSIT_ENTRY_PENDING,
      submittedAt: nowIso(),
      reviewedAt: null,
      reviewedBy: null,
    };
    if (!entry.imageUrl) {
      const error = new Error("Screenshot is required");
      error.statusCode = 400;
      throw error;
    }
    campaign.entries.push(entry);
    campaign.updatedAt = nowIso();
    data.events.unshift({
      type: "giveaway_entered",
      discordId,
      username: user.username,
      globalName: user.globalName,
      campaignId: campaign.id,
      title: campaign.title,
      depositGiveaway: true,
      entryId: entry.id,
      timestamp: nowIso(),
    });
    trimEvents(data);
    return {
      entryId: entry.id,
      campaign: serializeDepositCampaign(campaign, data, discordId),
    };
  });

const reviewDepositGiveawayEntry = async ({ actor, entryId, status }) =>
  updateData(async (data) => {
    const validStatuses = [GIVEAWAY_DEPOSIT_ENTRY_APPROVED, GIVEAWAY_DEPOSIT_ENTRY_REJECTED];
    if (!validStatuses.includes(status)) {
      const error = new Error("Invalid status");
      error.statusCode = 400;
      throw error;
    }
    const campaign = getActiveDepositCampaignInternal(data);
    if (!campaign) {
      const error = new Error("No active deposit giveaway");
      error.statusCode = 404;
      throw error;
    }
    const entry = campaign.entries.find((e) => e.id === entryId);
    if (!entry) {
      const error = new Error("Entry not found");
      error.statusCode = 404;
      throw error;
    }
    entry.status = status;
    entry.reviewedAt = nowIso();
    entry.reviewedBy = actor;
    campaign.updatedAt = nowIso();
    return {
      entry,
      campaign: serializeDepositCampaign(campaign, data, null, true),
    };
  });

const setDepositGiveawayPhase = async ({ actor, phase }) =>
  updateData(async (data) => {
    const validPhases = [GIVEAWAY_DEPOSIT_PHASE_IDLE, GIVEAWAY_DEPOSIT_PHASE_ACCEPTING, GIVEAWAY_DEPOSIT_PHASE_CLOSED, GIVEAWAY_DEPOSIT_PHASE_DRAWN];
    if (!validPhases.includes(phase)) {
      const error = new Error("Invalid phase");
      error.statusCode = 400;
      throw error;
    }
    const campaign = getActiveDepositCampaignInternal(data);
    if (!campaign) {
      const error = new Error("No active deposit giveaway");
      error.statusCode = 404;
      throw error;
    }
    campaign.phase = phase;
    campaign.updatedAt = nowIso();
    if (phase === GIVEAWAY_DEPOSIT_PHASE_DRAWN) {
      campaign.drawnAt = nowIso();
    }
    return serializeDepositCampaign(campaign, data, null, true);
  });

const drawDepositGiveawayWinners = async ({ actor = "admin" } = {}) =>
  updateData(async (data) => {
    const campaign = getActiveDepositCampaignInternal(data);
    if (!campaign) {
      const error = new Error("No active deposit giveaway");
      error.statusCode = 404;
      throw error;
    }
    if (campaign.phase === GIVEAWAY_DEPOSIT_PHASE_ACCEPTING) {
      campaign.phase = GIVEAWAY_DEPOSIT_PHASE_CLOSED;
    }
    const approvedPool = campaign.entries
      .filter((e) => e.status === GIVEAWAY_DEPOSIT_ENTRY_APPROVED)
      .map((entry) => hydrateDepositEntry(entry, data))
      .filter(Boolean);
    if (!approvedPool.length) {
      campaign.updatedAt = nowIso();
      return {
        status: "no_entries",
        winners: [],
        campaign: serializeDepositCampaign(campaign, data, null, true),
        hadEntries: false,
      };
    }
    const timestamp = nowIso();
    const pool = [...approvedPool];
    const winners = [];
    const draws = Math.min(campaign.winnersCount || 1, pool.length);
    for (let i = 0; i < draws; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      const winner = pool[index];
      winners.push({
        ...winner,
        selectedAt: timestamp,
        winChance: Number((100 / approvedPool.length).toFixed(2)),
      });
      pool.splice(index, 1);
    }
    campaign.winners = winners.map((w) => ({
      discordId: w.discordId,
      username: w.username,
      globalName: w.globalName,
      avatar: w.avatar,
      selectedAt: w.selectedAt,
      winChance: w.winChance,
    }));
    campaign.phase = GIVEAWAY_DEPOSIT_PHASE_DRAWN;
    campaign.updatedAt = timestamp;
    campaign.drawnAt = timestamp;
    data.events.unshift({
      type: "giveaway_drawn",
      actor,
      campaignId: campaign.id,
      title: campaign.title,
      winners: winners.map((w) => w.discordId),
      depositGiveaway: true,
      timestamp,
    });
    trimEvents(data);
    return {
      status: "drawn",
      winners: clone(winners),
      campaign: serializeDepositCampaign(campaign, data, null, true),
      hadEntries: winners.length > 0,
    };
  });

const resetDepositGiveaway = async ({ actor = "admin" } = {}) =>
  updateData(async (data) => {
    const campaign = getActiveDepositCampaignInternal(data);
    if (!campaign) {
      const error = new Error("No active deposit giveaway");
      error.statusCode = 404;
      throw error;
    }
    campaign.phase = GIVEAWAY_DEPOSIT_PHASE_IDLE;
    campaign.winners = [];
    campaign.drawnAt = null;
    campaign.entries = [];
    campaign.updatedAt = nowIso();
    return serializeDepositCampaign(campaign, data, null, true);
  });

const ensureStarterGiveaway = (data) => {
  const giveaways = ensureGiveawayState(data);
  const activeCampaign = getActiveCampaignInternal(data);
  if (activeCampaign || giveaways.campaigns.length > 0) {
    return activeCampaign;
  }

  const starter = createStarterGiveaway();
  giveaways.campaigns.unshift(starter);
  giveaways.activeCampaignId = starter.id;
  return starter;
};

const expireActiveGiveaways = (data) => {
  const giveaways = ensureGiveawayState(data);
  const now = Date.now();
  let didChange = false;

  giveaways.campaigns.forEach((campaign) => {
    if (campaign.status === "active" && new Date(campaign.endsAt).getTime() <= now) {
      campaign.status = "ended";
      campaign.updatedAt = nowIso();
      if (giveaways.activeCampaignId === campaign.id) {
        giveaways.activeCampaignId = null;
      }
      didChange = true;
    }
  });

  return didChange;
};

const getGiveawayOverviewInternal = (data, discordId = null) => {
  expireActiveGiveaways(data);
  settlePendingGiveawayCampaigns(data);
  const activeCampaign = getActiveCampaignInternal(data) || ensureStarterGiveaway(data);
  if (activeCampaign) {
    sanitizeCampaignEntries(activeCampaign);
  }

  return {
    activeCampaign: serializeGiveawayCampaign(activeCampaign, data, discordId),
    history: ensureGiveawayState(data).campaigns
      .filter((campaign) => campaign.status !== "active")
      .slice(0, 5)
      .map((campaign) => serializeGiveawayCampaign(campaign, data, discordId)),
  };
};

const getGiveawayOverview = async (discordId = null) =>
  updateData(async (data) => {
    // #region debug-point D:getGiveawayOverview
    reportStoreDebug("D", "[DEBUG] getGiveawayOverview invoked", {
      pid: process.pid,
      discordId,
    });
    // #endregion
    return getGiveawayOverviewInternal(data, discordId);
  });

const getGiveawayOverviewReadOnly = getGiveawayOverview;

const enterGiveaway = async ({ discordId, stake }) =>
  updateData(async (data) => {
    // #region debug-point B:enterGiveaway
    reportStoreDebug("B", "[DEBUG] enterGiveaway invoked", {
      pid: process.pid,
      discordId,
      stake,
    });
    // #endregion
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    expireActiveGiveaways(data);
    const activeCampaign = getActiveCampaignInternal(data);
    if (!activeCampaign || activeCampaign.status !== "active") {
      const error = new Error("No active giveaway");
      error.statusCode = 404;
      throw error;
    }

    sanitizeCampaignEntries(activeCampaign);

    const endAtMs = new Date(activeCampaign.endsAt).getTime();
    if (endAtMs <= Date.now()) {
      const error = new Error("This giveaway is closed");
      error.statusCode = 400;
      throw error;
    }

    const normalizedStake = Math.floor(Number(stake) || 0);
    if (!Number.isFinite(normalizedStake) || normalizedStake < GIVEAWAY_STAKE_CONFIG.minStake) {
      const error = new Error(`Minimum stake is ${GIVEAWAY_STAKE_CONFIG.minStake} Coins`);
      error.statusCode = 400;
      throw error;
    }

    if (normalizedStake > (user.points || 0)) {
      const error = new Error("Not enough Coins");
      error.statusCode = 400;
      throw error;
    }

    const weight = getGiveawayWeight(normalizedStake);
    user.points = Math.max(0, (user.points || 0) - normalizedStake);
    activeCampaign.entries.push({
      discordId,
      enteredAt: nowIso(),
      stake: normalizedStake,
      weight,
    });
    activeCampaign.updatedAt = nowIso();

    data.events.unshift({
      type: "giveaway_entered",
      discordId: user.discordId,
      username: user.username,
      globalName: user.globalName,
      campaignId: activeCampaign.id,
      title: activeCampaign.title,
      stake: normalizedStake,
      weight,
      pointsAfter: user.points,
      timestamp: nowIso(),
    });
    trimEvents(data);

    return {
      alreadyEntered: false,
      giveaway: serializeGiveawayCampaign(activeCampaign, data, discordId),
    };
  });

const createGiveaway = async ({
  title,
  subtitle = "",
  description = "",
  prize,
  durationHours = 72,
  durationInput = null,
  winnersCount = 1,
  actor = "bot",
}) =>
  updateData(async (data) => {
    const giveaways = ensureGiveawayState(data);
    expireActiveGiveaways(data);
    settlePendingGiveawayCampaigns(data);
    const previousActive = getActiveCampaignInternal(data);
    if (previousActive) {
      sanitizeCampaignEntries(previousActive);
      const hasEntriesToSettle = Array.isArray(previousActive.entries) && previousActive.entries.some(hasValidStakeEntry);
      if (hasEntriesToSettle && (!Array.isArray(previousActive.winners) || previousActive.winners.length === 0)) {
        settleGiveawayCampaign(previousActive, data, { actor });
      } else {
        previousActive.status = "replaced";
        previousActive.updatedAt = nowIso();
      }
    }

    const normalizedDuration = parseGiveawayDurationInput(durationInput ?? durationHours);
    const normalizedWinnersCount = Math.min(Math.max(parseInt(winnersCount, 10) || 1, 1), 10);
    const campaign = {
      id: createGiveawayId(),
      title: String(title || "Coins Giveaway").trim(),
      subtitle: String(subtitle || "").trim(),
      description: String(description || "").trim(),
      prize: String(prize || "Community reward drop").trim(),
      status: "active",
      winnersCount: normalizedWinnersCount,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: actor,
      endsAt: new Date(Date.now() + normalizedDuration.durationMs).toISOString(),
      entries: [],
      winners: [],
    };

    giveaways.campaigns.unshift(campaign);
    giveaways.activeCampaignId = campaign.id;

    data.events.unshift({
      type: "giveaway_created",
      actor,
      campaignId: campaign.id,
      title: campaign.title,
      prize: campaign.prize,
      durationLabel: normalizedDuration.durationLabel,
      timestamp: nowIso(),
    });
    trimEvents(data);

    return serializeGiveawayCampaign(campaign, data);
  });

const drawWeightedWinner = (pool) => {
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }

  return pool[pool.length - 1] || null;
};

const getWinnerChancePercent = (entry, totalWeight) => {
  const numericWeight = Number(entry?.weight) || 0;
  const numericTotalWeight = Number(totalWeight) || 0;
  if (numericWeight <= 0 || numericTotalWeight <= 0) return 0;
  return (numericWeight / numericTotalWeight) * 100;
};

const formatGiveawayDurationLabel = (durationMs) => {
  const safeDurationMs = Math.max(0, Number(durationMs) || 0);
  if (!safeDurationMs) {
    return "0m";
  }

  const totalMinutes = Math.max(1, Math.round(safeDurationMs / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
};

const parseGiveawayDurationInput = (input) => {
  if (typeof input === "number" && Number.isFinite(input)) {
    const durationMs = input * 60 * 60 * 1000;
    const normalizedDurationMs = Math.min(Math.max(durationMs, GIVEAWAY_DURATION_MIN_MS), GIVEAWAY_DURATION_MAX_MS);
    return {
      durationMs: normalizedDurationMs,
      durationLabel: formatGiveawayDurationLabel(normalizedDurationMs),
    };
  }

  const rawValue = String(input ?? "").trim().toLowerCase();
  if (!rawValue) {
    return {
      durationMs: GIVEAWAY_DURATION_FALLBACK_MS,
      durationLabel: formatGiveawayDurationLabel(GIVEAWAY_DURATION_FALLBACK_MS),
    };
  }

  if (/^\d+$/.test(rawValue)) {
    const durationMs = Number(rawValue) * 60 * 60 * 1000;
    const normalizedDurationMs = Math.min(Math.max(durationMs, GIVEAWAY_DURATION_MIN_MS), GIVEAWAY_DURATION_MAX_MS);
    return {
      durationMs: normalizedDurationMs,
      durationLabel: formatGiveawayDurationLabel(normalizedDurationMs),
    };
  }

  const durationPattern =
    /(\d+)\s*(d|day|days|dag|dagar|h|hr|hrs|hour|hours|tim|timme|timmar|m|min|mins|minute|minutes|minut|minuter)/g;
  let totalDurationMs = 0;
  let match = durationPattern.exec(rawValue);

  while (match) {
    const amount = Number(match[1]) || 0;
    const unit = match[2];
    if (["d", "day", "days", "dag", "dagar"].includes(unit)) {
      totalDurationMs += amount * 24 * 60 * 60 * 1000;
    } else if (["h", "hr", "hrs", "hour", "hours", "tim", "timme", "timmar"].includes(unit)) {
      totalDurationMs += amount * 60 * 60 * 1000;
    } else {
      totalDurationMs += amount * 60 * 1000;
    }
    match = durationPattern.exec(rawValue);
  }

  const normalizedDurationMs = Math.min(
    Math.max(totalDurationMs || GIVEAWAY_DURATION_FALLBACK_MS, GIVEAWAY_DURATION_MIN_MS),
    GIVEAWAY_DURATION_MAX_MS
  );

  return {
    durationMs: normalizedDurationMs,
    durationLabel: formatGiveawayDurationLabel(normalizedDurationMs),
  };
};

const buildWeightedGiveawayPool = (campaign, data) =>
  aggregateHydratedEntries(
    (campaign.entries || [])
      .map((entry) => hydrateGiveawayEntry(entry, data))
      .filter(Boolean)
  ).map((entry) => ({
    discordId: entry.discordId,
    username: entry.username,
    globalName: entry.globalName,
    avatar: entry.avatar || null,
    points: entry.points,
    stake: entry.stake,
    weight: entry.weight,
  }));

const settleGiveawayCampaign = (campaign, data, { actor = "system" } = {}) => {
  if (!campaign) {
    return { winners: [], hadEntries: false };
  }

  sanitizeCampaignEntries(campaign);
  const weightedPool = buildWeightedGiveawayPool(campaign, data);
  const timestamp = nowIso();
  const winners = [];
  const pool = [...weightedPool];
  const draws = Math.min(campaign.winnersCount || 1, pool.length);

  for (let index = 0; index < draws; index += 1) {
    const totalWeightAtDraw = pool.reduce((sum, entry) => sum + entry.weight, 0);
    const winner = drawWeightedWinner(pool);
    if (!winner) break;

    winners.push({
      ...winner,
      selectedAt: timestamp,
      winChance: getWinnerChancePercent(winner, totalWeightAtDraw),
      totalWeightAtDraw,
      entrantsAtDraw: pool.length,
    });

    const removeIndex = pool.findIndex((entry) => entry.discordId === winner.discordId);
    if (removeIndex >= 0) {
      pool.splice(removeIndex, 1);
    }
  }

  campaign.winners = winners;
  campaign.status = "drawn";
  campaign.updatedAt = timestamp;
  campaign.drawnAt = timestamp;

  data.events.unshift({
    type: "giveaway_drawn",
    actor,
    campaignId: campaign.id,
    title: campaign.title,
    winners: winners.map((winner) => winner.discordId),
    timestamp,
  });
  trimEvents(data);

  return {
    winners,
    hadEntries: weightedPool.length > 0,
  };
};

const settlePendingGiveawayCampaigns = (data, { actor = "system-auto" } = {}) => {
  const giveaways = ensureGiveawayState(data);
  let didSettle = false;

  giveaways.campaigns.forEach((campaign) => {
    const needsSettlement =
      campaign?.status === "ended" &&
      (!Array.isArray(campaign.winners) || campaign.winners.length === 0);

    if (!needsSettlement) {
      return;
    }

    const result = settleGiveawayCampaign(campaign, data, { actor });
    if (result.hadEntries || campaign.drawnAt) {
      didSettle = true;
    }
  });

  return didSettle;
};

const drawGiveaway = async ({ actor = "bot", campaignId = null } = {}) =>
  updateData(async (data) => {
    const giveaways = ensureGiveawayState(data);
    expireActiveGiveaways(data);
    const campaign =
      giveaways.campaigns.find((entry) => entry.id === campaignId) ||
      giveaways.campaigns.find((entry) => entry.id === giveaways.activeCampaignId && entry.status === "active") ||
      giveaways.campaigns.find(
        (entry) =>
          (entry.status === "active" || entry.status === "ended") &&
          (!Array.isArray(entry.winners) || entry.winners.length === 0)
      );

    if (!campaign) {
      const error = new Error("No active giveaway found");
      error.statusCode = 404;
      throw error;
    }

    const weightedPool = buildWeightedGiveawayPool(campaign, data);
    if (!weightedPool.length) {
      // Return success shape with noWinners status instead of throwing —
      // Discord and frontend UIs show this as "Inga deltagare än", not an error.
      campaign.updatedAt = nowIso();
      giveaways.activeCampaignId = campaign.status === "active" ? campaign.id : giveaways.activeCampaignId;
      return {
        status: "no_entries",
        campaign: serializeGiveawayCampaign(campaign, data),
        winners: [],
        hadEntries: false,
      };
    }
    const { winners } = settleGiveawayCampaign(campaign, data, { actor });
    giveaways.activeCampaignId = null;

    return {
      status: "drawn",
      campaign: serializeGiveawayCampaign(campaign, data),
      winners: clone(winners),
      hadEntries: winners.length > 0,
    };
  });

const getGiveawayHistory = async (limit = 5) => {
  return updateData(async (data) => {
    expireActiveGiveaways(data);
    settlePendingGiveawayCampaigns(data);
    return data.giveaways.campaigns
      .filter((campaign) => campaign.status !== "active")
      .slice(0, sanitizeLimit(limit, 5, 20))
      .map((campaign) => serializeGiveawayCampaign(campaign, data));
  });
};

const getOrCreateUser = (data, discordUser) => {
  const existing = data.users[discordUser.id];
  const createdAt = existing?.createdAt || nowIso();

  const user = {
    discordId: discordUser.id,
    username: discordUser.username,
    globalName: discordUser.global_name || discordUser.globalName || discordUser.username,
    avatar: discordUser.avatar || null,
    email: discordUser.email || existing?.email || null,
    guildIds: existing?.guildIds || [],
    points: existing?.points || 0,
    lifetimePoints: existing?.lifetimePoints || 0,
    dailyStreak: existing?.dailyStreak || 0,
    bestDailyStreak: existing?.bestDailyStreak || 0,
    createdAt,
    lastLoginAt: existing?.lastLoginAt || null,
    lastSeenAt: existing?.lastSeenAt || null,
    lastDailyClaimAt: existing?.lastDailyClaimAt || null,
    lastVisitRewardAt: existing?.lastVisitRewardAt || null,
    streamCooldownUntil: existing?.streamCooldownUntil || null,
    bonusCooldowns: existing?.bonusCooldowns || {},
    rewardProgress: existing?.rewardProgress || {},
    isAdmin: Boolean(existing?.isAdmin),
    discordRoleIds: Array.isArray(existing?.discordRoleIds) ? [...existing.discordRoleIds] : [],
    discordRoleNames: Array.isArray(existing?.discordRoleNames) ? [...existing.discordRoleNames] : [],
    mutedUntil: existing?.mutedUntil || null,
    muteReason: existing?.muteReason || "",
  };

  data.users[discordUser.id] = user;
  return { user, isNew: !existing };
};

const upsertDiscordUser = async (discordUser, guilds = []) => {
  const timestamp = nowIso();
  let data;
  try {
    data = await readData();
  } catch (_) {
    data = { ...clone(DEFAULT_DATA), users: {} };
  }
  const { user, isNew } = getOrCreateUser(data, discordUser);
  user.username = discordUser.username;
  user.globalName = discordUser.global_name || discordUser.globalName || discordUser.username;
  user.avatar = discordUser.avatar || null;
  user.email = discordUser.email || user.email || null;
  user.guildIds = guilds.map((guild) => guild.id);
  user.lastLoginAt = timestamp;
  user.lastSeenAt = timestamp;

  data.events.unshift({
    type: isNew ? "user_created" : "user_login",
    discordId: user.discordId,
    username: user.username,
    globalName: user.globalName,
    timestamp,
  });
  trimEvents(data);

  const profile = buildPrivateProfile(user);

  void updateData(async (persisted) => {
    const target = persisted.users[discordUser.id] || getOrCreateUser(persisted, discordUser).user;
    target.username = user.username;
    target.globalName = user.globalName;
    target.avatar = user.avatar;
    target.email = user.email;
    target.guildIds = user.guildIds;
    target.lastLoginAt = timestamp;
    target.lastSeenAt = timestamp;

    const hasEquivalentEvent = (persisted.events || []).some(
      (ev) =>
        ev &&
        (ev.type === "user_created" || ev.type === "user_login") &&
        ev.discordId === user.discordId &&
        ev.timestamp === timestamp
    );
    if (!hasEquivalentEvent) {
      persisted.events.unshift({
        type: isNew ? "user_created" : "user_login",
        discordId: user.discordId,
        username: user.username,
        globalName: user.globalName,
        timestamp,
      });
      trimEvents(persisted);
    }
  }).catch((err) => {
    reportStoreDebug("A", "[DEBUG] upsertDiscordUser background persist failed (non-fatal)", {
      message: err?.message || null,
      code: err?.code || null,
      discordId: user.discordId,
    });
    console.warn("Non-fatal: upsertDiscordUser persist failed:", err?.message || err);
  });

  return {
    isNew,
    profile,
    user: clone(user),
  };
};

const getUserProfile = async (discordId) => {
  const data = await readData();
  const user = data.users[discordId];
  return user ? buildPrivateProfile(user) : null;
};

const STORE_PACKAGES = Object.freeze({
  basic: {
    id: "basic",
    name: "Unlock $10",
    usdOut: 10,
    usdBaseOut: 10,
    agCost: 10000,
    agCostNoBonus: 10000,
    bonusPercent: 0,
    popular: false,
    tier: 1,
    cashPerAg: 0.001,
  },
  value: {
    id: "value",
    name: "Unlock $22",
    usdOut: 22,
    usdBaseOut: 20,
    agCost: 20000,
    agCostNoBonus: 22000,
    bonusPercent: 10,
    popular: false,
    tier: 2,
    cashPerAg: 0.0011,
  },
  pro: {
    id: "pro",
    name: "Unlock $60",
    usdOut: 60,
    usdBaseOut: 50,
    agCost: 50000,
    agCostNoBonus: 60000,
    bonusPercent: 20,
    popular: false,
    tier: 3,
    cashPerAg: 0.0012,
  },
  whale: {
    id: "whale",
    name: "Unlock $150",
    usdOut: 150,
    usdBaseOut: 100,
    agCost: 100000,
    agCostNoBonus: 150000,
    bonusPercent: 50,
    popular: true,
    tier: 4,
    cashPerAg: 0.0015,
  },
  legend: {
    id: "legend",
    name: "Unlock $400",
    usdOut: 400,
    usdBaseOut: 250,
    agCost: 250000,
    agCostNoBonus: 400000,
    bonusPercent: 60,
    popular: false,
    tier: 5,
    cashPerAg: 0.0016,
  },
});

const AG_COINS_PER_USD = 1000;

const buyAgPointsPackage = async ({ discordId, packageId }) => {
  const pkg = STORE_PACKAGES[String(packageId || "").trim().toLowerCase()];
  if (!pkg) {
    const error = new Error("Invalid package");
    error.statusCode = 400;
    throw error;
  }

  return updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const previousPoints = typeof user.points === "number" ? user.points : (user.points || 0);
    const agCost = Number(pkg.agCost) || 0;
    const usdOut = Number(pkg.usdOut) || 0;

    if (previousPoints < agCost) {
      const error = new Error(`Not enough Coins. You need ${agCost.toLocaleString()} AG, you have ${previousPoints.toLocaleString()} AG.`);
      error.statusCode = 402;
      error.insufficientCoins = true;
      error.requiredAg = agCost;
      error.currentAg = previousPoints;
      throw error;
    }

    const previousLifetime = typeof user.lifetimePoints === "number" ? user.lifetimePoints : 0;
    const previousCashBalance = typeof user.cashBalance === "number" ? user.cashBalance : 0;
    const previousLifetimeCashWon = typeof user.lifetimeCashWon === "number" ? user.lifetimeCashWon : 0;

    user.points = previousPoints - agCost;
    user.cashBalance = previousCashBalance + usdOut;
    user.totalCashWithdrawn = (typeof user.totalCashWithdrawn === "number" ? user.totalCashWithdrawn : 0) + usdOut;
    user.lifetimeCashWon = previousLifetimeCashWon + usdOut;

    const event = {
      id: crypto.randomUUID ? crypto.randomUUID() : `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      type: "store_redeem_cash",
      userId: discordId,
      discordId,
      packageId: pkg.id,
      packageName: pkg.name,
      usdOut,
      usdBaseOut: pkg.usdBaseOut,
      bonusPercent: pkg.bonusPercent,
      agCost,
      agSavedVsStandaloneCost: pkg.agCostNoBonus,
      deductedAg: agCost,
      addedCash: usdOut,
      previousAg: previousPoints,
      totalAgAfter: user.points,
      previousCashBalance,
      totalCashAfter: user.cashBalance,
      createdAt: nowIso(),
      timestamp: Date.now(),
    };

    if (!Array.isArray(data.events)) data.events = [];
    data.events.unshift(event);

    trimEvents(data);

    return {
      success: true,
      packageId: pkg.id,
      packageName: pkg.name,
      usdOut,
      bonusPercent: pkg.bonusPercent,
      deductedAg: agCost,
      addedCash: usdOut,
      previousAg: previousPoints,
      newAg: user.points,
      previousCashBalance,
      newCashBalance: user.cashBalance,
      previousLifetime,
      previousLifetimeCashWon: user.lifetimeCashWon,
      savedAgVsStandalone: Math.max(0, (pkg.agCostNoBonus || 0) - agCost),
      cashPerAg: pkg.cashPerAg,
      event: clone(event),
      profile: buildPrivateProfile(user),
    };
  });
};

const recordUserPresence = async (discordId) => {
  const data = await readData();
  const existingUser = data.users[discordId];
  if (!existingUser) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const lastSeenMs = existingUser.lastSeenAt ? new Date(existingUser.lastSeenAt).getTime() : 0;
  if (lastSeenMs > 0 && Date.now() - lastSeenMs < PRESENCE_CONFIG.heartbeatWriteThrottleMs) {
    return buildPrivateProfile(existingUser);
  }

  return updateData(async (mutableData) => {
    const user = mutableData.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    user.lastSeenAt = nowIso();
    return buildPrivateProfile(user);
  });
};

const recordRewardHeartbeat = async ({ discordId, reward }) => {
  if (reward === "visit-duration" && DISABLE_VISIT_DURATION_POINTS) {
    const profile = await getUserProfile(discordId);
    if (!profile) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }
    return {
      reward,
      accumulatedMs: 0,
      remainingMs: 0,
      disabled: true,
    };
  }

  return updateData(async (data) => {
    // #region debug-point C:recordRewardHeartbeat
    reportStoreDebug("C", "[DEBUG] recordRewardHeartbeat invoked", {
      pid: process.pid,
      discordId,
      reward,
    });
    // #endregion
    const user = data.users[discordId];
    reportOauthCoinsStoreDebug("B", "recordRewardHeartbeat entered", {
      discordId,
      reward,
      hasUser: Boolean(user),
    });
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const nowTimestamp = Date.now();
    if (reward === "visit-duration") {
      reportOauthCoinsStoreDebug("B", "visit-duration heartbeat branch", {
        discordId,
        lastVisitRewardAt: user.lastVisitRewardAt || null,
        accumulatedMs: user.rewardTrack?.visit?.accumulatedMs || 0,
      });
      if (isSameDay(user.lastVisitRewardAt)) {
        resetRewardTrack(user, "visit");
        reportOauthCoinsStoreDebug("B", "visit-duration heartbeat same-day reset", {
          discordId,
        });
        return {
          reward,
          accumulatedMs: 0,
          remainingMs: 0,
        };
      }

      const track = getRewardTrack(user, "visit");
      const accumulatedMs = applyRewardHeartbeat(track, nowTimestamp);
      reportOauthCoinsStoreDebug("B", "visit-duration heartbeat progress", {
        discordId,
        accumulatedMs,
        remainingMs: Math.max(0, REWARD_CONFIG.visitDurationMs - accumulatedMs),
      });
      return {
        reward,
        accumulatedMs,
        remainingMs: Math.max(0, REWARD_CONFIG.visitDurationMs - accumulatedMs),
      };
    }

    if (reward === "stream-watch") {
      reportOauthCoinsStoreDebug("B", "stream-watch heartbeat branch", {
        discordId,
        streamCooldownUntil: user.streamCooldownUntil || null,
      });
      const cooldownRemainingMs = Math.max(0, new Date(user.streamCooldownUntil || 0).getTime() - nowTimestamp);
      if (cooldownRemainingMs > 0) {
        resetRewardTrack(user, "stream");
        return {
          reward,
          accumulatedMs: 0,
          remainingMs: cooldownRemainingMs,
        };
      }

      const track = getRewardTrack(user, "stream");
      const accumulatedMs = applyRewardHeartbeat(track, nowTimestamp);
      return {
        reward,
        accumulatedMs,
        remainingMs: Math.max(0, REWARD_CONFIG.streamWatchMs - accumulatedMs),
      };
    }

    const error = new Error("Unknown reward heartbeat");
    error.statusCode = 400;
    throw error;
  });
};

const claimReward = async ({ discordId, action, bonusKey = null }) => {
  if (action === "visit-duration" && DISABLE_VISIT_DURATION_POINTS) {
    const profile = await getUserProfile(discordId);
    if (!profile) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }
    return {
      applied: false,
      amount: 0,
      action,
      reason: "Visit-duration points are disabled",
      remainingMs: 0,
      disabled: true,
      profile,
    };
  }

  return updateData(async (data) => {
    // #region debug-point B:claimReward
    reportStoreDebug("B", "[DEBUG] claimReward invoked", {
      pid: process.pid,
      discordId,
      action,
      bonusKey,
    });
    // #endregion
    const user = data.users[discordId];
    reportOauthCoinsStoreDebug("B", "claimReward entered", {
      discordId,
      action,
      bonusKey,
      hasUser: Boolean(user),
    });
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const now = new Date();
    const nowTimestamp = now.getTime();
    const timestamp = now.toISOString();

    let amount = 0;
    let reason = "";
    let applied = false;
    let remainingMs = 0;
    let throttled = false;
    let cooldownRemainingMs = 0;

    if (action === "daily-login") {
      reportOauthCoinsStoreDebug("B", "claimReward daily-login branch", {
        discordId,
        lastDailyClaimAt: user.lastDailyClaimAt || null,
      });
      reason = "Daglig inloggning";
      amount = REWARD_CONFIG.dailyReward;
      if (!isSameDay(user.lastDailyClaimAt, now)) {
        const previousClaimDate = user.lastDailyClaimAt ? new Date(user.lastDailyClaimAt) : null;
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        if (previousClaimDate && previousClaimDate.toDateString() === yesterday.toDateString()) {
          user.dailyStreak = (user.dailyStreak || 0) + 1;
        } else {
          user.dailyStreak = 1;
        }

        user.bestDailyStreak = Math.max(user.bestDailyStreak || 0, user.dailyStreak);
        user.lastDailyClaimAt = timestamp;
        applied = true;
      }
    } else if (action === "visit-duration") {
      reportOauthCoinsStoreDebug("B", "claimReward visit-duration branch", {
        discordId,
        lastVisitRewardAt: user.lastVisitRewardAt || null,
        accumulatedMs: user.rewardTrack?.visit?.accumulatedMs || 0,
      });
      reason = "Besokte sidan i 5 minuter";
      amount = REWARD_CONFIG.visitReward;
      const lastVisitClaimAttemptAt = user.lastVisitClaimAttemptAt ? new Date(user.lastVisitClaimAttemptAt).getTime() : 0;
      cooldownRemainingMs = Math.max(0, lastVisitClaimAttemptAt + VISIT_DURATION_CLAIM_COOLDOWN_MS - nowTimestamp);
      if (cooldownRemainingMs > 0) {
        throttled = true;
        remainingMs = cooldownRemainingMs;
      } else {
        user.lastVisitClaimAttemptAt = timestamp;
        const track = getRewardTrack(user, "visit");
        if (!isSameDay(user.lastVisitRewardAt, now) && (track.accumulatedMs || 0) >= REWARD_CONFIG.visitDurationMs) {
          user.lastVisitRewardAt = timestamp;
          resetRewardTrack(user, "visit");
          applied = true;
        } else if (!isSameDay(user.lastVisitRewardAt, now)) {
          remainingMs = Math.max(0, REWARD_CONFIG.visitDurationMs - (track.accumulatedMs || 0));
        }
      }
    } else if (action === "bonus-click") {
      reportOauthCoinsStoreDebug("B", "claimReward bonus-click branch", {
        discordId,
        bonusKey,
      });
      const normalizedBonusKey = normalizeBonusKey(bonusKey);
      if (!normalizedBonusKey) {
        const error = new Error("bonusKey is required");
        error.statusCode = 400;
        throw error;
      }
      if (!BONUS_REWARD_KEYS.has(normalizedBonusKey)) {
        const error = new Error("Invalid bonusKey");
        error.statusCode = 400;
        throw error;
      }

      reason = `Bonus-klick: ${normalizedBonusKey}`;
      amount = REWARD_CONFIG.bonusReward;
      const lastClaimAt = user.bonusCooldowns?.[normalizedBonusKey]
        ? new Date(user.bonusCooldowns[normalizedBonusKey]).getTime()
        : 0;
      const cooldownMs = REWARD_CONFIG.bonusCooldownMs;
      const nextAllowedAt = lastClaimAt + cooldownMs;

      if (!lastClaimAt || nowTimestamp >= nextAllowedAt) {
        user.bonusCooldowns[normalizedBonusKey] = timestamp;
        bonusKey = normalizedBonusKey;
        applied = true;
      } else {
        remainingMs = nextAllowedAt - nowTimestamp;
      }
    } else if (action === "stream-watch") {
      reportOauthCoinsStoreDebug("B", "claimReward stream-watch branch", {
        discordId,
        streamCooldownUntil: user.streamCooldownUntil || null,
        accumulatedMs: user.rewardTrack?.stream?.accumulatedMs || 0,
      });
      reason = "Kollade pa stream pa sidan";
      amount = REWARD_CONFIG.streamReward;
      const streamCooldownUntil = user.streamCooldownUntil ? new Date(user.streamCooldownUntil).getTime() : 0;

      if (streamCooldownUntil > 0 && nowTimestamp < streamCooldownUntil) {
        resetRewardTrack(user, "stream");
        remainingMs = streamCooldownUntil - nowTimestamp;
      } else {
        const track = getRewardTrack(user, "stream");
        if ((track.accumulatedMs || 0) >= REWARD_CONFIG.streamWatchMs) {
          user.streamCooldownUntil = new Date(nowTimestamp + REWARD_CONFIG.streamCooldownMs).toISOString();
          resetRewardTrack(user, "stream");
          applied = true;
        } else {
          remainingMs = Math.max(0, REWARD_CONFIG.streamWatchMs - (track.accumulatedMs || 0));
        }
      }
    } else {
      const error = new Error("Unknown reward action");
      error.statusCode = 400;
      throw error;
    }

    if (applied) {
      reportOauthCoinsStoreDebug("B", "claimReward applied", {
        discordId,
        action,
        amount,
        pointsBefore: user.points || 0,
      });
      user.points = (user.points || 0) + amount;
      user.lifetimePoints = (user.lifetimePoints || 0) + amount;

      data.events.unshift({
        type: "points_awarded",
        discordId: user.discordId,
        username: user.username,
        amount,
        action,
        reason,
        bonusKey,
        pointsAfter: user.points,
        timestamp,
      });
      trimEvents(data);
    }

    reportOauthCoinsStoreDebug("B", "claimReward return", {
      discordId,
      action,
      applied,
      amount,
      remainingMs,
      throttled,
      cooldownRemainingMs,
      points: user.points || 0,
    });
    return {
      applied,
      amount,
      action,
      reason,
      remainingMs,
      throttled,
      cooldownRemainingMs,
      profile: buildPrivateProfile(user),
    };
  });
};

const adjustPoints = async ({ discordId, amount, reason, actor = "bot" }) =>
  updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const timestamp = nowIso();
    user.points = Math.max(0, (user.points || 0) + amount);
    if (amount > 0) {
      user.lifetimePoints = (user.lifetimePoints || 0) + amount;
    }

    data.events.unshift({
      type: "points_adjusted",
      discordId: user.discordId,
      username: user.username,
      amount,
      reason,
      actor,
      pointsAfter: user.points,
      timestamp,
    });
    trimEvents(data);

    return {
      profile: buildPrivateProfile(user),
      event: clone(data.events[0]),
    };
  });

const getLeaderboard = async (limit = 10) => {
  const data = await readData();
  return Object.values(data.users)
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, sanitizeLimit(limit, 10, 50))
    .map((user) => buildPublicProfile(user));
};

const setPoints = async ({ discordId, amount, reason, actor = "bot" }) =>
  updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const timestamp = nowIso();
    user.points = Math.max(0, amount);
    user.lifetimePoints = Math.max(user.lifetimePoints || 0, user.points);

    data.events.unshift({
      type: "points_set",
      discordId: user.discordId,
      username: user.username,
      amount: user.points,
      reason,
      actor,
      pointsAfter: user.points,
      timestamp,
    });
    trimEvents(data);

    return {
      profile: buildPrivateProfile(user),
      event: clone(data.events[0]),
    };
  });

const getRecentEvents = async (limit = 20, discordId = null) => {
  const data = await readData();
  const normalizedLimit = sanitizeLimit(limit, 20, 100);
  const events = discordId
    ? data.events.filter((event) => event.discordId === discordId)
    : data.events;

  return events.slice(0, normalizedLimit).map((event) => clone(event));
};

const searchUsers = async ({ query = "", limit = 10, sortBy = "points" } = {}) => {
  const data = await readData();
  const normalizedLimit = sanitizeLimit(limit, 10, 50);
  const normalizedQuery = normalizeTipLookup(query);
  const users = Object.values(data.users).filter((user) => {
    if (!normalizedQuery) return true;
    return getUserLookupScore(user, normalizedQuery) > 0;
  });

  const sortedUsers = sortLookupUsers(users, normalizedQuery, sortBy);

  return sortedUsers.slice(0, normalizedLimit).map((user) => buildPublicProfile(user));
};

const getUserAdminSnapshot = async (discordId) => {
  const data = await readData();
  const user = data.users[discordId];
  if (!user) return null;

  const now = Date.now();
  const recentEvents = data.events
    .filter((event) => event.discordId === discordId)
    .slice(0, 8)
    .map((event) => clone(event));

  const bonusCooldownEntries = Object.entries(user.bonusCooldowns || {}).map(([bonusKey, claimedAt]) => {
    const readyAt = new Date(claimedAt).getTime() + REWARD_CONFIG.bonusCooldownMs;
    return {
      bonusKey,
      claimedAt,
      remainingMs: Math.max(0, readyAt - now),
    };
  });

  const activeBonusCooldowns = bonusCooldownEntries.filter((entry) => entry.remainingMs > 0);
  const nextBonusReadyMs = activeBonusCooldowns.length
    ? activeBonusCooldowns.sort((a, b) => a.remainingMs - b.remainingMs)[0].remainingMs
    : 0;
  const streamCooldownRemainingMs = Math.max(0, new Date(user.streamCooldownUntil || 0).getTime() - now);

  return {
    profile: {
      ...buildPrivateProfile(user),
    },
    rewardStatus: {
      dailyReady: !isSameDay(user.lastDailyClaimAt),
      visitReady: !isSameDay(user.lastVisitRewardAt),
      streamReady: streamCooldownRemainingMs <= 0,
      streamCooldownRemainingMs,
      totalBonusCooldowns: bonusCooldownEntries.length,
      activeBonusCooldowns: activeBonusCooldowns.length,
      nextBonusReadyMs,
    },
    recentEvents,
  };
};

const resetUserProgress = async ({ discordId, target = "all", actor = "bot", reason = "Manual reset" }) =>
  updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    if (target === "all" || target === "daily") {
      user.lastDailyClaimAt = null;
      user.dailyStreak = 0;
    }

    if (target === "all" || target === "visit") {
      user.lastVisitRewardAt = null;
      resetRewardTrack(user, "visit");
    }

    if (target === "all" || target === "stream") {
      user.streamCooldownUntil = null;
      resetRewardTrack(user, "stream");
    }

    if (target === "all" || target === "bonus") {
      user.bonusCooldowns = {};
    }

    const timestamp = nowIso();
    data.events.unshift({
      type: "progress_reset",
      discordId: user.discordId,
      username: user.username,
      target,
      actor,
      reason,
      timestamp,
    });
    trimEvents(data);

    return {
      profile: buildPrivateProfile(user),
      event: clone(data.events[0]),
    };
  });

const getStats = async () => {
  const data = await readData();
  const users = Object.values(data.users);
  const totalPoints = users.reduce((sum, user) => sum + (user.points || 0), 0);
  const totalLifetimePoints = users.reduce((sum, user) => sum + (user.lifetimePoints || 0), 0);

  return {
    totalUsers: users.length,
    totalPoints,
    totalLifetimePoints,
    latestEvents: data.events.slice(0, 10),
  };
};

const getChatMessages = async (limit = 50) => {
  const data = await readData();
  const normalizedLimit = sanitizeLimit(limit, 50, 100);
  const chat = ensureChatState(data);

  return chat.messages
    .slice(0, normalizedLimit)
    .map((message) => serializeChatMessage(message, data))
    .filter(Boolean)
    .reverse();
};

const sendChatMessage = async ({ discordId, content, replyToId = "" }) =>
  updateData(async (data) => {
    const user = data.users[discordId];
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const normalizedContent = sanitizeChatContent(content);
    const normalizedReplyToId = String(replyToId || "").trim();
    if (!normalizedContent) {
      const error = new Error("Message cannot be empty");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedContent.length > CHAT_CONFIG.messageMaxLength) {
      const error = new Error(`Message is too long (max ${CHAT_CONFIG.messageMaxLength} characters)`);
      error.statusCode = 400;
      throw error;
    }

    const nowTimestamp = Date.now();
    const lastMessageAt = new Date(user.lastChatMessageAt || 0).getTime();
    if (
      CHAT_CONFIG.messageCooldownMs > 0 &&
      lastMessageAt > 0 &&
      nowTimestamp - lastMessageAt < CHAT_CONFIG.messageCooldownMs
    ) {
      const error = new Error("CHAT_MESSAGE_RATE_LIMIT");
      error.statusCode = 429;
      error.source = "chat-message";
      error.remainingMs = CHAT_CONFIG.messageCooldownMs - (nowTimestamp - lastMessageAt);
      throw error;
    }

    const timestamp = nowIso();
    user.lastChatMessageAt = timestamp;

    if (normalizedReplyToId) {
      const replyMessage = ensureChatState(data).messages.find((entry) => entry?.id === normalizedReplyToId);
      if (!replyMessage) {
        const error = new Error("Reply target was not found");
        error.statusCode = 404;
        throw error;
      }
    }

    const message = {
      id: createChatId("msg"),
      type: "text",
      discordId: user.discordId,
      content: normalizedContent,
      replyToId: normalizedReplyToId || undefined,
      createdAt: timestamp,
    };

    const chat = ensureChatState(data);
    chat.messages.unshift(message);
    trimChatMessages(data);

    return {
      message: serializeChatMessage(message, data),
      profile: buildPrivateProfile(user),
    };
  });

const sendChatTip = async ({ discordId, recipientId, recipientQuery, amount }) =>
  updateData(async (data) => {
    const sender = data.users[discordId];
    if (!sender) {
      const error = new Error("Sender not found");
      error.statusCode = 404;
      throw error;
    }

    const recipient = resolveTipRecipient(data, sender.discordId, recipientId, recipientQuery);
    if (!recipient) {
      const error = new Error("Recipient not found");
      error.statusCode = 404;
      throw error;
    }

    if (sender.discordId === recipient.discordId) {
      const error = new Error("You cannot tip yourself");
      error.statusCode = 400;
      throw error;
    }

    const normalizedAmount = Math.floor(Number(amount) || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      const error = new Error("Tip amount must be at least 1 Coin");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedAmount > (sender.points || 0)) {
      const error = new Error("Not enough Coins");
      error.statusCode = 400;
      throw error;
    }

    const nowTimestamp = Date.now();
    const lastTipAt = new Date(sender.lastTipAt || 0).getTime();
    if (
      CHAT_CONFIG.tipCooldownMs > 0 &&
      lastTipAt > 0 &&
      nowTimestamp - lastTipAt < CHAT_CONFIG.tipCooldownMs
    ) {
      const error = new Error("CHAT_TIP_RATE_LIMIT");
      error.statusCode = 429;
      error.source = "chat-tip";
      error.remainingMs = CHAT_CONFIG.tipCooldownMs - (nowTimestamp - lastTipAt);
      throw error;
    }

    const timestamp = nowIso();
    sender.lastTipAt = timestamp;
    sender.points = Math.max(0, (sender.points || 0) - normalizedAmount);
    recipient.points = (recipient.points || 0) + normalizedAmount;

    const chatMessage = {
      id: createChatId("tip"),
      type: "tip",
      discordId: sender.discordId,
      recipientId: recipient.discordId,
      amount: normalizedAmount,
      createdAt: timestamp,
    };

    const chat = ensureChatState(data);
    chat.messages.unshift(chatMessage);
    trimChatMessages(data);

    data.events.unshift({
      type: "points_tipped",
      discordId: sender.discordId,
      recipientId: recipient.discordId,
      username: sender.username,
      globalName: sender.globalName,
      recipientUsername: recipient.username,
      recipientGlobalName: recipient.globalName,
      amount: normalizedAmount,
      pointsAfter: sender.points,
      recipientPointsAfter: recipient.points,
      timestamp,
    });
    trimEvents(data);

    return {
      message: serializeChatMessage(chatMessage, data),
      senderProfile: buildPrivateProfile(sender),
      recipientProfile: buildPublicProfile(recipient),
    };
  });

const sendChatAnnouncement = async ({ actor = "admin", casinoName }) =>
  updateData(async (data) => {
    const rawCasinoName = String(casinoName || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    if (!rawCasinoName) {
      const error = new Error("Casino name is required");
      error.statusCode = 400;
      throw error;
    }

    const matchedCasino = normalizeChatAnnounceCasino(rawCasinoName);
    const displayCasinoName = matchedCasino?.name || rawCasinoName;
    const casinoKey = matchedCasino?.key || rawCasinoName.toLowerCase().replace(/[^a-z0-9]+/g, "");

    const timestamp = nowIso();
    const chatMessage = {
      id: createChatId("announce"),
      type: "announce",
      casinoName: displayCasinoName,
      casinoKey,
      content: `Claim the ${displayCasinoName} bonus now.`,
      createdAt: timestamp,
      actor,
    };

    const chat = ensureChatState(data);
    chat.messages.unshift(chatMessage);
    trimChatMessages(data);

    data.events.unshift({
      type: "chat_announcement_sent",
      actor,
      casinoName: displayCasinoName,
      casinoKey,
      timestamp,
    });
    trimEvents(data);

    return {
      message: serializeChatMessage(chatMessage, data),
      event: clone(data.events[0]),
    };
  });

const syncDiscordMemberAccess = async ({ discordId, isAdmin = false, roleIds = [], roleNames = [] }) => {
  let data;
  try {
    data = await readData();
  } catch (_) {
    return null;
  }
  const user = data.users[discordId];
  if (!user) return null;

  user.isAdmin = Boolean(isAdmin);
  user.discordRoleIds = Array.isArray(roleIds) ? [...new Set(roleIds.filter(Boolean))] : [];
  user.discordRoleNames = Array.isArray(roleNames) ? [...new Set(roleNames.filter(Boolean))] : [];
  user.lastRoleSyncAt = nowIso();
  const profile = buildPrivateProfile(user);

  void updateData(async (persisted) => {
    const target = persisted.users[discordId];
    if (!target) return profile;
    target.isAdmin = Boolean(isAdmin);
    target.discordRoleIds = user.discordRoleIds;
    target.discordRoleNames = user.discordRoleNames;
    target.lastRoleSyncAt = user.lastRoleSyncAt;
    return buildPrivateProfile(target);
  }).catch((err) => {
    console.warn("Non-fatal: syncDiscordMemberAccess persist failed:", err?.message || err);
  });

  return profile;
};

const clearChatMessages = async ({ actor = "admin", reason = "Chat cleared by admin" } = {}) =>
  updateData(async (data) => {
    const chat = ensureChatState(data);
    const clearedCount = chat.messages.length;
    chat.messages = [];

    const timestamp = nowIso();
    data.events.unshift({
      type: "chat_cleared",
      actor,
      reason,
      clearedCount,
      timestamp,
    });
    trimEvents(data);

    return {
      clearedCount,
      event: clone(data.events[0]),
    };
  });

const deleteChatMessage = async ({ messageId, actor = "admin", reason = "Chat message removed by admin" }) =>
  updateData(async (data) => {
    const chat = ensureChatState(data);
    const index = chat.messages.findIndex((message) => message?.id === messageId);
    if (index < 0) {
      const error = new Error("Message not found");
      error.statusCode = 404;
      throw error;
    }

    const [removedMessage] = chat.messages.splice(index, 1);
    const timestamp = nowIso();
    data.events.unshift({
      type: "chat_message_deleted",
      actor,
      reason,
      messageId: removedMessage.id,
      messageType: removedMessage.type,
      targetDiscordId: removedMessage.discordId || null,
      recipientId: removedMessage.recipientId || null,
      timestamp,
    });
    trimEvents(data);

    return {
      deletedMessageId: removedMessage.id,
      deletedMessageType: removedMessage.type,
      event: clone(data.events[0]),
    };
  });

module.exports = {
  adjustPoints,
  buyAgPointsPackage,
  claimReward,
  clearChatMessages,
  createDepositGiveaway,
  createGiveaway,
  deleteChatMessage,
  drawDepositGiveawayWinners,
  drawGiveaway,
  enterGiveaway,
  getChatMessages,
  getDepositGiveawayOverview,
  getGiveawayHistory,
  getGiveawayOverview,
  getGiveawayOverviewReadOnly,
  getRecentEvents,
  getLeaderboard,
  getStats,
  getUserProfile,
  getUserAdminSnapshot,
  recordUserPresence,
  recordRewardHeartbeat,
  resetDepositGiveaway,
  resetUserProgress,
  reviewDepositGiveawayEntry,
  searchUsers,
  sendChatMessage,
  sendChatAnnouncement,
  sendChatTip,
  setDepositGiveawayPhase,
  setPoints,
  STORE_PACKAGES,
  submitDepositGiveawayEntry,
  syncDiscordMemberAccess,
  upsertDiscordUser,
};
