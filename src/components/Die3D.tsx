import type { CSSProperties } from "react";

const resultRotations: Record<number, string> = {
  1: "rotateX(-90deg)",
  2: "rotateX(0deg)",
  3: "rotateY(-90deg)",
  4: "rotateY(90deg)",
  5: "rotateY(180deg)",
  6: "rotateX(90deg)",
};

const sides = [
  ["front", 2], ["back", 5], ["right", 3],
  ["left", 4], ["top", 1], ["bottom", 6],
] as const;
const pipPositions: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};
const sideBackgrounds = Object.fromEntries(sides.map(([, pips]) => [pips, [
  ...pipPositions[pips].map(([x, y]) => `radial-gradient(circle at ${x}% ${y}%, #304a40 0 var(--pip-radius), transparent calc(var(--pip-radius) + .7px))`),
  "linear-gradient(145deg, #fffdf1, #ded4bd)",
].join(", ")])) as Record<number, string>;

export default function Die3D({ value }: { value: number }) {
  return <span className="die-3d" role="img" aria-label={`Dado: ${value}`}>
    <span className="die-spinner"><span className="die-cube" style={{ "--die-result-rotation": resultRotations[value] ?? resultRotations[1] } as CSSProperties}>
      {sides.map(([side, pips]) => <span key={side} className={`die-side die-side-${side}`} style={{ backgroundImage: sideBackgrounds[pips] }} aria-hidden="true" />)}
    </span></span>
  </span>;
}
