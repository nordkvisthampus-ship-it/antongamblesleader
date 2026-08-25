const AUTH_STORAGE_KEYS = {
  sessionToken: "ag_session_token",
  profile: "ag_profile",
};

const statusEl = document.getElementById("auth-loading-status");
const substatusEl = document.getElementById("auth-loading-substatus");

const setStatus = (message, submessage = "", isError = false) => {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  }

  if (substatusEl && submessage) {
    substatusEl.textContent = submessage;
  }
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
  sessionStorage.removeItem("ag_post_login_redirect");
};

const redirectHomeSoon = (delayMs = 900) => {
  window.setTimeout(() => {
    window.location.replace("/");
  }, delayMs);
};

const handleLogoutLoading = () => {
  try {
    setStatus("Logging Out", "Your session is being cleared now...");
    clearAuthState();
    setStatus("Done", "You are now logged out. Redirecting you...");
    redirectHomeSoon();
  } catch (error) {
    console.error("Failed to clear auth state:", error);
    setStatus("Could Not Log Out", "Something went wrong. Please try again.", true);
    redirectHomeSoon(1600);
  }
};

handleLogoutLoading();
