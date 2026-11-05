import { randomInt, randomUUID } from "node:crypto";
import { createBoard } from "./board";
import { CLASSIC_RULES, robberDestinations } from "./configuration";
import { COST, canPay, legalMoves, legalRoad, legalSettlement, pay, produce, roadCount, score, structureCount, tradeRate, updateAwards, validateBag } from "./rules";
import { bagTotal, emptyBag, PIECE_LIMITS, RESOURCES, type Board, type DevCard, type GameAction, type GameEffect, type GameRules, type GameState, type PublicGameState, type Resource, type ResourceBag } from "./types";

export type RandomInt = (exclusiveMax: number) => number;

function shuffle<T>(items: T[], random: RandomInt) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function note(state: GameState, text: string, effect?: GameEffect) {
  state.events.push({ id: randomUUID(), text, at: Date.now(), effect });
  if (state.events.length > 100) state.events.shift();
}

function tradeBlocked(state: GameState, from: string, to: string) {
  return state.tradeBlocks.some(block => block.from === from && block.to === to && block.turn === state.turn);
}

function refreshAwards(state: GameState) {
  const roadOwner = state.longestRoadOwner, armyOwner = state.largestArmyOwner;
  updateAwards(state);
  if (state.longestRoadOwner && state.longestRoadOwner !== roadOwner) note(state, "Maior estrada conquistada!", roadOwner
    ? { kind: "award_transferred", award: "longestRoad", from: roadOwner, to: state.longestRoadOwner }
    : { kind: "cue", cue: "longestRoad", playerId: state.longestRoadOwner });
  if (state.largestArmyOwner && state.largestArmyOwner !== armyOwner) note(state, "Maior exército conquistado!", armyOwner
    ? { kind: "award_transferred", award: "largestArmy", from: armyOwner, to: state.largestArmyOwner }
    : { kind: "cue", cue: "largestArmy", playerId: state.largestArmyOwner });
}

function demandTurn(state: GameState, actor: string) {
  if (state.currentPlayerId !== actor) throw new Error("Aguarde seu turno.");
}

function demandPhase(state: GameState, ...phases: GameState["phase"][]) {
  if (!phases.includes(state.phase)) throw new Error("Ação indisponível nesta fase.");
}

function demandPieces(state: GameState, playerId: string, kind: "road" | "settlement" | "city") {
  const used = kind === "road" ? roadCount(state, playerId) : structureCount(state, playerId, kind);
  const limit = PIECE_LIMITS[kind];
  if (used >= limit) throw new Error("Você já usou todas as peças desse tipo.");
}

function nextSetupPlayer(state: GameState) {
  const count = state.playerOrder.length;
  const index = state.setupStep < count ? state.setupStep : 2 * count - 1 - state.setupStep;
  return state.playerOrder[index];
}

function finishIfWon(state: GameState) {
  if (state.phase === "choose_first_player" || state.phase.startsWith("setup") || state.phase === "finished") return;
  if (score(state, state.currentPlayerId, false) >= state.victoryTarget) {
    state.winner = state.currentPlayerId;
    state.phase = "finished";
    note(state, "A partida terminou!", { kind: "cue", cue: "victory", playerId: state.currentPlayerId });
  }
}

function takeBank(state: GameState, playerId: string, resource: Resource, amount: number) {
  if (state.bank[resource] < amount) throw new Error("O banco não possui esse recurso.");
  state.bank[resource] -= amount;
  state.players[playerId].resources[resource] += amount;
}

function afterRobber(state: GameState) {
  state.phase = state.resumePhase;
  state.robberFromKnight = false;
  state.robberVictims = [];
  finishIfWon(state);
}

function moveRobber(state: GameState, hexId: string) {
  const hex = state.board.hexes[hexId];
  if (!hex || !robberDestinations(state.board, state.rules).includes(hexId)) throw new Error("Destino inválido para o ladrão.");
  state.board.robberHex = hexId;
  state.robberVictims = [...new Set(hex.vertices
    .map(vertexId => state.structures[vertexId]?.owner)
    .filter((id): id is string => Boolean(id) && id !== state.currentPlayerId))]
    .filter(id => bagTotal(state.players[id].resources) > 0);
  note(state, "O ladrão mudou de terreno.", { kind: "cue", cue: "robber", playerId: state.currentPlayerId });
  if (state.robberVictims.length) state.phase = "choose_victim";
  else afterRobber(state);
}

export function createGame(playerIds: string[], seed: string = randomUUID(), victoryTarget = 10, random: RandomInt = randomInt, mapSize: "standard" | "expanded" = playerIds.length >= 5 ? "expanded" : "standard", board?: Board, rules: GameRules = CLASSIC_RULES): GameState {
  if (playerIds.length < 3 || playerIds.length > 6 || new Set(playerIds).size !== playerIds.length) throw new Error("A partida exige de 3 a 6 jogadores distintos.");
  if (mapSize === "standard" && playerIds.length > 4) throw new Error("O mapa para 1–4 comporta até quatro jogadores.");
  if (!Number.isInteger(victoryTarget) || victoryTarget < 8 || victoryTarget > 20) throw new Error("Pontuação de vitória inválida.");
  const playerOrder = [...playerIds];
  const deck: DevCard[] = [
    ...Array<DevCard>(14).fill("knight"),
    ...Array<DevCard>(2).fill("road_building"),
    ...Array<DevCard>(2).fill("year_plenty"),
    ...Array<DevCard>(2).fill("monopoly"),
    ...Array<DevCard>(5).fill("victory"),
    ...(mapSize === "expanded" ? [...Array<DevCard>(6).fill("knight"), "road_building" as DevCard, "year_plenty" as DevCard, "monopoly" as DevCard] : []),
  ];
  return {
    board: board ? structuredClone(board) : createBoard(seed, playerIds.length, mapSize), rules: { ...rules }, playerOrder, seatOrder: [...playerIds],
    players: Object.fromEntries(playerOrder.map(id => [id, { id, resources: emptyBag(), dev: [], knights: 0, playedDevTurn: -1 }])),
    bank: { wood: mapSize === "expanded" ? 24 : 19, brick: mapSize === "expanded" ? 24 : 19, wool: mapSize === "expanded" ? 24 : 19, wheat: mapSize === "expanded" ? 24 : 19, ore: mapSize === "expanded" ? 24 : 19 },
    roads: {}, structures: {}, devDeck: shuffle(deck, random),
    phase: "choose_first_player", currentPlayerId: playerOrder[0], mainPlayerId: playerOrder[0], pairedTurn: false, mainTurnCount: 1, setupStep: 0, setupVertex: null,
    turn: 0, round: 1, dice: null, lastRoll: null, startingRoll: { contenders: [...playerOrder], rolls: {}, round: 1, history: [] }, discardRequired: {}, robberVictims: [], robberFromKnight: false,
    resumePhase: "actions", freeRoads: 0, longestRoadOwner: null, largestArmyOwner: null,
    pendingTrade: null, counterOffers: [], tradeDeclines: [], tradeBlocks: [], lastPunchAt: {}, victoryTarget, winner: null, events: [],
  };
}

export function applyGameAction(source: GameState, actor: string, action: GameAction, random: RandomInt = randomInt): GameState {
  if (!source.players[actor]) throw new Error("Jogador não participa da partida.");
  if (source.phase === "finished") throw new Error("A partida terminou.");
  const state = structuredClone(source);
  const player = state.players[actor];

  switch (action.type) {
    case "start:roll": {
      demandPhase(state, "choose_first_player"); demandTurn(state, actor);
      const dice: [number, number] = [random(6) + 1, random(6) + 1];
      state.lastRoll = { id: randomUUID(), playerId: actor, dice, purpose: "first_player", throw: action.throw };
      state.startingRoll.rolls[actor] = dice;
      note(state, `Lançamento para definir quem começa: ${dice[0]} + ${dice[1]}.`, { kind: "cue", cue: "dice", playerId: actor });
      const next = state.startingRoll.contenders.find(id => !state.startingRoll.rolls[id]);
      if (next) {
        state.currentPlayerId = next;
        break;
      }
      const highest = Math.max(...state.startingRoll.contenders.map(id => state.startingRoll.rolls[id][0] + state.startingRoll.rolls[id][1]));
      const tied = state.startingRoll.contenders.filter(id => state.startingRoll.rolls[id][0] + state.startingRoll.rolls[id][1] === highest);
      state.startingRoll.history.push({ round: state.startingRoll.round, rolls: { ...state.startingRoll.rolls }, highest, leaders: tied });
      if (tied.length > 1) {
        state.startingRoll = { contenders: tied, rolls: {}, round: state.startingRoll.round + 1, history: state.startingRoll.history };
        state.currentPlayerId = tied[0];
        note(state, "Empate na maior soma. Apenas os empatados lançam novamente.");
      } else {
        const winnerIndex = state.seatOrder.indexOf(tied[0]);
        state.playerOrder = [...state.seatOrder.slice(winnerIndex), ...state.seatOrder.slice(0, winnerIndex)];
        state.currentPlayerId = tied[0];
        state.mainPlayerId = tied[0];
        state.phase = "setup_settlement";
        note(state, "Primeiro jogador definido. Começa o posicionamento inicial.");
      }
      break;
    }
    case "setup:settlement": {
      demandPhase(state, "setup_settlement"); demandTurn(state, actor);
      demandPieces(state, actor, "settlement");
      if (!legalSettlement(state, actor, action.vertexId, true)) throw new Error("Posição de assentamento inválida.");
      state.structures[action.vertexId] = { owner: actor, kind: "settlement" };
      state.setupVertex = action.vertexId;
      if (state.setupStep >= state.playerOrder.length) {
        for (const hexId of state.board.vertices[action.vertexId].hexes) {
          const resource = state.board.hexes[hexId].terrain;
          if (resource !== "desert" && state.bank[resource] > 0) takeBank(state, actor, resource, 1);
        }
      }
      state.phase = "setup_road";
      note(state, "Um assentamento inicial foi colocado.", { kind: "cue", cue: "settlement", playerId: actor });
      break;
    }
    case "setup:road": {
      demandPhase(state, "setup_road"); demandTurn(state, actor);
      demandPieces(state, actor, "road");
      if (!state.setupVertex || !legalRoad(state, actor, action.edgeId, state.setupVertex)) throw new Error("Estrada inicial inválida.");
      state.roads[action.edgeId] = actor;
      state.setupVertex = null;
      state.setupStep++;
      if (state.setupStep === state.playerOrder.length * 2) {
        state.phase = "before_roll";
        state.currentPlayerId = state.playerOrder[0];
        state.turn = 1;
        state.round = 1;
      } else {
        state.phase = "setup_settlement";
        state.currentPlayerId = nextSetupPlayer(state);
      }
      note(state, "Uma estrada inicial foi colocada.", { kind: "cue", cue: "road", playerId: actor });
      break;
    }
    case "turn:roll": {
      demandPhase(state, "before_roll"); demandTurn(state, actor);
      const dice: [number, number] = [random(6) + 1, random(6) + 1];
      state.dice = dice;
      state.lastRoll = { id: randomUUID(), playerId: actor, dice, purpose: "turn", throw: action.throw };
      const total = dice[0] + dice[1];
      note(state, `Os dados mostraram ${dice[0]} e ${dice[1]}.`, { kind: "cue", cue: "dice", playerId: actor });
      if (total === 7) {
        state.discardRequired = Object.fromEntries(state.playerOrder
          .map(id => [id, bagTotal(state.players[id].resources)])
          .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 7)
          .map(([id, count]) => [id, Math.floor(Number(count) / 2)]));
        state.resumePhase = "actions";
        state.phase = Object.keys(state.discardRequired).length ? "discard" : "move_robber";
      } else {
        produce(state, total);
        state.phase = "actions";
      }
      break;
    }
    case "robber:discard": {
      demandPhase(state, "discard");
      const required = state.discardRequired[actor];
      if (!required) throw new Error("Você não precisa descartar.");
      if (!validateBag(action.resources) || bagTotal(action.resources) !== required || !canPay(player.resources, action.resources)) throw new Error("Descarte inválido.");
      pay(player.resources, state.bank, action.resources);
      delete state.discardRequired[actor];
      note(state, "Um jogador descartou recursos.");
      if (Object.keys(state.discardRequired).length === 0) state.phase = "move_robber";
      break;
    }
    case "robber:move": {
      demandPhase(state, "move_robber"); demandTurn(state, actor);
      moveRobber(state, action.hexId);
      break;
    }
    case "robber:steal": {
      demandPhase(state, "choose_victim"); demandTurn(state, actor);
      if (!state.robberVictims.includes(action.victimId)) throw new Error("Vítima inválida.");
      const victim = state.players[action.victimId];
      const total = bagTotal(victim.resources);
      if (!total) throw new Error("A vítima não tem recursos.");
      let chosen = random(total);
      const resource = RESOURCES.find(item => {
        if (chosen < victim.resources[item]) return true;
        chosen -= victim.resources[item];
        return false;
      });
      if (!resource) throw new Error("Não foi possível sortear um recurso.");
      victim.resources[resource]--;
      player.resources[resource]++;
      note(state, "O ladrão roubou uma carta.", { kind: "cue", cue: "steal", playerId: actor });
      afterRobber(state);
      break;
    }
    case "build:road": {
      demandPhase(state, "actions", "before_roll"); demandTurn(state, actor);
      if (state.phase === "before_roll" && state.freeRoads <= 0) throw new Error("Role os dados primeiro.");
      demandPieces(state, actor, "road");
      if (!legalRoad(state, actor, action.edgeId)) throw new Error("Estrada inválida.");
      if (state.freeRoads > 0) state.freeRoads--;
      else pay(player.resources, state.bank, COST.road);
      state.roads[action.edgeId] = actor;
      refreshAwards(state);
      note(state, "Uma estrada foi construída.", { kind: "cue", cue: "road", playerId: actor });
      finishIfWon(state);
      break;
    }
    case "build:settlement": {
      demandPhase(state, "actions"); demandTurn(state, actor);
      demandPieces(state, actor, "settlement");
      if (!legalSettlement(state, actor, action.vertexId, false)) throw new Error("Assentamento inválido.");
      pay(player.resources, state.bank, COST.settlement);
      state.structures[action.vertexId] = { owner: actor, kind: "settlement" };
      refreshAwards(state);
      note(state, "Um assentamento foi construído.", { kind: "cue", cue: "settlement", playerId: actor });
      finishIfWon(state);
      break;
    }
    case "build:city": {
      demandPhase(state, "actions"); demandTurn(state, actor);
      demandPieces(state, actor, "city");
      if (state.structures[action.vertexId]?.owner !== actor || state.structures[action.vertexId].kind !== "settlement") throw new Error("Escolha um assentamento seu.");
      pay(player.resources, state.bank, COST.city);
      state.structures[action.vertexId].kind = "city";
      note(state, "Uma cidade foi construída.", { kind: "cue", cue: "city", playerId: actor });
      finishIfWon(state);
      break;
    }
    case "dev:buy": {
      demandPhase(state, "actions"); demandTurn(state, actor);
      if (!state.devDeck.length) throw new Error("O baralho de desenvolvimento acabou.");
      pay(player.resources, state.bank, COST.development);
      player.dev.push({ id: randomUUID(), kind: state.devDeck.pop()!, boughtTurn: state.turn });
      note(state, "Uma carta de desenvolvimento foi comprada.", { kind: "cue", cue: "card", playerId: actor });
      finishIfWon(state);
      break;
    }
    case "dev:play": {
      demandPhase(state, "before_roll", "actions"); demandTurn(state, actor);
      const index = player.dev.findIndex(card => card.id === action.cardId);
      const card = player.dev[index];
      if (!card) throw new Error("Esta carta não pode ser jogada agora.");
      if (card.kind === "victory") {
        const secretPoints = player.dev.filter(held => held.kind === "victory").length;
        if (score(state, actor, false) + secretPoints < state.victoryTarget) throw new Error(`Você precisa de ${state.victoryTarget} pontos somando suas cartas de ponto de vitória.`);
        state.winner = actor;
        state.phase = "finished";
        note(state, "A partida terminou com uma carta de ponto de vitória!", { kind: "cue", cue: "victory", playerId: actor });
        break;
      }
      if (player.playedDevTurn === state.turn) throw new Error("Você já jogou uma carta neste turno.");
      if (card.boughtTurn === state.turn) throw new Error("Esta carta não pode ser jogada agora.");
      let effect: GameEffect | undefined;
      if (card.kind === "year_plenty") {
        if (!action.resources || action.resources.length !== 2 || action.resources.some(resource => !RESOURCES.includes(resource))) throw new Error("Escolha dois recursos.");
        const needed = emptyBag();
        for (const resource of action.resources) needed[resource]++;
        if (!canPay(state.bank, needed)) throw new Error("O banco não possui esses recursos.");
        for (const resource of action.resources) takeBank(state, actor, resource, 1);
      } else if (card.kind === "monopoly") {
        if (!action.resource || !RESOURCES.includes(action.resource)) throw new Error("Escolha um recurso.");
        const taken: Record<string, number> = {};
        for (const id of state.playerOrder) if (id !== actor) {
          const amount = state.players[id].resources[action.resource];
          if (amount > 0) taken[id] = amount;
          state.players[id].resources[action.resource] = 0;
          player.resources[action.resource] += amount;
        }
        effect = { kind: "monopoly", playerId: actor, resource: action.resource, taken };
      } else if (card.kind === "road_building") {
        state.freeRoads += 2;
      } else if (card.kind === "knight") {
        player.knights++;
        refreshAwards(state);
        state.robberFromKnight = true;
        state.resumePhase = state.phase as "before_roll" | "actions";
        state.phase = "move_robber";
      }
      player.dev.splice(index, 1);
      player.playedDevTurn = state.turn;
      note(state, "Uma carta de desenvolvimento foi jogada.", effect ?? { kind: "cue", cue: "card", playerId: actor });
      finishIfWon(state);
      break;
    }
    case "trade:bank": {
      demandPhase(state, "actions"); demandTurn(state, actor);
      if (action.give === action.receive) throw new Error("Escolha recursos diferentes.");
      const rate = tradeRate(state, actor, action.give);
      if (player.resources[action.give] < rate || state.bank[action.receive] < 1) throw new Error("Troca com o banco indisponível.");
      player.resources[action.give] -= rate;
      state.bank[action.give] += rate;
      takeBank(state, actor, action.receive, 1);
      note(state, "Uma troca com o banco foi concluída.");
      break;
    }
    case "trade:offer": {
      demandPhase(state, "actions");
      if (state.pairedTurn) throw new Error("Trocas entre jogadores não são permitidas no turno em dupla.");
      if (!validateBag(action.give) || !validateBag(action.want) || !bagTotal(action.give) || !bagTotal(action.want) || !canPay(player.resources, action.give)) throw new Error("Oferta inválida.");
      if (RESOURCES.some(resource => action.give[resource] > 0 && action.want[resource] > 0)) throw new Error("Use recursos diferentes nos dois lados da troca.");
      if (action.to && (!state.players[action.to] || action.to === actor)) throw new Error("Destinatário inválido.");
      if (action.to && tradeBlocked(state, actor, action.to)) throw new Error("Recusa Premium: aguarde o fim desta jogada para propor a este jogador.");
      if (actor === state.currentPlayerId) {
        state.pendingTrade = { id: randomUUID(), from: actor, to: action.to, give: action.give, want: action.want, createdAt: Date.now() };
        state.tradeDeclines = [];
      } else {
        if (action.to !== state.currentPlayerId) throw new Error("A proposta deve ser dirigida ao jogador da vez.");
        state.counterOffers = state.counterOffers.filter(offer => offer.from !== actor);
        state.counterOffers.push({ id: randomUUID(), from: actor, to: state.currentPlayerId, give: action.give, want: action.want, createdAt: Date.now() });
      }
      note(state, "Uma oferta de troca foi enviada.", { kind: "cue", cue: "offer", playerId: actor });
      break;
    }
    case "trade:counter": {
      demandPhase(state, "actions");
      if (state.pairedTurn) throw new Error("Trocas entre jogadores não são permitidas no turno em dupla.");
      const original = state.pendingTrade;
      if (!original || original.id !== action.offerId || original.from === actor) throw new Error("Oferta indisponível.");
      if (tradeBlocked(state, actor, original.from)) throw new Error("Recusa Premium: aguarde o fim desta jogada para propor a este jogador.");
      if (!validateBag(action.give) || !validateBag(action.want) || !bagTotal(action.give) || !bagTotal(action.want) || !canPay(player.resources, action.give)) throw new Error("Contraproposta inválida.");
      if (RESOURCES.some(resource => action.give[resource] > 0 && action.want[resource] > 0)) throw new Error("Use recursos diferentes nos dois lados da troca.");
      state.counterOffers = state.counterOffers.filter(offer => offer.from !== actor);
      state.counterOffers.push({ id: randomUUID(), from: actor, to: original.from, give: action.give, want: action.want, createdAt: Date.now() });
      state.tradeDeclines = state.tradeDeclines.filter(id => id !== actor);
      note(state, "Uma contraproposta foi enviada.", { kind: "cue", cue: "offer", playerId: actor });
      break;
    }
    case "trade:decline": {
      demandPhase(state, "actions");
      if (state.pairedTurn) throw new Error("Trocas entre jogadores não são permitidas no turno em dupla.");
      const counter = state.counterOffers.find(offer => offer.id === action.offerId);
      if (counter && counter.to === actor && actor === state.currentPlayerId) {
        state.counterOffers = state.counterOffers.filter(offer => offer.id !== action.offerId);
        note(state, "Uma contraproposta foi recusada.");
        break;
      }
      const original = state.pendingTrade;
      if (!original || original.id !== action.offerId || original.from === actor || (original.to && original.to !== actor)) throw new Error("Oferta indisponível.");
      if (!state.tradeDeclines.includes(actor)) state.tradeDeclines.push(actor);
      note(state, "Uma oferta de troca foi recusada.");
      break;
    }
    case "trade:premium_refuse": {
      demandPhase(state, "actions");
      if (state.pairedTurn) throw new Error("Trocas entre jogadores não são permitidas no turno em dupla.");
      const original = state.pendingTrade;
      const offer = original?.id === action.offerId ? original : state.counterOffers.find(item => item.id === action.offerId);
      if (!offer || offer.from === actor || (offer.to && offer.to !== actor) || (offer !== original && actor !== state.currentPlayerId) || (offer === original && state.tradeDeclines.includes(actor))) throw new Error("Oferta indisponível.");
      if (!tradeBlocked(state, offer.from, actor)) state.tradeBlocks.push({ from: offer.from, to: actor, turn: state.turn });
      if (offer === original) {
        if (original?.to) state.pendingTrade = null;
        else if (!state.tradeDeclines.includes(actor)) state.tradeDeclines.push(actor);
      }
      state.counterOffers = state.counterOffers.filter(item => !(item.from === offer.from && item.to === actor));
      note(state, "RECUSA PREMIUM! Novas propostas dessa pessoa estão bloqueadas até o fim desta jogada.", { kind: "premium_refused", from: offer.from, to: actor, give: offer.give });
      break;
    }
    case "trade:accept": {
      demandPhase(state, "actions");
      if (state.pairedTurn) throw new Error("Trocas entre jogadores não são permitidas no turno em dupla.");
      const original = state.pendingTrade;
      const offer = original?.id === action.offerId ? original : state.counterOffers.find(item => item.id === action.offerId);
      if (!offer || offer.from === actor || (offer.to && offer.to !== actor) || (offer === original && state.tradeDeclines.includes(actor)) || (offer !== original && actor !== state.currentPlayerId)) throw new Error("Oferta indisponível.");
      if (tradeBlocked(state, offer.from, actor)) throw new Error("Recusa Premium: oferta bloqueada nesta jogada.");
      const sender = state.players[offer.from];
      if (!canPay(sender.resources, offer.give) || !canPay(player.resources, offer.want)) throw new Error("Recursos insuficientes para concluir a troca.");
      for (const resource of RESOURCES) {
        sender.resources[resource] += offer.want[resource] - offer.give[resource];
        player.resources[resource] += offer.give[resource] - offer.want[resource];
      }
      state.pendingTrade = null;
      state.counterOffers = [];
      state.tradeDeclines = [];
      note(state, "Uma troca entre jogadores foi concluída.", { kind: "trade_accepted", from: offer.from, to: actor, give: offer.give, want: offer.want });
      break;
    }
    case "trade:cancel": {
      const counter = state.counterOffers.find(item => item.id === action.offerId && item.from === actor);
      if (counter) {
        state.counterOffers = state.counterOffers.filter(item => item.id !== counter.id);
        note(state, "Uma contraproposta foi retirada.");
        break;
      }
      const offer = state.pendingTrade;
      if (!offer || offer.id !== action.offerId || offer.from !== actor) throw new Error("Oferta indisponível.");
      state.pendingTrade = null;
      state.tradeDeclines = [];
      note(state, "A oferta de troca foi cancelada.");
      break;
    }
    case "turn:end": {
      demandPhase(state, "actions"); demandTurn(state, actor);
      state.pendingTrade = null;
      state.counterOffers = [];
      state.tradeDeclines = [];
      state.tradeBlocks = [];
      state.freeRoads = 0;
      state.dice = null;
      if (state.playerOrder.length >= 5 && !state.pairedTurn) {
        const mainIndex = state.playerOrder.indexOf(state.mainPlayerId);
        state.currentPlayerId = state.playerOrder[(mainIndex + 3) % state.playerOrder.length];
        state.pairedTurn = true;
        state.phase = "actions";
      } else {
        const mainIndex = state.playerOrder.indexOf(state.mainPlayerId);
        state.mainPlayerId = state.playerOrder[(mainIndex + 1) % state.playerOrder.length];
        state.currentPlayerId = state.mainPlayerId;
        state.pairedTurn = false;
        state.mainTurnCount++;
        state.round = Math.floor((state.mainTurnCount - 1) / state.playerOrder.length) + 1;
        state.phase = "before_roll";
      }
      state.turn++;
      note(state, "O turno passou para o próximo jogador.", { kind: "cue", cue: "turn", playerId: state.currentPlayerId });
      break;
    }
    case "social:punch": {
      const robberHex = state.board.hexes[state.board.robberHex];
      if (!robberHex?.vertices.some(vertexId => state.structures[vertexId]?.owner === actor)) throw new Error("Você precisa ter uma casa junto ao ladrão para socar a mesa.");
      const now = Date.now();
      if (state.lastPunchAt[actor] !== undefined && now - state.lastPunchAt[actor] < 8000) throw new Error("Aguarde um pouco antes de socar a mesa novamente.");
      state.lastPunchAt[actor] = now;
      note(state, "Um jogador socou a mesa!", { kind: "table_punch", playerId: actor });
      break;
    }
  }
  return state;
}

export function projectGame(state: GameState, playerId: string): PublicGameState {
  if (!state.players[playerId]) throw new Error("Jogador não participa da partida.");
  return {
    board: state.board, rules: state.rules, playerOrder: state.playerOrder, seatOrder: state.seatOrder, phase: state.phase,
    currentPlayerId: state.currentPlayerId, mainPlayerId: state.mainPlayerId, pairedTurn: state.pairedTurn, turn: state.turn, round: state.round, dice: state.dice, lastRoll: state.lastRoll, startingRoll: state.startingRoll,
    roads: state.roads, structures: state.structures, robberHex: state.board.robberHex,
    scores: Object.fromEntries(state.playerOrder.map(id => [id, score(state, id, false)])),
    finalScores: state.phase === "finished" ? Object.fromEntries(state.playerOrder.map(id => [id, score(state, id)])) : null,
    resourceCounts: Object.fromEntries(state.playerOrder.map(id => [id, bagTotal(state.players[id].resources)])),
    playerResources: Object.fromEntries(state.playerOrder.map(id => [id, { ...state.players[id].resources }])),
    devCounts: Object.fromEntries(state.playerOrder.map(id => [id, state.players[id].dev.length])),
    knights: Object.fromEntries(state.playerOrder.map(id => [id, state.players[id].knights])),
    bank: state.bank, discardRequired: state.discardRequired, robberVictims: state.robberVictims,
    pendingTrade: state.pendingTrade, counterOffers: state.counterOffers, tradeDeclines: state.tradeDeclines, tradeBlocks: state.tradeBlocks, longestRoadOwner: state.longestRoadOwner,
    largestArmyOwner: state.largestArmyOwner, victoryTarget: state.victoryTarget, winner: state.winner,
    events: state.events, legal: legalMoves(state, playerId),
    myResources: state.players[playerId].resources, myDev: state.players[playerId].dev,
    freeRoads: state.currentPlayerId === playerId ? state.freeRoads : 0,
  };
}
