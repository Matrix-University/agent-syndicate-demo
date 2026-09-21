import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CAR_MODEL = '/models/vehicles/suv.glb';
const CAR_SCALE = 1.65; // matches the parked cars in World.js

// Footprint half-extents in the car's own space: length runs down local Z, so a
// parked yaw of ±90° puts the long side across the aisle (see LIFTABLE_CAR_SLOT).
const HALF_WIDTH = 1.45;
const HALF_LENGTH = 2.3;
const BODY_HEIGHT = 1.65; // standable surface, same as the parked-car colliders
const SWEPT_RADIUS = 2.0; // circle used against pillars while the car is in flight

const LIFT_RANGE = 4.2;   // player root -> car center; generous, the car is wide
const LIFT_DURATION = 0.45;
const SETTLE_DURATION = 0.3;

// Held overhead and slightly forward, broadside to the player.
const CARRY_POSITION = new THREE.Vector3(0, 3.02, 0.4);
const CARRY_EULER = new THREE.Euler(0, Math.PI / 2, 0.12);

// The heave, in the player's local space (+Z is the way they face). These track
// the hands in Throw_Overhead — back over the head, then whipped out front — so
// the car doesn't hang still while the arms swing under it. The pitch is about
// the parent's X, so it tips fore/aft whatever yaw the car is held at, and the
// release pitch runs on into THROW_SPIN's tumble.
const THROW_WINDUP_POSITION = new THREE.Vector3(0, 3.2, -0.85);
const THROW_RELEASE_POSITION = new THREE.Vector3(0, 3.34, 1.9);
const THROW_WINDUP_PITCH = -0.2;  // tipped back over the heels
const THROW_RELEASE_PITCH = 0.34; // nose already coming over
// Where the wind-up bottoms out, as a fraction of the run-up to the release:
// WINDUP / RELEASE from the clip's phase table (scripts/lib/throw.mjs).
const THROW_WINDUP_AT = 0.64;

const THROW_SPEED = 30;
const THROW_LIFT = 7;
const THROW_SPIN = 4.5;   // rad/s tumble
const GRAVITY = 26;       // matches Player.gravity so the arc reads the same
const WALL_BOUNCE = -0.22;

const IMPACT_RADIUS = 3.2;
const IMPACT_DAMAGE = 3;  // an Enemy's full health — a thrown car is not a jab

// A single car the player can lift overhead and throw. It owns its own world
// collider (registered with World) and toggles it off while held or airborne, so
// the thing you are carrying can't also be the thing you walk into.
//
// States: grounded (liftable) -> carried -> flying -> settling -> grounded.
export class LiftableCar {
  constructor(scene, world, opts = {}) {
    this.root = new THREE.Group();
    this.root.name = 'liftable-car';
    scene.add(this.root);

    this._scene = scene;
    this._world = world;
    this._disposed = false;
    this.state = 'grounded';

    this.impactRadius = IMPACT_RADIUS;
    this.impactDamage = IMPACT_DAMAGE;

    this.home = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.homeYaw = opts.yaw ?? 0;
    this.root.position.copy(this.home);
    this.root.rotation.y = this.homeYaw;

    this.collider = { x: this.home.x, z: this.home.z, hx: 0, hz: 0, height: BODY_HEIGHT };
    world.addCollider(this.collider);
    this._syncCollider();

    this.velocity = new THREE.Vector3();
    this._struck = new Set(); // enemies already hit by the current throw
    this._liftTime = 0;
    this._settleTime = 0;
    this._liftFromPosition = new THREE.Vector3();
    this._liftFromQuaternion = new THREE.Quaternion();
    this._carryQuaternion = new THREE.Quaternion().setFromEuler(CARRY_EULER);
    this._settleQuaternion = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._toPlayer = new THREE.Vector3();

    this._marker = buildMarker();
    scene.add(this._marker);
    this._markerPulse = 0;

    this._loadModel();
  }

  get liftable() { return this.state === 'grounded' && !!this.model; }
  get carried() { return this.state === 'carried'; }
  get flying() { return this.state === 'flying'; }

  // Close enough, on the ground, and not already holding something.
  canLift(player) {
    if (!this.liftable || !player.grounded || player.carrying) return false;
    this._toPlayer.subVectors(this.root.position, player.root.position);
    this._toPlayer.y = 0;
    return this._toPlayer.lengthSq() <= LIFT_RANGE * LIFT_RANGE;
  }

  // Reparent to the player, keeping the current world transform, then tween into
  // the overhead pose. Player drives the timing; this only moves the prop.
  lift(player) {
    player.root.attach(this.root);
    this.state = 'carried';
    this._liftTime = 0;
    this._liftFromPosition.copy(this.root.position);
    this._liftFromQuaternion.copy(this.root.quaternion);
    this.collider.disabled = true;
    this._marker.visible = false;
  }

  // Player drives this every frame of a throw, `t` running 0 -> 1 from the first
  // frame of the clip to the release. Pure presentation: the ballistics don't
  // start until launch().
  throwPose(t) {
    if (this.state !== 'carried') return;
    const u = THREE.MathUtils.clamp(t, 0, 1);
    if (u <= THROW_WINDUP_AT) {
      const k = smoothstep(u / THROW_WINDUP_AT);
      this.root.position.lerpVectors(CARRY_POSITION, THROW_WINDUP_POSITION, k);
      this._setCarryPitch(THREE.MathUtils.lerp(CARRY_EULER.x, THROW_WINDUP_PITCH, k));
      return;
    }
    // The whip accelerates into the release, so this half eases IN only — a
    // smoothstep here would slow the car down just as it leaves the hands.
    const k = (u - THROW_WINDUP_AT) / (1 - THROW_WINDUP_AT);
    const eased = k * k;
    this.root.position.lerpVectors(THROW_WINDUP_POSITION, THROW_RELEASE_POSITION, eased);
    this._setCarryPitch(THREE.MathUtils.lerp(THROW_WINDUP_PITCH, THROW_RELEASE_PITCH, eased));
  }

  // Released mid-throw: back into world space with a ballistic arc and a tumble.
  launch(direction) {
    this._scene.attach(this.root);
    this.state = 'flying';
    this._struck.clear();
    this.velocity.copy(direction).multiplyScalar(THROW_SPEED);
    this.velocity.y += THROW_LIFT;
  }

  // Enemies are hit once per throw; CombatSystem asks before applying damage.
  hasStruck(enemy) { return this._struck.has(enemy); }
  markStruck(enemy) { this._struck.add(enemy); }

  update(dt, world, player) {
    switch (this.state) {
      case 'carried': this._updateCarry(dt); break;
      case 'flying': this._updateFlight(dt, world); break;
      case 'settling': this._updateSettle(dt); break;
      default: this._updateMarker(dt, player); break;
    }
  }

  reset() {
    if (this.root.parent !== this._scene) this._scene.attach(this.root);
    this.state = 'grounded';
    this.velocity.set(0, 0, 0);
    this._struck.clear();
    this.root.position.copy(this.home);
    this.root.rotation.set(0, this.homeYaw, 0);
    this.collider.disabled = false;
    this._syncCollider();
    this._marker.visible = true;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._world.removeCollider(this.collider);
    this.root.removeFromParent();
    disposeObject(this.root);
    this._marker.removeFromParent();
    this._marker.geometry.dispose();
    this._marker.material.dispose();
  }

  // -- internals --------------------------------------------------------------
  async _loadModel() {
    const loader = new GLTFLoader();
    let gltf = null;
    try {
      gltf = await loader.loadAsync(CAR_MODEL);
    } catch (error) {
      console.warn(`LiftableCar: could not load "${CAR_MODEL}".`, error);
      return;
    }
    if (this._disposed) {
      disposeObject(gltf.scene);
      return;
    }

    const model = gltf.scene;
    model.scale.setScalar(CAR_SCALE);
    model.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });

    // Re-seat the model so the group's origin is the car's footprint center at
    // ground level — that is the point the physics and the collider work in.
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);

    this.root.add(model);
    this.model = model;
  }

  // Only the fore/aft tilt moves during the heave; the broadside yaw and roll are
  // whatever the carry pose set.
  _setCarryPitch(pitch) {
    this.root.rotation.set(pitch, CARRY_EULER.y, CARRY_EULER.z);
  }

  _updateCarry(dt) {
    if (this._liftTime >= LIFT_DURATION) return;
    this._liftTime = Math.min(this._liftTime + dt, LIFT_DURATION);
    const t = smoothstep(this._liftTime / LIFT_DURATION);
    this.root.position.lerpVectors(this._liftFromPosition, CARRY_POSITION, t);
    this.root.quaternion.slerpQuaternions(
      this._liftFromQuaternion, this._carryQuaternion, t
    );
  }

  _updateFlight(dt, world) {
    const previousY = this.root.position.y;

    this.velocity.y -= GRAVITY * dt;
    this.root.position.addScaledVector(this.velocity, dt);
    this.root.rotation.x += THROW_SPIN * dt;

    // Pillars and the garage shell stop the car dead-ish; parked cars are below
    // it (World skips short colliders once you clear their height).
    const sweptX = this.root.position.x;
    const sweptZ = this.root.position.z;
    world.collide(this.root.position, SWEPT_RADIUS);
    if (this.root.position.x !== sweptX || this.root.position.z !== sweptZ) {
      this.velocity.x *= WALL_BOUNCE;
      this.velocity.z *= WALL_BOUNCE;
    }

    const groundHeight = world.groundHeight(this.root.position);
    const landed = this.velocity.y <= 0 && previousY >= groundHeight &&
      this.root.position.y <= groundHeight;
    if (landed) this._land(groundHeight);
  }

  _land(groundHeight) {
    this.root.position.y = groundHeight;
    this.velocity.set(0, 0, 0);
    this.state = 'settling';
    this._settleTime = 0;
    this._liftFromQuaternion.copy(this.root.quaternion);
    // Keep the yaw it crashed at, drop the tumble.
    this._euler.setFromQuaternion(this.root.quaternion);
    this._euler.set(0, this._euler.y, 0);
    this._settleQuaternion.setFromEuler(this._euler);
  }

  _updateSettle(dt) {
    this._settleTime = Math.min(this._settleTime + dt, SETTLE_DURATION);
    const t = smoothstep(this._settleTime / SETTLE_DURATION);
    this.root.quaternion.slerpQuaternions(
      this._liftFromQuaternion, this._settleQuaternion, t
    );
    if (this._settleTime < SETTLE_DURATION) return;

    this.state = 'grounded';
    this.collider.disabled = false;
    this._syncCollider();
    this._marker.visible = true;
  }

  // Pulse the pickup ring only when the player is actually in range, so it reads
  // as a prompt rather than decoration.
  _updateMarker(dt, player) {
    this._marker.position.set(this.root.position.x, 0.03, this.root.position.z);
    const inRange = !!player && this.canLift(player);
    this._markerPulse += dt * (inRange ? 5 : 1.4);
    const base = inRange ? 0.55 : 0.16;
    this._marker.material.opacity = base + Math.sin(this._markerPulse) * 0.18;
  }

  // The collider is axis-aligned, so size it to the footprint's bounding box at
  // whatever yaw the car came to rest at — no snapping the crash back to square.
  _syncCollider() {
    const yaw = this.root.rotation.y;
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    this.collider.x = this.root.position.x;
    this.collider.z = this.root.position.z;
    this.collider.hx = cos * HALF_WIDTH + sin * HALF_LENGTH;
    this.collider.hz = sin * HALF_WIDTH + cos * HALF_LENGTH;
    this.collider.height = this.root.position.y + BODY_HEIGHT;
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function buildMarker() {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 3.35, 40),
    new THREE.MeshBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 1;
  return marker;
}

// Free GPU memory for a subtree (Object3D.remove does not).
function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
      childMaterials.forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
      });
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
