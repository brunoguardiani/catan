"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { DiceThrow } from "@/game-engine/types";
import Die3D from "./Die3D";
import { identityQuat, quaternionCss, rotateFromPointer, type Quat } from "./dice-physics";
import { recentGesture, type GestureSample } from "./dice-gesture";
import { dicePhysicsConfig as config } from "./dice-physics-config";
import { audioManager } from "./AudioManager";

type HeldDice = { x: number; y: number; orientation: Quat };
type HeldPointer = { id: number; x: number; y: number; previousX: number; previousY: number; distance: number; orientation: Quat; samples: GestureSample[]; state: "grabbed" | "dragging" };

export default function DiceTray({ fromPlayerId, active, onRoll }: { fromPlayerId: string | null; active: boolean; onRoll: (throwData: DiceThrow) => void }) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const previewPose = useRef<HeldDice | null>(null);
  const previewFrame = useRef<number | null>(null);
  const pointer = useRef<HeldPointer | null>(null);
  const pending = useRef(false);
  const [delivery, setDelivery] = useState<{ x: number; y: number } | null>(null);
  const [delivered, setDelivered] = useState(!fromPlayerId);
  const [heldDice, setHeldDice] = useState<HeldDice | null>(null);
  const [waiting, setWaiting] = useState(false);

  useLayoutEffect(() => {
    if (!fromPlayerId) return;
    const button = buttonRef.current;
    const table = button?.closest(".table-stage");
    const previous = [...(table?.querySelectorAll<HTMLElement>("[data-seat-dice]") ?? [])].find(item => item.dataset.seatDice === fromPlayerId);
    if (!button || !previous) { setDelivered(true); return; }
    const from = previous.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    setDelivery({ x: from.left + from.width / 2 - to.left - to.width / 2, y: from.top + from.height / 2 - to.top - to.height / 2 });
    const timer = window.setTimeout(() => setDelivered(true), 850);
    return () => window.clearTimeout(timer);
  }, [fromPlayerId]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => { pending.current = false; setWaiting(false); }, 5000);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  useEffect(() => () => { if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current); }, []);

  function paintPreview() {
    previewFrame.current = null;
    const preview = previewRef.current;
    const pose = previewPose.current;
    if (!preview || !pose) return;
    preview.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) translate(-50%, -50%)`;
    const [first, second] = preview.querySelectorAll<HTMLElement>(".die-spinner");
    if (first) first.style.transform = quaternionCss(pose.orientation);
    if (second) second.style.transform = quaternionCss(pose.orientation);
  }

  function roll(throwData?: DiceThrow) {
    if (!active || !delivered || pending.current) return;
    pending.current = true;
    setWaiting(true);
    void audioManager.unlock().then(() => audioManager.play("diceThrow", Math.hypot(throwData?.vx ?? 0, throwData?.vy ?? 0) / 2));
    if (!throwData) {
      const table = buttonRef.current?.closest(".table-stage")?.getBoundingClientRect();
      const button = buttonRef.current?.getBoundingClientRect();
      throwData = table && button ? { x: (button.left + button.width / 2 - table.left) / table.width, y: (button.top + button.height / 2 - table.top) / table.height, vx: 0, vy: 0 } : { x: .5, y: .5, vx: 0, vy: 0 };
    }
    onRoll(throwData);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const held = pointer.current;
    if (!held || held.id !== event.pointerId) return;
    const dx = event.clientX - held.x, dy = event.clientY - held.y;
    held.distance = Math.max(held.distance, Math.hypot(dx, dy));
    if (held.distance > 2) held.state = "dragging";
    const stepX = event.clientX - held.previousX;
    const stepY = event.clientY - held.previousY;
    if (Math.hypot(stepX, stepY) > 0) held.orientation = rotateFromPointer(held.orientation, stepX, stepY);
    if (Math.hypot(stepX, stepY) > 2) audioManager.play("diceMove", Math.hypot(stepX, stepY) / 28);
    held.previousX = event.clientX;
    held.previousY = event.clientY;
    held.samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp, orientation: held.orientation });
    while (held.samples.length > 2 && held.samples[1].time < event.timeStamp - config.sampleWindowMs) held.samples.shift();
    previewPose.current = { x: event.clientX, y: event.clientY, orientation: held.orientation };
    if (previewFrame.current === null) previewFrame.current = requestAnimationFrame(paintPreview);
  }

  function release(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const held = pointer.current;
    if (!held || held.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.current = null;
    if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = null;
    previewPose.current = null;
    setHeldDice(null);
    if (!cancelled) {
      const table = event.currentTarget.closest(".table-stage")?.getBoundingClientRect();
      if (!table) { roll(); return; }
      const gesture = recentGesture(held.samples, event.timeStamp, table.width, table.height);
      const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
      roll({ x: clamp((event.clientX - table.left) / table.width, 0, 1), y: clamp((event.clientY - table.top) / table.height, 0, 1), ...gesture });
    }
  }

  return <><button ref={buttonRef} type="button" className={`table-dice-tray${delivery && !delivered ? " delivering" : ""}${heldDice ? " held" : ""}`} style={{ "--delivery-x": `${delivery?.x ?? 0}px`, "--delivery-y": `${delivery?.y ?? 0}px` } as CSSProperties} disabled={!active || !delivered || waiting} aria-label={active ? "Segure, mova e solte os dados para lançar" : "Dados com o jogador da vez"} title={active ? "Segure, mova e solte para lançar" : "Dados com o jogador da vez"} onPointerDown={event => { if (!active || !delivered || waiting) return; void audioManager.unlock(); const orientation = identityQuat; pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, previousX: event.clientX, previousY: event.clientY, orientation, samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp, orientation }], state: "grabbed" }; previewPose.current = { x: event.clientX, y: event.clientY, orientation }; setHeldDice(previewPose.current); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={move} onPointerUp={event => release(event)} onPointerCancel={event => release(event, true)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); roll(); } }}>
    <span className="dice-pair" aria-hidden="true"><Die3D value={2} /><Die3D value={5} /></span>
    {active && <small>{waiting ? "Lançando..." : "Segure e solte"}</small>}
  </button>{heldDice && createPortal(<span ref={previewRef} className="held-table-dice" style={{ transform: `translate3d(${heldDice.x}px, ${heldDice.y}px, 0) translate(-50%, -50%)` }} aria-hidden="true"><span className="dice-pair"><Die3D value={2} /><Die3D value={5} /></span></span>, document.body)}</>;
}
