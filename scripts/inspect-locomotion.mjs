// Check the baked locomotion clips: arm swing, gait phase relationship,
// spine lean and per-frame foot contact. Run after a bake to confirm the
// synthesized Walk/Run retain ground contact and the run has a flight phase.
//
//   node scripts/inspect-locomotion.mjs [file.glb] [clip ...]

import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { buildSkeleton, readPose, fk, getQuat, UP, FORWARD } from './lib/skeleton.mjs';
import { qMul, qConj, vSub, vNorm, DEG } from './lib/quat.mjs';

const [, , FILE = 'models-src/agent-animated.glb', ...only] = process.argv;

const doc = await new NodeIO().read(FILE);
const root = doc.getRoot();
const skel = buildSkeleton(root);

const sagittal = (world, from, to) => {
  const d = vNorm(vSub(world.get(to).pos, world.get(from).pos));
  return Math.atan2(
    d[0] * FORWARD[0] + d[1] * FORWARD[1] + d[2] * FORWARD[2],
    -(d[0] * UP[0] + d[1] * UP[1] + d[2] * UP[2]),
  ) / DEG;
};
const offsetDeg = (pose, bone, f) => {
  const d = qMul(qConj(skel.rest(bone).r), getQuat(pose, bone, f));
  return 2 * Math.acos(Math.min(1, Math.abs(d[3]))) / DEG;
};
const range = (v) => `${Math.min(...v).toFixed(1)}..${Math.max(...v).toFixed(1)}`;

for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (only.length && !only.includes(name)) continue;
  const pose = readPose(anim, skel);
  const track = { armL: [], armR: [], legL: [], legR: [], kneeL: [], kneeR: [], elbowL: [], spine: [], floor: [], hip: [], hand: [] };

  for (let f = 0; f < pose.frames; f++) {
    const world = fk(pose, skel, f);
    track.armL.push(sagittal(world, 'upperarm_l', 'lowerarm_l'));
    track.armR.push(sagittal(world, 'upperarm_r', 'lowerarm_r'));
    track.legL.push(sagittal(world, 'thigh_l', 'calf_l'));
    track.legR.push(sagittal(world, 'thigh_r', 'calf_r'));
    track.kneeL.push(track.legL.at(-1) - sagittal(world, 'calf_l', 'foot_l'));
    track.kneeR.push(track.legR.at(-1) - sagittal(world, 'calf_r', 'foot_r'));
    track.elbowL.push(offsetDeg(pose, 'lowerarm_l', f));
    track.spine.push(offsetDeg(pose, 'spine_02', f));
    let lowest = Infinity;
    for (const b of ['foot_l', 'ball_l', 'ball_leaf_l', 'foot_r', 'ball_r', 'ball_leaf_r']) {
      if (skel.has(b)) lowest = Math.min(lowest, world.get(b).pos[1]);
    }
    track.floor.push(lowest);
    track.hip.push(world.get('pelvis').pos[1]);
    // Sideways gap between each hand and the hip on its side: negative means the
    // hand is punching through the body.
    for (const s of ['l', 'r']) {
      const gap = (world.get(`hand_${s}`).pos[0] - world.get(`thigh_${s}`).pos[0]) * (s === 'l' ? 1 : -1);
      track.hand.push(gap);
    }
  }

  // A correct gait has each arm swinging opposite the leg on the same side.
  const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / a.length;
    const mb = b.reduce((s, v) => s + v, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
    }
    return num / (Math.sqrt(da * db) || 1);
  };

  console.log(`\n=== ${name}  (${pose.frames} frames, ${pose.times[pose.frames - 1].toFixed(2)}s)`);
  console.log(`  thigh swing L ${range(track.legL)}°   R ${range(track.legR)}°`);
  console.log(`  knee flexion L ${range(track.kneeL)}°   R ${range(track.kneeR)}°`);
  console.log(`  arm swing   L ${range(track.armL)}°   R ${range(track.armR)}°`);
  console.log(`  elbow bend    ${range(track.elbowL)}°   spine offset ${range(track.spine)}°`);
  console.log(`  arm/leg same-side correlation  L ${corr(track.armL, track.legL).toFixed(2)}  ` +
    `R ${corr(track.armR, track.legR).toFixed(2)}   (want negative: arms oppose legs)`);
  console.log(`  foot contact  ${range(track.floor)}  (spread ` +
    `${((Math.max(...track.floor) - Math.min(...track.floor)) * 100).toFixed(1)}cm off the floor)`);
  console.log(`  pelvis bob    ${((Math.max(...track.hip) - Math.min(...track.hip)) * 100).toFixed(1)}cm ` +
    `(lowest ${Math.min(...track.hip).toFixed(3)})   hand/hip side gap ` +
    `${range(track.hand)} (want > 0: hands clear of the body)`);

  if (name === 'Walk' || name === 'Run') {
    const floorSpread = Math.max(...track.floor) - Math.min(...track.floor);
    assert.ok(corr(track.armL, track.legL) < -0.95 && corr(track.armR, track.legR) < -0.95,
      `${name}: arms must oppose the legs`);
    if (name === 'Walk') {
      assert.ok(floorSpread < 0.001, 'Walk must stay floor-locked');
    } else {
      assert.ok(floorSpread > 0.04 && floorSpread < 0.12, 'Run needs a short flight phase');
      for (const knees of [track.kneeL, track.kneeR]) {
        assert.ok(Math.min(...knees) > 0 && Math.max(...knees) > 95 && Math.max(...knees) < 140,
          'Run needs bent-knee recovery without hyperextension');
      }
      const first = fk(pose, skel, 0);
      const last = fk(pose, skel, pose.frames - 1);
      for (const bone of skel.order) {
        const gap = Math.hypot(...vSub(first.get(bone).pos, last.get(bone).pos));
        assert.ok(gap < 0.001, `Run loop must close at ${bone}`);
      }
    }
    console.log(`  PASS: ${name} gait checks`);
  }
}
