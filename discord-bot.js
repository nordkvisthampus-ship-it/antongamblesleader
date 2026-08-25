const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fsSync = require("fs");
const path = require("path");

const ADMIN_PERMISSION = PermissionFlagsBits.ManageGuild;
const LOG_CHANNEL_FALLBACK_NAME = "ag-logs";
const WEBSITE_CHANNEL_FALLBACK_NAME = "website";
const AWARE_CHANNEL_FALLBACK_NAME = "be-gamble-aware";
const BRAND_URL = String(process.env.PUBLIC_SITE_URL || "https://antongambles.com").replace(/\/+$/, "");
const BRAND_COLOR = 0xf5c24b;
const BRAND_THUMBNAIL_URL = `${BRAND_URL}/assets/antonpng.png`;
const DISCORD_WRITE_COOLDOWN_MS = Math.max(250, Number(process.env.DISCORD_WRITE_COOLDOWN_MS) || 1250);
const DISCORD_REPLY_COOLDOWN_MS = Math.max(250, Number(process.env.DISCORD_REPLY_COOLDOWN_MS) || 900);
const DISCORD_OPTIONAL_PAUSE_MS = Math.max(1000, Number(process.env.DISCORD_OPTIONAL_PAUSE_MS) || 30000);
const DISCORD_AUDIT_DEDUPE_WINDOW_MS = Math.max(1000, Number(process.env.DISCORD_AUDIT_DEDUPE_WINDOW_MS) || 15000);
const DISABLE_DISCORD_AUDIT_LOGS = String(process.env.DISABLE_DISCORD_AUDIT_LOGS || "").toLowerCase() === "true";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const OAUTH_COINS_DEBUG_ENV_FILE = path.join(__dirname, ".dbg", "oauth-coins-railway.env");
const RANK_ROLE_CONFIG = [
  {
    name: "Legend",
    threshold: 7500,
    roleId: process.env.DISCORD_ROLE_LEGEND_ID || "1522657726457450656",
  },
  {
    name: "Whale",
    threshold: 3000,
    roleId: process.env.DISCORD_ROLE_WHALE_ID || "1522657692865400954",
  },
  {
    name: "High Roller",
    threshold: 1000,
    roleId: process.env.DISCORD_ROLE_HIGH_ROLLER_ID || "1522657660464533638",
  },
  {
    name: "Grinder",
    threshold: 250,
    roleId: process.env.DISCORD_ROLE_GRINDER_ID || "1522657634430488637",
  },
  {
    name: "Rookie",
    threshold: 0,
    roleId: process.env.DISCORD_ROLE_ROOKIE_ID || "1522657589094121482",
  },
];
const BRAND_FOOTER = {
  text: "Powered by Antongambles",
  iconURL: BRAND_THUMBNAIL_URL,
};
const buildSiteUrl = (pathname = "/") => `${BRAND_URL}${pathname}`;
const normalizeCasinoKey = (value = "") => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const CASINO_PAGE_CONFIG = [
  {
    key: "stakeprix",
    label: "StakePrix",
    path: "/stakeprix/",
    summary: "Anton's no-wager top pick with a crypto-first setup.",
  },
  {
    key: "acebet",
    label: "AceBet",
    path: "/acebet/",
    summary: "Promo code ANTON with a fast signup angle.",
  },
  {
    key: "duelbits",
    label: "Duelbits",
    path: "/duelbits/",
    summary: "A sharper hybrid pick with casino, originals and esports energy in the same lane.",
  },
  {
    key: "flush",
    label: "Flush",
    path: "/flush/",
    summary: "Modern slot-heavy feel with a clean offer setup.",
  },
  {
    key: "fortunejack",
    label: "FortuneJack",
    path: "/fortunejack/",
    summary: "Crypto-native casino coverage with a premium bonus page.",
  },
  {
    key: "ivibet",
    label: "Ivibet",
    path: "/ivibet/",
    summary: "Straight premium casino coverage with a clean offer page.",
  },
  {
    key: "lollyspins",
    label: "Lollyspins",
    path: "/lollyspins/",
    summary: "One of the strongest featured picks on-site.",
  },
  {
    key: "nvcasino",
    label: "NVCasino",
    path: "/nvcasino/",
    summary: "Premium casino-first coverage with a direct bonus page.",
  },
  {
    key: "ritzo",
    label: "Ritzo",
    path: "/ritzo/",
    summary: "Fast access to the Ritzo bonus page.",
  },
  {
    key: "shakebet",
    label: "Shakebet",
    path: "/shakebet/",
    summary: "High-value bonus setup with a strong main offer.",
  },
  {
    key: "simsinos",
    label: "Simsinos",
    path: "/simsinos/",
    summary: "A clean Simsinos offer page with the main bonus ready.",
  },
  {
    key: "thunderpick",
    label: "Thunderpick",
    path: "/thunderpick/",
    summary: "A sharper esports-meets-casino pick with its own bonus page.",
  },
  {
    key: "wildroll",
    label: "Wildroll",
    path: "/wildroll/",
    summary: "Wildroll with the main bonus and promo page ready.",
  },
];
const WEBSITE_LINKS = [
  { label: "Main Site", url: buildSiteUrl("/") },
  { label: "Giveaways", url: buildSiteUrl("/giveaways/") },
  ...CASINO_PAGE_CONFIG.map((entry) => ({
    label: entry.label,
    url: buildSiteUrl(entry.path),
  })),
];
const CASINO_CHANNEL_LINKS = CASINO_PAGE_CONFIG.map((entry) => ({
  ...entry,
  url: buildSiteUrl(entry.path),
}));

const createPremiumEmbed = ({
  title,
  description,
  author = "Antongambles",
  color = BRAND_COLOR,
  url = BRAND_URL,
  thumbnail = false,
}) => {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: author,
      iconURL: BRAND_THUMBNAIL_URL,
      url: BRAND_URL,
    })
    .setTitle(title)
    .setFooter(BRAND_FOOTER)
    .setTimestamp();

  if (thumbnail) {
    embed.setThumbnail(BRAND_THUMBNAIL_URL);
  }

  if (url) {
    embed.setURL(url);
  }

  if (description) {
    embed.setDescription(description);
  }

  return embed;
};

const chunkItems = (items, size = 5) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const createListFields = (heading, lines, { chunkSize = 5, inline = false, emptyCopy = "No data yet." } = {}) => {
  if (!lines.length) {
    return [
      {
        name: heading,
        value: emptyCopy,
        inline,
      },
    ];
  }

  return chunkItems(lines, chunkSize).map((chunk, index, chunks) => ({
    name: chunks.length === 1 ? heading : `${heading} ${index + 1}`,
    value: chunk.join("\n"),
    inline,
  }));
};

const buildWebsiteComponents = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Website").setURL(`${BRAND_URL}/`),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Giveaways").setURL(`${BRAND_URL}/giveaways/`),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Top Pick").setURL(`${BRAND_URL}/stakeprix/`)
  ),
];
const getCasinoChannelLink = (value = "") => {
  const normalized = normalizeCasinoKey(value);
  if (!normalized) return null;

  return (
    CASINO_CHANNEL_LINKS.find((entry) =>
      [entry.key, entry.label, entry.path].some((candidate) => normalizeCasinoKey(candidate) === normalized)
    ) || null
  );
};
const doesChannelMatchCasino = (channelName = "", casino = null) =>
  Boolean(casino && getCasinoChannelLink(channelName)?.key === casino.key);

const getEventIcon = (type) =>
  (
    {
      user_created: "✨",
      user_login: "👤",
      points_awarded: "🪙",
      giveaway_created: "🎉",
      giveaway_entered: "🎟️",
      giveaway_drawn: "🏆",
      admin_adjustment: "🛠️",
    }[type] || "•"
  );

const formatUserLine = (profile, index = null) => {
  const prefix = index ? `${index}.` : "•";
  const name = profile.globalName || profile.username || "Unknown";
  return `${prefix} **${name}**\nWallet: \`${profile.points} Coins\` • ID: \`${profile.discordId}\``;
};

const formatDate = (isoString) => {
  if (!isoString) return "Aldrig";
  return new Date(isoString).toLocaleString("sv-SE");
};

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const getRankRoleForPoints = (points = 0) => RANK_ROLE_CONFIG.find((entry) => Number(points || 0) >= entry.threshold) || RANK_ROLE_CONFIG[RANK_ROLE_CONFIG.length - 1];

const formatEventLine = (event) => {
  const icon = getEventIcon(event.type);
  const actor = event.globalName || event.username || event.discordId || "okand";
  const typeLabel = String(event.type || "event").replace(/_/g, " ");
  const metaParts = [formatDate(event.timestamp)];
  if (typeof event.amount === "number") metaParts.push(`${event.amount} Coins`);
  if (event.reason) metaParts.push(event.reason);
  if (event.target) metaParts.push(`reset ${event.target}`);
  return `${icon} **${typeLabel}** • ${actor}\n${metaParts.join(" • ")}`;
};

const truncateLines = (lines, max = 6) => lines.slice(0, max).join("\n");

const createAdminCommand = (builder) => builder.setDefaultMemberPermissions(ADMIN_PERMISSION);

const describeDiscordError = (error) => ({
  message: error?.rawError?.message || error?.message || "Unknown Discord error",
  status: error?.status || error?.statusCode || null,
  code: error?.code || error?.rawError?.code || null,
});

const isDiscordRateLimitError = (error) => {
  const details = describeDiscordError(error);
  const message = String(details.message || "").toLowerCase();
  return details.status === 429 || details.code === 429 || message.includes("rate limit") || message.includes("too fast");
};

const warnDiscordRateLimit = (label, error, extra = {}) => {
  console.warn(label, {
    ...describeDiscordError(error),
    ...extra,
  });
};

// #region debug-point oauth-coins-railway-discord-report
const reportOauthCoinsDiscordDebug = (hypothesisId, msg, data = {}) => {
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
      runId: process.env.DEBUG_RUN_ID || "pre-fix",
      hypothesisId,
      location: "discord-bot.js",
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

const createCommands = () => [
  createAdminCommand(new SlashCommandBuilder().setName("ag-dashboard").setDescription("Visa owner-dashboard for Coins-systemet")),
  createAdminCommand(new SlashCommandBuilder().setName("ag-stats").setDescription("Visa total statistik for AG Points")),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-top")
      .setDescription("Visa topplistan for AG Points")
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Antal users att visa").setRequired(false).setMinValue(1).setMaxValue(20)
      )
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-user")
      .setDescription("Visa full admininfo om en specifik anvandare")
      .addUserOption((option) => option.setName("user").setDescription("Discord-anvandare").setRequired(true))
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-search")
      .setDescription("Sok efter users i Coins-systemet")
      .addStringOption((option) => option.setName("query").setDescription("Namn eller Discord ID").setRequired(true))
      .addStringOption((option) =>
        option
          .setName("sort")
          .setDescription("Sortering")
          .setRequired(false)
          .addChoices(
            { name: "Poang", value: "points" },
            { name: "Lifetime", value: "lifetime" },
            { name: "Streak", value: "streak" },
            { name: "Senaste login", value: "recent" }
          )
      )
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Antal users att visa").setRequired(false).setMinValue(1).setMaxValue(15)
      )
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-give")
      .setDescription("Ge poang till en anvandare")
      .addUserOption((option) => option.setName("user").setDescription("Discord-anvandare").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Antal Coins").setRequired(true).setMinValue(1))
      .addStringOption((option) => option.setName("reason").setDescription("Anledning").setRequired(true))
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-take")
      .setDescription("Ta bort poang fran en anvandare")
      .addUserOption((option) => option.setName("user").setDescription("Discord-anvandare").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Antal Coins att ta bort").setRequired(true).setMinValue(1))
      .addStringOption((option) => option.setName("reason").setDescription("Anledning").setRequired(true))
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-set")
      .setDescription("Satt exakt poangbalans for en anvandare")
      .addUserOption((option) => option.setName("user").setDescription("Discord-anvandare").setRequired(true))
      .addIntegerOption((option) => option.setName("amount").setDescription("Ny Coins-balans").setRequired(true).setMinValue(0))
      .addStringOption((option) => option.setName("reason").setDescription("Anledning").setRequired(true))
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-reset")
      .setDescription("Resetta cooldowns eller progress for en anvandare")
      .addUserOption((option) => option.setName("user").setDescription("Discord-anvandare").setRequired(true))
      .addStringOption((option) =>
        option
          .setName("target")
          .setDescription("Vad som ska resetas")
          .setRequired(true)
          .addChoices(
            { name: "Allt", value: "all" },
            { name: "Daily", value: "daily" },
            { name: "Visit", value: "visit" },
            { name: "Stream", value: "stream" },
            { name: "Bonus", value: "bonus" }
          )
      )
      .addStringOption((option) => option.setName("reason").setDescription("Anledning").setRequired(false))
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-history")
      .setDescription("Visa senaste Coins-handelser")
      .addUserOption((option) => option.setName("user").setDescription("Valfri anvandare att filtrera pa").setRequired(false))
      .addIntegerOption((option) =>
        option.setName("limit").setDescription("Antal events").setRequired(false).setMinValue(1).setMaxValue(15)
      )
  ),
  createAdminCommand(new SlashCommandBuilder().setName("ag-giveaway").setDescription("Visa status for aktiv giveaway")),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-giveaway-start")
      .setDescription("Starta en ny stake-baserad Coins giveaway")
      .addStringOption((option) => option.setName("title").setDescription("Titel").setRequired(true))
      .addStringOption((option) => option.setName("prize").setDescription("Pris").setRequired(true))
      .addStringOption((option) =>
        option
          .setName("duration")
          .setDescription("Tid, t.ex. 30m, 2h, 12h 30m eller 1d")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName("winners").setDescription("Antal vinnare").setRequired(false).setMinValue(1).setMaxValue(10)
      )
      .addStringOption((option) => option.setName("subtitle").setDescription("Kort subtitle").setRequired(false))
      .addStringOption((option) => option.setName("description").setDescription("Langre beskrivning").setRequired(false))
  ),
  createAdminCommand(
    new SlashCommandBuilder().setName("ag-giveaway-draw").setDescription("Dra vinnare i den aktiva giveawayen")
  ),
  createAdminCommand(
    new SlashCommandBuilder().setName("ag-website-post").setDescription("Posta website-meddelande i Discord-kanalen website")
  ),
  createAdminCommand(
    new SlashCommandBuilder().setName("ag-aware-post").setDescription("Posta Be Gamble Aware-meddelande i Discord-kanalen be-gamble-aware")
  ),
  createAdminCommand(
    new SlashCommandBuilder()
      .setName("ag-casino-post")
      .setDescription("Posta ratt casino-lank i ratt Discord-kanal")
      .addStringOption((option) =>
        option
          .setName("casino")
          .setDescription("Valfritt casino om du inte kor kommandot i ratt kanal")
          .setRequired(false)
          .addChoices(...CASINO_PAGE_CONFIG.map((entry) => ({ name: entry.label, value: entry.key })))
      )
      .addBooleanOption((option) =>
        option.setName("topic").setDescription("Uppdatera kanalens topic till ratt undersidelank").setRequired(false)
      )
  ),
];

const createDiscordBot = (store) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_BOT_GUILD_ID || process.env.DISCORD_GUILD_ID || null;
  const logChannelId = process.env.DISCORD_BOT_LOG_CHANNEL_ID || null;
  const logChannelName = process.env.DISCORD_BOT_LOG_CHANNEL_NAME || LOG_CHANNEL_FALLBACK_NAME;
  const websiteChannelId = process.env.DISCORD_BOT_WEBSITE_CHANNEL_ID || null;
  const websiteChannelName = process.env.DISCORD_BOT_WEBSITE_CHANNEL_NAME || WEBSITE_CHANNEL_FALLBACK_NAME;
  const awareChannelId = process.env.DISCORD_BOT_AWARE_CHANNEL_ID || null;
  const awareChannelName = process.env.DISCORD_BOT_AWARE_CHANNEL_NAME || AWARE_CHANNEL_FALLBACK_NAME;
  const ownerIds = new Set(
    String(process.env.DISCORD_ADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const adminRoleIds = new Set(
    String(process.env.DISCORD_ADMIN_ROLE_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  let loginStarted = false;
  let botReady = false;
  let lastError = null;
  let registeredCommandCount = 0;
  let discordWriteQueue = Promise.resolve();
  let discordWritesBlockedUntil = 0;
  let optionalTrafficPausedUntil = 0;
  const dedupeCache = new Map();

  if (!token || !clientId) {
    return {
      start: async () => null,
      sendAuditMessage: async () => null,
      sendUserSignupMessage: async () => null,
      getMemberAccessProfile: async () => null,
      syncRankRole: async () => null,
      getStatus: () => ({
        configured: false,
        ready: false,
        lastError: "Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID",
      }),
    };
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  const commands = createCommands().map((command) => command.toJSON());

  const registerCommands = async () => {
    const rest = new REST({ version: "10" }).setToken(token);
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
    }
    registeredCommandCount = commands.length;
  };

  const getStatus = () => ({
    configured: true,
    ready: botReady,
    lastError,
    userTag: client.isReady() ? client.user.tag : null,
    logChannelId,
    logChannelName,
    websiteChannelId,
    websiteChannelName,
    awareChannelId,
    awareChannelName,
    guildId,
    registeredCommandCount,
  });

  const isOptionalTrafficPaused = () => Date.now() < optionalTrafficPausedUntil;

  const pauseOptionalTraffic = (error, reason) => {
    optionalTrafficPausedUntil = Math.max(optionalTrafficPausedUntil, Date.now() + DISCORD_OPTIONAL_PAUSE_MS);
    warnDiscordRateLimit(`${reason}: optional Discord traffic paused`, error, {
      pausedUntil: new Date(optionalTrafficPausedUntil).toISOString(),
    });
  };

  const scheduleDiscordWrite = async (
    { label, cooldownMs = DISCORD_WRITE_COOLDOWN_MS, optional = false, dedupeKey = "", dedupeWindowMs = 0 },
    work
  ) => {
    reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite invoked", {
      label,
      optional,
      dedupeKey: dedupeKey || null,
      dedupeWindowMs,
      cooldownMs,
      paused: isOptionalTrafficPaused(),
    });
    if (optional && isOptionalTrafficPaused()) {
      reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite skipped due to pause", {
        label,
        optional,
      });
      return null;
    }

    if (optional && dedupeKey) {
      const lastSentAt = dedupeCache.get(dedupeKey) || 0;
      if (Date.now() - lastSentAt < dedupeWindowMs) {
        reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite deduped", {
          label,
          dedupeKey,
          dedupeWindowMs,
        });
        return null;
      }
      dedupeCache.set(dedupeKey, Date.now());
    }

    const runner = async () => {
      const waitMs = Math.max(0, discordWritesBlockedUntil - Date.now());
      reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite runner start", {
        label,
        waitMs,
        optional,
      });
      if (waitMs > 0) {
        await delay(waitMs);
      }

      try {
        const result = await work();
        discordWritesBlockedUntil = Date.now() + cooldownMs;
        reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite success", {
          label,
          optional,
          nextAllowedAt: discordWritesBlockedUntil,
        });
        return result;
      } catch (error) {
        reportOauthCoinsDiscordDebug("C", "scheduleDiscordWrite error", {
          label,
          optional,
          details: describeDiscordError(error),
        });
        if (isDiscordRateLimitError(error)) {
          discordWritesBlockedUntil = Math.max(discordWritesBlockedUntil, Date.now() + Math.max(cooldownMs * 2, 5000));
          warnDiscordRateLimit(label, error, {
            optional,
            nextAllowedAt: new Date(discordWritesBlockedUntil).toISOString(),
          });
          pauseOptionalTraffic(error, label);
        } else {
          console.error(label, describeDiscordError(error));
        }

        if (optional && dedupeKey) {
          dedupeCache.delete(dedupeKey);
        }

        return null;
      }
    };

    const scheduled = discordWriteQueue.then(runner, runner);
    discordWriteQueue = scheduled.catch(() => null);
    return scheduled;
  };

  const sendAuditMessage = async (message, { dedupeKey = "", dedupeWindowMs = DISCORD_AUDIT_DEDUPE_WINDOW_MS } = {}) => {
    if (DISABLE_DISCORD_AUDIT_LOGS || !client.isReady() || !message || isOptionalTrafficPaused()) return null;

    try {
      let channel = null;
      if (logChannelId) {
        channel = await client.channels.fetch(logChannelId).catch(() => null);
      } else if (guildId) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const channels = guild ? await guild.channels.fetch().catch(() => null) : null;
        channel =
          channels?.find(
            (entry) =>
              entry && entry.isTextBased && entry.isTextBased() && String(entry.name || "").toLowerCase() === logChannelName.toLowerCase()
          ) || null;
      }

      if (!channel || !channel.isTextBased()) {
        return null;
      }

      return scheduleDiscordWrite(
        {
          label: "Failed to send Discord audit message",
          optional: true,
          dedupeKey: dedupeKey || `audit:${String(message).slice(0, 120)}`,
          dedupeWindowMs,
        },
        () => channel.send(message)
      );
    } catch (error) {
      console.error("Failed to resolve Discord audit channel:", describeDiscordError(error));
      return null;
    }
  };

  const resolveChannelByName = async (channelId, channelName) => {
    if (!client.isReady()) return null;

    if (channelId) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        return channel;
      }
    }

    if (!guildId) return null;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;

    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) return null;

    return (
      channels.find(
        (channel) =>
          channel &&
          channel.isTextBased &&
          channel.isTextBased() &&
          String(channel.name || "").toLowerCase() === channelName.toLowerCase()
      ) || null
    );
  };
  const resolveChannelByNames = async (channelNames = []) => {
    if (!client.isReady() || !guildId) return null;

    const normalizedChannelNames = [...new Set(channelNames.map((name) => normalizeCasinoKey(name)).filter(Boolean))];
    if (!normalizedChannelNames.length) return null;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;

    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) return null;

    return (
      channels.find(
        (channel) =>
          channel &&
          channel.isTextBased &&
          channel.isTextBased() &&
          normalizedChannelNames.includes(normalizeCasinoKey(channel.name))
      ) || null
    );
  };

  const resolveLogChannel = async () => resolveChannelByName(logChannelId, logChannelName);
  const resolveWebsiteChannel = async () => resolveChannelByName(websiteChannelId, websiteChannelName);
  const resolveAwareChannel = async () => resolveChannelByName(awareChannelId, awareChannelName);

  const getMemberAccessProfile = async (discordId) => {
    if (!client.isReady() || !guildId || !discordId) {
      return {
        discordId,
        isAdmin: ownerIds.has(discordId),
        roleIds: [],
        roleNames: [],
      };
    }

    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return {
          discordId,
          isAdmin: ownerIds.has(discordId),
          roleIds: [],
          roleNames: [],
        };
      }

      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) {
        return {
          discordId,
          isAdmin: ownerIds.has(discordId),
          roleIds: [],
          roleNames: [],
        };
      }

      const roleIds = member.roles.cache.map((role) => role.id);
      const roleNames = member.roles.cache
        .map((role) => role.name)
        .filter(Boolean);

      return {
        discordId,
        isAdmin: ownerIds.has(discordId) || roleIds.some((roleId) => adminRoleIds.has(roleId)),
        roleIds,
        roleNames,
      };
    } catch (error) {
      console.error(`Failed to fetch Discord role state for ${discordId}:`, error.message);
      return {
        discordId,
        isAdmin: ownerIds.has(discordId),
        roleIds: [],
        roleNames: [],
      };
    }
  };

  const rawDiscordRequest = async (url, options = {}) => {
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bot ${token}`,
        ...(options.headers || {}),
      };
      const res = await globalThis.fetch(`https://discord.com/api/v10${url}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const text = await res.text();
      let json;
      try {
        json = text && text.length ? JSON.parse(text) : null;
      } catch (_) {
        json = { __raw: text };
      }
      reportOauthCoinsDiscordDebug("C", "rawDiscordRequest", {
        url,
        status: res.status,
        ok: res.ok,
        hasBody: Boolean(options.body),
      });
      return { ok: res.ok, status: res.status, json, text };
    } catch (err) {
      reportOauthCoinsDiscordDebug("C", "rawDiscordRequest error", {
        url,
        message: err?.message || String(err),
      });
      return { ok: false, status: 0, json: null, text: String(err?.message || err) };
    }
  };

  const discordRawInteractionReply = async (interaction, payload, { label = "discord interaction reply" } = {}) => {
    if (!interaction?.id || !interaction?.token) {
      return { ok: false, status: 0, reason: "missing interaction id/token" };
    }
    const result = await rawDiscordRequest(`/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: "POST",
      body: { type: 4, data: payload },
    });
    if (!result.ok) {
      // Fallback 1: @original followup
      const followup = await rawDiscordRequest(`/webhooks/${interaction.applicationId}/${interaction.token}`, {
        method: "POST",
        body: payload,
      });
      if (!followup.ok) {
        // Fallback 2: edit the original @me message (for deferred flows)
        const editRes = await rawDiscordRequest(`/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`, {
          method: "PATCH",
          body: payload,
        });
        reportOauthCoinsDiscordDebug("C", "discordRawInteractionReply fallbacks", {
          label,
          callbackOk: result.ok,
          followupOk: followup.ok,
          editOk: editRes.ok,
        });
        return editRes;
      }
      return followup;
    }
    return result;
  };

  const discordRawInteractionAck = async (interaction, flags = 64) => {
    if (!interaction?.id || !interaction?.token) return null;
    // type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE — buys us 15 min
    return rawDiscordRequest(`/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: "POST",
      body: { type: 5, data: { flags } },
    });
  };

  const discordRawInteractionEditOriginal = async (interaction, payload) => {
    if (!interaction?.applicationId || !interaction?.token) return null;
    return rawDiscordRequest(`/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`, {
      method: "PATCH",
      body: payload,
    });
  };

  const discordRawInteractionFollowup = async (interaction, payload) => {
    if (!interaction?.applicationId || !interaction?.token) return null;
    return rawDiscordRequest(`/webhooks/${interaction.applicationId}/${interaction.token}`, {
      method: "POST",
      body: payload,
    });
  };

  const buildDiscordReplyPayload = ({ content, embeds, ephemeral = true, components }) => {
    const payload = {};
    if (typeof content === "string") payload.content = content;
    if (Array.isArray(embeds) && embeds.length) payload.embeds = embeds.slice(0, 10);
    if (Array.isArray(components) && components.length) payload.components = components;
    if (ephemeral) payload.flags = 64;
    return payload;
  };

  const safeReplyToInteraction = async (interaction, payload, label = "Discord safe reply") => {
    if (!interaction) return null;
    try {
      const result = await discordRawInteractionReply(interaction, payload, { label });
      return result.ok ? result : null;
    } catch (err) {
      reportOauthCoinsDiscordDebug("C", "safeReplyToInteraction throw", { label, error: err?.message || String(err) });
      return null;
    }
  };

  const writeInteractionResponse = async (
    interaction,
    payload,
    { label = "Discord interaction reply failed", methodOverride = "" } = {}
  ) => safeReplyToInteraction(interaction, payload, label);

  const replyToInteraction = async (interaction, payload, label = "Discord interaction reply failed") =>
    writeInteractionResponse(interaction, payload, { label });

  const syncRankRole = async (profile) => {
    if (!client.isReady() || !guildId || !profile?.discordId) return null;

    const targetRole = getRankRoleForPoints(profile.points || 0);
    const rankRoleIds = RANK_ROLE_CONFIG.map((entry) => entry.roleId).filter(Boolean);
    if (!targetRole?.roleId || !rankRoleIds.length) return null;

    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return null;

      const member = await guild.members.fetch(profile.discordId).catch(() => null);
      if (!member) return null;

      const currentRankRoleIds = member.roles.cache
        .filter((role) => rankRoleIds.includes(role.id))
        .map((role) => role.id);

      const rolesToRemove = currentRankRoleIds.filter((roleId) => roleId !== targetRole.roleId);
      if (rolesToRemove.length) {
        await member.roles.remove(rolesToRemove, "Antongambles rank sync");
      }

      if (!member.roles.cache.has(targetRole.roleId)) {
        await member.roles.add(targetRole.roleId, "Antongambles rank sync");
      }

      return {
        discordId: profile.discordId,
        roleId: targetRole.roleId,
        roleName: targetRole.name,
      };
    } catch (error) {
      console.error(`Failed to sync rank role for ${profile.discordId}:`, error.message);
      return null;
    }
  };

  const ensureAdminAccess = async (interaction) => {
    const hasPermission = interaction.memberPermissions?.has(ADMIN_PERMISSION);
    const ownerMatch = ownerIds.size === 0 || ownerIds.has(interaction.user.id);
    if (hasPermission && ownerMatch) return true;

    await replyToInteraction(interaction, {
      ephemeral: true,
      content: "Du har inte access till Coins admin-kommandon.",
    }, "Discord admin access reply failed");
    return false;
  };

  const buildDashboardEmbed = async () => {
    const [stats, leaderboard, events] = await Promise.all([
      store.getStats(),
      store.getLeaderboard(5),
      store.getRecentEvents(5),
    ]);
    const status = getStatus();

    return createPremiumEmbed({
      author: "Antongambles Owner Console",
      title: "Coins Owner Dashboard",
      description: "Live snapshot of the Coins economy, bot status, and the most active wallets.",
    })
      .addFields(
        {
          name: "Overview",
          value:
            `Users: \`${stats.totalUsers}\`\n` +
            `Live Coins: \`${stats.totalPoints}\`\n` +
            `Lifetime Coins: \`${stats.totalLifetimePoints}\`\n` +
            `Bot Ready: \`${status.ready ? "Yes" : "No"}\``,
          inline: true,
        },
        {
          name: "Runtime",
          value:
            `Guild: \`${guildId || "Global"}\`\n` +
            `Log Channel: \`${logChannelId || "Missing"}\`\n` +
            `Admin Lock: \`${ownerIds.size > 0 ? "Enabled" : "Open"}\``,
          inline: true,
        },
        {
          name: "Top Wallets",
          value: leaderboard.length ? truncateLines(leaderboard.map((profile, index) => formatUserLine(profile, index + 1)), 5) : "No live wallet data yet.",
          inline: false,
        },
        {
          name: "Fresh Activity",
          value: events.length ? truncateLines(events.map((event) => formatEventLine(event)), 5) : "No recent platform activity yet.",
          inline: false,
        }
      );
  };

  const buildTopEmbed = (leaderboard, limit) =>
    createPremiumEmbed({
      author: "Antongambles Rankings",
      title: `Coins Top ${limit}`,
      description: "Current wallet ranking across the Antongambles ecosystem.",
    }).addFields(
      ...createListFields(
        "Leaderboard",
        leaderboard.map((profile, index) => formatUserLine(profile, index + 1)),
        {
          chunkSize: 5,
          inline: true,
          emptyCopy: "No leaderboard data yet.",
        }
      )
    );

  const buildSearchEmbed = (results, query, sortBy) =>
    createPremiumEmbed({
      author: "Antongambles Search",
      title: "Coins User Search",
      description: `Query: \`${query}\``,
    }).addFields(
      {
        name: "Search Config",
        value: `Sort By: \`${sortBy}\`\nMatches: \`${results.length}\``,
        inline: true,
      },
      ...createListFields(
        "Matching Profiles",
        results.map((profile, index) => formatUserLine(profile, index + 1)),
        {
          chunkSize: 4,
          inline: true,
          emptyCopy: `No user matched \`${query}\`.`,
        }
      )
    );

  const buildHistoryEmbed = (events, title) =>
    createPremiumEmbed({
      author: "Antongambles Activity Feed",
      title,
      description: "Recent Coins actions, reward claims, and platform events.",
    }).addFields(
      ...createListFields("Event Feed", events.map((event) => formatEventLine(event)), {
        chunkSize: 4,
        inline: false,
        emptyCopy: "No matching events were found.",
      })
    );

  const buildWebsiteEmbed = () => {
    const casinoPartners = WEBSITE_LINKS.slice(2).map((item) => `[${item.label}](${item.url})`);
    const casinoPartnerLines = chunkItems(casinoPartners, 5).map((chunk) => chunk.join(" • "));

    return createPremiumEmbed({
      author: "Antongambles",
      title: "Antongambles.com",
      description: "Casino offers, Coins, giveaways, and community rewards.",
      url: `${BRAND_URL}/`,
      thumbnail: true,
    }).addFields(
      {
        name: "Main Platform",
        value: `[Open Website](${BRAND_URL}/) • [Giveaways](${BRAND_URL}/giveaways/)`,
        inline: false,
      },
      {
        name: "Casino Partners",
        value: casinoPartnerLines.join("\n"),
        inline: false,
      },
      {
        name: "Inside The Platform",
        value: "Daily Rewards • Coins • Giveaways • Tipping",
        inline: false,
      }
    );
  };

  const postWebsiteMessage = async (preferredChannel = null) => {
    const channel =
      preferredChannel && preferredChannel.isTextBased && preferredChannel.isTextBased()
        ? preferredChannel
        : await resolveWebsiteChannel();
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Website channel "${websiteChannelName}" could not be found.`);
    }

    const sent = await scheduleDiscordWrite(
      {
        label: "Failed to post website message",
      },
      () =>
        channel.send({
          embeds: [buildWebsiteEmbed()],
          components: buildWebsiteComponents(),
        })
    );
    if (!sent) {
      throw new Error("Website message could not be posted right now.");
    }
    return channel;
  };

  const buildAwareEmbed = () =>
    createPremiumEmbed({
      author: "Antongambles",
      title: "Be Gamble Aware",
      description: "Keep gambling fun, controlled, and fully within your limits.",
      url: "https://www.begambleaware.org/",
      thumbnail: true,
    }).addFields(
      {
        name: "Play Smart",
        value: "Set a budget • Take breaks • Never chase losses",
        inline: false,
      },
      {
        name: "Watch The Signs",
        value: "Stress • Overspending • Losing control • Hiding play",
        inline: false,
      },
      {
        name: "Support",
        value: "[BeGambleAware.org](https://www.begambleaware.org/) • [Get Help](https://www.begambleaware.org/get-support/)",
        inline: false,
      }
    );

  const postAwareMessage = async (preferredChannel = null) => {
    const channel =
      preferredChannel && preferredChannel.isTextBased && preferredChannel.isTextBased()
        ? preferredChannel
        : await resolveAwareChannel();
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Aware channel "${awareChannelName}" could not be found.`);
    }

    const sent = await scheduleDiscordWrite(
      {
        label: "Failed to post aware message",
      },
      () =>
        channel.send({
          embeds: [buildAwareEmbed()],
        })
    );
    if (!sent) {
      throw new Error("Aware message could not be posted right now.");
    }
    return channel;
  };
  const buildCasinoEmbed = (casino) =>
    createPremiumEmbed({
      author: "Antongambles",
      title: `${casino.label} Bonus`,
      description: casino.summary,
      url: casino.url,
      thumbnail: true,
    });
  const buildCasinoComponents = (casino) => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(casino.label).setURL(casino.url).setEmoji("↗️")
    ),
  ];
  const syncCasinoChannelTopic = async (channel, casino) => {
    if (!channel || typeof channel.setTopic !== "function") {
      return false;
    }

    const nextTopic = `${casino.label} page: ${casino.url}`;
    if (String(channel.topic || "").trim() === nextTopic) {
      return false;
    }

    const updated = await scheduleDiscordWrite(
      {
        label: `Failed to update ${casino.key} channel topic`,
      },
      () => channel.setTopic(nextTopic)
    );
    return Boolean(updated);
  };
  const resolveCasinoPostTarget = async (casino, preferredChannel = null) => {
    if (preferredChannel && preferredChannel.isTextBased && preferredChannel.isTextBased() && doesChannelMatchCasino(preferredChannel.name, casino)) {
      return preferredChannel;
    }

    return resolveChannelByNames([casino.key, casino.label, casino.path]);
  };
  const postCasinoMessage = async ({ preferredChannel = null, casinoKey = "", updateTopic = true } = {}) => {
    const casino = getCasinoChannelLink(casinoKey) || getCasinoChannelLink(preferredChannel?.name || "");
    if (!casino) {
      throw new Error("Casino channel could not be resolved.");
    }

    const channel = await resolveCasinoPostTarget(casino, preferredChannel);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Casino channel for "${casino.label}" could not be found.`);
    }

    const sent = await scheduleDiscordWrite(
      {
        label: `Failed to post ${casino.key} casino message`,
      },
      () =>
        channel.send({
          embeds: [buildCasinoEmbed(casino)],
          components: buildCasinoComponents(casino),
        })
    );
    if (!sent) {
      throw new Error(`${casino.label} message could not be posted right now.`);
    }

    const topicUpdated = updateTopic ? await syncCasinoChannelTopic(channel, casino) : false;
    return {
      channel,
      casino,
      topicUpdated,
    };
  };

  const buildGiveawayEmbed = (overview) => {
    const active = overview?.activeCampaign;
    if (!active) {
      return createPremiumEmbed({
        author: "Antongambles Giveaways",
        title: "Coins Giveaway",
        description: "No active vault drop is live right now. Start a new premium giveaway to reopen the board.",
      });
    }

    const topLines = active.topEntries?.length
      ? active.topEntries
          .map(
            (entry, index) =>
              `${index + 1}. **${entry.globalName || entry.username}**\nStake: \`${entry.stake} Coins\``
          )
          .join("\n")
      : "No entries have been staked yet.";

    return createPremiumEmbed({
      author: "Antongambles Giveaways",
      title: active.title || "Coins Giveaway",
      description:
        active.subtitle ||
        active.description ||
        "Live Coins giveaway with wallet-based entries.",
    })
      .addFields(
        {
          name: "Prize",
          value: `\`${active.prize || "Community drop"}\``,
          inline: true,
        },
        {
          name: "Entrants",
          value: `\`${active.entrantCount} entrants\``,
          inline: true,
        },
        {
          name: "Total Staked",
          value: `\`${Math.round(active.totalStaked || 0)} Coins\``,
          inline: true,
        },
        {
          name: "Ends",
          value: `\`${formatDate(active.endsAt)}\`\nDuration: \`${active.durationLabel || "72h"}\``,
          inline: true,
        },
        {
          name: "Winners",
          value: `\`${active.winnersCount || 1}\``,
          inline: true,
        },
        {
          name: "Top Entrants",
          value: topLines,
          inline: false,
        }
      );
  };

  const buildGiveawayWinnersEmbed = (result) => {
    const winners = result?.winners || [];
    const campaign = result?.campaign;

    return createPremiumEmbed({
      author: "Antongambles Winner Reveal",
      title: `Giveaway Drawn • ${campaign?.title || "Coins Giveaway"}`,
      description: winners.length
        ? "The draw is complete and the winning wallets are locked in."
        : "No winners could be drawn from the current vault state.",
    })
      .addFields(
        { name: "Prize", value: `\`${campaign?.prize || "Community drop"}\``, inline: true },
        { name: "Entries", value: `\`${campaign?.entrantCount || 0}\``, inline: true },
        { name: "Winners", value: `\`${winners.length}\``, inline: true },
        ...createListFields(
          "Winning Wallets",
          winners.map(
            (winner, index) =>
              `${index + 1}. **${winner.globalName || winner.username}**\nStake: \`${winner.stake} Coins\``
          ),
          {
            chunkSize: 4,
            inline: false,
            emptyCopy: "No winners were available for this draw.",
          }
        )
      );
  };

  const buildUserEmbed = (snapshot, user) => {
    const profile = snapshot.profile;
    const rewardStatus = snapshot.rewardStatus;
    const recentEvents = snapshot.recentEvents;

    return createPremiumEmbed({
      author: "Antongambles User Intelligence",
      title: `Coins User • ${profile.globalName || profile.username}`,
      description: `Discord User: \`${user.tag}\`\nDiscord ID: \`${profile.discordId}\``,
    })
      .addFields(
        {
          name: "Wallet",
          value:
            `Live: \`${profile.points} Coins\`\n` +
            `Lifetime: \`${profile.lifetimePoints} Coins\`\n` +
            `Level: \`${profile.levelName}\``,
          inline: true,
        },
        {
          name: "Activity",
          value:
            `Daily Streak: \`${profile.dailyStreak}\`\n` +
            `Best Streak: \`${profile.bestDailyStreak}\`\n` +
            `Last Login: \`${formatDate(profile.lastLoginAt)}\``,
          inline: true,
        },
        {
          name: "Rewards",
          value:
            `Daily: \`${rewardStatus.dailyReady ? "Ready" : "Claimed"}\`\n` +
            `Visit: \`${rewardStatus.visitReady ? "Ready" : "Claimed"}\`\n` +
            `Stream: \`${rewardStatus.streamReady ? "Ready" : formatDuration(rewardStatus.streamCooldownRemainingMs)}\``,
          inline: true,
        },
        {
          name: "Bonus Cooldowns",
          value:
            `Active: \`${rewardStatus.activeBonusCooldowns}\`\n` +
            `Tracked: \`${rewardStatus.totalBonusCooldowns}\`\n` +
            `Next Ready: \`${rewardStatus.nextBonusReadyMs > 0 ? formatDuration(rewardStatus.nextBonusReadyMs) : "Now"}\``,
          inline: true,
        },
        {
          name: "Profile Created",
          value: `\`${formatDate(profile.createdAt)}\``,
          inline: true,
        },
        {
          name: "Recent Events",
          value: recentEvents.length ? truncateLines(recentEvents.map((event) => formatEventLine(event)), 6) : "No recent events found for this user.",
          inline: false,
        }
      );
  };

  const buildUserSignupEmbed = (profile, discordUser = {}, guilds = []) =>
    createPremiumEmbed({
      author: "Antongambles User Feed",
      title: `New Account • ${profile.globalName || profile.username || "Unknown"}`,
      description: `Discord User: \`${discordUser.username ? `${discordUser.username}#${discordUser.discriminator || "0000"}` : profile.username || "Unknown"}\`\nDiscord ID: \`${profile.discordId}\``,
    }).addFields(
      {
        name: "Profile",
        value:
          `Balance: \`${profile.points} Coins\`\n` +
          `Lifetime: \`${profile.lifetimePoints} Coins\`\n` +
          `Level: \`${profile.levelName}\``,
        inline: true,
      },
      {
        name: "Account Info",
        value:
          `Guilds: \`${guilds.length}\`\n` +
          `Created: \`${formatDate(profile.createdAt)}\`\n` +
          `Last Login: \`${formatDate(profile.lastLoginAt)}\``,
        inline: true,
      }
    );

  const sendUserSignupMessage = async ({ profile, discordUser, guilds }) => {
    if (DISABLE_DISCORD_AUDIT_LOGS || !client.isReady() || isOptionalTrafficPaused()) return null;

    try {
      const channel = await resolveLogChannel();
      if (!channel || !channel.isTextBased()) return null;

      const sent = await scheduleDiscordWrite(
        {
          label: "Failed to send user signup message",
          optional: true,
          dedupeKey: `signup:${profile?.discordId || "unknown"}`,
          dedupeWindowMs: DISCORD_AUDIT_DEDUPE_WINDOW_MS,
        },
        () =>
          channel.send({
            embeds: [buildUserSignupEmbed(profile, discordUser, guilds)],
          })
      );
      return sent ? channel : null;
    } catch (error) {
      console.error("Failed to send user signup message:", describeDiscordError(error));
      return null;
    }
  };

  client.once("clientReady", async () => {
    botReady = true;
    lastError = null;
    console.log(`Discord bot ready as ${client.user.tag}`);
    try {
      await registerCommands();
      console.log("Discord slash commands registered");
    } catch (error) {
      lastError = error.message;
      console.error("Failed to register Discord commands:", error.message);
    }
  });

  client.on("error", (error) => {
    botReady = false;
    lastError = error.message;
    console.error("Discord client error:", error.message);
  });

  client.on("shardDisconnect", (event, id) => {
    botReady = false;
    lastError = `Shard ${id} disconnected with code ${event.code}`;
    console.error(lastError);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // RAW-ACK within single-digit ms. This buys us 15 minutes regardless of what happens below.
    try {
      await discordRawInteractionAck(interaction, 64);
    } catch (_) {
      // Discord.js may also ack internally; swallow and continue.
    }

    let cmdOk = false;
    let finalPayload = null;
    let followupAudit = null;

    try {
      if (!(await ensureAdminAccess(interaction))) {
        finalPayload = buildDiscordReplyPayload({
          content: "Du har inte tillgang till det har kommandot.",
          ephemeral: true,
        });
        cmdOk = true;
        return;
      }

      const commandName = interaction.commandName;

      if (commandName === "ag-dashboard" || commandName === "ag-stats") {
        const embed = await buildDashboardEmbed();
        finalPayload = buildDiscordReplyPayload({ embeds: [embed], ephemeral: true });
        cmdOk = true;
        return;
      }

      if (commandName === "ag-top") {
        const limit = interaction.options.getInteger("limit") || 10;
        const leaderboard = await store.getLeaderboard(limit);
        finalPayload = buildDiscordReplyPayload({
          embeds: [buildTopEmbed(leaderboard, limit)],
          ephemeral: true,
        });
        cmdOk = true;
        return;
      }

      if (commandName === "ag-search") {
        const query = interaction.options.getString("query", true);
        const sortBy = interaction.options.getString("sort") || "points";
        const limit = interaction.options.getInteger("limit") || 8;
        const results = await store.searchUsers({ query, sortBy, limit });
        finalPayload = buildDiscordReplyPayload({
          embeds: [buildSearchEmbed(results, query, sortBy)],
          ephemeral: true,
        });
        cmdOk = true;
        return;
      }

      if (commandName === "ag-user") {
        const user = interaction.options.getUser("user", true);
        const snapshot = await store.getUserAdminSnapshot(user.id);
        if (!snapshot) {
          finalPayload = buildDiscordReplyPayload({
            content: "Ingen profil hittades for den anvandaren.",
            ephemeral: true,
          });
        } else {
          finalPayload = buildDiscordReplyPayload({
            embeds: [buildUserEmbed(snapshot, user)],
            ephemeral: true,
          });
        }
        cmdOk = true;
        return;
      }

      if (commandName === "ag-give") {
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);
        const reason = interaction.options.getString("reason", true);
        const result = await store.adjustPoints({
          discordId: user.id,
          amount,
          reason,
          actor: interaction.user.tag,
        });
        await syncRankRole(result.profile);
        finalPayload = buildDiscordReplyPayload({
          content: `Gav ${amount} Coins till ${result.profile.globalName || result.profile.username}. Ny balans: ${result.profile.points} Coins.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Adminjustering: ${interaction.user.tag} gav ${amount} Coins till ${result.profile.globalName || result.profile.username}. Reason: ${reason}`;
        return;
      }

      if (commandName === "ag-take") {
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);
        const reason = interaction.options.getString("reason", true);
        const result = await store.adjustPoints({
          discordId: user.id,
          amount: Math.abs(amount) * -1,
          reason,
          actor: interaction.user.tag,
        });
        await syncRankRole(result.profile);
        finalPayload = buildDiscordReplyPayload({
          content: `Tog bort ${Math.abs(amount)} Coins fran ${result.profile.globalName || result.profile.username}. Ny balans: ${result.profile.points} Coins.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Adminjustering: ${interaction.user.tag} tog bort ${Math.abs(amount)} Coins fran ${result.profile.globalName || result.profile.username}. Reason: ${reason}`;
        return;
      }

      if (commandName === "ag-set") {
        const user = interaction.options.getUser("user", true);
        const amount = interaction.options.getInteger("amount", true);
        const reason = interaction.options.getString("reason", true);
        const result = await store.setPoints({
          discordId: user.id,
          amount: Math.max(0, amount),
          reason,
          actor: interaction.user.tag,
        });
        await syncRankRole(result.profile);
        finalPayload = buildDiscordReplyPayload({
          content: `Satte ${result.profile.globalName || result.profile.username} till ${result.profile.points} Coins.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Adminjustering: ${interaction.user.tag} satte balansen for ${result.profile.globalName || result.profile.username} till ${result.profile.points} Coins. Reason: ${reason}`;
        return;
      }

      if (commandName === "ag-reset") {
        const user = interaction.options.getUser("user", true);
        const target = interaction.options.getString("target", true);
        const reason = interaction.options.getString("reason") || "Manual admin reset";
        const result = await store.resetUserProgress({
          discordId: user.id,
          target,
          reason,
          actor: interaction.user.tag,
        });
        finalPayload = buildDiscordReplyPayload({
          content: `Reset klar: ${target} for ${result.profile.globalName || result.profile.username}.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Adminreset: ${interaction.user.tag} resetade ${target} for ${result.profile.globalName || result.profile.username}. Reason: ${reason}`;
        return;
      }

      if (commandName === "ag-history") {
        const user = interaction.options.getUser("user");
        const limit = interaction.options.getInteger("limit") || 10;
        const events = await store.getRecentEvents(limit, user?.id || null);
        finalPayload = buildDiscordReplyPayload({
          embeds: [buildHistoryEmbed(events, user ? `Coins History: ${user.tag}` : "Coins Global History")],
          ephemeral: true,
        });
        cmdOk = true;
        return;
      }

      if (commandName === "ag-giveaway") {
        const overview = await store.getGiveawayOverview();
        finalPayload = buildDiscordReplyPayload({
          embeds: [buildGiveawayEmbed(overview)],
          ephemeral: true,
        });
        cmdOk = true;
        return;
      }

      if (commandName === "ag-giveaway-start") {
        const title = interaction.options.getString("title", true);
        const prize = interaction.options.getString("prize", true);
        const duration =
          interaction.options.getString("duration") ||
          String(interaction.options.getInteger("hours", false) || "").trim();
        const winners = interaction.options.getInteger("winners") || 1;
        const subtitle = interaction.options.getString("subtitle") || "";
        const description = interaction.options.getString("description") || "";

        const campaign = await store.createGiveaway({
          title,
          prize,
          durationInput: duration,
          winnersCount: winners,
          subtitle,
          description,
          actor: interaction.user.tag,
        });

        finalPayload = buildDiscordReplyPayload({
          content: `Giveaway started: ${campaign.title} for ${campaign.prize} (${campaign.durationLabel}).`,
          embeds: [buildGiveawayEmbed({ activeCampaign: campaign })],
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Giveaway started: ${interaction.user.tag} launched ${campaign.title} (${campaign.prize}) for ${campaign.durationLabel}.`;
        return;
      }

      if (commandName === "ag-giveaway-draw") {
        const result = await store.drawGiveaway({ actor: interaction.user.tag });
        if (result.status === "no_entries") {
          finalPayload = buildDiscordReplyPayload({
            content: `Kan inte rita ut vinnare for "${result.campaign?.title || "giveaway"}" — det finns inga stakes anda.`,
            ephemeral: true,
          });
        } else {
          finalPayload = buildDiscordReplyPayload({
            embeds: [buildGiveawayWinnersEmbed(result)],
            ephemeral: true,
          });
          followupAudit = `Giveaway drawn: ${interaction.user.tag} drew ${result.campaign?.title || "Coins Giveaway"}. Winners: ${
            result.winners.map((winner) => winner.globalName || winner.username).join(", ") || "none"
          }`;
        }
        cmdOk = true;
        return;
      }

      if (commandName === "ag-website-post") {
        const channel = await postWebsiteMessage(interaction.channel);
        finalPayload = buildDiscordReplyPayload({
          content: `Website-meddelandet postades i ${channel}.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Website post: ${interaction.user.tag} postade website-embeden i ${channel.name}.`;
        return;
      }

      if (commandName === "ag-aware-post") {
        const channel = await postAwareMessage(interaction.channel);
        finalPayload = buildDiscordReplyPayload({
          content: `Be Gamble Aware-meddelandet postades i ${channel}.`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Aware post: ${interaction.user.tag} postade Be Gamble Aware-embeden i ${channel.name}.`;
        return;
      }

      if (commandName === "ag-casino-post") {
        const casinoKey = interaction.options.getString("casino");
        const updateTopic = interaction.options.getBoolean("topic");
        const result = await postCasinoMessage({
          preferredChannel: interaction.channel,
          casinoKey,
          updateTopic: updateTopic !== false,
        });
        finalPayload = buildDiscordReplyPayload({
          content: `${result.casino.label}-meddelandet postades i ${result.channel}.${result.topicUpdated ? " Kanal-topic uppdaterades ocksa." : ""}`,
          ephemeral: true,
        });
        cmdOk = true;
        followupAudit = `Casino post: ${interaction.user.tag} postade ${result.casino.label}-embeden i ${result.channel.name}.${result.topicUpdated ? " Topic uppdaterades." : ""}`;
        return;
      }

      // No command matched.
      finalPayload = buildDiscordReplyPayload({
        content: "Okandt kommando.",
        ephemeral: true,
      });
      cmdOk = true;
    } catch (error) {
      console.error("Discord interaction error:", describeDiscordError(error));
      const errorDetail =
        error && typeof error === "object" && error.message
          ? String(error.message)
          : "unknown error";
      finalPayload = buildDiscordReplyPayload({
        content: `Nagot gick fel. Kommando: ${interaction?.commandName || "unknown"} (${errorDetail.slice(0, 150)}). Prova igen om en stund.`,
        ephemeral: true,
      });
      cmdOk = true;
    } finally {
      try {
        if (finalPayload) {
          await discordRawInteractionEditOriginal(interaction, finalPayload);
        }
      } catch (_) {
        // If edit failed, try a followup as last resort.
        try {
          if (finalPayload) await discordRawInteractionFollowup(interaction, finalPayload);
        } catch (_sub) {
          // swallow. we ACK'd so the user sees "thinking..." at the very least.
        }
      }
      if (followupAudit) {
        try {
          await sendAuditMessage(followupAudit);
        } catch (_) {
          // Audit is best-effort; never block the response on it.
        }
      }
    }
  });

  const start = async () => {
    if (loginStarted) return;
    loginStarted = true;
    try {
      await registerCommands();
      console.log(`Discord slash commands synced (${commands.length})`);
      await client.login(token);
    } catch (error) {
      botReady = false;
      lastError = error.message;
      console.error("Discord bot failed to start:", error.message);
    }
  };

  return {
    start,
    sendAuditMessage,
    sendUserSignupMessage,
    getMemberAccessProfile,
    syncRankRole,
    getStatus,
    postWebsiteMessage,
    postAwareMessage,
    postCasinoMessage,
  };
};

module.exports = {
  createDiscordBot,
};
