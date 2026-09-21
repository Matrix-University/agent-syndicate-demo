// Author `Throw_Overhead` — heaving a car off the head and down the lane.
//
// Why this exists: UAL2's only throw is `OverhandThrow`, a one-armed grenade
// toss. Bound to the car heave it reads as a punch — the off hand never leaves
// the hip while a two-ton chassis is supposedly overhead in both hands.
//
// So, the same trade as locomotion.mjs and carry.mjs: keep what is real (the
// idle's planted stance) and author what is missing. Here that is the whole
// heave, because nothing in the library resembles it:
//
//   hold    the Carry_Overhead_Idle pose exactly, so the crossfade in is invisible
//   windup  arms cocked back past vertical, trunk arched back over the heels
//   release arms whipped forward and snapped straight, hips and spine driving over
//   follow  arms carried down and through, the deepest fold
//   recover back to a neutral upright stance, arms down — the pose the controller
//           crossfades out of into locomotion once the one-shot finishes
//
// The lower body is one frozen frame of the idle rather than animation: Player
// roots the character for the whole throw, so the feet do not travel. What sells
// the weight is the pelvis, which rocks back and then over (`setHipPitch` keeps
// the legs planted while it does), and the foot-lock re-seating the body on top
// of it each frame.

import { DEG } from './quat.mjs';
import { readPose, writeClip } from './skeleton.mjs';
import {
  SPINE, NECK, authorArms, setHipPitch, meanPitch, groundContact, lockFeetToFloor,
  leanBones,
} from './pose.mjs';

// Phase times, normalized over the clip. RELEASE sits at
// Player.THROW_PROFILE.release / .duration — the frame the prop leaves the hands
// — which is why the arms reach full extension there and not at the end of the
// swing. Move one and the other has to move with it.
const HOLD = 0, WINDUP = 0.28, RELEASE = 0.44, FOLLOW = 0.66, RECOVER = 1;

// Keyed as [phase, value] and splined (see `track`). Angles are degrees and feed
// authorArms/setHipPitch; `spineFold`/`headFold` are weights scaling the fold
// angles below, where negative arches backward.
//
// shoulderDrop is negative for a raised arm (see authorArms), so the arms stay
// overhead from the hold through the release and only come down on the
// follow-through. shoulderBias is the fore/aft swing about the model's left/right
// axis, so its sense depends on where the arm is pointing: authorArms documents
// negative as forward, which holds for an arm hanging at the side — with the arm
// RAISED, the same rotation carries it the other way and positive is forward.
// Every key here but `recover` is an overhead arm, hence the positive whip.
const TRACKS = {
  shoulderDrop: [[HOLD, -62], [WINDUP, -80], [RELEASE, -72], [FOLLOW, -52], [RECOVER, 80]],
  shoulderBias: [[HOLD, -14], [WINDUP, -36], [RELEASE, 86], [FOLLOW, 106], [RECOVER, 0]],
  elbowBase: [[HOLD, 46], [WINDUP, 76], [RELEASE, 9], [FOLLOW, 20], [RECOVER, 14]],
  fingerCurl: [[HOLD, 52], [WINDUP, 58], [RELEASE, 24], [FOLLOW, 14], [RECOVER, 16]],
  thumbCurl: [[HOLD, 30], [WINDUP, 34], [RELEASE, 12], [FOLLOW, 6], [RECOVER, 0]],
  handTilt: [[HOLD, -22], [WINDUP, -28], [RELEASE, -4], [FOLLOW, 4], [RECOVER, 0]],
  hipPitch: [[HOLD, -9], [WINDUP, -24], [RELEASE, 10], [FOLLOW, 14], [RECOVER, 0]],
  spineFold: [[HOLD, -0.35], [WINDUP, -1], [RELEASE, 0.5], [FOLLOW, 0.8], [RECOVER, 0]],
  // The head does NOT follow the fold down: this character watches the car go.
  // Tracking the spine instead left it staring at its own feet on the release.
  headFold: [[HOLD, -0.8], [WINDUP, -1], [RELEASE, -0.1], [FOLLOW, 0.15], [RECOVER, 0]],
};

const SPINE_FOLD = [11 * DEG, 9 * DEG, 7 * DEG]; // spine_01..03, compounding up
const HEAD_FOLD = 9 * DEG;                       // per neck bone
const DEGREE_TRACKS = new Set([
  'shoulderDrop', 'shoulderBias', 'elbowBase', 'fingerCurl', 'thumbCurl',
  'handTilt', 'hipPitch',
]);

const FPS = 30; // authored density; resample() drops whatever stayed constant

/**
 * Write `Throw_Overhead` into `doc`, built over one frozen frame of `postureClip`.
 * `duration` must match Player's THROW_PROFILE.duration so the clip can play at
 * rate 1 and the release lands on the authored extension.
 */
export function synthesizeThrow(doc, skel, postureClip = 'Idle_No_Loop', opts = {}) {
  const { duration = 0.95, postureFrame = 0 } = opts;
  const source = doc.getRoot().listAnimations().find((a) => a.getName() === postureClip);
  if (!source) throw new Error(`synthesizeThrow: clip "${postureClip}" not found`);

  const frames = Math.round(duration * FPS) + 1;
  const pose = freezeFrame(readPose(source, skel), postureFrame, frames, duration);
  const floor = groundContact(pose, skel, 0);

  // Sample every track once, up front: authorArms wants a per-frame config and
  // the trunk wants per-frame weights, and both index the same phase.
  const sampled = {};
  for (const [name, keys] of Object.entries(TRACKS)) {
    const curve = track(keys);
    const scale = DEGREE_TRACKS.has(name) ? DEG : 1;
    sampled[name] = Array.from(
      { length: frames }, (_, f) => curve(f / (frames - 1)) * scale
    );
  }

  // The rig's own neutral standing pitch, so the hip track reads as "degrees off
  // upright" rather than "off whatever the idle happened to be doing".
  const neutral = meanPitch(pose, skel, 'pelvis');
  setHipPitch(pose, skel, sampled.hipPitch.map((p) => neutral + p));
  leanBones(pose, skel, SPINE, SPINE_FOLD, sampled.spineFold);
  leanBones(pose, skel, NECK, HEAD_FOLD, sampled.headFold);
  authorArms(pose, skel, (f) => ({
    shoulderDrop: sampled.shoulderDrop[f],
    shoulderBias: sampled.shoulderBias[f],
    elbowBase: sampled.elbowBase[f],
    fingerCurl: sampled.fingerCurl[f],
    thumbCurl: sampled.thumbCurl[f],
    handTilt: sampled.handTilt[f],
  }));
  const footLockMaxLift = lockFeetToFloor(pose, skel, floor);

  writeClip(doc, 'Throw_Overhead', pose, skel);
  return {
    name: 'Throw_Overhead', frames, duration, footLockMaxLift,
    releaseAt: RELEASE * duration,
  };
}

// One frame of a pose, held across a fresh uniform timeline. The source clip only
// supplies a stance here — everything that moves is authored on top.
function freezeFrame(base, frame, frames, duration) {
  const bones = new Map();
  for (const [name, b] of base.bones) {
    const held = {
      translation: new Float32Array(frames * 3),
      rotation: new Float32Array(frames * 4),
      scale: new Float32Array(frames * 3),
    };
    for (let f = 0; f < frames; f++) {
      held.translation.set(b.translation.subarray(frame * 3, frame * 3 + 3), f * 3);
      held.rotation.set(b.rotation.subarray(frame * 4, frame * 4 + 4), f * 4);
      held.scale.set(b.scale.subarray(frame * 3, frame * 3 + 3), f * 3);
    }
    bones.set(name, held);
  }
  const times = Array.from({ length: frames }, (_, f) => (f / (frames - 1)) * duration);
  return { times, frames, bones, extra: [] };
}

// Catmull-Rom through [phase, value] keys, with flat tangents at the ends.
//
// Not smoothstep-per-segment, which is what the static recipes would suggest:
// that eases to a dead stop at every key, and a throw whose arms pause at the
// moment of release has no whip in it. The interior tangents carry the swing
// through, and the flat ends let it settle out of the hold and into the recovery.
function track(keys) {
  const t = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const last = keys.length - 1;
  const m = v.map((_, i) => (
    i === 0 || i === last ? 0 : (v[i + 1] - v[i - 1]) / (t[i + 1] - t[i - 1])
  ));

  return (u) => {
    if (u <= t[0]) return v[0];
    if (u >= t[last]) return v[last];
    let i = 0;
    while (u > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const x = (u - t[i]) / h, x2 = x * x, x3 = x2 * x;
    return (2 * x3 - 3 * x2 + 1) * v[i] + (x3 - 2 * x2 + x) * h * m[i] +
      (-2 * x3 + 3 * x2) * v[i + 1] + (x3 - x2) * h * m[i + 1];
  };
}
