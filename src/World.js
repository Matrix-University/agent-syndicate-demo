import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GARAGE_HALF_WIDTH = 34;
const GARAGE_HALF_DEPTH = 52;
const CAR_MODELS = [
  '/models/vehicles/sedan.glb',
  '/models/vehicles/hatchback-sports.glb',
  '/models/vehicles/suv.glb',
];

// Resolves the player against static garage geometry as a circle on the ground.
export class World {
  constructor(root, colliders) {
    this.root = root;
    this.colliders = colliders;
    this.disposed = false;
  }

  collide(pos, radius) {
    for (const collider of this.colliders) {
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
      const standable = collider.height !== undefined &&
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
  const centerGeometry = new THREE.BoxGeometry(0.16, 0.025, 3.4);

  for (const side of [-1, 1]) {
    for (let z = -44; z <= 44; z += 8) {
      for (const offset of [-3.15, 3.15]) {
        const stripe = new THREE.Mesh(stripeGeometry, material);
        stripe.position.set(side * 20.15, 0.025, z + offset);
        scene.add(stripe);
      }

      const stop = new THREE.Mesh(stopGeometry, material);
      stop.position.set(side * 23.05, 0.025, z);
      scene.add(stop);
    }
  }

  for (let z = -47; z <= 47; z += 7) {
    const dash = new THREE.Mesh(centerGeometry, material);
    dash.position.set(0, 0.026, z);
    scene.add(dash);
  }
}

async function addParkedCars(scene, slots, world) {
  const loader = new GLTFLoader();

  try {
    const models = await Promise.all(CAR_MODELS.map((url) => loader.loadAsync(url)));
    if (world.disposed) {
      models.forEach((model) => disposeObject(model.scene));
    } else {
      slots.forEach(([x, z], index) => {
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
        parkingSpot.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
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
  scene.background = new THREE.Color(0x090b0a);
  scene.fog = new THREE.Fog(0x111713, 30, 92);
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  scene = root;

  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x777b75, roughness: 0.94, metalness: 0.02,
  });
  const darkConcreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x373d39, roughness: 0.96, metalness: 0.02,
  });
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b706c, roughness: 1, metalness: 0,
  });
  const whitePaintMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9ddd4, roughness: 0.8, emissive: 0x252721,
  });
  const yellowPaintMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2b72f, roughness: 0.78, emissive: 0x302305,
  });
  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xe9fff2, emissiveIntensity: 3.8, roughness: 0.3,
  });
  const colliders = [];

  scene.add(new THREE.HemisphereLight(0xd8f5df, 0x20241f, 1.35));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 110),
    new THREE.MeshStandardMaterial({ color: 0x3f4541, roughness: 0.86, metalness: 0.08 })
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

  const entryGuideGeometry = new THREE.BoxGeometry(0.14, 0.03, 9.5);
  for (const x of [-4.65, 4.65]) {
    const guide = new THREE.Mesh(entryGuideGeometry, yellowPaintMaterial);
    guide.position.set(x, 0.04, -49);
    scene.add(guide);
  }

  const clearanceBar = new THREE.Mesh(
    new THREE.BoxGeometry(10.5, 0.22, 0.22), yellowPaintMaterial
  );
  clearanceBar.position.set(0, 5.35, -53.35);
  scene.add(clearanceBar);

  const bollardGeometry = new THREE.BoxGeometry(0.42, 1.25, 0.42);
  for (const x of [-5.35, 5.35]) {
    const bollard = new THREE.Mesh(bollardGeometry, yellowPaintMaterial);
    bollard.position.set(x, 0.625, -52.9);
    bollard.castShadow = true;
    scene.add(bollard);
  }

  const entrySign = makeSign('ENTRY', 5.8, 1.05, '#174d32', '#f5fff6');
  entrySign.position.set(0, 4.62, -53.92);
  scene.add(entrySign);

  const pillarGeometry = new THREE.BoxGeometry(2.25, 7.2, 2.25);
  const safetyBandGeometry = new THREE.BoxGeometry(2.32, 1.1, 2.32);
  const beamGeometry = new THREE.BoxGeometry(56, 0.75, 0.9);
  for (let z = -48; z <= 48; z += 16) {
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
      colliders.push({ x, z, hx: 1.125, hz: 1.125 });

      const safetyBand = new THREE.Mesh(safetyBandGeometry, yellowPaintMaterial);
      safetyBand.position.set(x, 0.72, z);
      safetyBand.castShadow = true;
      scene.add(safetyBand);
    }
  }

  addParkingLines(scene, whitePaintMaterial);

  const curbGeometry = new THREE.BoxGeometry(0.45, 0.28, 2.7);
  for (const side of [-1, 1]) {
    for (let z = -44; z <= 44; z += 8) {
      const curb = new THREE.Mesh(curbGeometry, yellowPaintMaterial);
      curb.position.set(side * 23.4, 0.15, z);
      scene.add(curb);
    }
  }

  const lightGeometry = new THREE.BoxGeometry(0.32, 0.12, 6.4);
  for (let z = -45; z <= 45; z += 10) {
    for (const x of [-7, 7]) {
      const fixture = new THREE.Mesh(lightGeometry, fixtureMaterial);
      fixture.position.set(x, 6.78, z);
      scene.add(fixture);
    }

    if (z % 20 === -5) {
      const light = new THREE.PointLight(0xd5ffe2, 18, 24, 1.8);
      light.position.set(0, 6.25, z);
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
    [-20.15, -44], [20.15, -36], [-20.15, -28], [20.15, -20],
    [-20.15, 4], [20.15, 12], [-20.15, 20], [20.15, 36], [-20.15, 44],
  ];
  parkedCars.forEach(([x, z]) => {
    colliders.push({ x, z, hx: 2.3, hz: 1.45, height: 1.65 });
  });
  const world = new World(root, colliders);
  addParkedCars(scene, parkedCars, world);

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