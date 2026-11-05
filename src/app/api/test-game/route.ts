import { randomUUID } from "node:crypto";
import { projectGame } from "@/game-engine/game";
import { applyTestCommand, createTestGame, TEST_PLAYERS, type TestCommand } from "@/game-engine/test-mode";
import type { GameState } from "@/game-engine/types";
import type { RoomSnapshot } from "@/lib/protocol";
import { CLASSIC_RULES, defaultRandomOptions } from "@/game-engine/configuration";

export const runtime = "nodejs";

const sessions = new Map<string, { game: GameState; createdAt: number }>();

function room(game: GameState, createdAt: number): RoomSnapshot {
  return {
    code: "TESTE", version: game.events.length, status: game.phase === "finished" ? "finished" : "playing",
    capacity: 2, createdAt, victoryTarget: game.victoryTarget, chatEnabled: false,
    reactionsEnabled: true, mapSeed: "modo-teste", mapSize: "standard", mapGeneration: "classic", mapDraft: null, randomOptions: defaultRandomOptions("standard"), boardPreview: game.board, rules: { ...CLASSIC_RULES },
    players: [
      { id: TEST_PLAYERS[0], nickname: "Jogador A", avatar: "fox", color: "coral", connected: true, ready: true, host: true },
      { id: TEST_PLAYERS[1], nickname: "Jogador B", avatar: "owl", color: "teal", connected: true, ready: true, host: false },
    ],
  };
}

export async function POST(request: Request) {
  if ((process.env.NODE_ENV !== "development" && process.env.ENABLE_TEST_MODE !== "1") || !["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)) return new Response(null, { status: 404 });
  try {
    const input = await request.json() as { sessionId?: string; viewerId?: string; command?: TestCommand | { type: "reset" } };
    const viewerId = input.viewerId;
    if (!viewerId || !TEST_PLAYERS.includes(viewerId as typeof TEST_PLAYERS[number])) throw new Error("Escolha um jogador para visualizar a mesa.");
    if (input.command?.type === "reset" || !input.sessionId) {
      const sessionId = input.sessionId && sessions.has(input.sessionId) ? input.sessionId : randomUUID();
      const entry = { game: createTestGame(), createdAt: Date.now() };
      sessions.set(sessionId, entry);
      return Response.json({ sessionId, viewerId, room: room(entry.game, entry.createdAt), game: projectGame(entry.game, viewerId) });
    }
    const entry = sessions.get(input.sessionId);
    if (!entry) throw new Error("Sessão de teste expirada. Reinicie o modo de teste.");
    if (input.command) entry.game = applyTestCommand(entry.game, input.command);
    return Response.json({ sessionId: input.sessionId, viewerId, room: room(entry.game, entry.createdAt), game: projectGame(entry.game, viewerId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ação de teste inválida." }, { status: 400 });
  }
}
