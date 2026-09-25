# models-src — bake inputs (not shipped)

Source 3D assets for the animation **bake**. These are intentionally **outside
`public/`** so Vite doesn't copy them into the browser build — only the final
`public/models/agent-dcl.glb` ships.

| File | What it is |
|---|---|
| `agent.glb` | the rigged character (skeleton + mesh; clips not required) — `UAL2_Standard.glb`'s own male `Mannequin` with its clips stripped |
| `UAL2_Standard.glb` | clip library on the **same rig** (Quaternius Universal Animation Library) |
| `agent-animated.glb` | generated intermediate — character + embedded clips, uncompressed |

Run the bake to (re)generate the shipped asset:

```bash
npm run bake:anims:dcl   # -> public/models/agent-dcl.glb
```

The bake also **authors** the `Walk` and `Run` clips rather than copying them —
the library ships neither, only a carry walk. See
[docs/baking-animations.md](../docs/baking-animations.md#walk-and-run-are-authored-not-copied)
and check a bake with `node scripts/inspect-locomotion.mjs`.

`UAL2_Standard.glb` holds 43 clips; 8 are baked. What's shipped and what's still on
the shelf is catalogued in [docs/animation-catalog.md](../docs/animation-catalog.md)
— list any GLB's clips with `node scripts/list-clips.mjs <file.glb>`.

Replace `agent.glb` / `UAL2_Standard.glb` with any same-rig Quaternius assets and
re-run. See [docs/baking-animations.md](../docs/baking-animations.md). Match the
body to the clips, though: every clip keys every bone's translation, so a body
built on different proportions (the female `Mannequin_F` that used to be here)
gets its arms stretched at runtime. The outfit and bulk tables in
`scripts/lib/outfit.mjs` and `scripts/lib/physique.mjs` are measured on this body.
