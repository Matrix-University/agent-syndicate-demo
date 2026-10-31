import * as THREE from 'three';

const PUFF_COUNT = 8;
const DURATION = 1.1;

export class CarSmoke {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'car-destruction-smoke';
    this.root.visible = false;
    scene.add(this.root);
    const size = 32;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
        const offset = (y * size + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
        pixels[offset + 3] = Math.round(255 * Math.max(0, 1 - radius * radius) ** 2);
      }
    }
    this._texture = new THREE.DataTexture(pixels, size, size);
    this._texture.magFilter = THREE.LinearFilter;
    this._texture.needsUpdate = true;
    this._material = new THREE.SpriteMaterial({
      map: this._texture, color: 0x66706a, transparent: true, opacity: 0, depthWrite: false,
    });
    this._puffs = [];
    this._age = DURATION;
    for (let index = 0; index < PUFF_COUNT; index += 1) {
      const mesh = new THREE.Sprite(this._material);
      this.root.add(mesh);
      const angle = index * Math.PI * 2 / PUFF_COUNT;
      this._puffs.push({
        mesh, x: Math.cos(angle), z: Math.sin(angle),
        rise: 1.4 + (index % 3) * 0.35,
      });
    }
  }

  play(origin) {
    this.root.position.copy(origin);
    this.root.position.y += 0.8;
    this._age = 0;
    this.root.visible = true;
    this.update(0);
  }

  update(dt) {
    if (!this.root.visible) return;
    this._age = Math.min(this._age + dt, DURATION);
    const progress = this._age / DURATION;
    this._material.opacity = 0.4 * (1 - progress) ** 2;
    for (const puff of this._puffs) {
      const spread = 0.35 + progress * 1.2;
      puff.mesh.position.set(puff.x * spread, this._age * puff.rise, puff.z * spread);
      puff.mesh.scale.setScalar(0.6 + progress * 1.3);
    }
    if (this._age >= DURATION) this.reset();
  }

  reset() {
    this._age = DURATION;
    this.root.visible = false;
    this._material.opacity = 0;
  }

  dispose() {
    this.root.removeFromParent();
    this._texture.dispose();
    this._material.dispose();
  }
}
