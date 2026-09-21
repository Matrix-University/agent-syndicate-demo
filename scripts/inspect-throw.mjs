// Sanity-check the baked throw: where the hands actually travel, whether both of
// them do the work, and whether the feet stay on the floor. Run after a bake.
//
//   node scripts/inspect-throw.mjs [file.glb] [clip ...]
//
// The numbers that matter for the car heave:
//   reach     hand position relative to the pelvis, in model space. A heave wants
//             it to go UP and BACK on the wind-up, then FORWARD through release.
//   asymmetry sideways gap between the two hands' fore/aft and vertical travel.
//             Near zero means two hands on the same object; a one-armed library
//             throw (`Throw`, UAL2's OverhandThrow) scores far off it, which is
//             exactly why it reads as a punch.
//   trunk     pelvis-to-neck line off vertical, positive folded forward. Cheap to
//             author far past what a body does — anything beyond ~55 degrees at
//             the release stops reading as a heave and starts reading as a bow.

import { NodeIO } from '@gltf-transform/core';
import { buildSkeleton, readPose, fk } from './lib/skeleton.mjs';
import { vSub, vNorm, DEG } from './lib/quat.mjs';

const [, , FILE = 'models-src/agent-animated.glb', ...only] = process.argv;
const CLIPS = only.length ? only : ['Throw_Overhead', 'Throw'];

const doc = await new NodeIO().read(FILE);
const root = doc.getRoot();
const skel = buildSkeleton(root);

for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (!CLIPS.includes(name)) continue;
  const pose = readPose(anim, skel);
  const duration = pose.times[pose.frames - 1];

  const rows = [];
  for (let f = 0; f < pose.frames; f++) {
    const world = fk(pose, skel, f);
    const pelvis = world.get('pelvis').pos;
    const head = world.get('Head').pos;
    const hand = (s) => world.get(`hand_${s}`).pos;
    let floor = Infinity;
    for (const b of ['foot_l', 'ball_l', 'ball_leaf_l', 'foot_r', 'ball_r', 'ball_leaf_r']) {
      if (skel.has(b)) floor = Math.min(floor, world.get(b).pos[1]);
    }
    // Trunk line off vertical, positive folded forward.
    const trunk = vNorm(vSub(world.get('neck_01').pos, pelvis));
    rows.push({
      t: pose.times[f],
      trunk: Math.atan2(trunk[2], trunk[1]) / DEG,
      // Mean of the two hands, so a two-handed heave reads as one trajectory.
      fwd: (hand('l')[2] + hand('r')[2]) / 2 - pelvis[2],
      up: (hand('l')[1] + hand('r')[1]) / 2 - pelvis[1],
      overHead: (hand('l')[1] + hand('r')[1]) / 2 - head[1],
      split: Math.abs(hand('l')[0] - hand('r')[0]),
      asymFwd: Math.abs(hand('l')[2] - hand('r')[2]),
      asymUp: Math.abs(hand('l')[1] - hand('r')[1]),
      floor,
    });
  }

  const at = (u) => rows[Math.round(u * (pose.frames - 1))];
  const peak = rows.reduce((a, b) => (b.fwd > a.fwd ? b : a));
  const back = rows.reduce((a, b) => (b.fwd < a.fwd ? b : a));
  const span = (k) => Math.max(...rows.map((r) => r[k])) - Math.min(...rows.map((r) => r[k]));

  console.log(`\n=== ${name}  (${pose.frames} frames, ${duration.toFixed(2)}s)`);
  for (const [label, u] of [['hold', 0], ['windup', 0.28], ['release', 0.44], ['follow', 0.66], ['recover', 1]]) {
    const r = at(u);
    console.log(
      `  ${label.padEnd(8)} t=${r.t.toFixed(2)}s  hands fwd ${r.fwd.toFixed(2)} ` +
      `up ${r.up.toFixed(2)} (${r.overHead >= 0 ? '+' : ''}${r.overHead.toFixed(2)} vs head) ` +
      `apart ${r.split.toFixed(2)}  trunk ${r.trunk >= 0 ? '+' : ''}${r.trunk.toFixed(0)}°`
    );
  }
  console.log(
    `  travel     back ${back.fwd.toFixed(2)}m @${back.t.toFixed(2)}s -> ` +
    `forward ${peak.fwd.toFixed(2)}m @${peak.t.toFixed(2)}s  ` +
    `(want the peak at or just after the 0.42s release)`
  );
  console.log(
    `  asymmetry  fore/aft ${Math.max(...rows.map((r) => r.asymFwd)).toFixed(3)}m  ` +
    `vertical ${Math.max(...rows.map((r) => r.asymUp)).toFixed(3)}m  ` +
    `(want ~0: both hands on the car, not one cocked back like a jab)`
  );
  console.log(
    `  foot contact spread ${(span('floor') * 100).toFixed(1)}cm off the floor`
  );
}
