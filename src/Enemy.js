import * as THREE from 'three';

const HIT_REACTION_DURATION = 0.24;
const DEATH_DURATION = 0.7;

export class Enemy {
  constructor() {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.maxHealth = 3;
    this.health = this.maxHealth;
    this.collisionRadius = 0.7;
    this.alive = true;
    this._hitTime = 0;
    this._deathTime = 0;
    this._disposed = false;

    this._buildPlaceholderRig();
  }

  _buildPlaceholderRig() {
    this._suitMaterial = new THREE.MeshStandardMaterial({
      color: 0x111613,
      emissive: 0x39ff14,
      emissiveIntensity: 0,
      roughness: 0.62,
      metalness: 0.16,
    });
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8ddd8,
      roughness: 0.72,
      metalness: 0,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0x39ff14,
      emissive: 0x0c3a06,
      emissiveIntensity: 1.2,
      roughness: 0.4,
      metalness: 0.1,
    });

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1, 6, 12),
      this._suitMaterial
    );
    torso.position.y = 1.85;
    torso.castShadow = true;
    this.rig.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 16),
      shirtMaterial
    );
    head.position.y = 2.92;
    head.castShadow = true;
    this.rig.add(head);

    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.72, 0.06),
      accentMaterial
    );
    tie.position.set(0, 1.95, 0.47);
    this.rig.add(tie);

    const limbGeometry = new THREE.CapsuleGeometry(0.16, 0.78, 4, 8);
    limbGeometry.translate(0, -0.57, 0);
    for (const [x, y] of [[-0.7, 2.35], [0.7, 2.35], [-0.25, 1.32], [0.25, 1.32]]) {
      const limb = new THREE.Mesh(limbGeometry, this._suitMaterial);
      limb.position.set(x, y, 0);
      limb.castShadow = true;
      this.rig.add(limb);
    }
  }

  takeDamage(amount) {
    const acceptsHit = this.alive && amount > 0;
    if (acceptsHit) {
      this.health = Math.max(0, this.health - amount);
      this._hitTime = HIT_REACTION_DURATION;
      this._suitMaterial.emissiveIntensity = 2.8;
    }
    const defeated = acceptsHit && this.health === 0;
    if (defeated) {
      this.alive = false;
      this._deathTime = 0;
    }
    return acceptsHit;
  }

  update(dt) {
    if (this.alive && this._hitTime > 0) {
      this._hitTime = Math.max(0, this._hitTime - dt);
      const progress = 1 - this._hitTime / HIT_REACTION_DURATION;
      const recoil = Math.sin(progress * Math.PI);
      this.rig.rotation.x = -recoil * 0.28;
      this.rig.position.z = -recoil * 0.22;
      this._suitMaterial.emissiveIntensity = recoil * 2.8;
    } else if (this.alive) {
      const ease = 1 - Math.pow(0.0001, dt);
      this.rig.rotation.x *= 1 - ease;
      this.rig.position.z *= 1 - ease;
      this._suitMaterial.emissiveIntensity *= 1 - ease;
    } else {
      this._deathTime = Math.min(this._deathTime + dt, DEATH_DURATION);
      const progress = this._deathTime / DEATH_DURATION;
      const eased = 1 - Math.pow(1 - progress, 3);
      this.rig.rotation.x = -eased * Math.PI * 0.48;
      this.rig.position.y = -eased * 0.72;
      this._suitMaterial.emissiveIntensity = (1 - progress) * 3.5;
      this.rig.visible = progress < 1;
    }
  }

  reset() {
    this.health = this.maxHealth;
    this.alive = true;
    this._hitTime = 0;
    this._deathTime = 0;
    this.rig.visible = true;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this._suitMaterial.emissiveIntensity = 0;
  }

  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.root.removeFromParent();
      disposeObject(this.root);
    }
  }
}

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      const childMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      childMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}