import type { DiceThrow } from "@/game-engine/types";
import { angularVelocity, identityQuat, type Quat } from "./dice-physics";
import { dicePhysicsConfig as config } from "./dice-physics-config";

export type GestureSample = { x: number; y: number; time: number; orientation: Quat };
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

export function recentGesture(samples: GestureSample[], now: number, width: number, height: number): Pick<DiceThrow, "vx" | "vy" | "spin" | "orientation"> {
  const latest = samples.at(-1);
  if (!latest) return { vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 }, orientation: identityQuat };
  const recent = samples.filter(sample => sample.time >= now - config.sampleWindowMs && sample.time <= now);
  const first = recent[0];
  if (!first || recent.length < 2 || now - latest.time > config.sampleWindowMs || latest.time - first.time < 12) {
    return { vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 }, orientation: latest.orientation };
  }
  // Displacement over a short window rejects one noisy pointer event and keeps a flick responsive.
  const seconds = (latest.time - first.time) / 1000;
  const pxX = clamp((latest.x - first.x) / seconds, -1500, 1500);
  const pxY = clamp((latest.y - first.y) / seconds, -1500, 1500);
  const spin = angularVelocity(first.orientation, latest.orientation, seconds);
  return {
    vx: clamp(pxX / Math.max(width, 1), -4, 4),
    vy: clamp(pxY / Math.max(height, 1), -4, 4),
    spin: {
      x: spin.x * config.angularThrowSensitivity,
      y: spin.y * config.angularThrowSensitivity,
      z: spin.z * config.angularThrowSensitivity,
    },
    orientation: latest.orientation,
  };
}
