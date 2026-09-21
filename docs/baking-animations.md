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

| File                 | Location         | What it is                                   | Use                                                       |
| -------------------- | ---------------- | -------------------------------------------- | --------------------------------------------------------- |
| `agent-animated.glb` | `models-src/`    | character + embedded clips, **uncompressed** | intermediate; a decoder-free single file if you want it   |
| `agent-dcl.glb`      | `public/models/` | same, **Draco** geometry compression         | **the shipped asset** — browser (via DRACOLoader) and DCL |

Both are regenerated from `models-src/agent.glb` + `models-src/UAL2_Standard.glb`,
so treat them as build artifacts — re-run after changing the source models or the
clip list.

## After a bake: hard-reload the browser

The bake rewrites `public/models/agent-dcl.glb` in place and its size changes. A
browser or dev server holding the old copy can end up unable to read the new one,
and `Player` then falls back to its primitive placeholder **silently**. That
placeholder is a dark capsule body with a sphere head and a green tie — nearly the
same build as `Enemy`'s rig — so the symptom is _"the player suddenly looks like
one of the agents"_. It is a stale asset, not a changed model. **Ctrl+Shift+R.**

## Which clips get baked

Edit the `KEEP` set at the top of [`scripts/bake-animations.mjs`](../scripts/bake-animations.mjs)
(or pass `--all` to embed every clip). Default is a brawler starter set:
`Idle_No_Loop`, `Walk_Carry_Loop`, `Melee_Hook`, `Melee_Hook_Rec`, `Hit_Knockback`,
`OverhandThrow`, plus the three `NinjaJump_*` phases. Two of those are means, not
`Walk_Carry_Loop` does double duty — it is the source the authored clips are built
from _and_ a shipped clip, renamed `Carry_Loop` via `RENAME`, as `OverhandThrow` is
renamed `Throw`. Synthesis is **additive**: a recipe writes new names, it never
replaces the clip its source ships as.
The full shipped set, and what each clip is bound to, is catalogued in
[animation-catalog.md](./animation-catalog.md).
Keeping fewer clips = smaller file (animation keyframes, not geometry, dominate the
size — Draco won't shrink them).

## Walk, Run and the carry pair are authored, not copied

UAL2 has **no neutral walk and no run**. Its only forward locomotion is
`Walk_Carry_Loop`, and there the legs are a real human walk while the arms are
pinned in a carry pose — a constant 66.5° off rest on every frame, never swinging
— over a static ~17° spine lean. Bound to `WALK` the character strolled as if
holding a crate, and `RUN` fell back to the same clip.

So the bake calls [`scripts/lib/locomotion.mjs`](../scripts/lib/locomotion.mjs),
which preserves that clip's lower body for walking and authors a separate run:

- **`Walk`** — carry lean removed from the spine by subtracting its _average_
  offset from rest, so the torso's natural walking sway survives; **hips
  re-pitched forward**; arms, elbows and fingers authored fresh. Arm phase is read
  off the source's own thigh swing, so the arms can't fall out of step with the feet.
- **`Run`** — independent `RUN_STRIDE` keys for stance compression, rearward
  push-off, folded heel recovery, and forward knee drive. Periodic cubic curves
  join the keys smoothly; the legs alternate half a cycle apart. Pelvis height is
  re-solved for floor contact, then two brief flight phases add up to 8 cm of
  clearance. The forward lean and bent-elbow pump follow the new leg phase, not
  the walking phase. The walk recipe and movement speeds are unchanged.
  The same trade buys the carry pose. UAL2 holds things _low_ — `Walk_Carry_Loop`
  cradles a crate at the chest, `Idle_Lantern_Loop` dangles a lantern at the hip —
  and nothing in it holds a load **overhead**, which is what lifting a car needs. So
  [`scripts/lib/carry.mjs`](../scripts/lib/carry.mjs) authors that pair too:

- **`Carry_Loop`** — the source's stride again, under arms **raised** rather than
  dropped (a sign flip on `shoulderDrop`), elbows braced, fingers gripping, and
  the trunk leaned _back_ to counterweight the mass overhead. Retimed to the
  slower carry walk speed so the feet don't skate.
- **`Carry_Overhead_Idle`** — the identical hold over `Idle_No_Loop`'s standing legs.

Note the names. The library's own chest-height `Carry_Loop` still ships untouched;
the authored clips sit beside it rather than replacing it. After any bake that adds
a clip, diff the result against the previous GLB clip-by-clip and confirm every
pre-existing clip is identical.

Both recipes sit on [`scripts/lib/pose.mjs`](../scripts/lib/pose.mjs), the shared
rig-level kit (`authorArms`, `setHipPitch`, `lockFeetToFloor`, `leanBones`, …).
Add a third recipe there rather than duplicating those operations.

**The hips are the other half of the fix.** The carry stance tips the pelvis ~33°
_back_ and curls the spine forward to compensate, so straightening the spine alone
just exposes the backward hip and leaves the character walking on its heels.
`setHipPitch` re-pitches the pelvis to a neutral read from the rig's own
`Idle_No_Loop` (an artist-authored standing posture on this exact skeleton),
plus `hipLean` degrees forward — while re-seating each thigh to the world
orientation it already had, so the legs and the planted foot don't move and only
the trunk swings. Measured hip→neck lean: idle **+8.0°**, walk **+5.4°**, run
**+18.6°** (was −28.7° backwards).

Two ordering rules that bite if you rearrange this: `setHipPitch` must run _before_
`authorArms` (the shoulders are solved against the actual torso), and the run's
flight clearance must be added _after_ solving ground contact or the floor lock
will remove it. Run thighs and feet are solved in model space; knees hinge in
their parent's frame so heel recovery follows the thigh.

Shoulders are solved against the **actual** torso each frame rather than the bind
pose: this source pitches the pelvis forward for the carry crouch, and anchoring
the arms to the bind frame inherited that lean and left both arms reaching ~33°
forward. Tune the feel via the `WALK` / `RUN` constants at the top of that module.

Check a bake with:

```bash
node scripts/inspect-locomotion.mjs models-src/agent-animated.glb Walk Run
```

It reports swing ranges, knee flexion, foot-contact spread and hand/hip clearance, and the
arm/leg correlation — which should sit near **−1.00**, meaning each arm swings
opposite the leg on its own side. It asserts that walking stays floor-locked and
running has bent-knee recovery, a brief flight phase, and a continuous loop.

## The car throw is authored too

Same reason, different gap: UAL2's only throw is `OverhandThrow`, a one-armed
grenade toss. Bound to a car held in both hands it reads as a **punch** — the off
hand never leaves the hip. [`scripts/lib/throw.mjs`](../scripts/lib/throw.mjs)
authors `Throw_Overhead` instead.

It differs from the locomotion and carry recipes in two ways:

- **It authors motion, not a pose.** `TRACKS` keys every arm and trunk value at
  five phases — hold, wind-up, release, follow-through, recover — and splines them
  with Catmull-Rom (_not_ smoothstep per segment: that eases to a dead stop at
  every key, and a throw whose arms pause at the release has no whip in it).
  `authorArms` accepts a per-frame config and `setHipPitch` a per-frame target,
  which is what those tracks feed.
- **The lower body is one frozen frame**, not a source clip. `Player` roots the
  character for the whole throw, so the feet do not travel; the weight comes from
  the pelvis rocking back and then over, with `lockFeetToFloor` re-seating the body
  on top of it each frame.

Two things must stay in sync with `src/Player.js`, or the animation and the
gameplay drift apart:

- the clip's `duration` matches `THROW_PROFILE.duration`, so it plays at
  `clipRate` 1;
- `RELEASE` in the phase table matches `THROW_PROFILE.release / .duration` — the
  frame the car actually leaves the hands, which is why the arms are authored to
  reach full extension exactly there.

**`shoulderBias` inverts for a raised arm.** `authorArms` documents negative as
forward, which is true of an arm hanging at the side; rotating a _raised_ arm about
the same axis carries it the other way, so the throw's overhead keys use positive
for forward. Get it backwards and the clip winds up forward and releases backward.

Check a bake with:

```bash
node scripts/inspect-throw.mjs models-src/agent-animated.glb
```

With no clip named it reports `Throw_Overhead` and the parked `Throw` side by side.
Hand **asymmetry** should be near zero — both hands on the car — where the
one-armed library clip scores **1.19m**; the forward **peak** should land at or
just after the 0.42s release (a follow-through, not a stop); and **trunk** fold
should stay under ~55°, past which it reads as a bow rather than a heave.

## Adding a new animation

Clip/state wiring lives in `src/AnimationController.js`; `src/Player.js` decides
_intent_ and `src/Input.js` maps keys. There are **two kinds** of animation:

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

**Jump** (implemented) is a _clip sequence plus vertical movement_: `Player.update()`
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
6. Synthesize `Walk` + `Run` and the `Carry_Overhead_*` pair (see above), then
   apply `RENAME` so the library clips ship under their stable names.
7. `resample()` (lossless keyframe reduction) + `prune()` + `dedup()`, collapse to
   one buffer, write the GLB.

No Blender required. Validated on the current assets: 13 clips, 65 animated bones,
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
