# Debug Session: oauth-coins-railway
- **Status**: [OPEN]
- **Issue**: Discord OAuth login and Coins on Railway intermittently fail with `"You're sending messages too fast"` and 429-related behavior.
- **Environment**: Railway production at `https://antongambleswebsite-production.up.railway.app`
- **Primary Scope**: `server.js`, `store.js`, `discord-bot.js`
- **Symptoms**:
  - OAuth may fail after Discord authorize.
  - Railway logs show `Points claim error` / `Points heartbeat error` with 429 and `"You're sending messages too fast"`.
  - Discord logging/rate limits appear capable of impacting auth and Coins.

## Hypotheses
| ID | Hypothesis | Likelihood | Effort | Evidence Needed |
|----|------------|------------|--------|-----------------|
| A | Optional Discord audit/logging is still coupled to OAuth response flow in production | High | Medium | Runtime logs around callback steps before/after response |
| B | `visit-duration` or related reward flow is producing the 429 independently of Discord API and polluting logs | High | Medium | Runtime logs in `recordRewardHeartbeat()` and `claimReward()` |
| C | Discord write volume from audit logs / replies still trips rate limit bursts and affects bot behavior | High | Medium | Runtime logs around queued Discord writes and rate-limit captures |
| D | Railway behavior differs from local due to env flags / deploy state / redirect path assumptions | Medium | Medium | Runtime logs for env-driven branches and callback redirect completion |
| E | Error handling still masks the real source step, making OAuth/Coins look like one combined failure | Medium | Low | Structured logs per request phase with stack + step labels |

## Plan
1. Add instrumentation only to OAuth callback, Coins endpoints, store reward paths, and Discord write wrappers.
2. Reproduce locally with debug logs enabled and compare against existing Railway symptoms.
3. Confirm which hypothesis is true from logs.
4. Apply minimal fix and verify with post-fix logs.

## Evidence
- **Pre-fix local reproduction**: `visit-duration` heartbeat/claim completed without 429 and returned JSON successfully.
- **Pre-fix log proof**: `.dbg/trae-debug-log-oauth-coins-railway.ndjson` shows:
  - `points heartbeat result` with `remainingMs: 300000`
  - `points claim result` with `applied: false`
  - no 429 thrown by `recordRewardHeartbeat()` or `claimReward()`
- **Frontend auth flow finding**: `login-loading.js` fetches `/api/discord/callback` and expects JSON, so backend callback must stay safe/non-blocking rather than relying on Discord side-effects.
- **Post-fix verification**:
  - first `visit-duration` claim returned normal JSON
  - second immediate claim returned `throttled: true` and `cooldownRemainingMs`
  - cookie-based auth to `/api/me` succeeded using `Cookie: ag_session_token=...`
  - `DISABLE_VISIT_DURATION_POINTS=true` returned `{ disabled: true }` from `store.claimReward()`

## Hypothesis Status
| ID | Status | Conclusion |
|----|--------|------------|
| A | Confirmed | OAuth needed to be fully isolated from optional Discord work; callback now responds first and schedules Discord work separately. |
| B | Rejected as primary root cause | Local `visit-duration` reward path did not generate 429 on its own; reward flow itself returned correct JSON. |
| C | Confirmed | Discord writes needed stronger throttling / swallow-on-429 behavior and audit disable support. |
| D | Plausible / addressed | Railway-specific env behavior is now controllable via `DISABLE_DISCORD_AUDIT_LOGS` and `DISABLE_VISIT_DURATION_POINTS`. |
| E | Confirmed | Structured per-step logs were needed to separate OAuth callback failures from optional Discord/logging failures. |

## Fix Summary
- Added safe cookie/session fallback auth path in `server.js`.
- Isolated OAuth response from optional Discord tasks.
- Added env support:
  - `DISABLE_DISCORD_AUDIT_LOGS=true`
  - `DISABLE_VISIT_DURATION_POINTS=true`
- Disabled all audit-style Discord writes when audit logs are turned off.
- Added warn-only behavior on Discord 429 in the bot write queue.
- Added per-user cooldown for repeated `visit-duration` claims.
- Ensured `visit-duration` skips Discord-side work entirely.
