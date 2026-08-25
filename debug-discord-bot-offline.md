[OPEN] Debug session: discord-bot-offline

## Symptom
- Discord-botten visas inte som online i servern.

## Current Hypotheses
1. `DISCORD_BOT_TOKEN` ar ogiltig eller gammal efter reset.
2. `DISCORD_CLIENT_ID` eller guild-konfigurationen ar fel och stoppar startup/command registration.
3. `server.js` fastnar eller kraschar innan botten startas, till exempel pa grund av portkonflikt.
4. `.env` laddas inte korrekt, sa botten far tomma eller felaktiga miljovarden.
5. Botten ar inte korrekt inviterad med scopes/permissions till Discord-servern.

## Evidence Log
- `node server.js` kraschar direkt med `EADDRINUSE: address already in use :::8000`.
- Port `8000` lyssnas redan pa av `node.exe` med PID `22512`.
- Separat Discord-login-test lyckades: `BOT_READY Antongambles#7378`.

## Next Step
- Stoppa processen som redan anvander port `8000`, starta sedan om `server.js` och verifiera att botten gar online.
