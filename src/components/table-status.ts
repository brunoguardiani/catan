import { PIECE_LIMITS, type PublicGameState } from "@/game-engine/types";

type PlacedPieces = Pick<PublicGameState, "roads" | "structures">;

export function remainingPieces(game: PlacedPieces, playerId: string) {
  let settlements = 0;
  let cities = 0;
  for (const structure of Object.values(game.structures)) {
    if (structure.owner !== playerId) continue;
    if (structure.kind === "settlement") settlements++;
    else cities++;
  }
  const roads = Object.values(game.roads).filter(owner => owner === playerId).length;
  return {
    settlement: Math.max(0, PIECE_LIMITS.settlement - settlements),
    city: Math.max(0, PIECE_LIMITS.city - cities),
    road: Math.max(0, PIECE_LIMITS.road - roads),
  };
}
