# Blender alternative to scripts/bake-animations.mjs — bakes a same-rig clip
# library into a character and exports one GLB with embedded clips (the format
# Decentraland needs). Use this if you'd rather work in Blender, or if a model
# needs cleanup the Node pipeline can't do.
#
# Headless run (Blender 3.6+ / 4.x):
#   blender --background --python scripts/bake-animations-blender.py -- \
#     models-src/agent.glb models-src/UAL2_Standard.glb models-src/agent-animated.glb
#
# Both files must share the same skeleton (identical bone names) — the actions
# from the library then drive the character's armature directly.

import bpy
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
char_path = argv[0] if len(argv) > 0 else "models-src/agent.glb"
lib_path = argv[1] if len(argv) > 1 else "models-src/UAL2_Standard.glb"
out_path = argv[2] if len(argv) > 2 else "models-src/agent-animated.glb"

# Clips to embed by name; leave empty to keep every clip in the library.
KEEP = {
    "Idle_No_Loop",
    "Walk_Carry_Loop",
    "Melee_Hook",
    "Melee_Hook_Rec",
    "Hit_Knockback",
}

bpy.ops.wm.read_factory_settings(use_empty=True)

# Character (mesh + skeleton).
bpy.ops.import_scene.gltf(filepath=char_path)
char_objs = list(bpy.context.selected_objects)
char_arm = next(o for o in char_objs if o.type == "ARMATURE")

# Library import brings its actions into bpy.data.actions.
actions_before = set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=lib_path)
lib_objs = list(bpy.context.selected_objects)
new_actions = [a for a in bpy.data.actions if a not in actions_before]

# Stash each kept action as an NLA strip on the CHARACTER armature so the glTF
# exporter writes it as a clip bound to the character's bones.
if not char_arm.animation_data:
    char_arm.animation_data_create()
kept = []
for act in new_actions:
    if KEEP and act.name not in KEEP:
        continue
    track = char_arm.animation_data.nla_tracks.new()
    track.name = act.name
    start = int(act.frame_range[0])
    track.strips.new(act.name, start, act)
    kept.append(act.name)

# Remove the library's armature + mesh; keep only the character.
for obj in lib_objs:
    bpy.data.objects.remove(obj, do_unlink=True)

# Export the character hierarchy with its NLA-stashed clips as a single GLB.
bpy.ops.object.select_all(action="DESELECT")
for obj in char_objs:
    obj.select_set(True)
bpy.context.view_layer.objects.active = char_arm

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",  # one clip per stashed track
)

print("Baked %d clip(s) into %s: %s" % (len(kept), out_path, ", ".join(kept)))
