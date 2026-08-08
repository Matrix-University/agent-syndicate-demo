import * as THREE from 'three';

const TOUCH_CAMERA_ZONE_START = 0.45;

// Third-person orbit camera. The mouse (pointer-lock) drives yaw/pitch around the
// player; the rig trails at a fixed distance while the player turns to face its
// own direction of travel independently. Movement basis still comes from
// camera.getWorldDirection() in Player, so steering the camera steers movement.
export class ThirdPersonCamera {
  constructor(camera, target, domElement) {
    this.camera = camera;
    this.target = target; // an Object3D to follow (the player root)
    this.domElement = domElement;

    this.distance = 11;
    this.yaw = Math.PI;   // start behind the player (which faces +Z at spawn)
    this.pitch = 0.22;    // stays below the garage's low ceiling
    this.minPitch = -0.15;
    this.maxPitch = 0.34;
    this.sensitivity = 0.0024;
    this.lookOffset = new THREE.Vector3(0, 2.6, 0); // aim at the upper torso

    // Scratch vectors reused each frame (no per-frame allocation).
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._cameraPointerId = null;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._lastCanvasPointerType = null;

    // Pointer lock: click the canvas to capture the mouse, Esc to release.
    this._onClick = () => {
      if (this._lastCanvasPointerType === 'mouse' && document.pointerLockElement !== domElement) {
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
    this._onPointerDown = (event) => {
      this._lastCanvasPointerType = event.pointerType;
      const isTouchOrbit = (event.pointerType === 'touch' || event.pointerType === 'pen') &&
        event.target === domElement &&
        event.clientX >= domElement.clientWidth * TOUCH_CAMERA_ZONE_START;

      if (isTouchOrbit && this._cameraPointerId === null) {
        this._cameraPointerId = event.pointerId;
        this._lastPointerX = event.clientX;
        this._lastPointerY = event.clientY;
        domElement.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    };
    this._onPointerMove = (event) => {
      if (event.pointerId === this._cameraPointerId) {
        const movementX = event.clientX - this._lastPointerX;
        const movementY = event.clientY - this._lastPointerY;
        this._lastPointerX = event.clientX;
        this._lastPointerY = event.clientY;
        this.yaw -= movementX * this.sensitivity;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch + movementY * this.sensitivity, this.minPitch, this.maxPitch
        );
        event.preventDefault();
      }
    };
    this._onPointerEnd = (event) => {
      if (event.pointerId === this._cameraPointerId) this._cameraPointerId = null;
    };
    this._onBlur = () => { this._cameraPointerId = null; };

    domElement.addEventListener('click', this._onClick);
    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerEnd);
    domElement.addEventListener('pointercancel', this._onPointerEnd);
    domElement.addEventListener('lostpointercapture', this._onPointerEnd);
    document.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
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
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerEnd);
    this.domElement.removeEventListener('pointercancel', this._onPointerEnd);
    this.domElement.removeEventListener('lostpointercapture', this._onPointerEnd);
    document.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
    this._cameraPointerId = null;
  }
}
