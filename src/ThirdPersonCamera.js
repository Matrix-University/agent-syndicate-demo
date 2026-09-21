import * as THREE from 'three';

const TOUCH_CAMERA_ZONE_START = 0.45;
const AUTO_FOLLOW_SPEED = 3.5;
const MANUAL_ORBIT_DELAY = 1.25;

// Third-person orbit camera. The mouse (pointer-lock) drives yaw/pitch around the
// player; the rig trails at a fixed distance while the player turns to face its
// own direction of travel independently. Movement basis still comes from
// camera.getWorldDirection() in Player, so steering the camera steers movement.
export class ThirdPersonCamera {
  constructor(camera, target, domElement, opts = {}) {
    this.camera = camera;
    this.target = target; // an Object3D to follow (the player root)
    this.domElement = domElement;

    this.distance = 11;
    this.yaw = 0;         // start behind the player (which faces -Z at spawn)
    this.pitch = 0.22;    // stays below the garage's low ceiling
    this.minPitch = -0.15;
    this.maxPitch = 0.34;
    this.sensitivity = 0.0024;
    this.lookOffset = new THREE.Vector3(0, 2.6, 0); // aim at the upper torso

    // Scratch vectors reused each frame (no per-frame allocation).
    this._desired = new THREE.Vector3();
    this._desiredClamped = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._cameraPointerId = null;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._lastCanvasPointerType = null;
    this._manualOrbitTime = 0;
    this._bounds = opts.bounds ?? null;

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
      this._manualOrbitTime = MANUAL_ORBIT_DELAY;
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
        this._manualOrbitTime = MANUAL_ORBIT_DELAY;
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

  update(dt, isTargetMoving = false) {
    this._manualOrbitTime = Math.max(0, this._manualOrbitTime - dt);
    if (isTargetMoving && this._manualOrbitTime === 0) {
      const followYaw = this.target.rotation.y + Math.PI;
      this.yaw = dampAngle(this.yaw, followYaw, AUTO_FOLLOW_SPEED, dt);
    }

    // Spherical offset from yaw/pitch, scaled by distance.
    const cosP = Math.cos(this.pitch);
    this._offset
      .set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP)
      .multiplyScalar(this.distance);

    this._look.copy(this.target.position).add(this.lookOffset);
    this._desired.copy(this._look).add(this._offset);
    this._clampPointToBounds(this._desired, this._desiredClamped);

    // Critically-damped-ish smoothing (frame-rate independent).
    const lerp = 1 - Math.pow(0.0008, dt);
    this.camera.position.lerp(this._desiredClamped, lerp);
    this._clampPointToBounds(this.camera.position, this.camera.position);
    this.camera.lookAt(this._look);
  }

  _clampPointToBounds(source, out) {
    if (!this._bounds) {
      out.copy(source);
      return;
    }

    out.set(
      THREE.MathUtils.clamp(source.x, this._bounds.minX, this._bounds.maxX),
      THREE.MathUtils.clamp(source.y, this._bounds.minY, this._bounds.maxY),
      THREE.MathUtils.clamp(source.z, this._bounds.minZ, this._bounds.maxZ)
    );
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

function dampAngle(current, target, speed, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-speed * dt));
}
