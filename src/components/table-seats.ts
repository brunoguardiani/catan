export type TablePosition = "self" | "left" | "top" | "right" | "upper-left" | "upper-right" | "bottom-right";

const standardPositions: Record<number, TablePosition[]> = {
  1: ["self"],
  2: ["self", "upper-right"],
  3: ["self", "upper-left", "upper-right"],
  4: ["self", "upper-left", "upper-right", "bottom-right"],
};

// A ordem percorre a mesa no sentido horário a partir do lugar do jogador local.
const expandedPositions: Record<number, TablePosition[]> = {
  1: standardPositions[1],
  2: standardPositions[2],
  3: standardPositions[3],
  4: standardPositions[4],
  5: ["self", "left", "upper-left", "upper-right", "right"],
  6: ["self", "left", "upper-left", "upper-right", "right", "bottom-right"],
};

export function arrangeTableSeats(seatOrder: string[], viewerId: string, expanded: boolean) {
  const viewerIndex = seatOrder.indexOf(viewerId);
  const positions = (expanded ? expandedPositions : standardPositions)[seatOrder.length];
  if (viewerIndex < 0 || !positions) throw new Error("Configuração de assentos inválida.");
  return seatOrder.map((id, index) => ({
    id,
    position: positions[(index - viewerIndex + seatOrder.length) % seatOrder.length],
  }));
}
