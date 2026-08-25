const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 7777;
const OUT_DIR = path.join(__dirname);
const LOG_FILE = path.join(OUT_DIR, "trae-debug-log-server-crash-loop.ndjson");

fs.mkdirSync(OUT_DIR, { recursive: true });

const readLogs = () => {
  try {
    return fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    return "";
  }
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/event") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        fs.appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8");
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, port: PORT, logFile: LOG_FILE }));
    return;
  }

  if (req.method === "GET" && req.url === "/logs") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end(readLogs());
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`debug collector listening on http://127.0.0.1:${PORT}`);
});
