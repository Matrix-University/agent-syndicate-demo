import * as THREE from 'three';

// Resolves the player against the arena's static geometry. Colliders are axis-
// aligned boxes on the ground plane ({x, z, hx, hz}); the player is treated as a
// circle of `radius`. Pure scalar math, no per-frame allocation — `collide`
// mutates the passed-in position in place (x/z only; vertical is the caller's).
export class World {
  constructor(colliders, arenaRadius) {
    this.colliders = colliders;
    this.arenaRadius = arenaRadius;
  }

  collide(pos, radius) {
    // Push out of any box the circle overlaps (closest-point-on-AABB test).
    for (const c of this.colliders) {
      const nx = THREE.MathUtils.clamp(pos.x, c.x - c.hx, c.x + c.hx);
      const nz = THREE.MathUtils.clamp(pos.z, c.z - c.hz, c.z + c.hz);
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;

      if (d2 > 1e-8) {
        // Outside the box but within `radius`: push along the surface normal.
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Center is inside the box: eject through the nearest face.
        const toRight = c.x + c.hx - pos.x;
        const toLeft = pos.x - (c.x - c.hx);
        const toFar = c.z + c.hz - pos.z;
        const toNear = pos.z - (c.z - c.hz);
        const minX = Math.min(toRight, toLeft);
        const minZ = Math.min(toFar, toNear);
        if (minX < minZ) pos.x += toRight < toLeft ? radius + toRight : -(radius + toLeft);
        else pos.z += toFar < toNear ? radius + toFar : -(radius + toNear);
      }
    }

    // Keep the player inside the circular arena.
    const dist = Math.hypot(pos.x, pos.z);
    const maxR = this.arenaRadius - radius;
    if (dist > maxR) {
      const s = maxR / dist;
      pos.x *= s;
      pos.z *= s;
    }
  }
}

// Builds the arena: lighting, floor, grid, and a ring of blockout pillars.
// Returns a World holding the colliders the player resolves against.
export function buildWorld(scene) {
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 24, 90);

  const ambient = new THREE.AmbientLight(0x335544, 0.8);
  scene.add(ambient);

  // Key light (greenish, casts shadows) — gives the Matrix-ish tint.
  const key = new THREE.DirectionalLight(0x9effa0, 3.0);
  key.position.set(8, 18, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80;
  scene.add(key);

  // Cool rim light for separation.
  const rim = new THREE.DirectionalLight(0x224488, 1.2);
  rim.position.set(-12, 8, -10);
  scene.add(rim);

  // Floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.95, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid overlay — helps you feel motion while moving.
  const grid = new THREE.GridHelper(140, 70, 0x39ff14, 0x1d3b22);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  // Ring of pillars to give the space a sense of scale (and something to bump into).
  const colliders = [];
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x202632, roughness: 0.8 });
  const pillarGeo = new THREE.BoxGeometry(2, 9, 2);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 20;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(x, 4.5, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    colliders.push({ x, z, hx: 1, hz: 1 }); // 2×2 footprint → half-extent 1
  }

  // Bound the playable area well inside the 140×140 floor so you can't walk into
  // the void; the fog hides the far edge anyway.
  return new World(colliders, 60);
}
