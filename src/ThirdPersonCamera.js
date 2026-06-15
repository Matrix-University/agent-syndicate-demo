import * as THREE from 'three';

// A smooth follow camera that trails behind the target's facing direction.
// Swap to a mouse-orbit rig later if you want manual camera control.
export class ThirdPersonCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target; // an Object3D to follow (the player root)
    this.offset = new THREE.Vector3(0, 7, -11); // behind & above, in target space
    this.lookOffset = new THREE.Vector3(0, 2.6, 0);
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  update(dt) {
    // Desired position: offset rotated by the target's yaw, then placed at target.
    this._desired.copy(this.offset);
    this._desired.applyQuaternion(this.target.quaternion);
    this._desired.add(this.target.position);

    // Critically-damped-ish smoothing (frame-rate independent).
    const lerp = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(this._desired, lerp);

    this._look.copy(this.target.position).add(this.lookOffset);
    this.camera.lookAt(this._look);
  }
}
