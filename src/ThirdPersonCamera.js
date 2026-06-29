import * as THREE from 'three';

// Third-person orbit camera. The mouse (pointer-lock) drives yaw/pitch around the
// player; the rig trails at a fixed distance while the player turns to face its
// own direction of travel independently. Movement basis still comes from
// camera.getWorldDirection() in Player, so steering the camera steers movement.
export class ThirdPersonCamera {
  constructor(camera, target, domElement) {
    this.camera = camera;
    this.target = target; // an Object3D to follow (the player root)
    this.domElement = domElement;

    this.distance = 13;
    this.yaw = Math.PI;   // start behind the player (which faces +Z at spawn)
    this.pitch = 0.35;    // radians above the horizon
    this.minPitch = -0.15;
    this.maxPitch = 1.2;
    this.sensitivity = 0.0024;
    this.lookOffset = new THREE.Vector3(0, 2.6, 0); // aim at the upper torso

    // Scratch vectors reused each frame (no per-frame allocation).
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._offset = new THREE.Vector3();

    // Pointer lock: click the canvas to capture the mouse, Esc to release.
    this._onClick = () => {
      if (document.pointerLockElement !== domElement) {
        const p = domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => {}); // some browsers return a promise
      }
    };
    this._onMouseMove = (e) => {
      if (document.pointerLockElement !== domElement) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + e.movementY * this.sensitivity, this.minPitch, this.maxPitch
      );
    };
    domElement.addEventListener('click', this._onClick);
    document.addEventListener('mousemove', this._onMouseMove);
  }

  update(dt) {
    // Spherical offset from yaw/pitch, scaled by distance.
    const cosP = Math.cos(this.pitch);
    this._offset
      .set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP)
      .multiplyScalar(this.distance);

    this._look.copy(this.target.position).add(this.lookOffset);
    this._desired.copy(this._look).add(this._offset);

    // Critically-damped-ish smoothing (frame-rate independent).
    const lerp = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(this._desired, lerp);
    this.camera.lookAt(this._look);
  }

  dispose() {
    this.domElement.removeEventListener('click', this._onClick);
    document.removeEventListener('mousemove', this._onMouseMove);
  }
}
