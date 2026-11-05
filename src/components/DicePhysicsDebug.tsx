"use client";

import { useState } from "react";
import { dicePhysicsConfig as config } from "./dice-physics-config";

const controls = [
  ["rotationSensitivity", "Giro", 0.5, 5, 0.1],
  ["throwSensitivity", "Arremesso", 0.2, 1.5, 0.05],
  ["angularThrowSensitivity", "Giro ao soltar", 0.2, 1.5, 0.05],
  ["gravity", "Gravidade", 700, 2600, 50],
  ["restitution", "Quique da mesa", 0.1, 0.7, 0.02],
  ["floorFriction", "Atrito da mesa", 0.2, 1.2, 0.05],
  ["linearDamping", "Amortecimento linear", 0.1, 2, 0.05],
  ["angularDamping", "Amortecimento angular", 0.1, 2, 0.05],
] as const;

export default function DicePhysicsDebug() {
  const [, refresh] = useState(0);
  if (process.env.NODE_ENV !== "development") return null;
  return <details className="dice-physics-debug">
    <summary>Física dos dados</summary>
    <div>{controls.map(([key, label, min, max, step]) => <label key={key}>
      <span>{label} <output>{config[key].toFixed(step < 1 ? 2 : 0)}</output></span>
      <input type="range" min={min} max={max} step={step} value={config[key]} onChange={event => { config[key] = Number(event.target.value); refresh(value => value + 1); }} />
    </label>)}</div>
  </details>;
}
