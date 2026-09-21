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
`Idle_No_Loop`, `Walk_Carry_Loop`, `Melee_Hook`, `Melee_Hook_Rec`, `Hit_Knockback`,
plus the three `NinjaJump_*` phases. The full shipped set, and what each clip is
bound to, is catalogued in [animation-catalog.md](./animation-catalog.md).
Keeping fewer clips = smaller file (animation keyframes, not geometry, dominate the
size — Draco won't shrink them).

## Walk and Run are authored, not copied

UAL2 has **no neutral walk and no run**. Its only forward locomotion is
`Walk_Carry_Loop`, and there the legs are a real human walk while the arms are
pinned in a carry pose — a constant 66.5° off rest on every frame, never swinging
— over a static ~17° spine lean. Bound to `WALK` the character strolled as if
holding a crate, and `RUN` fell back to the same clip.

So the bake calls [`scripts/lib/locomotion.mjs`](../scripts/lib/locomotion.mjs),
which keeps that clip's (correct, floor-locked) lower body and authors the rest:

- **`Walk`** — carry lean removed from the spine by subtracting its *average*
  offset from rest, so the torso's natural walking sway survives; **hips
  re-pitched forward**; arms, elbows and fingers authored fresh. Arm phase is read
  off the source's own thigh swing, so the arms can't fall out of step with the feet.
- **`Run`** — that walk with the thigh/calf swing exaggerated 1.35×, a forward
  spine lean, a wider bent-elbow pump and a faster cadence. Because stretching the
  legs lifts the feet, pelvis height is re-solved per frame so the planted foot
  still meets the floor.
- **`Carry_Loop`** — the original clip, renamed and kept. It is bound to
  `STATE.CARRY` in `AnimationController` but nothing selects it yet; it is waiting
  for carrying an object to become a real game state.

**The hips are the other half of the fix.** The carry stance tips the pelvis ~33°
*back* and curls the spine forward to compensate, so straightening the spine alone
just exposes the backward hip and leaves the character walking on its heels.
`setHipPitch` re-pitches the pelvis to a neutral read from the rig's own
`Idle_No_Loop` (an artist-authored standing posture on this exact skeleton),
plus `hipLean` degrees forward — while re-seating each thigh to the world
orientation it already had, so the legs and the planted foot don't move and only
the trunk swings. Measured hip→neck lean: idle **+8.0°**, walk **+5.4°**, run
**+18.6°** (was −28.7° backwards).

Two ordering rules that bite if you rearrange this: `setHipPitch` must run *before*
`authorArms` (the shoulders are solved against the actual torso), and the run's leg
exaggeration must scale each leg's swing about the clip's **own mean pose**, not
about the bind pose — the hip correction folds a constant offset into those locals,
and scaling that too drags the whole stride forward instead of widening it.

Shoulders are solved against the **actual** torso each frame rather than the bind
pose: this source pitches the pelvis forward for the carry crouch, and anchoring
the arms to the bind frame inherited that lean and left both arms reaching ~33°
forward. Tune the feel via the `WALK` / `RUN` constants at the top of that module.

Check a bake with:

```bash
node scripts/inspect-locomotion.mjs models-src/agent-animated.glb Walk Run
```

It reports swing ranges, foot-contact spread and hand/hip clearance, and the
arm/leg correlation — which should sit near **−1.00**, meaning each arm swings
opposite the leg on its own side.

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
`KEEP` set.) Every clip that ships, and every clip still unused in the library, is
listed in [animation-catalog.md](./animation-catalog.md) — check there for one that
already does what you need before authoring a move. Regenerate its tables with
`npm run clips`.

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
6. Synthesize `Walk` and `Run` from `Walk_Carry_Loop` and rename it `Carry_Loop`
   (see above).
7. `resample()` (lossless keyframe reduction) + `prune()` + `dedup()`, collapse to
   one buffer, write the GLB.

No Blender required. Validated on the current assets: 10 clips, 65 animated bones,
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
  their exact names via `Animator` (e.g. `Idle_No_Loop`, `Walk`, `Run`). See
  [decentraland-asset-compat.md](./decentraland-asset-compat.md).
