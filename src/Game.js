import * as THREE from 'three';
import { buildWorld } from './World.js';
import { Player } from './Player.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { Input } from './Input.js';
import { MobileControls } from './MobileControls.js';
import { EnemyManager } from './EnemyManager.js';
import { CombatSystem } from './CombatSystem.js';
import { GreenCodeBurst } from './GreenCodeBurst.js';

const PLAYER_SPAWN = new THREE.Vector3(-27.5, 0, 51);
const PLAYER_SPAWN_YAW = Math.PI;
const ENEMY_SPAWN_CENTER = new THREE.Vector3(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z - 10);
const ENEMY_COUNT = 5;
const PLAYER_HEALTH_PER_ENEMY = 5;
const DEATH_FLASH_IN = 0.3;
const DEATH_REVEAL_DELAY = 0.9;
const DEATH_FLASH_OUT = 0.7;

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
      maxHealth: ENEMY_COUNT * PLAYER_HEALTH_PER_ENEMY,
    });
    this.player.root.position.copy(PLAYER_SPAWN);
    this.player.root.rotation.y = PLAYER_SPAWN_YAW;
    this.scene.add(this.player.root);

    this.combat = new CombatSystem();
    this.greenCodeBurst = new GreenCodeBurst(this.scene);
    this.enemyManager = new EnemyManager(ENEMY_COUNT, ENEMY_SPAWN_CENTER);
    this.enemyManager.addAll(this.scene);
    this._focusEnemy = null;

    this.enemyHealthMeter = document.getElementById('enemy-health-meter');
    this.enemyHealthFill = document.getElementById('enemy-health-fill');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.playerHealthMeter = document.getElementById('player-health-meter');
    this.playerHealthFill = document.getElementById('player-health-fill');
    this.playerHealthValue = document.getElementById('player-health-value');
    this.objective = document.getElementById('objective');
    this.damageFlash = document.getElementById('damage-flash');
    this.gameOverPanel = document.getElementById('game-over');
    this.gameOverScore = document.getElementById('game-over-score');
    this.gameOver = false;
    this._downTime = 0;
    this._lastFlash = 0;
    this._updateEnemyHud();
    this._updatePlayerHud();

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
    this._idleInput = {
      moveX: 0,
      moveZ: 0,
      sprint: false,
      jumpPressed: false,
      punchPressed: false,
    };
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
    const canRetry = this.gameOver && !this.gameOverPanel.hidden;
    if (canRetry && (this.input.restartPressed || this.input.punchPressed)) this._restart();

    this.player.update(
      dt,
      this.gameOver ? this._idleInput : this.input,
      this.camera,
      this.world
    );
    const respawned = this.enemyManager.update(dt, this.player, this.world);

    if (!this.gameOver) {
      const preferredEnemy = this._focusEnemy?.alive ? this._focusEnemy : null;
      const result = this.combat.update(
        this.player,
        this.enemyManager.enemies,
        preferredEnemy
      );
      if (result.hitEnemy) {
        this._focusEnemy = result.hitEnemy;
        if (result.hitEnemy.health === 1 && !result.hitEnemy.spawnedOnLastHit) {
          result.hitEnemy.spawnedOnLastHit = true;
          this.enemyManager.addReinforcement(this.player, this.world);
        }
        this._updateEnemyHud();
      }
      if (result.defeatedEnemy) this.greenCodeBurst.play(result.hitEnemy.root.position);
      if (result.playerHit) this._updatePlayerHud();
      if (this.player.health === 0) this._endGame();
      this.world.collide(this.player.root.position, this.player.collisionRadius);
    }
    if (respawned) this._updateEnemyHud();

    this._updateDeathFade(dt);
    this.greenCodeBurst.update(dt);
    this.followCam.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame(); // clear edge-triggered input after everyone has read it
  }

  _updateEnemyHud() {
    let health = 0;
    let maxHealth = 0;
    for (const enemy of this.enemyManager.enemies) {
      health += enemy.health;
      maxHealth += enemy.maxHealth;
    }
    const healthRatio = maxHealth > 0 ? health / maxHealth : 0;
    this.enemyHealthFill.style.transform = `scaleX(${healthRatio})`;
    this.enemyHealthValue.textContent =
      `${this.enemyManager.aliveCount} ACTIVE / ${this.enemyManager.defeated} DOWN`;
    this.enemyHealthMeter.setAttribute('aria-valuenow', String(health));
    this.enemyHealthMeter.setAttribute('aria-valuemax', String(maxHealth));
    this.objective.textContent =
      `OBJECTIVE // SURVIVE CROWD (${this.enemyManager.aliveCount} ACTIVE, ` +
      `${this.enemyManager.maxAttackers} ATTACK SLOTS)`;
  }

  _updatePlayerHud() {
    const { health, maxHealth } = this.player;
    this.playerHealthFill.style.transform = `scaleX(${health / maxHealth})`;
    this.playerHealthValue.textContent = `${health} / ${maxHealth}`;
    this.playerHealthMeter.setAttribute('aria-valuenow', String(health));
    this.playerHealthMeter.setAttribute('aria-valuemax', String(maxHealth));
  }

  _endGame() {
    this.gameOver = true;
    this._downTime = 0;
    const count = this.enemyManager.defeated;
    this.gameOverScore.textContent =
      `${count} ${count === 1 ? 'AGENT' : 'AGENTS'} NEUTRALIZED`;
  }

  _restart() {
    this.gameOver = false;
    this._downTime = 0;
    this._lastFlash = 0;
    this.damageFlash.style.opacity = '0';
    this.gameOverPanel.hidden = true;
    this.player.reset();
    this.player.root.position.copy(PLAYER_SPAWN);
    this.player.root.rotation.y = PLAYER_SPAWN_YAW;
    this.enemyManager.reset(ENEMY_SPAWN_CENTER);
    this._focusEnemy = null;
    this._updateEnemyHud();
    this._updatePlayerHud();
  }

  _updateDeathFade(dt) {
    if (!this.gameOver) return;
    this._downTime += dt;
    const rampIn = Math.min(this._downTime / DEATH_FLASH_IN, 1);
    const fadeOut = Math.min(
      Math.max(this._downTime - DEATH_REVEAL_DELAY, 0) / DEATH_FLASH_OUT,
      1
    );
    const intensity = rampIn * (1 - fadeOut);
    if (intensity !== this._lastFlash) {
      this._lastFlash = intensity;
      this.damageFlash.style.opacity = (intensity * 0.75).toFixed(3);
    }
    if (this._downTime >= DEATH_REVEAL_DELAY) this.gameOverPanel.hidden = false;
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
      this.enemyManager.dispose();
      this.greenCodeBurst.dispose();
      this.world.dispose();
      this.scene.clear();
      this.renderer.dispose();
    }
  }
}
