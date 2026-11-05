"use client";

import { useEffect, useRef } from "react";
import type { DiceThrow } from "@/game-engine/types";
import Die3D from "./Die3D";
import { createDiceSimulation, quaternionCss, stepDiceSimulation, type DiceImpact, type DiceSimulation } from "./dice-physics";
import { dicePhysicsConfig as config } from "./dice-physics-config";
import { audioManager } from "./AudioManager";

type Props = {
  rollId: string;
  values: [number, number];
  throwData: DiceThrow;
  soundEnabled: boolean;
  reducedMotion?: boolean;
  onSettled: (position: { x: number; y: number }) => void;
};

function paint(sim: DiceSimulation, root: HTMLDivElement) {
  const dice = root.querySelectorAll<HTMLElement>(".flight-die");
  const shadows = root.querySelectorAll<HTMLElement>(".flight-shadow");
  sim.bodies.forEach((body, index) => {
    const { x, y, z } = body.position;
    const die = dice[index];
    const shadow = shadows[index];
    if (die) {
      die.style.transform = `translate3d(${x - config.dieSize / 2}px, ${y - z - config.dieSize / 2}px, 0)`;
      const spinner = die.querySelector<HTMLElement>(".die-spinner");
      if (spinner) spinner.style.transform = quaternionCss(body.orientation);
    }
    if (shadow) {
      shadow.style.transform = `translate3d(${x - config.dieSize / 2}px, ${y - config.dieSize * .22}px, 0) scale(${1 + Math.min(z, 150) / 180})`;
      shadow.style.opacity = String(Math.max(.13, .45 - z / 350));
    }
  });
}

export default function DiceFlight({ rollId, values, throwData, soundEnabled, reducedMotion = false, onSettled }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onSettledRef = useRef(onSettled);
  const soundEnabledRef = useRef(soundEnabled);
  onSettledRef.current = onSettled;
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    const sim = createDiceSimulation(throwData, parent.clientWidth, parent.clientHeight);
    if (reducedMotion) {
      for (const body of sim.bodies) { body.position.z = 0; body.orientation = { x: 0, y: 0, z: 0, w: 1 }; }
      paint(sim, root);
      onSettledRef.current({ x: (sim.bodies[0].position.x + sim.bodies[1].position.x) / 2, y: (sim.bodies[0].position.y + sim.bodies[1].position.y) / 2 });
      return;
    }
    let frame = 0;
    let previous = 0;
    let accumulator = 0;
    let lastSound = -Infinity;
    const resize = new ResizeObserver(() => {
      const oldWidth = sim.width, oldHeight = sim.height;
      sim.width = parent.clientWidth; sim.height = parent.clientHeight;
      if (oldWidth > 0 && oldHeight > 0) for (const body of sim.bodies) {
        body.position.x *= sim.width / oldWidth;
        body.position.y *= sim.height / oldHeight;
      }
      paint(sim, root);
    });
    resize.observe(parent);
    paint(sim, root);
    const tick = (now: number) => {
      if (!previous) previous = now;
      accumulator += Math.min(.25, (now - previous) / 1000);
      previous = now;
      const impacts: DiceImpact[] = [];
      while (accumulator >= config.fixedStep) {
        impacts.push(...stepDiceSimulation(sim));
        accumulator -= config.fixedStep;
      }
      paint(sim, root);
      const loudest = impacts.reduce<DiceImpact | null>((best, item) => !best || item.speed > best.speed ? item : best, null);
      if (soundEnabledRef.current && loudest && loudest.speed > 85 && now - lastSound > 85) {
        audioManager.play("diceImpact", loudest.speed / 420);
        lastSound = now;
      }
      if (sim.state === "settled") {
        if (soundEnabledRef.current) audioManager.play("diceSettle");
        const x = (sim.bodies[0].position.x + sim.bodies[1].position.x) / 2;
        const y = (sim.bodies[0].position.y + sim.bodies[1].position.y) / 2;
        onSettledRef.current({ x, y });
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
    // A new roll remounts the component; re-rendering the game must not restart physics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId]);

  return <div ref={rootRef} className="dice-flight" aria-hidden="true">
    {values.map((_, index) => <span key={index} className="flight-shadow" />)}
    {values.map((value, index) => <span key={index} className="flight-die"><Die3D value={value} /></span>)}
  </div>;
}
