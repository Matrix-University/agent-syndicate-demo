# Decentraland asset compatibility reference (best effort)

**Project policy: browser-first.** Full Decentraland (DCL SDK7) compatibility is
no longer required, and incompatibilities are acceptable. Preserve compatibility
where practical during requested work, but do not rewrite code, rebake assets,
or add optimization/porting work solely to restore DCL compatibility today.
Browser-only features and assets are allowed when the browser game needs them.

The existing browser bake still produces `public/models/agent-dcl.glb`; its name
does not guarantee DCL compatibility or compliance with scene budgets. The
constraints below apply when a DCL deliverable is explicitly requested, not as
acceptance criteria for normal browser work.

Both engines support glTF 2.0 with embedded skeletal clips, subject to their
respective limits. Three.js uses `AnimationMixer`; DCL uses `Animator`.
Reusing an asset does **not** port the game: a DCL scene uses SDK7 TypeScript
(`@dcl/sdk/ecs`), not the Three.js engine code.

## Same asset, two players

```ts
// Decentraland scene (SDK7) — for reference; not used in this repo
GltfContainer.create(agent, { src: "models/agent.glb" });
Animator.create(agent, {
  states: [
    { clip: "Idle", playing: true, loop: true },
    { clip: "Run", playing: false, loop: true },
  ],
});
Animator.playSingleAnimation(agent, "Run"); // ≈ our AnimationController crossfade
```

In this repo the same clips are driven by `THREE.AnimationMixer` in
[`src/Player.js`](../src/Player.js). Author once, play in either engine.

## Authoring checklist (for a requested DCL deliverable)

**Format**

- Export **glTF 2.0 binary (`.glb`)**, a single self-contained file.
- **Embed the skeletal animation clips inside the GLB** — DCL cannot read external
  animation files. (Quaternius/Mixamo GLB exports already do this.)
- Skeletal (bone) animation only. Avoid morph-target-only animation for characters.

**Clip naming (matters more for DCL than for us)**

- DCL's `Animator` references clips by their **exact name**; our Three.js loader
  matches loosely (`CLIP_NAMES` substring in `AnimationController.js`). To satisfy both, use
  clean, stable names: **`Idle`, `Run`, `Attack`, `Death`** …
- Exporters often prefix the armature: a clip may serialize as `Armature_Run`.
  Keep the suffix meaningful and consistent so both engines find it.
- One concern per clip where possible. In DCL a bone can only be driven by one
  active animation unless their **weights sum to ≤ 1** (e.g. upper-body attack +
  lower-body run can blend; two full-body clips cannot).

**Stay within DCL scene budgets** (these scale with parcel count `n`; only
_currently-rendered_ entities count):

| Resource        | Limit              |
| --------------- | ------------------ |
| Triangles       | `n × 10,000` total |
| Entities        | `n × 200`          |
| Bodies (meshes) | `n × 300`          |
| Materials       | `log2(n+1) × 20`   |
| Textures        | `log2(n+1) × 10`   |
| Height          | `log2(n+1) × 20 m` |

Practical takeaways: keep characters **low-poly** (Quaternius is ideal),
**share/atlas materials and textures** (don't ship a unique 2k texture per limb),
and reuse one material across props. A crowd of NPCs must fit the triangle/body
budget _while on screen_ — plan for instancing/LOD.

**Compression**

- DCL accepts Draco-compressed glTF. **Meshopt is _not_ supported** by the DCL
  renderer — so if an asset must work in both, prefer **Draco** (or uncompressed)
  for that asset, even though Meshopt is the better choice for a pure Three.js PWA.
- Textures: DCL expects standard PNG/JPG in-scene; **KTX2/Basis is not supported**
  in DCL scenes. Keep DCL-targeted textures as PNG/JPG (≤512 for wearables, modest
  sizes for scenes). KTX2 stays a Three.js-only optimization.

## What does NOT cross over: avatar emotes / wearables

Placing an animated GLB _in a scene_ is permissive (above). Turning the character
into a Decentraland **avatar wearable or emote** is strict and needs a **re-rig** —
Quaternius/Mixamo skeletons will not work as-is:

- Must use the **official Decentraland avatar armature** (specific bone names),
  **≤ 62 bones**, export **deform bones only** with the mesh hidden.
- Emote: **≤ 3,000 triangles**, **≤ 10 s / 300 frames**, **a single animation**,
  **≤ 3 MB** total (incl. props/sounds).

If wearables/emotes become a goal, treat them as a separate art task on the DCL
avatar rig — not the same files as the in-game character.

## TL;DR

For a requested DCL deliverable, prefer **single-file GLB, glTF 2.0, embedded skeletal clips, clean clip names
(`Idle`/`Run`/…), low-poly, shared materials, Draco (not Meshopt), PNG/JPG (not
KTX2)**, then validate it in the target scene. These are optional porting
constraints, not a reason to rewrite the browser game today. Emotes/wearables
are a separate, re-rigged deliverable.

## Sources

- [Decentraland — 3D model animations (SDK7)](https://docs.decentraland.org/creator/scenes-sdk7/3d-content-essentials/3d-model-animations)
- [Decentraland — Scene limitations](https://docs.decentraland.org/creator/development-guide/sdk7/scene-limitations/)
- [Decentraland — Creating & exporting emotes](https://docs.decentraland.org/creator/emotes/creating-and-exporting-emotes/)
- [Decentraland — Avatar rig](https://docs.decentraland.org/creator/emotes/avatar-rig/)
