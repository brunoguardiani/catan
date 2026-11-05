import type { DiceThrow } from "@/game-engine/types";
import { dicePhysicsConfig as config } from "./dice-physics-config";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type DieBody = { position: Vec3; velocity: Vec3; spin: Vec3; orientation: Quat; quiet: number };
export type DiceSimulation = {
  bodies: [DieBody, DieBody];
  width: number;
  height: number;
  state: "rolling" | "settling" | "settled";
};
export type DiceImpact = { kind: "table" | "wall" | "dice"; speed: number };

export const identityQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

export function normalizeQuat(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return n > 1e-8 ? { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n } : identityQuat;
}

export function multiplyQuat(a: Quat, b: Quat): Quat {
  return normalizeQuat({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
}

export function axisAngle(axis: Vec3, angle: number): Quat {
  const n = length(axis);
  if (n < 1e-8 || Math.abs(angle) < 1e-8) return identityQuat;
  const sine = Math.sin(angle / 2) / n;
  return { x: axis.x * sine, y: axis.y * sine, z: axis.z * sine, w: Math.cos(angle / 2) };
}

export function rotateFromPointer(q: Quat, dx: number, dy: number): Quat {
  const radians = config.rotationSensitivity * Math.PI / 180;
  const pitch = axisAngle({ x: 1, y: 0, z: 0 }, -dy * radians);
  const yaw = axisAngle({ x: 0, y: 1, z: 0 }, dx * radians);
  // The small roll component makes diagonal and circular gestures less mechanical.
  const roll = axisAngle({ x: 0, y: 0, z: 1 }, (dx - dy) * radians * 0.12);
  return multiplyQuat(roll, multiplyQuat(yaw, multiplyQuat(pitch, q)));
}

export function angularVelocity(from: Quat, to: Quat, seconds: number): Vec3 {
  if (seconds <= 0) return { x: 0, y: 0, z: 0 };
  let delta = multiplyQuat(to, { x: -from.x, y: -from.y, z: -from.z, w: from.w });
  if (delta.w < 0) delta = { x: -delta.x, y: -delta.y, z: -delta.z, w: -delta.w };
  const sine = Math.hypot(delta.x, delta.y, delta.z);
  if (sine < 1e-7) return { x: 0, y: 0, z: 0 };
  const angle = 2 * Math.atan2(sine, delta.w);
  const speed = Math.min(config.maxAngularSpeed, angle / seconds);
  return { x: delta.x / sine * speed, y: delta.y / sine * speed, z: delta.z / sine * speed };
}

export function quaternionCss(q: Quat): string {
  const { x, y, z, w } = normalizeQuat(q);
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return `matrix3d(${[
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1,
  ].map(n => Number(n.toFixed(6))).join(",")})`;
}

function limitVector(v: Vec3, max: number): Vec3 {
  const speed = length(v);
  if (speed <= max) return v;
  const ratio = max / speed;
  return { x: v.x * ratio, y: v.y * ratio, z: v.z * ratio };
}

export function createDiceSimulation(throwData: DiceThrow, width: number, height: number): DiceSimulation {
  const margin = config.dieSize * 0.75;
  const x = clamp(throwData.x * width, margin, width - margin);
  const y = clamp(throwData.y * height, margin, height - margin);
  const vx = clamp(throwData.vx * width * config.throwSensitivity, -config.maxThrowSpeed, config.maxThrowSpeed);
  const vy = clamp(throwData.vy * height * config.throwSensitivity, -config.maxThrowSpeed, config.maxThrowSpeed);
  const norm = Math.hypot(vx, vy);
  const sideX = norm > 1 ? -vy / norm : 1;
  const sideY = norm > 1 ? vx / norm : 0;
  const initialSpin = limitVector(throwData.spin ?? { x: -vy * .012, y: vx * .012, z: (vx - vy) * .004 }, config.maxAngularSpeed);
  const orientation = normalizeQuat(throwData.orientation ?? identityQuat);
  const makeBody = (sign: number): DieBody => ({
    position: { x: clamp(x + sideX * sign * 23, margin, width - margin), y: clamp(y + sideY * sign * 23, margin, height - margin), z: 24 + (sign > 0 ? 8 : 0) },
    velocity: { x: vx + sideX * sign * 27, y: vy + sideY * sign * 27, z: 160 + Math.min(120, norm * .12) },
    spin: { x: initialSpin.x * (sign > 0 ? 1 : .86), y: initialSpin.y * (sign > 0 ? .9 : 1), z: initialSpin.z + sign * 1.4 },
    orientation,
    quiet: 0,
  });
  return { bodies: [makeBody(-1), makeBody(1)], width, height, state: "rolling" };
}

function stepBody(body: DieBody, sim: DiceSimulation, dt: number, impacts: DiceImpact[]) {
  const p = body.position, v = body.velocity, spin = body.spin;
  const linearDecay = Math.exp(-config.linearDamping * dt);
  const angularDecay = Math.exp(-config.angularDamping * dt);
  v.x *= linearDecay; v.y *= linearDecay;
  v.z -= config.gravity * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  const angularSpeed = length(spin);
  if (angularSpeed > 1e-5) body.orientation = multiplyQuat(axisAngle(spin, angularSpeed * dt), body.orientation);
  spin.x *= angularDecay; spin.y *= angularDecay; spin.z *= angularDecay;

  if (p.z <= 0) {
    p.z = 0;
    if (v.z < -35) {
      impacts.push({ kind: "table", speed: -v.z });
      v.z = -v.z * config.restitution;
      spin.x += -v.y * .005;
      spin.y += v.x * .005;
    } else v.z = 0;
    const friction = Math.exp(-config.floorFriction * 4 * dt);
    v.x *= friction; v.y *= friction;
    spin.x *= friction; spin.y *= friction; spin.z *= friction;
  }

  const margin = config.dieSize * .6;
  if (p.x < margin || p.x > sim.width - margin) {
    const incoming = Math.abs(v.x);
    p.x = clamp(p.x, margin, sim.width - margin);
    if ((p.x === margin && v.x < 0) || (p.x === sim.width - margin && v.x > 0)) {
      v.x *= -config.wallRestitution;
      v.y *= config.wallFriction;
      spin.z += Math.sign(v.y || 1) * incoming * .006;
      if (incoming > 45) impacts.push({ kind: "wall", speed: incoming });
    }
  }
  if (p.y < margin || p.y > sim.height - margin) {
    const incoming = Math.abs(v.y);
    p.y = clamp(p.y, margin, sim.height - margin);
    if ((p.y === margin && v.y < 0) || (p.y === sim.height - margin && v.y > 0)) {
      v.y *= -config.wallRestitution;
      v.x *= config.wallFriction;
      spin.z -= Math.sign(v.x || 1) * incoming * .006;
      if (incoming > 45) impacts.push({ kind: "wall", speed: incoming });
    }
  }
  Object.assign(spin, limitVector(spin, config.maxAngularSpeed));
}

function collideDice(a: DieBody, b: DieBody, impacts: DiceImpact[]) {
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y, dz = b.position.z - a.position.z;
  const minDistance = config.dieSize * .96;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= minDistance || distance < 1e-6) return;
  const nx = dx / distance, ny = dy / distance, nz = dz / distance;
  const overlap = (minDistance - distance) / 2;
  a.position.x -= nx * overlap; a.position.y -= ny * overlap; a.position.z = Math.max(0, a.position.z - nz * overlap);
  b.position.x += nx * overlap; b.position.y += ny * overlap; b.position.z = Math.max(0, b.position.z + nz * overlap);
  const relativeX = b.velocity.x - a.velocity.x, relativeY = b.velocity.y - a.velocity.y, relativeZ = b.velocity.z - a.velocity.z;
  const normalSpeed = relativeX * nx + relativeY * ny + relativeZ * nz;
  if (normalSpeed >= 0) return;
  const impulse = -(1 + config.dieRestitution) * normalSpeed / 2;
  a.velocity.x -= impulse * nx; a.velocity.y -= impulse * ny; a.velocity.z -= impulse * nz;
  b.velocity.x += impulse * nx; b.velocity.y += impulse * ny; b.velocity.z += impulse * nz;
  const tangentX = relativeX - normalSpeed * nx, tangentY = relativeY - normalSpeed * ny, tangentZ = relativeZ - normalSpeed * nz;
  const tangentSpeed = Math.hypot(tangentX, tangentY, tangentZ);
  if (tangentSpeed > 1e-6) {
    const frictionImpulse = Math.min(tangentSpeed / 2, impulse * config.dieFriction);
    const fx = tangentX / tangentSpeed * frictionImpulse, fy = tangentY / tangentSpeed * frictionImpulse, fz = tangentZ / tangentSpeed * frictionImpulse;
    a.velocity.x += fx; a.velocity.y += fy; a.velocity.z += fz;
    b.velocity.x -= fx; b.velocity.y -= fy; b.velocity.z -= fz;
  }
  const tangential = relativeX * ny - relativeY * nx;
  a.spin.z += tangential * .012; b.spin.z -= tangential * .012;
  a.spin.x -= relativeY * .003; b.spin.y += relativeX * .003;
  if (-normalSpeed > 45) impacts.push({ kind: "dice", speed: -normalSpeed });
}

function approachIdentity(q: Quat, amount: number): Quat {
  const target = q.w < 0 ? { x: 0, y: 0, z: 0, w: -1 } : identityQuat;
  return normalizeQuat({ x: q.x * (1 - amount), y: q.y * (1 - amount), z: q.z * (1 - amount), w: q.w * (1 - amount) + target.w * amount });
}

export function stepDiceSimulation(sim: DiceSimulation, dt = config.fixedStep): DiceImpact[] {
  if (sim.state === "settled") return [];
  const impacts: DiceImpact[] = [];
  for (const body of sim.bodies) stepBody(body, sim, dt, impacts);
  collideDice(sim.bodies[0], sim.bodies[1], impacts);
  let allQuiet = true;
  for (const body of sim.bodies) {
    const grounded = body.position.z <= .01 && body.velocity.z === 0;
    const slow = Math.hypot(body.velocity.x, body.velocity.y) < config.settleLinearSpeed && length(body.spin) < config.settleAngularSpeed;
    body.quiet = grounded && slow ? body.quiet + dt : 0;
    // Guide the official face during the last part of the roll, while the die
    // is still moving. Waiting until it is quiet creates a visible second turn.
    const spinSpeed = length(body.spin);
    if (grounded && spinSpeed < 12) body.orientation = approachIdentity(body.orientation, Math.min(1, dt * (spinSpeed < 3 ? 12 : 5)));
    if (body.quiet < config.settleTime || Math.abs(body.orientation.w) < .999) allQuiet = false;
  }
  sim.state = allQuiet ? "settled" : sim.bodies.some(body => body.quiet > 0) ? "settling" : "rolling";
  return impacts;
}
