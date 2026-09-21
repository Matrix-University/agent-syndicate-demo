import * as THREE from 'three';
import { Enemy } from './Enemy.js';

const SPAWN_RADIUS = 5.5;
const MAX_ATTACKERS = 2;
const RESPAWN_DELAY = 3.5;
const RESPAWN_DISTANCE = 18;
const RESPAWN_CANDIDATES = 4;
const MAX_ENEMIES = 7;

export class EnemyManager {
  constructor(count, center) {
    this.enemies = [];
    this.maxAttackers = MAX_ATTACKERS;
    this.defeated = 0;
    this._activeAttackers = 0;
    this._separation = new THREE.Vector3();
    this._candidate = new THREE.Vector3();
    this._spawnPoint = new THREE.Vector3();

    for (let index = 0; index < count; index += 1) {
      const enemy = new Enemy({ id: index + 1 });
      enemy.orbitDir = index % 2 === 0 ? 1 : -1;
      enemy.manager = this;
      this._placeOnRing(enemy, (index / count) * Math.PI * 2, center, SPAWN_RADIUS);
      this.enemies.push(enemy);
    }
  }

  get aliveCount() {
    return this.enemies.reduce((count, enemy) => count + (enemy.alive ? 1 : 0), 0);
  }

  recordDefeat() {
    this.defeated += 1;
  }

  requestAttackSlot() {
    if (this._activeAttackers >= this.maxAttackers) return false;
    this._activeAttackers += 1;
    return true;
  }

  releaseAttackSlot() {
    this._activeAttackers = Math.max(0, this._activeAttackers - 1);
  }

  update(dt, player, world) {
    let respawned = 0;
    for (const enemy of this.enemies) {
      enemy.update(dt, player, world);
      if (!enemy.alive && enemy.timeSinceDefeat >= RESPAWN_DELAY) {
        this._respawn(enemy, player, world);
        respawned += 1;
      }
    }
    this._separate(world);
    return respawned;
  }

  addReinforcement(player, world) {
    if (this.enemies.length >= MAX_ENEMIES || !this._scene) return null;

    const enemy = new Enemy({ id: this.enemies.length + 1 });
    enemy.orbitDir = this.enemies.length % 2 === 0 ? 1 : -1;
    enemy.manager = this;
    enemy.orbitAngle = Math.random() * Math.PI * 2;
    enemy.root.position.set(
      player.root.position.x + Math.sin(enemy.orbitAngle) * RESPAWN_DISTANCE,
      0,
      player.root.position.z + Math.cos(enemy.orbitAngle) * RESPAWN_DISTANCE
    );
    world?.collide(enemy.root.position, enemy.collisionRadius);
    enemy.root.rotation.y = enemy.orbitAngle + Math.PI;
    this.enemies.push(enemy);
    this._scene.add(enemy.root);
    return enemy;
  }

  _respawn(enemy, player, world) {
    let bestDistanceSq = -1;
    const spin = Math.random();
    for (let index = 0; index < RESPAWN_CANDIDATES; index += 1) {
      const angle = (spin + index / RESPAWN_CANDIDATES) * Math.PI * 2;
      this._candidate.set(
        player.root.position.x + Math.sin(angle) * RESPAWN_DISTANCE,
        0,
        player.root.position.z + Math.cos(angle) * RESPAWN_DISTANCE
      );
      world?.collide(this._candidate, enemy.collisionRadius);
      const distanceSq = this._candidate.distanceToSquared(player.root.position);
      if (distanceSq > bestDistanceSq) {
        bestDistanceSq = distanceSq;
        enemy.orbitAngle = angle;
        this._spawnPoint.copy(this._candidate);
      }
    }

    enemy.reset();
    enemy.root.position.copy(this._spawnPoint);
    enemy.root.rotation.y = enemy.orbitAngle + Math.PI;
  }

  reset(center) {
    this.defeated = 0;
    this._activeAttackers = 0;
    this.enemies.forEach((enemy, index) => {
      enemy.reset();
      this._placeOnRing(
        enemy,
        (index / this.enemies.length) * Math.PI * 2,
        center,
        SPAWN_RADIUS
      );
    });
  }

  _placeOnRing(enemy, angle, center, radius) {
    enemy.orbitAngle = angle;
    enemy.root.position.set(
      center.x + Math.sin(angle) * radius,
      0,
      center.z + Math.cos(angle) * radius
    );
    enemy.root.rotation.y = angle + Math.PI;
  }

  _separate(world) {
    for (let firstIndex = 0; firstIndex < this.enemies.length; firstIndex += 1) {
      const first = this.enemies[firstIndex];
      if (!first.alive) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < this.enemies.length; secondIndex += 1) {
        const second = this.enemies[secondIndex];
        if (!second.alive) continue;

        this._separation.subVectors(first.root.position, second.root.position);
        this._separation.y = 0;
        const minimumDistance = first.collisionRadius + second.collisionRadius;
        const distanceSq = this._separation.lengthSq();
        if (distanceSq < minimumDistance * minimumDistance && distanceSq > 1e-8) {
          const distance = Math.sqrt(distanceSq);
          const push = (minimumDistance - distance) / distance / 2;
          first.root.position.addScaledVector(this._separation, push);
          second.root.position.addScaledVector(this._separation, -push);
          world?.collide(first.root.position, first.collisionRadius);
          world?.collide(second.root.position, second.collisionRadius);
        }
      }
    }
  }

  addAll(scene) {
    this._scene = scene;
    this.enemies.forEach((enemy) => scene.add(enemy.root));
  }

  dispose() {
    this.enemies.forEach((enemy) => enemy.dispose());
  }
}