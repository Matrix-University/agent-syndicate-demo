# Authoring Decentraland-ready animated GLB

Goal: build the game in **Three.js** now, but author every animated character/prop
so the **same `.glb` could be dropped into a Decentraland (SDK7) scene** later. The
file format is shared — both engines read glTF 2.0 with embedded skeletal clips.
Only the *player* differs: Three.js uses `AnimationMixer`, Decentraland uses the
`Animator` component.

> This is the "keep assets DCL-ready" path. It does **not** make the game run
> inside Decentraland — DCL scenes are SDK7 TypeScript (`@dcl/sdk/ecs`), a separate
> project that would reuse these GLBs, not the Three.js engine code.

## Same asset, two players

```ts
// Decentraland scene (SDK7) — for reference; not used in this repo
GltfContainer.create(agent, { src: 'models/agent.glb' })
Animator.create(agent, {
  states: [
    { clip: 'Idle', playing: true,  loop: true },
    { clip: 'Run',  playing: false, loop: true },
  ],
})
Animator.playSingleAnimation(agent, 'Run')   // ≈ our AnimationController crossfade
```

In this repo the same clips are driven by `THREE.AnimationMixer` in
[`src/Player.js`](../src/Player.js). Author once, play in either engine.

## Authoring checklist (do this for every animated GLB)

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
*currently-rendered* entities count):

| Resource | Limit |
|---|---|
| Triangles | `n × 10,000` total |
| Entities | `n × 200` |
| Bodies (meshes) | `n × 300` |
| Materials | `log2(n+1) × 20` |
| Textures | `log2(n+1) × 10` |
| Height | `log2(n+1) × 20 m` |

Practical takeaways: keep characters **low-poly** (Quaternius is ideal),
**share/atlas materials and textures** (don't ship a unique 2k texture per limb),
and reuse one material across props. A crowd of NPCs must fit the triangle/body
budget *while on screen* — plan for instancing/LOD.

**Compression**
- DCL accepts Draco-compressed glTF. **Meshopt is *not* supported** by the DCL
  renderer — so if an asset must work in both, prefer **Draco** (or uncompressed)
  for that asset, even though Meshopt is the better choice for a pure Three.js PWA.
- Textures: DCL expects standard PNG/JPG in-scene; **KTX2/Basis is not supported**
  in DCL scenes. Keep DCL-targeted textures as PNG/JPG (≤512 for wearables, modest
  sizes for scenes). KTX2 stays a Three.js-only optimization.

## What does NOT cross over: avatar emotes / wearables

Placing an animated GLB *in a scene* is permissive (above). Turning the character
into a Decentraland **avatar wearable or emote** is strict and needs a **re-rig** —
Quaternius/Mixamo skeletons will not work as-is:

- Must use the **official Decentraland avatar armature** (specific bone names),
  **≤ 62 bones**, export **deform bones only** with the mesh hidden.
- Emote: **≤ 3,000 triangles**, **≤ 10 s / 300 frames**, **a single animation**,
  **≤ 3 MB** total (incl. props/sounds).

If wearables/emotes become a goal, treat them as a separate art task on the DCL
avatar rig — not the same files as the in-game character.

## TL;DR

Export **single-file GLB, glTF 2.0, embedded skeletal clips, clean clip names
(`Idle`/`Run`/…), low-poly, shared materials, Draco (not Meshopt), PNG/JPG (not
KTX2)**. That file plays in our `AnimationMixer` today and drops into a DCL scene's
`Animator` later. Emotes/wearables are a separate, re-rigged deliverable.

## Sources

- [Decentraland — 3D model animations (SDK7)](https://docs.decentraland.org/creator/scenes-sdk7/3d-content-essentials/3d-model-animations)
- [Decentraland — Scene limitations](https://docs.decentraland.org/creator/development-guide/sdk7/scene-limitations/)
- [Decentraland — Creating & exporting emotes](https://docs.decentraland.org/creator/emotes/creating-and-exporting-emotes/)
- [Decentraland — Avatar rig](https://docs.decentraland.org/creator/emotes/avatar-rig/)
