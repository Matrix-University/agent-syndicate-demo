import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The System Agents, after docs/image references/AGENT_{BLACK,BROWN,BLONDE}_SHEET:
// a black two-button suit over a white shirt and slim black tie with a clip,
// slim rectangular shades, a coiled earpiece in the right ear, and one of three
// haircuts — slicked back to a widow's peak (black, brown) or a short textured
// crop (blonde).
//
// Every agent shares one kit of geometry and materials, built on first use and
// freed when the last agent lets go. The suit is the exception: each agent
// clones it, because its emissive is the hit flash and must light one agent.

// Proportions, in the game's metres (an agent stands ~3.1 tall).
const HIP_Y = 1.4;
const SHOULDER_Y = 2.35;
const SHOULDER_X = 0.6;
const HEAD_Y = 2.86;
const HEAD = { x: 0.19, y: 0.25, z: 0.22 };
const TORSO_DEPTH = 0.6; // the jacket is an ellipse this much deeper than wide

// Jacket silhouette as (radius, height), hem to collar: a trim waist under a
// broad chest and squared shoulders.
const TORSO_PROFILE = [
  [0.001, 1.2], [0.39, 1.2], [0.42, 1.3], [0.39, 1.55], [0.41, 1.85],
  [0.49, 2.18], [0.54, 2.38], [0.46, 2.5], [0.2, 2.58], [0.001, 2.6],
];

export const HAIR_STYLES = {
  black: { color: 0x0b0b0d, skin: 0xa86e4a, cut: 'peak' },
  brown: { color: 0x3b2416, skin: 0xb47a55, cut: 'peak' },
  blonde: { color: 0xc4a468, skin: 0xba8159, cut: 'crop' },
};

let shared = null;
let users = 0;

export class AgentKit {
  /** The shared kit, built on first use. Pair every acquire with a release. */
  static acquire() {
    if (!shared) shared = new AgentKit();
    users += 1;
    return shared;
  }

  static release() {
    users -= 1;
    if (users === 0 && shared) {
      shared._dispose();
      shared = null;
    }
  }

  constructor() {
    this.fabric = createFabricTexture();
    this.suit = new THREE.MeshStandardMaterial({
      color: 0x111214,
      emissive: 0x39ff14,
      emissiveIntensity: 0,
      roughness: 0.7,
      metalness: 0.08,
      bumpMap: this.fabric,
      bumpScale: 0.6,
    });
    this.lapel = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.48, metalness: 0.1 });
    this.shirt = new THREE.MeshStandardMaterial({ color: 0xeef0ee, roughness: 0.78, metalness: 0 });
    this.tie = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.32, metalness: 0.2 });
    this.shoes = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.16, metalness: 0.3 });
    this.lens = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 0.04, metalness: 0.9 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.3, metalness: 1 });
    this.earpiece = new THREE.MeshStandardMaterial({ color: 0xdfe5e8, roughness: 0.25, metalness: 0.1 });
    this.skin = {};
    this.hair = {};
    for (const [name, style] of Object.entries(HAIR_STYLES)) {
      this.skin[name] = new THREE.MeshStandardMaterial({ color: style.skin, roughness: 0.62, metalness: 0 });
      this.hair[name] = new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.55, metalness: 0.05 });
    }
    this.geometry = buildGeometry();
  }

  /**
   * Assembles one agent into `rig` and returns the limb pivots Enemy animates.
   * `suit` is that agent's own clone of `this.suit`.
   */
  assemble(rig, hairVariant, suit) {
    const g = this.geometry;
    const style = HAIR_STYLES[hairVariant] ? hairVariant : 'black';
    const skin = this.skin[style];
    const add = (parent, geometry, material, shadow = false) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = shadow;
      parent.add(mesh);
      return mesh;
    };

    add(rig, g.torso, suit, true);
    add(rig, g.lapels, this.lapel);
    add(rig, g.shirtFront, this.shirt);
    add(rig, g.collar, this.shirt);
    add(rig, g.tie, this.tie);
    add(rig, g.tieClip, this.metal);
    add(rig, g.buttons, this.tie);
    add(rig, g.pockets, this.lapel);
    add(rig, g.neck, skin, true);
    add(rig, g.head, skin, true);
    add(rig, g.face, skin);
    add(rig, g.mouth, this.tie);
    add(rig, g.hair[HAIR_STYLES[style].cut], this.hair[style], true);
    add(rig, g.lenses, this.lens);
    add(rig, g.frames, this.metal);
    add(rig, g.earbud, this.earpiece);
    add(rig, g.earCoil, this.earpiece);

    const limb = (x, y, parts) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      for (const [geometry, material, shadow] of parts) add(pivot, geometry, material, shadow);
      rig.add(pivot);
      return pivot;
    };
    const arm = (side) => limb(side * SHOULDER_X, SHOULDER_Y, [
      [g.shoulder, suit, true], [g.sleeve, suit, true], [g.cuff, this.shirt], [side < 0 ? g.handR : g.handL, skin, true],
    ]);
    const leg = (side) => limb(side * 0.2, HIP_Y, [[g.trouser, suit, true], [g.shoe, this.shoes, true]]);
    // Left is +X: agents face +Z, so their own left is the viewer's right.
    return { armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
  }

  _dispose() {
    for (const geometry of Object.values(this.geometry)) {
      if (geometry.isBufferGeometry) geometry.dispose();
      else Object.values(geometry).forEach((g) => g.dispose());
    }
    for (const material of [
      this.suit, this.lapel, this.shirt, this.tie, this.shoes, this.lens, this.metal, this.earpiece,
      ...Object.values(this.skin), ...Object.values(this.hair),
    ]) material.dispose();
    this.fabric.dispose();
  }
}

// --- Geometry ---------------------------------------------------------------

function buildGeometry() {
  const torso = new THREE.LatheGeometry(TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  torso.scale(1, 1, TORSO_DEPTH);
  torso.computeVertexNormals();

  return {
    torso,
    shirtFront: onChest(shape([[-0.16, 2.54], [0.16, 2.54], [0, 1.94]]), 0.004),
    collar: onChest(mergeShapes([
      [[-0.02, 2.55], [-0.15, 2.56], [-0.07, 2.44]],
      [[0.02, 2.55], [0.15, 2.56], [0.07, 2.44]],
    ]), 0.012),
    // Notched lapels either side of the V, down to the top button.
    lapels: onChest(mergeShapes([
      [[-0.16, 2.54], [-0.26, 2.44], [-0.21, 2.4], [-0.25, 2.33], [-0.02, 1.9], [0, 1.94]],
      [[0.16, 2.54], [0.26, 2.44], [0.21, 2.4], [0.25, 2.33], [0.02, 1.9], [0, 1.94]],
    ]), 0.009),
    tie: onChest(shape([
      [-0.03, 2.49], [0.03, 2.49], [0.025, 2.43], [0.045, 2.02], [0, 1.96], [-0.045, 2.02], [-0.025, 2.43],
    ]), 0.01),
    tieClip: onChest(new THREE.BoxGeometry(0.1, 0.012, 0.01).translate(0, 2.18, 0), 0.014),
    buttons: onChest(mergeAll([1.84, 1.64].map((y) => (
      new THREE.SphereGeometry(0.018, 8, 6).translate(0, y, 0)
    ))), 0.006),
    pockets: onChest(mergeAll([-1, 1].map((side) => (
      new THREE.BoxGeometry(0.2, 0.035, 0.01).translate(side * 0.24, 1.52, 0)
    ))), 0.008),
    neck: new THREE.CylinderGeometry(0.105, 0.12, 0.26, 16).translate(0, 2.62, 0),
    head: new THREE.SphereGeometry(1, 28, 20).scale(HEAD.x, HEAD.y, HEAD.z).translate(0, HEAD_Y, 0),
    face: buildFace(),
    mouth: new THREE.BoxGeometry(0.07, 0.008, 0.01).translate(0, HEAD_Y - 0.13, HEAD.z * 0.9),
    hair: { peak: buildHair('peak'), crop: buildHair('crop') },
    ...buildShades(),
    ...buildEarpiece(),
    // Rounds the sleeve head into the shoulder, so the arm's top isn't a flat disc.
    shoulder: new THREE.SphereGeometry(0.155, 16, 10).translate(0, -0.03, 0),
    sleeve: new THREE.CylinderGeometry(0.15, 0.12, 1.0, 14).translate(0, -0.5, 0),
    cuff: new THREE.CylinderGeometry(0.118, 0.118, 0.05, 14).translate(0, -1.01, 0),
    handL: buildHand(1),
    handR: buildHand(-1),
    trouser: new THREE.CylinderGeometry(0.16, 0.125, 1.22, 14).translate(0, -0.61, 0),
    shoe: buildShoe(),
  };
}

// The chest surface at (x, y): the lathe profile's radius there, on the ellipse.
function chestDepth(x, y) {
  let radius = TORSO_PROFILE[0][0];
  for (let i = 1; i < TORSO_PROFILE.length; i += 1) {
    const [r0, y0] = TORSO_PROFILE[i - 1];
    const [r1, y1] = TORSO_PROFILE[i];
    if (y >= y0 && y <= y1) {
      radius = THREE.MathUtils.lerp(r0, r1, (y - y0) / Math.max(y1 - y0, 1e-6));
      break;
    }
  }
  return TORSO_DEPTH * Math.sqrt(Math.max(radius * radius - x * x, 0));
}

// Lays a flat piece onto the jacket front, `offset` proud of the cloth, so
// shirt, lapels and tie follow the chest's curve instead of floating on it.
function onChest(geometry, offset) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setZ(i, pos.getZ(i) + chestDepth(pos.getX(i), pos.getY(i)) + offset);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function shape(points) {
  const outline = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return subdivide(new THREE.ShapeGeometry(outline));
}

// ShapeGeometry is a bare fan of long triangles; split them so a piece bends
// over the chest instead of cutting through it.
function subdivide(geometry, passes = 3) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (let pass = 0; pass < passes; pass += 1) {
    const src = g.attributes.position.array;
    const out = [];
    for (let t = 0; t < src.length; t += 9) {
      const a = src.slice(t, t + 3);
      const b = src.slice(t + 3, t + 6);
      const c = src.slice(t + 6, t + 9);
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      out.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
    }
    g.dispose();
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  }
  return g;
}

function mergeShapes(outlines) {
  return mergeAll(outlines.map(shape));
}

// One geometry from several, keeping each part's own (smooth) normals.
function mergeAll(geometries) {
  const parts = geometries.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    if (!flat.attributes.normal) flat.computeVertexNormals();
    flat.deleteAttribute('uv');
    return flat;
  });
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

// Jaw, brow, nose and ears on the skull, which is what keeps it from reading as
// a ball: a square jaw is the sheets' strongest facial feature.
function buildFace() {
  const front = HEAD.z * 0.92;
  return mergeAll([
    new THREE.SphereGeometry(1, 16, 12).scale(0.155, 0.09, 0.15).translate(0, HEAD_Y - 0.14, 0.03), // jaw
    new THREE.BoxGeometry(0.28, 0.035, 0.05).translate(0, HEAD_Y + 0.075, front - 0.01), // brow
    new THREE.ConeGeometry(0.03, 0.1, 4).rotateX(-0.25).translate(0, HEAD_Y - 0.01, front + 0.015), // nose
    new THREE.SphereGeometry(1, 10, 8).scale(0.028, 0.065, 0.045).translate(-HEAD.x, HEAD_Y + 0.01, -0.01),
    new THREE.SphereGeometry(1, 10, 8).scale(0.028, 0.065, 0.045).translate(HEAD.x, HEAD_Y + 0.01, -0.01),
  ]);
}

// A cap over the skull, cut to a hairline. `peak` dips to a widow's peak and
// lies close; `crop` is a straight, fuller line with more height on top.
function buildHair(cut) {
  const lift = cut === 'crop' ? 0.03 : 0.012;
  const cap = new THREE.SphereGeometry(1, 40, 28);
  cap.scale(HEAD.x + 0.016, HEAD.y + lift, HEAD.z + 0.016);
  cap.translate(0, HEAD_Y + (cut === 'crop' ? 0.012 : 0), -0.004);
  const pos = cap.attributes.position;
  const hairline = (x, z) => {
    if (z > HEAD.z * 0.45) {
      // Front: the peak's V, or a straight line for the crop.
      return cut === 'peak' ? HEAD_Y + 0.07 + Math.abs(x) * 0.55 : HEAD_Y + 0.105;
    }
    if (z > -HEAD.z * 0.2) return HEAD_Y + 0.03; // temples, above the ear
    return HEAD_Y - 0.13; // down to the nape
  };
  const kept = [];
  const index = cap.index.array;
  for (let t = 0; t < index.length; t += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k += 1) {
      cx += pos.getX(index[t + k]) / 3;
      cy += pos.getY(index[t + k]) / 3;
      cz += pos.getZ(index[t + k]) / 3;
    }
    if (cy > hairline(cx, cz)) kept.push(index[t], index[t + 1], index[t + 2]);
  }
  cap.setIndex(kept);
  return cap;
}

// Slim rectangular shades wrapping the face, on thin temples back to the ears.
function buildShades() {
  const y = HEAD_Y + 0.02;
  const lenses = [];
  const frames = [];
  for (const side of [-1, 1]) {
    const x = side * 0.075;
    const z = HEAD.z * Math.sqrt(1 - (x / HEAD.x) ** 2) + 0.022;
    const lens = new THREE.BoxGeometry(0.12, 0.048, 0.01);
    lens.rotateY(side * 0.28);
    lens.translate(x, y, z);
    lenses.push(lens);
    const temple = new THREE.BoxGeometry(0.008, 0.01, 0.2);
    temple.translate(side * (HEAD.x + 0.006), y + 0.01, 0.08);
    frames.push(temple);
  }
  frames.push(new THREE.BoxGeometry(0.035, 0.008, 0.008).translate(0, y + 0.012, HEAD.z + 0.024));
  return { lenses: mergeAll(lenses), frames: mergeAll(frames) };
}

// The earpiece in the right ear (-X) and its coiled wire down into the collar.
function buildEarpiece() {
  const ear = new THREE.Vector3(-HEAD.x - 0.012, HEAD_Y + 0.005, 0.0);
  const collar = new THREE.Vector3(-0.15, 2.5, -0.1);
  const turns = 16;
  const points = [];
  for (let i = 0; i <= 160; i += 1) {
    const t = i / 160;
    const along = new THREE.Vector3().lerpVectors(ear, collar, t);
    const angle = t * turns * Math.PI * 2;
    along.x += Math.cos(angle) * 0.011;
    along.z += Math.sin(angle) * 0.011;
    points.push(along);
  }
  const coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 320, 0.0035, 5, false);
  const bud = new THREE.SphereGeometry(0.02, 10, 8).translate(ear.x, ear.y, ear.z + 0.01);
  return { earbud: bud, earCoil: coil };
}

// A relaxed hand: palm, curled fingers and a thumb on the inside.
function buildHand(side) {
  return mergeAll([
    new THREE.SphereGeometry(1, 12, 10).scale(0.07, 0.1, 0.05).translate(0, -1.12, 0),
    new THREE.SphereGeometry(1, 10, 8).scale(0.062, 0.06, 0.045).translate(0, -1.22, 0.012),
    new THREE.SphereGeometry(1, 8, 6).scale(0.025, 0.05, 0.025).translate(-side * 0.06, -1.11, 0.03),
  ]);
}

// An oxford: rounded toe forward of the ankle, low heel.
function buildShoe() {
  return mergeAll([
    new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(0.12, 0.11, 0.25).translate(0, -1.33, 0.09),
    new THREE.BoxGeometry(0.22, 0.03, 0.46).translate(0, -1.335, 0.07),
  ]);
}

// Fine worsted grain for the suit's bump map: noise with a faint diagonal
// twill, tiled across the cloth. A DataTexture, so it needs no DOM.
function createFabricTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const twill = ((x + y) % 4 < 2 ? 18 : 0);
      const value = 110 + twill + random() * 40;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.needsUpdate = true;
  return texture;
}
