# models-src — bake inputs (not shipped)

Source 3D assets for the animation **bake**. These are intentionally **outside
`public/`** so Vite doesn't copy them into the browser build — only the final
`public/models/agent-dcl.glb` ships.

| File | What it is |
|---|---|
| `agent.glb` | the rigged character (skeleton + mesh; clips not required) |
| `UAL2_Standard.glb` | clip library on the **same rig** (Quaternius Universal Animation Library) |
| `agent-animated.glb` | generated intermediate — character + embedded clips, uncompressed |

Run the bake to (re)generate the shipped asset:

```bash
npm run bake:anims:dcl   # -> public/models/agent-dcl.glb
```

Replace `agent.glb` / `UAL2_Standard.glb` with any same-rig Quaternius assets and
re-run. See [docs/baking-animations.md](../docs/baking-animations.md).
