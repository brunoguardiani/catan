import { describe, expect, it } from "vitest";
import { applyMapDraft, baseBoard, boardToDraft, CLASSIC_RULES, defaultRandomOptions, mapIssues, robberDestinations } from "./configuration";
import { applyGameAction, createGame } from "./game";
import { legalRoad, longestRoad } from "./rules";

describe("configuração real da partida", () => {
  it("gera mapas aleatórios reproduzíveis com o ladrão em um deserto", () => {
    const options = { ...defaultRandomOptions("expanded"), desertCount: 3 };
    const a = baseBoard("expanded", "random", "seed-teste", options);
    const b = baseBoard("expanded", "random", "seed-teste", options);
    expect(a).toEqual(b);
    expect(Object.values(a.hexes).filter(hex => hex.terrain === "desert")).toHaveLength(3);
    expect(Object.values(a.hexes).filter(hex => hex.number !== null)).toHaveLength(27);
    expect(Object.values(a.edges).filter(edge => edge.port)).toHaveLength(11);
    expect(a.hexes[a.robberHex].terrain).toBe("desert");
    expect(mapIssues("expanded", boardToDraft(a, true)).errors).toEqual([]);
  });
  it("aceita os mapas gerados nas duas modalidades e preserva o mapa aplicado", () => {
    for (const size of ["standard", "expanded"] as const) {
      const board = baseBoard(size, "classic", "");
      const draft = boardToDraft(board);
      expect(mapIssues(size, draft).errors).toEqual([]);
      const edited = applyMapDraft(size, draft, "manual");
      const state = createGame(["a", "b", "c"], "manual", 10, () => 0, size, edited);
      expect(state.board).toEqual(edited);
      expect(state.board).not.toBe(edited);
    }
  });

  it("valida números, desertos e portos, permitindo distribuição livre jogável", () => {
    const board = baseBoard("standard", "classic", "");
    const draft = boardToDraft(board);
    const land = draft.tiles.find(tile => tile.terrain !== "desert")!;
    land.number = null;
    expect(mapIssues("standard", draft).errors.some(error => error.includes("ficha"))).toBe(true);
    land.number = 8;
    draft.freeDistribution = true;
    expect(mapIssues("standard", draft).errors).toEqual([]);
    draft.ports.push({ edgeId: Object.values(board.edges).find(edge => edge.hexes.length === 2)!.id, type: "any" });
    expect(mapIssues("standard", draft).errors.some(error => error.includes("costa"))).toBe(true);
  });

  it("permite 6 e 8 vizinhos e exige início do ladrão em um deserto", () => {
    const board = baseBoard("standard", "classic", "");
    const draft = boardToDraft(board, true);
    const edge = Object.values(board.edges).find(item => item.hexes.length === 2 && item.hexes.every(id => board.hexes[id].terrain !== "desert"))!;
    draft.tiles.find(tile => tile.id === edge.hexes[0])!.number = 6;
    draft.tiles.find(tile => tile.id === edge.hexes[1])!.number = 8;
    expect(mapIssues("standard", draft).errors).toEqual([]);
    draft.robberHex = edge.hexes[0];
    expect(mapIssues("standard", draft).errors.some(error => error.includes("deserto"))).toBe(true);
  });

  it("combina movimento adjacente e salto entre desertos sem permitir permanecer no lugar", () => {
    const board = baseBoard("expanded", "classic", "");
    const deserts = Object.values(board.hexes).filter(hex => hex.terrain === "desert");
    board.robberHex = deserts[0].id;
    const distant = deserts[1].id;
    const adjacent = new Set(board.hexes[deserts[0].id].edges.flatMap(edgeId => board.edges[edgeId].hexes));
    if (adjacent.has(distant)) {
      const alternative = Object.values(board.hexes).find(hex => !adjacent.has(hex.id) && hex.terrain !== "desert")!;
      const old = deserts[1]; old.terrain = "wood";
      alternative.terrain = "desert";
    }
    const otherDesert = Object.values(board.hexes).find(hex => hex.terrain === "desert" && hex.id !== board.robberHex)!.id;
    expect(robberDestinations(board, { ...CLASSIC_RULES, adjacentRobber: true })).not.toContain(otherDesert);
    expect(robberDestinations(board, { ...CLASSIC_RULES, adjacentRobber: true, desertJump: true })).toContain(otherDesert);
    expect(robberDestinations(board, CLASSIC_RULES)).not.toContain(board.robberHex);
    expect(robberDestinations(board, CLASSIC_RULES)).toContain(otherDesert);
  });

  it("a mesma regra permite construir e mantém a Maior Estrada através do adversário", () => {
    const state = createGame(["a", "b", "c"], "roads", 10, () => 0);
    const vertex = Object.values(state.board.vertices).find(item => item.edges.length === 3)!;
    const [first, second] = vertex.edges;
    state.roads[first] = "a";
    state.structures[vertex.id] = { owner: "b", kind: "settlement" };
    expect(legalRoad(state, "a", second)).toBe(false);
    state.roads[second] = "a";
    expect(longestRoad(state, "a")).toBe(1);
    delete state.roads[second];
    state.rules = { ...CLASSIC_RULES, roadsThroughOpponents: true };
    expect(legalRoad(state, "a", second)).toBe(true);
    state.roads[second] = "a";
    expect(longestRoad(state, "a")).toBe(2);
  });

  it("mantém o descarte fixo acima de sete cartas", () => {
    const base = createGame(["a", "b", "c"], "robber-rules", 10, () => 0);
    base.phase = "before_roll";
    base.players.a.resources.wood = 8;
    const classic = applyGameAction(base, "a", { type: "turn:roll" }, (() => { const dice = [2, 3]; return () => dice.shift()!; })());
    expect(classic.discardRequired.a).toBe(4);
    base.players.a.resources.wood = 7;
    const safe = applyGameAction(base, "a", { type: "turn:roll" }, (() => { const dice = [2, 3]; return () => dice.shift()!; })());
    expect(safe.discardRequired).toEqual({});
  });

  it("permite roubar de um vizinho ao mover para outro deserto", () => {
    const state = createGame(["a", "b", "c"], "desert-steal", 10, () => 0, "expanded");
    const desert = Object.values(state.board.hexes).find(hex => hex.terrain === "desert" && hex.id !== state.board.robberHex)!;
    state.phase = "move_robber";
    state.structures[desert.vertices[0]] = { owner: "b", kind: "settlement" };
    state.players.b.resources.ore = 1;
    const moved = applyGameAction(state, "a", { type: "robber:move", hexId: desert.id });
    expect(moved.robberVictims).toContain("b");
    const stolen = applyGameAction(moved, "a", { type: "robber:steal", victimId: "b" }, () => 0);
    expect(stolen.players.a.resources.ore).toBe(1);
  });
});
