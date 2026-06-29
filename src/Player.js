import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { AnimationController, STATE } from './AnimationController.js';

// The playable character.
//   root  -> moves through the world (this is what the camera follows)
//   rig   -> the visible body; a Quaternius CC0 GLB when present, else primitives
//
// Player owns movement + vertical physics and decides intent (locomotion state,
// punch, jump); all clip/mixer work lives in AnimationController. The procedural
// placeholder is built first and swapped out when (if) the model loads, so the
// project keeps running with zero external assets.
export class Player {
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    // Character model config (drop a Quaternius CC0 GLB in public/models/).
    this.modelUrl = opts.modelUrl ?? null;        // e.g. '/models/agent-dcl.glb'
    // Optional clip library on the SAME rig (e.g. Quaternius Universal Animation
    // Library). Its clips bind to the character by matching bone names, so the
    // character GLB itself needs no animations. Null => use embedded clips.
    this.animationUrl = opts.animationUrl ?? null;
    this.modelScale = opts.modelScale ?? 1;  // tune so the body is ~3 units tall
    this.modelYaw = opts.modelYaw ?? 0;      // set Math.PI if the model faces -Z

    this.speedWalk = 6;
    this.speedSprint = 11;
    this.turnSpeed = 9; // higher = snappier turning toward movement direction
    this.velocity = new THREE.Vector3();

    // Vertical movement (jump). Floor is y = 0; airtime ≈ 2·jumpSpeed/gravity.
    this.gravity = 26;
    this.jumpSpeed = 11;
    this.velocityY = 0;
    this.grounded = true;
    this.state = STATE.IDLE;
    this._t = 0; // animation clock (placeholder only)

    // Scratch vectors reused each frame (avoid per-frame allocation).
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this.anim = null; // AnimationController, set once a model loads

    this._buildPlaceholderRig();
    if (this.modelUrl) this._loadCharacter();
  }

  // ---------------------------------------------------------------------------
  // Placeholder humanoid built from primitives so the project runs with no
  // external assets. Replaced by the GLB in _loadCharacter when one is present.
  // ---------------------------------------------------------------------------
  _buildPlaceholderRig() {
    this.placeholder = new THREE.Group();
    this.rig.add(this.placeholder);

    const skin = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6, metalness: 0.2 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x39ff14, roughness: 0.4, emissive: 0x0c3a06, emissiveIntensity: 0.8,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 6, 12), skin);
    torso.position.y = 2.0;
    torso.castShadow = true;
    this.placeholder.add(torso);
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), skin);
    head.position.y = 3.1;
    head.castShadow = true;
    this.placeholder.add(head);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.08), accent);
    tie.position.set(0, 2.1, 0.5);
    this.placeholder.add(tie);

    // Shared limb geometry, pivoted at its TOP so limbs swing from shoulder/hip.
    const limbGeo = new THREE.CapsuleGeometry(0.18, 0.9, 4, 8);
    limbGeo.translate(0, -0.65, 0);
    const mkLimb = (x, y) => {
      const m = new THREE.Mesh(limbGeo, skin);
      m.position.set(x, y, 0);
      m.castShadow = true;
      this.placeholder.add(m);
      return m;
    };
    this.armL = mkLimb(-0.78, 2.55);
    this.armR = mkLimb(0.78, 2.55);
    this.legL = mkLimb(-0.28, 1.45);
    this.legR = mkLimb(0.28, 1.45);
  }

  // ---------------------------------------------------------------------------
  // Load a rigged GLB and hand its clips to an AnimationController, then dispose
  // the placeholder. On failure we keep the placeholder so the game still runs.
  // Movement (root) is untouched — only the visible rig changes.
  // ---------------------------------------------------------------------------
  async _loadCharacter() {
    const loader = new GLTFLoader();
    // Decode Draco-compressed GLBs (e.g. the baked agent-dcl.glb shared with DCL).
    // Harmless for uncompressed files. Decoder is self-hosted in public/draco/.
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    loader.setDRACOLoader(draco);

    let gltf;
    try {
      gltf = await loader.loadAsync(this.modelUrl);
    } catch (err) {
      console.warn(`Player: could not load "${this.modelUrl}", using placeholder.`, err);
      draco.dispose();
      return;
    }

    const model = gltf.scene;
    model.scale.setScalar(this.modelScale);
    model.rotation.y = this.modelYaw;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    // Clips: prefer an external library on the same rig; otherwise use whatever is
    // embedded. Library clips bind to this model's skeleton by bone name.
    let clips = gltf.animations;
    if (this.animationUrl) {
      try {
        const lib = await loader.loadAsync(this.animationUrl);
        if (lib.animations.length) clips = lib.animations;
      } catch (err) {
        console.warn(`Player: could not load animation library "${this.animationUrl}".`, err);
      }
    }
    draco.dispose(); // decoding done — free the Draco worker pool

    // Swap the visible body: drop the primitives, mount the model.
    this.rig.remove(this.placeholder);
    disposeObject(this.placeholder);
    this.placeholder = null;
    this.torso = this.armL = this.armR = this.legL = this.legR = null;
    this.rig.add(model);

    if (!clips.length) {
      console.warn(
        `Player: "${this.modelUrl}" is rigged but has no animation clips — the ` +
        `character will stand still. Provide an animationUrl on the same rig, or ` +
        `export the GLB with Idle/Walk/Run clips embedded (see public/models/README.md).`
      );
    }

    this.anim = new AnimationController(model, clips);
  }

  // ---------------------------------------------------------------------------
  update(dt, input, camera) {
    // Movement basis: camera forward & right, flattened onto the ground plane.
    camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    this._right.crossVectors(this._forward, this._up).normalize();

    this._move.set(0, 0, 0);
    this._move.addScaledVector(this._forward, input.moveZ);
    this._move.addScaledVector(this._right, input.moveX);

    const moving = this._move.lengthSq() > 1e-4;
    if (moving) this._move.normalize();

    // Horizontal movement — rooted while a blocking action (punch) plays.
    const rooted = this.anim ? this.anim.acting : false;
    const speed = input.sprint ? this.speedSprint : this.speedWalk;
    this.velocity.copy(this._move).multiplyScalar(moving && !rooted ? speed : 0);
    this.root.position.addScaledVector(this.velocity, dt);

    // Vertical movement: jump impulse + gravity, floor at y = 0. Jump from the
    // ground only and not mid-action; `jumpPressed` is already edge-detected.
    let justTookOff = false;
    if (input.jumpPressed && this.grounded && !rooted) {
      this.velocityY = this.jumpSpeed;
      this.grounded = false;
      justTookOff = true;
    }
    this.velocityY -= this.gravity * dt;
    this.root.position.y += this.velocityY * dt;
    let justLanded = false;
    if (this.root.position.y <= 0) {
      this.root.position.y = 0;
      this.velocityY = 0;
      if (!this.grounded) justLanded = true;
      this.grounded = true;
    }

    // Face the direction of travel.
    if (moving && !rooted) {
      const targetYaw = Math.atan2(this._move.x, this._move.z);
      this.root.rotation.y = dampAngle(this.root.rotation.y, targetYaw, this.turnSpeed, dt);
    }

    this.state = moving ? (input.sprint ? STATE.RUN : STATE.WALK) : STATE.IDLE;

    if (this.anim) {
      if (justTookOff) this.anim.jumpTakeoff();
      else if (justLanded) this.anim.jumpLand();
      if (input.punchPressed) this.anim.playAction('punch');
      // setLocomotion is a no-op while the controller is airborne/acting.
      this.anim.setLocomotion(this.state, speed / this.speedWalk);
      this.anim.update(dt);
    } else {
      this._animate(dt, moving ? (input.sprint ? 1.6 : 1.0) : 0);
    }
  }

  dispose() {
    this.anim?.dispose();
    if (this.placeholder) disposeObject(this.placeholder);
  }

  // Procedural stand-in used only while the placeholder rig is showing (no GLB,
  // or it failed to load). Real clips are driven by the AnimationController above.
  _animate(dt, intensity) {
    if (this.state === STATE.RUN || this.state === STATE.WALK) {
      this._t += dt * (6 + intensity * 6);
      const swing = Math.sin(this._t) * 0.8 * intensity;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.x = swing;
      this.torso.position.y = 2.0 + Math.abs(Math.sin(this._t)) * 0.06;
    } else {
      this._t += dt;
      const k = 1 - Math.pow(0.0001, dt); // ease limbs back to rest
      this.legL.rotation.x *= 1 - k;
      this.legR.rotation.x *= 1 - k;
      this.armL.rotation.x *= 1 - k;
      this.armR.rotation.x *= 1 - k;
      this.torso.position.y = 2.0 + Math.sin(this._t * 1.5) * 0.03; // breathing
    }
  }
}

// Rotate `current` toward `target` (radians) at a smooth, frame-rate-independent rate.
function dampAngle(current, target, speed, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-speed * dt));
}

// Free GPU memory for a subtree's geometries and materials (Object3D.remove does
// not). Geometries/materials shared across meshes are disposed once.
function disposeObject(obj) {
  const geometries = new Set();
  const materials = new Set();
  obj.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
