import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const origin = process.env.LOCAL_ORIGIN ?? "http://localhost:3000";
const response = await fetch(origin);
assert.equal(response.status, 200);
assert.match(await response.text(), /Catan/);

function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", listener); reject(new Error("Evento WebSocket não recebido")); }, 4000);
    function listener(data) {
      const event = JSON.parse(data.toString());
      if (process.env.SMOKE_DEBUG) console.log("Evento recebido:", event.type, event.message ?? "");
      if (!predicate(event)) return;
      clearTimeout(timer);
      socket.off("message", listener);
      resolve(event);
    }
    socket.on("message", listener);
  });
}

async function connect() {
  const socket = new WebSocket(origin.replace(/^http/, "ws") + "/api/ws", { origin });
  if (process.env.SMOKE_DEBUG) {
    socket.on("message", data => console.log("Frame recebido:", JSON.parse(data.toString()).type));
    socket.on("close", code => console.log("Socket fechado:", code));
    socket.on("error", error => console.log("Erro no socket:", error.message));
  }
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
}

function send(socket, command) { socket.send(JSON.stringify({ commandId: randomUUID(), ...command })); }
const sockets = [];
try {
  const host = await connect();
  sockets.push(host);
  const hostId = randomUUID();
  const created = waitFor(host, event => event.type === "room:joined");
  send(host, { type: "room:create", playerId: hostId, token: "a".repeat(64), nickname: "Ana", avatar: "fox" });
  const code = (await created).room.code;
  const guest = await connect();
  sockets.push(guest);
  const joined = waitFor(guest, event => event.type === "room:joined");
  send(guest, { type: "room:join", code, playerId: randomUUID(), token: "b".repeat(64), nickname: "Bia", avatar: "owl" });
  assert.equal((await joined).room.players.length, 2);
  const ready = waitFor(guest, event => event.type === "room:state" && event.room.players[0]?.ready);
  send(host, { type: "player:ready", ready: true });
  assert.equal((await ready).room.players[0].id, hostId);
  const chat = waitFor(guest, event => event.type === "chat:message");
  send(host, { type: "chat:message", text: "Teste local" });
  assert.equal((await chat).text, "Teste local");
  const reaction = waitFor(guest, event => event.type === "reaction:send");
  send(host, { type: "reaction:send", reaction: "🤬" });
  assert.equal((await reaction).reaction, "🤬");
  console.log(`HTTP e WebSocket locais OK. Sala ${code}: 2 jogadores, pronto, chat e reação sincronizados.`);
} finally {
  for (const socket of sockets) socket.close();
}
