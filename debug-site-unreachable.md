# Debug Session: site-unreachable

Status: OPEN

## Symptom
- The user cannot access the local website anymore.
- Expected behavior is that the site loads on `http://localhost:8000`.

## Scope
- Runtime evidence first.
- No business-logic fix before evidence confirms the failure path.

## Hypotheses
1. `server.js` is not running.
2. Port `8000` is not listening, or the server process exits immediately.
3. The server responds, but a recent frontend asset change makes the page appear broken or blank.
4. A recent `app.js` or `styles.css` change causes a fatal runtime error in the browser path.
5. A process/startup conflict prevents stable local hosting.

## Evidence Plan
- Check whether a Node process for `server.js` exists.
- Check whether port `8000` is listening.
- Probe `http://localhost:8000` and `/api/health`.
- If needed, inspect recent changed files and restart the server under observation.

## Evidence Summary
- Only the debug collector process was running initially; no `server.js` Node process was active.
- Port `8000` was not listening.
- `http://localhost:8000` and `/api/health` both failed with connection errors before restart.
- Running `node server.js` directly showed normal startup logs, but the process did not remain active in that execution mode.
- Starting `server.js` via detached process restored service successfully.

## Current State
- `localhost:8000` responds again.
- `/api/health` returns `ok: true`.
- Bot is ready and totals are still zeroed as expected.
