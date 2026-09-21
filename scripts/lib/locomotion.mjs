// Author natural Walk and Run clips from the library's carry walk.
//
// Why this exists: the Quaternius UAL2 library ships no neutral walk and no run
// at all. Its only forward locomotion is `Walk_Carry_Loop`, and in that clip the
// legs are a genuine human walk while the arms are LOCKED in a carry pose — a
// constant 66.5 degrees off rest on every frame, never swinging — over a static
// ~17 degree spine lean. Bound to WALK the character strolled as if holding a
// crate, and RUN fell through to that very same clip.
//
// So we keep what is real (the lower body, which is floor-locked and correct)
// and author what is missing (the upper body). Arm phase is read off the source's
// own thigh swing rather than assumed, so the arms cannot fall out of step with
// the feet however the source clip is timed.
//
// Run is that walk with the leg swing exaggerated, a forward lean, a wider
// bent-elbow swing and a quicker cadence — with pelvis height re-solved per
// frame so the planted foot still meets the floor after the legs are stretched.

import { qMul, qConj, qFromAxisAngle, qRotV, qScaleAngle, qMean, vSub, vNorm, DEG } from './quat.mjs';
import {
  readPose, clonePose, fk, getQuat, setQuat, getVec3, setVec3, writeClip,
  UP, FORWARD, LEFT,
} from './skeleton.mjs';

const SIDES = ['l', 'r'];
// Mirrors a world-space correction between arms: the left arm hangs by rotating
// -90 degrees about model +Z, the right by +90. The elbow and finger curls
// mirror on the same sign.
const SIDE_SIGN = { l: -1, r: 1 };
const OUT_OF_PLANE = [0, 0, 1]; // model forward, the axis the arms drop about

const SPINE = ['spine_01', 'spine_02', 'spine_03'];
const NECK = ['neck_01', 'Head'];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const KNUCKLES = ['01', '02', '03'];
const LEG_SEGMENTS = ['thigh', 'calf'];

const WALK = {
  shoulderDrop: 82 * DEG,  // under 90 so the arms clear the ribs
  shoulderSwing: 24 * DEG, // peak fore/aft swing
  shoulderBias: 0,
  elbowBase: 14 * DEG,
  elbowSwing: 12 * DEG,    // the elbow closes on the forward swing
  fingerCurl: 16 * DEG,
  hipLean: 6 * DEG,        // forward pitch at the hip, over the neutral posture
};

const RUN = {
  shoulderDrop: 76 * DEG,
  shoulderSwing: 44 * DEG,
  shoulderBias: -10 * DEG, // the whole swing rides forward under the lean
  elbowBase: 72 * DEG,     // arms up and closed, as in a real run
  elbowSwing: 18 * DEG,
  fingerCurl: 34 * DEG,
  hipLean: 14 * DEG,       // a run drives from the hips, well ahead of the walk
  legGain: 1.35,           // exaggerate the walk's thigh/calf swing
  lean: [4 * DEG, 3 * DEG, 2 * DEG], // spine_01..03, compounding up the torso
  headCounter: -5.5 * DEG, // per neck bone, to hold the eyeline up
};

// Re-express a model-space rotation in a bone's parent's bind frame, so it can be
// stored as a local rotation: local = (Wp^-1 · delta · Wp) · base. Hinges (elbow,
// knuckles) want this — the joint should track whatever the limb above it does.
function inParentFrame(skel, bone, delta) {
  const wp = skel.parentBindWorld(bone);
  return qMul(qMul(qConj(wp), delta), wp);
}
const setFromRest = (skel, bone, delta) => qMul(inParentFrame(skel, bone, delta), skel.rest(bone).r);

// The local rotation that puts a bone at an absolute model-space orientation
// (`delta` applied to its bind orientation), given where its parent actually is
// this frame. The shoulders want this rather than inParentFrame: an arm hangs
// under gravity, so it must not inherit the torso's pitch — and this source
// walks with a pronounced pelvis pitch from the carry crouch, which otherwise
// rides all the way up the spine and leaves both arms reaching ~33° forward.
function setInWorld(skel, bone, delta, parentWorld) {
  return qMul(qConj(parentWorld), qMul(delta, skel.bindWorld.get(bone)));
}

// Signed sagittal swing of a limb segment, read from FK: 0 hanging straight
// down, positive forward. This is how we recover the source clip's gait phase.
function limbAngle(world, from, to) {
  const dir = vNorm(vSub(world.get(to).pos, world.get(from).pos));
  const forward = dir[0] * FORWARD[0] + dir[1] * FORWARD[1] + dir[2] * FORWARD[2];
  const down = -(dir[0] * UP[0] + dir[1] * UP[1] + dir[2] * UP[2]);
  return Math.atan2(forward, down);
}

// Per-side gait phase in [-1, 1], taken from the thighs of the source clip.
//
// Centred on the cycle's midrange, not on zero: this source walks in a slight
// carry crouch, so its thighs sit ~21 degrees forward of straight-down on
// average. Normalizing the raw angle would push that bias straight into the arms
// and leave them permanently reaching forward. Both sides share one centre and
// scale — it is the same gait, mirrored.
function gaitPhase(pose, skel) {
  const raw = { l: new Float32Array(pose.frames), r: new Float32Array(pose.frames) };
  let lo = Infinity, hi = -Infinity;
  for (let f = 0; f < pose.frames; f++) {
    const world = fk(pose, skel, f);
    for (const s of SIDES) {
      const angle = limbAngle(world, `thigh_${s}`, `calf_${s}`);
      raw[s][f] = angle;
      lo = Math.min(lo, angle);
      hi = Math.max(hi, angle);
    }
  }
  const centre = (hi + lo) / 2;
  const amplitude = Math.max((hi - lo) / 2, 1e-6);
  for (const s of SIDES) {
    for (let f = 0; f < pose.frames; f++) raw[s][f] = (raw[s][f] - centre) / amplitude;
  }
  return { phase: raw, amplitudeDeg: amplitude / DEG, centreDeg: centre / DEG };
}

// Subtract a bone's average offset-from-rest over the clip, keeping the motion
// around it. This removes the carry lean without flattening the torso's own
// walking sway.
function removeMeanOffset(pose, skel, bones) {
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

// Replace the whole upper body with an authored arm swing driven by `phase`.
function authorArms(pose, skel, phase, cfg) {
  for (let f = 0; f < pose.frames; f++) {
    // The carry pose shrugged the shoulders; put them back where the rig rests,
    // then read where that actually leaves them once the torso is accounted for.
    for (const s of SIDES) setQuat(pose, `clavicle_${s}`, f, skel.rest(`clavicle_${s}`).r);
    const world = fk(pose, skel, f);

    for (const s of SIDES) {
      const sign = SIDE_SIGN[s];
      const p = phase[s][f];

      // Arm dropped to the side (about model +Z), then swung fore/aft (about
      // model +X, where negative is forward). Each arm opposes the leg on its own
      // side, which is what feeding that side's thigh phase straight through does.
      const drop = qFromAxisAngle(OUT_OF_PLANE, sign * cfg.shoulderDrop);
      const swing = qFromAxisAngle(LEFT, p * cfg.shoulderSwing + cfg.shoulderBias);
      setQuat(pose, `upperarm_${s}`, f,
        setInWorld(skel, `upperarm_${s}`, qMul(swing, drop), world.get(`clavicle_${s}`).rot));

      // In the bind pose the arm points sideways, so the elbow hinges about
      // model +Y. It closes further as the arm travels forward.
      const bend = cfg.elbowBase + cfg.elbowSwing * -p;
      setQuat(pose, `lowerarm_${s}`, f, setFromRest(skel, `lowerarm_${s}`, qFromAxisAngle(UP, sign * bend)));

      setQuat(pose, `hand_${s}`, f, skel.rest(`hand_${s}`).r);

      // A relaxed curl in place of the carry grip.
      const curl = qFromAxisAngle(OUT_OF_PLANE, sign * cfg.fingerCurl);
      for (const finger of FINGERS) {
        for (const knuckle of KNUCKLES) {
          const bone = `${finger}_${knuckle}_${s}`;
          if (skel.has(bone)) setQuat(pose, bone, f, setFromRest(skel, bone, curl));
        }
      }
      for (const knuckle of KNUCKLES) {
        const bone = `thumb_${knuckle}_${s}`;
        if (skel.has(bone)) setQuat(pose, bone, f, skel.rest(bone).r);
      }
    }
  }
}

// Forward pitch of a bone relative to its bind orientation, in model space.
// Positive leans toward +Z (forward).
function worldPitch(world, skel, bone) {
  const v = qRotV(qMul(world.get(bone).rot, qConj(skel.bindWorld.get(bone))), UP);
  return Math.atan2(v[2], v[1]);
}

function meanPitch(pose, skel, bone) {
  let sum = 0;
  for (let f = 0; f < pose.frames; f++) sum += worldPitch(fk(pose, skel, f), skel, bone);
  return sum / pose.frames;
}

// Pitch the pelvis to `target` (mean forward pitch, radians) *without moving the
// legs*: each thigh is re-seated to the world orientation it already had, so the
// whole leg — and the foot on the floor — stays exactly where it was and only the
// trunk swings. Applied as one constant offset so any pitch the source animates
// over the cycle survives.
//
// This is what un-does the carry stance. That pose tips the pelvis ~33 degrees
// back and curls the spine forward to compensate; straightening the spine alone
// just exposes the backward hip and leaves the character walking on its heels.
function setHipPitch(pose, skel, target) {
  const offset = qFromAxisAngle(LEFT, target - meanPitch(pose, skel, 'pelvis'));
  for (let f = 0; f < pose.frames; f++) {
    const before = fk(pose, skel, f);
    const legs = SIDES.map((s) => [`thigh_${s}`, before.get(`thigh_${s}`).rot]);
    setQuat(pose, 'pelvis', f,
      qMul(qConj(before.get('root').rot), qMul(offset, before.get('pelvis').rot)));
    const pelvis = fk(pose, skel, f).get('pelvis').rot;
    for (const [bone, world] of legs) setQuat(pose, bone, f, qMul(qConj(pelvis), world));
  }
}

// Lowest point of either foot in model space — the floor contact for that frame.
function groundContact(pose, skel, f) {
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
function lockFeetToFloor(pose, skel, floor) {
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
// they already do.
function leanBones(pose, skel, bones, anglePer) {
  for (let f = 0; f < pose.frames; f++) {
    bones.forEach((bone, i) => {
      if (!skel.has(bone)) return;
      const angle = Array.isArray(anglePer) ? anglePer[i] : anglePer;
      const delta = inParentFrame(skel, bone, qFromAxisAngle(LEFT, angle));
      setQuat(pose, bone, f, qMul(delta, getQuat(pose, bone, f)));
    });
  }
}

/**
 * Build `Walk` and `Run` from `sourceName` and add them to `doc`. The source clip
 * is left in place for the caller to rename or drop.
 */
export function synthesizeLocomotion(doc, skel, sourceName, opts = {}) {
  const { walkDuration = 0.95, runDuration = 0.66, postureClip = 'Idle_No_Loop' } = opts;
  const clips = doc.getRoot().listAnimations();
  const source = clips.find((a) => a.getName() === sourceName);
  if (!source) throw new Error(`synthesizeLocomotion: clip "${sourceName}" not found`);

  const base = readPose(source, skel);
  const { phase, amplitudeDeg, centreDeg } = gaitPhase(base, skel);
  const sourceDuration = base.times[base.times.length - 1];
  // The floor the source stands on — the target every synthesized clip is
  // re-seated onto after its hips or legs are moved.
  const floor = Math.min(...Array.from({ length: base.frames }, (_, f) => groundContact(base, skel, f)));

  // Neutral hip pitch, taken from the rig's own idle clip rather than guessed:
  // it is an artist-authored standing posture on this exact skeleton. Falling
  // back to 0 means "bind pose upright" if that clip isn't being baked.
  const posture = clips.find((a) => a.getName() === postureClip);
  const neutralPitch = posture ? meanPitch(readPose(posture, skel), skel, 'pelvis') : 0;

  // --- Walk: the source's lower body under an authored upper body -------------
  const walk = clonePose(base);
  removeMeanOffset(walk, skel, [...SPINE, ...NECK]);
  setHipPitch(walk, skel, neutralPitch + WALK.hipLean);
  authorArms(walk, skel, phase, WALK);
  const walkLift = lockFeetToFloor(walk, skel, floor);
  writeClip(doc, 'Walk', walk, skel, walkDuration / sourceDuration);

  // --- Run: that walk, exaggerated and leaned into ----------------------------
  const run = clonePose(walk);
  // Exaggerate each leg's swing about the clip's OWN mean pose, not about the
  // bind pose. setHipPitch folds a constant counter-rotation into these locals to
  // keep the feet planted, and scaling that too would amplify the hip correction
  // and drag the whole stride forward instead of just widening it.
  for (const s of SIDES) {
    for (const segment of LEG_SEGMENTS) {
      const bone = `${segment}_${s}`;
      const rest = skel.rest(bone).r;
      const restInv = qConj(rest);
      const deltas = [];
      for (let f = 0; f < run.frames; f++) deltas.push(qMul(restInv, getQuat(run, bone, f)));
      const mean = qMean(deltas);
      const meanInv = qConj(mean);
      for (let f = 0; f < run.frames; f++) {
        const swing = qScaleAngle(qMul(meanInv, deltas[f]), RUN.legGain);
        setQuat(run, bone, f, qMul(rest, qMul(mean, swing)));
      }
    }
  }
  leanBones(run, skel, SPINE, RUN.lean);
  leanBones(run, skel, NECK, RUN.headCounter);
  setHipPitch(run, skel, neutralPitch + RUN.hipLean);
  authorArms(run, skel, phase, RUN);
  const footLockMaxLift = lockFeetToFloor(run, skel, floor);
  writeClip(doc, 'Run', run, skel, runDuration / sourceDuration);

  return {
    sourceDuration, frames: base.frames, amplitudeDeg, centreDeg, floor,
    hipPitchDeg: neutralPitch / DEG, footLockMaxLift: Math.max(walkLift, footLockMaxLift),
  };
}
