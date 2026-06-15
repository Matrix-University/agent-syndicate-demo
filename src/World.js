import * as THREE from 'three';

// Builds the arena: lighting, floor, grid, and a ring of blockout pillars.
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

  // Ring of pillars to give the space a sense of scale.
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x202632, roughness: 0.8 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 20;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), pillarMat);
    pillar.position.set(Math.cos(angle) * r, 4.5, Math.sin(angle) * r);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  }
}
