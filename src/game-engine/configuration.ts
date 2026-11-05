import { createBoard, seedRandom } from "./board";
import type { Board, GameRules, MapDraft, Port, RandomMapOptions, Terrain } from "./types";

export const CLASSIC_RULES: GameRules = {
  adjacentRobber: false, desertJump: false, roadsThroughOpponents: false,
};

export type MapGeneration = "classic" | "random" | "manual";
export type MapSize = "standard" | "expanded";
export const DEFAULT_RANDOM_OPTIONS: RandomMapOptions = {
  desertCount: 1,
};

export function defaultRandomOptions(size: MapSize): RandomMapOptions {
  return { ...DEFAULT_RANDOM_OPTIONS, desertCount: size === "expanded" ? 2 : 1 };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function baseBoard(size: MapSize, generation: MapGeneration, seed: string, options: RandomMapOptions = defaultRandomOptions(size)) {
  const board = createBoard(generation === "classic" ? `classic-${size}` : seed || `random-${size}`, size === "expanded" ? 6 : 4, size);
  if (generation !== "random") return board;
  const random = seedRandom(`${seed || `random-${size}`}:options`);
  const hexes = Object.values(board.hexes);
  if (options.desertCount !== (size === "expanded" ? 2 : 1)) {
    const resources: Terrain[] = ["wood", "brick", "wool", "wheat", "ore"];
    const count = Math.max(1, Math.min(hexes.length - 5, options.desertCount));
    const deck: Terrain[] = [...Array<Terrain>(count).fill("desert"), ...resources];
    while (deck.length < hexes.length) deck.push(resources[Math.floor(random() * resources.length)]);
    shuffle(deck, random).forEach((terrain, index) => { hexes[index].terrain = terrain; });
  }
  const land = hexes.filter(hex => hex.terrain !== "desert");
  const referenceNumbers = Object.values(createBoard(`reference-${size}`, size === "expanded" ? 6 : 4, size).hexes)
    .map(hex => hex.number).filter((number): number is number => number !== null);
  const choices = [2,3,4,5,6,8,9,10,11,12];
  const baseNumbers = [...referenceNumbers];
  while (baseNumbers.length < land.length) baseNumbers.push(choices[Math.floor(random() * choices.length)]);
  const numbers = shuffle(baseNumbers, random).slice(0, land.length);
  hexes.forEach(hex => { hex.number = null; });
  land.forEach((hex, index) => { hex.number = numbers[index]; });
  const deserts = hexes.filter(hex => hex.terrain === "desert");
  board.robberHex = deserts[0].id;
  return board;
}

export function boardToDraft(board: Board, freeDistribution = false): MapDraft {
  return {
    tiles: Object.values(board.hexes).map(({ id, terrain, number }) => ({ id, terrain, number })),
    ports: Object.values(board.edges).filter(edge => edge.port).map(edge => ({ edgeId: edge.id, type: edge.port! })),
    robberHex: board.robberHex, freeDistribution,
  };
}

export function mapIssues(size: MapSize, draft: MapDraft): { errors: string[]; warnings: string[] } {
  const board = baseBoard(size, "classic", "");
  const errors: string[] = [], warnings: string[] = [];
  const expected = Object.keys(board.hexes);
  const ids = draft.tiles.map(tile => tile.id);
  if (ids.length !== expected.length || new Set(ids).size !== expected.length || ids.some(id => !board.hexes[id])) errors.push("A geometria do mapa não corresponde à modalidade.");
  const validNumbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  for (const tile of draft.tiles) {
    if (!board.hexes[tile.id]) continue;
    if (tile.terrain === "desert" && tile.number !== null) errors.push(`Deserto ${tile.id} não pode ter ficha.`);
    if (tile.terrain !== "desert" && !validNumbers.includes(tile.number ?? -1)) errors.push(`Falta uma ficha válida em ${tile.id}.`);
  }
  if (!draft.tiles.some(tile => tile.terrain === "desert")) errors.push("O mapa precisa de pelo menos um deserto.");
  if (!draft.tiles.some(tile => tile.id === draft.robberHex && tile.terrain === "desert")) errors.push("O ladrão deve começar em um deserto.");
  if (draft.tiles.filter(tile => tile.terrain !== "desert").length < 5) errors.push("O mapa precisa de terrenos produtivos suficientes para uma partida.");
  for (const resource of ["wood", "brick", "wool", "wheat", "ore"] as const) if (!draft.tiles.some(tile => tile.terrain === resource)) errors.push(`O mapa precisa de pelo menos um terreno de ${resource}.`);
  const usedEdges = new Set<string>();
  const usedVertices = new Set<string>();
  for (const port of draft.ports) {
    const edge = board.edges[port.edgeId];
    if (!edge || edge.hexes.length !== 1 || usedEdges.has(port.edgeId)) errors.push("Há um porto fora da costa ou duplicado.");
    else {
      if (usedVertices.has(edge.a) || usedVertices.has(edge.b)) errors.push("Portos não podem compartilhar vértices.");
      usedVertices.add(edge.a); usedVertices.add(edge.b); usedEdges.add(port.edgeId);
    }
  }
  if (!draft.freeDistribution) {
    const reference = baseBoard(size, "classic", "");
    const count = <T extends string | number | null>(values: T[]) => JSON.stringify([...values].sort());
    if (count(draft.tiles.map(tile => tile.terrain)) !== count(Object.values(reference.hexes).map(hex => hex.terrain))) errors.push("No modo padrão, mantenha a quantidade original de cada terreno.");
    if (count(draft.tiles.map(tile => tile.number)) !== count(Object.values(reference.hexes).map(hex => hex.number))) errors.push("No modo padrão, mantenha a quantidade original de cada número.");
    if (count(draft.ports.map(port => port.type)) !== count(Object.values(reference.edges).filter(edge => edge.port).map(edge => edge.port!))) errors.push("No modo padrão, mantenha a quantidade original de cada porto.");
  } else warnings.push("Distribuição livre: o mapa pode ficar desbalanceado.");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function applyMapDraft(size: MapSize, draft: MapDraft, seed: string): Board {
  const issues = mapIssues(size, draft);
  if (issues.errors.length) throw new Error(issues.errors.join(" "));
  const board = baseBoard(size, "classic", "");
  for (const tile of draft.tiles) {
    board.hexes[tile.id].terrain = tile.terrain as Terrain;
    board.hexes[tile.id].number = tile.number;
  }
  for (const edge of Object.values(board.edges)) delete edge.port;
  for (const vertex of Object.values(board.vertices)) delete vertex.port;
  for (const { edgeId, type } of draft.ports) {
    const edge = board.edges[edgeId];
    edge.port = type as Port;
    board.vertices[edge.a].port = type;
    board.vertices[edge.b].port = type;
  }
  board.robberHex = draft.robberHex;
  board.seed = seed;
  return board;
}

export function robberDestinations(board: Board, rules: GameRules = CLASSIC_RULES): string[] {
  const current = board.hexes[board.robberHex];
  if (!current) return [];
  const adjacent = new Set(current.edges.flatMap(edgeId => board.edges[edgeId].hexes));
  return Object.values(board.hexes).filter(hex => hex.id !== current.id && (
    !rules.adjacentRobber || adjacent.has(hex.id) ||
    (rules.desertJump && current.terrain === "desert" && hex.terrain === "desert")
  )).map(hex => hex.id);
}
