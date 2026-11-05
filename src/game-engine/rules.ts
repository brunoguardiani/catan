import { bagTotal, emptyBag, RESOURCES, type Board, type GameState, type LegalMoves, type Resource, type ResourceBag } from "./types";
import { CLASSIC_RULES, robberDestinations } from "./configuration";

export const COST = {
  road: { wood: 1, brick: 1, wool: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, wool: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, wool: 0, wheat: 2, ore: 3 },
  development: { wood: 0, brick: 0, wool: 1, wheat: 1, ore: 1 },
} satisfies Record<string, ResourceBag>;

export function canPay(have: ResourceBag, cost: ResourceBag) {
  return RESOURCES.every(resource => have[resource] >= cost[resource]);
}
export function pay(have: ResourceBag, bank: ResourceBag, cost: ResourceBag) {
  if (!canPay(have, cost)) throw new Error("Recursos insuficientes.");
  for (const resource of RESOURCES) { have[resource] -= cost[resource]; bank[resource] += cost[resource]; }
}

export function adjacentVertices(board: Board, vertexId: string) {
  const vertex = board.vertices[vertexId];
  if (!vertex) return [];
  return vertex.edges.map(edgeId => {
    const edge = board.edges[edgeId];
    return edge.a === vertexId ? edge.b : edge.a;
  });
}

export function legalSettlement(state: GameState, playerId: string, vertexId: string, setup: boolean) {
  const vertex = state.board.vertices[vertexId];
  if (!vertex || state.structures[vertexId]) return false;
  if (adjacentVertices(state.board, vertexId).some(neighbor => state.structures[neighbor])) return false;
  return setup || vertex.edges.some(edgeId => state.roads[edgeId] === playerId);
}

export function legalRoad(state: GameState, playerId: string, edgeId: string, setupVertex?: string) {
  const edge = state.board.edges[edgeId];
  if (!edge || state.roads[edgeId]) return false;
  if (setupVertex) return edge.a === setupVertex || edge.b === setupVertex;
  return [edge.a, edge.b].some(vertexId => {
    const building = state.structures[vertexId];
    if (building?.owner === playerId) return true;
    if (building && building.owner !== playerId && !(state.rules ?? CLASSIC_RULES).roadsThroughOpponents) return false;
    return state.board.vertices[vertexId].edges.some(connected => state.roads[connected] === playerId);
  });
}

export function roadCount(state: GameState, playerId: string) {
  return Object.values(state.roads).filter(owner => owner === playerId).length;
}
export function structureCount(state: GameState, playerId: string, kind: "settlement" | "city") {
  return Object.values(state.structures).filter(building => building.owner === playerId && building.kind === kind).length;
}

export function longestRoad(state: GameState, playerId: string) {
  const owned = Object.keys(state.roads).filter(edgeId => state.roads[edgeId] === playerId);
  const walk = (vertexId: string, used: Set<string>): number => {
    const blocker = state.structures[vertexId];
    if (used.size > 0 && blocker && blocker.owner !== playerId && !(state.rules ?? CLASSIC_RULES).roadsThroughOpponents) return 0;
    let best = 0;
    for (const edgeId of state.board.vertices[vertexId].edges) {
      if (state.roads[edgeId] !== playerId || used.has(edgeId)) continue;
      const edge = state.board.edges[edgeId];
      used.add(edgeId);
      best = Math.max(best, 1 + walk(edge.a === vertexId ? edge.b : edge.a, used));
      used.delete(edgeId);
    }
    return best;
  };
  let best = 0;
  for (const edgeId of owned) {
    const edge = state.board.edges[edgeId];
    best = Math.max(best, walk(edge.a, new Set()), walk(edge.b, new Set()));
  }
  return best;
}

function award(current: string | null, values: Record<string, number>, minimum: number) {
  const maximum = Math.max(0, ...Object.values(values));
  if (maximum < minimum) return null;
  const leaders = Object.keys(values).filter(id => values[id] === maximum);
  if (leaders.length === 1) return leaders[0];
  return current && leaders.includes(current) ? current : null;
}

export function updateAwards(state: GameState) {
  const roads = Object.fromEntries(state.playerOrder.map(id => [id, longestRoad(state, id)]));
  const armies = Object.fromEntries(state.playerOrder.map(id => [id, state.players[id].knights]));
  state.longestRoadOwner = award(state.longestRoadOwner, roads, 5);
  state.largestArmyOwner = award(state.largestArmyOwner, armies, 3);
}

export function score(state: GameState, playerId: string, includeSecret = true) {
  let points = 0;
  for (const building of Object.values(state.structures)) if (building.owner === playerId) points += building.kind === "city" ? 2 : 1;
  if (state.longestRoadOwner === playerId) points += 2;
  if (state.largestArmyOwner === playerId) points += 2;
  if (includeSecret) points += state.players[playerId].dev.filter(card => card.kind === "victory").length;
  return points;
}

export function legalMoves(state: GameState, playerId: string): LegalMoves {
  const result: LegalMoves = { vertices: [], edges: [], hexes: [] };
  if (state.phase === "setup_settlement" && state.currentPlayerId === playerId) {
    result.vertices = Object.keys(state.board.vertices).filter(id => legalSettlement(state, playerId, id, true));
  } else if (state.phase === "setup_road" && state.currentPlayerId === playerId && state.setupVertex) {
    result.edges = Object.keys(state.board.edges).filter(id => legalRoad(state, playerId, id, state.setupVertex!));
  } else if (state.phase === "actions" && state.currentPlayerId === playerId) {
    if (roadCount(state, playerId) < 15 && (state.freeRoads > 0 || canPay(state.players[playerId].resources, COST.road))) {
      result.edges = Object.keys(state.board.edges).filter(id => legalRoad(state, playerId, id));
    }
    if (structureCount(state, playerId, "settlement") < 5 && canPay(state.players[playerId].resources, COST.settlement)) {
      result.vertices = Object.keys(state.board.vertices).filter(id => legalSettlement(state, playerId, id, false));
    }
  } else if (state.phase === "before_roll" && state.currentPlayerId === playerId && state.freeRoads > 0 && roadCount(state, playerId) < 15) {
    result.edges = Object.keys(state.board.edges).filter(id => legalRoad(state, playerId, id));
  } else if (state.phase === "move_robber" && state.currentPlayerId === playerId) {
    result.hexes = robberDestinations(state.board, state.rules);
  }
  return result;
}

export function tradeRate(state: GameState, playerId: string, resource: Resource) {
  const ports = Object.entries(state.structures)
    .filter(([, building]) => building.owner === playerId)
    .map(([vertexId]) => state.board.vertices[vertexId]?.port);
  if (ports.includes(resource)) return 2;
  if (ports.includes("any")) return 3;
  return 4;
}

export function validateBag(value: ResourceBag) {
  return RESOURCES.every(resource => Number.isSafeInteger(value[resource]) && value[resource] >= 0) && bagTotal(value) <= 100;
}

export function resourceDemand(state: GameState, roll: number) {
  const demand: Record<string, ResourceBag> = Object.fromEntries(state.playerOrder.map(id => [id, emptyBag()]));
  for (const hex of Object.values(state.board.hexes)) {
    if (hex.number !== roll || hex.id === state.board.robberHex || hex.terrain === "desert") continue;
    for (const vertexId of hex.vertices) {
      const building = state.structures[vertexId];
      if (building) demand[building.owner][hex.terrain] += building.kind === "city" ? 2 : 1;
    }
  }
  return demand;
}

export function produce(state: GameState, roll: number) {
  const demand = resourceDemand(state, roll);
  for (const resource of RESOURCES) {
    const total = state.playerOrder.reduce((sum, id) => sum + demand[id][resource], 0);
    if (state.bank[resource] < total) continue;
    for (const id of state.playerOrder) {
      state.players[id].resources[resource] += demand[id][resource];
      state.bank[resource] -= demand[id][resource];
    }
  }
}
