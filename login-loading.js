﻿const AUTH_STORAGE_KEYS = {
  sessionToken: "ag_session_token",
  profile: "ag_profile",
};

const POST_LOGIN_REDIRECT_KEY = "ag_post_login_redirect";
const DEBUG_STORAGE_KEY = "ag_oauth_debug";

const statusEl = document.getElementById("auth-loading-status");
const actionsEl = document.getElementById("auth-loading-actions");
const joinBtnEl = document.getElementById("auth-loading-join-btn");
const substatusEl = document.getElementById("auth-loading-substatus");
const DISCORD_INVITE_URL = "https://discord.gg/t7hNWHX6GW";

const setStatus = (message, submessage = "", isError = false) => {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  }

  if (substatusEl && submessage) {
    substatusEl.textContent = submessage;
  }
};

const setLoadingActionsVisible = (visible) => {
  if (actionsEl) {
    actionsEl.classList.toggle("active", visible);
  }
};

const storeLoginDebug = (payload) => {
  try {
    localStorage.setItem(
      DEBUG_STORAGE_KEY,
      JSON.stringify({
        ...payload,
        capturedAt: new Date().toISOString(),
      })
    );
  } catch {}
};

const clearAuthState = () => {
  localStorage.removeItem("discord_auth_code");
  localStorage.removeItem("discord_logged_in");
  localStorage.removeItem("discord_user");
  localStorage.removeItem("discord_guilds");
  localStorage.removeItem("ag_points");
  localStorage.removeItem(AUTH_STORAGE_KEYS.sessionToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.profile);
  sessionStorage.removeItem("discord_state");
  sessionStorage.removeItem("discord_nonce");
};

const setSessionToken = (token) => {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEYS.sessionToken, token);
  }
};

const setCurrentProfile = (profile) => {
  if (profile) {
    localStorage.setItem(AUTH_STORAGE_KEYS.profile, JSON.stringify(profile));
    if (typeof profile.points === "number") {
      localStorage.setItem("ag_points", profile.points.toString());
    }
    return;
  }

  localStorage.removeItem(AUTH_STORAGE_KEYS.profile);
};

const getRedirectTarget = () => {
  const storedTarget = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY) || "/";
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);

  if (!storedTarget.startsWith("/")) {
    return "/";
  }

  if (storedTarget.startsWith("/login-loading.html")) {
    return "/";
  }

  return storedTarget;
};

const redirectHomeSoon = (target = "/", delayMs = 1200) => {
  window.setTimeout(() => {
    window.location.replace(target);
  }, delayMs);
};

const handleLoginLoading = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code");
  const state = urlParams.get("state");
  const error = urlParams.get("error");

  if (error) {
    console.error("Discord login error:", error);
    storeLoginDebug({
      stage: "oauth-authorize",
      error,
    });
    setStatus("Login Cancelled", "Sending you back to the homepage...", true);
    redirectHomeSoon("/");
    return;
  }

  if (joinBtnEl) {
    joinBtnEl.href = DISCORD_INVITE_URL;
  }

  if (!code || !state) {
    storeLoginDebug({
      stage: "login-loading",
      error: "Missing code or state",
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });
    setStatus("No Login Session Found", "Sending you back to the homepage...", true);
    redirectHomeSoon("/");
    return;
  }

  const savedState = sessionStorage.getItem("discord_state");
  if (state !== savedState) {
    console.error("Invalid state parameter");
    storeLoginDebug({
      stage: "state-check",
      error: "Invalid state parameter",
      receivedState: state,
      savedState,
    });
    clearAuthState();
    setStatus("Could Not Verify Login", "The session did not match. Please try again.", true);
    redirectHomeSoon("/", 1800);
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
  setStatus("Connecting Discord", "We are fetching your account and Coins profile...");

  const fetchTimeoutMs = 20000;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), fetchTimeoutMs);

  let substatusTimer = null;
  const ticks = ["Preparing request…", "Talking to Discord…", "Syncing profile…", "Almost there…"];
  let tickIdx = 0;
  substatusTimer = window.setInterval(() => {
    tickIdx = (tickIdx + 1) % ticks.length;
    if (substatusEl && !substatusEl.classList?.contains("is-error")) {
      substatusEl.textContent = ticks[tickIdx];
    }
  }, 3500);

  try {
    const response = await fetch(`/api/discord/callback?code=${encodeURIComponent(code)}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    window.clearInterval(substatusTimer);
    const requestId = response.headers.get("x-auth-request-id") || "";
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      storeLoginDebug({
        stage: "callback-parse",
        error: parseError.message,
        status: response.status,
        requestId,
        raw,
      });
      throw new Error(`Callback parse failed (${response.status})${requestId ? ` [${requestId}]` : ""}`);
    }

    if (!response.ok) {
      storeLoginDebug({
        stage: "callback-response",
        status: response.status,
        requestId,
        body: data,
      });
      if (response.status === 403 && data.code === "DISCORD_GUILD_REQUIRED") {
        throw new Error(data.error || "You must be in the AntonGambles Discord to log in.");
      }
      throw new Error(data.error || `Discord callback failed (${response.status})${requestId ? ` [${requestId}]` : ""}`);
    }

    if (!data.user || !data.sessionToken) {
      storeLoginDebug({
        stage: "callback-payload",
        status: response.status,
        requestId,
        body: data,
      });
      throw new Error(`Missing Discord session payload${requestId ? ` [${requestId}]` : ""}`);
    }

    localStorage.setItem("discord_user", JSON.stringify(data.user));
    localStorage.setItem("discord_guilds", JSON.stringify(data.guilds || []));
    localStorage.setItem("discord_logged_in", "true");
    setSessionToken(data.sessionToken);
    setCurrentProfile(data.profile || null);
    sessionStorage.removeItem("discord_state");
    sessionStorage.removeItem("discord_nonce");
    storeLoginDebug({
      stage: "callback-success",
      status: response.status,
      requestId,
      discordId: data.user?.id || null,
    });

    const redirectTarget = getRedirectTarget();
    setStatus("Success", "Your profile is ready. Redirecting you now...");
    setLoadingActionsVisible(false);
    redirectHomeSoon(redirectTarget, 900);
  } catch (error) {
    window.clearTimeout(timeoutId);
    window.clearInterval(substatusTimer);
    console.error("Failed to get user info:", error);
    storeLoginDebug({
      stage: "callback-catch",
      error: error.message,
      name: error.name,
    });
    clearAuthState();
    const isAbort = error.name === "AbortError" || String(error.message || "").toLowerCase().includes("abort");
    const isGuildRequired = String(error.message || "").toLowerCase().includes("antongambles discord");
    if (isGuildRequired) {
      setStatus(
        "Join Discord First",
        "You must join the AntonGambles Discord before you can continue with Discord login.",
        true
      );
    } else if (isAbort) {
      setStatus(
        "Login Timed Out",
        "The server took too long to respond. Make sure the backend is running and your internet is working. Then try again.",
        true
      );
    } else {
      setStatus("Login Failed", error.message || "Something went wrong with Discord. Please try again.", true);
    }
    setLoadingActionsVisible(isGuildRequired || isAbort);
    if (!isGuildRequired && !isAbort) {
      redirectHomeSoon("/", 2600);
    }
  }
};

handleLoginLoading();
