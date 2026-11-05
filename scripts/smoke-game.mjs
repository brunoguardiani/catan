import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const origin = process.env.LOCAL_ORIGIN ?? "http://localhost:3000";
const sockets = [];
const latest = new Map();
function send(socket, data) { socket.send(JSON.stringify({ commandId: randomUUID(), ...data })); }
function waitFor(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", listener); reject(new Error("Evento do jogo não recebido")); }, 5000);
    function listener(data) {
      const event = JSON.parse(data.toString());
      if (!predicate(event)) return;
      clearTimeout(timer);
      socket.off("message", listener);
      resolve(event);
    }
    socket.on("message", listener);
  });
}
async function connect(id) {
  const socket = new WebSocket(origin.replace(/^http/, "ws") + "/api/ws", { origin });
  sockets.push(socket);
  socket.on("message", data => {
    const event = JSON.parse(data.toString());
    if (event.type === "game:state") latest.set(id, event.game);
    if (event.type === "room:error") console.error("Erro do jogo:", event.message);
  });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return socket;
}
async function currentProjection(id, phase) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const game = latest.get(id);
    if (game?.currentPlayerId === id && game.phase === phase) return game;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Projeção ${phase} não recebida por ${id}`);
}

try {
  const playerCount = Number(process.env.SMOKE_PLAYERS ?? 3);
  assert.ok(Number.isInteger(playerCount) && playerCount >= 3 && playerCount <= 6);
  const mapSize = process.env.SMOKE_MAP_SIZE ?? (playerCount >= 5 ? "expanded" : "standard");
  assert.ok(["standard", "expanded"].includes(mapSize));
  assert.ok(mapSize === "expanded" || playerCount <= 4);
  const ids = Array.from({ length: playerCount }, () => randomUUID());
  const peers = new Map();
  for (const id of ids) peers.set(id, await connect(id));
  const host = peers.get(ids[0]);
  const created = waitFor(host, event => event.type === "room:joined");
  send(host, { type: "room:create", playerId: ids[0], token: "a".repeat(64), nickname: "Ana", avatar: "fox" });
  const code = (await created).room.code;
  if (mapSize === "expanded") {
    const changedMap = waitFor(host, event => event.type === "room:state" && event.room.mapSize === "expanded");
    send(host, { type: "room:settings", victoryTarget: 10, mapSize: "expanded" });
    await changedMap;
  }
  for (let index = 1; index < ids.length; index++) {
    const socket = peers.get(ids[index]);
    const joined = waitFor(socket, event => event.type === "room:joined");
    send(socket, { type: "room:join", code, playerId: ids[index], token: String(index + 1).repeat(64), nickname: `Amigo ${index}`, avatar: "owl" });
    await joined;
  }
  for (const id of ids) {
    const socket = peers.get(id);
    const ready = waitFor(socket, event => event.type === "room:state" && event.room.players.find(player => player.id === id)?.ready);
    send(socket, { type: "player:ready", ready: true });
    await ready;
  }
  const started = waitFor(host, event => event.type === "game:state");
  send(host, { type: "game:start" });
  let game = (await started).game;
  assert.equal(game.phase, "choose_first_player");
  assert.equal(Object.keys(game.board.hexes).length, mapSize === "expanded" ? 30 : 19);
  for (let roll = 0; roll < 60 && game.phase === "choose_first_player"; roll++) {
    const actor = game.currentPlayerId;
    const socket = peers.get(actor);
    const previousRoll = game.lastRoll?.id;
    const result = waitFor(socket, event => event.type === "game:state" && event.game.lastRoll?.id !== previousRoll);
    send(socket, { type: "game:command", action: { type: "start:roll", throw: { x: .8, y: .2, vx: -1, vy: .5 } } });
    game = (await result).game;
    assert.deepEqual(game.lastRoll.throw, { x: .8, y: .2, vx: -1, vy: .5 });
  }
  assert.equal(game.phase, "setup_settlement");
  for (let step = 0; step < ids.length * 2; step++) {
    const actor = game.currentPlayerId;
    const socket = peers.get(actor);
    const personal = await currentProjection(actor, "setup_settlement");
    const vertexId = personal.legal.vertices[0];
    assert.ok(vertexId);
    const settlement = waitFor(socket, event => event.type === "game:state" && event.game.phase === "setup_road");
    send(socket, { type: "game:command", action: { type: "setup:settlement", vertexId } });
    game = (await settlement).game;
    const edgeId = game.legal.edges[0];
    assert.ok(edgeId);
    const road = waitFor(socket, event => event.type === "game:state" && event.game.phase !== "setup_road");
    send(socket, { type: "game:command", action: { type: "setup:road", edgeId } });
    game = (await road).game;
  }
  assert.equal(game.phase, "before_roll");
  assert.equal(Object.keys(game.structures).length, ids.length * 2);
  assert.equal(Object.keys(game.roads).length, ids.length * 2);
  const first = peers.get(game.currentPlayerId);
  const rolled = waitFor(first, event => event.type === "game:state" && event.game.dice);
  send(first, { type: "game:command", action: { type: "turn:roll", throw: { x: .3, y: .7, vx: .8, vy: -.4 } } });
  const result = (await rolled).game;
  assert.deepEqual(result.lastRoll.throw, { x: .3, y: .7, vx: .8, vy: -.4 });
  assert.equal(result.dice.length, 2);
  assert.equal(JSON.stringify(result).includes("devDeck"), false);
  const restarted = waitFor(host, event => event.type === "game:state" && event.game.phase === "choose_first_player" && event.game.lastRoll === null);
  send(host, { type: "game:restart" });
  const newGame = (await restarted).game;
  assert.equal(Object.keys(newGame.structures).length, 0);
  assert.equal(newGame.board.seed, result.board.seed);
  assert.deepEqual(newGame.seatOrder, result.seatOrder);
  console.log(`Partida local OK. Sala ${code}: ${playerCount} jogadores, construção, dados e reinício sincronizados.`);
} finally {
  for (const socket of sockets) socket.close();
}
