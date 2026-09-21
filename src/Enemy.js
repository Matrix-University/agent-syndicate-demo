import * as THREE from 'three';

const HIT_REACTION_DURATION = 0.24;
const DEATH_DURATION = 0.7;
const ORBIT_DRIFT_SPEED = 0.35;
const WINDUP_DURATION = 0.4;
const STRIKE_DURATION = 0.16;
const RECOVER_DURATION = 0.9;
const APPROACH_TIMEOUT = 4;
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
    this.spawnedOnLastHit = false;
    this._hitTime = 0;
    this._deathTime = 0;
    this._disposed = false;

    this.moveSpeed = 3.6;
    this.turnSpeed = 5;
    this.attackRange = 2;
    this.attackDamage = 1;
    this.orbitRadius = 5.5;
    this.orbitAngle = 0;
    this.orbitDir = 1;

    this.manager = null;
    this.aiState = 'orbit';
    this._aiTimer = 0;
    this._hasSlot = false;
    this._strikeHitConsumed = true;

    this._toTarget = new THREE.Vector3();
    this._orbitPoint = new THREE.Vector3();

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
    const limbs = [];
    for (const [x, y] of [[-0.7, 2.35], [0.7, 2.35], [-0.25, 1.32], [0.25, 1.32]]) {
      const limb = new THREE.Mesh(limbGeometry, this._suitMaterial);
      limb.position.set(x, y, 0);
      limb.castShadow = true;
      this.rig.add(limb);
      limbs.push(limb);
    }
    [this.armL, this.armR, this.legL, this.legR] = limbs;
  }

  get attackActive() {
    return this.aiState === 'strike';
  }

  get timeSinceDefeat() {
    return this.alive ? 0 : this._deathTime;
  }

  consumeStrikeHit() {
    const canHit = this.attackActive && !this._strikeHitConsumed;
    if (canHit) this._strikeHitConsumed = true;
    return canHit;
  }

  takeDamage(amount) {
    const acceptsHit = this.alive && amount > 0;
    if (acceptsHit) {
      this.health = Math.max(0, this.health - amount);
      this._hitTime = HIT_REACTION_DURATION;
      this._suitMaterial.emissiveIntensity = 2.8;
      this.aiState = 'recover';
      this._aiTimer = 0;
      this._releaseSlot();
    }
    const defeated = acceptsHit && this.health === 0;
    if (defeated) {
      this.alive = false;
      this._deathTime = 0;
      this.manager?.recordDefeat();
    }
    return acceptsHit;
  }

  update(dt, player, world) {
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
      this._deathTime += dt;
      const progress = Math.min(this._deathTime / DEATH_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.rig.rotation.x = -eased * Math.PI * 0.48;
      this.rig.position.y = -eased * 0.72;
      this._suitMaterial.emissiveIntensity = (1 - progress) * 3.5;
      this.rig.visible = progress < 1;
    }

    if (this.alive && player) this._updateAI(dt, player, world);
  }

  _updateAI(dt, player, world) {
    switch (this.aiState) {
      case 'orbit':
        this._moveToward(this._orbitTarget(player, dt), dt);
        if (this.manager?.requestAttackSlot()) {
          this._hasSlot = true;
          this.aiState = 'approach';
          this._aiTimer = 0;
        }
        break;
      case 'approach': {
        this._aiTimer += dt;
        const distance = this._moveToward(player.root.position, dt, this.attackRange);
        if (distance <= this.attackRange) {
          this.aiState = 'windup';
          this._aiTimer = 0;
        } else if (this._aiTimer >= APPROACH_TIMEOUT) {
          this.aiState = 'orbit';
          this._releaseSlot();
        }
        break;
      }
      case 'windup': {
        this._aiTimer += dt;
        const progress = Math.min(this._aiTimer / WINDUP_DURATION, 1);
        this.armR.rotation.x = -progress * Math.PI * 0.5;
        this._suitMaterial.emissiveIntensity = progress * 1.6;
        if (this._aiTimer >= WINDUP_DURATION) {
          this.aiState = 'strike';
          this._aiTimer = 0;
          this._strikeHitConsumed = false;
        }
        break;
      }
      case 'strike': {
        this._aiTimer += dt;
        const progress = Math.min(this._aiTimer / STRIKE_DURATION, 1);
        this.armR.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.5, Math.PI * 0.35, progress);
        this._suitMaterial.emissiveIntensity = 2.4;
        if (this._aiTimer >= STRIKE_DURATION) {
          this.aiState = 'recover';
          this._aiTimer = 0;
          this._releaseSlot();
        }
        break;
      }
      case 'recover': {
        this._aiTimer += dt;
        this._moveToward(this._orbitTarget(player, dt), dt);
        const ease = 1 - Math.pow(0.0001, dt);
        this.armR.rotation.x *= 1 - ease;
        if (this._aiTimer >= RECOVER_DURATION) this.aiState = 'orbit';
        break;
      }
    }

    this._faceTarget(player.root.position, dt);
    world?.collide(this.root.position, this.collisionRadius);
  }

  _releaseSlot() {
    if (!this._hasSlot) return;
    this._hasSlot = false;
    this.manager?.releaseAttackSlot();
  }

  _orbitTarget(player, dt) {
    this.orbitAngle += this.orbitDir * ORBIT_DRIFT_SPEED * dt;
    return this._orbitPoint.set(
      player.root.position.x + Math.sin(this.orbitAngle) * this.orbitRadius,
      0,
      player.root.position.z + Math.cos(this.orbitAngle) * this.orbitRadius
    );
  }

  _moveToward(target, dt, stopRadius = 0) {
    this._toTarget.subVectors(target, this.root.position);
    this._toTarget.y = 0;
    const distance = this._toTarget.length();
    if (distance > stopRadius && distance > 1e-4) {
      const step = Math.min(this.moveSpeed * dt, distance - stopRadius);
      this.root.position.addScaledVector(this._toTarget, step / distance);
    }
    return distance;
  }

  _faceTarget(target, dt) {
    this._toTarget.subVectors(target, this.root.position);
    this._toTarget.y = 0;
    if (this._toTarget.lengthSq() < 1e-6) return;
    const targetYaw = Math.atan2(this._toTarget.x, this._toTarget.z);
    this.root.rotation.y = dampAngle(this.root.rotation.y, targetYaw, this.turnSpeed, dt);
  }

  reset() {
    this.health = this.maxHealth;
    this.alive = true;
    this.spawnedOnLastHit = false;
    this._hitTime = 0;
    this._deathTime = 0;
    this.rig.visible = true;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this._suitMaterial.emissiveIntensity = 0;
    this.aiState = 'orbit';
    this._aiTimer = 0;
    this._hasSlot = false;
    this._strikeHitConsumed = true;
    this.armR.rotation.x = 0;
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