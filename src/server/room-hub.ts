import { createHash, randomInt, randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { commandSchema, type Avatar, type Color, type Command, type MapSize, type PublicPlayer, type RoomSnapshot, type ServerEvent } from "@/lib/protocol";
import { applyGameAction, createGame, projectGame } from "@/game-engine/game";
import type { GameState } from "@/game-engine/types";
import type { GameRules, MapDraft, RandomMapOptions } from "@/game-engine/types";
import { applyMapDraft, baseBoard, CLASSIC_RULES, defaultRandomOptions, mapIssues, type MapGeneration } from "@/game-engine/configuration";

type Socket = Pick<WebSocket, "send" | "readyState" | "close">;
type Player = Omit<PublicPlayer, "host" | "connected"> & {
  tokenHash: string;
  sockets: Set<Socket>;
  seen: Set<string>;
  lastChatAt: number;
  lastReactionAt: number;
};
type Room = {
  code: string;
  hostPlayerId: string;
  players: Map<string, Player>;
  version: number;
  createdAt: number;
  lastActivityAt: number;
  game: GameState | null;
  victoryTarget: number;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  mapSeed: string;
  mapSize: MapSize;
  mapGeneration: MapGeneration;
  mapDraft: MapDraft | null;
  randomOptions: RandomMapOptions;
  rules: GameRules;
  bannedPlayerIds: Set<string>;
};

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomTtlMs = 2 * 60 * 60 * 1000;
const colors: Color[] = ["coral", "amber", "teal", "violet", "blue", "rose"];

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function code() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function send(socket: Socket, event: ServerEvent) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(event));
  }
}

export class RoomHub {
  private rooms = new Map<string, Room>();
  private connections = new Map<Socket, { room: Room; player: Player }>();

  roomCount() { return this.rooms.size; }

  prune(now = Date.now()) {
    for (const [key, room] of this.rooms) {
      if (now - room.lastActivityAt > roomTtlMs) {
        for (const player of room.players.values()) for (const socket of player.sockets) {
          this.connections.delete(socket);
          socket.close(1012, "Sala expirada");
        }
        this.rooms.delete(key);
      }
    }
  }

  receive(socket: Socket, raw: unknown) {
    if (typeof raw !== "string" || raw.length > 8192) {
      send(socket, { type: "room:error", message: "Mensagem inválida ou muito longa." });
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      send(socket, { type: "room:error", message: "JSON inválido." });
      return;
    }
    const result = commandSchema.safeParse(parsed);
    if (!result.success) {
      send(socket, { type: "room:error", message: "Comando inválido." });
      return;
    }
    this.handle(socket, result.data);
  }

  handle(socket: Socket, command: Command) {
    this.prune();
    if (command.type === "room:create") { this.create(socket, command); return; }
    if (command.type === "room:join") { this.join(socket, command); return; }

    const connection = this.connections.get(socket);
    if (!connection) {
      send(socket, { type: "room:error", commandId: command.commandId, message: "Entre em uma sala antes de enviar comandos." });
      return;
    }
    const { room, player } = connection;
    room.lastActivityAt = Date.now();
    if (player.seen.has(command.commandId)) {
      send(socket, { type: "room:state", room: this.snapshot(room) });
      return;
    }
    player.seen.add(command.commandId);
    if (player.seen.size > 200) player.seen.delete(player.seen.values().next().value!);

    switch (command.type) {
      case "connection:heartbeat":
        send(socket, { type: "connection:pong", at: Date.now() });
        break;
      case "player:ready":
        if (room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida já começou." }); return; }
        player.ready = command.ready;
        this.changed(room);
        break;
      case "player:profile":
        if (room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida já começou." }); return; }
        player.nickname = command.nickname;
        player.avatar = command.avatar;
        player.ready = false;
        this.changed(room);
        break;
      case "player:color":
        if (room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida já começou." }); return; }
        if ([...room.players.values()].some(p => p !== player && p.color === command.color)) {
          send(socket, { type: "room:error", commandId: command.commandId, message: "Essa cor já está em uso." });
          return;
        }
        player.color = command.color;
        player.ready = false;
        this.changed(room);
        break;
      case "chat:message":
        if (!room.chatEnabled) { send(socket, { type: "room:error", commandId: command.commandId, message: "Chat desativado nesta sala." }); return; }
        if (Date.now() - player.lastChatAt < 800) return;
        player.lastChatAt = Date.now();
        this.broadcast(room, { type: "chat:message", id: command.commandId, playerId: player.id, nickname: player.nickname, text: command.text, at: Date.now() });
        break;
      case "reaction:send":
        if (!room.reactionsEnabled) { send(socket, { type: "room:error", commandId: command.commandId, message: "Reações desativadas nesta sala." }); return; }
        if (Date.now() - player.lastReactionAt < 700) return;
        player.lastReactionAt = Date.now();
        this.broadcast(room, { type: "reaction:send", id: command.commandId, playerId: player.id, reaction: command.reaction, at: Date.now() });
        break;
      case "room:leave":
        if (room.game) {
          this.connections.delete(socket);
          player.sockets.delete(socket);
          socket.close(1000, "Saiu da partida");
          this.changed(room);
          return;
        }
        for (const peer of player.sockets) {
          this.connections.delete(peer);
          if (peer !== socket) peer.close(1000, "Saiu da sala");
        }
        room.players.delete(player.id);
        if (room.players.size === 0) { this.rooms.delete(room.code); return; }
        if (room.hostPlayerId === player.id) room.hostPlayerId = room.players.keys().next().value!;
        this.changed(room);
        break;
      case "game:start":
        if (room.hostPlayerId !== player.id) { send(socket, { type: "room:error", commandId: command.commandId, message: "Apenas o anfitrião pode iniciar." }); return; }
        if (room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida já começou." }); return; }
        if (room.players.size < 3 || room.players.size > (room.mapSize === "expanded" ? 6 : 4) || [...room.players.values()].some(p => !p.ready || !p.sockets.size)) {
          send(socket, { type: "room:error", commandId: command.commandId, message: room.mapSize === "expanded" ? "O mapa ampliado exige de três a seis jogadores conectados e prontos." : "O mapa para 1–4 exige três ou quatro jogadores conectados e prontos." });
          return;
        }
        room.game = createGame([...room.players.keys()], room.mapSeed, room.victoryTarget, randomInt, room.mapSize, this.preview(room), room.rules);
        this.changed(room);
        this.broadcastGame(room);
        break;
      case "game:restart":
        if (room.hostPlayerId !== player.id || !room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "Apenas o anfitrião pode reiniciar uma partida em andamento." }); return; }
        if (room.players.size < 3 || room.players.size > 6 || [...room.players.values()].some(p => !p.sockets.size)) {
          send(socket, { type: "room:error", commandId: command.commandId, message: "Todos os jogadores precisam estar conectados para reiniciar." });
          return;
        }
        room.game = createGame([...room.players.keys()], room.game.board.seed, room.victoryTarget, randomInt, room.mapSize, this.preview(room), room.rules);
        this.changed(room);
        this.broadcastGame(room);
        break;
      case "game:rematch":
        if (room.hostPlayerId !== player.id || room.game?.phase !== "finished") { send(socket, { type: "room:error", commandId: command.commandId, message: "Apenas o anfitrião pode abrir uma revanche após o fim." }); return; }
        room.game = null;
        for (const participant of room.players.values()) participant.ready = false;
        this.changed(room);
        break;
      case "room:settings":
        if (room.hostPlayerId !== player.id || room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "Configuração indisponível." }); return; }
        if (command.mapSize === "standard" && room.players.size > 4) { send(socket, { type: "room:error", commandId: command.commandId, message: "Há mais de quatro pessoas na sala. Mantenha o mapa para 5–6." }); return; }
        {
          const size = command.mapSize ?? room.mapSize;
          const sizeChanged = size !== room.mapSize;
          const generation = command.mapGeneration ?? (size !== room.mapSize ? "classic" : room.mapGeneration);
          const draft = command.mapDraft ?? (size !== room.mapSize ? null : room.mapDraft);
          const randomOptions = command.randomOptions ?? (sizeChanged ? defaultRandomOptions(size) : room.randomOptions);
          if (generation === "manual" && !draft) { send(socket, { type: "room:error", commandId: command.commandId, message: "Edite e valide o mapa antes de aplicá-lo." }); return; }
          if (generation === "manual" && draft) {
            const issues = mapIssues(size, draft);
            if (issues.errors.length) { send(socket, { type: "room:error", commandId: command.commandId, message: issues.errors.join(" ") }); return; }
          }
          room.mapSize = size;
          room.mapGeneration = generation;
          room.mapDraft = generation === "manual" ? draft : null;
          room.randomOptions = randomOptions;
        }
        room.victoryTarget = command.victoryTarget;
        if (command.mapSeed !== undefined) room.mapSeed = command.mapSeed;
        if (command.rules !== undefined) room.rules = command.rules;
        if (command.chatEnabled !== undefined) room.chatEnabled = command.chatEnabled;
        for (const participant of room.players.values()) participant.ready = false;
        this.changed(room);
        break;
      case "room:remove": {
        if (room.game || room.hostPlayerId !== player.id || command.playerId === player.id) { send(socket, { type: "room:error", commandId: command.commandId, message: "Remoção indisponível." }); return; }
        const target = room.players.get(command.playerId);
        if (!target) { send(socket, { type: "room:error", commandId: command.commandId, message: "Jogador não encontrado." }); return; }
        for (const peer of target.sockets) {
          send(peer, { type: "room:removed", code: room.code });
          this.connections.delete(peer);
          peer.close(1000, "Removido da sala");
        }
        room.players.delete(target.id);
        room.bannedPlayerIds.add(target.id);
        this.changed(room);
        break;
      }
      case "room:transferHost":
        if (room.game || room.hostPlayerId !== player.id || !room.players.has(command.playerId) || command.playerId === player.id) { send(socket, { type: "room:error", commandId: command.commandId, message: "Transferência indisponível." }); return; }
        room.hostPlayerId = command.playerId;
        this.changed(room);
        break;
      case "game:command":
        if (!room.game) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida ainda não começou." }); return; }
        try {
          room.game = applyGameAction(room.game, player.id, command.action);
          this.changed(room);
          this.broadcastGame(room);
        } catch (error) {
          send(socket, { type: "room:error", commandId: command.commandId, message: error instanceof Error ? error.message : "Ação inválida." });
        }
        break;
    }
  }

  disconnect(socket: Socket) {
    const connection = this.connections.get(socket);
    if (!connection) return;
    this.connections.delete(socket);
    connection.player.sockets.delete(socket);
    connection.room.lastActivityAt = Date.now();
    this.changed(connection.room);
  }

  private create(socket: Socket, command: Extract<Command, { type: "room:create" }>) {
    if (this.connections.has(socket)) {
      send(socket, { type: "room:error", commandId: command.commandId, message: "Você já está em uma sala." });
      return;
    }
    let roomCode = code();
    while (this.rooms.has(roomCode)) roomCode = code();
    const now = Date.now();
    const room: Room = { code: roomCode, hostPlayerId: command.playerId, players: new Map(), version: 1, createdAt: now, lastActivityAt: now, game: null, victoryTarget: 10, chatEnabled: true, reactionsEnabled: true, mapSeed: randomUUID(), mapSize: "standard", mapGeneration: "classic", mapDraft: null, randomOptions: defaultRandomOptions("standard"), rules: { ...CLASSIC_RULES }, bannedPlayerIds: new Set() };
    this.rooms.set(roomCode, room);
    this.attach(socket, room, command);
  }

  private join(socket: Socket, command: Extract<Command, { type: "room:join" }>) {
    if (this.connections.has(socket)) {
      send(socket, { type: "room:error", commandId: command.commandId, message: "Você já está em uma sala." });
      return;
    }
    const room = this.rooms.get(command.code);
    if (!room) {
      send(socket, { type: "room:unavailable", commandId: command.commandId, code: command.code, reason: "not_found_on_instance" });
      return;
    }
    if (room.bannedPlayerIds.has(command.playerId)) { send(socket, { type: "room:removed", code: room.code }); return; }
    const existing = room.players.get(command.playerId);
    if (room.game && !existing) { send(socket, { type: "room:error", commandId: command.commandId, message: "A partida já começou." }); return; }
    if (existing && existing.tokenHash !== hash(command.token)) {
      send(socket, { type: "room:error", commandId: command.commandId, message: "Credencial de recuperação inválida." });
      return;
    }
    if (!existing && room.players.size >= (room.mapSize === "expanded" ? 6 : 4)) {
      send(socket, { type: "room:error", commandId: command.commandId, message: "A sala está cheia." });
      return;
    }
    this.attach(socket, room, command);
  }

  private attach(socket: Socket, room: Room, command: Extract<Command, { type: "room:create" | "room:join" }>) {
    let player = room.players.get(command.playerId);
    if (!player) {
      const used = new Set([...room.players.values()].map(p => p.color));
      player = {
        id: command.playerId, tokenHash: hash(command.token), nickname: command.nickname,
        avatar: command.avatar as Avatar, color: colors.find(c => !used.has(c))!,
        ready: false, sockets: new Set(), seen: new Set(), lastChatAt: 0, lastReactionAt: 0,
      };
      room.players.set(player.id, player);
    }
    player.sockets.add(socket);
    this.connections.set(socket, { room, player });
    room.lastActivityAt = Date.now();
    room.version++;
    send(socket, { type: "room:joined", commandId: command.commandId, room: this.snapshot(room), playerId: player.id });
    if (room.game) send(socket, { type: "game:state", game: projectGame(room.game, player.id) });
    this.broadcast(room, { type: "room:state", room: this.snapshot(room) });
  }

  private snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code, version: room.version, status: room.game ? room.game.phase === "finished" ? "finished" : "playing" : "lobby", capacity: room.mapSize === "expanded" ? 6 : 4, createdAt: room.createdAt, victoryTarget: room.victoryTarget, chatEnabled: room.chatEnabled, reactionsEnabled: room.reactionsEnabled, mapSeed: room.mapSeed, mapSize: room.mapSize, mapGeneration: room.mapGeneration, mapDraft: room.mapDraft, randomOptions: room.randomOptions, boardPreview: this.preview(room), rules: room.rules,
      players: [...room.players.values()].map(p => ({
        id: p.id, nickname: p.nickname, avatar: p.avatar, color: p.color,
        connected: p.sockets.size > 0, ready: p.ready, host: p.id === room.hostPlayerId,
      })),
    };
  }

  private preview(room: Room) {
    return room.mapGeneration === "manual" && room.mapDraft
      ? applyMapDraft(room.mapSize, room.mapDraft, room.mapSeed)
      : baseBoard(room.mapSize, room.mapGeneration, room.mapSeed, room.randomOptions);
  }

  private changed(room: Room) {
    room.version++;
    this.broadcast(room, { type: "room:state", room: this.snapshot(room) });
  }

  private broadcast(room: Room, event: ServerEvent) {
    for (const player of room.players.values()) for (const socket of player.sockets) send(socket, event);
  }

  private broadcastGame(room: Room) {
    if (!room.game) return;
    for (const player of room.players.values()) {
      const projection = projectGame(room.game, player.id);
      for (const socket of player.sockets) send(socket, { type: "game:state", game: projection });
    }
  }
}

const globalHub = globalThis as typeof globalThis & { __ilhasHub?: RoomHub };
export const roomHub = globalHub.__ilhasHub ?? (globalHub.__ilhasHub = new RoomHub());
