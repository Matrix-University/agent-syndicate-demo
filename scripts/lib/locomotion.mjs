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

import { qMul, qConj, qScaleAngle, qMean, DEG } from './quat.mjs';
import { readPose, clonePose, fk, getQuat, setQuat, writeClip } from './skeleton.mjs';
import {
  SIDES, SPINE, NECK, authorArms, limbAngle, removeMeanOffset, setHipPitch,
  meanPitch, groundContact, lockFeetToFloor, leanBones,
} from './pose.mjs';

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
  authorArms(walk, skel, WALK, phase);
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
  authorArms(run, skel, RUN, phase);
  const footLockMaxLift = lockFeetToFloor(run, skel, floor);
  writeClip(doc, 'Run', run, skel, runDuration / sourceDuration);

  return {
    sourceDuration, frames: base.frames, amplitudeDeg, centreDeg, floor,
    hipPitchDeg: neutralPitch / DEG, footLockMaxLift: Math.max(walkLift, footLockMaxLift),
  };
}
