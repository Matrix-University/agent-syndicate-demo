// Builds the dressed mannequin up into the bodybuilder from
// docs/image references/ChatGPT_Image_Jun_15_2026_08_55_47_PM.png: deltoids,
// arms, chest, back, traps, neck and thighs, with the head left its own size.
//
// It runs after the outfit, on every skinned primitive at once (body and
// overlays), so the suit, tie, lapels and hair grow with the body instead of
// being redrawn onto it. Mesh only: bones, bind matrices and clips are untouched.
//
// A vertex moves by the skin-weighted blend of what each of its bones asks for,
// and each bone only ever scales its cross-section outward from its own axis,
// by a gain that eases along the bone and meets the neighbouring bone's gain at
// the joint. So the mannequin's rigid pieces grow together and stay flush at
// their seams — pushing the pieces around independently is what read lumpy.
//
// Tune with the tables below and re-bake (npm run bake:anims:dcl).
import * as THREE from 'three';

// The torso, by height: growth sideways, forwards and backwards about the
// spine. The arms hang past the sides, so the width stays modest under the
// armpits and the breadth comes from the deltoids; the chest and back carry the
// mass instead. [y, side, front, back]
const TORSO = [
  [0.84, 1.1, 1.04, 1.12],
  [1.0, 1.08, 1.06, 1.12],
  [1.12, 1.06, 1.1, 1.14],
  [1.24, 1.12, 1.3, 1.3],
  [1.36, 1.18, 1.42, 1.38],
  [1.46, 1.22, 1.3, 1.34],
  [1.56, 1.16, 1.2, 1.3],
];
const TORSO_BONES = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r']);
// Traps: the shoulder line lifted towards the neck, so it slopes like the sheet.
const TRAPS = { lift: 0.03, inner: [0.03, 0.07], outer: [0.13, 0.19], from: 1.44, front: 0.07 };

// Limbs, from the bone (t = 0) to the next joint (t = 1): growth on each side
// of the cross-section, as [t, +u, -u, +v, -v]. For the arms u is up in the
// T-pose — out to the side once they hang — and v is forward (the biceps); for
// the legs u is outward and v forward; the neck is the same all round.
const LIMBS = {
  upperarm: {
    to: 'lowerarm', u: [0, 1, 0], v: [0, 0, 1], profile: [
      [0, 1.55, 1.05, 1.45, 1.4], // the deltoid cap
      [0.3, 1.5, 1.1, 1.45, 1.45],
      [0.6, 1.4, 1.15, 1.55, 1.5], // biceps and triceps
      [0.9, 1.25, 1.1, 1.3, 1.3],
      [1, 1.2, 1.1, 1.22, 1.22],
    ],
  },
  lowerarm: {
    to: 'hand', u: [0, 1, 0], v: [0, 0, 1], profile: [
      [0, 1.2, 1.1, 1.22, 1.22],
      [0.25, 1.42, 1.3, 1.35, 1.35],
      [0.7, 1.25, 1.2, 1.2, 1.2],
      [1, 1.16, 1.16, 1.16, 1.16],
    ],
  },
  hand: { to: 'middle_01', u: [0, 1, 0], v: [0, 0, 1], profile: [[0, 1.22, 1.22, 1.22, 1.22]] },
  thigh: {
    to: 'calf', u: 'out', v: [0, 0, 1], profile: [
      [0, 1.12, 1.03, 1.12, 1.16],
      [0.35, 1.4, 1.12, 1.38, 1.28], // the outer sweep of the quads
      [0.75, 1.28, 1.2, 1.26, 1.2], // and the teardrop over the knee
      [1, 1.12, 1.12, 1.12, 1.12],
    ],
  },
  calf: {
    to: 'foot', u: 'out', v: [0, 0, 1], profile: [
      [0, 1.12, 1.12, 1.12, 1.12],
      [0.3, 1.25, 1.25, 1.08, 1.38],
      [0.75, 1.1, 1.1, 1.04, 1.12],
      [1, 1, 1, 1, 1],
    ],
  },
  neck_01: {
    to: 'Head', u: [1, 0, 0], v: [0, 0, 1], profile: [
      [0, 1.45, 1.45, 1.35, 1.5],
      [1, 1.2, 1.2, 1.1, 1.25],
    ],
  },
};
// Every finger segment thickens a little, so the fists match the forearms.
const FINGER = /^(thumb|index|middle|ring|pinky)_0([123])_([lr])$/;
const FINGER_GAIN = 1.15;

/** Bulks every skinned mesh in `doc`. Returns the largest move, in metres. */
export function bulkUp(doc) {
  const root = doc.getRoot();
  let maxMove = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const trunk = torso(skin);
    const shapes = skin.listJoints().map((joint) => shapeFor(joint, skin, trunk));
    for (const prim of mesh.listPrimitives()) {
      maxMove = Math.max(maxMove, displace(prim, shapes));
    }
  }
  return maxMove;
}

// What one bone asks of a bind-pose point: a function of the point, or null
// for bones that keep their shape (head, feet, root).
function shapeFor(joint, skin, trunk) {
  const name = joint.getName();
  if (TORSO_BONES.has(name)) return trunk;
  const finger = FINGER.exec(name);
  if (finger) {
    const [, digit, segment, side] = finger;
    const next = find(skin, `${digit}_0${Number(segment) + 1}_${side}`)
      ?? find(skin, `${digit}_04_leaf_${side}`);
    const gain = [[0, FINGER_GAIN, FINGER_GAIN, FINGER_GAIN, FINGER_GAIN]];
    return next ? limb(joint, next, [0, 1, 0], [0, 0, 1], gain) : null;
  }
  const base = name.replace(/_[lr]$/, '');
  const spec = LIMBS[base];
  if (!spec) return null;
  const side = name.slice(base.length); // '', '_l' or '_r'
  const to = find(skin, `${spec.to}${side}`);
  if (!to) return null;
  const head = joint.getWorldTranslation();
  const u = spec.u === 'out' ? [Math.sign(head[0]) || 1, 0, 0] : spec.u;
  return limb(joint, to, u, spec.v, spec.profile);
}

function find(skin, name) {
  return skin.listJoints().find((joint) => joint.getName() === name) ?? null;
}

// Scales the cross-section about the bone's axis, each half by its own gain.
function limb(joint, to, u, v, profile) {
  const head = new THREE.Vector3(...joint.getWorldTranslation());
  const axis = new THREE.Vector3(...to.getWorldTranslation()).sub(head);
  const length = axis.length();
  axis.normalize();
  const U = new THREE.Vector3(...u).addScaledVector(axis, -new THREE.Vector3(...u).dot(axis)).normalize();
  const V = new THREE.Vector3(...v).addScaledVector(axis, -new THREE.Vector3(...v).dot(axis))
    .addScaledVector(U, -new THREE.Vector3(...v).dot(U)).normalize();
  const offset = new THREE.Vector3();
  const gains = [0, 0, 0, 0];
  return (point, out) => {
    offset.subVectors(point, head);
    const along = offset.dot(axis);
    sampleProfile(profile, along / length, gains);
    const ru = offset.dot(U);
    const rv = offset.dot(V);
    const gu = ru >= 0 ? gains[0] : gains[1];
    const gv = rv >= 0 ? gains[2] : gains[3];
    return out.copy(U).multiplyScalar(ru * (gu - 1)).addScaledVector(V, rv * (gv - 1));
  };
}

// One shape for all the torso's bones, by height rather than by bone, so the
// pelvis, spine and collarbone pieces grow alike wherever they meet.
function torso(skin) {
  // The spine's depth at each height is where front and back part.
  const spine = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01']
    .map((name) => find(skin, name)?.getWorldTranslation())
    .filter(Boolean)
    .map(([, y, z]) => [z, y]);
  const gains = [0, 0, 0];
  return (point, out) => {
    const centreZ = edgeAt(spine, point.y);
    sampleProfile(TORSO, point.y, gains, 4);
    const [side, front, back] = gains;
    const z = point.z - centreZ;
    const ax = Math.abs(point.x);
    const trap = TRAPS.lift
      * THREE.MathUtils.smoothstep(ax, TRAPS.inner[0], TRAPS.inner[1])
      * (1 - THREE.MathUtils.smoothstep(ax, TRAPS.outer[0], TRAPS.outer[1]))
      * THREE.MathUtils.smoothstep(point.y, TRAPS.from, TRAPS.from + 0.06)
      * (1 - THREE.MathUtils.smoothstep(z, 0, TRAPS.front));
    return out.set(point.x * (side - 1), trap, z * ((z >= 0 ? front : back) - 1));
  };
}

// Eased between a table's rows by their first column, clamped at the ends.
function sampleProfile(rows, at, out, width = 5) {
  const n = width - 1;
  if (at <= rows[0][0] || rows.length === 1) {
    for (let k = 0; k < n; k += 1) out[k] = rows[0][k + 1];
    return out;
  }
  for (let i = 1; i < rows.length; i += 1) {
    if (at <= rows[i][0]) {
      const s = (at - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
      const e = s * s * (3 - 2 * s);
      for (let k = 0; k < n; k += 1) out[k] = rows[i - 1][k + 1] + (rows[i][k + 1] - rows[i - 1][k + 1]) * e;
      return out;
    }
  }
  const last = rows[rows.length - 1];
  for (let k = 0; k < n; k += 1) out[k] = last[k + 1];
  return out;
}

// x of a polyline of (x, y) points at height y, clamped to its ends.
function edgeAt(points, y) {
  if (y <= points[0][1]) return points[0][0];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (y <= y1) return THREE.MathUtils.lerp(x0, x1, (y - y0) / Math.max(y1 - y0, 1e-9));
  }
  return points[points.length - 1][0];
}

// Moves one primitive's vertices, then turns each normal by however much the
// faces round it turned — keeping the authored hard edges and smoothing, and
// whichever way an overlay's triangles happen to be wound.
function displace(prim, shapes) {
  const position = prim.getAttribute('POSITION');
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  const normal = prim.getAttribute('NORMAL');
  const count = position.getCount();
  const before = Float32Array.from(position.getArray());
  const after = new Float32Array(before.length);
  const point = new THREE.Vector3();
  const move = new THREE.Vector3();
  const part = new THREE.Vector3();
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  let maxMove = 0;
  for (let i = 0; i < count; i += 1) {
    point.fromArray(before, i * 3);
    joints.getElement(i, j);
    weights.getElement(i, w);
    move.set(0, 0, 0);
    for (let k = 0; k < 4; k += 1) {
      const shape = w[k] > 0 && shapes[j[k]];
      if (shape) move.addScaledVector(shape(point, part), w[k]);
    }
    maxMove = Math.max(maxMove, move.length());
    point.add(move).toArray(after, i * 3);
  }
  position.setArray(after);

  if (normal) {
    const indices = prim.getIndices()?.getArray();
    const was = faceNormals(before, indices, count);
    const now = faceNormals(after, indices, count);
    const n = new THREE.Vector3();
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const array = Float32Array.from(normal.getArray());
    for (let i = 0; i < count; i += 1) {
      from.fromArray(was, i * 3);
      to.fromArray(now, i * 3);
      if (from.lengthSq() < 0.5 || to.lengthSq() < 0.5) continue; // in no face
      turn.setFromUnitVectors(from, to);
      n.fromArray(array, i * 3).applyQuaternion(turn).normalize().toArray(array, i * 3);
    }
    normal.setArray(array);
  }
  return maxMove;
}

// Area-weighted average of the faces round each vertex, unit length.
function faceNormals(positions, indices, count) {
  const out = new Float32Array(count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangles = indices ? indices.length : count;
  for (let t = 0; t + 2 < triangles; t += 3) {
    const ia = indices ? indices[t] : t;
    const ib = indices ? indices[t + 1] : t + 1;
    const ic = indices ? indices[t + 2] : t + 2;
    a.fromArray(positions, ia * 3);
    b.fromArray(positions, ib * 3).sub(a);
    c.fromArray(positions, ic * 3).sub(a);
    b.cross(c);
    for (const index of [ia, ib, ic]) {
      out[index * 3] += b.x;
      out[index * 3 + 1] += b.y;
      out[index * 3 + 2] += b.z;
    }
  }
  for (let i = 0; i < count; i += 1) {
    const length = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
    if (!length) continue;
    out[i * 3] /= length;
    out[i * 3 + 1] /= length;
    out[i * 3 + 2] /= length;
  }
  return out;
}
