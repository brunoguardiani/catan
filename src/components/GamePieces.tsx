import type { CSSProperties } from "react";
import { RESOURCES, type Resource, type ResourceBag } from "@/game-engine/types";

export const resourceName: Record<Resource, string> = { wood: "Madeira", brick: "Tijolo", wool: "Lã", wheat: "Trigo", ore: "Minério" };
export const colorValue: Record<string, string> = { coral: "#df806d", amber: "#e2b457", teal: "#65c1ab", violet: "#a99acb", blue: "#75a9df", rose: "#d48fac" };

export function ResourceCard({ resource, count, compact = false, selected = false, onClick, disabled = false, style, ariaLabel }: { resource: Resource; count?: number; compact?: boolean; selected?: boolean; onClick?: () => void; disabled?: boolean; style?: CSSProperties; ariaLabel?: string }) {
  const className = `material-card material-${resource}${compact ? " compact" : ""}${selected ? " selected" : ""}`;
  const content = <><span className="material-picture" aria-hidden="true" /><span className="material-name">{resourceName[resource]}</span>{count !== undefined && <strong className="material-count">{count}×</strong>}</>;
  return onClick ? <button type="button" className={className} style={style} aria-label={ariaLabel ?? `${resourceName[resource]}${count !== undefined ? `, ${count} cartas` : ""}`} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button> : <div className={className} style={style} aria-label={ariaLabel ?? `${resourceName[resource]}${count !== undefined ? `, ${count} cartas` : ""}`}>{content}</div>;
}

export function ResourceStack({ resource, count, selected = 0, onTake }: { resource: Resource; count: number; selected?: number; onTake?: () => void }) {
  const available = Math.max(0, count - selected);
  const depth = Math.min(36, Math.max(0, available - 1) * 7);
  const step = available > 1 ? depth / (available - 1) : 0;
  const hoverStep = 22;
  return <div className="resource-stack" aria-label={`${count} ${count === 1 ? "carta" : "cartas"} de ${resourceName[resource]}`} style={{ "--stack-depth": `${depth}px`, "--stack-hover-depth": `${Math.max(0, available - 1) * hoverStep}px` } as CSSProperties}>
    <div className="resource-stack-pile">
      {Array.from({ length: available }, (_, index) => <ResourceCard key={index} resource={resource} compact onClick={onTake} ariaLabel={`Selecionar uma carta de ${resourceName[resource]}`} style={{ left: index * step, zIndex: index + 1, "--spread-x": `${index * (hoverStep - step)}px` } as CSSProperties} />)}
    </div>
    {selected > 0 && <span className="resource-stack-selected" aria-label={`${selected} selecionadas`}>↗ {selected}</span>}
  </div>;
}

export function CardBack({ count }: { count: number }) {
  return <div className="hidden-hand" aria-label={`${count} cartas ocultas`}>
    <div className="hidden-card-stack"><span className="hidden-card-back" aria-hidden="true" /></div>
    <strong>×{count}</strong>
  </div>;
}

export function PlayerOrb({ color, name, active = false, small = false }: { color: string; name: string; active?: boolean; small?: boolean }) {
  return <span className={`player-orb-wrap${active ? " active" : ""}${small ? " small" : ""}`} style={{ "--orb-color": colorValue[color] ?? colorValue.coral } as CSSProperties}>
    <span className="player-orb-name">{name}</span><span className="player-orb" /><span className="player-orb-shadow" />
  </span>;
}

export function DiceFace({ value }: { value?: number }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className="die-face" aria-label={value ? `Dado: ${value}` : "Dado rolando"}>{Array.from({ length: 9 }, (_, index) => <i key={index} className={value && pips[value]?.includes(index) ? "pip" : ""} />)}</span>;
}

export function TradeCardGroup({ cards }: { cards: ResourceBag }) {
  return <span className="trade-card-group">{RESOURCES.filter(resource => cards[resource] > 0).map(resource => <ResourceCard key={resource} resource={resource} count={cards[resource]} compact />)}</span>;
}
