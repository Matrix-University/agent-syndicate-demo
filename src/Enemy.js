import * as THREE from 'three';
import { AgentKit, AGENT_LEG } from './AgentKit.js';

const HIT_REACTION_DURATION = 0.24;
const DEATH_DURATION = 0.7;
const ORBIT_DRIFT_SPEED = 0.35;
const WINDUP_DURATION = 0.4;
const STRIKE_DURATION = 0.16;
const RECOVER_DURATION = 0.9;
const APPROACH_TIMEOUT = 4;
const HAIR_VARIANTS = ['black', 'brown', 'blonde'];

// Momentum, as the player has it: velocity eases toward the wanted one so starts
// and turns carry weight, and braking is quicker than getting going.
const ACCEL = 9;
const DECEL = 14;
// Backing off with the player still in view is a backpedal, and slower — the
// player's BACK_SPEED_FACTOR and BACK_DOT.
const BACK_SPEED_FACTOR = 0.6;
const BACK_DOT = -0.35;
// The approach stops this far inside attackRange, so arriving always crosses
// the windup's `distance <= attackRange` test instead of parking a hair outside.
const ARRIVE_MARGIN = 0.02;

// The gait, after the player's baked Walk and Run (scripts/lib/locomotion.mjs):
// each arm swings against its own side's leg with the elbow closing on the
// forward swing, the knee folds through the swing and gives on landing, the
// trunk leans in from the hips over legs that stay under it, and the body rides
// down onto whichever foot is planted. WALK is the circling pace, RUN the charge
// at moveSpeed; the pose blends between them on forward speed. Radians, m/s.
// `kneeLead` places the knee's fold in the swing: a walk folds it most just
// before the thigh passes under the hip and has it straight before the heel
// lands; a run folds it later, driving the knee up in front, and lands on it bent.
const WALK = {
  speed: 1.9, legSwing: 0.42, knee: 0.95, kneeLead: 0.35, stanceKnee: 0.14, armSwing: 0.32,
  armBias: 0, elbow: 0.22, elbowSwing: 0.2, lean: 0.05, sway: 0.035, twist: 0.06, flight: 0,
};
const RUN = {
  speed: 3.6, legSwing: 0.52, knee: 1.6, kneeLead: -0.3, stanceKnee: 0.32, armSwing: 0.5,
  armBias: 0.04, elbow: 1.5, elbowSwing: 0.25, lean: 0.14, sway: 0.02, twist: 0.1, flight: 0.06,
};
const GAIT_KEYS = Object.keys(WALK);
// The ankle takes back most of the knee's fold so the swinging foot stays near level.
const ANKLE_FOLLOW = 0.8;
// Side-steps open both legs together, then close them — the lead foot reaching
// while the trail foot pushes, then the trail foot following — so the legs never
// cross. This is half the widest opening.
const SIDESTEP = 0.2;
const SIDE_LEAN = 0.06;
const LEG_LENGTH = AGENT_LEG.thigh + AGENT_LEG.shin + AGENT_LEG.sole;
// Metres covered per side-step cycle, so the feet keep pace with the ground.
const SIDESTEP_CYCLE = 2 * LEG_LENGTH * Math.sin(2 * SIDESTEP);
// Below this speed the swing shrinks toward standing, so starts and stops fade
// in and out the way the player's clips crossfade.
const FULL_SWING_SPEED = 0.9;
// How fast the measured ground velocity follows the root (1/s) — the fade.
const GAIT_RESPONSE = 8;
// Turning on the spot shuffles the feet as if side-stepping this far out.
const TURN_STEP_RADIUS = 0.35;
// A respawn or reset moves the root further than any step; don't walk it.
const TELEPORT_DISTANCE = 1.5;
const TELEPORT_TURN = 1;
// Fraction of each step spent with both feet off the ground at a full run.
const FLIGHT_START = 0.7;

// Circling, the body turns up to this far into its path while the head holds
// the player, so an orbit reads as stalking rather than sliding sideways. Only
// the rig turns: the root, and the strike's facing test, stay on the player.
const STALK_YAW = 0.95;
const STALK_RESPONSE = 5;
// How much of the trunk's lean and sway the head takes back to hold its stare.
const HEAD_HOLD = 0.85;

// Standing: feet a little apart, elbows soft, a slow breath and weight shift.
const STANCE_SPLAY = 0.035;
const ARM_OUT = 0.06;
const REST_ELBOW = 0.16;
const BREATH_RATE = (Math.PI * 2) / 3.8;
const SHIFT_RATE = (Math.PI * 2) / 7.5;
const IDLE_SHIFT = 0.018;

// The strike: the right fist chambers at the chest, then drives straight out as
// the shoulders turn into it, the left hand up by the chin. Keyed to the windup
// and strike timings above, which are what the hit test runs on. `shoulder` is
// the arm's pitch (negative forward), `elbow` its fold, `roll` its swing away
// from the body, `twist` and `lean` the trunk's.
const REST_POSE = { shoulder: 0, elbow: REST_ELBOW, roll: 0, twist: 0, lean: 0 };
const CHAMBER = { shoulder: 0.6, elbow: 2.2, roll: 0.15, twist: -0.28, lean: -0.04 };
const EXTEND = { shoulder: -1.5, elbow: 0.08, roll: -0.2, twist: 0.3, lean: 0.12 };
const GUARD = { shoulder: -0.7, elbow: 1.9, roll: -0.15 };
const POSE_KEYS = Object.keys(REST_POSE);
const FIGHT_IN = 14;
// The old recover's ease (1 - 0.0001^dt) as a rate: the arm is home in ~0.5 s.
const FIGHT_OUT = Math.log(10000);

const TWO_PI = Math.PI * 2;
const HIP_Y = AGENT_LEG.hipY;
// Where the soles sit standing still; the gait's floor contact is measured from it.
const REST_SOLE = soleHeight(0, STANCE_SPLAY, 0, 0);

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
    this.velocity = new THREE.Vector3();

    this.manager = null;
    this.aiState = 'orbit';
    this._aiTimer = 0;
    this._hasSlot = false;
    this._strikeHitConsumed = true;

    this._toTarget = new THREE.Vector3();
    this._orbitPoint = new THREE.Vector3();
    this._targetVel = new THREE.Vector3();
    this._facing = new THREE.Vector3();
    this._maxStep = 0;

    // Animation state, all of it read by _animate, which rewrites the whole pose
    // each frame so the layers add rather than fight over the same joints.
    this._lastPosition = new THREE.Vector3();
    this._lastYaw = 0;
    this._vForward = 0; // eased ground velocity in the root's frame
    this._vLeft = 0;
    this._turnRate = 0;
    this._phase = 0; // gait cycle; the left foot is furthest ahead at π/2
    this._stalk = 0;
    this._fight = 0; // weight of the strike pose over the gait
    this._recoil = 0;
    this._fall = 0;
    this._idle = this.id * 1.37; // so the crowd doesn't breathe in unison
    this._gait = { ...WALK };
    this._strike = { ...REST_POSE };

    this._buildRig();
    this._animate(0);
  }

  // Built from the shared agent kit; only the suit is this agent's own, since
  // its emissive is the hit flash.
  _buildRig() {
    this._kit = AgentKit.acquire();
    this._suitMaterial = this._kit.suit.clone();
    this.joints = this._kit.assemble(this.rig, this.hairVariant, this._suitMaterial);
    const j = this.joints;
    this._sides = [
      { sign: 1, offset: 0, shoulder: j.armL, elbow: j.elbowL, hip: j.legL, knee: j.kneeL, ankle: j.footL },
      { sign: -1, offset: Math.PI, shoulder: j.armR, elbow: j.elbowR, hip: j.legR, knee: j.kneeR, ankle: j.footR },
    ];
    // Yaw first, so lean and sway happen in the body's own frame once it has
    // turned into its path.
    this.rig.rotation.order = 'YXZ';
    j.head.rotation.order = 'YXZ';
    this._headY = j.head.position.y;
    this._shoulderY = j.armL.position.y;
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
    this._updateReaction(dt);
    if (this.alive && player) this._updateAI(dt, player, world);
    this._animate(dt);
  }

  // The hit flinch, the fall and the suit's flash. _animate turns the first two
  // into a pose.
  _updateReaction(dt) {
    if (this.alive && this._hitTime > 0) {
      this._hitTime = Math.max(0, this._hitTime - dt);
      this._recoil = Math.sin((1 - this._hitTime / HIT_REACTION_DURATION) * Math.PI);
      this._suitMaterial.emissiveIntensity = this._recoil * 2.8;
    } else if (this.alive) {
      const ease = 1 - Math.pow(0.0001, dt);
      this._recoil *= 1 - ease;
      this._suitMaterial.emissiveIntensity *= 1 - ease;
    } else {
      this._deathTime += dt;
      const progress = Math.min(this._deathTime / DEATH_DURATION, 1);
      this._fall = 1 - Math.pow(1 - progress, 3);
      this._suitMaterial.emissiveIntensity = (1 - progress) * 3.5;
      this.rig.visible = progress < 1;
    }
  }

  // The body, from how the root actually moved — orbit, approach, separation
  // shoves and turning on the spot all walk the same way.
  _animate(dt) {
    this._measureGait(dt);
    const alive = this.alive;

    // Turn the body into its path while circling; never while backing off.
    const speed = Math.hypot(this._vForward, this._vLeft);
    const heading = Math.atan2(this._vLeft, this._vForward);
    const ahead = THREE.MathUtils.clamp(Math.cos(heading) * 2 + 1, 0, 1);
    const stalk = STALK_YAW * Math.sin(heading) * ahead * Math.min(speed / FULL_SWING_SPEED, 1);
    this._stalk += (stalk - this._stalk) * (1 - Math.exp(-STALK_RESPONSE * dt));

    // Travel in the body's own frame.
    const sinStalk = Math.sin(this._stalk);
    const cosStalk = Math.cos(this._stalk);
    const forward = this._vForward * cosStalk + this._vLeft * sinStalk;
    const left = this._vLeft * cosStalk - this._vForward * sinStalk +
      this._turnRate * TURN_STEP_RADIUS;
    const g = this._blendGait(Math.max(forward, 0));

    // The cycles per second each axis needs for the feet to keep pace with the
    // ground. Together they set the cadence, and each axis's share of it scales
    // that axis's swing — the per-state speedFactor, for a gait that blends.
    const forwardCycle = 4 * LEG_LENGTH * Math.sin(g.legSwing);
    const cyclesForward = forward / forwardCycle;
    const cyclesLeft = left / SIDESTEP_CYCLE;
    const cadence = Math.hypot(cyclesForward, cyclesLeft);
    this._phase = (this._phase + cadence * TWO_PI * dt) % TWO_PI;
    const norm = Math.max(cadence, FULL_SWING_SPEED / forwardCycle);
    const uf = cyclesForward / norm;
    const ul = cyclesLeft / norm;
    const reach = Math.hypot(uf, ul);
    const standing = 1 - reach;

    const fighting = alive && (this.aiState === 'windup' || this.aiState === 'strike');
    const fightRate = fighting ? FIGHT_IN : FIGHT_OUT;
    this._fight += ((fighting ? 1 : 0) - this._fight) * (1 - Math.exp(-fightRate * dt));
    const fight = this._fight;
    const strike = this._strikePose();

    this._idle += dt;
    const breath = Math.sin(this._idle * BREATH_RATE);
    const shift = Math.sin(this._idle * SHIFT_RATE);
    const recoil = this._recoil;
    const fall = this._fall;

    // Trunk: lean into the travel from the hips (back a touch when backpedalling),
    // sway over the planted foot, turn the shoulders with the swinging arms.
    const gaitLean = g.lean * (uf > 0 ? uf : uf * 0.4);
    const lean = gaitLean + (strike.lean - gaitLean) * fight;
    const roll = g.sway * Math.cos(this._phase) * reach - SIDE_LEAN * ul + IDLE_SHIFT * shift * standing;
    const gaitTwist = g.twist * uf * Math.sin(this._phase);
    // A flinch or a fall squares the body back up to the player, so it goes
    // over away from the hit rather than off to the side it was circling.
    const squared = 1 - Math.max(recoil, fall);
    const yaw = this._stalk * squared + gaitTwist + (strike.twist - gaitTwist) * fight;

    // Legs swing about true vertical under the leaning trunk, and the lowest
    // sole sets the body's height — the bake's lockFeetToFloor.
    let lowest = 0;
    for (let i = 0; i < this._sides.length; i += 1) {
      const side = this._sides[i];
      const phase = this._phase + side.offset;
      const swing = Math.sin(phase);
      const legAhead = g.legSwing * uf * swing;
      const legOut = side.sign * (STANCE_SPLAY + SIDESTEP * Math.abs(ul)) + SIDESTEP * ul * swing;
      const wrapped = phase % TWO_PI;
      const landing = wrapped > Math.PI / 2 && wrapped < Math.PI ? Math.sin(2 * wrapped - Math.PI) : 0;
      const knee = (g.knee * Math.max(0, Math.cos(phase + g.kneeLead)) + g.stanceKnee * landing) * reach +
        0.18 * fight + 0.3 * recoil + 0.7 * fall;
      const ankle = -ANKLE_FOLLOW * knee;
      side.hip.rotation.set(-legAhead - lean, 0, legOut - roll);
      side.knee.rotation.x = knee;
      side.ankle.rotation.x = ankle;
      lowest = Math.min(lowest, soleHeight(-legAhead, legOut, knee, ankle));

      // Arms hang under gravity rather than tipping with the trunk, and swing
      // against this side's leg.
      const armSwing = -swing * uf;
      let shoulder = -(g.armSwing * armSwing + g.armBias * reach) - lean;
      let elbow = Math.max(0, REST_ELBOW + (g.elbow - REST_ELBOW) * reach + g.elbowSwing * armSwing);
      let out = ARM_OUT;
      // The right arm throws the strike; the left comes up to guard.
      const pose = side.sign < 0 ? strike : GUARD;
      shoulder += (pose.shoulder - shoulder) * fight;
      elbow += (pose.elbow - elbow) * fight;
      out += (pose.roll - out) * fight;
      side.shoulder.rotation.set(
        shoulder - 0.35 * recoil - 1.1 * fall,
        0,
        side.sign * (out + 0.35 * fall) - roll,
      );
      side.elbow.rotation.x = -(elbow + 0.4 * recoil + 0.3 * fall);
      side.shoulder.position.y = this._shoulderY + breath * 0.008;
    }

    const lift = this._flightLift(g, reach);
    const drop = (REST_SOLE - lowest) * (1 - fall);
    this.rig.rotation.set(lean - recoil * 0.28 - fall * Math.PI * 0.48, yaw, roll);
    // Pivot the lean and sway about the hips, not the floor, so the legs stay
    // put under them. The flinch and the fall still tip from the feet.
    const hipX = HIP_Y * Math.sin(roll);
    const hipZ = -HIP_Y * Math.cos(roll) * Math.sin(lean);
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    this.rig.position.set(
      hipX * cosYaw + hipZ * sinYaw,
      HIP_Y * (1 - Math.cos(roll) * Math.cos(lean)) + drop + lift - fall * 0.72,
      hipZ * cosYaw - hipX * sinYaw - recoil * 0.22,
    );

    // The head holds its stare on the player through the stalk, the lean and
    // the punch; only a flinch or the fall snaps it back.
    const head = this.joints.head;
    head.position.y = this._headY + breath * 0.006;
    head.rotation.set(
      -HEAD_HOLD * lean - 0.3 * recoil - 0.35 * fall,
      -yaw + 0.05 * Math.sin(this._idle * 0.37) * standing,
      -HEAD_HOLD * roll,
    );
  }

  // Ground velocity in the root's frame (forward, left) and turn rate, eased so
  // a separation shove can't twitch the legs.
  _measureGait(dt) {
    const position = this.root.position;
    const dx = position.x - this._lastPosition.x;
    const dz = position.z - this._lastPosition.z;
    const turn = wrapAngle(this.root.rotation.y - this._lastYaw);
    this._lastPosition.copy(position);
    this._lastYaw = this.root.rotation.y;
    const jumped = dx * dx + dz * dz > TELEPORT_DISTANCE * TELEPORT_DISTANCE ||
      Math.abs(turn) > TELEPORT_TURN;
    if (dt <= 0 || jumped) return;
    const perSecond = this.alive ? 1 / dt : 0;
    const sin = Math.sin(this._lastYaw);
    const cos = Math.cos(this._lastYaw);
    const k = 1 - Math.exp(-GAIT_RESPONSE * dt);
    this._vForward += ((dx * sin + dz * cos) * perSecond - this._vForward) * k;
    this._vLeft += ((dx * cos - dz * sin) * perSecond - this._vLeft) * k;
    this._turnRate += (turn * perSecond - this._turnRate) * k;
  }

  _blendGait(forwardSpeed) {
    const t = THREE.MathUtils.smoothstep(forwardSpeed, WALK.speed, RUN.speed);
    for (let i = 0; i < GAIT_KEYS.length; i += 1) {
      const key = GAIT_KEYS[i];
      this._gait[key] = WALK[key] + (RUN[key] - WALK[key]) * t;
    }
    return this._gait;
  }

  // The strike pose for the current AI beat: chambering through the windup,
  // driving out through the strike. Otherwise it holds wherever it got to while
  // the fight weight lets it go, so a hit mid-windup doesn't snap the arm out.
  _strikePose() {
    const pose = this._strike;
    if (this.aiState === 'windup') {
      const t = Math.min(this._aiTimer / WINDUP_DURATION, 1);
      mixPose(pose, REST_POSE, CHAMBER, 1 - (1 - t) ** 2);
    } else if (this.aiState === 'strike') {
      const t = Math.min(this._aiTimer / STRIKE_DURATION, 1);
      mixPose(pose, CHAMBER, EXTEND, 1 - (1 - t) ** 3);
    }
    return pose;
  }

  // A running stride leaves the ground at the end of each step, as Run does.
  _flightLift(g, reach) {
    if (g.flight <= 0) return 0;
    const step = (((this._phase - Math.PI / 2) % Math.PI) + Math.PI) % Math.PI / Math.PI;
    const airborne = Math.max(0, (step - FLIGHT_START) / (1 - FLIGHT_START));
    return g.flight * reach * Math.sin(Math.PI * airborne) ** 2;
  }

  _updateAI(dt, player, world) {
    this._targetVel.set(0, 0, 0);
    this._maxStep = 0;
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
        const distance = this._moveToward(player.root.position, dt, this.attackRange - ARRIVE_MARGIN);
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
        if (this._aiTimer >= RECOVER_DURATION) this.aiState = 'orbit';
        break;
      }
    }

    this._integrate(dt);
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

  // Aim the velocity at `target`, arriving `stopRadius` short of it. Returns the
  // distance to it before this frame's move.
  _moveToward(target, dt, stopRadius = 0) {
    this._toTarget.subVectors(target, this.root.position);
    this._toTarget.y = 0;
    const distance = this._toTarget.length();
    const remaining = distance - stopRadius;
    if (remaining > 1e-4) {
      // Moving away from where it faces (the player) is a backpedal.
      this._facing.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
      const backing = this._toTarget.dot(this._facing) < BACK_DOT * distance;
      const topSpeed = this.moveSpeed * (backing ? BACK_SPEED_FACTOR : 1);
      const speed = Math.min(topSpeed, remaining / dt);
      this._targetVel.copy(this._toTarget).multiplyScalar(speed / distance);
      this._maxStep = remaining;
    }
    return distance;
  }

  // Ease toward the wanted velocity and move, never past the stop point. Rooted
  // through the windup and strike, as the player is through a punch.
  _integrate(dt) {
    if (this.aiState === 'windup' || this.aiState === 'strike') {
      this.velocity.set(0, 0, 0);
      return;
    }
    const speeding = this._targetVel.lengthSq() > this.velocity.lengthSq();
    const k = 1 - Math.exp(-(speeding ? ACCEL : DECEL) * dt);
    this.velocity.x += (this._targetVel.x - this.velocity.x) * k;
    this.velocity.z += (this._targetVel.z - this.velocity.z) * k;
    const step = Math.hypot(this.velocity.x, this.velocity.z) * dt;
    const scale = step > this._maxStep ? this._maxStep / step : 1;
    this.root.position.x += this.velocity.x * dt * scale;
    this.root.position.z += this.velocity.z * dt * scale;
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
    this._recoil = 0;
    this._fall = 0;
    this.rig.visible = true;
    this._suitMaterial.emissiveIntensity = 0;
    this.aiState = 'orbit';
    this._aiTimer = 0;
    this._hasSlot = false;
    this._strikeHitConsumed = true;
    this.velocity.set(0, 0, 0);
    this._vForward = 0;
    this._vLeft = 0;
    this._turnRate = 0;
    this._stalk = 0;
    this._fight = 0;
    this._lastPosition.copy(this.root.position);
    this._lastYaw = this.root.rotation.y;
    this._animate(0); // stand up now: the respawn renders before the next update
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

// How far below the hip a leg's lowest sole point sits, the leg swung `pitch`
// (its rotation.x, positive back) and `roll` (rotation.z) with the knee and
// ankle folded: the chain runs down the leg's own plane, then the hip tilts it.
function soleHeight(pitch, roll, knee, ankle) {
  const { thigh, shin, sole, heel, toe } = AGENT_LEG;
  const cos = Math.cos(knee + ankle);
  const sin = Math.sin(knee + ankle);
  const ankleY = -thigh - shin * Math.cos(knee) - sole * cos;
  const ankleZ = -shin * Math.sin(knee) - sole * sin;
  const upright = Math.cos(roll) * Math.cos(pitch);
  const tip = Math.sin(pitch);
  const heelHeight = (ankleY - heel * sin) * upright - (ankleZ + heel * cos) * tip;
  const toeHeight = (ankleY - toe * sin) * upright - (ankleZ + toe * cos) * tip;
  return Math.min(heelHeight, toeHeight);
}

function mixPose(out, from, to, t) {
  for (let i = 0; i < POSE_KEYS.length; i += 1) {
    const key = POSE_KEYS[i];
    out[key] = from[key] + (to[key] - from[key]) * t;
  }
}

function wrapAngle(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= TWO_PI;
  while (wrapped < -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

function dampAngle(current, target, speed, dt) {
  const diff = wrapAngle(target - current);
  return current + diff * (1 - Math.exp(-speed * dt));
}
