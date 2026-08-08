import * as THREE from 'three';

const PUNCH_REACH = 2.25;
const PUNCH_FACING_DOT = 0.35;

export class CombatSystem {
  constructor() {
    this._toEnemy = new THREE.Vector3();
    this._forward = new THREE.Vector3();
  }

  update(player, enemy) {
    this._resolveOverlap(player, enemy);

    this._toEnemy.subVectors(enemy.root.position, player.root.position);
    this._toEnemy.y = 0;
    const distanceSq = this._toEnemy.lengthSq();
    const inRange = distanceSq <= PUNCH_REACH * PUNCH_REACH && distanceSq > 1e-8;

    this._forward.set(
      Math.sin(player.root.rotation.y),
      0,
      Math.cos(player.root.rotation.y)
    );
    const facingDot = inRange
      ? this._forward.dot(this._toEnemy) / Math.sqrt(distanceSq)
      : -1;
    const connects = enemy.alive && inRange && facingDot >= PUNCH_FACING_DOT &&
      player.punchActive;
    const appliesHit = connects && player.consumePunchHit();
    if (appliesHit) enemy.takeDamage(1);
    return appliesHit;
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