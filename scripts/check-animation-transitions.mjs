import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { AnimationController, STATE } from '../src/AnimationController.js';
import { Player } from '../src/Player.js';
import { Enemy } from '../src/Enemy.js';
import { NodeIO } from '@gltf-transform/core';
import { buildSkeleton, readPose, fk } from './lib/skeleton.mjs';

const clips = [
  ['Idle_No_Loop', 2.5], ['Combat_Idle', 2.5], ['Walk', 0.95], ['Run', 0.66],
  ['Melee_Hook', 0.47], ['Melee_Hook_Rec', 0.6], ['Hit_Knockback', 0.83],
  ['Throw_Overhead', 0.95], ['NinjaJump_Start', 0.97],
  ['NinjaJump_Idle_Loop', 2], ['NinjaJump_Land', 1.27],
].map(([name, duration]) => new THREE.AnimationClip(name, duration, [
  new THREE.NumberKeyframeTrack('.position[x]', [0, duration], [0, 0]),
]));
const input = { moveX: 0, moveZ: 0, sprint: false, punchPressed: false, jumpPressed: false };
const camera = new THREE.PerspectiveCamera();
const world = { groundHeight: () => 0, collide() {} };

const baked = (await new NodeIO().read(
  fileURLToPath(new URL('../models-src/agent-animated.glb', import.meta.url))
)).getRoot();
const skeleton = buildSkeleton(baked);
const guardClip = baked.listAnimations().find(clip => clip.getName() === 'Combat_Idle');
assert.ok(guardClip, 'the authored guard must exist in the baked asset');
const guardPose = readPose(guardClip, skeleton);
for (let frame = 0; frame < guardPose.frames; frame += 1) {
  const bones = fk(guardPose, skeleton, frame);
  for (const name of ['hand_l', 'hand_r']) {
    const hand = bones.get(name).pos;
    assert.ok(hand[1] > 1.2, `${name} stays above chest height throughout guard`);
    assert.ok(hand[2] > bones.get('Head').pos[2], `${name} stays ahead of the head`);
  }
}
console.log(`PASS: both hands guard the head across all ${guardPose.frames} baked frames`);

for (const withClips of [false, true]) {
  const player = new Player();
  if (withClips) player.anim = new AnimationController(new THREE.Group(), clips);
  try {
    player.update(0.13, { ...input, punchPressed: true }, camera, world);
    assert.equal(player.punchActive, true);
    player.takeDamage(1);
    assert.equal(player.punchActive, false, 'interrupted punch loses its remaining damage window');
    assert.equal(player.consumePunchHit(), false);
    const x = player.root.position.x;
    player.update(0.1, { ...input, moveX: 1, punchPressed: true }, camera, world);
    assert.equal(player.root.position.x, x, 'hit stun also applies to the zero-asset fallback');
    assert.equal(player.punchActive, false);
    player.update(0.15, input, camera, world);
    assert.equal(player._hitTime, 0);
    assert.equal(player.anim?.acting ?? false, false, 'reaction finishes before invulnerability ends');

    player.reset();
    let launches = 0;
    const prop = { lift() {}, launch() { launches += 1; } };
    assert.equal(player.startLift(prop), true);
    player.takeDamage(1);
    assert.equal(player._hitTime, 0, 'pickup keeps its animation despite damage');
    for (let i = 0; i < 40; i++) player.update(1 / 60, input, camera, world);
    assert.equal(player.startThrow(), true);
    player.takeDamage(1);
    if (withClips) assert.equal(player.anim._action, player.anim.oneShots.throw);
    for (let i = 0; i < 70; i++) player.update(1 / 60, input, camera, world);
    assert.equal(launches, 1, 'hit during throw preserves exactly one release');
    player.takeDamage(1);
    player.reset();
    assert.equal(player.anim?.acting ?? false, false, 'retry clears blocking animations');
    assert.equal(player.carrying, false);
    assert.equal(player._hitTime, 0);
    console.log(`PASS: interrupts, prop timing, hit duration and retry (${withClips ? 'clips' : 'fallback'})`);
  } finally {
    player.dispose();
  }
}

const controller = new AnimationController(new THREE.Group(), clips);
try {
  controller.playReaction('hit', 0.24);
  controller.jumpTakeoff();
  assert.equal(controller._reaction, null, 'takeoff clears a reaction');
  assert.equal(controller.playReaction('hit', 0.24), false, 'airborne priority is preserved');
  controller.reset();
  assert.equal(controller.airborne, false);
  assert.equal(controller.current, controller.actions[STATE.IDLE]);
  controller.setLocomotion(STATE.COMBAT_IDLE, 0);
  assert.equal(controller.current.getClip().name, 'Combat_Idle');
  assert.equal(controller.current.timeScale, 1, 'combat idle plays at authored speed');
  controller.setLocomotion(STATE.WALK);
  controller.update(0.3);
  const phase = controller.current.time / controller.current.getClip().duration;
  controller.setLocomotion(STATE.RUN);
  assert.ok(Math.abs(controller.current.time / controller.current.getClip().duration - phase) < 1e-8);
  controller.setLocomotion(STATE.WALK, 0.1);
  assert.equal(controller.current.timeScale, 0.1, 'slow movement no longer forces a fast stride');
  controller.playAction('punch');
  controller.update(0.48);
  assert.equal(controller.acting, false, 'recovery does not root the player');
  assert.equal(controller._recovery, controller.oneShots.punchRecovery);
  controller.setLocomotion(STATE.COMBAT_IDLE);
  assert.ok(controller._recovery, 'standing lets recovery complete');
  controller.setLocomotion(STATE.WALK);
  assert.equal(controller._recovery, null, 'moving cancels recovery');
  controller.playAction('punch');
  controller.update(0.48);
  controller.playReaction('hit', 0.24);
  assert.equal(controller._recovery, null, 'damage cancels recovery');
  controller.reset();
  controller.playAction('punch');
  controller.update(0.48);
  assert.equal(controller.playAction('punch'), true, 'another punch cancels recovery');
  console.log('PASS: guard binding, stride phase, low-speed cadence and cancelable recovery');
} finally {
  controller.dispose();
}

const missingHit = new AnimationController(new THREE.Group(), clips.filter(c => c.name !== 'Hit_Knockback'));
missingHit.playAction('punch');
assert.equal(missingHit.playReaction('hit', 0.24), false);
assert.equal(missingHit.acting, false, 'missing reaction clip still cancels the punch');
missingHit.dispose();

for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
  const player = new Player();
  player.anim = new AnimationController(new THREE.Group(), [...clips].reverse());
  const enemy = new Enemy({ id: 1 });
  try {
    assert.equal(player.anim.oneShots.punch.getClip().name, 'Melee_Hook', 'recovery cannot shadow punch');
    player.combatNearby = true;
    player.update(dt, input, camera, world);
    assert.equal(player.state, STATE.COMBAT_IDLE);
    player.update(dt, { ...input, punchPressed: true }, camera, world);
    while (player._punchTime < 0.34) player.update(dt, input, camera, world);
    player.update(dt, { ...input, punchPressed: true }, camera, world);
    let repeated = false;
    for (let time = 0; time < 0.3; time += dt) {
      player.update(dt, input, camera, world);
      if (player._punchTime < 0.15) repeated = true;
    }
    assert.equal(repeated, true, 'late input is buffered into exactly the next punch');
    assert.equal(player._punchBufferTime, 0);
    player.takeDamage(1);
    assert.equal(player._punchBufferTime, 0);

    player.root.position.set(0, 0, 1.5);
    enemy.aiState = 'approach';
    enemy.update(dt, player, world);
    assert.equal(enemy.aiState, 'windup');
    const side = enemy._strikeSide;
    for (let t = 0; t < 0.5; t += dt) enemy.update(dt, player, world);
    assert.ok(enemy._guard > 0.9, 'guard blends in before striking');
    assert.equal(enemy.attackActive, true);
    assert.equal(enemy.consumeStrikeHit(), true);
    assert.equal(enemy.consumeStrikeHit(), false);
    enemy.aiState = 'approach';
    enemy.update(dt, player, world);
    assert.equal(enemy._strikeSide, -side, 'consecutive attacks alternate hands');
    const rootYaw = enemy.root.rotation.y;
    enemy._animate(dt);
    assert.equal(enemy.root.rotation.y, rootYaw, 'mirrored strike only changes visuals');
    enemy.reset();
    assert.equal(enemy._guard, 0);
    console.log(`PASS: buffered punch, guarded agents and mirrored strikes at dt=${dt}`);
  } finally {
    player.dispose();
    enemy.dispose();
  }
}
