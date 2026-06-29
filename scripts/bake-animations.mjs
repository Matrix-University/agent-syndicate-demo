// Bake animation clips from a same-rig clip library into a character GLB, so the
// result is a single self-contained file with embedded clips — the format
// Decentraland needs (DCL can't read a separate animation file).
//
// Works because the character and the library share the same skeleton (identical
// bone names): we merge the library's animations in, then rebind every animation
// channel from the library's duplicate bones to the character's bones by name,
// and drop the library's skeleton/mesh.
//
// Usage:
//   node scripts/bake-animations.mjs [character.glb] [library.glb] [out.glb] [--all]
// Defaults bake a small brawler-relevant set; pass --all to keep every clip.

import { existsSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, mergeDocuments } from '@gltf-transform/functions';

// Inputs live in models-src/ (not served to the browser); only the final baked
// asset is written into public/models/.
const [, , CHAR = 'models-src/agent.glb',
  LIB = 'models-src/UAL2_Standard.glb',
  OUT = 'models-src/agent-animated.glb'] = process.argv;
const KEEP_ALL = process.argv.includes('--all');

// Clips to embed (by exact name). Curated for the brawler: idle, walk, an attack
// pair, and a hit reaction. Edit this list or pass --all.
const KEEP = new Set([
  'Idle_No_Loop',
  'Walk_Carry_Loop',
  'Melee_Hook',
  'Melee_Hook_Rec',
  'Hit_Knockback',
  'NinjaJump_Start',
  'NinjaJump_Idle_Loop',
  'NinjaJump_Land',
]);

for (const path of [CHAR, LIB]) {
  if (!existsSync(path)) {
    console.error(`bake-animations: input not found: ${path}\n` +
      `Put the source models in models-src/ (see models-src/README.md).`);
    process.exit(1);
  }
}

const io = new NodeIO();

const charDoc = await io.read(CHAR);
const libDoc = await io.read(LIB);
const charRoot = charDoc.getRoot();
const libRoot = libDoc.getRoot();

// Map character bones by name — the rebind targets.
const charNodeByName = new Map();
for (const n of charRoot.listNodes()) {
  if (n.getName()) charNodeByName.set(n.getName(), n);
}

// Warn about any requested clip the library doesn't actually contain.
if (!KEEP_ALL) {
  const available = new Set(libRoot.listAnimations().map((a) => a.getName()));
  const missing = [...KEEP].filter((name) => !available.has(name));
  if (missing.length) console.warn(`⚠ KEEP clips not found in ${LIB}: ${missing.join(', ')}`);
}

// In the library, drop clips we don't want and the mannequin mesh/skin (we only
// want the animations + skeleton), so less data gets merged.
for (const anim of libRoot.listAnimations()) {
  if (!KEEP_ALL && !KEEP.has(anim.getName())) anim.dispose();
}
const keptClips = libRoot.listAnimations().map((a) => a.getName());
for (const mesh of libRoot.listMeshes()) mesh.dispose();
for (const skin of libRoot.listSkins()) skin.dispose();

// Remember what existed before the merge so we can tell the library's copies apart.
const charScenesBefore = new Set(charRoot.listScenes());
const charNodesBefore = new Set(charRoot.listNodes());

// Merge the library document into the character document (functions API, v4).
mergeDocuments(charDoc, libDoc);

// Rebind every merged animation channel from the library's bone to the
// character's same-named bone.
let rebound = 0;
const unmatched = new Set();
for (const anim of charRoot.listAnimations()) {
  for (const channel of anim.listChannels()) {
    const target = channel.getTargetNode();
    if (!target) continue;
    if (charNodesBefore.has(target)) continue; // already a character node
    const match = charNodeByName.get(target.getName());
    if (match) { channel.setTargetNode(match); rebound++; }
    else unmatched.add(target.getName());
  }
}

// Drop the library's duplicate scene(s) and its now-orphaned skeleton nodes
// (everything that didn't exist on the character before the merge).
for (const scene of charRoot.listScenes()) {
  if (!charScenesBefore.has(scene)) scene.dispose();
}
for (const node of charRoot.listNodes()) {
  if (!charNodesBefore.has(node)) node.dispose();
}

// resample() losslessly drops redundant keyframes (big animation win); prune and
// dedup clean orphaned/duplicate data left by the merge.
await charDoc.transform(resample(), prune(), dedup());

// Merge brought in a second buffer (one per source); GLB allows only one. Point
// every accessor at the first buffer and drop the rest.
const buffers = charRoot.listBuffers();
const mainBuffer = buffers[0];
for (const accessor of charRoot.listAccessors()) accessor.setBuffer(mainBuffer);
for (const buffer of buffers.slice(1)) buffer.dispose();

await io.write(OUT, charDoc);

const embedded = charRoot.listAnimations().map((a) => a.getName());
console.log(`Baked ${embedded.length} clip(s) into ${OUT}: ${embedded.join(', ')}`);
console.log(`Rebound ${rebound} animation channels onto the character skeleton.`);
if (unmatched.size) {
  console.warn(`⚠ ${unmatched.size} bone(s) had no match and were left as-is:`,
    [...unmatched].join(', '));
}
if (keptClips.length !== embedded.length) {
  console.warn(`⚠ requested ${keptClips.length} clips but embedded ${embedded.length}.`);
}
