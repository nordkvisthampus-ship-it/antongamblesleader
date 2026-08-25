const http = require("http");
const fs = require("fs");
const path = require("path");

const session = "ag-data-live-writes";
const outdir = __dirname;
const envFile = path.join(outdir, `${session}.env`);
const logFile = path.join(outdir, `trae-debug-log-${session}.ndjson`);
const idleMs = 1200 * 1000;

fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(logFile, "", "utf8");

let lastEventAt = Date.now();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET, DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
};

const startServer = (port, retries = 0) => {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS" && req.url === "/event") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          ok: true,
          sessionId: session,
          uptimeSeconds: Math.round(process.uptime()),
        })
      );
      return;
    }

    if (req.method === "DELETE" && req.url === "/logs") {
      fs.writeFileSync(logFile, "", "utf8");
      lastEventAt = Date.now();
      res.writeHead(200, {
        ...corsHeaders,
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/event") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const event = JSON.parse(body || "{}");
          if (!event.ts) {
            event.ts = Date.now();
          }
          fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`, "utf8");
          lastEventAt = Date.now();
          res.writeHead(200, corsHeaders);
          res.end("ok");
        } catch (error) {
          res.writeHead(400, {
            ...corsHeaders,
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404, {
      ...corsHeaders,
      "Content-Type": "text/plain",
    });
    res.end("not found");
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && retries < 10) {
      startServer(port + 1, retries + 1);
      return;
    }
    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    const actualPort = server.address().port;
    const apiUrl = `http://127.0.0.1:${actualPort}/event`;

    fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${session}\n`, "utf8");

    console.log("@@DEBUG_SERVER_INFO");
    console.log(
      JSON.stringify(
        {
          api_url: apiUrl,
          session_id: session,
          log_dir: outdir,
          log_file: logFile,
          env_file: envFile,
        },
        null,
        2
      )
    );
    console.log("@@END_DEBUG_SERVER_INFO");

    setInterval(() => {
      if (idleMs > 0 && Date.now() - lastEventAt > idleMs) {
        server.close(() => process.exit(0));
      }
    }, 5000).unref();
  });
};

startServer(7777);
