import type { Board } from "./types";

export interface Point { x: number; y: number }

export function createBoardFrame(board: Board) {
  const vertices = Object.values(board.vertices);
  const centerX = (Math.min(...vertices.map(vertex => vertex.x)) + Math.max(...vertices.map(vertex => vertex.x))) / 2;
  const centerY = (Math.min(...vertices.map(vertex => vertex.y)) + Math.max(...vertices.map(vertex => vertex.y))) / 2;
  // A distância extra mantém todos os cantos do terreno dentro de um hexágono regular.
  const radius = Math.max(...vertices.map(vertex => Math.max(
    Math.abs(vertex.y - centerY) + Math.abs(vertex.x - centerX) / Math.sqrt(3),
    2 * Math.abs(vertex.x - centerX) / Math.sqrt(3),
  ))) + 64;
  const halfWidth = radius * Math.sqrt(3) / 2;
  const points: Point[] = [
    { x: centerX, y: centerY - radius },
    { x: centerX + halfWidth, y: centerY - radius / 2 },
    { x: centerX + halfWidth, y: centerY + radius / 2 },
    { x: centerX, y: centerY + radius },
    { x: centerX - halfWidth, y: centerY + radius / 2 },
    { x: centerX - halfWidth, y: centerY - radius / 2 },
  ];
  return { points, viewBox: `${centerX - halfWidth - 32} ${centerY - radius - 32} ${halfWidth * 2 + 64} ${radius * 2 + 64}` };
}

export function createCoastline(board: Board) {
  const edges = Object.values(board.edges).filter(edge => edge.hexes.length === 1);
  const neighbors = new Map<string, string[]>();
  for (const edge of edges) {
    neighbors.set(edge.a, [...(neighbors.get(edge.a) ?? []), edge.b]);
    neighbors.set(edge.b, [...(neighbors.get(edge.b) ?? []), edge.a]);
  }
  if ([...neighbors.values()].some(adjacent => adjacent.length !== 2)) throw new Error("Litoral desconectado.");
  const start = [...neighbors.keys()].sort((a, b) => board.vertices[a].y - board.vertices[b].y || board.vertices[a].x - board.vertices[b].x)[0];
  const points: Point[] = [];
  let previous = "", current = start;
  do {
    const vertex = board.vertices[current];
    points.push({ x: vertex.x, y: vertex.y });
    const next = neighbors.get(current)!.find(id => id !== previous)!;
    previous = current;
    current = next;
  } while (current !== start && points.length <= edges.length);
  if (current !== start || points.length !== edges.length) throw new Error("Litoral incompleto.");
  return { points, path: `M ${points.map(point => `${point.x} ${point.y}`).join(" L ")} Z` };
}
