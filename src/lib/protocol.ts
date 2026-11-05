import { z } from "zod";
import type { Board, GameAction, GameRules, MapDraft, PublicGameState, RandomMapOptions } from "@/game-engine/types";
import type { MapGeneration } from "@/game-engine/configuration";

export const codeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
export const playerIdSchema = z.string().uuid();
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const nicknameSchema = z.string().trim().min(2).max(24);
export const avatarSchema = z.enum(["fox", "owl", "bear", "hare", "stag", "cat"]);
export const colorSchema = z.enum(["coral", "amber", "teal", "violet", "blue", "rose"]);
export const mapSizeSchema = z.enum(["standard", "expanded"]);
export const mapGenerationSchema = z.enum(["classic", "random", "manual"]);
export const gameRulesSchema = z.object({
  adjacentRobber: z.boolean(), desertJump: z.boolean(), roadsThroughOpponents: z.boolean(),
});
export const mapDraftSchema = z.object({
  tiles: z.array(z.object({ id: z.string().max(10), terrain: z.enum(["wood", "brick", "wool", "wheat", "ore", "desert"]), number: z.number().int().min(2).max(12).nullable() })).min(19).max(30),
  ports: z.array(z.object({ edgeId: z.string().max(200), type: z.enum(["any", "wood", "brick", "wool", "wheat", "ore"]) })).max(15),
  robberHex: z.string().max(10), freeDistribution: z.boolean(),
});
export const randomMapOptionsSchema = z.object({
  desertCount: z.number().int().min(1).max(5),
});

const base = z.object({ commandId: z.string().uuid() });
const resourceSchema = z.enum(["wood", "brick", "wool", "wheat", "ore"]);
const bagSchema = z.object({ wood: z.number().int().min(0).max(100), brick: z.number().int().min(0).max(100), wool: z.number().int().min(0).max(100), wheat: z.number().int().min(0).max(100), ore: z.number().int().min(0).max(100) });
const diceThrowSchema = z.object({
  x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
  vx: z.number().finite().min(-4).max(4), vy: z.number().finite().min(-4).max(4),
  spin: z.object({ x: z.number().finite().min(-22).max(22), y: z.number().finite().min(-22).max(22), z: z.number().finite().min(-22).max(22) }).optional(),
  orientation: z.object({ x: z.number().finite().min(-1).max(1), y: z.number().finite().min(-1).max(1), z: z.number().finite().min(-1).max(1), w: z.number().finite().min(-1).max(1) }).optional(),
});
export const gameActionSchema: z.ZodType<GameAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start:roll"), throw: diceThrowSchema.optional() }),
  z.object({ type: z.literal("setup:settlement"), vertexId: z.string().max(100) }),
  z.object({ type: z.literal("setup:road"), edgeId: z.string().max(200) }),
  z.object({ type: z.literal("turn:roll"), throw: diceThrowSchema.optional() }),
  z.object({ type: z.literal("turn:end") }),
  z.object({ type: z.literal("robber:discard"), resources: bagSchema }),
  z.object({ type: z.literal("robber:move"), hexId: z.string().max(10) }),
  z.object({ type: z.literal("robber:steal"), victimId: playerIdSchema }),
  z.object({ type: z.literal("build:road"), edgeId: z.string().max(200) }),
  z.object({ type: z.literal("build:settlement"), vertexId: z.string().max(100) }),
  z.object({ type: z.literal("build:city"), vertexId: z.string().max(100) }),
  z.object({ type: z.literal("dev:buy") }),
  z.object({ type: z.literal("dev:play"), cardId: z.string().uuid(), resource: resourceSchema.optional(), resources: z.tuple([resourceSchema, resourceSchema]).optional() }),
  z.object({ type: z.literal("trade:bank"), give: resourceSchema, receive: resourceSchema }),
  z.object({ type: z.literal("trade:offer"), to: playerIdSchema.optional(), give: bagSchema, want: bagSchema }),
  z.object({ type: z.literal("trade:accept"), offerId: z.string().uuid() }),
  z.object({ type: z.literal("trade:counter"), offerId: z.string().uuid(), give: bagSchema, want: bagSchema }),
  z.object({ type: z.literal("trade:decline"), offerId: z.string().uuid() }),
  z.object({ type: z.literal("trade:premium_refuse"), offerId: z.string().uuid() }),
  z.object({ type: z.literal("trade:cancel"), offerId: z.string().uuid() }),
  z.object({ type: z.literal("social:punch") }),
]);
export const commandSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("room:create"), playerId: playerIdSchema, token: tokenSchema, nickname: nicknameSchema, avatar: avatarSchema }),
  base.extend({ type: z.literal("room:join"), code: codeSchema, playerId: playerIdSchema, token: tokenSchema, nickname: nicknameSchema, avatar: avatarSchema }),
  base.extend({ type: z.literal("player:ready"), ready: z.boolean() }),
  base.extend({ type: z.literal("player:profile"), nickname: nicknameSchema, avatar: avatarSchema }),
  base.extend({ type: z.literal("player:color"), color: colorSchema }),
  base.extend({ type: z.literal("chat:message"), text: z.string().trim().min(1).max(280) }),
  base.extend({ type: z.literal("reaction:send"), reaction: z.enum(["🤬", "🙂", "❤️", "🤣", "👏", "🎲", "🔥", "😮", "🤝", "🎉"]) }),
  base.extend({ type: z.literal("room:leave") }),
  base.extend({ type: z.literal("connection:heartbeat") }),
  base.extend({ type: z.literal("game:start") }),
  base.extend({ type: z.literal("game:restart") }),
  base.extend({ type: z.literal("game:rematch") }),
  base.extend({ type: z.literal("room:settings"), victoryTarget: z.number().int().min(8).max(20), mapSeed: z.string().trim().max(40).optional(), mapSize: mapSizeSchema.optional(), mapGeneration: mapGenerationSchema.optional(), randomOptions: randomMapOptionsSchema.optional(), rules: gameRulesSchema.optional(), mapDraft: mapDraftSchema.optional(), chatEnabled: z.boolean().optional() }),
  base.extend({ type: z.literal("room:remove"), playerId: playerIdSchema }),
  base.extend({ type: z.literal("room:transferHost"), playerId: playerIdSchema }),
  base.extend({ type: z.literal("game:command"), action: gameActionSchema }),
]);

export type Command = z.infer<typeof commandSchema>;
export type Avatar = z.infer<typeof avatarSchema>;
export type Color = z.infer<typeof colorSchema>;
export type MapSize = z.infer<typeof mapSizeSchema>;

export interface PublicPlayer {
  id: string;
  nickname: string;
  avatar: Avatar;
  color: Color;
  connected: boolean;
  ready: boolean;
  host: boolean;
}

export interface RoomSnapshot {
  code: string;
  version: number;
  players: PublicPlayer[];
  status: "lobby" | "playing" | "finished";
  capacity: number;
  createdAt: number;
  victoryTarget: number;
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  mapSeed: string;
  mapSize: MapSize;
  mapGeneration: MapGeneration;
  randomOptions: RandomMapOptions;
  mapDraft: MapDraft | null;
  boardPreview: Board;
  rules: GameRules;
}

export type ServerEvent =
  | { type: "room:joined"; commandId: string; room: RoomSnapshot; playerId: string }
  | { type: "room:state"; room: RoomSnapshot }
  | { type: "room:unavailable"; commandId: string; code: string; reason: "not_found_on_instance" }
  | { type: "room:error"; commandId?: string; message: string }
  | { type: "room:removed"; code: string }
  | { type: "chat:message"; id: string; playerId: string; nickname: string; text: string; at: number }
  | { type: "reaction:send"; id: string; playerId: string; reaction: string; at: number }
  | { type: "connection:pong"; at: number }
  | { type: "game:state"; game: PublicGameState };
