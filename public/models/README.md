# Character models (shipped assets)

Files in `public/` are served at the site root, so `public/models/agent-dcl.glb`
loads in code as `/models/agent-dcl.glb`.

This folder holds only the **final, shipped** character asset. The game loads
**`agent-dcl.glb`** (configured in `src/Game.js`) — a single Draco-compressed GLB
with the character **and its animation clips embedded**, decoded in the browser via
`DRACOLoader` (decoder self-hosted in [`public/draco/`](../draco/)). The **same
file** is what you upload to Decentraland. Until it exists, `Player` falls back to
the primitive placeholder rig — the project always runs.

`agent-dcl.glb` is a **generated build artifact** — don't hand-edit it. It is
produced from source models by:

```bash
npm run bake:anims:dcl
```

## Where the source models live

The bake **inputs** are kept out of `public/` (so they don't ship to the browser)
in [`models-src/`](../../models-src/):

- `models-src/agent.glb` — the rigged character (no clips needed).
- `models-src/UAL2_Standard.glb` — a clip library on the **same rig** (Quaternius
  Universal Animation Library).

`npm run bake:anims:dcl` merges the library's clips onto the character, then Draco-
compresses the result into `public/models/agent-dcl.glb`. See
[docs/baking-animations.md](../../docs/baking-animations.md) for how it works and
how to choose which clips get embedded (`KEEP` in `scripts/bake-animations.mjs`).

## Get a Quaternius CC0 character (recommended)

Quaternius characters are **CC0 (public domain)** — free for any use, no
attribution. From <https://quaternius.com> grab a rigged humanoid and an animation
pack **on the same universal rig**, put them in `models-src/` as `agent.glb` and
`UAL2_Standard.glb`, then run the bake. Suited figures read well as Agents.

## Tuning (in `src/Game.js`)

- **`modelScale`** — Quaternius models are ~1.8 units tall; the game character is
  ~3 units. Start at `1.7` and adjust until the body sits on the floor.
- **`modelYaw`** — set `Math.PI` if the character faces the camera when moving
  forward.

## Clip mapping

`AnimationController` (`src/AnimationController.js`) matches clips to states by
case-insensitive substring, **fragments in priority order** (`CLIP_NAMES`):
`idle_no`/`idle` → idle, `walk` → walk, `run`/`jog`/`sprint` → run. The current
library has `Idle_No_Loop` and `Walk_Carry_Loop` but **no plain run clip**, so the
run state falls back to the walk clip sped up (`CLIP_FALLBACK`). New moves extend
`CLIP_NAMES`/`ACTIONS` there and the `KEEP` set in the bake script (see
[docs/baking-animations.md](../../docs/baking-animations.md)).

## Decentraland-ready by construction

The baked `agent-dcl.glb` already satisfies the DCL asset rules
([docs/decentraland-asset-compat.md](../../docs/decentraland-asset-compat.md)):
single-file GLB, **embedded** clips, **Draco** (not Meshopt) geometry, and no
KTX2 textures. In a DCL scene:
`GltfContainer.create(e, { src: 'models/agent-dcl.glb' })` + `Animator` referencing
clip names like `Idle_No_Loop` / `Walk_Carry_Loop`.

## Other open / free sources

- **Khronos glTF Sample Models** (`CesiumMan`) — CC0/public, rigged test human.
- **Three.js example models** (`Soldier.glb`, `Xbot.glb`) — GLB with embedded clips.
- **Mixamo** — free; exports FBX (convert to GLB in Blender). Different skeleton,
  so clips need retargeting to the Quaternius rig.
- **Ready Player Me** — free customizable GLB avatars.
