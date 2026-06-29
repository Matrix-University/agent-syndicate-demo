# Re-skinning the character (matching a concept design)

How to make the in-game agent look like a specific concept (e.g. the blonde,
sunglasses, black 3-piece-suit + red-tie "agent" render) **without breaking the
animation pipeline or DCL portability**.

## The one rule that governs everything

**The skeleton and bone names are sacred.** The baked clips (Idle / Walk / Melee /
Jump) bind to the character by **bone name** (see [baking-animations.md](baking-animations.md)),
and browser↔DCL parity depends on shipping the single rigged
`public/models/agent-dcl.glb`. So whatever changes the *look*, it must be a mesh
skinned to the **same skeleton** (identical bone names) as today's
`models-src/agent.glb` + `UAL2_Standard.glb` pair.

This is an **art/asset task, not an engine task** — `Player` already loads whatever
GLB `Game.js` points at ([../src/Game.js](../src/Game.js)). "Skinning" = producing a
new `agent-dcl.glb`, not changing runtime code (beyond scale/yaw tuning).

## Two levels of effort

### Level 1 — Recolor only (cheap, no new geometry)
Changes **palette** (black suit, red tie, white shirt, blonde hair, skin tone) on
the *existing* body. No sunglasses, no hairstyle, no muscle silhouette — just color.

- **Re-author texture maps** (base-color/albedo) in `models-src/agent.glb`, then
  re-bake. Stays DCL-portable (PNG/JPG only). This is the "correct" one-asset path.
- **Runtime material tint** — traverse the loaded model in
  `Player._loadCharacter` and override material colors. Fastest, zero asset work,
  but flat colors only and **browser-side only** (DCL wouldn't get it, so it dents
  the "one asset, both targets" invariant). Use for prototyping the vibe.

> Result: the *current* body wearing suit colors — it will **not** look like the
> concept. Sunglasses / hair / proportions are geometry, not color.

### Level 2 — Actually match the concept (the real path)
Sunglasses, hairstyle, muscular proportions, and a tailored suit are **geometry**,
so you need a new mesh. DCL-safe pipeline:

1. **Get the mesh** — model in Blender, OR use an image-to-3D tool on the concept
   render as a *starting block* (expect to retopo: those outputs are high-poly and
   unrigged), OR grab/commission a CC0 suited humanoid.
2. **Rig to the existing skeleton** — skin the new mesh onto `models-src/agent.glb`'s
   armature (weight transfer), keeping **bone names identical**. This is the
   critical step: if names match, every existing clip just works.
3. **Keep it DCL-legal** — low-poly, single/atlas material, PNG textures, **no
   Meshopt/KTX2** (per [CLAUDE.md](../CLAUDE.md) and
   [decentraland-asset-compat.md](decentraland-asset-compat.md)). Sunglasses = a few
   tris + a dark material; don't make them a high-detail separate object.
4. **Replace `models-src/agent.glb`** → run `npm run bake:anims:dcl` → new
   `public/models/agent-dcl.glb`.
5. **Tune in code** — `modelScale` (body ≈ 3 units tall) and `modelYaw`
   (`Math.PI` if it faces away) in [../src/Game.js](../src/Game.js).

> Avoid a **different base rig** (e.g. raw Mixamo) unless necessary — clips bind by
> bone name to the UAL skeleton, so a new rig forces an animation **retarget**.
> Staying on the current armature is much cheaper.

## Quick wins available in-repo (no DCC tool needed)

These can be done from code now, independent of the modeling work:

- **Runtime material retint** to preview the black-suit / red-tie / blonde palette.
- **Load-time material dump** (console.log the loaded model's materials) so we know
  exactly which materials map to suit / tie / skin / hair before targeting them.
- **`modelScale` / `modelYaw` tuning** once a new mesh exists.

## What can't be done from the CLI

Modeling a mesh, weight-painting a rig, and authoring textures need Blender / a DCC
tool / external assets — outside the coding environment. Plan those as a separate
art deliverable; the code side is just the swap + tune above.

## AI tools for generating the mesh / textures from a prompt

These speed up **step 1** (get a mesh) and texturing. Be clear-eyed about what they
do and don't solve for *this* project:

- **They produce a mesh + textures, not a character rigged to our skeleton.** Even
  the tools that auto-rig use **their own** bone names, so you still do the
  weight-transfer / retarget to `agent.glb`'s armature (step 2). Generation removes
  the sculpting work, not the rigging work.
- **Most output is high-poly and needs retopo/decimation** to hit DCL budgets.
  A few are explicitly low-poly / game-ready (noted below).
- **Verify licensing for commercial/shippable use** — terms, output ownership, and
  training-data provenance vary and change often. Confirm before shipping.

Capabilities move fast; treat the table as a starting shortlist, not gospel.

### Text-/image-to-3D generators

| Tool | Input | API | Auto-rig | Low-poly / game-ready | Notes |
|---|---|---|---|---|---|
| **Meshy** (meshy.ai) | text + image | yes | yes (own skeleton) | tunable; can target lower poly | GLB + PBR; strong all-rounder for characters |
| **Tripo** (tripo3d.ai) | text + image | yes | yes (own skeleton) | mid; needs cleanup | fast, good silhouettes, GLB export |
| **Rodin / Hyper3D** (hyper3d.ai) | text + image | yes | partial | high-poly, cleaner topology | good base mesh quality |
| **Sloyd** (sloyd.ai) | text (parametric) | yes | varies | **yes — real-time low-poly** | best fit for DCL budgets; less photoreal |
| **Masterpiece X – Generate** | text | limited | **yes, rigged + animated humanoids** | mid | closest to "prompt → animated character"; still its own rig |
| **CSM** (3d.csm.ai) | image + text | yes | no | high-poly | image-to-3D, sketch-to-3D |
| **Tencent Hunyuan3D** (2.x) | text + image | yes / open | no | high-poly | open-source option, GLB, strong quality |
| **Microsoft TRELLIS** | image + text | open-source | no | high-poly | self-hostable image-to-3D, GLB |
| **Stability SF3D / SPAR3D** | image | open-source | no | high-poly | fast single-image-to-3D, self-hostable |
| **Kaedim** | image | yes (B2B) | no | **yes — game-ready, human-in-loop** | paid, geared to production meshes |

For matching the specific concept render, an **image-to-3D** path (feed the render)
will track the design more closely than text-to-3D. Expect to retopo the result.

### Texturing-only (for the Level 1 recolor, or re-texturing a clean mesh)

- **Meshy** / **Polycam** — text-to-texture / re-texture on an existing mesh.
- **Adobe Substance 3D** (Sampler/Painter) + Firefly — PBR texture authoring,
  text-to-texture. Industry standard for the actual maps.
- **Poly** (withpoly.com) — text-prompted tileable PBR materials (suit fabric, etc.).

### Rigging & retargeting (the step generators don't solve for us)

This is the part that keeps clips working. To bind a generated mesh to our pipeline:

- **Mixamo** (free) — auto-rig a humanoid from a T-pose; useful, but produces the
  **Mixamo skeleton**, so you'd still retarget Mixamo↔UAL by bone name.
- **Reallusion AccuRIG** (free) — fast auto-rig, exports FBX/GLB.
- **Anything World** — text-driven auto-rig + animation (own naming).
- **Blender** — the reliable route for *this* repo: import the generated mesh,
  snap it to `agent.glb`'s existing armature, **data-transfer skin weights**, keep
  bone names identical, re-export. No retarget needed because the skeleton is reused.

### Recommended combo for this project

1. **Image-to-3D** from the concept render (Meshy or Tripo) → base mesh + textures.
2. **Retopo / decimate** to low-poly (or start in Sloyd if you want low-poly native).
3. **Blender**: weight-transfer onto the **existing `agent.glb` armature** (reuse
   the skeleton — do *not* keep the generator's rig) so UAL clips bind unchanged.
4. Atlas materials, export PNG textures, replace `models-src/agent.glb`,
   `npm run bake:anims:dcl`, tune `modelScale`/`modelYaw`.

## Checklist when a new mesh is ready

- [ ] Bone names match the current armature (clips bind without retarget)
- [ ] Single skin/skeleton, low-poly, atlas/shared material, PNG/JPG textures
- [ ] Replaces `models-src/agent.glb`; `npm run bake:anims:dcl` runs clean
- [ ] Loads in-browser (placeholder no longer shows); clips play (Idle/Walk/Melee/Jump)
- [ ] `modelScale`/`modelYaw` tuned in `Game.js` (body ≈ 3 units, faces +Z)
- [ ] Within DCL triangle/material/texture budgets for the target parcel count
