import { colorValue } from "./GamePieces";
import type { TablePosition } from "./table-seats";

export type HandPose = "rest" | "open" | "cards" | "reach" | "slap" | "fist" | "collect" | "palm";

export function HandArtwork({ playerId, pose = "rest", className = "" }: { playerId: string; color: string; pose?: HandPose; className?: string }) {
  return <span className={`hand-artwork pose-${pose} ${className}`} data-hand-owner={playerId} aria-hidden="true" />;
}

export default function PlayerHand({ playerId, color, name, position, active, connected, self }: { playerId: string; color: string; name: string; position: TablePosition; active: boolean; connected: boolean; self: boolean }) {
  return <span className={`player-hand-wrap seat-hand-${position}${active ? " active" : ""}${connected ? "" : " disconnected"}`} data-hand-player={playerId}>
    <span className="player-hand-name"><i style={{ background: colorValue[color] ?? colorValue.coral }} /><span>{name}</span></span>
    <span className="player-hand-caption">{connected ? active ? self ? "Sua vez" : "Jogando" : "" : "Desconectado"}</span>
  </span>;
}
