import * as THREE from 'three';

const HIT_REACTION_DURATION = 0.24;
const DEATH_DURATION = 0.7;
const ORBIT_RADIUS = 5.2;
const STRIKE_RADIUS = 2.05;
const ORBIT_SPEED = 1.9;
const STRIKE_SPEED = 3.4;
const SLOT_ANGULAR_SPEED = 0.45;
const HEAD_VARIANTS = ['black', 'blond', 'brown'];

const HEAD_MATERIALS = {
  black: {
    color: 0x1b1a19,
    roughness: 0.62,
    metalness: 0.05,
  },
  blond: {
    color: 0xd3c08d,
    roughness: 0.68,
    metalness: 0,
  },
  brown: {
    color: 0x8b6748,
    roughness: 0.66,
    metalness: 0,
  },
};

export class Enemy {
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.id = opts.id ?? 0;
    this.headVariant = opts.headVariant ?? HEAD_VARIANTS[(Math.random() * HEAD_VARIANTS.length) | 0];
    this.maxHealth = 3;
    this.health = this.maxHealth;
    this.collisionRadius = 0.7;
    this.alive = true;
    this.spawnedOnLastHit = false;
    this._hitTime = 0;
    this._deathTime = 0;
    this._strikeTimer = 0.45 + Math.random() * 0.8;
    this._strikeTime = 0;
    this._strikeIntensity = 0;
    this._orbitOffset = Math.random() * Math.PI * 2;
    this._desired = new THREE.Vector3();
    this._delta = new THREE.Vector3();
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
      ...HEAD_MATERIALS[this.headVariant],
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

  update(dt, opts = {}) {
    if (this.alive && opts.playerPosition) this._updateMovement(dt, opts);

    if (this.alive && this._hitTime > 0) {
      this._hitTime = Math.max(0, this._hitTime - dt);
      const progress = 1 - this._hitTime / HIT_REACTION_DURATION;
      const recoil = Math.sin(progress * Math.PI);
      this.rig.rotation.x = -recoil * 0.28;
      this.rig.position.z = -recoil * 0.22;
      this._suitMaterial.emissiveIntensity = recoil * 2.8;
    } else if (this.alive) {
      this.rig.rotation.x = -this._strikeIntensity * 0.3;
      this.rig.position.z = this._strikeIntensity * 0.3;
      this._suitMaterial.emissiveIntensity = this._strikeIntensity * 1.5;
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

  _updateMovement(dt, opts) {
    const playerPosition = opts.playerPosition;
    const attacking = !!opts.attacking;
    const orbitIndex = opts.orbitIndex ?? 0;
    const orbitCount = Math.max(1, opts.orbitCount ?? 1);
    const strikeIndex = opts.strikeIndex ?? 0;
    const strikeRadiusBase = opts.strikeRadius ?? STRIKE_RADIUS;

    let desiredRadius = ORBIT_RADIUS;
    let desiredAngle = this._orbitOffset + opts.time * SLOT_ANGULAR_SPEED;

    if (attacking) {
      desiredRadius = strikeRadiusBase + strikeIndex * 0.22;
      desiredAngle = this._orbitOffset;
      this._strikeTimer -= dt;
      if (this._strikeTimer <= 0) {
        this._strikeTime = 0.52;
        this._strikeTimer = 0.9 + Math.random() * 0.8;
      }
    } else {
      const ringFraction = orbitCount > 1 ? orbitIndex / orbitCount : 0;
      desiredAngle += ringFraction * Math.PI * 2;
      this._strikeTimer = Math.max(this._strikeTimer - dt * 0.4, 0.12);
    }

    this._desired.set(
      playerPosition.x + Math.sin(desiredAngle) * desiredRadius,
      0,
      playerPosition.z + Math.cos(desiredAngle) * desiredRadius
    );
    this._delta.subVectors(this._desired, this.root.position);
    this._delta.y = 0;
    const distance = this._delta.length();
    if (distance > 1e-4) {
      const maxStep = (attacking ? STRIKE_SPEED : ORBIT_SPEED) * dt;
      const step = Math.min(maxStep, distance);
      this.root.position.addScaledVector(this._delta, step / distance);
    }

    this._delta.subVectors(playerPosition, this.root.position);
    this._delta.y = 0;
    if (this._delta.lengthSq() > 1e-6) {
      const yaw = Math.atan2(this._delta.x, this._delta.z);
      this.root.rotation.y = dampAngle(this.root.rotation.y, yaw, 8, dt);
    }

    if (this._strikeTime > 0) {
      this._strikeTime = Math.max(0, this._strikeTime - dt);
      const progress = 1 - this._strikeTime / 0.52;
      this._strikeIntensity = Math.sin(progress * Math.PI);
    } else {
      const ease = 1 - Math.pow(0.0001, dt);
      this._strikeIntensity += (0 - this._strikeIntensity) * ease;
    }
  }

  get deathComplete() {
    return !this.alive && this._deathTime >= DEATH_DURATION;
  }

  reset() {
    this.health = this.maxHealth;
    this.alive = true;
    this.spawnedOnLastHit = false;
    this._hitTime = 0;
    this._deathTime = 0;
    this._strikeTimer = 0.45 + Math.random() * 0.8;
    this._strikeTime = 0;
    this._strikeIntensity = 0;
    this._orbitOffset = Math.random() * Math.PI * 2;
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

function dampAngle(current, target, speed, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-speed * dt));
}