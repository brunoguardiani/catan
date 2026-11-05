"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { AwardKind, GameEffect, GameEvent, ResourceBag } from "@/game-engine/types";
import { RESOURCES } from "@/game-engine/types";
import { HandArtwork, type HandPose } from "./PlayerHand";
import { audioManager, type AudioCue } from "./AudioManager";
import { awardCards } from "./award-cards";

type Point = { x: number; y: number };
type SeatOrigin = Point & { angle: number };
type Actor = { id: string; from: Point; to: Point; returnTo?: Point; startAngle: number; color: string; role: "a" | "b"; pose: HandPose; cards?: ResourceBag; received?: ResourceBag };
type Scene = { actors: Actor[]; center: Point; award?: { kind: AwardKind; from: Point; to: Point } };

const durations = { trade_accepted: 2100, premium_refused: 1700, table_punch: 880, award_transferred: 2200 } as const;

function cardTokens(cards?: ResourceBag) {
  if (!cards) return null;
  return RESOURCES.filter(resource => cards[resource] > 0).map(resource => <span className={`gesture-card gesture-card-${resource}`} key={resource}>{cards[resource]} {resource.slice(0, 2).toUpperCase()}</span>);
}

function GestureActor({ actor, kind }: { actor: Actor; kind: keyof typeof durations }) {
  const dx = actor.to.x - actor.from.x, dy = actor.to.y - actor.from.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const knockDirection = actor.from.x < actor.to.x ? -1 : 1;
  const style = {
    left: actor.from.x, top: actor.from.y,
    "--dx": `${dx}px`, "--dy": `${dy}px`, "--angle": `${angle}deg`, "--start-angle": `${actor.startAngle}deg`,
    "--dx-70": `${dx * .7}px`, "--dy-70": `${dy * .7}px`,
    "--dx-48": `${dx * .48}px`, "--dy-48": `${dy * .48}px`,
    "--knock-x": `${knockDirection * 90}px`,
    "--knock-x-far": `${knockDirection * 120}px`,
    "--knock-rotation": `${knockDirection * 24}deg`,
    "--punch-windup-x": `${-dx * .18}px`, "--punch-windup-y": `${-dy * .18}px`,
    "--punch-approach-x": `${dx * .78}px`, "--punch-approach-y": `${dy * .78}px`,
    "--punch-recoil-x": `${dx * .78}px`, "--punch-recoil-y": `${dy * .78}px`,
    "--award-return-x": `${(actor.returnTo?.x ?? actor.from.x) - actor.from.x}px`,
    "--award-return-y": `${(actor.returnTo?.y ?? actor.from.y) - actor.from.y}px`,
    "--award-return-angle": `${actor.returnTo ? Math.atan2(actor.returnTo.y - actor.to.y, actor.returnTo.x - actor.to.x) * 180 / Math.PI : angle}deg`,
  } as CSSProperties;
  return <div className={`gesture-actor gesture-${kind} gesture-role-${actor.role}${actor.pose === "palm" ? " gesture-palm" : ""}`} style={style}>
    <span className="gesture-moving-hand">
      {actor.cards && <span className="gesture-cards outgoing">{cardTokens(actor.cards)}</span>}
      {actor.received && <span className="gesture-cards incoming">{cardTokens(actor.received)}</span>}
      <HandArtwork playerId={actor.id} color={actor.color} pose={actor.pose} className="gesture-initial-pose" />
    </span>
  </div>;
}

export function TradeAnimation({ scene }: { scene: Scene }) {
  return <div className="hand-scene scene-trade" style={{ "--motion-duration": `${durations.trade_accepted}ms` } as CSSProperties} aria-hidden="true">{scene.actors.map(actor => <GestureActor key={actor.id} actor={actor} kind="trade_accepted" />)}<span className="gesture-center-flash" style={{ left: scene.center.x, top: scene.center.y }}>✦</span></div>;
}

export function PremiumRefusalAnimation({ scene }: { scene: Scene }) {
  return <div className="hand-scene scene-premium" style={{ "--motion-duration": `${durations.premium_refused}ms` } as CSSProperties} aria-hidden="true">{scene.actors.map(actor => <GestureActor key={actor.id} actor={actor} kind="premium_refused" />)}<span className="gesture-impact" style={{ left: scene.center.x, top: scene.center.y }}>✶</span><strong className="premium-banner" style={{ left: scene.center.x, top: scene.center.y }}>RECUSA PREMIUM!</strong></div>;
}

export function TablePunchAnimation({ scene }: { scene: Scene }) {
  return <div className="hand-scene scene-punch" style={{ "--motion-duration": `${durations.table_punch}ms` } as CSSProperties} aria-hidden="true">{scene.actors.map(actor => <GestureActor key={actor.id} actor={actor} kind="table_punch" />)}<span className="gesture-impact" style={{ left: scene.actors[0]?.to.x, top: scene.actors[0]?.to.y }} /></div>;
}

export function AwardTransferAnimation({ scene }: { scene: Scene }) {
  if (!scene.award) return null;
  const { kind, from, to } = scene.award;
  const style = { left: from.x, top: from.y, "--award-dx": `${to.x - from.x}px`, "--award-dy": `${to.y - from.y}px` } as CSSProperties;
  return <div className="hand-scene scene-award" style={{ "--motion-duration": `${durations.award_transferred}ms` } as CSSProperties} aria-hidden="true">
    <span className="award-flight" style={style}><span className="award-flight-card" style={{ backgroundImage: `url('${awardCards[kind].image}')` }} /></span>
    {scene.actors.map(actor => <GestureActor key={actor.id} actor={actor} kind="award_transferred" />)}
  </div>;
}

function choreography(effect: GameEffect): [number, AudioCue][] {
  if (effect.kind === "trade_accepted") return [[0, "cardGrab"], [460, "handWhoosh"], [1060, "cardSlide"], [1230, "trade"]];
  if (effect.kind === "premium_refused") return [[0, "cardGrab"], [500, "handWhoosh"], [880, "slap"]];
  if (effect.kind === "table_punch") return [[160, "handWhoosh"], [400, "punch"]];
  if (effect.kind === "award_transferred") return [[0, "handWhoosh"], [780, "cardGrab"], [1200, "cardSlide"], [1710, effect.award]];
  return [];
}

export default function HandAnimationController({ event, tableRef, colors, roundOwnerId, onDone }: { event: GameEvent | null; tableRef: RefObject<HTMLDivElement | null>; colors: Record<string, string>; roundOwnerId: string; onDone: () => void }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const effect = event?.effect;

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || !effect || effect.kind === "cue" || effect.kind === "monopoly") return;
    const measure = () => {
      const rect = table.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };
      const seatPoint = (id: string, punch = false): SeatOrigin => {
        const selector = punch ? "[data-punch-hands-player]" : "[data-resting-hands-player]";
        const element = [...table.querySelectorAll<HTMLElement>(selector)].find(item => (punch ? item.dataset.punchHandsPlayer : item.dataset.restingHandsPlayer) === id);
        const seat = element?.getBoundingClientRect();
        const position = element?.dataset.handSeat;
        const angle = position === "left" ? 90 : position === "right" ? -90 : position === "top" || position === "upper-left" || position === "upper-right" ? 180 : 0;
        return seat ? { x: seat.left + seat.width / 2 - rect.left, y: seat.top + seat.height / 2 - rect.top, angle } : { ...center, angle: 0 };
      };
      const awardSlot = (id: string, award: AwardKind): Point => {
        const slot = [...table.querySelectorAll<HTMLElement>("[data-award-slot]")].find(item => item.dataset.awardSlot === `${id}:${award}`)?.getBoundingClientRect();
        return slot ? { x: slot.left + slot.width / 2 - rect.left, y: slot.top + slot.height / 2 - rect.top } : seatPoint(id);
      };
      if (effect.kind === "table_punch") {
        const origin = seatPoint(effect.playerId, true);
        const reach = Math.min(130, Math.max(95, Math.min(rect.width, rect.height) * .15));
        const impact = origin.angle === 180 ? { x: origin.x, y: origin.y + reach }
          : origin.angle === 90 ? { x: origin.x + reach, y: origin.y }
          : origin.angle === -90 ? { x: origin.x - reach, y: origin.y }
          : { x: origin.x, y: origin.y - reach };
        setScene({ center, actors: [{ id: effect.playerId, from: origin, to: impact, startAngle: origin.angle, color: colors[effect.playerId], role: "a", pose: "fist" }] });
      } else if (effect.kind === "award_transferred") {
        const origin = seatPoint(effect.to);
        const from = awardSlot(effect.from, effect.award);
        const to = awardSlot(effect.to, effect.award);
        setScene({ center, award: { kind: effect.award, from, to }, actors: [{ id: effect.to, from: origin, to: from, returnTo: to, startAngle: origin.angle - 90, color: colors[effect.to], role: "a", pose: "reach" }] });
      } else {
        const fromA = seatPoint(effect.from), fromB = seatPoint(effect.to);
        const palmOwner = effect.kind === "trade_accepted" ? [effect.from, effect.to].includes(roundOwnerId) ? roundOwnerId : effect.to : null;
        setScene({ center, actors: [
          { id: effect.from, from: fromA, to: { x: center.x - 22, y: center.y }, startAngle: fromA.angle - 90, color: colors[effect.from], role: "a", pose: palmOwner === effect.from ? "palm" : "cards", cards: effect.give, received: effect.kind === "trade_accepted" ? effect.want : undefined },
          { id: effect.to, from: fromB, to: { x: center.x + 22, y: center.y }, startAngle: fromB.angle - 90, color: colors[effect.to], role: "b", pose: effect.kind === "premium_refused" ? "slap" : palmOwner === effect.to ? "palm" : "cards", cards: effect.kind === "trade_accepted" ? effect.want : undefined, received: effect.kind === "trade_accepted" ? effect.give : undefined },
        ] });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  // The event ID is the animation identity; refreshing a snapshot must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, tableRef]);

  useEffect(() => {
    if (!effect || effect.kind === "cue" || effect.kind === "monopoly") return;
    const timers = choreography(effect).map(([delay, cue]) => setTimeout(() => audioManager.play(cue), delay));
    timers.push(setTimeout(() => doneRef.current(), durations[effect.kind]));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  if (!effect || effect.kind === "cue" || effect.kind === "monopoly" || !scene) return null;
  if (effect.kind === "trade_accepted") return <TradeAnimation scene={scene} />;
  if (effect.kind === "premium_refused") return <PremiumRefusalAnimation scene={scene} />;
  if (effect.kind === "award_transferred") return <AwardTransferAnimation scene={scene} />;
  return <TablePunchAnimation scene={scene} />;
}
