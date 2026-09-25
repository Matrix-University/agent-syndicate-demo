// Dresses the mannequin as the player character from
// docs/image references/AGENT_HULK_SHEET.png: a white two-button suit with
// notched lapels, flap pockets and a vented back over a black shirt and gold
// tie, a black belt with a gold buckle, black shoes, blond shoulder-length hair
// and gold aviators.
//
// It works on the bind pose, inside the bake, so the look ships in the same
// agent-dcl.glb the browser and Decentraland both load — no runtime tinting.
// The body keeps the mannequin's own shape, and nothing here touches the
// skeleton or the clips. (A muscle-bulk pass was tried and dropped: pushing the
// mannequin's rigid pieces around reads lumpy, and its proportions read better.)
//
//   - The skinned mesh is split into one primitive per region (suit, skin,
//     hair, shoes). The mannequin is built from rigid pieces, one per bone, so
//     the bone that moves a vertex most names its region and the lines fall on
//     the pieces' own seams.
//   - Everything else is a thin skinned overlay raycast onto the body, each
//     vertex weighted like the surface under it: shirt front, tie, cuffs,
//     lapels, buttons, pockets, belt, seams and creases, brows, nose and mouth,
//     and the hair. The body's triangles are too coarse to draw those in, and
//     its UVs overlap, so neither recolouring nor a texture could.
//   - The aviators are rigid meshes parented to the Head bone.
//
// Tune the look with the tables below and re-bake (npm run bake:anims:dcl).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Authored in sRGB, like the sheet; converted to glTF's linear factors below.
const MATERIALS = {
  suit: { color: [0.93, 0.93, 0.9], roughness: 0.72, metallic: 0 },
  // Lapels, flaps, buttons and creases: the suit's cloth a shade apart.
  trim: { color: [0.8, 0.8, 0.76], roughness: 0.5, metallic: 0 },
  // Hem, vent, back seam and lapel edges: the lines a white suit reads by.
  seam: { color: [0.5, 0.5, 0.48], roughness: 0.85, metallic: 0 },
  // Shirt front, collar, cuffs and belt.
  shirt: { color: [0.035, 0.035, 0.04], roughness: 0.55, metallic: 0 },
  // Satin and gold stay mostly dielectric: the game lights by lamps alone, and
  // a fully metallic surface with no environment to reflect renders black.
  tie: { color: [0.86, 0.66, 0.14], roughness: 0.3, metallic: 0.2 },
  shoes: { color: [0.02, 0.02, 0.02], roughness: 0.22, metallic: 0.15 },
  skin: { color: [0.62, 0.42, 0.29], roughness: 0.58, metallic: 0 },
  // Streaked through COLOR_0 as multipliers under 1, so it stays blond wherever
  // vertex colours aren't drawn.
  hair: { color: [0.92, 0.76, 0.42], roughness: 0.5, metallic: 0.05, doubleSided: true },
  features: { color: [0.3, 0.2, 0.12], roughness: 0.7, metallic: 0 }, // brows, mouth
  stubble: { color: [0.52, 0.35, 0.25], roughness: 0.85, metallic: 0 }, // the jaw
  lens: { color: [0.03, 0.035, 0.03], roughness: 0.08, metallic: 0.3 },
  frame: { color: [0.9, 0.74, 0.36], roughness: 0.3, metallic: 0.35 }, // aviators, buckle
};

// Heights and widths on the mannequin, which stands 1.81m in a T-pose facing
// +Z with its left along +X. Pieces drawn on one side are mirrored.
const V_BOTTOM = 1.16; // the jacket's V opens from the top button...
const V_TOP = 1.53; // ...up to the collar
const V_SPREAD = 0.3; // its half-width gained per metre up
const TIE_TOP = 1.485;
const TIE_KNOT = 1.445;
// The lapel's outer edge, bottom to top; the dip at 1.42–1.44 is the notch.
const LAPEL_EDGE = [[0.014, 1.16], [0.06, 1.26], [0.1, 1.36], [0.114, 1.415],
  [0.099, 1.43], [0.108, 1.455], [0.112, 1.51]];
const BUTTONS = [1.143, 1.078];
// Below the lower button the fronts part towards the hem, showing the belt.
const CUTAWAY_EDGE = [[0.004, 1.07], [0.02, 1.03], [0.045, 0.99], [0.07, 0.945], [0.085, 0.9]];
const HEM_Y = 0.9; // just below the seat, as a suit jacket hangs
const BELT = [0.998, 1.028];
const FLAP = { inner: 0.058, outer: 0.138, bottom: 1.03, top: 1.056 };
const CREASE_X = 0.089; // down the middle of each leg
const CUFF = [0.6, 0.646]; // along the forearm, between sleeve and hand

// Hair, relative to the measured head: where its lower edge sits, going round
// from the forehead (0) to the nape (1, in half-turns). It frames the face,
// covers the ears and falls to the shoulders behind.
const HAIR_EDGE = [[0, 0.085], [0.14, 0.075], [0.3, -0.015], [0.42, -0.1], [0.62, -0.16], [1, -0.215]];
const HAIR_CLEARANCE = 0.018; // how far it stands off the scalp
const HAIR_CROWN = 0.03; // extra volume on top
const HAIR_FLARE = 2.2; // how fast it widens below eye level, per metre
const HAIR_BONES = new Set(['Head', 'neck_01', 'spine_03']); // what it may follow

// Padded jacket shoulders: a raised ridge over each collarbone piece, from the
// neck out to where the arm begins, highest over the middle.
const PAD = { inner: 0.1, full: [0.125, 0.14], outer: 0.15, depth: 0.1, height: 0.012 };
// The jaw: stubble over the lower face, thickening towards the jawline so the
// mannequin's egg-shaped head reads square-jawed, and narrowing up to the lip.
const JAW = { halfWidth: [0.058, 0.03], top: -0.058, thickness: 0.006 };

const FINGER = /^(thumb|index|middle|ring|pinky)/;

function regionOf(bone, x, y, z) {
  const ax = Math.abs(x);
  if (bone === 'Head') {
    // Only where the hair shell covers it: the forehead stays skin.
    const scalp = (y > 1.742 && z < 0.06) || (z < -0.015 && y > 1.62) || (ax > 0.072 && y > 1.675 && z < 0.07);
    return scalp ? 'hair' : 'skin';
  }
  if (bone === 'neck_01') return y < 1.522 || z < -0.02 ? 'shirt' : 'skin'; // the collar
  if (bone.startsWith('hand') || FINGER.test(bone)) return 'skin';
  if (bone.startsWith('foot') || bone.startsWith('ball')) return 'shoes';
  if (bone.startsWith('calf')) return y < 0.115 ? 'shoes' : 'suit';
  return 'suit';
}

/** Dresses every skinned mesh in `doc` and puts the aviators on Head. */
export function dressOutfit(doc) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const materials = createMaterials(doc);
  const counts = {};
  const tally = (name, triangles) => { counts[name] = (counts[name] ?? 0) + triangles; };
  const headSamples = [];

  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const joints = skin.listJoints();
    const jointNames = joints.map((joint) => joint.getName());
    const parts = [];
    for (const prim of [...mesh.listPrimitives()]) {
      const regions = classify(prim, jointNames, headSamples);
      for (const [region, indices] of trianglesByRegion(prim, regions)) {
        const part = compactPrimitive(doc, buffer, prim, indices).setMaterial(materials[region]);
        mesh.addPrimitive(part);
        parts.push(part);
        tally(region, indices.length / 3);
      }
      mesh.removePrimitive(prim);
      prim.dispose();
    }

    // One overlay per material, however many pieces draw into it.
    const surface = new BodySurface(parts, jointNames);
    const layers = new Map();
    const layer = (name, options) => {
      if (!layers.has(name)) layers.set(name, new Overlay(surface.JointArray, options));
      return layers.get(name);
    };
    const headShape = measureHead(headSamples);
    shirtFront(surface, layer('shirt'));
    cuffs(surface, layer('shirt'), joints);
    belt(surface, layer('shirt'));
    tie(surface, layer('tie'));
    lapels(surface, layer('trim'));
    buttons(surface, layer('trim'));
    pocketFlaps(surface, layer('trim'));
    creases(surface, layer('trim'));
    pads(surface, layer('suit'));
    seams(surface, layer('seam'));
    buckle(surface, layer('frame'));
    face(surface, layer('features'), layer('skin'), layer('stubble'), headShape);
    hair(surface, layer('hair', { colors: true }), headShape);
    for (const [name, overlay] of layers) {
      if (!overlay.triangles) continue;
      mesh.addPrimitive(overlay.toPrimitive(doc, buffer).setMaterial(materials[name]));
      tally(name, overlay.triangles);
    }
    surface.dispose();
  }

  const head = root.listNodes().find((n) => n.getName() === 'Head');
  const aviators = head && headSamples.length
    ? addAviators(doc, buffer, head, measureHead(headSamples), materials)
    : 0;
  return { triangles: counts, accessoryTriangles: aviators };
}

function createMaterials(doc) {
  const materials = {};
  for (const [name, spec] of Object.entries(MATERIALS)) {
    materials[name] = doc.createMaterial(`M_${name[0].toUpperCase()}${name.slice(1)}`)
      .setBaseColorFactor([...spec.color.map(srgbToLinear), 1])
      .setRoughnessFactor(spec.roughness)
      .setMetallicFactor(spec.metallic)
      .setDoubleSided(!!spec.doubleSided);
  }
  return materials;
}

// Each vertex's region, from the bind pose and the bone that moves it most.
function classify(prim, jointNames, headSamples) {
  const position = prim.getAttribute('POSITION');
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  const p = [0, 0, 0];
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  const regions = new Array(position.getCount());
  for (let i = 0; i < regions.length; i += 1) {
    position.getElement(i, p);
    joints.getElement(i, j);
    weights.getElement(i, w);
    const bone = jointNames[j[dominantInfluence(w)]];
    regions[i] = regionOf(bone, p[0], p[1], p[2]);
    if (bone === 'Head') headSamples.push([p[0], p[1], p[2]]);
  }
  return regions;
}

function dominantInfluence(weights) {
  let dominant = 0;
  for (let k = 1; k < weights.length; k += 1) if (weights[k] > weights[dominant]) dominant = k;
  return dominant;
}

function trianglesByRegion(prim, regions) {
  const indices = prim.getIndices();
  const count = indices ? indices.getCount() : prim.getAttribute('POSITION').getCount();
  const buckets = new Map();
  for (let t = 0; t < count; t += 3) {
    const a = indices ? indices.getScalar(t) : t;
    const b = indices ? indices.getScalar(t + 1) : t + 1;
    const c = indices ? indices.getScalar(t + 2) : t + 2;
    // Majority vote; with three different answers the first vertex wins.
    const region = regions[b] === regions[c] ? regions[b] : regions[a];
    if (!buckets.has(region)) buckets.set(region, []);
    buckets.get(region).push(a, b, c);
  }
  return buckets;
}

// Each region gets its own compact copy of the vertices it uses, rather than
// sharing the original accessors — Draco compresses per primitive and would
// otherwise duplicate the whole body into every region.
function compactPrimitive(doc, buffer, source, indices) {
  const remap = new Map();
  for (const index of indices) if (!remap.has(index)) remap.set(index, remap.size);
  const prim = doc.createPrimitive();
  for (const semantic of source.listSemantics()) {
    const from = source.getAttribute(semantic);
    const size = from.getElementSize();
    const ArrayType = from.getArray().constructor;
    const array = new ArrayType(remap.size * size);
    const element = new Array(size);
    for (const [oldIndex, newIndex] of remap) {
      from.getElement(oldIndex, element);
      for (let k = 0; k < size; k += 1) array[newIndex * size + k] = element[k];
    }
    prim.setAttribute(semantic, doc.createAccessor()
      .setType(from.getType())
      .setNormalized(from.getNormalized())
      .setArray(array)
      .setBuffer(buffer));
  }
  const IndexArray = remap.size > 65535 ? Uint32Array : Uint16Array;
  prim.setIndices(doc.createAccessor()
    .setType('SCALAR')
    .setArray(IndexArray.from(indices, (index) => remap.get(index)))
    .setBuffer(buffer));
  return prim;
}

// --- The body as something to draw on --------------------------------------

/** The dressed body as a raycast target that knows the skin under each hit. */
class BodySurface {
  constructor(parts, jointNames) {
    this.jointNames = jointNames;
    this.JointArray = parts[0].getAttribute('JOINTS_0').getArray().constructor;
    this._material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this._vertices = []; // for nearest-skin lookups
    this.meshes = parts.map((prim) => {
      const position = prim.getAttribute('POSITION');
      const joints = prim.getAttribute('JOINTS_0');
      const weights = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < position.getCount(); i += 1) {
        const skin = { joints: joints.getElement(i, []), weights: weights.getElement(i, []) };
        this._vertices.push({
          ...skin,
          point: new THREE.Vector3(...position.getElement(i, [])),
          bone: jointNames[skin.joints[dominantInfluence(skin.weights)]],
        });
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position.getArray()), 3));
      geometry.setIndex(Array.from(prim.getIndices().getArray()));
      const mesh = new THREE.Mesh(geometry, this._material);
      mesh.userData.prim = prim;
      return mesh;
    });
    this._raycaster = new THREE.Raycaster();
    this._corner = new THREE.Vector3();
  }

  /** The first surface along a ray, with the skinning of its nearest corner. */
  cast(origin, direction) {
    this._raycaster.set(origin, direction);
    const hit = this._raycaster.intersectObjects(this.meshes, false)[0];
    if (!hit) return null;
    const position = hit.object.geometry.attributes.position;
    let nearest = hit.face.a;
    let nearestDistance = Infinity;
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      const distance = this._corner.fromBufferAttribute(position, index).distanceToSquared(hit.point);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    const normal = hit.face.normal.clone();
    if (normal.dot(direction) > 0) normal.negate(); // face the ray, whatever the winding
    const prim = hit.object.userData.prim;
    const joints = prim.getAttribute('JOINTS_0').getElement(nearest, []);
    const weights = prim.getAttribute('WEIGHTS_0').getElement(nearest, []);
    return {
      point: hit.point.clone(),
      normal,
      joints,
      weights,
      bone: this.jointNames[joints[dominantInfluence(weights)]],
    };
  }

  /** Straight in at (x, y) from the front (side 1) or the back (side -1). */
  castAt(x, y, side = 1) {
    return this.cast(new THREE.Vector3(x, y, side), new THREE.Vector3(0, 0, -side));
  }

  /** The skin of the body vertex nearest `point`, among the given bones. */
  nearestSkin(point, bones) {
    let best = null;
    let bestDistance = Infinity;
    for (const vertex of this._vertices) {
      if (!bones.has(vertex.bone)) continue;
      const distance = vertex.point.distanceToSquared(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = vertex;
      }
    }
    return best;
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this._material.dispose();
  }
}

class Overlay {
  constructor(JointArray, { colors = false } = {}) {
    this.JointArray = JointArray;
    this.positions = [];
    this.normals = [];
    this.joints = [];
    this.weights = [];
    this.colors = colors ? [] : null;
    this.indices = [];
  }

  get triangles() {
    return this.indices.length / 3;
  }

  /** A vertex on a hit, `offset` proud of it. */
  add(hit, offset, color) {
    return this.addVertex(hit.point.clone().addScaledVector(hit.normal, offset), hit.normal, hit, color);
  }

  addVertex(point, normal, skin, color = [1, 1, 1]) {
    this.positions.push(point.x, point.y, point.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.joints.push(...skin.joints);
    this.weights.push(...skin.weights);
    this.colors?.push(...color);
    return this.positions.length / 3 - 1;
  }

  quad(a, b, c, d) {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }

  /** A triangle wound to face the way its vertices' normals do. */
  triangle(a, b, c) {
    const cross = this._cross(a, b, c);
    if (Math.hypot(...cross) < 1e-10) return; // collapsed, e.g. at the V's point
    let facing = 0;
    for (const i of [a, b, c]) {
      for (let k = 0; k < 3; k += 1) facing += cross[k] * this.normals[i * 3 + k];
    }
    if (facing >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /** A flat-shaded triangle of its own, facing along `outward`. */
  facet(p1, p2, p3, outward, skin) {
    const normal = new THREE.Vector3().crossVectors(p2.clone().sub(p1), p3.clone().sub(p1)).normalize();
    if (normal.dot(outward) < 0) normal.negate();
    this.triangle(...[p1, p2, p3].map((p) => this.addVertex(p, normal, skin)));
  }

  _cross(a, b, c) {
    const p = (i, k) => this.positions[i * 3 + k];
    const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
    const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
    return [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
  }

  toPrimitive(doc, buffer) {
    const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', accessor('VEC3', new Float32Array(this.positions)))
      .setAttribute('NORMAL', accessor('VEC3', new Float32Array(this.normals)))
      .setAttribute('JOINTS_0', accessor('VEC4', new this.JointArray(this.joints)))
      .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(this.weights)))
      .setIndices(accessor('SCALAR', new Uint16Array(this.indices)));
    if (this.colors) prim.setAttribute('COLOR_0', accessor('VEC3', new Float32Array(this.colors)));
    return prim;
  }
}

// --- Ways of drawing on it -------------------------------------------------

// A (rows × cols) grid of rays onto the body, stitched into quads. `rayAt(u, v)`
// maps the grid's 0–1 coordinates to a ray. `offset` is a distance or a
// function of the hit (a raised piece); `accept(hit)` can refuse a landing.
function sheet(surface, overlay, rows, cols, rayAt, offset, accept = () => true) {
  const grid = [];
  for (let r = 0; r <= rows; r += 1) {
    const row = [];
    for (let c = 0; c <= cols; c += 1) {
      const ray = rayAt(c / cols, r / rows);
      const hit = surface.cast(ray.origin, ray.direction);
      const ok = hit && accept(hit);
      row.push(ok ? overlay.add(hit, typeof offset === 'function' ? offset(hit) : offset) : -1);
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const quad = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]];
      if (quad.every((index) => index >= 0)) overlay.quad(...quad);
    }
  }
}

/** Fills between left(y) and right(y), from `from` up to `to`, cast from `side`. */
function span(surface, overlay, { from, to, left, right, rows, cols, offset, side = 1 }) {
  sheet(surface, overlay, rows, cols, (u, v) => {
    const y = from + (to - from) * v;
    const x = left(y) + (right(y) - left(y)) * u;
    return {
      origin: new THREE.Vector3(x, y, side),
      direction: new THREE.Vector3(0, 0, -side),
    };
  }, offset);
}

/** A strip `width` wide along a polyline of (x, y) points, cast from `side`. */
function line(surface, overlay, points, width, offset, side = 1) {
  const path = resample(points, 0.008); // finer is invisible at game distance
  const ends = path.map((point, i) => {
    const prev = path[Math.max(i - 1, 0)];
    const next = path[Math.min(i + 1, path.length - 1)];
    const length = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
    const nx = (-(next[1] - prev[1]) / length) * (width / 2);
    const ny = ((next[0] - prev[0]) / length) * (width / 2);
    return [[point[0] + nx, point[1] + ny], [point[0] - nx, point[1] - ny]].map(([x, y]) => {
      const hit = surface.castAt(x, y, side);
      return hit ? overlay.add(hit, offset) : -1;
    });
  });
  for (let i = 0; i + 1 < ends.length; i += 1) {
    const [a, b] = ends[i];
    const [c, d] = ends[i + 1];
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) overlay.quad(a, b, d, c);
  }
}

/** A band `width` tall round the body at height `y`, where `keep(point)`. */
function ring(surface, overlay, y, width, offset, keep) {
  const steps = 96;
  const ends = [];
  for (let k = 0; k <= steps; k += 1) {
    const angle = (k / steps) * Math.PI * 2;
    const inward = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));
    ends.push([y + width / 2, y - width / 2].map((height) => {
      const hit = surface.cast(new THREE.Vector3(0, height, -0.01).addScaledVector(inward, -0.6), inward);
      return hit && keep(hit.point) ? overlay.add(hit, offset) : -1;
    }));
  }
  for (let k = 0; k < steps; k += 1) {
    const [a, b] = ends[k];
    const [c, d] = ends[k + 1];
    if (a >= 0 && b >= 0 && c >= 0 && d >= 0) overlay.quad(a, b, d, c);
  }
}

/** A small domed disc at (x, y) on the front — a button. */
function stud(surface, overlay, x, y, radius, rise, offset) {
  const hit = surface.castAt(x, y);
  if (!hit) return;
  const { right, up } = tangents(hit.normal);
  const base = hit.point.clone().addScaledVector(hit.normal, offset);
  const centre = overlay.addVertex(base.clone().addScaledVector(hit.normal, rise), hit.normal, hit);
  const rim = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const out = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
    const normal = hit.normal.clone().addScaledVector(out, 0.8).normalize();
    rim.push(overlay.addVertex(base.clone().addScaledVector(out, radius), normal, hit));
  }
  for (let i = 0; i < 12; i += 1) overlay.triangle(centre, rim[i], rim[(i + 1) % 12]);
}

/** A flat rectangle `width` × `height` at (x, y) on the front. */
function plate(surface, overlay, x, y, width, height, offset) {
  const hit = surface.castAt(x, y);
  if (!hit) return;
  const { right, up } = tangents(hit.normal);
  const corner = (u, v) => overlay.addVertex(hit.point.clone()
    .addScaledVector(hit.normal, offset)
    .addScaledVector(right, (u * width) / 2)
    .addScaledVector(up, (v * height) / 2), hit.normal, hit);
  overlay.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
}

function tangents(normal) {
  const right = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  return { right, up };
}

function resample(points, step) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k += 1) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** x along a polyline of (x, y) points at height y, clamped to its ends. */
function edgeAt(points, y) {
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  if (y <= sorted[0][1]) return sorted[0][0];
  for (let i = 1; i < sorted.length; i += 1) {
    const [x0, y0] = sorted[i - 1];
    const [x1, y1] = sorted[i];
    if (y <= y1) return THREE.MathUtils.lerp(x0, x1, (y - y0) / Math.max(y1 - y0, 1e-9));
  }
  return sorted[sorted.length - 1][0];
}

const vHalf = (y) => Math.max(0, (y - V_BOTTOM) * V_SPREAD);
const mirrored = (points, side) => points.map(([x, y]) => [side * x, y]);

// --- The suit --------------------------------------------------------------

function shirtFront(surface, overlay) {
  span(surface, overlay, {
    from: V_BOTTOM, to: V_TOP, rows: 18, cols: 10, offset: 0.004,
    left: (y) => -vHalf(y), right: vHalf,
  });
}

// Tucked under the jacket where the V closes, so only the knot and the blade
// inside the opening show.
function tie(surface, overlay) {
  const half = (y) => Math.min(y > TIE_KNOT ? 0.022 : 0.015 + (TIE_KNOT - y) * 0.06, vHalf(y) * 0.92);
  span(surface, overlay, {
    from: V_BOTTOM + 0.012, to: TIE_TOP, rows: 16, cols: 4, offset: 0.008,
    left: (y) => -half(y), right: half,
  });
}

function lapels(surface, overlay) {
  for (const side of [-1, 1]) {
    span(surface, overlay, {
      from: V_BOTTOM, to: LAPEL_EDGE[LAPEL_EDGE.length - 1][1], rows: 36, cols: 5, offset: 0.005,
      left: (y) => side * vHalf(y), right: (y) => side * edgeAt(LAPEL_EDGE, y),
    });
  }
}

function buttons(surface, overlay) {
  for (const y of BUTTONS) stud(surface, overlay, 0, y, 0.0075, 0.003, 0.005);
}

function pocketFlaps(surface, overlay) {
  for (const side of [-1, 1]) {
    span(surface, overlay, {
      from: FLAP.bottom, to: FLAP.top, rows: 4, cols: 8, offset: 0.004,
      left: () => side * FLAP.inner, right: () => side * FLAP.outer,
    });
  }
}

// Where the fronts part below the lower button: belt showing between them.
function belt(surface, overlay) {
  span(surface, overlay, {
    from: BELT[0], to: BELT[1], rows: 4, cols: 6, offset: 0.004,
    left: (y) => -edgeAt(CUTAWAY_EDGE, y), right: (y) => edgeAt(CUTAWAY_EDGE, y),
  });
}

function buckle(surface, overlay) {
  plate(surface, overlay, 0, (BELT[0] + BELT[1]) / 2, 0.022, 0.018, 0.007);
}

function creases(surface, overlay) {
  for (const side of [-1, 1]) {
    line(surface, overlay, [[side * CREASE_X, HEM_Y - 0.03], [side * CREASE_X, 0.14]], 0.003, 0.003);
  }
}

// Rays straight down onto each collarbone piece. Only that piece takes the pad:
// it moves as one, where a pad reaching onto the arm would tear as it swings.
function pads(surface, overlay) {
  const rise = (x) => THREE.MathUtils.smoothstep(x, PAD.inner, PAD.full[0])
    * (1 - THREE.MathUtils.smoothstep(x, PAD.full[1], PAD.outer));
  for (const side of [-1, 1]) {
    sheet(surface, overlay, 10, 8, (u, v) => ({
      origin: new THREE.Vector3(side * (PAD.inner + (PAD.outer - PAD.inner) * u), 2, (v * 2 - 1) * PAD.depth),
      direction: new THREE.Vector3(0, -1, 0),
    }), (hit) => {
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(hit.point.z + 0.01), PAD.depth * 0.45, PAD.depth);
      return 0.002 + PAD.height * rise(Math.abs(hit.point.x)) * fade;
    }, (hit) => hit.bone.startsWith('clavicle') || hit.bone === 'spine_03');
  }
}

// The lines a white suit is read by: lapel edges, the fronts' cutaway, the hem,
// the flaps' lower edges, and the back seam and vent.
function seams(surface, overlay) {
  const inCutaway = (p) => p.z > 0 && Math.abs(p.x) < edgeAt(CUTAWAY_EDGE, p.y);
  for (const side of [-1, 1]) {
    line(surface, overlay, mirrored(LAPEL_EDGE, side), 0.0035, 0.007);
    line(surface, overlay, mirrored(CUTAWAY_EDGE, side), 0.004, 0.005);
    line(surface, overlay, [[side * FLAP.inner, FLAP.bottom], [side * FLAP.outer, FLAP.bottom]], 0.003, 0.006);
  }
  ring(surface, overlay, HEM_Y, 0.005, 0.005, (p) => !inCutaway(p));
  line(surface, overlay, [[0, HEM_Y], [0, 1.47]], 0.003, 0.004, -1);
  line(surface, overlay, [[0.014, HEM_Y], [0.014, 1.02]], 0.003, 0.004, -1); // the vent
}

// A black band round each wrist: rays aimed in at the forearm's axis.
function cuffs(surface, overlay, joints) {
  const find = (name) => joints.find((joint) => joint.getName() === name);
  for (const side of ['l', 'r']) {
    const elbow = find(`lowerarm_${side}`);
    const wrist = find(`hand_${side}`);
    if (!elbow || !wrist) continue;
    const start = new THREE.Vector3(...elbow.getWorldTranslation());
    const axis = new THREE.Vector3(...wrist.getWorldTranslation()).sub(start).normalize();
    const across = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
    const up = axis.clone().cross(across).normalize();
    const from = CUFF[0] - Math.abs(start.x);
    const to = CUFF[1] - Math.abs(start.x);
    sheet(surface, overlay, 3, 20, (u, v) => {
      const centre = start.clone().addScaledVector(axis, from + (to - from) * v);
      const angle = u * Math.PI * 2;
      const out = across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      return { origin: centre.clone().addScaledVector(out, 0.2), direction: out.negate() };
    }, 0.004);
  }
}

// --- Head ------------------------------------------------------------------

function measureHead(samples) {
  let top = -Infinity;
  let bottom = Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let halfWidth = 0;
  for (const [x, y, z] of samples) {
    top = Math.max(top, y);
    bottom = Math.min(bottom, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    halfWidth = Math.max(halfWidth, Math.abs(x));
  }
  const eyeY = bottom + (top - bottom) * 0.55;
  // The brow at eye height, a little off centre — where the lenses sit.
  let eyeZ = -Infinity;
  for (const [x, y, z] of samples) {
    if (Math.abs(y - eyeY) < 0.015 && Math.abs(x) > 0.02 && Math.abs(x) < 0.05) eyeZ = Math.max(eyeZ, z);
  }
  if (!Number.isFinite(eyeZ)) eyeZ = maxZ - 0.02;
  return {
    top, bottom, eyeY, eyeZ, halfWidth,
    centerZ: (minZ + maxZ) / 2 - 0.01,
    halfDepth: (maxZ - minZ) / 2,
  };
}

// Brows over the glasses, a nose under their bridge and a set mouth — enough
// for the face to read as one behind the shades.
function face(surface, features, skin, stubble, head) {
  // Stubble over the lower face, thicker towards the jawline.
  const jawBottom = head.bottom + 0.004;
  const jawTop = head.eyeY + JAW.top;
  const jawHalf = (y) => THREE.MathUtils.lerp(JAW.halfWidth[0], JAW.halfWidth[1], (y - jawBottom) / (jawTop - jawBottom));
  span(surface, stubble, {
    from: jawBottom, to: jawTop, rows: 10, cols: 12,
    left: (y) => -jawHalf(y), right: jawHalf,
    offset: (hit) => 0.0015 + JAW.thickness * (1 - (hit.point.y - jawBottom) / (jawTop - jawBottom)),
  });

  const browY = head.eyeY + 0.03;
  for (const side of [-1, 1]) {
    line(surface, features, mirrored([[0.014, browY], [0.04, browY + 0.007], [0.068, browY + 0.003]], side),
      0.006, 0.003);
  }
  const mouthY = head.eyeY - 0.092;
  line(surface, features, [[-0.021, mouthY - 0.004], [0, mouthY], [0.021, mouthY - 0.004]], 0.004, 0.008);

  const hit = surface.castAt(0, head.eyeY - 0.024);
  if (!hit) return;
  const { right, up } = tangents(hit.normal);
  const at = (u, v, out) => hit.point.clone()
    .addScaledVector(right, u).addScaledVector(up, v).addScaledVector(hit.normal, out);
  const bridge = at(0, 0.022, 0.004);
  const tip = at(0, -0.008, 0.024);
  const left = at(-0.015, -0.014, 0.003);
  const rightSide = at(0.015, -0.014, 0.003);
  const base = at(0, -0.016, 0.009);
  skin.facet(bridge, left, tip, hit.normal, hit);
  skin.facet(bridge, tip, rightSide, hit.normal, hit);
  skin.facet(left, base, tip, hit.normal, hit);
  skin.facet(base, rightSide, tip, hit.normal, hit);
}

// A shell round the head, crown to a lower edge that frames the face and falls
// to the shoulders behind (HAIR_EDGE). Above eye level it follows the skull and
// is pushed clear of the scalp wherever the head bulges past it; below, it
// hangs and flares. Each vertex follows the head, neck or upper back nearest
// it, so it rides the head on top and settles on the shoulders at the ends.
function hair(surface, overlay, head) {
  const columns = 48;
  const rows = 20;
  const top = head.top + HAIR_CROWN;
  const sx = head.halfWidth + HAIR_CLEARANCE;
  const sz = head.halfDepth + HAIR_CLEARANCE;
  const edgeY = (angle) => head.eyeY + smoothEdge(HAIR_EDGE, Math.abs(angle) / Math.PI);
  const streak = (c) => {
    const h = (i) => fract(Math.sin(((i + columns) % columns) * 12.9898) * 43758.5453);
    return 0.8 + 0.2 * ((h(c - 1) + h(c) * 2 + h(c + 1)) / 4);
  };
  const grid = [];
  for (let c = 0; c < columns; c += 1) {
    const angle = (c / columns) * Math.PI * 2;
    const fromFront = angle > Math.PI ? angle - Math.PI * 2 : angle;
    const bottom = edgeY(fromFront);
    const column = [];
    for (let r = 0; r <= rows; r += 1) {
      const t = r / rows;
      const y = top + (bottom - top) * t;
      const above = y >= head.eyeY;
      const s = above ? Math.min((y - head.eyeY) / (top - head.eyeY), 1) : 0;
      const spread = above ? Math.sqrt(1 - s * s) : 1 + (head.eyeY - y) * HAIR_FLARE;
      const planned = new THREE.Vector3(
        sx * spread * Math.sin(angle), y, head.centerZ + sz * spread * Math.cos(angle)
      );
      const centre = new THREE.Vector3(0, above ? head.eyeY : y, head.centerZ);
      const out = planned.clone().sub(centre);
      const distance = out.length();
      out.normalize();
      // Clear the body: the nearest surface along this line, if it is close,
      // sets a floor under the hair. (Farther hits are arms, not scalp.)
      const hit = surface.cast(centre.clone().addScaledVector(out, distance + 0.05), out.clone().negate());
      let radius = distance;
      if (hit) {
        const under = hit.point.distanceTo(centre);
        if (under > distance - 0.05) radius = Math.max(distance, under + HAIR_CLEARANCE);
      }
      const point = centre.clone().addScaledVector(out, radius);
      const skin = surface.nearestSkin(point, HAIR_BONES);
      // Streaks round the head, darker at the parting, lighter at the ends.
      let shade = streak(c) * (0.92 + 0.08 * t);
      if (Math.abs(fromFront) < 0.06 * Math.PI && y > head.eyeY + 0.095) shade *= 0.72;
      column.push(overlay.addVertex(point, out, skin, [shade, shade, shade]));
    }
    grid.push(column);
  }
  for (let c = 0; c < columns; c += 1) {
    const next = grid[(c + 1) % columns];
    for (let r = 0; r < rows; r += 1) overlay.quad(grid[c][r], next[r], next[r + 1], grid[c][r + 1]);
  }
}

// Height of the hair's lower edge at `a` half-turns from the front, eased
// between the table's stops so the edge curves rather than kinks.
function smoothEdge(stops, a) {
  for (let i = 1; i < stops.length; i += 1) {
    const [a0, h0] = stops[i - 1];
    const [a1, h1] = stops[i];
    if (a <= a1) {
      const t = (a - a0) / Math.max(a1 - a0, 1e-9);
      return h0 + (h1 - h0) * (t * t * (3 - 2 * t));
    }
  }
  return stops[stops.length - 1][1];
}

function fract(value) {
  return value - Math.floor(value);
}

// --- Aviators, rigid on the Head bone --------------------------------------

function addAviators(doc, buffer, head, shape, materials) {
  // Built in model space, then carried into the Head bone's frame so they ride
  // the head through every clip.
  const toHead = new THREE.Matrix4().fromArray(head.getWorldMatrix()).invert();
  let triangles = 0;
  for (const [name, geometry, material] of [
    ['Aviator_Lenses', buildLenses(shape), materials.lens],
    ['Aviator_Frames', buildFrames(shape), materials.frame],
  ]) {
    geometry.applyMatrix4(toHead);
    const mesh = doc.createMesh(name).addPrimitive(toPrimitive(doc, buffer, geometry).setMaterial(material));
    head.addChild(doc.createNode(name).setMesh(mesh));
    triangles += geometry.index.count / 3;
    geometry.dispose();
  }
  return triangles;
}

function buildLenses(m) {
  const lenses = [];
  for (const side of [-1, 1]) {
    // Aviator drop: an ellipse whose lower outer edge hangs lower.
    const lens = new THREE.CircleGeometry(1, 20);
    const pos = lens.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setY(i, y < 0 ? y * (1.1 + 0.25 * Math.max(0, x * side)) : y * 0.85);
    }
    lens.scale(0.034, 0.028, 1);
    lens.rotateY(side * 0.2);
    lens.translate(side * 0.036, m.eyeY - 0.002, m.eyeZ + 0.014);
    lenses.push(lens);
  }
  return mergeGeometries(lenses);
}

function buildFrames(m) {
  const parts = [];
  const z = m.eyeZ + 0.014;
  for (const side of [-1, 1]) {
    const rim = new THREE.TorusGeometry(1, 0.06, 5, 20);
    rim.scale(0.035, 0.029, 0.035);
    rim.rotateY(side * 0.2);
    rim.translate(side * 0.036, m.eyeY - 0.002, z);
    parts.push(rim);
    // Temple arm back to the ear, along the side of the head.
    const temple = new THREE.BoxGeometry(0.003, 0.004, Math.max(0.02, z - m.centerZ));
    temple.translate(side * (m.halfWidth + 0.004), m.eyeY + 0.01, (z + m.centerZ) / 2);
    parts.push(temple);
    const hinge = new THREE.BoxGeometry(Math.max(0.004, m.halfWidth + 0.004 - 0.068), 0.004, 0.004);
    hinge.translate(side * ((m.halfWidth + 0.004 + 0.068) / 2), m.eyeY + 0.01, z - 0.006);
    parts.push(hinge);
  }
  // The double bridge aviators are known for.
  for (const [y, width] of [[0.012, 0.012], [0.024, 0.018]]) {
    const bridge = new THREE.BoxGeometry(width, 0.003, 0.003);
    bridge.translate(0, m.eyeY + y - 0.01, z + 0.004);
    parts.push(bridge);
  }
  return mergeGeometries(parts);
}

function toPrimitive(doc, buffer, geometry) {
  const prim = doc.createPrimitive();
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3')
    .setArray(new Float32Array(geometry.attributes.position.array)).setBuffer(buffer));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3')
    .setArray(new Float32Array(geometry.attributes.normal.array)).setBuffer(buffer));
  const count = geometry.attributes.position.count;
  const IndexArray = count > 65535 ? Uint32Array : Uint16Array;
  prim.setIndices(doc.createAccessor().setType('SCALAR')
    .setArray(IndexArray.from(geometry.index.array)).setBuffer(buffer));
  return prim;
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
