import * as THREE from 'three';
import { buildWorld } from './World.js';
import { Player } from './Player.js';
import { ThirdPersonCamera } from './ThirdPersonCamera.js';
import { Input } from './Input.js';

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
    this.scene.add(this.player.root);

    this.followCam = new ThirdPersonCamera(this.camera, this.player.root, canvas);
    this.input = new Input();
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this._onResize());
    this._loop = this._loop.bind(this);
  }

  start() {
    this.renderer.setAnimationLoop(this._loop);
  }

  _loop() {
    // Clamp dt so a paused/backgrounded tab doesn't teleport the player.
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.player.update(dt, this.input, this.camera, this.world);
    this.followCam.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame(); // clear edge-triggered input after everyone has read it
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Re-apply in case the window moved to a display with a different DPI.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
