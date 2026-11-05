import type { AwardKind } from "@/game-engine/types";

export const awardKinds: AwardKind[] = ["longestRoad", "largestArmy"];

export const awardCards: Record<AwardKind, { title: string; image: string }> = {
  longestRoad: { title: "Dono das Pontes", image: "/cards/awards/longest-road.jpg" },
  largestArmy: { title: "Mais Cavaleiros", image: "/cards/awards/largest-army.jpg" },
};
