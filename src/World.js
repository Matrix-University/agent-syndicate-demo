import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GARAGE_HALF_WIDTH = 34;
const GARAGE_HALF_DEPTH = 52;
const GARAGE_CAMERA_BOUNDS = Object.freeze({
  minX: -34.8,
  maxX: 34.8,
  minY: 0.6,
  maxY: 6.9,
  minZ: -53.8,
  maxZ: 53.8,
});
const CAR_MODELS = [
  '/models/vehicles/sedan.glb',
  '/models/vehicles/hatchback-sports.glb',
  '/models/vehicles/suv.glb',
];

// The one parking bay left empty for the liftable car (LiftableCar owns the mesh
// and the collider there). It is the bay nearest the entry ramp, so the pickup is
// a landmark you run *to* rather than something underfoot at spawn.
export const LIFTABLE_CAR_SLOT = Object.freeze({ x: -29, z: -44, yaw: Math.PI / 2 });

// Resolves the player against static garage geometry as a circle on the ground.
export class World {
  constructor(root, colliders) {
    this.root = root;
    this.colliders = colliders;
    this.disposed = false;
  }

  // Dynamic colliders (a liftable car) register here and mutate their own entry —
  // position, extents, and `disabled` while they are carried or in flight.
  addCollider(collider) {
    this.colliders.push(collider);
    return collider;
  }

  removeCollider(collider) {
    const index = this.colliders.indexOf(collider);
    if (index !== -1) this.colliders.splice(index, 1);
  }

  collide(pos, radius) {
    for (const collider of this.colliders) {
      if (collider.disabled) continue; // e.g. a car that is being carried or is mid-throw
      const clearsCollider = collider.height !== undefined && pos.y >= collider.height;
      if (clearsCollider) continue;

      const nearestX = THREE.MathUtils.clamp(
        pos.x, collider.x - collider.hx, collider.x + collider.hx
      );
      const nearestZ = THREE.MathUtils.clamp(
        pos.z, collider.z - collider.hz, collider.z + collider.hz
      );
      const dx = pos.x - nearestX;
      const dz = pos.z - nearestZ;
      const distanceSq = dx * dx + dz * dz;
      const overlapsEdge = distanceSq < radius * radius && distanceSq > 1e-8;
      const insideBox = distanceSq <= 1e-8;

      if (overlapsEdge) {
        const distance = Math.sqrt(distanceSq);
        const push = (radius - distance) / distance;
        pos.x += dx * push;
        pos.z += dz * push;
      } else if (insideBox) {
        const toRight = collider.x + collider.hx - pos.x;
        const toLeft = pos.x - (collider.x - collider.hx);
        const toFar = collider.z + collider.hz - pos.z;
        const toNear = pos.z - (collider.z - collider.hz);
        const exitsOnX = Math.min(toRight, toLeft) < Math.min(toFar, toNear);

        if (exitsOnX) {
          pos.x += toRight < toLeft ? radius + toRight : -(radius + toLeft);
        } else {
          pos.z += toFar < toNear ? radius + toFar : -(radius + toNear);
        }
      }
    }

    pos.x = THREE.MathUtils.clamp(
      pos.x, -GARAGE_HALF_WIDTH + radius, GARAGE_HALF_WIDTH - radius
    );
    pos.z = THREE.MathUtils.clamp(
      pos.z, -GARAGE_HALF_DEPTH + radius, GARAGE_HALF_DEPTH - radius
    );
  }

  groundHeight(pos) {
    let height = 0;
    for (const collider of this.colliders) {
      const standable = !collider.disabled && collider.height !== undefined &&
        Math.abs(pos.x - collider.x) <= collider.hx &&
        Math.abs(pos.z - collider.z) <= collider.hz;
      if (standable) height = Math.max(height, collider.height);
    }
    return height;
  }

  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      this.root.removeFromParent();
      disposeObject(this.root);
      this.root.clear();
    }
  }
}

function addParkingLines(scene, material) {
  const stripeGeometry = new THREE.BoxGeometry(5.8, 0.025, 0.12);
  const stopGeometry = new THREE.BoxGeometry(0.12, 0.025, 6.3);

  for (const side of [-1, 1]) {
    for (let z = -44; z <= 44; z += 8) {
      for (const offset of [-3.15, 3.15]) {
        const stripe = new THREE.Mesh(stripeGeometry, material);
        stripe.position.set(side * 29, 0.025, z + offset);
        scene.add(stripe);
      }

      const stop = new THREE.Mesh(stopGeometry, material);
      stop.position.set(side * 31.9, 0.025, z);
      scene.add(stop);
    }
  }
}

function addStripedBarrier(scene, position, rotationY, materials, length = 9.6) {
  const group = new THREE.Group();
  const segmentCount = 12;
  const segmentLength = length / segmentCount;
  const segmentGeometry = new THREE.BoxGeometry(segmentLength + 0.025, 0.18, 0.2);

  for (let index = 0; index < segmentCount; index += 1) {
    const segment = new THREE.Mesh(segmentGeometry, materials[index % 2]);
    segment.position.x = -length / 2 + segmentLength * (index + 0.5);
    group.add(segment);
  }

  group.position.copy(position);
  group.rotation.set(0, rotationY, -0.08);
  scene.add(group);
}

function addCheckpoint(scene, concreteMaterial, redMaterial, metalMaterial) {
  const checkpoint = new THREE.Group();
  checkpoint.position.set(0, 0, 45.5);
  checkpoint.rotation.y = Math.PI;

  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(5.6, 0.48, 8, 28, Math.PI),
    redMaterial
  );
  arch.position.set(0, 0.48, 0);
  checkpoint.add(arch);

  const counterGeometry = new THREE.BoxGeometry(3.5, 1.65, 2.1);
  for (const x of [-4.5, 4.5]) {
    const counter = new THREE.Mesh(counterGeometry, concreteMaterial);
    counter.position.set(x, 0.825, 0);
    counter.castShadow = true;
    counter.receiveShadow = true;
    checkpoint.add(counter);
  }

  const gate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.8, 0.28), metalMaterial);
  gate.position.set(0, 2.4, 0.35);
  checkpoint.add(gate);
  const barGeometry = new THREE.BoxGeometry(0.16, 4.5, 0.38);
  for (let x = -1.9; x <= 1.9; x += 0.48) {
    const bar = new THREE.Mesh(barGeometry, metalMaterial);
    bar.position.set(x, 2.4, 0.12);
    checkpoint.add(bar);
  }

  const redLight = new THREE.PointLight(0xff2a20, 42, 18, 1.5);
  redLight.position.set(0, 5.4, -1.8);
  checkpoint.add(redLight);
  scene.add(checkpoint);
}

function addQueueRopes(scene, redMaterial, metalMaterial) {
  const postGeometry = new THREE.CylinderGeometry(0.09, 0.13, 1.25, 10);
  const baseGeometry = new THREE.CylinderGeometry(0.3, 0.42, 0.12, 12);
  const ropeGeometry = new THREE.CylinderGeometry(0.055, 0.055, 3.8, 8);

  for (const side of [-1, 1]) {
    for (const z of [40, 44, 48]) {
      const x = side * 4.3;
      const post = new THREE.Mesh(postGeometry, metalMaterial);
      post.position.set(x, 0.68, z);
      scene.add(post);

      const base = new THREE.Mesh(baseGeometry, metalMaterial);
      base.position.set(x, 0.06, z);
      scene.add(base);

      if (z < 48) {
        const rope = new THREE.Mesh(ropeGeometry, redMaterial);
        rope.rotation.x = Math.PI / 2;
        rope.position.set(x, 1.2, z + 2);
        scene.add(rope);
      }
    }
  }
}

async function addParkedCars(scene, slots, world) {
  const loader = new GLTFLoader();

  try {
    const models = await Promise.all(CAR_MODELS.map((url) => loader.loadAsync(url)));
    if (world.disposed) {
      models.forEach((model) => disposeObject(model.scene));
    } else {
      slots.forEach(([x, z, yaw], index) => {
        const car = models[(index * 2 + 1) % models.length].scene.clone(true);
        car.scale.setScalar(1.65);
        car.traverse((object) => {
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });

        const bounds = new THREE.Box3().setFromObject(car);
        const center = bounds.getCenter(new THREE.Vector3());
        car.position.set(-center.x, -bounds.min.y, -center.z);

        const parkingSpot = new THREE.Group();
        parkingSpot.position.set(x, 0, z);
        parkingSpot.rotation.y = yaw ?? (x < 0 ? Math.PI / 2 : -Math.PI / 2);
        parkingSpot.add(car);
        scene.add(parkingSpot);
      });
    }
  } catch (error) {
    console.warn('World: could not load parked vehicle models.', error);
  }
}

function makeSign(text, width, height, background, foreground) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * height / width);
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = foreground;
  context.lineWidth = 12;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = foreground;
  const maxTextWidth = canvas.width - 64;
  const maxTextHeight = canvas.height - 40;
  let fontSize = Math.min(150, maxTextHeight);
  context.font = `700 ${fontSize}px Arial`;
  const measuredWidth = context.measureText(text).width;
  if (measuredWidth > maxTextWidth) {
    fontSize *= maxTextWidth / measuredWidth;
    context.font = `700 ${fontSize}px Arial`;
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture })
  );
}

// Builds a low-ceiling B2 parking deck around a clear central drive aisle.
export function buildWorld(scene) {
  scene.background = new THREE.Color(0x070b09);
  scene.fog = new THREE.Fog(0x13201a, 24, 86);
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  scene = root;

  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x696e69, roughness: 0.97, metalness: 0.01,
  });
  const darkConcreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x303733, roughness: 0.98, metalness: 0.01,
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x414a45, roughness: 1, metalness: 0,
  });
  const whitePaintMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f9790, roughness: 0.9, emissive: 0x111512,
  });
  const redPaintMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f1717, roughness: 0.72, emissive: 0x260303,
  });
  const barrierWhiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d8ce, roughness: 0.75, emissive: 0x20221f,
  });
  const darkMetalMaterial = new THREE.MeshStandardMaterial({
    color: 0x262b29, roughness: 0.52, metalness: 0.58,
  });
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xe9fff2, emissiveIntensity: 3.8, roughness: 0.3,
  });
  const colliders = [];

  scene.add(new THREE.HemisphereLight(0xc9e2d2, 0x182019, 1.8));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 110),
    new THREE.MeshStandardMaterial({ color: 0x29332e, roughness: 0.92, metalness: 0.04 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(72, 0.55, 110), ceilingMaterial);
  ceiling.position.y = 7.25;
  ceiling.receiveShadow = true;
  scene.add(ceiling);

  const sideWallGeometry = new THREE.BoxGeometry(1, 7.2, 110);
  for (const x of [-35.5, 35.5]) {
    const wall = new THREE.Mesh(sideWallGeometry, darkConcreteMaterial);
    wall.position.set(x, 3.6, 0);
    wall.receiveShadow = true;
    scene.add(wall);
  }

  const farEndWall = new THREE.Mesh(
    new THREE.BoxGeometry(72, 7.2, 1), darkConcreteMaterial
  );
  farEndWall.position.set(0, 3.6, 54.5);
  farEndWall.receiveShadow = true;
  scene.add(farEndWall);

  const entranceWallGeometry = new THREE.BoxGeometry(30, 7.2, 1);
  for (const x of [-21, 21]) {
    const wall = new THREE.Mesh(entranceWallGeometry, darkConcreteMaterial);
    wall.position.set(x, 3.6, -54.5);
    wall.receiveShadow = true;
    scene.add(wall);
  }

  const entranceHeader = new THREE.Mesh(
    new THREE.BoxGeometry(12, 1.4, 1), darkConcreteMaterial
  );
  entranceHeader.position.set(0, 6.5, -54.5);
  entranceHeader.receiveShadow = true;
  scene.add(entranceHeader);

  const entrancePortal = new THREE.Mesh(
    new THREE.PlaneGeometry(11.8, 5.8),
    new THREE.MeshBasicMaterial({ color: 0x020303 })
  );
  entrancePortal.position.set(0, 2.9, -54.04);
  scene.add(entrancePortal);

  const entryApron = new THREE.Mesh(
    new THREE.BoxGeometry(10.5, 0.035, 10),
    new THREE.MeshStandardMaterial({ color: 0x262c29, roughness: 0.88, metalness: 0.06 })
  );
  entryApron.position.set(0, 0.018, -49);
  entryApron.receiveShadow = true;
  scene.add(entryApron);

  addStripedBarrier(
    scene,
    new THREE.Vector3(0, 4.55, -53.25),
    0,
    [redPaintMaterial, barrierWhiteMaterial],
    10.5
  );

  const bollardGeometry = new THREE.BoxGeometry(0.42, 1.25, 0.42);
  for (const x of [-5.35, 5.35]) {
    const bollard = new THREE.Mesh(bollardGeometry, redPaintMaterial);
    bollard.position.set(x, 0.625, -52.9);
    bollard.castShadow = true;
    scene.add(bollard);
  }

  const entrySign = makeSign('PARKING', 5.8, 1.05, '#c8ccc5', '#26302c');
  entrySign.position.set(0, 4.62, -53.92);
  scene.add(entrySign);

  const pillarGeometry = new THREE.BoxGeometry(2.35, 7.2, 2.35);
  const beamGeometry = new THREE.BoxGeometry(56, 0.75, 0.9);
  for (let z = -46; z <= 38; z += 12) {
    const beam = new THREE.Mesh(beamGeometry, darkConcreteMaterial);
    beam.position.set(0, 6.6, z);
    beam.castShadow = true;
    scene.add(beam);

    for (const x of [-14, 14]) {
      const pillar = new THREE.Mesh(pillarGeometry, concreteMaterial);
      pillar.position.set(x, 3.6, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
      colliders.push({ x, z, hx: 1.175, hz: 1.175 });
    }
  }

  addParkingLines(scene, whitePaintMaterial);

  const curbGeometry = new THREE.BoxGeometry(0.45, 0.28, 2.7);
  for (const side of [-1, 1]) {
    for (let z = -44; z <= 44; z += 8) {
      const curb = new THREE.Mesh(curbGeometry, concreteMaterial);
      curb.position.set(side * 32.25, 0.15, z);
      scene.add(curb);
    }
  }

  const lightGeometry = new THREE.BoxGeometry(0.32, 0.12, 6.4);
  for (let z = -46; z <= 46; z += 8) {
    for (const x of [-23, -7, 7, 23]) {
      const fixture = new THREE.Mesh(lightGeometry, fixtureMaterial);
      fixture.position.set(x, 6.78, z);
      scene.add(fixture);
    }

    if ((z + 46) % 16 === 0) {
      const light = new THREE.PointLight(0xd7ffe4, 28, 28, 1.55);
      const rowIndex = (z + 46) / 16;
      light.position.set(rowIndex % 2 === 0 ? -16 : 16, 6.15, z);
      scene.add(light);
    }
  }

  const pipeGeometry = new THREE.CylinderGeometry(0.09, 0.09, 106, 8);
  const pipeMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x8e2522, roughness: 0.65, metalness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0x202724, roughness: 0.55, metalness: 0.5 }),
  ];
  for (const [index, x] of [-28, -26.5, 26.5, 28].entries()) {
    const pipe = new THREE.Mesh(pipeGeometry, pipeMaterials[index % 2]);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 6.55 - (index % 2) * 0.22, 0);
    scene.add(pipe);
  }

  const parkedCars = [
    [-29, -36], [-29, -28], [-29, -20], [-29, -12], [-29, -4], [-29, 4],
    [-29, 12], [-29, 20], [-29, 28], [-29, 36],
    [29, -44], [29, -36], [29, -28], [29, -20], [29, -12], [29, -4],
    [29, 4], [29, 12], [29, 20], [29, 28], [29, 36], [29, 44],
    [-6.5, -28, 0], [6.5, 0, 0], [-6.5, 28, 0],
  ];
  parkedCars.forEach(([x, z, yaw]) => {
    const isLongitudinal = yaw === 0;
    colliders.push({
      x,
      z,
      hx: isLongitudinal ? 1.45 : 2.3,
      hz: isLongitudinal ? 2.3 : 1.45,
      height: 1.65,
    });
  });
  const world = new World(root, colliders);
  world.cameraBounds = GARAGE_CAMERA_BOUNDS;
  addParkedCars(scene, parkedCars, world);

  addCheckpoint(scene, concreteMaterial, redPaintMaterial, darkMetalMaterial);
  addQueueRopes(scene, redPaintMaterial, darkMetalMaterial);
  addStripedBarrier(
    scene,
    new THREE.Vector3(29.2, 0.28, -48),
    Math.PI / 2,
    [redPaintMaterial, barrierWhiteMaterial],
    8.5
  );

  for (const x of [-14, 14]) {
    const sign = makeSign('B2', 3.6, 1.7, '#173e31', '#f2f5ed');
    sign.position.set(x, 4.7, x < 0 ? 1.14 : -1.14);
    sign.rotation.y = x < 0 ? 0 : Math.PI;
    scene.add(sign);
  }

  const exitSign = makeSign('EXIT  >', 5.5, 1.35, '#174d32', '#f5fff6');
  exitSign.position.set(0, 5.25, 53.9);
  exitSign.rotation.y = Math.PI;
  scene.add(exitSign);

  const exitDoor = new THREE.Group();
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x52615a, roughness: 0.72, metalness: 0.38,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b19, roughness: 0.65, metalness: 0.55,
  });
  const pushBarMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2d7cf, roughness: 0.3, metalness: 0.85,
  });
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.8, 0.18), doorMaterial);
  door.position.y = 2.4;
  door.castShadow = true;
  exitDoor.add(door);

  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.22, 0.32), frameMaterial);
  frameTop.position.set(0, 4.88, -0.08);
  exitDoor.add(frameTop);
  for (const x of [-1.84, 1.84]) {
    const frameSide = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5, 0.32), frameMaterial);
    frameSide.position.set(x, 2.5, -0.08);
    exitDoor.add(frameSide);
  }

  const pushBar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 0.16), pushBarMaterial);
  pushBar.position.set(0, 2.05, -0.19);
  exitDoor.add(pushBar);

  const doorSign = makeSign('EXIT', 2.1, 0.72, '#174d32', '#f5fff6');
  doorSign.position.set(0, 3.72, -0.2);
  doorSign.rotation.y = Math.PI;
  exitDoor.add(doorSign);

  exitDoor.position.set(-27.5, 0, 53.86);
  scene.add(exitDoor);

  return world;
}

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
      childMaterials.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}