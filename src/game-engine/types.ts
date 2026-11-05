export const RESOURCES = ["wood", "brick", "wool", "wheat", "ore"] as const;
export const PIECE_LIMITS = { road: 15, settlement: 5, city: 4 } as const;
export type Resource = typeof RESOURCES[number];
export type ResourceBag = Record<Resource, number>;
export type Terrain = Resource | "desert";
export type Port = Resource | "any";
export type DevCard = "knight" | "road_building" | "year_plenty" | "monopoly" | "victory";
export type Phase = "choose_first_player" | "setup_settlement" | "setup_road" | "before_roll" | "discard" | "move_robber" | "choose_victim" | "actions" | "finished";
export interface DiceThrow {
  x: number; y: number; vx: number; vy: number;
  spin?: { x: number; y: number; z: number };
  orientation?: { x: number; y: number; z: number; w: number };
}
export interface DiceRoll { id: string; playerId: string; dice: [number, number]; purpose: "first_player" | "turn"; throw?: DiceThrow }
export interface StartingRollRound { round: number; rolls: Record<string, [number, number]>; highest: number; leaders: string[] }
export interface StartingRoll { contenders: string[]; rolls: Record<string, [number, number]>; round: number; history: StartingRollRound[] }

export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  vertices: string[];
  edges: string[];
}
export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexes: string[];
  edges: string[];
  port?: Port;
}
export interface Edge {
  id: string;
  a: string;
  b: string;
  hexes: string[];
  port?: Port;
}
export interface Board {
  hexes: Record<string, Hex>;
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  robberHex: string;
  seed: string;
}
export interface GameRules {
  adjacentRobber: boolean;
  desertJump: boolean;
  roadsThroughOpponents: boolean;
}
export interface MapDraft {
  tiles: { id: string; terrain: Terrain; number: number | null }[];
  ports: { edgeId: string; type: Port }[];
  robberHex: string;
  freeDistribution: boolean;
}
export interface RandomMapOptions {
  desertCount: number;
}
export interface Structure { owner: string; kind: "settlement" | "city" }
export interface DevInHand { id: string; kind: DevCard; boughtTurn: number }
export interface GamePlayer {
  id: string;
  resources: ResourceBag;
  dev: DevInHand[];
  knights: number;
  playedDevTurn: number;
}
export interface TradeOffer {
  id: string;
  from: string;
  to?: string;
  give: ResourceBag;
  want: ResourceBag;
  createdAt: number;
}
export type GameCue = "turn" | "road" | "settlement" | "city" | "card" | "offer" | "robber" | "steal" | "dice" | "victory" | "longestRoad" | "largestArmy";
export type AwardKind = "longestRoad" | "largestArmy";
export type GameEffect =
  | { kind: "monopoly"; playerId: string; resource: Resource; taken: Record<string, number> }
  | { kind: "trade_accepted"; from: string; to: string; give: ResourceBag; want: ResourceBag }
  | { kind: "premium_refused"; from: string; to: string; give: ResourceBag }
  | { kind: "table_punch"; playerId: string }
  | { kind: "award_transferred"; award: AwardKind; from: string; to: string }
  | { kind: "cue"; cue: GameCue; playerId?: string };
export interface GameEvent { id: string; text: string; at: number; effect?: GameEffect }
export interface TradeBlock { from: string; to: string; turn: number }
export interface GameState {
  board: Board;
  rules?: GameRules;
  playerOrder: string[];
  seatOrder: string[];
  players: Record<string, GamePlayer>;
  bank: ResourceBag;
  roads: Record<string, string>;
  structures: Record<string, Structure>;
  devDeck: DevCard[];
  phase: Phase;
  currentPlayerId: string;
  mainPlayerId: string;
  pairedTurn: boolean;
  mainTurnCount: number;
  setupStep: number;
  setupVertex: string | null;
  turn: number;
  round: number;
  dice: [number, number] | null;
  lastRoll: DiceRoll | null;
  startingRoll: StartingRoll;
  discardRequired: Record<string, number>;
  robberVictims: string[];
  robberFromKnight: boolean;
  resumePhase: "before_roll" | "actions";
  freeRoads: number;
  longestRoadOwner: string | null;
  largestArmyOwner: string | null;
  pendingTrade: TradeOffer | null;
  counterOffers: TradeOffer[];
  tradeDeclines: string[];
  tradeBlocks: TradeBlock[];
  lastPunchAt: Record<string, number>;
  victoryTarget: number;
  winner: string | null;
  events: GameEvent[];
}

export type GameAction =
  | { type: "start:roll"; throw?: DiceThrow }
  | { type: "setup:settlement"; vertexId: string }
  | { type: "setup:road"; edgeId: string }
  | { type: "turn:roll"; throw?: DiceThrow }
  | { type: "turn:end" }
  | { type: "robber:discard"; resources: ResourceBag }
  | { type: "robber:move"; hexId: string }
  | { type: "robber:steal"; victimId: string }
  | { type: "build:road"; edgeId: string }
  | { type: "build:settlement"; vertexId: string }
  | { type: "build:city"; vertexId: string }
  | { type: "dev:buy" }
  | { type: "dev:play"; cardId: string; resource?: Resource; resources?: [Resource, Resource] }
  | { type: "trade:bank"; give: Resource; receive: Resource }
  | { type: "trade:offer"; to?: string; give: ResourceBag; want: ResourceBag }
  | { type: "trade:accept"; offerId: string }
  | { type: "trade:counter"; offerId: string; give: ResourceBag; want: ResourceBag }
  | { type: "trade:decline"; offerId: string }
  | { type: "trade:premium_refuse"; offerId: string }
  | { type: "trade:cancel"; offerId: string }
  | { type: "social:punch" };

export interface LegalMoves { vertices: string[]; edges: string[]; hexes: string[] }
export interface PublicGameState {
  board: Board;
  rules?: GameRules;
  playerOrder: string[];
  seatOrder: string[];
  phase: Phase;
  currentPlayerId: string;
  mainPlayerId: string;
  pairedTurn: boolean;
  turn: number;
  round: number;
  dice: [number, number] | null;
  lastRoll: DiceRoll | null;
  startingRoll: StartingRoll;
  roads: Record<string, string>;
  structures: Record<string, Structure>;
  robberHex: string;
  scores: Record<string, number>;
  finalScores: Record<string, number> | null;
  resourceCounts: Record<string, number>;
  playerResources: Record<string, ResourceBag>;
  devCounts: Record<string, number>;
  knights: Record<string, number>;
  bank: ResourceBag;
  discardRequired: Record<string, number>;
  robberVictims: string[];
  pendingTrade: TradeOffer | null;
  counterOffers: TradeOffer[];
  tradeDeclines: string[];
  tradeBlocks: TradeBlock[];
  longestRoadOwner: string | null;
  largestArmyOwner: string | null;
  victoryTarget: number;
  winner: string | null;
  events: GameEvent[];
  legal: LegalMoves;
  myResources: ResourceBag;
  myDev: DevInHand[];
  freeRoads: number;
}

export const emptyBag = (): ResourceBag => ({ wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 });
export const bagTotal = (bag: ResourceBag) => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
