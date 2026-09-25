import * as THREE from 'three';
import { AgentKit } from './AgentKit.js';

const HIT_REACTION_DURATION = 0.24;
const DEATH_DURATION = 0.7;
const ORBIT_DRIFT_SPEED = 0.35;
const WINDUP_DURATION = 0.4;
const STRIKE_DURATION = 0.16;
const RECOVER_DURATION = 0.9;
const APPROACH_TIMEOUT = 4;
const HAIR_VARIANTS = ['black', 'brown', 'blonde'];
// Walk cycle: radians of stride per metre covered, and the swing at full speed.
const STRIDE_PER_METRE = 2.4;
const LEG_SWING = 0.55;
const ARM_SWING = 0.4;

export class Enemy {
  constructor(opts = {}) {
    this.root = new THREE.Group();
    this.rig = new THREE.Group();
    this.root.add(this.rig);

    this.id = opts.id ?? 0;
    this.hairVariant = opts.hairVariant ?? HAIR_VARIANTS[(this.id - 1) % HAIR_VARIANTS.length];
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
    this._lastPosition = new THREE.Vector3();
    this._stride = 0;
    this._swing = 0;

    this._buildRig();
  }

  // Built from the shared agent kit; only the suit is this agent's own, since
  // its emissive is the hit flash.
  _buildRig() {
    this._kit = AgentKit.acquire();
    this._suitMaterial = this._kit.suit.clone();
    const limbs = this._kit.assemble(this.rig, this.hairVariant, this._suitMaterial);
    ({ armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR } = limbs);
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
    this._animateWalk(dt);
  }

  // Legs and the free arm swing with ground speed, measured from how far the
  // root actually moved — orbit, approach and knockback all walk the same way.
  _animateWalk(dt) {
    const moved = Math.hypot(
      this.root.position.x - this._lastPosition.x,
      this.root.position.z - this._lastPosition.z
    );
    this._lastPosition.copy(this.root.position);
    const speed = dt > 0 ? moved / dt : 0;
    const target = this.alive ? Math.min(speed / this.moveSpeed, 1) : 0;
    this._swing += (target - this._swing) * (1 - Math.exp(-8 * dt));
    this._stride += moved * STRIDE_PER_METRE;
    const phase = Math.sin(this._stride);
    this.legL.rotation.x = phase * LEG_SWING * this._swing;
    this.legR.rotation.x = -phase * LEG_SWING * this._swing;
    this.armL.rotation.x = -phase * ARM_SWING * this._swing;
    // The right arm is the punching arm; it only swings while nothing else
    // (windup, strike, recovery) is driving it.
    if (this.aiState === 'orbit' || this.aiState === 'approach') {
      this.armR.rotation.x = phase * ARM_SWING * this._swing;
    }
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
    this._swing = 0;
    this._lastPosition.copy(this.root.position);
  }

  // The kit's geometry and materials are shared by every agent, so only this
  // agent's suit is freed here; the kit frees itself with its last user.
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.root.removeFromParent();
      this._suitMaterial.dispose();
      AgentKit.release();
    }
  }
}

function dampAngle(current, target, speed, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-speed * dt));
}