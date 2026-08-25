# Debug Session: ag-data-live-writes

Status: OPEN

## Symptom
- `data/ag-data.json` changes in the background while the app is live.
- A manual reset attempt raced with an unexpected write.

## Scope
- Runtime evidence only first.
- No business-logic fix until instrumentation proves the writer path.

## Hypotheses
1. A browser tab is still hitting auth/reward/giveaway endpoints and causing writes.
2. A frontend timer/heartbeat loop is triggering write-heavy endpoints repeatedly.
3. A bot/admin command path is writing into the same store unexpectedly.
4. A nominally read-only endpoint still goes through `updateData()` and writes the file.
5. Multiple Node processes are serving the same project and competing on the file.

## Evidence Plan
- Start debug server and collect structured logs.
- Instrument store write path and key mutating routes.
- Reproduce/observe live writes without changing business behavior.
- Match write events to route/action/process context.

## Evidence Summary
- `store.js` instrumentation captured repeated `recordRewardHeartbeat` calls with `reward: "stream-watch"` for Discord ID `853584962351661078`.
- Before reset, each heartbeat was followed by `writeData persisted`, proving the live writer was the stream heartbeat path.
- After resetting `data/ag-data.json`, the heartbeat still reached the backend, but no further `writeData persisted` events occurred.
- `data/ag-data.json` stayed at an empty 105-byte payload after reset.
- Runtime health check confirmed:
  - `users: 0`
  - `points: 0`
  - `lifetimePoints: 0`
  - `activeCampaign: null`

## Hypothesis Status
- H1 confirmed: an already open logged-in browser tab was still hitting reward endpoints.
- H2 confirmed: the repeating source was the frontend heartbeat loop for `stream-watch`.
- H3 rejected: no bot/admin write path evidence appeared.
- H4 rejected for this incident: no `getGiveawayOverview` write evidence appeared in the captured run.
- H5 rejected: only one app server process was writing during the verified run.

## Fix Applied
- Reset `data/ag-data.json` to an empty state.
- Updated frontend reward request handling so `404` now clears local auth state just like `401`.
- Bumped `app.js` cache busting from `v=25` to `v=26` across HTML entry points.
- Restarted the site as a detached Node process and verified `http://localhost:8000/api/health`.

## Current Status
- Issue is functionally resolved for the reset flow.
- Debug instrumentation is intentionally still present until final confirmation.
