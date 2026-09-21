// Author the overhead-carry clips — the pose for hauling a car around.
//
// Why this exists: UAL2's only "holding something" poses hold it *low*.
// `Walk_Carry_Loop` cradles a crate at the chest and `Idle_Lantern_Loop` dangles
// a lantern at the hip. Bound to a car held over the head, either one leaves the
// prop floating above hands that never reach it.
//
// So, the same trade as locomotion.mjs: keep the lower body, which is real
// animation (a floor-locked walk; a breathing idle), and author the upper body —
// arms raised, elbows braced out, fingers gripping, trunk leaned back under the
// load. `authorArms` already does exactly this; raising rather than dropping the
// arms is a sign flip on `shoulderDrop`.
//
// Two clips share the recipe because they are the same hold over different legs:
//   Carry_Overhead_Loop  <- Walk_Carry_Loop's stride   (moving)
//   Carry_Overhead_Idle  <- Idle_No_Loop's stance      (standing)
//
// These are ADDITIVE. The library's own chest-height carry walk still ships
// untouched as `Carry_Loop` (parked for a future carry-object state, per
// CLAUDE.md) — don't overwrite it to save a clip.

import { DEG } from './quat.mjs';
import { readPose, clonePose, writeClip } from './skeleton.mjs';
import {
  SPINE, NECK, authorArms, removeMeanOffset, setHipPitch, meanPitch,
  groundContact, lockFeetToFloor, leanBones,
} from './pose.mjs';

const CARRY = {
  // NEGATIVE raises the arms instead of dropping them (see authorArms). 62° short
  // of straight up puts the hands above and a little outside the head, where the
  // chassis sits, rather than pinched together over the crown.
  shoulderDrop: -62 * DEG,
  shoulderBias: -14 * DEG, // the load rides slightly forward of the shoulders
  elbowBase: 46 * DEG,     // braced, not locked straight
  fingerCurl: 52 * DEG,    // a real grip on the underside
  thumbCurl: 30 * DEG,
  handTilt: -22 * DEG,     // palms rolled up under the load

  // Counterweight: the trunk leans back and the head tips up to look at what it
  // is holding. hipLean is negative *because* the mass is overhead — a forward
  // lean here reads as carrying a box, not pressing a car.
  hipLean: -9 * DEG,
  spineLean: [-5 * DEG, -4 * DEG, -3 * DEG],
  headLean: 7 * DEG,
};

/**
 * Write `Carry_Overhead_Loop` (walking) and `Carry_Overhead_Idle` (standing) into
 * `doc` from the two named sources. Both sources are left in place — neither is
 * consumed, so the caller can still ship them.
 */
export function synthesizeCarry(doc, skel, walkSource, idleSource, opts = {}) {
  // Carry_Loop is the same legs as `Walk`, so its duration is the walk's 0.95s
  // scaled by how much slower a loaded walk is (Player.CARRY_SPEED_WALK vs
  // speedWalk) — otherwise the feet skate at carry speed.
  const { walkDuration = 1.42, idleDuration = 2.5, postureClip = 'Idle_No_Loop' } = opts;
  const clips = doc.getRoot().listAnimations();
  const find = (name) => {
    const clip = clips.find((a) => a.getName() === name);
    if (!clip) throw new Error(`synthesizeCarry: clip "${name}" not found`);
    return clip;
  };

  // The neutral standing hip pitch, measured on this rig — the same reference
  // the locomotion recipe uses, so the carry lean is honestly "back from
  // upright" and not "back from whatever the source was doing".
  const posture = clips.find((a) => a.getName() === postureClip);
  const neutralPitch = posture ? meanPitch(readPose(posture, skel), skel, 'pelvis') : 0;

  const built = [];
  for (const [name, source, duration] of [
    ['Carry_Overhead_Loop', walkSource, walkDuration],
    ['Carry_Overhead_Idle', idleSource, idleDuration],
  ]) {
    const base = readPose(find(source), skel);
    const floor = Math.min(
      ...Array.from({ length: base.frames }, (_, f) => groundContact(base, skel, f))
    );

    const pose = clonePose(base);
    removeMeanOffset(pose, skel, [...SPINE, ...NECK]);
    setHipPitch(pose, skel, neutralPitch + CARRY.hipLean);
    leanBones(pose, skel, SPINE, CARRY.spineLean);
    leanBones(pose, skel, NECK, CARRY.headLean);
    authorArms(pose, skel, CARRY);
    const lift = lockFeetToFloor(pose, skel, floor);

    const sourceDuration = base.times[base.times.length - 1];
    writeClip(doc, name, pose, skel, duration / sourceDuration);
    built.push({ name, source, frames: base.frames, footLockMaxLift: lift });
  }

  return { clips: built, hipPitchDeg: (neutralPitch + CARRY.hipLean) / DEG };
}
