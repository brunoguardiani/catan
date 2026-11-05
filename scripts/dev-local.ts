import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { WebSocketServer } from "ws";
import { roomHub } from "../src/server/room-hub";

const port = Number(process.env.PORT ?? 3000);
const nextPort = Number(process.env.NEXT_INTERNAL_PORT ?? 3001);
const nextProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(nextPort), "-H", "127.0.0.1"], {
  cwd: process.cwd(), stdio: "inherit", windowsHide: true, env: { ...process.env, ENABLE_TEST_MODE: "1" },
});

const server = createServer((incoming, outgoing) => {
  const upstream = httpRequest({
    hostname: "127.0.0.1", port: nextPort,
    method: incoming.method, path: incoming.url, headers: incoming.headers,
  }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end("Next local indisponível"); });
  incoming.pipe(upstream);
});

const websocketServer = new WebSocketServer({
  server, path: "/api/ws",
  verifyClient(info, done) {
    const origin = info.req.headers.origin;
    if (!origin) { done(true); return; }
    try { done(new URL(origin).host === info.req.headers.host); }
    catch { done(false); }
  },
});

websocketServer.on("connection", socket => {
  socket.on("message", data => roomHub.receive(socket, data.toString()));
  socket.on("close", () => roomHub.disconnect(socket));
  socket.on("error", () => roomHub.disconnect(socket));
});

function shutdown() {
  for (const socket of websocketServer.clients) socket.terminate();
  websocketServer.close();
  server.close();
  nextProcess.kill();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

server.listen(port, "127.0.0.1", () => console.log(`Catan: http://localhost:${port}`));
