import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/World.js';
import { LiftableCar } from '../src/LiftableCar.js';
import { CombatSystem } from '../src/CombatSystem.js';
import { CarSmoke } from '../src/CarSmoke.js';

class TestCar extends LiftableCar {
  _loadModel() {
    this.model = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial());
    this.model.scale.setScalar(1.65);
    this.root.add(this.model);
    this._initialModel = this.model;
  }
}

class TestWorld extends World {
  collide() {}
  groundHeight() { return 0; }
}

function parkedCar(scene, x, z) {
  const root = new THREE.Group();
  const model = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial());
  model.scale.setScalar(1.65);
  root.add(model);
  root.position.set(x, 0, z);
  scene.add(root);
  return {
    x, z, yaw: Math.PI / 2, root, model, claimed: false,
    collider: { x, z, hx: 2.3, hz: 1.45, height: 1.65 },
  };
}

for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
  const scene = new THREE.Scene();
  const near = parkedCar(scene, 10, 0);
  const far = parkedCar(scene, -30, 0);
  const fleet = [far, near]; // Selection must be nearest, not the first entry.
  const world = new TestWorld(scene, fleet.map((entry) => entry.collider), fleet);
  const car = new TestCar(scene, world);
  const initial = car.model;
  const initialMaterial = initial.material;
  const initialColor = initialMaterial.color.clone();
  const player = { root: new THREE.Group(), grounded: true, carrying: false };
  scene.add(player.root);
  const combat = new CombatSystem();
  let initialDisposed = 0;
  let fleetDisposed = 0;
  initial.geometry.addEventListener('dispose', () => { initialDisposed += 1; });
  for (const entry of fleet) {
    entry.model.geometry.addEventListener('dispose', () => { fleetDisposed += 1; });
  }

  function throwCar() {
    player.root.position.copy(car.root.position);
    assert.equal(car.canLift(player), true);
    car.lift(player);
    assert.equal(car.collider.disabled, true);
    for (let time = 0; time < 0.5; time += dt) car.update(dt, world, player);
    car.throwPose(1);
    car.launch(new THREE.Vector3(0, 0, 1), true);
    const enemy = {
      root: new THREE.Group(), alive: true, hits: 0,
      takeDamage() { this.hits += 1; },
    };
    enemy.root.position.copy(car.root.position);
    enemy.root.position.y = 0;
    for (let time = 0; time < 3 && (car.flying || car.state === 'settling'); time += dt) {
      car.update(dt, world, player);
      combat.resolveThrownProp(car, [enemy]);
    }
    assert.equal(enemy.hits, 1, 'landing/flight damage is applied once per throw');
    assert.equal(car.collider.disabled, false);
    assert.equal(car.collider.z, car.root.position.z);
  }

  try {
    for (let damage = 1; damage <= 3; damage += 1) {
      throwCar();
      assert.equal(car.damageLevel, damage);
      assert.equal(car.model, initial, 'same car is used until its third landing');
      assert.equal(fleet.some((entry) => entry.claimed), false);
      assert.equal(car.liftable, damage < 3);
      assert.equal(car._smoke.root.visible, damage === 3, 'smoke starts only on destruction');
    }
    assert.notEqual(initial.material, initialMaterial);
    assert.ok(initialMaterial.color.equals(initialColor), 'original finish is untouched');
    assert.ok(initial.material.color.r < initialMaterial.color.r, 'wreck is visibly darkened');
    assert.equal(initial.material.roughness, 1);
    assert.equal(initial.material.metalness, 0.15);
    let scorchedDisposed = 0;
    initial.material.addEventListener('dispose', () => { scorchedDisposed += 1; });
    assert.equal(car.destroyed, true);
    assert.equal(car._marker.visible, false);
    const wreckPosition = car.root.position.clone();
    car.update(dt, world, player);
    assert.equal(near.claimed, true, 'nearest undamaged parked car is promoted');
    assert.equal(far.claimed, false);
    assert.equal(near.root.visible, false, 'no duplicate parked model remains');
    assert.equal(near.collider.disabled, true, 'old parked collider is disabled');
    assert.equal(car.damageLevel, 0);
    assert.equal(car.liftable, true);
    assert.equal(car.root.position.x, near.x);
    assert.equal(car.model.geometry, near.model.geometry);
    assert.equal(car._wrecks.length, 1);
    assert.ok(car._wrecks[0].root.position.equals(wreckPosition));
    assert.equal(car._wrecks[0].collider.disabled, false);
    assert.equal(car._smoke.root.position.x, wreckPosition.x);
    assert.equal(car._smoke.root.position.z, wreckPosition.z, 'smoke stays at the wreck');
    const replacement = car.model;
    car.update(dt, world, player);
    assert.equal(car.model, replacement, 'replacement cannot switch while undestroyed');

    for (let damage = 1; damage <= 3; damage += 1) {
      throwCar();
      assert.equal(car.model, replacement);
      assert.equal(car.damageLevel, damage);
      assert.equal(near.model.scale.y, 1.65, 'damage does not change shared parked transforms');
    }
    assert.notEqual(replacement.material, near.model.material, 'only wreck materials are cloned');
    car.update(dt, world, player);
    assert.equal(far.claimed, true);
    assert.equal(car.damageLevel, 0);
    for (let throwIndex = 0; throwIndex < 3; throwIndex += 1) throwCar();
    for (let frame = 0; frame < 5; frame += 1) car.update(dt, world, player);
    assert.equal(car.destroyed, true, 'exhausted fleet cannot provide a used car');
    assert.equal(car.canLift(player), false);
    assert.equal(car._wrecks.length, 2);
    assert.equal(world.colliders.length, 5, 'two disabled parked + two wreck + active wreck');

    car.reset();
    assert.equal(car.model, initial);
    assert.equal(car.damageLevel, 0);
    assert.ok(car.root.position.equals(car.home));
    assert.equal(car._wrecks.length, 0);
    assert.equal(initial.material, initialMaterial, 'retry restores original finish');
    assert.equal(car._destroyedTreatments.length, 0);
    assert.equal(scorchedDisposed, 1, 'scorched clone is disposed on retry');
    assert.equal(car._smoke.root.visible, false, 'retry clears smoke');
    assert.equal(world.colliders.length, 3);
    assert.ok(fleet.every((entry) => !entry.claimed && entry.root.visible && !entry.collider.disabled));
    assert.equal(initialDisposed, 0);
    assert.equal(fleetDisposed, 0);
    car.lift(player);
    car.reset();
    assert.equal(car.root.parent, scene, 'retry reparents a carried car');
    console.log(`PASS: destruction, nearest replacement, exclusivity, exhaustion, retry at dt=${dt}`);
  } finally {
    car.dispose();
    assert.equal(initialDisposed, 1, 'owned initial model is disposed once');
    assert.equal(fleetDisposed, 0, 'borrowed fleet resources remain owned by World');
    world.dispose();
    assert.equal(fleetDisposed, 2);
  }

  {
    const smokeScene = new THREE.Scene();
    const smoke = new CarSmoke(smokeScene);
    const origin = new THREE.Vector3(3, 0, 7);
    smoke.play(origin);
    for (let frame = 0; frame < Math.round(0.5 / dt); frame += 1) smoke.update(dt);
    const puff = smoke._puffs[0].mesh;
    assert.ok(Math.abs(puff.position.y - 0.7) < 1e-6, 'smoke rise is frame-rate independent');
    assert.ok(puff.scale.x > 0.3, 'smoke expands');
    assert.ok(puff.material.opacity > 0 && puff.material.opacity < 0.4, 'smoke fades');
    origin.set(100, 0, 100);
    assert.equal(smoke.root.position.x, 3, 'smoke copies the destruction position');
    smoke.update(1.1);
    assert.equal(smoke.root.visible, false, 'burst expires after 1.1 seconds');
    smoke.play(origin);
    assert.equal(smoke._age, 0, 'a later destruction restarts the burst');
    let textureDisposed = 0;
    let materialsDisposed = 0;
    smoke._texture.addEventListener('dispose', () => { textureDisposed += 1; });
    smoke._material.addEventListener('dispose', () => { materialsDisposed += 1; });
    assert.equal(puff.isSprite, true, 'soft smoke always faces the camera');
    assert.equal(smoke._texture.image.data[3], 0, 'smoke texture has transparent edges');
    smoke.dispose();
    assert.equal(textureDisposed, 1);
    assert.equal(materialsDisposed, 1);
    assert.equal(smokeScene.children.length, 0);
    console.log(`PASS: smoke rise, expansion, fade, expiry and disposal at dt=${dt}`);
  }
}
