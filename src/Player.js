import * as THREE from 'three';

const STATE = { IDLE: 'idle', RUN: 'run' };

// The playable character.
//   root  -> moves through the world (this is what the camera follows)
//   rig   -> the visible body; this is the part you'll replace with a Mixamo model
export class Player {
  constructor() {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.speedWalk = 6;
    this.speedSprint = 11;
    this.turnSpeed = 9; // higher = snappier turning toward movement direction
    this.velocity = new THREE.Vector3();
    this.state = STATE.IDLE;
    this._t = 0; // animation clock

    // Scratch vectors reused each frame (avoid per-frame allocation).
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this._buildPlaceholderRig();
  }

  // ---------------------------------------------------------------------------
  // Placeholder humanoid built from primitives so the project runs with no
  // external assets. Replace this whole method with a Mixamo model + an
  // AnimationMixer (see README "Swapping in a Mixamo character").
  // ---------------------------------------------------------------------------
  _buildPlaceholderRig() {
    const skin = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6, metalness: 0.2 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x39ff14, roughness: 0.4, emissive: 0x0c3a06, emissiveIntensity: 0.8,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 6, 12), skin);
    torso.position.y = 2.0;
    torso.castShadow = true;
    this.rig.add(torso);
    this.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), skin);
    head.position.y = 3.1;
    head.castShadow = true;
    this.rig.add(head);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.08), accent);
    tie.position.set(0, 2.1, 0.5);
    this.rig.add(tie);

    // Shared limb geometry, pivoted at its TOP so limbs swing from shoulder/hip.
    const limbGeo = new THREE.CapsuleGeometry(0.18, 0.9, 4, 8);
    limbGeo.translate(0, -0.65, 0);
    const mkLimb = (x, y) => {
      const m = new THREE.Mesh(limbGeo, skin);
      m.position.set(x, y, 0);
      m.castShadow = true;
      this.rig.add(m);
      return m;
    };
    this.armL = mkLimb(-0.78, 2.55);
    this.armR = mkLimb(0.78, 2.55);
    this.legL = mkLimb(-0.28, 1.45);
    this.legR = mkLimb(0.28, 1.45);
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

    const speed = input.sprint ? this.speedSprint : this.speedWalk;
    this.velocity.copy(this._move).multiplyScalar(moving ? speed : 0);
    this.root.position.addScaledVector(this.velocity, dt);

    // Face the direction of travel.
    if (moving) {
      const targetYaw = Math.atan2(this._move.x, this._move.z);
      this.root.rotation.y = dampAngle(this.root.rotation.y, targetYaw, this.turnSpeed, dt);
    }

    // Animation state machine. Currently two states; ATTACK etc. slot in here.
    this.state = moving ? STATE.RUN : STATE.IDLE;
    this._animate(dt, moving ? (input.sprint ? 1.6 : 1.0) : 0);
  }

  // Procedural stand-in for real animation clips. When you move to Mixamo,
  // this becomes: pick the clip for `this.state`, crossfade, and let the
  // AnimationMixer drive the bones instead of these manual rotations.
  _animate(dt, intensity) {
    if (this.state === STATE.RUN) {
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
