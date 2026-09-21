import * as THREE from 'three';

const PUNCH_FACING_DOT = 0.35;
const CONTACT_EPSILON_SQ = 1e-6;
const CLOSE_RANGE_BONUS_RADIUS_SQ = 1.35 * 1.35;
const RANGE_TOLERANCE = 0.2;

export class CombatSystem {
  constructor() {
    this._toEnemy = new THREE.Vector3();
    this._forward = new THREE.Vector3();
  }

  update(player, enemies, preferredEnemy = null) {
    const attackReach = player.attackReach ?? 2.25;
    const attackReachSq = (attackReach + RANGE_TOLERANCE) * (attackReach + RANGE_TOLERANCE);
    const attackDamage = player.attackDamage ?? 1;

    let bestEnemy = null;
    let bestScore = -Infinity;
    this._forward.set(
      Math.sin(player.root.rotation.y),
      0,
      Math.cos(player.root.rotation.y)
    );

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      this._toEnemy.subVectors(enemy.root.position, player.root.position);
      this._toEnemy.y = 0;
      const distanceSq = this._toEnemy.lengthSq();
      const inRange = distanceSq <= attackReachSq;
      if (!inRange) continue;

      const facingDot = distanceSq <= CONTACT_EPSILON_SQ
        ? 1
        : this._forward.dot(this._toEnemy) / Math.sqrt(distanceSq);

      const closeRange = distanceSq <= CLOSE_RANGE_BONUS_RADIUS_SQ;
      const facingPasses = facingDot >= PUNCH_FACING_DOT || closeRange;
      if (!facingPasses) continue;

      // Prefer sticking to the current focus target so repeated punches finish it.
      const preferredBonus = enemy === preferredEnemy ? 2 : 0;
      const healthBonus = (enemy.maxHealth - enemy.health) * 0.4;
      const score = preferredBonus + healthBonus + facingDot - distanceSq * 0.12;
      if (score > bestScore) {
        bestEnemy = enemy;
        bestScore = score;
      }
    }

    const connects = !!bestEnemy && player.punchActive;
    const appliesHit = connects && player.consumePunchHit();
    if (appliesHit) bestEnemy.takeDamage(attackDamage);

    // Pushback runs after hit test so crowd overlap cannot move the player out of
    // range before the punch is resolved on that frame.
    for (const enemy of enemies) this._resolveOverlap(player, enemy);

    return appliesHit ? bestEnemy : null;
  }

  _resolveOverlap(player, enemy) {
    this._toEnemy.subVectors(player.root.position, enemy.root.position);
    this._toEnemy.y = 0;
    const distanceSq = this._toEnemy.lengthSq();
    const minimumDistance = player.collisionRadius + enemy.collisionRadius;
    const overlaps = enemy.alive && distanceSq < minimumDistance * minimumDistance;

    if (overlaps && distanceSq > 1e-8) {
      const distance = Math.sqrt(distanceSq);
      const correction = (minimumDistance - distance) / distance;
      player.root.position.addScaledVector(this._toEnemy, correction);
    } else if (overlaps) {
      player.root.position.z -= minimumDistance;
    }
  }
}