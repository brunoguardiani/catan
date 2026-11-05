import type { Board, Edge, Hex, Port, Terrain, Vertex } from "./types";

const SIZE = 67;
const ROOT3 = Math.sqrt(3);
const terrains: Terrain[] = ["wood", "wood", "wood", "wood", "brick", "brick", "brick", "wool", "wool", "wool", "wool", "wheat", "wheat", "wheat", "wheat", "ore", "ore", "ore", "desert"];
const numbers = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const portTypes: Port[] = ["any", "any", "any", "any", "wood", "brick", "wool", "wheat", "ore"];
const extraTerrains: Terrain[] = ["wood", "wood", "brick", "brick", "wool", "wool", "wheat", "wheat", "ore", "ore", "desert"];
const expandedNumbers = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12];

export function seedRandom(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pointKey(x: number, y: number) { return `${Math.round(x * 1000)}:${Math.round(y * 1000)}`; }
function edgeKey(a: string, b: string) { return [a, b].sort().join("|"); }

export function createBoard(seed: string, playerCount = 4, mapSize: "standard" | "expanded" = playerCount >= 5 ? "expanded" : "standard"): Board {
  const random = seedRandom(seed);
  const expanded = mapSize === "expanded";
  const coords: { q: number; r: number }[] = [];
  for (let r = expanded ? -3 : -2; r <= (expanded ? 3 : 2); r++) {
    for (let q = expanded ? Math.max(-3, -r - 3) : -2; q <= (expanded ? Math.min(2, 2 - r) : 2); q++) {
      if (expanded || Math.abs(q + r) <= 2) coords.push({ q, r });
    }
  }
  const hexes: Record<string, Hex> = {};
  const vertices: Record<string, Vertex> = {};
  const edges: Record<string, Edge> = {};
  const terrainDeck = shuffled(expanded ? [...terrains, ...extraTerrains] : terrains, random);

  coords.forEach(({ q, r }, index) => {
    const id = `h${index}`;
    const x = SIZE * ROOT3 * (q + r / 2);
    const y = SIZE * 1.5 * r;
    const corners = Array.from({ length: 6 }, (_, corner) => {
      const angle = (Math.PI / 180) * (60 * corner - 90);
      const vx = x + SIZE * Math.cos(angle);
      const vy = y + SIZE * Math.sin(angle);
      const key = pointKey(vx, vy);
      vertices[key] ??= { id: key, x: vx, y: vy, hexes: [], edges: [] };
      vertices[key].hexes.push(id);
      return key;
    });
    const edgeIds = corners.map((a, corner) => {
      const b = corners[(corner + 1) % 6];
      const key = edgeKey(a, b);
      edges[key] ??= { id: key, a, b, hexes: [] };
      edges[key].hexes.push(id);
      if (!vertices[a].edges.includes(key)) vertices[a].edges.push(key);
      if (!vertices[b].edges.includes(key)) vertices[b].edges.push(key);
      return key;
    });
    hexes[id] = { id, q, r, x, y, terrain: terrainDeck[index], number: null, vertices: corners, edges: edgeIds };
  });

  const land = Object.values(hexes).filter(hex => hex.terrain !== "desert");
  let numberDeck = expanded ? expandedNumbers : numbers;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const candidate = shuffled(expanded ? expandedNumbers : numbers, random);
    const red = new Set(land.filter((_, index) => candidate[index] === 6 || candidate[index] === 8).map(hex => hex.id));
    const adjacentReds = Object.values(edges).some(edge => edge.hexes.length === 2 && edge.hexes.every(id => red.has(id)));
    if (!adjacentReds) { numberDeck = candidate; break; }
  }
  land.forEach((hex, index) => { hex.number = numberDeck[index]; });

  const coast = Object.values(edges).filter(edge => edge.hexes.length === 1)
    .sort((a, b) => {
      const pa = vertices[a.a]; const pb = vertices[a.b];
      const qa = vertices[b.a]; const qb = vertices[b.b];
      return Math.atan2((pa.y + pb.y) / 2, (pa.x + pb.x) / 2) - Math.atan2((qa.y + qb.y) / 2, (qa.x + qb.x) / 2);
    });
  const ports = shuffled(expanded ? [...portTypes, "any", "wool"] as Port[] : portTypes, random);
  for (let i = 0; i < ports.length; i++) {
    const edge = coast[Math.floor((i + 0.5) * coast.length / ports.length)];
    edge.port = ports[i];
    vertices[edge.a].port = ports[i];
    vertices[edge.b].port = ports[i];
  }

  const robberHex = Object.values(hexes).find(hex => hex.terrain === "desert")!.id;
  return { hexes, vertices, edges, robberHex, seed };
}
