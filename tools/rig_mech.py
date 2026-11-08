# HawatriSense - rig the generated Hawatri mech, by Kia Hawatri
# Takes the raw Hunyuan3D mesh + the front reference image, cleans and textures the mesh,
# builds a skeleton, binds it, authors one single-frame action per pose, and exports a
# GLB with looping clips (idle, run, fly, kneel) the app cross-fades between.
#
#   blender -b --python tools/rig_mech.py -- <raw.glb> <ref-nobg.png> <out.glb> [preview_dir]

import sys
import os
import math
import bpy
import numpy as np
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
RAW, REF, OUT = argv[0], argv[1], argv[2]
PREVIEW = argv[3] if len(argv) > 3 else None
HEIGHT = 1.9

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def select_only(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


# ---------- import + clean ----------
bpy.ops.import_scene.gltf(filepath=RAW)
meshes = [o for o in scene.objects if o.type == "MESH"]
select_only(meshes[0])
for o in meshes:
    o.select_set(True)
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "HawatriMech"
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
for o in [o for o in scene.objects if o.type != "MESH"]:
    bpy.data.objects.remove(o)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# face -Y (towards the camera): the generated model faces +Z in glTF => -Y in Blender already.
bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
s = HEIGHT / (mx.z - mn.z)
body.location = (-(mn.x + mx.x) / 2 * s, -(mn.y + mx.y) / 2 * s, -mn.z * s)
body.scale = (s, s, s)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("raw faces", len(body.data.polygons))

# one watertight shell (bone-heat weighting needs it), then slim down
rm = body.modifiers.new("Remesh", "REMESH")
rm.mode = "VOXEL"
rm.voxel_size = 0.0055
bpy.ops.object.modifier_apply(modifier="Remesh")
dec = body.modifiers.new("Decimate", "DECIMATE")
dec.ratio = min(1.0, 42000 / max(1, len(body.data.polygons)))
bpy.ops.object.modifier_apply(modifier="Decimate")
for p in body.data.polygons:
    p.use_smooth = True
print("clean faces", len(body.data.polygons))

# ---------- texture: project the front reference image ----------
img = bpy.data.images.load(REF)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # bottom-up rows
alpha = px[:, :, 3] > 0.5
ys, xs = np.nonzero(alpha)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()  # subject bbox in pixels (y bottom-up)

bb = [Vector(c) for c in body.bound_box]
bx0, bx1 = min(v.x for v in bb), max(v.x for v in bb)
bz0, bz1 = min(v.z for v in bb), max(v.z for v in bb)
me = body.data
uv = me.uv_layers.new(name="UVMap")
for loop in me.loops:
    co = me.vertices[loop.vertex_index].co
    u = (x0 + (co.x - bx0) / (bx1 - bx0) * (x1 - x0)) / w
    v = (y0 + (co.z - bz0) / (bz1 - bz0) * (y1 - y0)) / h
    uv.data[loop.index].uv = (u, v)

# emission mask: saturated teal/cyan pixels become the glowing light strips
rgb = px[:, :, :3]
mxc, mnc = rgb.max(axis=2), rgb.min(axis=2)
sat = np.where(mxc > 0, (mxc - mnc) / np.maximum(mxc, 1e-6), 0)
teal = (sat > 0.35) & (rgb[:, :, 1] > 0.35) & (rgb[:, :, 1] > rgb[:, :, 0] * 1.6) & alpha
em = np.zeros((h, w, 4), dtype=np.float32)
em[teal] = [0.1, 1.0, 0.95, 1.0]
em[:, :, 3] = 1.0
eimg = bpy.data.images.new("MechEmission", w, h)
eimg.pixels = em.ravel()
eimg.filepath_raw = os.path.join(os.path.dirname(OUT), "_mech_emission.png")
eimg.file_format = "PNG"
eimg.pack()
img.pack()

mat = bpy.data.materials.new("MechArmor")
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
etex = nt.nodes.new("ShaderNodeTexImage"); etex.image = eimg
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(etex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 3.0
bsdf.inputs["Metallic"].default_value = 0.75
bsdf.inputs["Roughness"].default_value = 0.22
me.materials.clear()
me.materials.append(mat)

# ---------- skeleton (proportions measured on the A-pose reference) ----------
# x: fraction of height from the centre line (+ = mech's left), z: fraction of height from the floor
J = {
    "hips": (0, .495), "spine": (0, .58), "chest": (0, .67), "neck": (0, .83), "head": (0, .865), "headTop": (0, 1.0),
    "shoulder": (.105, .79), "elbow": (.19, .66), "wrist": (.27, .585), "handEnd": (.31, .5),
    "thigh": (.06, .48), "knee": (.075, .30), "ankle": (.1, .075), "toe": (.1, 0.0),
}
P = lambda k, side=1: Vector((J[k][0] * side * HEIGHT, 0.0, J[k][1] * HEIGHT))

arm = bpy.data.armatures.new("MechRig")
rig = bpy.data.objects.new("MechRig", arm)
scene.collection.objects.link(rig)
select_only(rig)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.edit_bones


def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = head, tail
    b.align_roll(Vector((0, -1, 0)))  # local Z faces forward for every bone
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


bone("hips", P("hips"), P("spine"))
bone("spine", P("spine"), P("chest"), "hips", True)
bone("chest", P("chest"), P("neck"), "spine", True)
bone("neck", P("neck"), P("head"), "chest", True)
bone("head", P("head"), P("headTop"), "neck", True)
for side, sfx in ((1, "L"), (-1, "R")):
    bone("clavicle" + sfx, P("neck") + Vector((0, 0, -.03)), P("shoulder", side), "chest")
    bone("upperArm" + sfx, P("shoulder", side), P("elbow", side), "clavicle" + sfx, True)
    bone("foreArm" + sfx, P("elbow", side), P("wrist", side), "upperArm" + sfx, True)
    bone("hand" + sfx, P("wrist", side), P("handEnd", side), "foreArm" + sfx, True)
    bone("thigh" + sfx, P("thigh", side), P("knee", side), "hips")
    bone("shin" + sfx, P("knee", side), P("ankle", side), "thigh" + sfx, True)
    bone("foot" + sfx, P("ankle", side), P("toe", side) + Vector((0, -.12, .02)), "shin" + sfx, True)
bpy.ops.object.mode_set(mode="OBJECT")

select_only(body)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print("weighted groups", len(body.vertex_groups))

# ---------- animations (bone-local euler degrees; X = pitch forward/back, Z = swing sideways) ----------
# Each clip is keyed at a few frames; looping clips repeat their first key at the end.
STAND = {"upperArmL": (0, 0, -32), "upperArmR": (0, 0, 32), "foreArmL": (14, 0, 0), "foreArmR": (14, 0, 0),
         "handL": (0, 0, -6), "handR": (0, 0, 6)}


def merge(*specs):
    out = {}
    for sp in specs:
        out.update(sp)
    return out


def mirror(spec):
    """Swap left/right and flip sideways/twist rotations."""
    out = {}
    for k, v in spec.items():
        if k.startswith("_"):
            out[k] = v
            continue
        m = k[:-1] + ("R" if k.endswith("L") else "L") if k[-1] in "LR" else k
        out[m] = (v[0], -v[1], -v[2])
    return out


RUN_A = {  # left foot reaching forward, right arm forward
    "spine": (14, 0, 0), "chest": (2, 0, 0), "head": (-12, 0, 0),
    "thighL": (38, 0, -3), "shinL": (-14, 0, 0), "footL": (-8, 0, 0),
    "thighR": (-30, 0, 3), "shinR": (-62, 0, 0), "footR": (28, 0, 0),
    "upperArmR": (58, 0, 46), "foreArmR": (100, 0, 0), "upperArmL": (-48, 0, -46), "foreArmL": (78, 0, 0),
    "handL": (0, 0, -6), "handR": (0, 0, 6),
}
RUN_B = {  # passing: left foot planted under the body, right knee driving up
    "spine": (16, 0, 0), "chest": (2, 0, 0), "head": (-12, 0, 0),
    "thighL": (2, 0, -3), "shinL": (-22, 0, 0), "footL": (6, 0, 0),
    "thighR": (72, 0, 3), "shinR": (-118, 0, 0), "footR": (22, 0, 0),
    "upperArmR": (12, 0, 46), "foreArmR": (92, 0, 0), "upperArmL": (4, 0, -46), "foreArmL": (88, 0, 0),
    "handL": (0, 0, -6), "handR": (0, 0, 6),
}
FLY_A = {  # superhero hover: lean in, lead knee bent, trailing leg long, arms swept back
    "spine": (16, 0, 0), "chest": (6, 0, 0), "neck": (-6, 0, 0), "head": (-16, 0, 0),
    "thighL": (34, 0, -5), "shinL": (-72, 0, 0), "footL": (50, 0, 0),
    "thighR": (-12, 0, 5), "shinR": (-22, 0, 0), "footR": (55, 0, 0),
    "upperArmL": (-38, 0, -14), "foreArmL": (16, 0, 0), "handL": (-35, 0, 0),
    "upperArmR": (-38, 0, 14), "foreArmR": (16, 0, 0), "handR": (-35, 0, 0),
}
FLY_B = merge(FLY_A, {"thighL": (28, 0, -5), "shinL": (-64, 0, 0), "thighR": (-6, 0, 5), "shinR": (-30, 0, 0),
                      "upperArmL": (-44, 0, -18), "upperArmR": (-32, 0, 11), "spine": (19, 0, 0), "head": (-19, 0, 0)})
KNEEL = {
    "_hipsDrop": 0.24,
    "spine": (18, 0, 0), "chest": (10, 0, 0), "neck": (10, 0, 0), "head": (22, 0, 0),
    "thighL": (95, 0, -10), "shinL": (-100, 0, 0), "footL": (5, 0, 0),
    "thighR": (-8, 0, 6), "shinR": (-100, 0, 0), "footR": (55, 0, 0),
    "upperArmL": (45, 0, -38), "foreArmL": (60, 0, 0),
    "upperArmR": (25, 0, 30), "foreArmR": (15, 0, 0), "handR": (0, 0, 6),
}
IDLE_B = merge(STAND, {"chest": (2.5, 0, 0), "head": (2, 6, 0), "foreArmL": (19, 0, 0), "foreArmR": (17, 0, 0), "hips": (0, 0, 1.5)})
IDLE_C = merge(STAND, {"chest": (-1, 0, 0), "head": (-1, -5, 0), "hips": (0, 0, -1.5)})

ANIMS = {
    "idle": {1: STAND, 49: IDLE_B, 97: IDLE_C, 145: STAND},
    "run": {1: RUN_A, 5: RUN_B, 9: mirror(RUN_A), 13: mirror(RUN_B), 17: RUN_A},
    "fly": {1: FLY_A, 25: FLY_B, 49: FLY_A},
    "kneel": {1: KNEEL},
}

select_only(rig)
bpy.ops.object.mode_set(mode="POSE")
rig.animation_data_create()
for pb in rig.pose.bones:
    pb.rotation_mode = "XYZ"


def apply_pose(spec):
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for name, rot in spec.items():
        if name == "_hipsDrop":
            rig.pose.bones["hips"].location = (0, -rot * HEIGHT, 0)  # hips bone points up: local -Y = down
            continue
        rig.pose.bones[name].rotation_euler = Euler([math.radians(a) for a in rot])


for name, keys in ANIMS.items():
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    for frame, spec in keys.items():
        apply_pose(spec)
        for pb in rig.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
rig.animation_data.action = None
apply_pose(STAND)
bpy.ops.object.mode_set(mode="OBJECT")
scene.render.fps = 24

bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animation_mode="NLA_TRACKS",
                          export_yup=True, export_apply=False, export_lights=False, export_cameras=False)
print("EXPORTED", OUT)

# ---------- previews: key frames of every clip ----------
if PREVIEW:
    world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
    next(n for n in world.node_tree.nodes if n.type == "BACKGROUND").inputs["Color"].default_value = (0.02, 0.07, 0.09, 1)
    for nm, loc, e in (("key", (2, -3, 3), 900), ("rim", (-2.5, 2, 2.5), 600)):
        l = bpy.data.lights.new(nm, "AREA"); l.energy = e; l.size = 2
        lo = bpy.data.objects.new(nm, l); scene.collection.objects.link(lo); lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
    cam.location = (3.4, -2.6, 1.2)  # three-quarter side view so leg/arm swings read
    cam.rotation_euler = (Vector((0, 0, 0.85)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 360, 480
    select_only(rig)
    rig.animation_data.use_nla = False
    bpy.ops.object.mode_set(mode="POSE")
    shots = [("idle", STAND), ("runA", RUN_A), ("runB", RUN_B), ("runC", mirror(RUN_A)), ("fly", FLY_A), ("kneel", KNEEL)]
    for name, spec in shots:
        apply_pose(spec)
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(PREVIEW, f"pose_{name}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", PREVIEW)
