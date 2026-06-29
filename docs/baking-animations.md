# Baking animations into a single GLB (DCL-portable)

In the browser the game loads the character (`agent.glb`) and a separate clip
library (`UAL2_Standard.glb`) and binds the clips at runtime by bone name — handy
for development. **Decentraland can't read a separate animation file**: it needs
the clips **embedded in the character GLB**. This pipeline produces that
single-file version without changing the dev workflow.

It works because the character and the Quaternius Universal Animation Library share
the **same skeleton** (identical bone names), so the library's animation channels
can be rebound onto the character's bones.

## Run it

```bash
npm run bake:anims        # -> models-src/agent-animated.glb     (intermediate, uncompressed)
npm run bake:anims:dcl    # also Draco-compresses -> public/models/agent-dcl.glb  (the shipped asset)
```

Source inputs live in `models-src/` (kept out of `public/` so they don't ship to
the browser). Only the final `agent-dcl.glb` lands in `public/models/`.

Outputs:

| File | Location | What it is | Use |
|---|---|---|---|
| `agent-animated.glb` | `models-src/` | character + embedded clips, **uncompressed** | intermediate; a decoder-free single file if you want it |
| `agent-dcl.glb` | `public/models/` | same, **Draco** geometry compression | **the shipped asset** — browser (via DRACOLoader) and DCL |

Both are regenerated from `models-src/agent.glb` + `models-src/UAL2_Standard.glb`,
so treat them as build artifacts — re-run after changing the source models or the
clip list.

## Which clips get baked

Edit the `KEEP` set at the top of [`scripts/bake-animations.mjs`](../scripts/bake-animations.mjs)
(or pass `--all` to embed every clip). Default is a brawler starter set:
`Idle_No_Loop`, `Walk_Carry_Loop`, `Melee_Hook`, `Melee_Hook_Rec`, `Hit_Knockback`.
Keeping fewer clips = smaller file (animation keyframes, not geometry, dominate the
size — Draco won't shrink them).

## Adding a new animation

Clip/state wiring lives in `src/AnimationController.js`; `src/Player.js` decides
*intent* and `src/Input.js` maps keys. There are **two kinds** of animation:

**1. Looping states** (idle, walk, run) — driven continuously by movement.
- Add the state to `STATE`, a clip-name fragment to `CLIP_NAMES`, and (optionally)
  a `CLIP_FALLBACK` (all in `AnimationController.js`), then select it in the
  `this.state = …` line of `Player.update()`.

**2. One-shot actions** (punch, kick, throw) — triggered by input, play once, then
control returns to locomotion. This is the `ACTIONS` map + `playAction()` system in
`AnimationController.js`.
- Add the clip to `ACTIONS` (e.g. `kick: ['sword_dash', 'kick']`).
- Add an edge-triggered intent getter in `src/Input.js` (e.g.
  `get kickPressed() { return this.wasPressed('KeyK'); }`) and call it in
  `Player.update()`: `if (input.kickPressed) this.anim.playAction('kick')`.

**Either way**, the clip must be in the shipped GLB: add its exact name to `KEEP` in
[`scripts/bake-animations.mjs`](../scripts/bake-animations.mjs) and run
`npm run bake:anims:dcl`. (Punch already works — `Melee_Hook` is in the default
`KEEP` set.) Available clip names are listed by inspecting the library; the current
pack includes `Melee_Hook`, `Sword_Regular_A/B/C`, `Sword_Heavy_Combo`,
`OverhandThrow`, `Hit_Knockback`, and the `NinjaJump_*` set.

**Jump** (implemented) is a *clip sequence plus vertical movement*: `Player.update()`
runs a small physics block (jump velocity + gravity + ground check on
`root.position.y`, constants `gravity`/`jumpSpeed`) and calls
`anim.jumpTakeoff()`/`anim.jumpLand()`; `AnimationController` runs a 3-phase
sequencer that crossfades `NinjaJump_Start` → `NinjaJump_Idle_Loop` →
`NinjaJump_Land` (`JUMP_CLIPS` mapping, graceful skips for missing phases, and a
**cancelable landing** so movement input doesn't lock you out). Bound
to **Space**. Because the pack's clips are in-place (non-root-motion), the animation
layers on top of the physics translation — tune `jumpSpeed`/`gravity` if the arc
feels too high or floaty.

## How the Node script works

[`scripts/bake-animations.mjs`](../scripts/bake-animations.mjs) (gltf-transform):

1. Read the character and library documents; map the character's bones by name.
2. Drop unwanted clips and the library's mannequin mesh/skin.
3. `mergeDocuments()` the library into the character document.
4. **Rebind** every merged animation channel from the library's duplicate bone to
   the character's same-named bone.
5. Dispose the library's leftover scene + orphan skeleton nodes.
6. `resample()` (lossless keyframe reduction) + `prune()` + `dedup()`, collapse to
   one buffer, write the GLB.

No Blender required. Validated on the current assets: 5 clips, 65 animated bones,
all channel targets resolve, single skin/skeleton.

## Blender alternative

If you'd rather use Blender (e.g. for mesh cleanup), the equivalent is
[`scripts/bake-animations-blender.py`](../scripts/bake-animations-blender.py):

```bash
blender --background --python scripts/bake-animations-blender.py -- \
  models-src/agent.glb models-src/UAL2_Standard.glb models-src/agent-animated.glb
```

It imports both, stashes the library's actions as NLA tracks on the character
armature, deletes the library objects, and exports one GLB. Export flag names vary
slightly by Blender version (3.6+ / 4.x).

## The single shared asset

**Browser and Decentraland use the same file, `agent-dcl.glb`.**

- **Browser (this game):** `Game.js` already points `Player` at
  `/models/agent-dcl.glb` with no `animationUrl` (clips are embedded). The loader
  has a `DRACOLoader` wired up, decoding via the self-hosted decoder in
  `public/draco/`. Nothing else to configure.
  - If you'd rather avoid the Draco decoder, point `modelUrl` at the uncompressed
    `models-src/agent-animated.glb` instead (copy it into `public/models/` first so
    it's served) — it needs no decoder.
- **Decentraland (SDK7):** upload the same `agent-dcl.glb` and load it with
  `GltfContainer.create(e, { src: 'models/agent-dcl.glb' })`, referencing clips by
  their exact names via `Animator` (e.g. `Idle_No_Loop`, `Walk_Carry_Loop`). See
  [decentraland-asset-compat.md](./decentraland-asset-compat.md).
