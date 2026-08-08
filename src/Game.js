import * as THREE from 'three';
import { buildWorld } from './World.js';
import { Player } from './Player.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { Input } from './Input.js';
import { MobileControls } from './MobileControls.js';
import { Enemy } from './Enemy.js';
import { CombatSystem } from './CombatSystem.js';
import { GreenCodeBurst } from './GreenCodeBurst.js';

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
    this.player.root.position.set(0, 0, -42);
    this.scene.add(this.player.root);

    this.enemy = new Enemy();
    this.enemy.root.position.set(0, 0, -35);
    this.enemy.root.rotation.y = Math.PI;
    this.scene.add(this.enemy.root);
    this.combat = new CombatSystem();
    this.greenCodeBurst = new GreenCodeBurst(this.scene);
    this.enemyHealthMeter = document.getElementById('enemy-health-meter');
    this.enemyHealthFill = document.getElementById('enemy-health-fill');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.objective = document.getElementById('objective');
    this._updateEnemyHud();

    this.input = new Input();
    this.followCam = new ThirdPersonCamera(this.camera, this.player.root, canvas);
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
    this.player.update(dt, this.input, this.camera, this.world);
    const hitEnemy = this.combat.update(this.player, this.enemy);
    const defeatedEnemy = hitEnemy && !this.enemy.alive;
    if (hitEnemy) this._updateEnemyHud();
    if (defeatedEnemy) {
      this.greenCodeBurst.play(this.enemy.root.position);
      this.objective.textContent = 'OBJECTIVE // TARGET ELIMINATED';
    }
    this.enemy.update(dt);
    this.greenCodeBurst.update(dt);
    this.followCam.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame(); // clear edge-triggered input after everyone has read it
  }

  _updateEnemyHud() {
    const healthRatio = this.enemy.health / this.enemy.maxHealth;
    this.enemyHealthFill.style.transform = `scaleX(${healthRatio})`;
    this.enemyHealthValue.textContent = `${this.enemy.health} / ${this.enemy.maxHealth}`;
    this.enemyHealthMeter.setAttribute('aria-valuenow', String(this.enemy.health));
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
      this.enemy.dispose();
      this.greenCodeBurst.dispose();
      this.world.dispose();
      this.scene.clear();
      this.renderer.dispose();
    }
  }
}
