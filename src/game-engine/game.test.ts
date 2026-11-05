import { describe, expect, it } from "vitest";
import { createBoard } from "./board";
import { createBoardFrame, createCoastline } from "./board-frame";
import { applyGameAction, createGame, projectGame } from "./game";
import { longestRoad } from "./rules";
import { emptyBag, RESOURCES, type GameState } from "./types";

const players = ["ana", "bia", "caio"];
const random = () => 0;

function completeSetup(state: GameState) {
  while (state.phase === "choose_first_player") {
    const actor = state.currentPlayerId;
    const result = Math.min(state.playerOrder.indexOf(actor), 5);
    state = applyGameAction(state, actor, { type: "start:roll" }, () => result);
  }
  while (state.phase === "setup_settlement" || state.phase === "setup_road") {
    const actor = state.currentPlayerId;
    const legal = projectGame(state, actor).legal;
    state = state.phase === "setup_settlement"
      ? applyGameAction(state, actor, { type: "setup:settlement", vertexId: legal.vertices[0] }, random)
      : applyGameAction(state, actor, { type: "setup:road", edgeId: legal.edges[0] }, random);
  }
  return state;
}

describe("tabuleiro e jogo clássico", () => {
  it("compartilha a posição e o impulso do lançamento sem alterar o sorteio dos dados", () => {
    const throwData = { x: .82, y: .24, vx: -1.2, vy: .8 };
    const initial = createGame(players, "dice-trajectory", 10, random);
    const state = applyGameAction(initial, initial.currentPlayerId, { type: "start:roll", throw: throwData }, random);
    expect(projectGame(state, "bia").lastRoll?.throw).toEqual(throwData);
    expect(state.lastRoll?.dice).toEqual([1, 1]);
  });

  it("define o primeiro jogador pelos dois dados e repete apenas entre empatados na maior soma", () => {
    let state = createGame(players, "first-player", 10, random);
    expect(state.phase).toBe("choose_first_player");
    const rolls = new Map([["ana", [2, 4]], ["bia", [3, 3]], ["caio", [1, 2]]] as [string, number[]][]);
    for (const actor of players) {
      const dice = [...rolls.get(actor)!];
      state = applyGameAction(state, actor, { type: "start:roll" }, () => dice.shift()! - 1);
    }
    expect(state.phase).toBe("choose_first_player");
    expect(state.startingRoll.contenders).toEqual(["ana", "bia"]);
    expect(state.startingRoll.history[0]).toMatchObject({ highest: 6, leaders: ["ana", "bia"] });
    expect(state.startingRoll.history[0].rolls.caio).toEqual([1, 2]);
    expect(state.currentPlayerId).toBe("ana");
    for (const [actor, dice] of [["ana", [2, 2]], ["bia", [5, 3]]] as [string, number[]][]) {
      const values = [...dice];
      state = applyGameAction(state, actor, { type: "start:roll" }, () => values.shift()! - 1);
    }
    expect(state.phase).toBe("setup_settlement");
    expect(state.currentPlayerId).toBe("bia");
    expect(state.playerOrder).toEqual(["bia", "caio", "ana"]);
    expect(state.seatOrder).toEqual(["ana", "bia", "caio"]);
    expect(state.startingRoll.history[1]).toMatchObject({ highest: 8, leaders: ["bia"] });
    expect(state.lastRoll?.dice).toEqual([5, 3]);
  });
  it("segue os assentos no sentido horário após o vencedor, inclusive na volta da mesa", () => {
    const seats = ["ana", "bia", "caio", "davi"];
    let state = createGame(seats, "clockwise", 10, random);
    for (const [actor, dice] of [["ana", [1, 1]], ["bia", [2, 2]], ["caio", [3, 3]], ["davi", [6, 5]]] as [string, number[]][]) {
      const values = [...dice];
      state = applyGameAction(state, actor, { type: "start:roll" }, () => values.shift()! - 1);
    }
    expect(state.seatOrder).toEqual(seats);
    expect(state.playerOrder).toEqual(["davi", "ana", "bia", "caio"]);
    expect(state.phase).toBe("setup_settlement");
  });
  it("gera o grafo clássico reproduzível com 19 terrenos, 54 vértices e 72 arestas", () => {
    const board = createBoard("vento-123");
    expect(Object.keys(board.hexes)).toHaveLength(19);
    expect(Object.keys(board.vertices)).toHaveLength(54);
    expect(Object.keys(board.edges)).toHaveLength(72);
    expect(createBoard("vento-123")).toEqual(board);
    expect(Object.values(board.hexes).filter(hex => hex.terrain === "desert")).toHaveLength(1);
    expect(Object.values(board.edges).filter(edge => edge.port)).toHaveLength(9);
    const center = Object.values(board.hexes).find(hex => hex.q === 0 && hex.r === 0)!;
    const corners = center.vertices.map(id => board.vertices[id]);
    expect(Math.max(...corners.map(vertex => vertex.x)) - center.x).toBeCloseTo(67 * Math.sqrt(3) / 2);
    expect(Math.max(...corners.map(vertex => vertex.y)) - center.y).toBeCloseTo(67);
  });

  it("amplia o mapa e alterna os turnos em dupla para cinco ou seis pessoas", () => {
    const seats = ["ana", "bia", "caio", "davi", "eva", "fê"];
    const board = createBoard("mapa-seis", 6);
    expect(Object.keys(board.hexes)).toHaveLength(30);
    expect(Object.values(board.hexes).filter(hex => hex.terrain === "desert")).toHaveLength(2);
    expect(Object.values(board.hexes).filter(hex => hex.number !== null)).toHaveLength(28);
    expect(Object.values(board.edges).filter(edge => edge.port)).toHaveLength(11);
    expect(Object.values(board.edges).filter(edge => edge.port === "wool")).toHaveLength(2);
    const initial = createGame(seats, "mapa-seis", 10, random);
    expect(initial.bank.wood).toBe(24);
    let state = completeSetup(initial);
    expect(state.devDeck).toHaveLength(34);
    const main = state.currentPlayerId;
    state = applyGameAction(state, main, { type: "turn:roll" }, random);
    state = applyGameAction(state, main, { type: "turn:end" });
    expect(state.pairedTurn).toBe(true);
    expect(state.currentPlayerId).toBe(state.playerOrder[3]);
    expect(state.phase).toBe("actions");
    expect(() => applyGameAction(state, state.currentPlayerId, { type: "trade:offer", to: main, give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), brick: 1 } })).toThrow("Trocas entre jogadores");
    state = applyGameAction(state, state.currentPlayerId, { type: "turn:end" });
    expect(state.pairedTurn).toBe(false);
    expect(state.currentPlayerId).toBe(state.playerOrder[1]);
    expect(state.phase).toBe("before_roll");
    let five = completeSetup(createGame(seats.slice(0, 5), "mapa-cinco", 10, random));
    expect(Object.keys(five.board.hexes)).toHaveLength(30);
    const first = five.currentPlayerId;
    five = applyGameAction(five, first, { type: "turn:roll" }, random);
    five = applyGameAction(five, first, { type: "turn:end" });
    expect(five.currentPlayerId).toBe(five.playerOrder[3]);
    five = applyGameAction(five, five.currentPlayerId, { type: "turn:end" });
    expect(five.currentPlayerId).toBe(five.playerOrder[1]);
  });

  it("permite o mapa ampliado com três jogadores sem turno em dupla", () => {
    let state = completeSetup(createGame(["ana", "bia", "caio"], "mapa-ampliado-tres", 10, random, "expanded"));
    expect(Object.keys(state.board.hexes)).toHaveLength(30);
    expect(state.devDeck).toHaveLength(34);
    expect(state.bank.wood + Object.values(state.players).reduce((total, player) => total + player.resources.wood, 0)).toBe(24);
    const first = state.currentPlayerId;
    state = applyGameAction(state, first, { type: "turn:roll" }, random);
    state = applyGameAction(state, first, { type: "turn:end" });
    expect(state.pairedTurn).toBe(false);
    expect(state.currentPlayerId).toBe(state.playerOrder[1]);
  });

  it("encaixa todos os portos numa moldura hexagonal regular nos dois mapas", () => {
    for (const count of [4, 6]) {
      const board = createBoard(`moldura-${count}`, count);
      const frame = createBoardFrame(board);
      const coast = createCoastline(board);
      const coastalEdges = Object.values(board.edges).filter(edge => edge.hexes.length === 1);
      expect(coast.points).toHaveLength(coastalEdges.length);
      expect(coast.path.endsWith(" Z")).toBe(true);
      const sideLengths = frame.points.map((point, index) => Math.hypot(point.x - frame.points[(index + 1) % 6].x, point.y - frame.points[(index + 1) % 6].y));
      for (const length of sideLengths) expect(length).toBeCloseTo(sideLengths[0]);
      for (const vertex of Object.values(board.vertices)) {
        const center = { x: (frame.points[0].x + frame.points[3].x) / 2, y: (frame.points[0].y + frame.points[3].y) / 2 };
        const radius = frame.points[3].y - center.y;
        expect(Math.abs(vertex.y - center.y) + Math.abs(vertex.x - center.x) / Math.sqrt(3)).toBeLessThan(radius);
      }
      const coastlinePoints = new Set(coast.points.map(point => `${point.x}:${point.y}`));
      for (const edge of coastalEdges.filter(edge => edge.port)) {
        expect(coastlinePoints.has(`${board.vertices[edge.a].x}:${board.vertices[edge.a].y}`)).toBe(true);
        expect(coastlinePoints.has(`${board.vertices[edge.b].x}:${board.vertices[edge.b].y}`)).toBe(true);
      }
    }
  });

  it("faz a preparação em ordem normal e inversa sem violar a distância", () => {
    let state = createGame(players, "setup", 10, random);
    state = completeSetup(state);
    expect(state.phase).toBe("before_roll");
    expect(Object.keys(state.structures)).toHaveLength(6);
    expect(Object.keys(state.roads)).toHaveLength(6);
    expect(state.playerOrder.every(id => Object.values(state.structures).filter(item => item.owner === id).length === 2)).toBe(true);
    for (const [id, vertex] of Object.entries(state.board.vertices)) {
      if (!state.structures[id]) continue;
      for (const edgeId of vertex.edges) {
        const edge = state.board.edges[edgeId];
        expect(state.structures[edge.a === id ? edge.b : edge.a]).toBeUndefined();
      }
    }
  });

  it("distribui recursos com dois dados, mostra recursos e preserva o segredo das cartas de desenvolvimento", () => {
    let state = completeSetup(createGame(players, "production", 10, random));
    const actor = state.currentPlayerId;
    const before = state.playerOrder.map(id => ({ id, ...state.players[id].resources }));
    state = applyGameAction(state, actor, { type: "turn:roll" }, random);
    expect(state.dice).toEqual([1, 1]);
    expect(state.phase).toBe("actions");
    state.players.bia.resources.wool = 3;
    state.players.bia.dev.push({ id: "dev-bia", kind: "victory", boughtTurn: 1 });
    const projection = projectGame(state, actor);
    expect(projection.myResources).toEqual(state.players[actor].resources);
    expect(projection.playerResources.bia.wool).toBe(3);
    expect(projection.devCounts.bia).toBe(1);
    expect(projection.myDev).toEqual(state.players[actor].dev);
    expect(JSON.stringify(projection)).not.toContain('"dev-bia"');
    const biaView = projectGame(state, "bia");
    expect(biaView.myDev).toEqual(state.players.bia.dev);
    expect(biaView.playerResources[actor]).toEqual(state.players[actor].resources);
    expect(JSON.stringify(projection)).not.toContain('"devDeck"');
    expect(projection.resourceCounts[actor]).toBeGreaterThanOrEqual(0);
    expect(before).toHaveLength(3);
  });

  it("calcula a estrada mais longa por percurso sem reutilizar arestas", () => {
    const state = createGame(players, "roads", 10, random);
    const board = state.board;
    const start = Object.values(board.vertices)[0];
    const chain: string[] = [];
    let current = start.id;
    for (let i = 0; i < 5; i++) {
      const next = board.vertices[current].edges.find(edgeId => !chain.includes(edgeId));
      if (!next) break;
      chain.push(next);
      const edge = board.edges[next];
      current = edge.a === current ? edge.b : edge.a;
    }
    for (const edgeId of chain) state.roads[edgeId] = "ana";
    expect(longestRoad(state, "ana")).toBe(chain.length);
    expect(longestRoad(state, "bia")).toBe(0);
  });

  it("registra quem tomou a carta de Mais Cavaleiros", () => {
    let state = completeSetup(createGame(players, "army-transfer", 10, random));
    state.phase = "actions";
    const winner = state.currentPlayerId;
    const formerOwner = state.playerOrder.find(id => id !== winner)!;
    state.players[formerOwner].knights = 3;
    state.players[winner].knights = 3;
    state.largestArmyOwner = formerOwner;
    state.players[winner].dev.push({ id: "fourth-knight", kind: "knight", boughtTurn: state.turn - 1 });

    state = applyGameAction(state, winner, { type: "dev:play", cardId: "fourth-knight" }, random);
    expect(state.largestArmyOwner).toBe(winner);
    expect(state.events.find(event => event.effect?.kind === "award_transferred")?.effect).toEqual({ kind: "award_transferred", award: "largestArmy", from: formerOwner, to: winner });
    expect(projectGame(state, formerOwner).largestArmyOwner).toBe(winner);
  });

  it("registra quem tomou a carta de Dono das Pontes", () => {
    let state = completeSetup(createGame(players, "road-transfer", 10, random));
    state.phase = "actions";
    const winner = state.currentPlayerId;
    const formerOwner = state.playerOrder.find(id => id !== winner)!;
    state.players[winner].resources = { ...emptyBag(), wood: 1, brick: 1 };
    const findPath = (vertexId: string, remaining: number, used: Set<string>, finalEdge: string): string[] | null => {
      if (remaining === 0) return [];
      for (const edgeId of state.board.vertices[vertexId].edges) {
        if (edgeId === finalEdge || state.roads[edgeId] || used.has(edgeId)) continue;
        const next = state.board.edges[edgeId].a === vertexId ? state.board.edges[edgeId].b : state.board.edges[edgeId].a;
        if (remaining > 1 && state.structures[next] && state.structures[next].owner !== winner) continue;
        const rest = findPath(next, remaining - 1, new Set([...used, edgeId]), finalEdge);
        if (rest) return [edgeId, ...rest];
      }
      return null;
    };
    const candidate = projectGame(state, winner).legal.edges.map(finalEdge => {
      const edge = state.board.edges[finalEdge];
      return { finalEdge, path: findPath(edge.a, 5, new Set(), finalEdge) ?? findPath(edge.b, 5, new Set(), finalEdge) };
    }).find(item => item.path);
    expect(candidate).toBeDefined();
    for (const edgeId of candidate!.path!) state.roads[edgeId] = winner;
    state.longestRoadOwner = formerOwner;

    state = applyGameAction(state, winner, { type: "build:road", edgeId: candidate!.finalEdge }, random);
    expect(state.longestRoadOwner).toBe(winner);
    expect(state.events.find(event => event.effect?.kind === "award_transferred")?.effect).toEqual({ kind: "award_transferred", award: "longestRoad", from: formerOwner, to: winner });
  });

  it("executa troca atômica e bloqueia segunda aceitação da mesma oferta", () => {
    let state = completeSetup(createGame(players, "trade", 10, random));
    state.phase = "actions";
    const actor = state.currentPlayerId;
    const recipient = state.playerOrder.find(id => id !== actor)!;
    state.players[actor].resources = { ...emptyBag(), wood: 2 };
    state.players[recipient].resources = { ...emptyBag(), ore: 1 };
    state = applyGameAction(state, actor, { type: "trade:offer", to: recipient, give: { ...emptyBag(), wood: 2 }, want: { ...emptyBag(), ore: 1 } }, random);
    const offerId = state.pendingTrade!.id;
    state = applyGameAction(state, recipient, { type: "trade:accept", offerId }, random);
    expect(state.pendingTrade).toBeNull();
    expect(state.players[actor].resources.ore).toBe(1);
    expect(state.players[recipient].resources.wood).toBe(2);
    expect(() => applyGameAction(state, recipient, { type: "trade:accept", offerId }, random)).toThrow("Oferta indisponível");
  });

  it("aplica Recusa Premium direcional somente até o fim da jogada atual", () => {
    let state = completeSetup(createGame(players, "premium-block", 10, random));
    state.phase = "actions";
    const sender = state.currentPlayerId;
    const recipient = state.playerOrder.find(id => id !== sender)!;
    state.players[sender].resources = { ...emptyBag(), wood: 2 };
    state.players[recipient].resources = { ...emptyBag(), ore: 2 };
    const give = { ...emptyBag(), wood: 1 }, want = { ...emptyBag(), ore: 1 };
    state = applyGameAction(state, sender, { type: "trade:offer", to: recipient, give, want }, random);
    state = applyGameAction(state, recipient, { type: "trade:premium_refuse", offerId: state.pendingTrade!.id }, random);
    expect(state.pendingTrade).toBeNull();
    expect(state.tradeBlocks).toEqual([{ from: sender, to: recipient, turn: state.turn }]);
    expect(state.events.at(-1)?.effect).toMatchObject({ kind: "premium_refused", from: sender, to: recipient });
    expect(() => applyGameAction(state, sender, { type: "trade:offer", to: recipient, give, want }, random)).toThrow("Recusa Premium");
    state = applyGameAction(state, recipient, { type: "trade:offer", to: sender, give: want, want: give }, random);
    expect(state.counterOffers).toHaveLength(1);
    state = applyGameAction(state, state.currentPlayerId, { type: "turn:end" }, random);
    expect(state.round).toBe(1);
    expect(state.tradeBlocks).toEqual([]);
    state.phase = "actions";
    state.currentPlayerId = sender;
    expect(() => applyGameAction(state, sender, { type: "trade:offer", to: recipient, give, want }, random)).not.toThrow();
  });

  it("mantém oferta coletiva disponível a outros jogadores após Recusa Premium", () => {
    let state = completeSetup(createGame(players, "premium-broadcast", 10, random));
    state.phase = "actions";
    const sender = state.currentPlayerId;
    const [refuser, accepter] = state.playerOrder.filter(id => id !== sender);
    state.players[sender].resources = { ...emptyBag(), wood: 2 };
    state.players[refuser].resources = { ...emptyBag(), ore: 1 };
    state.players[accepter].resources = { ...emptyBag(), ore: 1 };
    state = applyGameAction(state, sender, { type: "trade:offer", give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), ore: 1 } }, random);
    const offerId = state.pendingTrade!.id;
    state = applyGameAction(state, refuser, { type: "trade:premium_refuse", offerId }, random);
    expect(state.pendingTrade?.id).toBe(offerId);
    expect(() => applyGameAction(state, refuser, { type: "trade:accept", offerId }, random)).toThrow("Oferta indisponível");
    state = applyGameAction(state, accepter, { type: "trade:accept", offerId }, random);
    expect(state.events.at(-1)?.effect).toMatchObject({ kind: "trade_accepted", from: sender, to: accepter });
  });

  it("a Recusa Premium também remove uma contraproposta dirigida ao jogador da vez", () => {
    let state = completeSetup(createGame(players, "premium-counter", 10, random));
    state.phase = "actions";
    const recipient = state.currentPlayerId;
    const sender = state.playerOrder.find(id => id !== recipient)!;
    state.players[sender].resources = { ...emptyBag(), wool: 1 };
    state.players[recipient].resources = { ...emptyBag(), brick: 1 };
    const give = { ...emptyBag(), wool: 1 }, want = { ...emptyBag(), brick: 1 };
    state = applyGameAction(state, sender, { type: "trade:offer", to: recipient, give, want }, random);
    const offerId = state.counterOffers[0].id;
    state = applyGameAction(state, recipient, { type: "trade:premium_refuse", offerId }, random);
    expect(state.counterOffers).toEqual([]);
    expect(projectGame(state, sender).tradeBlocks).toEqual([{ from: sender, to: recipient, turn: state.turn }]);
    expect(() => applyGameAction(state, sender, { type: "trade:offer", to: recipient, give, want }, random)).toThrow("Recusa Premium");
  });

  it("limita o soco na mesa sem alterar recursos ou turno", () => {
    const initial = createGame(players, "table-punch", 10, random);
    const actor = initial.currentPlayerId;
    const other = initial.playerOrder.find(id => id !== actor)!;
    expect(() => applyGameAction(initial, actor, { type: "social:punch" }, random)).toThrow("casa junto ao ladrão");
    initial.structures[initial.board.hexes[initial.board.robberHex].vertices[0]] = { owner: actor, kind: "settlement" };
    expect(() => applyGameAction(initial, other, { type: "social:punch" }, random)).toThrow("casa junto ao ladrão");
    let state = applyGameAction(initial, actor, { type: "social:punch" }, random);
    expect(state.events.at(-1)?.effect).toEqual({ kind: "table_punch", playerId: actor });
    expect(state.currentPlayerId).toBe(initial.currentPlayerId);
    expect(state.players[actor].resources).toEqual(initial.players[actor].resources);
    expect(() => applyGameAction(state, actor, { type: "social:punch" }, random)).toThrow("Aguarde");
    state.lastPunchAt[actor] -= 8000;
    expect(() => applyGameAction(state, actor, { type: "social:punch" }, random)).not.toThrow();
  });

  it("permite contraproposta ao jogador ativo e conclui apenas uma resposta", () => {
    let state = completeSetup(createGame(players, "counter", 10, random));
    state.phase = "actions";
    const actor = state.currentPlayerId;
    const [first, second] = state.playerOrder.filter(id => id !== actor);
    state.players[actor].resources = { ...emptyBag(), wood: 2 };
    state.players[first].resources = { ...emptyBag(), ore: 1 };
    state.players[second].resources = { ...emptyBag(), ore: 1 };
    state = applyGameAction(state, actor, { type: "trade:offer", give: { ...emptyBag(), wood: 2 }, want: { ...emptyBag(), ore: 1 } }, random);
    const originalId = state.pendingTrade!.id;
    state = applyGameAction(state, first, { type: "trade:counter", offerId: originalId, give: { ...emptyBag(), ore: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    const counterId = state.counterOffers[0].id;
    expect(() => applyGameAction(state, second, { type: "trade:accept", offerId: counterId }, random)).toThrow("Oferta indisponível");
    state = applyGameAction(state, second, { type: "trade:decline", offerId: originalId }, random);
    expect(() => applyGameAction(state, second, { type: "trade:accept", offerId: originalId }, random)).toThrow("Oferta indisponível");
    state = applyGameAction(state, actor, { type: "trade:accept", offerId: counterId }, random);
    expect(state.players[actor].resources).toMatchObject({ wood: 1, ore: 1 });
    expect(state.players[first].resources).toMatchObject({ wood: 1, ore: 0 });
    expect(state.pendingTrade).toBeNull();
    expect(state.counterOffers).toHaveLength(0);
    expect(() => applyGameAction(state, second, { type: "trade:accept", offerId: originalId }, random)).toThrow("Oferta indisponível");
  });

  it("mantém várias contrapropostas e permite recusar uma sem perder as demais", () => {
    let state = completeSetup(createGame(players, "counter-list", 10, random));
    state.phase = "actions";
    const actor = state.currentPlayerId;
    const [first, second] = state.playerOrder.filter(id => id !== actor);
    state.players[actor].resources = { ...emptyBag(), wood: 2 };
    state.players[first].resources = { ...emptyBag(), ore: 1 };
    state.players[second].resources = { ...emptyBag(), brick: 1 };
    state = applyGameAction(state, actor, { type: "trade:offer", to: first, give: { ...emptyBag(), wood: 2 }, want: { ...emptyBag(), ore: 1 } }, random);
    const originalId = state.pendingTrade!.id;
    state = applyGameAction(state, first, { type: "trade:counter", offerId: originalId, give: { ...emptyBag(), ore: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    state = applyGameAction(state, second, { type: "trade:counter", offerId: originalId, give: { ...emptyBag(), brick: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    const [declined, accepted] = state.counterOffers.map(offer => offer.id);
    expect(() => applyGameAction(state, first, { type: "trade:decline", offerId: accepted }, random)).toThrow("Oferta indisponível");
    state = applyGameAction(state, actor, { type: "trade:decline", offerId: declined }, random);
    expect(state.counterOffers.map(offer => offer.id)).toEqual([accepted]);
    state = applyGameAction(state, actor, { type: "trade:accept", offerId: accepted }, random);
    expect(state.players[actor].resources).toMatchObject({ wood: 1, brick: 1 });
    expect(state.counterOffers).toHaveLength(0);
  });

  it("permite retirar apenas a própria contraproposta", () => {
    let state = completeSetup(createGame(players, "counter-withdraw", 10, random));
    state.phase = "actions";
    const actor = state.currentPlayerId;
    const [first, second] = state.playerOrder.filter(id => id !== actor);
    state.players[actor].resources = { ...emptyBag(), wood: 2 };
    state.players[first].resources = { ...emptyBag(), ore: 1 };
    state.players[second].resources = { ...emptyBag(), brick: 1 };
    state = applyGameAction(state, actor, { type: "trade:offer", to: first, give: { ...emptyBag(), wood: 2 }, want: { ...emptyBag(), ore: 1 } }, random);
    const originalId = state.pendingTrade!.id;
    state = applyGameAction(state, first, { type: "trade:counter", offerId: originalId, give: { ...emptyBag(), ore: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    state = applyGameAction(state, second, { type: "trade:counter", offerId: originalId, give: { ...emptyBag(), brick: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    const [withdrawn, remaining] = state.counterOffers.map(offer => offer.id);
    expect(() => applyGameAction(state, second, { type: "trade:cancel", offerId: withdrawn }, random)).toThrow("Oferta indisponível");
    state = applyGameAction(state, first, { type: "trade:cancel", offerId: withdrawn }, random);
    expect(state.pendingTrade?.id).toBe(originalId);
    expect(state.counterOffers.map(offer => offer.id)).toEqual([remaining]);
  });

  it("permite a B e C propor ao jogador da vez antes de qualquer oferta dele", () => {
    let state = completeSetup(createGame(players, "unsolicited-offers", 10, random));
    state.phase = "actions";
    const actor = state.currentPlayerId;
    const [first, second] = state.playerOrder.filter(id => id !== actor);
    state.players[actor].resources = { ...emptyBag(), wood: 2 };
    state.players[first].resources = { ...emptyBag(), ore: 1 };
    state.players[second].resources = { ...emptyBag(), brick: 1 };
    expect(state.pendingTrade).toBeNull();
    state = applyGameAction(state, first, { type: "trade:offer", to: actor, give: { ...emptyBag(), ore: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    state = applyGameAction(state, second, { type: "trade:offer", to: actor, give: { ...emptyBag(), brick: 1 }, want: { ...emptyBag(), wood: 1 } }, random);
    expect(state.counterOffers).toHaveLength(2);
    expect(() => applyGameAction(state, first, { type: "trade:offer", to: second, give: { ...emptyBag(), ore: 1 }, want: { ...emptyBag(), wood: 1 } }, random)).toThrow("jogador da vez");
    state = applyGameAction(state, actor, { type: "trade:offer", to: first, give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), ore: 1 } }, random);
    expect(state.counterOffers).toHaveLength(2);
    const originalId = state.pendingTrade!.id;
    state = applyGameAction(state, actor, { type: "trade:cancel", offerId: originalId }, random);
    expect(state.counterOffers).toHaveLength(2);
    state = applyGameAction(state, actor, { type: "trade:accept", offerId: state.counterOffers[1].id }, random);
    expect(state.players[actor].resources).toMatchObject({ wood: 1, brick: 1 });
    expect(state.counterOffers).toHaveLength(0);
  });

  it("obriga o descarte após um 7 e resolve o ladrão antes das ações", () => {
    let state = completeSetup(createGame(players, "robber", 10, random));
    const actor = state.currentPlayerId;
    const victim = state.playerOrder.find(id => id !== actor)!;
    state.players[actor].resources = { ...emptyBag(), wood: 8 };
    const hex = Object.values(state.board.hexes).find(item => item.id !== state.board.robberHex && item.terrain !== "desert" && item.vertices.some(id => state.structures[id]?.owner === victim))!;
    const terrain = hex.terrain;
    if (terrain === "desert") throw new Error("O terreno escolhido deve produzir recurso.");
    const other = RESOURCES.find(resource => resource !== terrain)!;
    state.players[victim].resources = { ...emptyBag(), [terrain]: 1, [other]: 1 };
    const rolls = [2, 3];
    state = applyGameAction(state, actor, { type: "turn:roll" }, () => rolls.shift()!);
    expect(state.phase).toBe("discard");
    expect(state.discardRequired[actor]).toBe(4);
    expect(() => applyGameAction(state, actor, { type: "robber:discard", resources: { ...emptyBag(), wood: 3 } })).toThrow("Descarte inválido");
    state = applyGameAction(state, actor, { type: "robber:discard", resources: { ...emptyBag(), wood: 4 } });
    expect(state.phase).toBe("move_robber");
    state = applyGameAction(state, actor, { type: "robber:move", hexId: hex.id });
    expect(state.phase).toBe("choose_victim");
    const stolen = RESOURCES.find(resource => state.players[victim].resources[resource] > 0)!;
    const actorBefore = state.players[actor].resources[stolen];
    state = applyGameAction(state, actor, { type: "robber:steal", victimId: victim }, random);
    expect(state.phase).toBe("actions");
    expect(state.players[victim].resources[stolen]).toBe(0);
    expect(state.players[actor].resources[stolen]).toBe(actorBefore + 1);
  });

  it("espera todos os descartes antes de liberar o movimento do ladrão", () => {
    let state = completeSetup(createGame(players, "robber-multiple-discards", 10, random));
    const actor = state.currentPlayerId;
    const other = state.playerOrder.find(id => id !== actor)!;
    state.players[actor].resources = { ...emptyBag(), wood: 8 };
    state.players[other].resources = { ...emptyBag(), brick: 9 };
    const rolls = [2, 3];
    state = applyGameAction(state, actor, { type: "turn:roll" }, () => rolls.shift()!);
    expect(state.phase).toBe("discard");
    expect(state.discardRequired).toMatchObject({ [actor]: 4, [other]: 4 });

    state = applyGameAction(state, actor, { type: "robber:discard", resources: { ...emptyBag(), wood: 4 } });
    expect(state.phase).toBe("discard");
    expect(state.discardRequired).toEqual({ [other]: 4 });
    expect(() => applyGameAction(state, actor, { type: "robber:move", hexId: state.board.robberHex })).toThrow("Ação indisponível nesta fase");

    state = applyGameAction(state, other, { type: "robber:discard", resources: { ...emptyBag(), brick: 4 } });
    expect(state.phase).toBe("move_robber");
    expect(state.discardRequired).toEqual({});
  });

  it("rouba uma carta aleatória mesmo se o vizinho não possui o recurso do terreno", () => {
    let state = completeSetup(createGame(players, "robber-terrain", 10, random));
    const actor = state.currentPlayerId;
    const victim = state.playerOrder.find(id => id !== actor)!;
    const hex = Object.values(state.board.hexes).find(item => item.id !== state.board.robberHex && item.terrain !== "desert" && item.vertices.some(id => state.structures[id]?.owner === victim))!;
    const other = RESOURCES.find(resource => resource !== hex.terrain)!;
    for (const id of state.playerOrder) if (id !== actor) state.players[id].resources = emptyBag();
    state.players[victim].resources = { ...emptyBag(), [other]: 1 };
    state.phase = "move_robber";
    state = applyGameAction(state, actor, { type: "robber:move", hexId: hex.id });
    expect(state.robberVictims).toEqual([victim]);
    expect(state.phase).toBe("choose_victim");
    state = applyGameAction(state, actor, { type: "robber:steal", victimId: victim }, random);
    expect(state.players[victim].resources[other]).toBe(0);
    expect(state.players[actor].resources[other]).toBe(1);
  });

  it("mantém escassez do banco e encerra a partida ao atingir a meta", () => {
    let state = completeSetup(createGame(players, "scarcity", 10, random));
    const actor = state.currentPlayerId;
    const hex = Object.values(state.board.hexes).find(item => item.number === 2)!;
    const resource = hex.terrain;
    if (resource === "desert") throw new Error("Hex de número 2 não pode ser deserto");
    state.structures[hex.vertices[0]] = { owner: actor, kind: "settlement" };
    state.bank[resource] = 0;
    const before = state.players[actor].resources[resource];
    state = applyGameAction(state, actor, { type: "turn:roll" }, random);
    expect(state.players[actor].resources[resource]).toBe(before);
    state.victoryTarget = 3;
    const ownSettlement = Object.keys(state.structures).find(id => state.structures[id].owner === actor)!;
    state.players[actor].resources.ore = 3;
    state.players[actor].resources.wheat = 2;
    state = applyGameAction(state, actor, { type: "build:city", vertexId: ownSettlement });
    expect(state.winner).toBe(actor);
    expect(state.phase).toBe("finished");
  });

  it("impede jogar a carta comprada no mesmo turno ou uma segunda carta", () => {
    let state = completeSetup(createGame(players, "cards", 10, random));
    const actor = state.currentPlayerId;
    state.phase = "actions";
    state.players[actor].dev.push({ id: "old", kind: "monopoly", boughtTurn: -1 }, { id: "new", kind: "knight", boughtTurn: state.turn });
    expect(() => applyGameAction(state, actor, { type: "dev:play", cardId: "new" })).toThrow("não pode");
    state = applyGameAction(state, actor, { type: "dev:play", cardId: "old", resource: "wood" });
    state.players[actor].dev.push({ id: "second", kind: "year_plenty", boughtTurn: -1 });
    expect(() => applyGameAction(state, actor, { type: "dev:play", cardId: "second", resources: ["wood", "brick"] })).toThrow("já jogou");
  });

  it("revela pontos secretos somente após o encerramento", () => {
    let state = completeSetup(createGame(players, "secret-points", 10, random));
    const actor = state.currentPlayerId;
    state.players[actor].dev.push({ id: "secret", kind: "victory", boughtTurn: 0 });
    const before = projectGame(state, actor);
    expect(before.finalScores).toBeNull();
    expect(before.scores[actor]).toBe(2);
    state.phase = "actions";
    state.victoryTarget = 4;
    const ownSettlement = Object.keys(state.structures).find(id => state.structures[id].owner === actor)!;
    state.players[actor].resources = { ...emptyBag(), ore: 3, wheat: 2 };
    state = applyGameAction(state, actor, { type: "build:city", vertexId: ownSettlement });
    expect(state.phase).toBe("actions");
    state = applyGameAction(state, actor, { type: "dev:play", cardId: "secret" });
    expect(state.phase).toBe("finished");
    expect(projectGame(state, actor).finalScores?.[actor]).toBe(4);
  });
});
