import { describe, expect, it } from "vitest";
import { RoomHub } from "./room-hub";
import type { ServerEvent } from "@/lib/protocol";
import { boardToDraft, CLASSIC_RULES } from "@/game-engine/configuration";

function peer() {
  const events: ServerEvent[] = [];
  return {
    readyState: 1 as 0 | 1 | 2 | 3,
    send(data: string) { events.push(JSON.parse(data) as ServerEvent); },
    close() { this.readyState = 3; },
    events,
  };
}
const uuid = () => crypto.randomUUID();
const token = (digit: string) => digit.repeat(64);
const create = (playerId: string, secret: string) => ({ type: "room:create" as const, commandId: uuid(), playerId, token: secret, nickname: "Ana", avatar: "fox" as const });
const join = (code: string, playerId: string, secret: string) => ({ type: "room:join" as const, commandId: uuid(), code, playerId, token: secret, nickname: "Bia", avatar: "owl" as const });

describe("RoomHub", () => {
  it("rejeita ladrão fora do deserto e preserva a configuração da sala", () => {
    const hub = new RoomHub();
    const host = peer();
    hub.handle(host, create(uuid(), token("a")));
    const initial = (host.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room;
    const draft = boardToDraft(initial.boardPreview);
    draft.robberHex = draft.tiles.find(tile => tile.terrain !== "desert")!.id;
    hub.handle(host, { type: "room:settings", commandId: uuid(), victoryTarget: 10, mapGeneration: "manual", mapDraft: draft });
    expect(host.events.at(-1)?.type).toBe("room:error");
    const current = (host.events.findLast(event => event.type === "room:state") as Extract<ServerEvent, { type: "room:state" }>).room;
    expect(current.mapGeneration).toBe("classic");
    expect(current.version).toBe(initial.version);
  });
  it("sincroniza o mapa manual e congela as regras ao iniciar", () => {
    const hub = new RoomHub();
    const seats = Array.from({ length: 3 }, (_, index) => ({ socket: peer(), id: uuid(), secret: token(String(index + 1)) }));
    hub.handle(seats[0].socket, create(seats[0].id, seats[0].secret));
    const initial = (seats[0].socket.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room;
    for (const seat of seats.slice(1)) hub.handle(seat.socket, join(initial.code, seat.id, seat.secret));
    const draft = boardToDraft(initial.boardPreview);
    const rules = { ...CLASSIC_RULES, adjacentRobber: true, roadsThroughOpponents: true };
    hub.handle(seats[1].socket, { type: "room:settings", commandId: uuid(), victoryTarget: 12, mapGeneration: "manual", mapDraft: draft, rules });
    expect(seats[1].socket.events.at(-1)?.type).toBe("room:error");
    hub.handle(seats[0].socket, { type: "room:settings", commandId: uuid(), victoryTarget: 12, mapGeneration: "manual", mapDraft: draft, rules });
    const room = (seats[1].socket.events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room;
    expect(room.version).toBeGreaterThan(initial.version);
    expect(room.mapGeneration).toBe("manual");
    expect(room.rules).toEqual(rules);
    for (const seat of seats) hub.handle(seat.socket, { type: "player:ready", commandId: uuid(), ready: true });
    hub.handle(seats[0].socket, { type: "game:start", commandId: uuid() });
    const game = (seats[1].socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>).game;
    expect(game.board).toEqual(room.boardPreview);
    expect(game.rules).toEqual(rules);
    expect(game.victoryTarget).toBe(12);
    hub.handle(seats[0].socket, { type: "room:settings", commandId: uuid(), victoryTarget: 10 });
    expect(seats[0].socket.events.at(-1)?.type).toBe("room:error");
  });
  it("creates a room and synchronizes a second player on the same instance", () => {
    const hub = new RoomHub();
    const host = peer();
    hub.handle(host, create(uuid(), token("a")));
    const room = (host.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room;
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const guest = peer();
    hub.handle(guest, join(room.code, uuid(), token("b")));
    expect((host.events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room.players).toHaveLength(2);
    expect((guest.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.players).toHaveLength(2);
  });

  it("rejects an incorrect recovery token and preserves a disconnected seat", () => {
    const hub = new RoomHub();
    const first = peer();
    const playerId = uuid();
    hub.handle(first, create(playerId, token("a")));
    const room = (first.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room;
    hub.disconnect(first);
    const attacker = peer();
    hub.handle(attacker, join(room.code, playerId, token("b")));
    expect(attacker.events[0].type).toBe("room:error");
    const recovered = peer();
    hub.handle(recovered, join(room.code, playerId, token("a")));
    const state = (recovered.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room;
    expect(state.players).toHaveLength(1);
    expect(state.players[0].connected).toBe(true);
  });

  it("reports missing rooms instead of pretending to synchronize instances", () => {
    const hostHub = new RoomHub();
    const host = peer();
    hostHub.handle(host, create(uuid(), token("a")));
    const code = (host.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    const otherHub = new RoomHub();
    const guest = peer();
    otherHub.handle(guest, join(code, uuid(), token("b")));
    expect(guest.events[0]).toMatchObject({ type: "room:unavailable", reason: "not_found_on_instance" });
  });

  it("applies an idempotent ready command once", () => {
    const hub = new RoomHub();
    const host = peer();
    hub.handle(host, create(uuid(), token("a")));
    const commandId = uuid();
    hub.handle(host, { type: "player:ready", commandId, ready: true });
    const version = (host.events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room.version;
    hub.handle(host, { type: "player:ready", commandId, ready: false });
    const state = (host.events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room;
    expect(state.version).toBe(version);
    expect(state.players[0].ready).toBe(true);
  });

  it("limits the room to six playable seats and transfers host when the host leaves", () => {
    const hub = new RoomHub();
    const host = peer();
    hub.handle(host, create(uuid(), token("a")));
    const code = (host.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    expect((host.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.capacity).toBe(4);
    hub.handle(host, { type: "room:settings", commandId: uuid(), victoryTarget: 10, mapSize: "expanded" });
    expect((host.events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room.capacity).toBe(6);
    const guests = Array.from({ length: 5 }, (_, index) => {
      const socket = peer();
      hub.handle(socket, join(code, uuid(), token(String(index + 1))));
      return socket;
    });
    const extra = peer();
    hub.handle(extra, join(code, uuid(), token("f")));
    expect(extra.events[0]).toMatchObject({ type: "room:error", message: "A sala está cheia." });
    const transferred = (guests[0].events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room;
    expect(transferred.players).toHaveLength(6);
    hub.handle(host, { type: "room:settings", commandId: uuid(), victoryTarget: 10, mapSize: "standard" });
    expect(host.events.at(-1)).toMatchObject({ type: "room:error" });
    hub.handle(host, { type: "room:leave", commandId: uuid() });
    const state = (guests[0].events.at(-1) as Extract<ServerEvent, { type: "room:state" }>).room;
    expect(state.players).toHaveLength(5);
    expect(state.players[0].host).toBe(true);
  });

  it("starts and restarts a six-player game with the expanded board", () => {
    const hub = new RoomHub();
    const seats = Array.from({ length: 6 }, (_, index) => ({ socket: peer(), id: uuid(), secret: token(String(index + 1)) }));
    hub.handle(seats[0].socket, create(seats[0].id, seats[0].secret));
    const code = (seats[0].socket.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    hub.handle(seats[0].socket, { type: "room:settings", commandId: uuid(), victoryTarget: 10, mapSize: "expanded" });
    for (const seat of seats.slice(1)) hub.handle(seat.socket, join(code, seat.id, seat.secret));
    for (const seat of seats) hub.handle(seat.socket, { type: "player:ready", commandId: uuid(), ready: true });
    hub.handle(seats[0].socket, { type: "game:start", commandId: uuid() });
    const started = seats.map(seat => seat.socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>);
    expect(started.every(event => event.game.seatOrder.length === 6)).toBe(true);
    expect(Object.keys(started[0].game.board.hexes)).toHaveLength(30);
    hub.handle(seats[0].socket, { type: "game:restart", commandId: uuid() });
    const restarted = seats[0].socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>;
    expect(restarted.game.seatOrder).toEqual(started[0].game.seatOrder);
    expect(Object.keys(restarted.game.board.hexes)).toHaveLength(30);
  });

  it("starts the expanded board with three ready players", () => {
    const hub = new RoomHub();
    const seats = Array.from({ length: 3 }, (_, index) => ({ socket: peer(), id: uuid(), secret: token(String(index + 1)) }));
    hub.handle(seats[0].socket, create(seats[0].id, seats[0].secret));
    const code = (seats[0].socket.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    hub.handle(seats[0].socket, { type: "room:settings", commandId: uuid(), victoryTarget: 10, mapSize: "expanded" });
    for (const seat of seats.slice(1)) hub.handle(seat.socket, join(code, seat.id, seat.secret));
    for (const seat of seats) hub.handle(seat.socket, { type: "player:ready", commandId: uuid(), ready: true });
    hub.handle(seats[0].socket, { type: "game:start", commandId: uuid() });
    const started = seats[0].socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>;
    expect(started.game.seatOrder).toHaveLength(3);
    expect(Object.keys(started.game.board.hexes)).toHaveLength(30);
    hub.handle(seats[0].socket, { type: "game:restart", commandId: uuid() });
    const restarted = seats[0].socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>;
    expect(Object.keys(restarted.game.board.hexes)).toHaveLength(30);
  });

  it("starts a three-player game and sends only each player's private projection", () => {
    const hub = new RoomHub();
    const seats = Array.from({ length: 3 }, (_, index) => ({ socket: peer(), id: uuid(), secret: token(String(index + 1)) }));
    hub.handle(seats[0].socket, create(seats[0].id, seats[0].secret));
    const code = (seats[0].socket.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    for (const seat of seats.slice(1)) hub.handle(seat.socket, join(code, seat.id, seat.secret));
    for (const seat of seats) hub.handle(seat.socket, { type: "player:ready", commandId: uuid(), ready: true });
    hub.handle(seats[0].socket, { type: "game:start", commandId: uuid() });
    let states = seats.map(seat => seat.socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>);
    expect(states.every(event => event.game.phase === "choose_first_player")).toBe(true);
    for (let roll = 0; roll < 40 && states[0].game.phase === "choose_first_player"; roll++) {
      const actor = seats.find(seat => seat.id === states[0].game.currentPlayerId)!;
      hub.handle(actor.socket, { type: "game:command", commandId: uuid(), action: { type: "start:roll" } });
      states = seats.map(seat => seat.socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>);
    }
    expect(states.every(event => event.game.phase === "setup_settlement")).toBe(true);
    expect(states[0].game.playerOrder).toHaveLength(3);
    for (let index = 0; index < 3; index++) {
      expect(states[index].game.myResources).toBeDefined();
      expect(JSON.stringify(states[index])).not.toContain("devDeck");
    }
    const currentId = states[0].game.currentPlayerId;
    const actor = seats.find(seat => seat.id === currentId)!;
    const vertexId = states[seats.indexOf(actor)].game.legal.vertices[0];
    hub.handle(actor.socket, { type: "game:command", commandId: uuid(), action: { type: "setup:settlement", vertexId } });
    const next = actor.socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>;
    expect(next.game.phase).toBe("setup_road");
    expect(next.game.structures[vertexId].owner).toBe(currentId);
  });

  it("permite reinício confirmado pelo anfitrião com os mesmos assentos e mapa", () => {
    const hub = new RoomHub();
    const seats = Array.from({ length: 3 }, (_, index) => ({ socket: peer(), id: uuid(), secret: token(String(index + 1)) }));
    hub.handle(seats[0].socket, create(seats[0].id, seats[0].secret));
    const code = (seats[0].socket.events[0] as Extract<ServerEvent, { type: "room:joined" }>).room.code;
    for (const seat of seats.slice(1)) hub.handle(seat.socket, join(code, seat.id, seat.secret));
    for (const seat of seats) hub.handle(seat.socket, { type: "player:ready", commandId: uuid(), ready: true });
    hub.handle(seats[0].socket, { type: "game:start", commandId: uuid() });
    const initial = seats[0].socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>;
    hub.handle(seats[1].socket, { type: "game:restart", commandId: uuid() });
    expect(seats[1].socket.events.at(-1)?.type).toBe("room:error");
    hub.handle(seats[0].socket, { type: "game:command", commandId: uuid(), action: { type: "start:roll" } });
    hub.handle(seats[0].socket, { type: "game:restart", commandId: uuid() });
    const restarted = seats.map(seat => seat.socket.events.findLast(event => event.type === "game:state") as Extract<ServerEvent, { type: "game:state" }>);
    expect(restarted.every(event => event.game.phase === "choose_first_player")).toBe(true);
    expect(restarted[0].game.seatOrder).toEqual(initial.game.seatOrder);
    expect(restarted[0].game.board.seed).toBe(initial.game.board.seed);
    expect(restarted[0].game.startingRoll.history).toEqual([]);
    expect(restarted[0].game.lastRoll).toBeNull();
  });
});
