import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World, ENTRY_RAMP } from '../src/World.js';
import { Player } from '../src/Player.js';
import { EnemyManager } from '../src/EnemyManager.js';
import { LiftableCar } from '../src/LiftableCar.js';

const scene = new THREE.Scene();
const world = new World(new THREE.Group(), []);
const player = new Player();
const camera = new THREE.PerspectiveCamera();
camera.rotation.y = Math.PI;
const manager = new EnemyManager(7, new THREE.Vector3(0, 0, -25));
manager.addAll(scene);
class TestCar extends LiftableCar {
  _loadModel() {
    this.model = new THREE.Group();
    this.root.add(this.model);
  }
}
const car = new TestCar(scene, world);
const idle = { moveX: 0, moveZ: 0, sprint: false };

function startDownhill() {
  player.reset();
  player.root.position.set(0, 0, -51);
  player.root.position.y = world.floorHeight(player.root.position);
}

try {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    for (const sprint of [false, true]) {
      const moving = { ...idle, moveZ: 1, sprint };
      for (const action of ['jump', 'punch', 'lift']) {
        car.reset();
        startDownhill();
        for (let frame = 0; frame < Math.round(0.3 / dt); frame += 1) {
          player.update(dt, moving, camera, world);
          assert.equal(player.grounded, true, `downhill ${sprint ? 'sprint' : 'walk'} at dt=${dt}`);
          assert.ok(Math.abs(player.root.position.y - world.floorHeight(player.root.position)) < 1e-8);
        }
        assert.ok(world.floorHeight(player.root.position) > 0, 'action is tested on the slope, not the flat floor');
        if (action === 'jump') {
          player.update(dt, { ...moving, jumpPressed: true }, camera, world);
          assert.equal(player.grounded, false, 'an intentional jump leaves the ramp');
          assert.ok(player.velocityY > 0, 'downhill jump input produces an impulse');
        } else if (action === 'punch') {
          player.update(dt, { ...moving, punchPressed: true }, camera, world);
          assert.ok(player._punchTime < player._attackProfile.duration, 'downhill punch input is accepted');
        } else {
          car.root.position.copy(player.root.position);
          car.root.position.x += 3;
          car._syncCollider();
          assert.equal(car.canLift(player), true, 'downhill player can pick up a nearby car');
          assert.equal(player.startLift(car), true);
        }
      }
      car.reset();
      startDownhill();
      while (player.root.position.z < ENTRY_RAMP.bottomZ + 1) {
        player.update(dt, moving, camera, world);
        assert.equal(player.grounded, true, 'the foot of the ramp joins the flat floor continuously');
      }
      assert.equal(player.root.position.y, 0);
    }

    startDownhill();
    player.root.position.x = ENTRY_RAMP.halfWidth - 0.05;
    for (let frame = 0; frame < Math.round(0.5 / dt); frame += 1) {
      player.update(dt, { ...idle, moveX: -1 }, camera, world);
      if (player.root.position.x <= ENTRY_RAMP.halfWidth) continue;
      assert.equal(player.grounded, false, 'walking off the side of the ramp starts a fall');
      assert.ok(player.root.position.y > 1, 'leaving a ledge does not snap to the floor');
      break;
    }
    assert.ok(player.root.position.x > ENTRY_RAMP.halfWidth);

    const parked = world.addCollider({ x: 10, z: -30, hx: 1, hz: 1, height: 1.65 });
    player.reset();
    player.root.position.set(10, 1.65, -29.05);
    for (let frame = 0; frame < Math.round(0.5 / dt); frame += 1) {
      player.update(dt, { ...idle, moveZ: 1 }, camera, world);
      if (player.root.position.z <= -29) continue;
      assert.equal(player.grounded, false, 'stepping off a parked car still starts a fall');
      assert.ok(player.root.position.y > 1, 'floor following cannot pull the player off a car');
      break;
    }
    assert.ok(player.root.position.z > -29);
    world.removeCollider(parked);
  }
  console.log('PASS: downhill walk/sprint actions, ramp exit, jumping and ledges at four frame rates');

  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    for (const [x, z, yaw, disabled, blockDelay = 0] of [
      [0, -44.3, 0, false], [0, -46, Math.PI / 2, false],
      [-2, -42, Math.PI / 4, false], [2, -42, 0, false],
      [0, -42, Math.PI / 2, true],
      [0, -46, Math.PI / 2, false, 0.75],
    ]) {
      car.reset();
      if (z === -44.3) {
        car.root.position.set(x, 3.34, z);
        car.launch(new THREE.Vector3(0, 0, 1), true);
        for (let t = 0; t < 2; t += dt) car.update(dt, world, player);
        assert.equal(car.state, 'grounded');
        assert.ok(Math.abs(car.root.position.z + 42) < 0.3, 'real short throw lands across entry waypoints');
      } else {
        car.root.position.set(x, 0, z);
        car.root.position.y = world.floorHeight(car.root.position);
        car.root.rotation.set(0, yaw, 0);
        car._syncCollider();
      }
      car.collider.disabled = disabled || blockDelay > 0;
      player.reset();
      player.root.position.set(0, 0, -25);
      manager.reset(player.root.position);
      for (const enemy of manager.enemies) manager._placeAtEntry(enemy, world);
      const arrived = new Set();
      for (let t = 0; t < 30 && arrived.size < manager.enemies.length; t += dt) {
        if (!disabled && t >= blockDelay) car.collider.disabled = false;
        manager.update(dt, player, world);
        for (const enemy of manager.enemies) {
          if (enemy.aiState === 'enter' || enemy.aiState === 'arrive') {
            assert.equal(enemy._hasSlot, false, 'arrivals do not occupy attack slots');
          } else {
            arrived.add(enemy.id);
          }
        }
      }
      assert.equal(arrived.size, 7,
        `all seven arrivals must reach combat, car=(${x},${z}), yaw=${yaw}, dt=${dt}; ` +
        manager.enemies.map((e) => `${e.id}:${e.aiState}@${e.root.position.toArray()}`).join('; '));
      if (disabled) {
        for (const enemy of manager.enemies) {
          assert.equal(enemy.entryTarget.x, ((enemy.id - 1) % 5 - 2) * 1.8,
            'a carried/airborne car does not redirect entry');
        }
      }
    }
  }
  console.log('PASS: seven-agent arrival around landed cars, rotated blockers and disabled colliders');
} finally {
  car.dispose();
  manager.dispose();
  player.dispose();
  world.dispose();
}
