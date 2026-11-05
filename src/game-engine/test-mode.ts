import { randomUUID } from "node:crypto";
import { applyGameAction, createGame } from "./game";
import { emptyBag, RESOURCES, type AwardKind, type DevCard, type GameAction, type GameEffect, type GameState, type Resource } from "./types";

export const TEST_PLAYERS = ["test-a", "test-b"] as const;
export type TestPlayerId = typeof TEST_PLAYERS[number];

export type TestCommand =
  | { type: "view" }
  | { type: "setTurn"; playerId: string }
  | { type: "cards"; playerId: string; resource: Resource; amount: number }
  | { type: "development"; playerId: string; card: DevCard }
  | { type: "steal"; from: string; to: string; resource: Resource; amount: number }
  | { type: "tradeAccepted"; from: string; to: string; give: Resource; want: Resource; amount: number }
  | { type: "premiumRefused"; from: string; to: string; resource: Resource; amount: number }
  | { type: "award"; award: AwardKind; to: string }
  | { type: "punch"; playerId: string }
  | { type: "dice"; playerId: string; dice: [number, number] }
  | { type: "forceDiscard"; playerId: string }
  | { type: "gameAction"; actor: string; action: GameAction };

function player(state: GameState, id: string) {
  if (!TEST_PLAYERS.includes(id as TestPlayerId) || !state.players[id]) throw new Error("Escolha um dos dois jogadores de teste.");
  return state.players[id];
}

function amount(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("Use uma quantidade de 1 a 100 cartas por ação.");
  return value;
}

function resource(value: Resource) {
  if (!RESOURCES.includes(value)) throw new Error("Recurso inválido.");
  return value;
}

function event(state: GameState, text: string, effect: GameEffect) {
  state.events.push({ id: randomUUID(), text, at: Date.now(), effect });
  if (state.events.length > 100) state.events.shift();
}

export function createTestGame(): GameState {
  const state = createGame([...TEST_PLAYERS, "test-seed"], "modo-teste", 10);
  delete state.players["test-seed"];
  state.playerOrder = [...TEST_PLAYERS];
  state.seatOrder = [...TEST_PLAYERS];
  state.phase = "actions";
  state.currentPlayerId = TEST_PLAYERS[0];
  state.mainPlayerId = TEST_PLAYERS[0];
  state.turn = 1;
  state.startingRoll = { contenders: [...TEST_PLAYERS], rolls: {}, round: 1, history: [] };
  const robberVertices = state.board.hexes[state.board.robberHex].vertices;
  state.structures[robberVertices[0]] = { owner: TEST_PLAYERS[0], kind: "settlement" };
  state.structures[robberVertices[3]] = { owner: TEST_PLAYERS[1], kind: "settlement" };
  return state;
}

export function applyTestCommand(source: GameState, command: TestCommand): GameState {
  if (command.type === "gameAction") {
    player(source, command.actor);
    return applyGameAction(source, command.actor, command.action);
  }
  const state = structuredClone(source);
  switch (command.type) {
    case "view": break;
    case "setTurn": {
      player(state, command.playerId);
      state.currentPlayerId = command.playerId;
      state.mainPlayerId = command.playerId;
      state.phase = "actions";
      state.pendingTrade = null;
      state.counterOffers = [];
      state.tradeDeclines = [];
      state.tradeBlocks = [];
      state.turn++;
      break;
    }
    case "cards": {
      const hand = player(state, command.playerId).resources;
      const kind = resource(command.resource);
      if (!Number.isInteger(command.amount) || command.amount === 0 || Math.abs(command.amount) > 100) throw new Error("Use de 1 a 100 cartas por ação.");
      if (hand[kind] + command.amount < 0) throw new Error("O jogador não possui essa quantidade de cartas.");
      hand[kind] += command.amount;
      break;
    }
    case "development": {
      player(state, command.playerId);
      if (!["knight", "road_building", "year_plenty", "monopoly", "victory"].includes(command.card)) throw new Error("Carta de desenvolvimento inválida.");
      state.players[command.playerId].dev.push({ id: randomUUID(), kind: command.card, boughtTurn: state.turn - 1 });
      break;
    }
    case "steal": {
      const from = player(state, command.from), to = player(state, command.to);
      const kind = resource(command.resource), count = amount(command.amount);
      if (from.id === to.id) throw new Error("Escolha jogadores diferentes.");
      if (from.resources[kind] < count) throw new Error("O jogador não tem cartas suficientes para o roubo.");
      from.resources[kind] -= count;
      to.resources[kind] += count;
      event(state, "Recurso roubado no modo de teste.", { kind: "cue", cue: "steal", playerId: to.id });
      break;
    }
    case "tradeAccepted": {
      const from = player(state, command.from), to = player(state, command.to);
      const give = resource(command.give), want = resource(command.want), count = amount(command.amount);
      if (from.id === to.id || give === want) throw new Error("Escolha jogadores e recursos diferentes.");
      if (from.resources[give] < count || to.resources[want] < count) throw new Error("Adicione as cartas aos dois jogadores antes de testar a troca.");
      from.resources[give] -= count; to.resources[give] += count;
      to.resources[want] -= count; from.resources[want] += count;
      event(state, "Troca aceita no modo de teste.", { kind: "trade_accepted", from: from.id, to: to.id, give: { ...emptyBag(), [give]: count }, want: { ...emptyBag(), [want]: count } });
      break;
    }
    case "premiumRefused": {
      const from = player(state, command.from), to = player(state, command.to);
      const kind = resource(command.resource), count = amount(command.amount);
      if (from.id === to.id) throw new Error("Escolha jogadores diferentes.");
      state.tradeBlocks = [{ from: from.id, to: to.id, turn: state.turn }];
      event(state, "Recusa Premium no modo de teste.", { kind: "premium_refused", from: from.id, to: to.id, give: { ...emptyBag(), [kind]: count } });
      break;
    }
    case "award": {
      const to = player(state, command.to);
      if (command.award !== "longestRoad" && command.award !== "largestArmy") throw new Error("Título inválido.");
      const field = command.award === "longestRoad" ? "longestRoadOwner" : "largestArmyOwner";
      const previous = state[field];
      if (previous === to.id) throw new Error("Esse jogador já possui a carta. Escolha o outro jogador para testar a tomada.");
      state[field] = to.id;
      event(state, "Título conquistado no modo de teste.", previous
        ? { kind: "award_transferred", award: command.award, from: previous, to: to.id }
        : { kind: "cue", cue: command.award, playerId: to.id });
      break;
    }
    case "punch": {
      const actor = player(state, command.playerId);
      event(state, "Soco na mesa no modo de teste.", { kind: "table_punch", playerId: actor.id });
      break;
    }
    case "dice": {
      const actor = player(state, command.playerId);
      if (command.dice.length !== 2 || command.dice.some(value => !Number.isInteger(value) || value < 1 || value > 6)) throw new Error("Os dados devem ter valores de 1 a 6.");
      state.lastRoll = { id: randomUUID(), playerId: actor.id, dice: command.dice, purpose: "turn" };
      event(state, `Dados de teste: ${command.dice[0]} e ${command.dice[1]}.`, { kind: "cue", cue: "dice", playerId: actor.id });
      break;
    }
    case "forceDiscard": {
      const actor = player(state, command.playerId);
      state.currentPlayerId = actor.id;
      state.mainPlayerId = actor.id;
      state.discardRequired = Object.fromEntries(TEST_PLAYERS
        .map(id => [id, RESOURCES.reduce((sum, kind) => sum + state.players[id].resources[kind], 0)] as const)
        .filter(([, count]) => count >= 8)
        .map(([id, count]) => [id, Math.floor(count / 2)]));
      if (Object.keys(state.discardRequired).length === 0) throw new Error("Adicione pelo menos 8 recursos a um jogador antes de forçar o descarte.");
      state.phase = "discard";
      state.lastRoll = { id: randomUUID(), playerId: actor.id, dice: [3, 4], purpose: "turn" };
      event(state, "Sete nos dados: descarte de teste.", { kind: "cue", cue: "dice", playerId: actor.id });
      break;
    }
    default: throw new Error("Ação de teste inválida.");
  }
  return state;
}
