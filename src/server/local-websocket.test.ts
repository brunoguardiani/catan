import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { RoomHub } from "./room-hub";
import type { ServerEvent } from "@/lib/protocol";

function awaitEvent(socket: WebSocket, matches: (event: ServerEvent) => boolean) {
  return new Promise<ServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); reject(new Error("Tempo esgotado aguardando evento WebSocket")); }, 2000);
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as ServerEvent;
      if (!matches(event)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(event);
    };
    socket.on("message", onMessage);
  });
}

const uuid = () => crypto.randomUUID();
const token = (digit: string) => digit.repeat(64);

describe("WebSocket local, com duas conexões reais", () => {
  it("sincroniza lobby e chat, e recupera o assento após desconexão", async () => {
    const hub = new RoomHub();
    const server = createServer();
    const wss = new WebSocketServer({ server });
    wss.on("connection", socket => {
      socket.on("message", data => hub.receive(socket, data.toString()));
      socket.on("close", () => hub.disconnect(socket));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Porta local indisponível");
    const url = `ws://127.0.0.1:${address.port}`;
    const sockets: WebSocket[] = [];
    const connect = async () => {
      const socket = new WebSocket(url);
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
      return socket;
    };
    const send = (socket: WebSocket, data: Record<string, unknown>) => socket.send(JSON.stringify({ commandId: uuid(), ...data }));

    try {
      const hostId = uuid();
      const guestId = uuid();
      const host = await connect();
      const created = awaitEvent(host, event => event.type === "room:joined");
      send(host, { type: "room:create", playerId: hostId, token: token("a"), nickname: "Ana", avatar: "fox" });
      const roomCode = (await created as Extract<ServerEvent, { type: "room:joined" }>).room.code;

      const guest = await connect();
      const hostSeesGuest = awaitEvent(host, event => event.type === "room:state" && event.room.players.length === 2);
      const guestJoined = awaitEvent(guest, event => event.type === "room:joined");
      send(guest, { type: "room:join", code: roomCode, playerId: guestId, token: token("b"), nickname: "Bia", avatar: "owl" });
      await guestJoined;
      expect((await hostSeesGuest as Extract<ServerEvent, { type: "room:state" }>).room.players).toHaveLength(2);

      const guestSeesReady = awaitEvent(guest, event => event.type === "room:state" && event.room.players[0]?.ready === true);
      send(host, { type: "player:ready", ready: true });
      expect((await guestSeesReady as Extract<ServerEvent, { type: "room:state" }>).room.players[0].ready).toBe(true);

      const guestSeesChat = awaitEvent(guest, event => event.type === "chat:message");
      send(host, { type: "chat:message", text: "Vamos jogar!" });
      expect(await guestSeesChat).toMatchObject({ type: "chat:message", text: "Vamos jogar!", playerId: hostId });

      const hostOffline = awaitEvent(guest, event => event.type === "room:state" && event.room.players[0]?.connected === false);
      host.close();
      await hostOffline;
      const recovered = await connect();
      const recoveredJoined = awaitEvent(recovered, event => event.type === "room:joined");
      send(recovered, { type: "room:join", code: roomCode, playerId: hostId, token: token("a"), nickname: "Ana", avatar: "fox" });
      const state = (await recoveredJoined as Extract<ServerEvent, { type: "room:joined" }>).room;
      expect(state.players).toHaveLength(2);
      expect(state.players[0]).toMatchObject({ id: hostId, connected: true, ready: true });
      expect(JSON.stringify(state)).not.toContain(token("a"));
    } finally {
      for (const socket of sockets) socket.terminate();
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
