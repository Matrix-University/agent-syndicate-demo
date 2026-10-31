import { DEG } from './quat.mjs';
import { readPose, clonePose, writeClip } from './skeleton.mjs';
import { authorArms } from './pose.mjs';

// The library's shield idle raises only one hand. Keep neutral idle's stance
// and breathing, but bring both empty hands up for an unarmed guard.
export function synthesizeCombatIdle(doc, skel) {
  const source = doc.getRoot().listAnimations().find(clip => clip.getName() === 'Idle_No_Loop');
  if (!source) throw new Error('Combat_Idle requires Idle_No_Loop');
  const pose = clonePose(readPose(source, skel));
  authorArms(pose, skel, {
    shoulderDrop: 80 * DEG,
    shoulderBias: -35 * DEG,
    elbowBase: 105 * DEG,
    fingerCurl: 60 * DEG,
    thumbCurl: 30 * DEG,
    handTilt: 0,
  });
  writeClip(doc, 'Combat_Idle', pose, skel, 1);
}
