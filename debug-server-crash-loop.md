# Debug Session: server-crash-loop
- **Status**: [OPEN]
- **Issue**: Local server keeps dying and localhost stops responding.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-server-crash-loop.ndjson

## Reproduction Steps
1. Start `node server.js`
2. Open `http://localhost:8000/` or `http://localhost:8000/giveaways/`
3. Wait and observe that localhost eventually refuses connection again

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The server process is being terminated by the terminal/session model rather than app logic | High | Low | Rejected |
| B | The Discord bot startup or later async bot work causes the Node process to exit | Medium | Medium | Rejected |
| C | A request path triggers an uncaught runtime error that kills the process | Medium | Medium | Confirmed |
| D | Data file read/write errors cause a fatal exception and process exit | Medium | Medium | Confirmed |
| E | Port/process conflicts create short-lived startup followed by shutdown | Low | Low | Rejected |

## Log Evidence
- Pre-fix: `server.js` logged `unhandledRejection` with `Failed to parse ag-data.json. Refusing to continue to avoid data loss.` while `getChatMessages()` read the file during concurrent writes.
- Pre-fix: `store.js` logs show `writeData about to persist` immediately followed by the parse failure path from a separate read request.
- Post-fix: server restarted with `DEBUG_RUN_ID=post-fix`, stress-tested with repeated concurrent requests to `/api/chat/messages`, `/api/points/heartbeat`, and `/api/giveaway`.
- Post-fix: debug logs show many `writeData persisted` entries under load and no `unhandledRejection` / parse failures.
- Post-fix: `/api/health` returned `200` after stress, and the server process remained alive.

## Verification Conclusion
- Root cause: non-atomic writes to `data/ag-data.json` allowed readers to observe partially written JSON, causing parse failures and an unhandled rejection that brought the server down.
- Fix applied: `writeData()` now writes to `ag-data.json.tmp` and atomically renames it to `ag-data.json`.
- Comparative result:
  - Pre-fix: parse failure + unhandled rejection observed.
  - Post-fix: no parse failure observed under repeated concurrent read/write stress; server stayed healthy.
