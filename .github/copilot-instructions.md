# Copilot instructions — Agent Syndicate (Three.js)

A third-person brawler prototype built on **Three.js `^0.160`** + **Vite**, plain
ES modules, no framework, no TypeScript. Keep suggestions in that idiom: small
classes, `import * as THREE from 'three'`, addons via `three/addons/...`.

**Dual target:** a browser game whose **3D assets are the same files a Decentraland
(SDK7) scene loads**. Three.js engine code does *not* run in DCL — only the **GLB
assets** port.

**Invariant — one asset, both targets:** browser and DCL load the *same* baked
`public/models/agent-dcl.glb` (single GLB, embedded clips, Draco). Don't introduce a
browser-only character asset or a separate runtime animation file as the shipped
path, and don't apply browser-only optimizations (Meshopt, KTX2) to it — DCL can't
read them. Keep new shipped assets within the DCL rules in the "Decentraland
compatibility" section below (and [docs/decentraland-asset-compat.md](../docs/decentraland-asset-compat.md),
[docs/baking-animations.md](../docs/baking-animations.md)).

## Project shape

```
index.html               canvas + HUD, loads src/main.js
src/main.js              boots the Game
src/Game.js              renderer, scene, camera, the update loop
src/World.js             lights, floor, grid, blockout pillars
src/Player.js            character: rig, movement, animation state machine
src/ThirdPersonCamera.js smooth follow camera
src/Input.js             keyboard state + movement axes
```

Architecture rule that must be preserved: **`Player.root` moves through the world
(the camera follows it); `Player.rig` is the visible body.** Movement code touches
`root`; visual/animation code touches `rig`. Replacing the character art must not
require touching movement.

## The render loop

- One loop, driven by `renderer.setAnimationLoop` in `Game._loop`. Don't add
  separate `requestAnimationFrame` loops in components — pass `dt` down instead.
- Update order is **simulate → camera → render**: `player.update(dt, …)`, then
  `followCam.update(dt)`, then `renderer.render(...)`. Preserve it.
- `dt` comes from a `THREE.Clock` and is **clamped** (`Math.min(getDelta(), 0.05)`)
  so a backgrounded tab can't teleport things. Keep that clamp.

## Frame-rate independence (important)

- Everything time-based takes `dt` and is frame-rate independent. **Never** write
  `x += speed` per frame — write `x += speed * dt`.
- For smoothing/damping use the exponential form already in the code, not a raw
  `lerp(a, b, 0.1)`:
  - `1 - Math.exp(-k * dt)` (see `dampAngle` in `Player.js`)
  - `1 - Math.pow(base, dt)` (see the camera lerp and limb ease-out)
- Wrap angles to `[-π, π]` before damping a yaw (see `dampAngle`).

## Performance / allocation discipline

- **No per-frame allocation in `update`/`_animate`.** Reuse preallocated scratch
  vectors (`this._forward`, `this._right`, `this._move`, `this._desired`, …) with
  `.copy()`, `.set()`, `.addScaledVector()`. Do not `new THREE.Vector3()` inside a
  per-frame method.
- Share geometry and materials across meshes (see `limbGeo`, `pillarMat`). Don't
  build a fresh material per mesh in a loop.
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — keep the cap.
- Anything you create and later remove (geometries, materials, textures,
  `GLTFLoader` results, render targets) must be `.dispose()`d. Removing from the
  scene graph alone leaks GPU memory.

## Three.js conventions in this repo

- Units are roughly meters, **Y is up**, the floor is a `PlaneGeometry` rotated
  `-Math.PI/2`. Player height ≈ 3 units.
- Shadows are on: `renderer.shadowMap.type = PCFSoftShadowMap`. New large meshes
  set `castShadow` / `receiveShadow` deliberately; keep the directional light's
  shadow-camera frustum (`shadow.camera.left/right/...`) tight around the play
  area — don't blow it up to cover the whole floor.
- Lighting/material look is Matrix-green: emissive accents (`0x39ff14`),
  `MeshStandardMaterial` with explicit `roughness`/`metalness`. Match it.
- Use `THREE.MathUtils` (`clamp`, `lerp`, `degToRad`) instead of hand-rolling.
- Camera basis for movement is derived from `camera.getWorldDirection()` flattened
  onto the ground plane — reuse that pattern rather than hardcoding world axes.

## Animation

- **Split:** `Player` (`src/Player.js`) owns movement, vertical physics, and intent;
  `AnimationController` (`src/AnimationController.js`) owns all clip/mixer work. Don't
  drive the mixer from `Player` — call `anim.setLocomotion(state, speedFactor)`,
  `anim.playAction('punch')`, `anim.jumpTakeoff()`/`anim.jumpLand()`, `anim.update(dt)`.
- `Player` loads the single baked **`/models/agent-dcl.glb`** (Quaternius CC0,
  Draco-compressed, clips embedded — same file as the DCL build) via `GLTFLoader` +
  `DRACOLoader` (`three/addons/loaders/...`, decoder in `public/draco/`) and hands the
  clips to an `AnimationController`. An optional `animationUrl` (same-rig clip library)
  is supported for dev. If no model loads, `Player` falls back to the procedural
  placeholder in `_animate` — keep that fallback intact.
- In `AnimationController`: clips bind by case-insensitive substring (`CLIP_NAMES`,
  priority-ordered); override priority is **airborne > action > landing > locomotion**.
  A new looping state extends `STATE` + `CLIP_NAMES` (+ the `state =` line in
  `Player.update`); a one-shot extends `ACTIONS` + an `Input` intent getter + a
  `playAction` call. Add the clip to `KEEP` in `scripts/bake-animations.mjs` and re-bake.
- One-shot/edge inputs use `Input.wasPressed(...)` (e.g. `punchPressed`/`jumpPressed`);
  `Game._loop` calls `input.endFrame()` after `player.update`. `.dispose()` what you
  swap out (`disposeObject`, `AnimationController.dispose()`).

## Decentraland compatibility (keep assets portable)

Browser and DCL ship the **same** GLB; running Three.js in DCL is not a goal. When
generating/optimizing 3D assets, follow these so one file works in both engines:

- **GLB (glTF 2.0), single file, animation clips embedded.** Skeletal only. Browser
  and DCL load the same baked `public/models/agent-dcl.glb` (via `DRACOLoader`,
  decoder in `public/draco/`), produced by `npm run bake:anims:dcl` from sources in
  `models-src/` (see [docs/baking-animations.md](../docs/baking-animations.md)).
  Don't hand-edit the generated `agent-dcl.glb`.
- **Clean, stable clip names** (`Idle`, `Run`, `Attack`). DCL's `Animator` needs
  the exact name; our `CLIP_NAMES` matches loosely — consistent names satisfy both.
- **DCL supports Draco, NOT Meshopt, and NOT KTX2/Basis textures.** For portable
  assets use **Draco (or uncompressed) + PNG/JPG**; keep Meshopt/KTX2 for
  browser-only assets (export two profiles if an asset needs both).
- **Low-poly + shared/atlased materials/textures.** DCL caps per `n` parcels:
  triangles `n×10,000`, entities `n×200`, bodies `n×300`, materials
  `log2(n+1)×20`, textures `log2(n+1)×10`. Use instancing/LOD for crowds.
- **Keep gameplay/render logic decoupled from asset definitions** so a future DCL
  SDK7 port swaps the runtime but reuses the GLBs.
- **Avatar wearables/emotes are out of scope** — they need a re-rig to DCL's avatar
  armature (≤62 bones) and hard caps (emote ≤3,000 tris, ≤10 s/300 frames, single
  clip, ≤3 MB). Separate deliverable, not the in-game character files.

## Input

- Keyboard state lives in `Input` (a `Set` of `e.code`), exposed as axes
  (`moveX`, `moveZ`, `sprint`). Add new actions as getters there; read them in
  `update`. Keys are cleared on `blur` to avoid stuck movement — keep that.

## Conventions & gotchas

- ES modules only (`"type": "module"`); use `import`, not `require`.
- Private-ish methods are prefixed `_`. Classes are PascalCase, files match.
- Comments explain *why* (the dt clamp, the root/rig split), not *what*. Match
  that density — terse, purposeful.
- Loaders, model files, and async asset loading belong in `public/models/`
  (served at `/models/...`).
- Run with `npm run dev`; build with `npm run build`. No test framework is set up.
