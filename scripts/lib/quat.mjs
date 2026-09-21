// Minimal quaternion/vector helpers for the bake scripts. Plain arrays (xyzw) so
// they drop straight into glTF accessor data — no three.js in the Node pipeline.

export const DEG = Math.PI / 180;

export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

// Unit quaternions only — the conjugate is the inverse.
export const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qNorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function qFromAxisAngle(axis, angle) {
  const h = angle / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

export function qRotV(q, v) {
  const [x, y, z, w] = q;
  const ux = y * v[2] - z * v[1];
  const uy = z * v[0] - x * v[2];
  const uz = x * v[1] - y * v[0];
  return [
    v[0] + 2 * (w * ux + (y * uz - z * uy)),
    v[1] + 2 * (w * uy + (z * ux - x * uz)),
    v[2] + 2 * (w * uz + (x * uy - y * ux)),
  ];
}

// Scale a rotation's angle about its own axis (identity stays identity).
export function qScaleAngle(q, k) {
  const w = Math.min(1, Math.max(-1, Math.abs(q[3])));
  const sign = q[3] < 0 ? -1 : 1;
  const half = Math.acos(w);
  const s = Math.sin(half);
  if (s < 1e-7) return [0, 0, 0, 1];
  const axis = [sign * q[0] / s, sign * q[1] / s, sign * q[2] / s];
  return qFromAxisAngle(axis, 2 * half * k);
}

// Mean of a quaternion sequence: hemisphere-align to the first sample, average
// componentwise, renormalize. Exact enough for the small spreads we use it on.
export function qMean(list) {
  const ref = list[0];
  const acc = [0, 0, 0, 0];
  for (const q of list) {
    const dot = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3];
    const s = dot < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) acc[i] += s * q[i];
  }
  return qNorm(acc);
}

export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function vNorm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
