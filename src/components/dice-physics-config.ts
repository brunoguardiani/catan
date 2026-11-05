// Pixel based world units match the CSS dice and the measured table rectangle.
export const dicePhysicsConfig = {
  rotationSensitivity: 2.5, // degrees per pointer pixel
  throwSensitivity: 0.72,
  angularThrowSensitivity: 0.72,
  sampleWindowMs: 110,
  gravity: 1550, // pixels / second squared
  dieSize: 38,
  linearDamping: 0.6,
  angularDamping: 0.85,
  floorFriction: 0.66,
  wallFriction: 0.72,
  dieFriction: 0.45,
  restitution: 0.36,
  wallRestitution: 0.48,
  dieRestitution: 0.42,
  maxThrowSpeed: 780, // pixels / second
  maxAngularSpeed: 22, // radians / second
  fixedStep: 1 / 120,
  settleLinearSpeed: 19,
  settleAngularSpeed: 0.9,
  settleTime: 0.3,
  resultHoldMs: 2000,
  returnMs: 950,
};
