import * as THREE from 'three';

const PUNCH_FACING_DOT = 0.35;
const CONTACT_EPSILON_SQ = 1e-6;
const CLOSE_RANGE_BONUS_RADIUS_SQ = 1.35 * 1.35;
const RANGE_TOLERANCE = 0.2;
const STRIKE_FACING_DOT = 0.35;
// A thrown car only sweeps agents once it is low enough to hit a standing body.
const PROP_STRIKE_HEIGHT = 3.4;

export class CombatSystem {
  constructor() {
    this._toEnemy = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._result = { hitEnemy: null, defeatedEnemy: false, playerHit: false };
    this._propDefeated = [];
  }

  // A prop in flight (the thrown car) ploughing through the crowd. Each agent is
  // hit at most once per throw — the prop tracks that, since it owns the flight.
  // Returns the agents this call defeated (a reused array).
  resolveThrownProp(prop, enemies) {
    this._propDefeated.length = 0;
    if (!prop?.flying || prop.root.position.y > PROP_STRIKE_HEIGHT) {
      return this._propDefeated;
    }

    const radiusSq = prop.impactRadius * prop.impactRadius;
    const start = prop.previousPosition ?? prop.root.position;
    const end = prop.root.position;
    for (const enemy of enemies) {
      if (!enemy.alive || prop.hasStruck(enemy)) continue;
      if (Math.min(start.y, end.y) > PROP_STRIKE_HEIGHT) continue;
      if (distanceToSegmentSqXZ(enemy.root.position, start, end) > radiusSq) continue;

      prop.markStruck(enemy);
      enemy.takeDamage(prop.impactDamage);
      if (!enemy.alive) this._propDefeated.push(enemy);
    }
    return this._propDefeated;
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

    let playerHit = false;
    for (const enemy of enemies) {
      if (!enemy.alive || !enemy.attackActive) continue;
      if (this._strikeConnects(player, enemy) && enemy.consumeStrikeHit()) {
        if (player.takeDamage(enemy.attackDamage)) playerHit = true;
      }
    }

    // Pushback runs after hit test so crowd overlap cannot move the player out of
    // range before the punch is resolved on that frame.
    for (const enemy of enemies) this._resolveOverlap(player, enemy);

    this._result.hitEnemy = appliesHit ? bestEnemy : null;
    this._result.defeatedEnemy = appliesHit && !bestEnemy.alive;
    this._result.playerHit = playerHit;
    return this._result;
  }

  _strikeConnects(player, enemy) {
    this._toEnemy.subVectors(player.root.position, enemy.root.position);
    this._toEnemy.y = 0;
    const distanceSq = this._toEnemy.lengthSq();
    const inRange = distanceSq <= enemy.attackRange * enemy.attackRange;
    if (!inRange) return false;

    this._forward.set(
      Math.sin(enemy.root.rotation.y),
      0,
      Math.cos(enemy.root.rotation.y)
    );
    const facingDot = distanceSq <= CONTACT_EPSILON_SQ
      ? 1
      : this._forward.dot(this._toEnemy) / Math.sqrt(distanceSq);
    return facingDot >= STRIKE_FACING_DOT;
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

function distanceToSegmentSqXZ(point, start, end) {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
  const t = lengthSq > 1e-8
    ? THREE.MathUtils.clamp(
      ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSq,
      0,
      1
    )
    : 0;
  const closestX = start.x + segmentX * t;
  const closestZ = start.z + segmentZ * t;
  const offsetX = point.x - closestX;
  const offsetZ = point.z - closestZ;
  return offsetX * offsetX + offsetZ * offsetZ;
}