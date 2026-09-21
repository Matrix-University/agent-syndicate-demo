// Skeleton introspection + per-frame pose sampling for the bake scripts.
//
// A "pose" is the whole skeleton's local TRS for every frame of a clip, stored
// as flat typed arrays per bone. Sampling every bone (channel or not) means the
// synthesis code can read and write any bone without special-casing gaps, and
// resample() collapses whatever stayed constant back down on the way out.

import { qMul, qRotV } from './quat.mjs';

// Model-space axes of this rig in its bind pose: +Y up, +Z forward, +X to the
// character's left. Verified against the mannequin's bind pose (feet point +Z,
// left arm at +X).
export const UP = [0, 1, 0];
export const FORWARD = [0, 0, 1];
export const LEFT = [1, 0, 0];

export function buildSkeleton(root, rootBone = 'root') {
  const byName = new Map();
  const parentOf = new Map();
  for (const node of root.listNodes()) {
    const name = node.getName();
    if (name) byName.set(name, node);
    for (const child of node.listChildren()) parentOf.set(child.getName(), name);
  }
  if (!byName.has(rootBone)) throw new Error(`skeleton: no "${rootBone}" node`);

  // Depth-first so parents always precede children (FK can go in one pass).
  const order = [];
  (function walk(name) {
    order.push(name);
    for (const child of byName.get(name).listChildren()) walk(child.getName());
  })(rootBone);

  // Bind-pose world rotation per bone, accumulated through *all* ancestors (the
  // armature above `root` included) so world-space axes are honest.
  const bindWorld = new Map();
  const worldOf = (name) => {
    if (bindWorld.has(name)) return bindWorld.get(name);
    const parent = parentOf.get(name);
    const local = byName.get(name).getRotation();
    const q = parent && byName.has(parent) ? qMul(worldOf(parent), local) : [...local];
    bindWorld.set(name, q);
    return q;
  };
  for (const name of order) worldOf(name);

  return {
    byName, parentOf, order, bindWorld,
    has: (name) => byName.has(name),
    // Bind world rotation of a bone's parent — the frame a world-space delta has
    // to be conjugated into to become a local rotation on that bone.
    parentBindWorld(name) {
      const parent = parentOf.get(name);
      return parent && bindWorld.has(parent) ? bindWorld.get(parent) : [0, 0, 0, 1];
    },
    rest: (name) => {
      const n = byName.get(name);
      return { t: n.getTranslation(), r: n.getRotation(), s: n.getScale() };
    },
  };
}

// Sample one LINEAR channel at time `t` into `dst` at element `i`. Quaternions
// are nlerped (hemisphere-corrected) — exact on the constant tracks resample()
// leaves behind, and indistinguishable from slerp at keyframe density.
function sampleAt(sampler, t, stride, dst, i) {
  const times = sampler.getInput().getArray();
  const values = sampler.getOutput().getArray();
  const last = times.length - 1;

  let hi = 0;
  while (hi <= last && times[hi] < t) hi++;
  let a = Math.max(0, hi - 1), b = Math.min(last, hi);
  let u = times[b] === times[a] ? 0 : (t - times[a]) / (times[b] - times[a]);
  u = Math.min(1, Math.max(0, u));

  const oa = a * stride, ob = b * stride, out = i * stride;
  if (stride === 4) {
    let dot = 0;
    for (let k = 0; k < 4; k++) dot += values[oa + k] * values[ob + k];
    const sign = dot < 0 ? -1 : 1;
    let len = 0;
    for (let k = 0; k < 4; k++) {
      const v = values[oa + k] * (1 - u) + sign * values[ob + k] * u;
      dst[out + k] = v;
      len += v * v;
    }
    len = Math.sqrt(len) || 1;
    for (let k = 0; k < 4; k++) dst[out + k] /= len;
    return;
  }
  for (let k = 0; k < stride; k++) {
    dst[out + k] = values[oa + k] * (1 - u) + values[ob + k] * u;
  }
}

// Sample a clip into a dense pose on one shared timeline (the union of every
// channel's keyframes, so nothing is lost). Bones the clip doesn't touch are
// filled with their bind values, so every bone is addressable at every frame.
export function readPose(anim, skel) {
  const keys = new Set();
  for (const channel of anim.listChannels()) {
    const sampler = channel.getSampler();
    if (sampler.getInterpolation() !== 'LINEAR') {
      throw new Error(`readPose: "${anim.getName()}" uses ${sampler.getInterpolation()} interpolation; only LINEAR is supported`);
    }
    for (const t of sampler.getInput().getArray()) keys.add(t);
  }
  if (!keys.size) throw new Error(`readPose: "${anim.getName()}" has no channels`);
  const times = [...keys].sort((a, b) => a - b);

  const frames = times.length;
  const bones = new Map();
  for (const name of skel.order) {
    const rest = skel.rest(name);
    const bone = {
      translation: new Float32Array(frames * 3),
      rotation: new Float32Array(frames * 4),
      scale: new Float32Array(frames * 3),
    };
    for (let f = 0; f < frames; f++) {
      bone.translation.set(rest.t, f * 3);
      bone.rotation.set(rest.r, f * 4);
      bone.scale.set(rest.s, f * 3);
    }
    bones.set(name, bone);
  }

  // Channels aimed at nodes outside the skeleton (the mesh node) are carried
  // through untouched rather than dropped.
  const extra = [];
  for (const channel of anim.listChannels()) {
    const node = channel.getTargetNode();
    const name = node?.getName();
    const path = channel.getTargetPath();
    if (!name || !bones.has(name)) { extra.push(channel); continue; }
    const dst = bones.get(name)[path];
    const stride = path === 'rotation' ? 4 : 3;
    for (let f = 0; f < frames; f++) sampleAt(channel.getSampler(), times[f], stride, dst, f);
  }

  return { times, frames, bones, extra };
}

export function clonePose(pose) {
  const bones = new Map();
  for (const [name, b] of pose.bones) {
    bones.set(name, {
      translation: b.translation.slice(),
      rotation: b.rotation.slice(),
      scale: b.scale.slice(),
    });
  }
  return { times: [...pose.times], frames: pose.frames, bones, extra: pose.extra };
}

export const getQuat = (pose, name, f) => {
  const r = pose.bones.get(name).rotation;
  return [r[f * 4], r[f * 4 + 1], r[f * 4 + 2], r[f * 4 + 3]];
};
export const setQuat = (pose, name, f, q) => pose.bones.get(name).rotation.set(q, f * 4);
export const getVec3 = (pose, name, f, path = 'translation') => {
  const v = pose.bones.get(name)[path];
  return [v[f * 3], v[f * 3 + 1], v[f * 3 + 2]];
};
export const setVec3 = (pose, name, f, v, path = 'translation') =>
  pose.bones.get(name)[path].set(v, f * 3);

// Forward kinematics for one frame: model-space position + rotation per bone.
export function fk(pose, skel, f) {
  const out = new Map();
  for (const name of skel.order) {
    const local = {
      t: getVec3(pose, name, f),
      r: getQuat(pose, name, f),
      s: getVec3(pose, name, f, 'scale'),
    };
    const parent = out.get(skel.parentOf.get(name));
    if (!parent) {
      out.set(name, { pos: local.t, rot: local.r, scl: local.s });
      continue;
    }
    const scaled = [local.t[0] * parent.scl[0], local.t[1] * parent.scl[1], local.t[2] * parent.scl[2]];
    const offset = qRotV(parent.rot, scaled);
    out.set(name, {
      pos: [parent.pos[0] + offset[0], parent.pos[1] + offset[1], parent.pos[2] + offset[2]],
      rot: qMul(parent.rot, local.r),
      scl: [parent.scl[0] * local.s[0], parent.scl[1] * local.s[1], parent.scl[2] * local.s[2]],
    });
  }
  return out;
}

// Write a pose back out as a new animation. One shared input accessor (all our
// channels live on the source timeline); `timeScale` retimes the whole clip.
export function writeClip(doc, name, pose, skel, timeScale = 1) {
  const buffer = doc.getRoot().listBuffers()[0];
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor(`${name}_time`)
    .setType('SCALAR')
    .setArray(new Float32Array(pose.times.map((t) => t * timeScale)))
    .setBuffer(buffer);

  for (const bone of skel.order) {
    const node = skel.byName.get(bone);
    const data = pose.bones.get(bone);
    for (const path of ['translation', 'rotation', 'scale']) {
      const output = doc.createAccessor(`${name}_${bone}_${path}`)
        .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
        .setArray(data[path].slice())
        .setBuffer(buffer);
      const sampler = doc.createAnimationSampler()
        .setInput(input).setOutput(output).setInterpolation('LINEAR');
      const channel = doc.createAnimationChannel()
        .setTargetNode(node).setTargetPath(path).setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
    }
  }
  return anim;
}
