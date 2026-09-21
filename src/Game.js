import * as THREE from 'three';
import { buildWorld } from './World.js';
import { Player } from './Player.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { Input } from './Input.js';
import { MobileControls } from './MobileControls.js';
import { Enemy } from './Enemy.js';
import { CombatSystem } from './CombatSystem.js';
import { GreenCodeBurst } from './GreenCodeBurst.js';

const INITIAL_AGENT_COUNT = 2;
const MAX_ACTIVE_AGENTS = 7;

export class Game {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 250
    );
    this.camera.position.set(0, 7, -11);

    this.world = buildWorld(this.scene);

    // Single baked asset shared with Decentraland: character + embedded clips in
    // one Draco-compressed GLB (produced by `npm run bake:anims:dcl`). The browser
    // decodes it via DRACOLoader; DCL loads the same file. Until it exists, the
    // primitive placeholder shows. Tune modelScale so the body is ~3 units tall,
    // and set modelYaw to Math.PI if it faces away.
    this.player = new Player({
      modelUrl: '/models/agent-dcl.glb',
      modelScale: 1.7,
      modelYaw: 0,
    });
    // Start under the EXIT sign at the far end, facing back down the lane to the entry ramp.
    this.player.root.position.set(0, 0, 42);
    this.player.root.rotation.y = Math.PI;
    this.scene.add(this.player.root);

    this.combat = new CombatSystem();
    this.greenCodeBurst = new GreenCodeBurst(this.scene);
    this.enemies = [];
    this._enemyId = 1;
    this._simTime = 0;
    this._hudEnemy = null;

    for (let i = 0; i < INITIAL_AGENT_COUNT; i += 1) {
      this._spawnEnemy({ nearPlayer: i === 0 });
    }

    this.enemyHealthMeter = document.getElementById('enemy-health-meter');
    this.enemyHealthFill = document.getElementById('enemy-health-fill');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.objective = document.getElementById('objective');
    this._updateEnemyHud();

    this.input = new Input();
    this.followCam = new ThirdPersonCamera(this.camera, this.player.root, canvas, {
      bounds: this.world.cameraBounds,
    });
    this.mobileControls = new MobileControls(this.input, {
      root: document.getElementById('mobile-controls'),
      joystick: document.getElementById('move-stick'),
      thumb: document.getElementById('move-stick-thumb'),
      jumpButton: document.getElementById('jump-button'),
      punchButton: document.getElementById('punch-button'),
    });
    this.clock = new THREE.Clock();
    this._disposed = false;

    this._loop = this._loop.bind(this);
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
  }

  start() {
    this.renderer.setAnimationLoop(this._loop);
  }

  _loop() {
    // Clamp dt so a paused/backgrounded tab doesn't teleport the player.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._simTime += dt;

    this.player.update(dt, this.input, this.camera, this.world);

    const aliveEnemies = this._aliveEnemies();
    const hitEnemy = this.combat.update(this.player, aliveEnemies, this._hudEnemy);
    if (hitEnemy) {
      this._hudEnemy = hitEnemy;
      // Reinforce immediately when a target enters last-hit state.
      if (hitEnemy.health === 1 && !hitEnemy.spawnedOnLastHit) {
        hitEnemy.spawnedOnLastHit = true;
        this._spawnEnemy({ nearPlayer: true });
      }
      if (!hitEnemy.alive) this.greenCodeBurst.play(hitEnemy.root.position);
    }

    const aliveNow = this._aliveEnemies();
    const attackSlots = aliveNow.length >= 4 ? 2 : 1;
    const attackerIds = this._pickAttackers(aliveNow, attackSlots);
    let orbitIndex = 0;
    let strikeIndex = 0;

    for (const enemy of aliveNow) {
      const attacking = attackerIds.has(enemy.id);
      const strikeRadius = Math.max(1.85, this.player.attackReach - 0.2);
      enemy.update(dt, {
        playerPosition: this.player.root.position,
        attacking,
        orbitIndex,
        orbitCount: Math.max(aliveNow.length - attackerIds.size, 1),
        strikeIndex,
        strikeRadius,
        time: this._simTime,
      });
      if (attacking) strikeIndex += 1;
      else orbitIndex += 1;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) enemy.update(dt);
    }

    this._pruneDefeatedEnemies();
    this._updateObjective(this._aliveEnemies().length, attackSlots);
    this._updateEnemyHud();

    this.greenCodeBurst.update(dt);
    this.followCam.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame(); // clear edge-triggered input after everyone has read it
  }

  _updateEnemyHud() {
    const enemy = this._selectHudEnemy();
    const healthRatio = enemy ? enemy.health / enemy.maxHealth : 0;
    this.enemyHealthFill.style.transform = `scaleX(${healthRatio})`;
    this.enemyHealthValue.textContent = enemy
      ? `${enemy.health} / ${enemy.maxHealth}`
      : '0 / 3';
    this.enemyHealthMeter.setAttribute('aria-valuenow', String(enemy ? enemy.health : 0));
  }

  _updateObjective(aliveCount, attackSlots) {
    if (aliveCount === 0) {
      this.objective.textContent = 'OBJECTIVE // TARGETS ELIMINATED';
      return;
    }
    const slotLabel = attackSlots === 1 ? '1 SLOT' : '2 SLOTS';
    this.objective.textContent =
      `OBJECTIVE // SURVIVE CROWD (${aliveCount} AGENTS, ${slotLabel})`;
  }

  _selectHudEnemy() {
    if (this._hudEnemy?.alive) return this._hudEnemy;

    const alive = this._aliveEnemies();
    if (!alive.length) {
      this._hudEnemy = null;
      return null;
    }

    let nearest = alive[0];
    let nearestDistSq = this.player.root.position.distanceToSquared(nearest.root.position);
    for (let i = 1; i < alive.length; i += 1) {
      const enemy = alive[i];
      const distSq = this.player.root.position.distanceToSquared(enemy.root.position);
      if (distSq < nearestDistSq) {
        nearest = enemy;
        nearestDistSq = distSq;
      }
    }

    this._hudEnemy = nearest;
    return nearest;
  }

  _aliveEnemies() {
    return this.enemies.filter((enemy) => enemy.alive);
  }

  _pickAttackers(aliveEnemies, attackSlots) {
    const ranked = [...aliveEnemies].sort((a, b) => {
      const distA = this.player.root.position.distanceToSquared(a.root.position);
      const distB = this.player.root.position.distanceToSquared(b.root.position);
      return distA - distB;
    });
    return new Set(ranked.slice(0, Math.min(attackSlots, ranked.length)).map((enemy) => enemy.id));
  }

  _spawnEnemy(opts = {}) {
    const aliveCount = this._aliveEnemies().length;
    if (aliveCount >= MAX_ACTIVE_AGENTS) return null;

    const enemy = new Enemy({ id: this._enemyId++ });
    const spawnRadius = opts.nearPlayer ? 9 : 11;
    const angle = Math.random() * Math.PI * 2;
    enemy.root.position.set(
      this.player.root.position.x + Math.sin(angle) * spawnRadius,
      0,
      this.player.root.position.z + Math.cos(angle) * spawnRadius
    );
    enemy.root.rotation.y = angle + Math.PI;

    this.scene.add(enemy.root);
    this.enemies.push(enemy);
    if (!this._hudEnemy || !this._hudEnemy.alive) this._hudEnemy = enemy;
    return enemy;
  }

  _pruneDefeatedEnemies() {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.deathComplete) continue;
      if (this._hudEnemy === enemy) this._hudEnemy = null;
      enemy.dispose();
      this.enemies.splice(i, 1);
    }
  }

  _onResize() {
    this.mobileControls.reset();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Re-apply in case the window moved to a display with a different DPI.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.renderer.setAnimationLoop(null);
      window.removeEventListener('resize', this._onResize);
      window.visualViewport?.removeEventListener('resize', this._onResize);
      this.mobileControls.dispose();
      this.input.dispose();
      this.followCam.dispose();
      this.player.dispose();
      this.enemies.forEach((enemy) => enemy.dispose());
      this.greenCodeBurst.dispose();
      this.world.dispose();
      this.scene.clear();
      this.renderer.dispose();
    }
  }
}
