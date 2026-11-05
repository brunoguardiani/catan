import { describe, expect, it } from "vitest";
import { projectGame } from "./game";
import { applyTestCommand, createTestGame, TEST_PLAYERS } from "./test-mode";

describe("modo de teste local", () => {
  it("prepara dois jogadores, permite editar cartas e roubar recursos", () => {
    let state = createTestGame();
    expect(state.playerOrder).toEqual([...TEST_PLAYERS]);
    expect(state.phase).toBe("actions");
    state = applyTestCommand(state, { type: "cards", playerId: "test-a", resource: "wood", amount: 12 });
    state = applyTestCommand(state, { type: "steal", from: "test-a", to: "test-b", resource: "wood", amount: 3 });
    expect(projectGame(state, "test-b").myResources.wood).toBe(3);
    expect(state.players["test-a"].resources.wood).toBe(9);
    expect(() => applyTestCommand(state, { type: "steal", from: "test-a", to: "test-b", resource: "wood", amount: 10 })).toThrow("cartas suficientes");
  });

  it("dispara a conquista e depois a animação de tomada dos dois títulos", () => {
    let state = createTestGame();
    for (const award of ["longestRoad", "largestArmy"] as const) {
      state = applyTestCommand(state, { type: "award", award, to: "test-a" });
      expect(state.events.at(-1)?.effect).toEqual({ kind: "cue", cue: award, playerId: "test-a" });
      state = applyTestCommand(state, { type: "award", award, to: "test-b" });
      expect(state.events.at(-1)?.effect).toEqual({ kind: "award_transferred", award, from: "test-a", to: "test-b" });
    }
    expect(projectGame(state, "test-b").scores["test-b"]).toBe(5);
  });

  it("espera os dois descartes antes de liberar o ladrão", () => {
    let state = createTestGame();
    state = applyTestCommand(state, { type: "cards", playerId: "test-a", resource: "wood", amount: 8 });
    state = applyTestCommand(state, { type: "cards", playerId: "test-b", resource: "brick", amount: 8 });
    state = applyTestCommand(state, { type: "forceDiscard", playerId: "test-a" });
    expect(state.discardRequired).toEqual({ "test-a": 4, "test-b": 4 });
    state = applyTestCommand(state, { type: "gameAction", actor: "test-a", action: { type: "robber:discard", resources: { wood: 4, brick: 0, wool: 0, wheat: 0, ore: 0 } } });
    expect(state.phase).toBe("discard");
    state = applyTestCommand(state, { type: "gameAction", actor: "test-b", action: { type: "robber:discard", resources: { wood: 0, brick: 4, wool: 0, wheat: 0, ore: 0 } } });
    expect(state.phase).toBe("move_robber");
  });

  it("permite vencer no teste com uma casa e nove cartas de ponto de vitória", () => {
    let state = createTestGame();
    for (let index = 0; index < 9; index++) state = applyTestCommand(state, { type: "development", playerId: "test-a", card: "victory" });
    const view = projectGame(state, "test-a");
    expect(view.victoryTarget).toBe(10);
    expect(view.scores["test-a"]).toBe(1);
    expect(view.myDev.filter(card => card.kind === "victory")).toHaveLength(9);
    state = applyTestCommand(state, { type: "gameAction", actor: "test-a", action: { type: "dev:play", cardId: view.myDev[0].id } });
    expect(state.phase).toBe("finished");
    expect(projectGame(state, "test-a").finalScores?.["test-a"]).toBe(10);
  });
});
