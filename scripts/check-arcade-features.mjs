import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyManager } from '../src/EnemyManager.js';
import { HAIR_STYLES } from '../src/AgentKit.js';
import { World, ENTRY_RAMP } from '../src/World.js';
import { Player } from '../src/Player.js';
import { LiftableCar } from '../src/LiftableCar.js';
import { CombatSystem } from '../src/CombatSystem.js';
import { Game } from '../src/Game.js';
import { PlayerProfile } from '../src/PlayerProfile.js';

const world = new World(new THREE.Group(), []);
const scene = new THREE.Scene();
const manager = new EnemyManager(5, new THREE.Vector3(0, 0, 20));
manager.addAll(scene);
const player = new Player();
const camera = new THREE.PerspectiveCamera();
camera.rotation.y = Math.PI;
const idle = { moveX: 0, moveZ: 0, sprint: false };
class TestCar extends LiftableCar {
  _loadModel() {
    this.model = new THREE.Group();
    this.model.scale.setScalar(1.65);
    this.root.add(this.model);
  }
}
const car = new TestCar(scene, world);
const combat = new CombatSystem();

try {
  assert.deepEqual(manager.enemies.map((e) => e.hairVariant), Object.keys(HAIR_STYLES));
  const first = manager.enemies[0];
  for (const enemy of manager.enemies) {
    assert.equal(enemy.collisionRadius, first.collisionRadius);
    assert.equal(enemy._headY, first._headY);
    assert.equal(enemy._shoulderY, first._shoulderY);
    assert.equal(enemy._kit, first._kit, 'geometry/material kit is shared');
  }
  const skull = (enemy) => enemy.joints.head.children[0];
  assert.equal(skull(manager.enemies[4]).children.length, skull(first).children.length - 1,
    'bald variant has no hair mesh');
  assert.notEqual(first._kit.geometry.hair.flat, first._kit.geometry.hair.part);
  console.log('PASS: five hair variants, shared kit, identical body proportions');

  const top = new THREE.Vector3(0, 0, ENTRY_RAMP.topZ);
  assert.equal(world.floorHeight(top), ENTRY_RAMP.height);
  top.z = (ENTRY_RAMP.topZ + ENTRY_RAMP.bottomZ) / 2;
  assert.equal(world.floorHeight(top), ENTRY_RAMP.height / 2);
  top.z = ENTRY_RAMP.bottomZ;
  assert.equal(world.floorHeight(top), 0);
  top.x = ENTRY_RAMP.halfWidth + 1;
  assert.equal(world.floorHeight(top), 0);
  player.root.position.set(0, 0, -40);
  const reinforcement = manager.addReinforcement(player, world);
  assert.equal(reinforcement.aiState, 'enter');
  assert.ok(reinforcement.root.position.y > 0);
  assert.equal(manager._activeAttackers, 0);
  for (let i = 0; i < 240 && reinforcement.aiState === 'enter'; i += 1) {
    reinforcement.update(1 / 60, player, world);
    assert.ok(Math.abs(reinforcement.root.position.y - world.floorHeight(reinforcement.root.position)) < 1e-9);
    assert.equal(manager._activeAttackers, 0, 'ramp traversal uses no attack slot');
  }
  assert.equal(reinforcement.aiState, 'arrive');
  reinforcement.takeDamage(3);
  manager.update(3.6, player, world);
  assert.equal(reinforcement.aiState, 'enter', 'defeated agents respawn on the ramp');
  assert.equal(reinforcement.alive, true);
  manager.reset(new THREE.Vector3(0, 0, 20));
  assert.ok(manager.enemies.every((enemy) => enemy.aiState === 'orbit'));
  assert.equal(manager.defeated, 0);
  console.log('PASS: ramp surface, grounded arrivals, slots, respawn and retry');

  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    player.reset();
    player.root.position.set(0, 0, -43);
    camera.rotation.y = 0; // forward is -Z, up the ramp
    for (let t = 0; t < 1.4; t += dt) {
      player.update(dt, { ...idle, moveZ: 1 }, camera, world);
      assert.ok(player.root.position.y >= world.floorHeight(player.root.position) - 1e-8);
    }
    assert.ok(player.root.position.y > 0.5, 'player can climb the ramp');
    for (let t = 0; t < 0.5; t += dt) player.update(dt, idle, camera, world);
    assert.equal(player.grounded, true, 'standing on ramp is grounded');
    player.update(dt, { ...idle, jumpPressed: true }, camera, world);
    assert.equal(player.grounded, false, 'jump still works from the ramp');
  }
  console.log('PASS: player ramp ascent, standing and jumping at four frame rates');
  const obstacle = world.addCollider({ x: 0, z: 0, hx: 2, hz: 2, height: 1.65 });
  player.reset();
  player.root.position.set(0, 0, 0);
  player.update(1 / 60, idle, camera, world);
  assert.equal(player.root.position.y, 0, 'floor correction cannot lift a player onto a car');
  assert.ok(Math.max(Math.abs(player.root.position.x), Math.abs(player.root.position.z)) > 2,
    'parked-car collision still pushes sideways');
  world.removeCollider(obstacle);
  console.log('PASS: ramp floor handling preserves parked-car collision');

  const enemy = {
    root: new THREE.Group(), health: 6,
    get alive() { return this.health > 0; },
    takeDamage(amount) { this.health = Math.max(0, this.health - amount); },
  };
  enemy.root.position.set(3, 0, 1.5);
  car.root.position.set(0, 0.1, 0);
  car.launch(new THREE.Vector3(0, 0, 1));
  car.velocity.y = -1;
  car.update(0.05, world, player);
  assert.equal(car.state, 'settling');
  assert.equal(car.damageLevel, 1);
  assert.ok(car.model.scale.y < 1.65, 'crash changes the visible silhouette');
  const crowd = [[-3, 1.5], [0, 1.5], [9, 1.5]].map(([x, z]) => {
    const target = {
      root: new THREE.Group(), health: 3,
      get alive() { return this.health > 0; },
      takeDamage(amount) { this.health = Math.max(0, this.health - amount); },
    };
    target.root.position.set(x, 0, z);
    return target;
  });
  const defeated = combat.resolveThrownProp(car, [enemy, ...crowd]);
  assert.equal(defeated.length, 2, 'one landing can defeat multiple agents');
  assert.equal(crowd[2].health, 3, 'agents outside the impact radius are unharmed');
  assert.equal(enemy.health, 3, 'landing frame hits nearby agents');
  enemy.root.position.set(0, 0, 1.5);
  combat.resolveThrownProp(car, [enemy]);
  assert.equal(enemy.health, 3, 'settling cannot hit twice');
  car.update(0.3, world, player);
  assert.equal(car.collider.disabled, false);
  assert.ok(car.collider.height < 1.65, 'collider tracks compression');
  for (let i = 0; i < 5; i += 1) car._land(0);
  assert.equal(car.damageLevel, 3, 'cosmetic damage is bounded');
  car.reset();
  assert.equal(car.damageLevel, 0);
  assert.equal(car.model.scale.y, 1.65);
  assert.equal(car.consumeLandingImpact(), false, 'retry clears unconsumed impacts');
  assert.equal(car.collider.height, 1.65);
  console.log('PASS: landing damage, once-per-throw hits, bounded car damage and reset');

  globalThis.localStorage = {
    getItem: () => null,
    setItem() {},
  };
  globalThis.document = { cookie: '' };
  const profile = new PlayerProfile();
  profile.setHandle('neoRunner');
  let submitted;
  const game = Object.assign(Object.create(Game.prototype), {
    input: { shortThrowUsed: true, setShortThrowAllowed() {} },
    enemyManager: { defeated: 4 },
    sessionTime: 30, profile, _sessionId: 0, _boards: {},
    gameOverHandle: {}, gameOverScore: {}, gameOverSession: {},
    _setBoard() {},
    _submitSession() {},
    remoteScores: { async submit(run) { submitted = run; return null; } },
  });
  game._endGame();
  assert.equal(profile.best.handle, 'neoRunner');
  assert.equal(profile.best.usedCheat, true);
  assert.equal(game._pendingEntry, null, 'named runs need no name prompt');
  assert.equal(game.gameOverHandle.textContent, 'neoRunner');
  profile.setHandle('laterHandle');
  await Game.prototype._submitSession.call(game);
  assert.equal(submitted.handle, 'neoRunner', 'remote submission preserves the run handle');
  assert.equal(submitted.usedCheat, true, 'remote submission includes the subtitle flag');
  assert.equal(profile.handle, 'laterHandle');
  game.input.shortThrowUsed = false;
  game.enemyManager.defeated = 5;
  game._endGame();
  await Game.prototype._submitSession.call(game);
  assert.equal(submitted.handle, 'laterHandle', 'unassisted runs retain their handle');
  assert.equal(submitted.usedCheat, false);
  profile.setHandle('');
  game.input.shortThrowUsed = true;
  game.enemyManager.defeated = 6;
  game._endGame();
  assert.equal(game._pendingEntry, profile.best, 'anonymous assisted runs still ask for a name');
  game.promptForHandle = async () => 'newName';
  await game._promptForEntryName();
  await Game.prototype._submitSession.call(game);
  assert.equal(profile.best.handle, 'newName');
  assert.equal(profile.best.usedCheat, true);
  assert.equal(submitted.handle, 'newName');
  assert.equal(submitted.usedCheat, true);
  console.log('PASS: local/remote cheat flags, original handles and post-run naming');
} finally {
  manager.dispose();
  player.dispose();
  car.dispose();
  world.dispose();
  delete globalThis.localStorage;
  delete globalThis.document;
}
