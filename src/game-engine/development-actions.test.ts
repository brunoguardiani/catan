import { describe, expect, it } from "vitest";
import { applyGameAction, projectGame } from "./game";
import { createTestGame } from "./test-mode";

describe("cartas de desenvolvimento especiais", () => {
  it("o monopólio tira apenas o recurso escolhido dos adversários e registra a coleta", () => {
    const state = createTestGame();
    state.players["test-a"].dev.push({ id: "mono", kind: "monopoly", boughtTurn: 0 });
    state.players["test-a"].resources.wood = 2;
    state.players["test-b"].resources.wood = 4;
    state.players["test-b"].resources.brick = 3;
    const next = applyGameAction(state, "test-a", { type: "dev:play", cardId: "mono", resource: "wood" });
    expect(next.players["test-a"].resources.wood).toBe(6);
    expect(next.players["test-b"].resources).toMatchObject({ wood: 0, brick: 3 });
    expect(next.events.at(-1)?.effect).toEqual({ kind: "monopoly", playerId: "test-a", resource: "wood", taken: { "test-b": 4 } });
  });

  it("o ano de abundância entrega duas cartas iguais do banco sem tocar na mão adversária", () => {
    const state = createTestGame();
    state.players["test-a"].dev.push({ id: "plenty", kind: "year_plenty", boughtTurn: 0 });
    state.players["test-b"].resources.ore = 5;
    const bankBefore = state.bank.ore;
    const next = applyGameAction(state, "test-a", { type: "dev:play", cardId: "plenty", resources: ["ore", "ore"] });
    expect(next.players["test-a"].resources.ore).toBe(2);
    expect(next.players["test-b"].resources.ore).toBe(5);
    expect(next.bank.ore).toBe(bankBefore - 2);
  });

  it("o construtor destaca caminhos válidos e gasta duas pontes gratuitas", () => {
    let state = createTestGame();
    state.players["test-a"].dev.push({ id: "bridges", kind: "road_building", boughtTurn: 0 });
    const originalHand = { ...state.players["test-a"].resources };
    state = applyGameAction(state, "test-a", { type: "dev:play", cardId: "bridges" });
    expect(state.freeRoads).toBe(2);
    for (const remaining of [1, 0]) {
      const edgeId = projectGame(state, "test-a").legal.edges[0];
      expect(edgeId).toBeTruthy();
      state = applyGameAction(state, "test-a", { type: "build:road", edgeId });
      expect(state.freeRoads).toBe(remaining);
    }
    expect(state.players["test-a"].resources).toEqual(originalHand);
  });

  it("pontos secretos só encerram o jogo quando a carta é usada com o objetivo alcançado", () => {
    let state = createTestGame();
    expect(state.victoryTarget).toBe(10);
    state.players["test-a"].dev.push(
      { id: "point-1", kind: "victory", boughtTurn: state.turn },
      { id: "point-2", kind: "victory", boughtTurn: state.turn },
    );
    const availableVertices = Object.keys(state.board.vertices).filter(id => !state.structures[id]);
    for (const id of availableVertices.slice(0, 3)) state.structures[id] = { owner: "test-a", kind: "city" };
    expect(projectGame(state, "test-a").scores["test-a"]).toBe(7);
    expect(() => applyGameAction(state, "test-a", { type: "dev:play", cardId: "point-1" })).toThrow("precisa de 10 pontos");
    state.structures[availableVertices[3]] = { owner: "test-a", kind: "settlement" };
    expect(projectGame(state, "test-a").scores["test-a"]).toBe(8);
    state.players["test-a"].playedDevTurn = state.turn;
    const next = applyGameAction(state, "test-a", { type: "dev:play", cardId: "point-1" });
    expect(next.phase).toBe("finished");
    expect(next.winner).toBe("test-a");
    expect(projectGame(next, "test-a").finalScores?.["test-a"]).toBe(10);
    expect(next.players["test-a"].dev.filter(card => card.kind === "victory")).toHaveLength(2);
  });
});
