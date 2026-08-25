[OPEN] Debug session: discord-login-bot-offline

## Symptom
- Det gar inte langre att logga in pa hemsidan.
- Discord-botten gick offline.

## Current Hypotheses
1. `server.js` kraschar efter start, sa bade hemsidans login och botten slutar fungera.
2. `DISCORD_BOT_TOKEN` eller `DISCORD_CLIENT_SECRET` ar fel eller utgangna efter senaste andringarna.
3. `.env` innehaller ett formatfel som gor att auth/session inte laddas korrekt.
4. Discord OAuth callback-flodet faller i backend.
5. Port/processkonflikt gor att frontend pekar mot en server som inte faktiskt kor.

## Evidence Log
- `.env` laddas och innehaller satta Discord-variabler.
- `node server.js` kraschar direkt med `EADDRINUSE` pa port `8000`.
- Port `8000` lyssnas redan pa av `node.exe` PID `22512`.
- `http://localhost:8000/` svarar `200`, sa en gammal serverprocess kor redan.
- `http://localhost:8000/api/leaderboard` svarar med sajt-HTML, vilket tyder pa att den redan korande processen inte beter sig som den aktuella onskade serverkonfigurationen for API-flodet.

## Next Step
- Stoppa den gamla processen pa port `8000`, korrigera `.env`-missen pa `SESSION_SECRET` och starta om servern for att ladda nuvarande konfiguration.
