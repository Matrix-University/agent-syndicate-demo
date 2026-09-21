// Rig-level pose surgery shared by the bake's clip recipes.
//
// skeleton.mjs reads and writes poses; this module is the layer above it — the
// operations a recipe actually reaches for (re-seat the hips, replace the upper
// body, put the feet back on the floor) expressed against THIS rig's bone names.
// The recipes themselves (locomotion.mjs, carry.mjs) stay about intent.

import { qMul, qConj, qFromAxisAngle, qRotV, qMean, vSub, vNorm } from './quat.mjs';
import { fk, getQuat, setQuat, getVec3, setVec3, UP, FORWARD, LEFT } from './skeleton.mjs';

export const SIDES = ['l', 'r'];
// Mirrors a world-space correction between arms: the left arm hangs by rotating
// -90 degrees about model +Z, the right by +90. The elbow and finger curls
// mirror on the same sign.
export const SIDE_SIGN = { l: -1, r: 1 };
export const OUT_OF_PLANE = [0, 0, 1]; // model forward, the axis the arms drop about

export const SPINE = ['spine_01', 'spine_02', 'spine_03'];
export const NECK = ['neck_01', 'Head'];
export const FINGERS = ['index', 'middle', 'ring', 'pinky'];
export const KNUCKLES = ['01', '02', '03'];

// Re-express a model-space rotation in a bone's parent's bind frame, so it can be
// stored as a local rotation: local = (Wp^-1 · delta · Wp) · base. Hinges (elbow,
// knuckles) want this — the joint should track whatever the limb above it does.
export function inParentFrame(skel, bone, delta) {
  const wp = skel.parentBindWorld(bone);
  return qMul(qMul(qConj(wp), delta), wp);
}

export const setFromRest = (skel, bone, delta) =>
  qMul(inParentFrame(skel, bone, delta), skel.rest(bone).r);

// The local rotation that puts a bone at an absolute model-space orientation
// (`delta` applied to its bind orientation), given where its parent actually is
// this frame. The shoulders want this rather than inParentFrame: an arm hangs
// under gravity, so it must not inherit the torso's pitch — and the carry-walk
// source walks with a pronounced pelvis pitch, which otherwise rides all the way
// up the spine and leaves both arms reaching ~33° forward.
export function setInWorld(skel, bone, delta, parentWorld) {
  return qMul(qConj(parentWorld), qMul(delta, skel.bindWorld.get(bone)));
}

// Signed sagittal swing of a limb segment, read from FK: 0 hanging straight
// down, positive forward. This is how a recipe recovers a source clip's gait phase.
export function limbAngle(world, from, to) {
  const dir = vNorm(vSub(world.get(to).pos, world.get(from).pos));
  const forward = dir[0] * FORWARD[0] + dir[1] * FORWARD[1] + dir[2] * FORWARD[2];
  const down = -(dir[0] * UP[0] + dir[1] * UP[1] + dir[2] * UP[2]);
  return Math.atan2(forward, down);
}

// Subtract a bone's average offset-from-rest over the clip, keeping the motion
// around it. This removes a source's constant lean without flattening the
// torso's own sway.
export function removeMeanOffset(pose, skel, bones) {
  for (const bone of bones) {
    if (!skel.has(bone)) continue;
    const rest = skel.rest(bone).r;
    const restInv = qConj(rest);
    const deltas = [];
    for (let f = 0; f < pose.frames; f++) deltas.push(qMul(restInv, getQuat(pose, bone, f)));
    const meanInv = qConj(qMean(deltas));
    for (let f = 0; f < pose.frames; f++) {
      setQuat(pose, bone, f, qMul(rest, qMul(meanInv, deltas[f])));
    }
  }
}

/**
 * Replace the whole upper body with an authored arm pose.
 *
 * `cfg.shoulderDrop` is the angle the arm swings out of its sideways bind pose
 * about model +Z: **positive drops the arm to the side, negative raises it over
 * the head**. That sign is the entire difference between a walk's swinging arms
 * and a carry's overhead hold.
 *
 * `phase` is an optional per-side, per-frame array in [-1, 1] driving the
 * fore/aft swing; omit it for a static hold.
 *
 * `cfg` may also be a function of the frame index, for a pose that travels over
 * the clip rather than holding — that is how the throw whips the arms over.
 */
export function authorArms(pose, skel, cfg, phase = null) {
  const at = typeof cfg === 'function' ? cfg : () => cfg;
  for (let f = 0; f < pose.frames; f++) {
    const c = at(f);
    // A source's carry pose shrugs the shoulders; put them back where the rig
    // rests, then read where that actually leaves them once the torso is
    // accounted for.
    for (const s of SIDES) setQuat(pose, `clavicle_${s}`, f, skel.rest(`clavicle_${s}`).r);
    const world = fk(pose, skel, f);

    for (const s of SIDES) {
      const sign = SIDE_SIGN[s];
      const p = phase ? phase[s][f] : 0;

      // Arm swung out of the bind pose (about model +Z), then fore/aft (about
      // model +X, where negative is forward). Each arm opposes the leg on its own
      // side, which is what feeding that side's thigh phase straight through does.
      const drop = qFromAxisAngle(OUT_OF_PLANE, sign * c.shoulderDrop);
      const swing = qFromAxisAngle(LEFT, p * (c.shoulderSwing ?? 0) + (c.shoulderBias ?? 0));
      setQuat(pose, `upperarm_${s}`, f,
        setInWorld(skel, `upperarm_${s}`, qMul(swing, drop), world.get(`clavicle_${s}`).rot));

      // In the bind pose the arm points sideways, so the elbow hinges about
      // model +Y. It closes further as the arm travels forward.
      const bend = c.elbowBase + (c.elbowSwing ?? 0) * -p;
      setQuat(pose, `lowerarm_${s}`, f,
        setFromRest(skel, `lowerarm_${s}`, qFromAxisAngle(UP, sign * bend)));

      setQuat(pose, `hand_${s}`, f, c.handTilt
        ? setFromRest(skel, `hand_${s}`, qFromAxisAngle(LEFT, c.handTilt))
        : skel.rest(`hand_${s}`).r);

      // The grip: a relaxed curl for a swinging arm, a hard one to hold a load.
      const curl = qFromAxisAngle(OUT_OF_PLANE, sign * c.fingerCurl);
      for (const finger of FINGERS) {
        for (const knuckle of KNUCKLES) {
          const bone = `${finger}_${knuckle}_${s}`;
          if (skel.has(bone)) setQuat(pose, bone, f, setFromRest(skel, bone, curl));
        }
      }
      const thumbCurl = qFromAxisAngle(UP, sign * (c.thumbCurl ?? 0));
      for (const knuckle of KNUCKLES) {
        const bone = `thumb_${knuckle}_${s}`;
        if (!skel.has(bone)) continue;
        setQuat(pose, bone, f, c.thumbCurl
          ? setFromRest(skel, bone, thumbCurl)
          : skel.rest(bone).r);
      }
    }
  }
}

// Forward pitch of a bone relative to its bind orientation, in model space.
// Positive leans toward +Z (forward).
export function worldPitch(world, skel, bone) {
  const v = qRotV(qMul(world.get(bone).rot, qConj(skel.bindWorld.get(bone))), UP);
  return Math.atan2(v[2], v[1]);
}

export function meanPitch(pose, skel, bone) {
  let sum = 0;
  for (let f = 0; f < pose.frames; f++) sum += worldPitch(fk(pose, skel, f), skel, bone);
  return sum / pose.frames;
}

// Pitch the pelvis to `target` (mean forward pitch, radians) *without moving the
// legs*: each thigh is re-seated to the world orientation it already had, so the
// whole leg — and the foot on the floor — stays exactly where it was and only the
// trunk swings. A scalar target is one constant offset, so any pitch the source
// animates over the cycle survives; a per-frame array drives the hips through the
// clip instead, which is how the throw rocks back and then over.
//
// This is what un-does the carry stance. That pose tips the pelvis ~33 degrees
// back and curls the spine forward to compensate; straightening the spine alone
// just exposes the backward hip and leaves the character walking on its heels.
export function setHipPitch(pose, skel, target) {
  const mean = meanPitch(pose, skel, 'pelvis');
  const at = (f) => (typeof target === 'number' ? target : target[f]);
  for (let f = 0; f < pose.frames; f++) {
    const offset = qFromAxisAngle(LEFT, at(f) - mean);
    const before = fk(pose, skel, f);
    const legs = SIDES.map((s) => [`thigh_${s}`, before.get(`thigh_${s}`).rot]);
    setQuat(pose, 'pelvis', f,
      qMul(qConj(before.get('root').rot), qMul(offset, before.get('pelvis').rot)));
    const pelvis = fk(pose, skel, f).get('pelvis').rot;
    for (const [bone, world] of legs) setQuat(pose, bone, f, qMul(qConj(pelvis), world));
  }
}

// Lowest point of either foot in model space — the floor contact for that frame.
export function groundContact(pose, skel, f) {
  const world = fk(pose, skel, f);
  let lowest = Infinity;
  for (const s of SIDES) {
    for (const bone of [`foot_${s}`, `ball_${s}`, `ball_leaf_${s}`]) {
      if (skel.has(bone)) lowest = Math.min(lowest, world.get(bone).pos[1]);
    }
  }
  return lowest;
}

// Re-seat the body so the planted foot meets `floor` again after the legs were
// exaggerated. Pelvis translation is authored in the root bone's frame, which is
// not model space on this rig, so the lift is converted through it.
export function lockFeetToFloor(pose, skel, floor) {
  let maxLift = 0;
  for (let f = 0; f < pose.frames; f++) {
    const lift = floor - groundContact(pose, skel, f);
    maxLift = Math.max(maxLift, Math.abs(lift));
    const upInRoot = qRotV(qConj(fk(pose, skel, f).get('root').rot), UP);
    const t = getVec3(pose, 'pelvis', f);
    setVec3(pose, 'pelvis', f, [
      t[0] + upInRoot[0] * lift,
      t[1] + upInRoot[1] * lift,
      t[2] + upInRoot[2] * lift,
    ]);
  }
  return maxLift;
}

// Lean a chain of bones about the model's left/right axis, on top of whatever
// they already do. `weights` optionally scales the lean per frame — negative
// arches the chain the other way — so one authored fold can play out over a clip.
export function leanBones(pose, skel, bones, anglePer, weights = null) {
  for (let f = 0; f < pose.frames; f++) {
    const weight = weights ? weights[f] : 1;
    bones.forEach((bone, i) => {
      if (!skel.has(bone)) return;
      const angle = (Array.isArray(anglePer) ? anglePer[i] : anglePer) * weight;
      const delta = inParentFrame(skel, bone, qFromAxisAngle(LEFT, angle));
      setQuat(pose, bone, f, qMul(delta, getQuat(pose, bone, f)));
    });
  }
}
