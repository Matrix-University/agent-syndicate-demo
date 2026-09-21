// List the animation clips in a GLB — name, duration, channel count — so the
// animation catalog can be regenerated instead of drifting.
//
//   node scripts/list-clips.mjs [file.glb ...]
//   npm run clips
//
// Reads the GLB's JSON chunk directly rather than going through gltf-transform:
// the shipped agent-dcl.glb is Draco-compressed and a plain NodeIO read refuses a
// file whose required extensions it can't decode. Durations come from each
// sampler input accessor's `max`, which glTF requires animation inputs to carry,
// so no buffer data has to be touched.

import { readFileSync } from 'node:fs';

const FILES = process.argv.slice(2);
if (!FILES.length) FILES.push('public/models/agent-dcl.glb');

const JSON_CHUNK = 0x4e4f534a;

function readGLBJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  for (let at = 12; at + 8 <= buf.length;) {
    const length = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    if (type === JSON_CHUNK) return JSON.parse(buf.toString('utf8', at + 8, at + 8 + length));
    at += 8 + length + (-length & 3); // chunks are 4-byte aligned
  }
  throw new Error(`${path}: no JSON chunk`);
}

for (const file of FILES) {
  const gltf = readGLBJson(file);
  const clips = (gltf.animations ?? []).map((anim, i) => {
    let duration = 0;
    for (const sampler of anim.samplers ?? []) {
      const max = gltf.accessors?.[sampler.input]?.max;
      if (max) duration = Math.max(duration, max[0]);
    }
    return { name: anim.name ?? `animation_${i}`, duration, channels: (anim.channels ?? []).length };
  });
  const pad = Math.max(4, ...clips.map((c) => c.name.length));
  console.log(`\n${file} — ${clips.length} clip(s)`);
  for (const c of clips) {
    console.log(`  ${c.name.padEnd(pad)}  ${c.duration.toFixed(2)}s  ${String(c.channels).padStart(3)} channels`);
  }
}
