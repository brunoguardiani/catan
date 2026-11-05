"use client";

import { useId } from "react";
import type { Board } from "@/game-engine/types";

const art: Record<string, string> = { wood: "wood", brick: "brick", wool: "wool", wheat: "wheat", ore: "ore", desert: "desert" };
const imageCrop = {
  terrain: { x: 405, y: 340, width: 285, height: 285 },
  desert: { x: 330, y: 270, width: 430, height: 430 },
};
const resourceName: Record<string, string> = { wood: "madeira", brick: "tijolo", wool: "lã", wheat: "trigo", ore: "minério", desert: "deserto" };
const portMark: Record<string, string> = { any: "3:1", wood: "2M", brick: "2T", wool: "2L", wheat: "2C", ore: "2O" };

export default function LobbyMap({ board, editable = false, portMode = false, unassignedTiles, onTile, onPort }: {
  board: Board; editable?: boolean; portMode?: boolean;
  unassignedTiles?: ReadonlySet<string>;
  onTile?: (id: string) => void; onPort?: (id: string) => void;
}) {
  const prefix = useId().replace(/:/g, "");
  const vertices = Object.values(board.vertices);
  const minX = Math.min(...vertices.map(vertex => vertex.x)) - 55;
  const maxX = Math.max(...vertices.map(vertex => vertex.x)) + 55;
  const minY = Math.min(...vertices.map(vertex => vertex.y)) - 55;
  const maxY = Math.max(...vertices.map(vertex => vertex.y)) + 55;
  return <svg className={`lobby-map ${editable ? "is-editable" : ""}`} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role={editable ? "group" : "img"} aria-label={`Mapa com ${Object.keys(board.hexes).length} terrenos`}>
    {Object.values(board.hexes).map(hex => {
      const corners = hex.vertices.map(id => board.vertices[id]);
      const points = corners.map(vertex => `${vertex.x},${vertex.y}`).join(" ");
      const left = Math.min(...corners.map(vertex => vertex.x));
      const right = Math.max(...corners.map(vertex => vertex.x));
      const top = Math.min(...corners.map(vertex => vertex.y));
      const bottom = Math.max(...corners.map(vertex => vertex.y));
      const crop = hex.terrain === "desert" ? imageCrop.desert : imageCrop.terrain;
      const scaleX = (right - left) / crop.width;
      const scaleY = (bottom - top) / crop.height;
      const unassigned = unassignedTiles?.has(hex.id) ?? false;
      return <g key={hex.id} className="lobby-map-tile" role={editable && !portMode ? "button" : undefined} tabIndex={editable && !portMode ? 0 : undefined} aria-label={editable && !portMode ? unassigned ? `${hex.id}: sem terreno` : `${hex.id}: ${resourceName[hex.terrain]}${hex.number ? `, ficha ${hex.number}` : ""}${board.robberHex === hex.id ? ", ladrão" : ""}` : undefined} onClick={() => onTile?.(hex.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onTile?.(hex.id); } }}>
        <clipPath id={`${prefix}-clip-${hex.id}`} clipPathUnits="userSpaceOnUse"><polygon points={points} /></clipPath>
        <polygon points={points} fill="#e8deca" stroke="#e9d2a2" strokeWidth="4" />
        {!unassigned && <image href={`/board/${art[hex.terrain]}.jpg`} x={left - crop.x * scaleX} y={top - crop.y * scaleY} width={1093 * scaleX} height={976 * scaleY} preserveAspectRatio="none" clipPath={`url(#${prefix}-clip-${hex.id})`} />}
        <polygon points={points} fill="transparent" stroke="#68432a" strokeWidth="2" />
        {!unassigned && hex.number && <><circle cx={hex.x} cy={hex.y} r="21" fill="#f5e9cb" stroke="#68432a" strokeWidth="3" /><text x={hex.x} y={hex.y + 7} textAnchor="middle" className={hex.number === 6 || hex.number === 8 ? "hot-number" : ""}>{hex.number}</text></>}
        {!unassigned && board.robberHex === hex.id && <circle className="robber-marker" cx={hex.x + 27} cy={hex.y - 27} r="9" />}
        {editable && <title>{unassigned ? `${hex.id}: sem terreno` : `${hex.id}: ${resourceName[hex.terrain]}${hex.number ? `, ${hex.number}` : ""}${board.robberHex === hex.id ? ", ladrão" : ""}`}</title>}
      </g>;
    })}
    {Object.values(board.edges).filter(edge => edge.hexes.length === 1).map(edge => {
      const a = board.vertices[edge.a], b = board.vertices[edge.b];
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      return <g key={edge.id} className={`lobby-map-port ${portMode ? "can-edit" : ""}`} role={editable && portMode ? "button" : undefined} tabIndex={editable && portMode ? 0 : undefined} aria-label={editable && portMode ? `Porto costeiro ${edge.port ? edge.port === "any" ? "3 para 1" : `2 para 1 de ${resourceName[edge.port]}` : "vazio"}` : undefined} onClick={() => onPort?.(edge.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPort?.(edge.id); } }}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="21" />
        {edge.port && <><circle cx={x} cy={y} r="15" fill="#f5e9cb" stroke="#68432a" strokeWidth="2" /><text x={x} y={y + 4} textAnchor="middle">{portMark[edge.port]}</text></>}
        {portMode && <title>{edge.port ? `Porto ${edge.port === "any" ? "3:1" : `2:1 ${resourceName[edge.port]}`}` : "Aresta costeira livre"}</title>}
      </g>;
    })}
  </svg>;
}
