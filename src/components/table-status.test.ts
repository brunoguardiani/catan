import { expect, it } from "vitest";
import type { PublicGameState } from "@/game-engine/types";
import { remainingPieces } from "./table-status";

it("devolve uma casa à reserva quando ela é melhorada para cidade", () => {
  const game: Pick<PublicGameState, "roads" | "structures"> = {
    roads: { edge: "ana" },
    structures: {
      a: { owner: "ana", kind: "settlement" },
      b: { owner: "ana", kind: "settlement" },
      c: { owner: "ana", kind: "settlement" },
      d: { owner: "bia", kind: "city" },
    },
  };
  expect(remainingPieces(game, "ana")).toEqual({ settlement: 2, city: 4, road: 14 });
  game.structures.c.kind = "city";
  expect(remainingPieces(game, "ana")).toEqual({ settlement: 3, city: 3, road: 14 });
});
