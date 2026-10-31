import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/Player.js';
import { Game } from '../src/Game.js';

const player = new Player({ maxHealth: 25 });
const camera = new THREE.PerspectiveCamera();
const input = {
  moveX: 0, moveZ: 0, sprint: false,
  punchPressed: false, jumpPressed: false, liftPressed: false,
};
const step = (dt) => {
  player.update(dt, input, camera);
  player.regenerateHealth(dt);
};
const hurt = (amount = 10) => {
  player.reset();
  assert.equal(player.takeDamage(amount), true);
};

try {
  hurt();
  player.regenerateHealth(179);
  assert.equal(player.health, 15, 'no healing during the three-minute delay');
  player.regenerateHealth(1);
  assert.equal(player.health, 15, 'three minutes starts the interval, not a heal');
  player.regenerateHealth(29.75);
  assert.equal(player.health, 15, 'no healing before 3:30');
  player.regenerateHealth(0.25);
  assert.equal(player.health, 17.5, 'first tick is exactly 10% of maximum health');
  player.regenerateHealth(29.75);
  assert.equal(player.health, 17.5, 'no extra tick before another 30 seconds');
  player.regenerateHealth(0.25);
  assert.equal(player.health, 20, 'subsequent ticks remain 30 seconds apart');
  console.log('PASS: 180-second delay, first tick at 210 seconds, 30-second intervals');

  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    for (const running of [false, true]) {
      hurt();
      input.moveZ = running ? 1 : 0;
      input.sprint = running;
      const frames = Math.round(210 / dt);
      for (let frame = 0; frame < frames - 1; frame += 1) step(dt);
      assert.equal(player.health, 15, 'no early tick at any frame rate');
      // Floating-point accumulation can put a boundary on the following frame.
      step(dt);
      step(dt);
      assert.equal(player.health, 17.5, 'first tick within one simulation frame of 3:30');
      for (let frame = 0; frame < Math.round(30 / dt); frame += 1) step(dt);
      assert.equal(player.health, 20, 'running and idle share the same healing rate');
      console.log(`PASS: ${running ? 'running' : 'idle'} regeneration at dt=${dt.toFixed(4)}`);
    }
  }
  input.moveZ = 0;
  input.sprint = false;

  hurt();
  step(0.75);
  player.regenerateHealth(199.25);
  assert.equal(player.takeDamage(1), true);
  player.regenerateHealth(209.75);
  assert.equal(player.health, 14, 'a new hit resets the entire wait');
  player.regenerateHealth(0.25);
  assert.equal(player.health, 16.5);

  hurt();
  player.regenerateHealth(209.75);
  assert.equal(player.takeDamage(1), false, 'invulnerable hits are ignored');
  assert.equal(player.takeDamage(0), false);
  assert.equal(player.takeDamage(-1), false);
  player.regenerateHealth(0.25);
  assert.equal(player.health, 17.5, 'rejected damage does not reset the wait');
  console.log('PASS: accepted damage resets both waits; rejected damage does not');

  hurt();
  player.regenerateHealth(209.75);
  input.punchPressed = true;
  step(0.25);
  input.punchPressed = false;
  assert.equal(player.health, 17.5, 'attacking does not interrupt regeneration');
  hurt();
  player.regenerateHealth(209.75);
  input.jumpPressed = true;
  step(0.25);
  input.jumpPressed = false;
  assert.equal(player.grounded, false);
  assert.equal(player.health, 17.5, 'jumping does not interrupt regeneration');

  hurt(1);
  player.regenerateHealth(210);
  assert.equal(player.health, 25, 'partial final tick is capped at maximum health');
  player.regenerateHealth(600);
  assert.equal(player.health, 25, 'full health never overflows');
  step(0.75);
  assert.equal(player.takeDamage(1), true);
  player.regenerateHealth(209.75);
  assert.equal(player.health, 24, 'full-health time cannot bank healing after a hit');
  player.regenerateHealth(0.25);
  assert.equal(player.health, 25);

  hurt(25);
  player.regenerateHealth(600);
  assert.equal(player.health, 0, 'regeneration cannot revive a defeated player');
  hurt();
  player.regenerateHealth(209.75);
  player.reset();
  assert.equal(player._regenTime, 0, 'retry clears the timer');
  assert.equal(player.health, 25, 'retry restores health');
  assert.equal(player.takeDamage(1), true);
  player.regenerateHealth(0.25);
  assert.equal(player.health, 24, 'retry cannot inherit a pending healing tick');
  console.log('PASS: actions, full-health cap, death, and retry');

  player.maxHealth = 9;
  hurt(6);
  for (let tick = 0; tick < 5; tick += 1) {
    player.regenerateHealth(tick === 0 ? 210 : 30);
    assert.equal(player.health, (39 + tick * 9) / 10,
      'the live nine-point health pool restores 0.9 per tick without numeric residue');
  }
  step(0.75);
  assert.equal(player.takeDamage(7.5), true);
  assert.equal(player.health, 0, 'fractional regeneration cannot leave an extra life');
  console.log('PASS: fractional healing and exact lethal damage with nine maximum HP');

  const attributes = new Map();
  const classes = new Set(['low']);
  const game = Object.assign(Object.create(Game.prototype), {
    player, camera, input: { ...input, endFrame() {} },
    _idleInput: input,
    clock: { getDelta: () => 0.05 },
    renderer: { render() {} },
    handleDialog: { isOpen: false },
    pauseMenu: { isOpen: false },
    gameOver: false,
    gameOverPanel: { hidden: true },
    sessionTime: 0,
    world: { collide() {}, groundHeight: () => 0 },
    liftableCar: { update() {} },
    enemyManager: { update: () => false, enemies: [] },
    combat: { update: () => ({ playerHit: false }), resolveThrownProp: () => [] },
    settings: { vibrate() {} },
    greenCodeBurst: { update() {} },
    followCam: { update() {} },
    playerHealthFill: { style: {} },
    playerHealthValue: { textContent: '' },
    playerHealthMeter: {
      setAttribute: (name, value) => attributes.set(name, value),
      classList: {
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
    },
    _updateLiftPrompt() {},
    _updateRunHud() {},
    _updateDeathFade() {},
    _endGame() { this.gameOver = true; },
  });

  hurt(6);
  player._regenTime = 209.96;
  game._loop();
  assert.equal(player.health, 3.9, 'the game loop advances regeneration');
  assert.equal(game.playerHealthValue.textContent, '3.9 / 9');
  assert.equal(game.playerHealthFill.style.transform, `scaleX(${3.9 / 9})`);
  assert.equal(attributes.get('aria-valuenow'), '3.9');
  assert.equal(attributes.get('aria-valuemax'), '9');
  assert.equal(classes.has('low'), false, 'healing clears the low-health state');

  for (const menu of [game.pauseMenu, game.handleDialog]) {
    player._regenTime = 209.96;
    menu.isOpen = true;
    const before = player.health;
    for (let i = 0; i < 100; i += 1) game._loop();
    assert.equal(player.health, before);
    assert.equal(player._regenTime, 209.96, 'menus freeze rather than reset the timer');
    menu.isOpen = false;
    game._loop();
    assert.equal(player.health, Number((before + 0.9).toFixed(1)),
      'closing a menu continues the pending interval');
  }

  hurt(6);
  player._invulnerableTime = 0;
  player._regenTime = 209.96;
  game.combat.update = () => ({ playerHit: player.takeDamage(1) });
  game._loop();
  assert.equal(player.health, 2, 'same-frame damage cancels a pending healing tick');
  assert.equal(player._regenTime, 0.05);
  assert.equal(game.playerHealthValue.textContent, '2 / 9');
  assert.equal(classes.has('low'), true);

  player._invulnerableTime = 0;
  player._regenTime = 209.96;
  game.combat.update = () => ({ playerHit: player.takeDamage(2) });
  game._loop();
  assert.equal(player.health, 0, 'same-frame lethal damage cannot be rescued by healing');
  assert.equal(game.gameOver, true);
  assert.equal(attributes.get('aria-valuenow'), '0');
  hurt(6);
  player._regenTime = 209.96;
  game._loop();
  assert.equal(player.health, 3, 'game over never advances regeneration');
  assert.equal(player._regenTime, 209.96);
  console.log('PASS: game-loop integration, health HUD, accessibility, menus, and damage priority');
} finally {
  player.dispose();
}
