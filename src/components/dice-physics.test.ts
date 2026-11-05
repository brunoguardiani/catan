import { describe, expect, it } from "vitest";
import { angularVelocity, createDiceSimulation, identityQuat, rotateFromPointer, stepDiceSimulation, type Quat } from "./dice-physics";
import { recentGesture } from "./dice-gesture";

describe("gesto dos dados", () => {
  it("gira rapidamente em dois eixos sem perder a orientação anterior", () => {
    const first = rotateFromPointer(identityQuat, 30, 0);
    const second = rotateFromPointer(first, 0, 30);
    expect(Math.abs(first.y)).toBeGreaterThan(.5);
    expect(Math.abs(second.x)).toBeGreaterThan(.2);
    expect(Math.abs(second.y)).toBeGreaterThan(.2);
    expect(Math.hypot(second.x, second.y, second.z, second.w)).toBeCloseTo(1);
  });

  it("transfere o gesto recente e ignora um movimento que já parou", () => {
    const first = identityQuat;
    const last = rotateFromPointer(first, 50, -12);
    const samples = [
      { x: 120, y: 160, time: 0, orientation: first },
      { x: 145, y: 154, time: 30, orientation: rotateFromPointer(first, 25, -6) },
      { x: 170, y: 148, time: 60, orientation: last },
    ];
    const moving = recentGesture(samples, 60, 800, 600);
    expect(moving.vx).toBeGreaterThan(0);
    expect(moving.vy).toBeLessThan(0);
    expect(Math.hypot(moving.spin!.x, moving.spin!.y, moving.spin!.z)).toBeGreaterThan(0);
    expect(recentGesture(samples, 200, 800, 600).vx).toBe(0);
    expect(angularVelocity(first, last, .06).y).toBeGreaterThan(0);
  });
});

describe("simulação dos dados", () => {
  it("preserva a direção do lançamento e impede atravessar paredes, mesa e o outro dado", () => {
    const sim = createDiceSimulation({ x: .88, y: .5, vx: 2.2, vy: 0 }, 700, 500);
    expect(sim.bodies[0].velocity.x).toBeGreaterThan(0);
    let wallHits = 0;
    for (let step = 0; step < 120 * 5; step++) {
      wallHits += stepDiceSimulation(sim).filter(impact => impact.kind === "wall").length;
      for (const body of sim.bodies) {
        expect(body.position.x).toBeGreaterThanOrEqual(0);
        expect(body.position.x).toBeLessThanOrEqual(sim.width);
        expect(body.position.y).toBeGreaterThanOrEqual(0);
        expect(body.position.y).toBeLessThanOrEqual(sim.height);
        expect(body.position.z).toBeGreaterThanOrEqual(0);
      }
      const [a, b] = sim.bodies;
      expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z)).toBeGreaterThan(34);
    }
    expect(wallHits).toBeGreaterThan(0);
    expect(sim.state).toBe("settled");
  });

  it("termina sem impulso e conserva parte da rotação de um arremesso", () => {
    const sim = createDiceSimulation({ x: .5, y: .5, vx: 0, vy: 0, spin: { x: 8, y: 2, z: 0 } }, 700, 500);
    expect(sim.bodies[0].spin.x).toBeGreaterThan(6);
    for (let step = 0; step < 120 * 6 && sim.state !== "settled"; step++) stepDiceSimulation(sim);
    expect(sim.state).toBe("settled");
    expect(sim.bodies.every(body => Math.abs(body.orientation.w) > .999)).toBe(true);
  });

  it("estabiliza lançamentos em cantos, com impulsos altos e giros opostos", () => {
    for (const x of [.08, .5, .92]) for (const y of [.1, .88]) for (const direction of [-1, 1]) {
      const sim = createDiceSimulation({ x, y, vx: direction * 3.5, vy: -direction * 2.7, spin: { x: 18 * direction, y: -12, z: 8 } }, 640, 480);
      for (let step = 0; step < 120 * 8 && sim.state !== "settled"; step++) stepDiceSimulation(sim);
      expect(sim.state, `lançamento em ${x}, ${y}, direção ${direction}`).toBe("settled");
      expect(sim.bodies.every(body => Object.values(body.position).every(Number.isFinite))).toBe(true);
    }
  });

  it("não adiciona um novo giro quando os dados já estão quase parados", () => {
    const sim = createDiceSimulation({ x: .4, y: .6, vx: 1.2, vy: -.8, spin: { x: 9, y: -6, z: 2 } }, 720, 520);
    const quietOrientation: (Quat | null)[] = [null, null];
    for (let step = 0; step < 120 * 8 && sim.state !== "settled"; step++) {
      stepDiceSimulation(sim);
      sim.bodies.forEach((body, index) => {
        if (!quietOrientation[index] && body.quiet >= .12) quietOrientation[index] = { ...body.orientation };
      });
    }
    expect(sim.state).toBe("settled");
    sim.bodies.forEach((body, index) => {
      const before = quietOrientation[index]!;
      const dot = Math.abs(before.x * body.orientation.x + before.y * body.orientation.y + before.z * body.orientation.z + before.w * body.orientation.w);
      expect(2 * Math.acos(Math.min(1, dot))).toBeLessThan(.2);
    });
  });
});
