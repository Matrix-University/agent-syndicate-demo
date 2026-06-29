# Best practices — Three.js PWA game stack (R3F)

AI guidance for building a **high-performance, installable Three.js PWA game** on:
**Vite · React + React Three Fiber (R3F) · drei · Zustand · Rapier (Wasm) ·
vite-plugin-pwa (Workbox) · TypeScript**, deployed to a CDN (Vercel/Netlify).

> ⚠️ **Scope:** This is the *target* stack. The current repo is **vanilla
> Three.js + Vite** (see `CLAUDE.md` / `.github/copilot-instructions.md`). Don't
> apply R3F/Zustand/Rapier patterns to the existing `src/*.js` files — they apply
> to a new R3F project (or after a deliberate migration).

Two non-negotiables drive every decision here: **asset-loading speed** (3D is
heavy) and **frame-time stability** (a game must hold 60fps, ideally 120).

---

## 0. Project conventions

- **TypeScript everywhere.** R3F + Rapier + Zustand are fully typed; use it.
- Generate typed scene components from models with **`gltfjsx`**
  (`npx gltfjsx model.glb -t -T`) instead of hand-writing `useGLTF` trees.
- Keep `<Canvas>` mounted once at the app root. UI/HUD lives in normal React DOM
  *outside* the canvas (cheaper than rendering text in WebGL).
- Folders: `src/game/` (R3F systems, ECS-ish components), `src/ui/` (DOM HUD,
  menus), `src/state/` (Zustand stores), `public/models/`, `public/textures/`,
  `public/draco/`, `public/basis/` (decoders).

---

## 1. R3F render-loop discipline (the #1 perf rule)

**Never call `setState` / Zustand setters per frame.** React re-renders are death
in a 60fps loop. Drive per-frame motion through **refs + `useFrame`**, and read
state imperatively.

```tsx
// ✅ mutate refs in useFrame; read store without subscribing
useFrame((_, dt) => {
  const { moveX, moveZ } = useInput.getState();   // getState(), not the hook
  body.current.setLinvel({ x: moveX * SPEED, y: vel.y, z: moveZ * SPEED }, true);
});

// ❌ never do this — re-renders the React tree every frame
const pos = usePlayer((s) => s.pos);              // subscribed
useFrame(() => setPos(body.current.translation()));
```

- Use **transient subscriptions** for HUD values that change fast but only need
  to touch the DOM, bypassing React: `store.subscribe(selector, cb)`.
- Clamp `dt` in `useFrame` (`Math.min(dt, 0.05)`) — same backgrounded-tab guard as
  the vanilla project.
- Prefer **on-demand rendering** (`<Canvas frameloop="demand">` + `invalidate()`)
  for menus/static scenes; use `frameloop="always"` only while gameplay/physics
  run. Saves battery on mobile.
- Cap DPR: `<Canvas dpr={[1, 2]}>`. Set `gl={{ powerPreference: 'high-performance',
  antialias: true }}`. Consider `performance={{ min: 0.5 }}` for adaptive DPR.

---

## 2. State — Zustand

- One or a few small stores by concern: `usePlayer`, `useGame` (score/health/
  phase), `useInput`, `useSettings`. Avoid one mega-store.
- **In `useFrame`, read with `getState()` and write with `setState`/actions — do
  not subscribe.** Subscribe only in React components that render DOM/UI.
- Keep transform/physics data **out** of Zustand. Source of truth for position is
  the Rapier rigidbody; mirror to the store only the discrete values the UI needs
  (e.g. health, ammo), and throttle those.
- Selectors must be narrow + stable to avoid extra renders;
  use `useShallow` for object selections.

---

## 3. Physics — Rapier (`@react-three/rapier`)

Rapier is Rust→Wasm: fast, deterministic, small. Defaults that matter for a game:

- **Fixed timestep.** `<Physics timeStep={1 / 60}>` (or `1/120` for a twitch
  shooter). Fixed steps = deterministic, replayable, netcode-friendly. R3F
  interpolates rendering between steps automatically (`interpolate` defaults on).
- **Right body type per object:**
  - Player → **`KinematicCharacterController`** (Rapier's
    `world.createCharacterController`) on a **capsule** collider. Gives
    slope/step/auto-climb without fighting a dynamic body. Don't use a dynamic
    rigidbody for an FPS player.
  - Projectiles/props → **dynamic** rigidbodies.
  - Static world → **fixed** bodies with **trimesh** colliders (trimesh only for
    static geometry; never dynamic-vs-dynamic trimesh).
- **CCD is mandatory for fast objects.** Enable `ccd` on bullets/grenades so they
  don't tunnel through thin walls at speed: `<RigidBody ccd>`.
- **Collision groups / interaction groups** to filter (bullets ignore the shooter,
  pickups only sense the player). Use `<RigidBody collisionGroups={...}>` or the
  `interactionGroups(memberships, filter)` helper.
- **Sensors** (`<RigidBody sensor>` / `<CuboidCollider sensor>`) for triggers,
  pickups, kill-volumes — they report intersections without physical response.
- **Colliders:** prefer primitives (capsule/ball/cuboid) and **convex hulls** for
  dynamic shapes; reserve trimesh for static. Auto-colliders: set
  `colliders="hull"` or `"cuboid"`, only `"trimesh"` for the static level mesh.
- Pool dynamic bodies (bullets, debris, gibs) — don't mount/unmount React nodes
  per shot; recycle a fixed pool and reposition.
- Use the **debug renderer** (`<Physics debug>`) while authoring, strip in prod.

---

## 4. Asset pipeline (the load-time win)

**Never ship raw `.glb`/PNG.** Run every asset through a transform step. Modern,
scriptable tool: **`gltf-transform`** (preferred over the older `gltf-pipeline`).

```bash
# Geometry: Meshopt (great decode speed) + texture compression to KTX2/Basis
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt --texture-compress ktx2 \
  --texture-size 2048
# Draco alternative (smaller files, heavier decode):
#   --compress draco
```

- **Geometry compression:**
  - **Meshopt (`EXT_meshopt_compression`)** — fast GPU-friendly decode; best
    default for a fast-paced game and for **skinned/animated** meshes.
  - **Draco** — smaller files (70–80%) but heavier CPU decode and a Wasm decoder
    to load. Good for big static environments where download size dominates.
  - Pick one per asset class; don't double-compress.
  - ⚠️ **Decentraland-portable assets must use Draco (or uncompressed), not
    Meshopt** — DCL doesn't support Meshopt. See
    [decentraland-asset-compat.md](./decentraland-asset-compat.md).
- **Textures: KTX2 / Basis Universal.** GPU-compressed, stays compressed in VRAM
  (big memory + upload win vs PNG/JPG), transcoded on load via `KTX2Loader`. This
  is usually a *bigger* perf win than geometry compression. Atlas textures; cap at
  2k (1k on mobile); generate mipmaps. ⚠️ **DCL-portable assets need PNG/JPG, not
  KTX2** — keep KTX2 for browser-only assets.
- **Wire up decoders once** with drei:

  ```tsx
  useGLTF.setDecoderPath('/draco/');        // self-host decoder in public/draco
  const gltf = useGLTF('/models/level.glb'); // KTX2 + meshopt handled by drei
  useGLTF.preload('/models/player.glb');     // warm critical assets
  ```

  Self-host the Draco/Basis decoder `.wasm`/`.js` in `public/` (don't hot-link a
  CDN you don't control) so it caches with your service worker and works offline.
- **Loading UX:** wrap scenes in `<Suspense fallback={<Loader/>}>`. **Preload**
  essential assets during the menu; **lazy-load** levels/enemy packs with
  `React.lazy` + dynamic `import()`. Stream heavy stuff in the background while the
  start screen shows (the "pro tip" — make it real with `preload` + Suspense).
- **LOD & instancing:** drei `<Detailed>` (LOD) for distant enemies;
  `<Instances>`/`InstancedMesh` for crowds, props, bullets, particles. Merge
  static geometry (`<Merged>`/`BufferGeometryUtils.mergeGeometries`) to cut draw
  calls.
- **Dispose** anything you tear down outside React's lifecycle; drei caches
  `useGLTF` results, so don't manually dispose shared cached assets.

---

## 5. PWA — vite-plugin-pwa + Workbox

Goal: install to home screen, **heavy 3D assets cached so they never re-download**,
playable offline.

```ts
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    // Precache the app shell + small critical files only. Raise the cap or large
    // .glb won't precache (default ~2 MiB). Prefer runtime-caching big assets.
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    globPatterns: ['**/*.{js,css,html,svg,woff2}'],
    runtimeCaching: [
      {
        // Hashed, immutable model/texture/decoder files → CacheFirst is safe.
        urlPattern: /\.(?:glb|gltf|ktx2|basis|bin|wasm)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'game-assets',
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})
```

- **CacheFirst** for versioned/immutable assets (Vite hashes filenames, so a new
  build = new URL = no stale cache). Use **StaleWhileRevalidate** only for things
  that can change at the same URL.
- **Runtime-cache** large `.glb`/`.ktx2`/`.wasm` rather than bloating the precache
  manifest (keeps the SW install fast and small).
- **Storage quota:** mobile PWAs have limited Cache Storage. Don't cache *every*
  level up front — cache on first visit, set `expiration` to evict, and surface a
  "clear cache" in settings. Check `navigator.storage.estimate()`.
- Provide a complete **Web App Manifest** (name, icons 192/512 + maskable,
  `display: 'standalone'`, theme/background color, orientation `landscape` for a
  game) and an `offline.html` navigation fallback.
- Test the SW with `vite preview` (SW doesn't run in dev by default; enable
  `devOptions.enabled` only when debugging it).

---

## 6. Deployment

- Vercel/Netlify for global CDN + Git-push deploys. Ensure correct MIME types for
  `.wasm` (`application/wasm`) and `.ktx2`/`.basis`.
- Set long-lived `Cache-Control: immutable` on hashed asset paths; let the SW and
  CDN both cache them.
- Enable Brotli/gzip (text assets); `.glb`/`.ktx2`/`.wasm` are already compressed —
  don't double-compress, but do serve over HTTP/2+.
- Keep the **initial JS bundle small**: code-split routes/levels, lazy-load the
  Rapier Wasm and heavy scenes after first paint.

---

## 7. Recommended setup for a **fast-paced shooter**

**Physics**
- `<Physics timeStep={1/60}>` fixed step (go `1/120` if input feels laggy);
  rely on R3F interpolation for smooth rendering.
- **Player:** capsule + Rapier `KinematicCharacterController` (responsive,
  predictable FPS movement; handles slopes/steps). Sample input every fixed step.
- **Hitscan weapons (rifles/pistols):** **raycast, don't spawn projectiles.** Use
  Rapier's `world.castRay`/`castRayAndGetNormal` against colliders (filter by
  interaction groups so you don't hit yourself), apply damage on hit, spawn a
  decal/tracer VFX. Cheaper and frame-accurate.
- **Projectile weapons (rockets/grenades):** dynamic rigidbodies with **`ccd`
  enabled** (prevents tunneling at high speed) drawn from a **pre-allocated pool**.
- **Targets/enemies:** capsule colliders, kinematic or character-controlled;
  sensors for headshot zones.
- Collision/interaction groups: `players`, `enemies`, `world`, `bullets`,
  `pickups` — filter so bullets ignore the firer and pickups only sense players.

**Asset optimization**
- **Meshopt** for animated characters/weapons (fast decode in a hot game loop);
  **Draco** only for large static environment meshes where download size wins.
- **KTX2/Basis** for all textures — biggest VRAM/upload win. 1–2k atlases.
- `gltf-transform optimize ... --compress meshopt --texture-compress ktx2`,
  `gltfjsx -t -T` for typed components.
- **Instancing** for bullets, shells, particles, crowds; **LOD (`<Detailed>`)**
  for distant enemies; merge static level geometry to minimize draw calls.
- Self-host decoders in `public/`, `useGLTF.preload` the player + common weapons
  at the menu, lazy-load each level/enemy pack via dynamic import + Suspense.
- PWA: runtime **CacheFirst** for `.glb/.ktx2/.wasm`, raise
  `maximumFileSizeToCacheInBytes`, evict with `expiration`, mind mobile quota.

**One-line summary:** *Kinematic character controller + raycast hitscan + CCD
pooled projectiles, on Meshopt geometry + KTX2 textures, instanced and LOD'd,
runtime-cached CacheFirst in the service worker.*
