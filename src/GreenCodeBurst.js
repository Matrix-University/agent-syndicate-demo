import * as THREE from 'three';

const PARTICLE_COUNT = 72;
const BURST_DURATION = 1.15;

export class GreenCodeBurst {
  constructor(scene) {
    this._positions = new Float32Array(PARTICLE_COUNT * 3);
    this._velocities = new Float32Array(PARTICLE_COUNT * 3);
    this._geometry = new THREE.BufferGeometry();
    this._positionAttribute = new THREE.BufferAttribute(this._positions, 3);
    this._geometry.setAttribute('position', this._positionAttribute);
    this._material = new THREE.PointsMaterial({
      color: 0x39ff14,
      size: 0.13,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._points = new THREE.Points(this._geometry, this._material);
    this._points.frustumCulled = false;
    this._points.visible = false;
    scene.add(this._points);

    this._active = false;
    this._age = BURST_DURATION;
  }

  play(origin) {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.55;
      const speed = 1.5 + Math.random() * 4.5;
      this._positions[offset] = origin.x + Math.cos(angle) * radius;
      this._positions[offset + 1] = origin.y + 0.5 + Math.random() * 2.8;
      this._positions[offset + 2] = origin.z + Math.sin(angle) * radius;
      this._velocities[offset] = Math.cos(angle) * speed;
      this._velocities[offset + 1] = 2.5 + Math.random() * 5.5;
      this._velocities[offset + 2] = Math.sin(angle) * speed;
    }

    this._positionAttribute.needsUpdate = true;
    this._material.opacity = 1;
    this._points.visible = true;
    this._active = true;
    this._age = 0;
  }

  update(dt) {
    if (this._active) {
      this._age = Math.min(this._age + dt, BURST_DURATION);
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        const offset = index * 3;
        this._velocities[offset + 1] -= 11 * dt;
        this._positions[offset] += this._velocities[offset] * dt;
        this._positions[offset + 1] += this._velocities[offset + 1] * dt;
        this._positions[offset + 2] += this._velocities[offset + 2] * dt;
      }
      this._positionAttribute.needsUpdate = true;
      this._material.opacity = 1 - this._age / BURST_DURATION;
    }
    const expired = this._active && this._age >= BURST_DURATION;
    if (expired) {
      this._active = false;
      this._points.visible = false;
    }
  }

  dispose() {
    this._points.removeFromParent();
    this._geometry.dispose();
    this._material.dispose();
  }
}