import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Input } from '../src/Input.js';
import { Player } from '../src/Player.js';
import { LiftableCar } from '../src/LiftableCar.js';
import { CombatSystem } from '../src/CombatSystem.js';

// No DOM or asset downloads are needed for the input and physics checks.
const desktopPointer = new EventTarget();
desktopPointer.matches = true;
globalThis.window = new EventTarget();
window.matchMedia = () => desktopPointer;
globalThis.HTMLElement = class {
  isContentEditable = false;
  closest() { return null; }
};

const input = new Input();
const press = (key, options = {}) => {
  const code = options.code ?? (/^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`);
  input._onKeyDown({ key, code, ...options });
  input._onKeyUp({ code });
};
const type = (text, options) => {
  for (const key of text) {
    press(key, options);
    input.endFrame();
  }
};
const camera = new THREE.PerspectiveCamera();
const world = {
  addCollider() {},
  removeCollider() {},
  collide() {},
  groundHeight() { return 0; },
};
class TestCar extends LiftableCar {
  _loadModel() {}
}
const scene = new THREE.Scene();
const car = new TestCar(scene, world);
const player = new Player();
scene.add(player.root);
const combat = new CombatSystem();

try {
  type('101');
  assert.equal(input.shortThrow, false, 'code ignored before gameplay');
  assert.equal(input.shortThrowUsed, false, 'ignored code cannot mark a run');
  input.setShortThrowAllowed(true);
  type('101');
  assert.equal(input.shortThrow, true, 'code toggles on across frames');
  assert.equal(input.shortThrowUsed, true, 'activation marks the run');
  type('101');
  assert.equal(input.shortThrow, false, 'code toggles off');
  assert.equal(input.shortThrowUsed, true, 'turning off cannot erase use');
  type('10w1');
  assert.equal(input.shortThrow, false, 'other keys interrupt the code');
  input.reset();
  type('101', { repeat: true });
  assert.equal(input.shortThrow, false, 'auto-repeat does not enter a code');
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing', 'defaultPrevented']) {
    type('10');
    press('1', { [modifier]: true });
    assert.equal(input.shortThrow, false, `${modifier} interrupts the code`);
  }
  for (const tag of ['input', 'textarea', 'select', 'contenteditable']) {
    const target = new HTMLElement();
    target.isContentEditable = tag === 'contenteditable';
    target.closest = () => tag === 'contenteditable' ? null : target;
    type('10');
    press('1', { target });
    assert.equal(input.shortThrow, false, `${tag} typing cannot complete a code`);
  }
  type('10');
  window.dispatchEvent(new Event('blur'));
  type('1');
  assert.equal(input.shortThrow, false, 'blur clears a partial code');
  input.setSuspended(true);
  type('101');
  input.setSuspended(false);
  type('01');
  assert.equal(input.shortThrow, false, 'pause/text suspension clears and ignores code');
  input.reset();
  for (const key of '101') press(key, { code: `Numpad${key}` });
  assert.equal(input.shortThrow, true, 'numpad digits work');
  input.endFrame();
  input.triggerMobilePunch();
  assert.equal(input.punchPressed, true);
  assert.equal(input.shortThrowPressed, false, 'touch throw stays normal on desktop');
  input.endFrame();
  input.triggerMobileLift();
  assert.equal(input.shortThrowPressed, false, 'touch lift stays normal on desktop');
  input.endFrame();
  press('j');
  assert.equal(input.shortThrowPressed, true, 'keyboard attack uses short mode');
  input.endFrame();
  press('e');
  assert.equal(input.shortThrowPressed, true, 'keyboard lift uses short mode');
  input.endFrame();

  desktopPointer.matches = false;
  desktopPointer.dispatchEvent(new Event('change'));
  type('101');
  assert.equal(input.shortThrow, false, 'coarse/touch pointer cannot use cheat');
  desktopPointer.matches = true;
  desktopPointer.dispatchEvent(new Event('change'));
  type('01');
  assert.equal(input.shortThrow, false, 'pointer change clears mode and partial code');
  input.reset();
  type('101');
  input.setShortThrowAllowed(false);
  assert.equal(input.shortThrowUsed, true, 'game over preserves use for the score');
  type('101');
  assert.equal(input.shortThrow, false, 'game over disables and clears the mode');
  input.setShortThrowAllowed(true);
  assert.equal(input.shortThrow, false, 'restart defaults to normal');
  assert.equal(input.shortThrowUsed, false, 'retry starts an unmarked run');
  console.log('PASS: keyboard sequence, typing guards, pause, blur, restart, touch exclusion');

  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
    for (const shortThrow of [false, true]) {
      player.reset();
      car.reset();
      input.setShortThrowAllowed(true);
      input.reset();
      player.root.position.set(0, 0, 0);
      player.root.rotation.y = 0;
      assert.equal(player.startLift(car), true);
      for (let t = 0; t < 0.5; t += dt) {
        player.update(dt, input, camera, world);
        car.update(dt, world, player);
        input.endFrame();
      }
      assert.equal(car.collider.disabled, true);
      if (shortThrow) type('101');
      press('j');
      player.update(dt, input, camera, world);
      input.endFrame();
      assert.equal(car.carried, true, 'car stays in hands during wind-up');
      type('101'); // A mid-animation toggle must only affect the next throw.

      const enemy = {
        root: new THREE.Group(),
        health: 6,
        get alive() { return this.health > 0; },
        takeDamage(amount) { this.health -= amount; },
      };
      enemy.root.position.set(0, 0, shortThrow ? 4 : 20);
      let released = false;
      for (let t = 0; t < 3; t += dt) {
        player.update(dt, input, camera, world);
        if (car.flying && !released) {
          released = true;
          assert.equal(car.velocity.z, shortThrow ? 4 : 30, 'strength latched at throw start');
          assert.equal(car.velocity.y, shortThrow ? 1.5 : 7);
          assert.equal(car.root.parent, scene);
          assert.equal(player.carrying, false);
        }
        car.update(dt, world, player);
        combat.resolveThrownProp(car, [enemy]);
        input.endFrame();
      }
      assert.equal(released, true);
      assert.equal(car.state, 'grounded');
      assert.equal(car.collider.disabled, false);
      assert.equal(car.collider.z, car.root.position.z);
      assert.equal(enemy.health, 3, 'car damages each enemy only once per throw');
      const range = car.root.position.z;
      assert.ok(shortThrow ? range >= 3 && range <= 5 : range >= 26 && range <= 29,
        `${shortThrow ? 'short' : 'normal'} range ${range} at dt=${dt}`);
      console.log(`PASS: ${shortThrow ? 'short' : 'normal'} throw ${range.toFixed(2)} m at dt=${dt.toFixed(4)}`);
    }
  }
} finally {
  input.dispose();
  player.dispose();
  car.dispose();
  delete globalThis.window;
  delete globalThis.HTMLElement;
}
