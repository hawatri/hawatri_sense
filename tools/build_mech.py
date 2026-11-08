# HawatriSense - Hawatri mech model builder, by Kia Hawatri
# Builds an original hard-surface chrome mech with a joint hierarchy (empties) so the
# app can pose it per mode, then exports app/assets/hawatri-mech.glb.
#
#   blender -b --python tools/build_mech.py -- <out.glb> [preview.png]

import sys
import math
import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "hawatri-mech.glb"
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------- materials ----------
def material(name, color, metal, rough, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


CHROME = material("Chrome", (0.80, 0.84, 0.90), 1.0, 0.12)
STEEL = material("Steel", (0.10, 0.12, 0.16), 1.0, 0.30)
JOINT = material("Joint", (0.03, 0.035, 0.045), 0.6, 0.45)
BLUE = material("Accent", (0.06, 0.18, 0.55), 1.0, 0.22)
GLOW = material("Glow", (0.0, 0.9, 0.9), 0.0, 0.3, (0.0, 0.95, 1.0), 6.0)


# ---------- geometry helpers ----------
def box(name, size, loc, parent, mat, top=(1, 1), front=0.0, bevel=0.018, rot=(0, 0, 0)):
    """Tapered box. `top` scales the upper face (x, y); `front` pushes the upper face forward."""
    sx, sy, sz = (s / 2 for s in size)
    bm = bmesh.new()
    vs = []
    for z in (-sz, sz):
        kx, ky = top if z > 0 else (1, 1)
        dy = -front if z > 0 else 0
        for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vs.append(bm.verts.new((x * sx * kx, y * sy * ky + dy, z)))
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([vs[i] for i in f])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if bevel:
        mod = ob.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    for p in ob.data.polygons:
        p.use_smooth = True
    attach(ob, parent, loc, rot)
    return ob


def cyl(name, r, h, loc, parent, mat, rot=(0, 0, 0), verts=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=h)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    mod = ob.modifiers.new("Bevel", "BEVEL")
    mod.width = min(r, h) * 0.15
    mod.segments = 2
    mod.limit_method = "ANGLE"
    attach(ob, parent, loc, rot)
    return ob


def attach(ob, parent, loc, rot):
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]


def joint(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


# ---------- skeleton ----------
root = joint("mech", (0, 0, 0))
hips = joint("hips", (0, 0, 1.0), root)
spine = joint("spine", (0, 0, 0.08), hips)
chest = joint("chest", (0, 0, 0.16), spine)
neck = joint("neck", (0, 0, 0.36), chest)
head = joint("head", (0, 0, 0.07), neck)

# pelvis + belt
box("pelvis", (0.36, 0.24, 0.16), (0, 0, -0.02), hips, STEEL, top=(1.05, 1.0))
box("belt", (0.38, 0.26, 0.05), (0, 0, 0.05), hips, JOINT)
box("buckle", (0.12, 0.03, 0.08), (0, -0.135, 0.0), hips, CHROME)
box("buckleGlow", (0.06, 0.01, 0.025), (0, -0.152, 0.0), hips, GLOW, bevel=0.004)
for s in (-1, 1):
    box(f"hipPlate{'L' if s > 0 else 'R'}", (0.13, 0.22, 0.17), (s * 0.19, 0, -0.06), hips, CHROME, top=(1.1, 1.05), rot=(0, s * -8, 0))

# abdomen
box("abdomen", (0.26, 0.18, 0.16), (0, 0, 0.06), spine, JOINT, top=(1.15, 1.1))
for i, z in enumerate((0.02, 0.08)):
    box(f"abPlate{i}", (0.2, 0.04, 0.05), (0, -0.095, z), spine, STEEL, top=(1.1, 1))

# chest
box("torso", (0.40, 0.26, 0.34), (0, 0.0, 0.17), chest, STEEL, top=(1.28, 1.15), front=0.02, bevel=0.03)
for s in (-1, 1):
    side = "L" if s > 0 else "R"
    box(f"pec{side}", (0.21, 0.07, 0.2), (s * 0.115, -0.14, 0.21), chest, CHROME, top=(1.1, 0.8), rot=(8, 0, s * 12), bevel=0.025)
    box(f"ribGlow{side}", (0.012, 0.012, 0.13), (s * 0.2, -0.13, 0.12), chest, GLOW, bevel=0.003, rot=(0, s * 14, 0))
    box(f"collar{side}", (0.16, 0.2, 0.06), (s * 0.13, 0.0, 0.35), chest, CHROME, rot=(0, s * 14, 0))
cyl("coreRing", 0.06, 0.035, (0, -0.172, 0.17), chest, CHROME, rot=(90, 0, 0), verts=6)
cyl("core", 0.042, 0.02, (0, -0.19, 0.17), chest, GLOW, rot=(90, 0, 0), verts=6)
box("back", (0.34, 0.12, 0.3), (0, 0.16, 0.18), chest, STEEL, top=(1.1, 0.8))
for s in (-1, 1):
    cyl(f"thruster{'L' if s > 0 else 'R'}", 0.04, 0.16, (s * 0.09, 0.22, 0.12), chest, JOINT, rot=(0, 0, 0))

# neck + head
cyl("neckCyl", 0.06, 0.1, (0, 0, 0.0), neck, JOINT)
box("helmet", (0.21, 0.25, 0.24), (0, 0.0, 0.13), head, CHROME, top=(0.92, 0.9), bevel=0.05)
box("faceplate", (0.17, 0.06, 0.13), (0, -0.12, 0.08), head, STEEL, top=(0.85, 1), bevel=0.03)
box("visor", (0.18, 0.03, 0.045), (0, -0.135, 0.15), head, GLOW, top=(1.05, 1), bevel=0.012)
box("crest", (0.03, 0.22, 0.06), (0, 0.0, 0.27), head, BLUE, top=(0.6, 0.7), bevel=0.01)
for s in (-1, 1):
    box(f"ear{'L' if s > 0 else 'R'}", (0.04, 0.12, 0.1), (s * 0.11, 0.01, 0.12), head, STEEL, bevel=0.015)


# ---------- limbs ----------
def arm(s):
    side = "L" if s > 0 else "R"
    sh = joint(f"shoulder{side}", (s * 0.3, 0.0, 0.3), chest)
    box(f"pauldron{side}", (0.2, 0.26, 0.17), (s * 0.04, 0, 0.04), sh, CHROME, top=(0.8, 0.9), rot=(0, s * -18, 0), bevel=0.04)
    box(f"pauldronGlow{side}", (0.012, 0.2, 0.012), (s * 0.13, -0.0, 0.0), sh, GLOW, bevel=0.003, rot=(0, s * -40, 0))
    cyl(f"shoulderBall{side}", 0.07, 0.1, (0, 0, 0), sh, JOINT, rot=(0, 90, 0))
    upper = joint(f"upperArm{side}", (s * 0.02, 0, -0.04), sh)
    box(f"bicep{side}", (0.11, 0.12, 0.24), (0, 0, -0.15), upper, STEEL, top=(1.15, 1.1))
    box(f"bicepPlate{side}", (0.05, 0.13, 0.17), (s * 0.05, 0, -0.14), upper, BLUE)
    elbow = joint(f"foreArm{side}", (0, 0, -0.29), upper)
    cyl(f"elbowBall{side}", 0.055, 0.12, (0, 0, 0), elbow, JOINT, rot=(0, 90, 0))
    box(f"gauntlet{side}", (0.13, 0.14, 0.25), (0, -0.005, -0.14), elbow, CHROME, top=(1.2, 1.15), bevel=0.03)
    box(f"gauntletGlow{side}", (0.01, 0.012, 0.15), (s * 0.068, -0.03, -0.14), elbow, GLOW, bevel=0.003)
    hand = joint(f"hand{side}", (0, 0, -0.28), elbow)
    box(f"fist{side}", (0.1, 0.11, 0.1), (0, -0.01, -0.05), hand, STEEL, bevel=0.025)
    box(f"knuckles{side}", (0.09, 0.03, 0.07), (0, -0.065, -0.05), hand, CHROME, bevel=0.012)


def leg(s):
    side = "L" if s > 0 else "R"
    th = joint(f"thigh{side}", (s * 0.12, 0, -0.06), hips)
    cyl(f"hipBall{side}", 0.07, 0.1, (0, 0, 0), th, JOINT, rot=(0, 90, 0))
    box(f"thighArmor{side}", (0.16, 0.18, 0.36), (0, -0.005, -0.21), th, CHROME, top=(1.2, 1.15), bevel=0.035)
    box(f"thighGlow{side}", (0.012, 0.012, 0.22), (s * 0.085, -0.04, -0.2), th, GLOW, bevel=0.003)
    knee = joint(f"shin{side}", (0, 0, -0.43), th)
    cyl(f"kneeBall{side}", 0.06, 0.13, (0, 0, 0), knee, JOINT, rot=(0, 90, 0))
    box(f"kneePad{side}", (0.12, 0.06, 0.12), (0, -0.08, 0.0), knee, CHROME, top=(0.8, 1), bevel=0.025)
    box(f"shinArmor{side}", (0.13, 0.16, 0.38), (0, 0.0, -0.21), knee, STEEL, top=(1.15, 1.2), bevel=0.03)
    box(f"shinGuard{side}", (0.1, 0.04, 0.3), (0, -0.085, -0.2), knee, CHROME, top=(1.1, 1), bevel=0.02)
    box(f"calf{side}", (0.1, 0.06, 0.2), (0, 0.09, -0.16), knee, BLUE, top=(1.1, 1))
    ankle = joint(f"foot{side}", (0, 0, -0.42), knee)
    box(f"boot{side}", (0.13, 0.27, 0.08), (0, -0.04, -0.03), ankle, STEEL, top=(0.95, 0.85), bevel=0.025)
    box(f"toe{side}", (0.12, 0.08, 0.05), (0, -0.15, -0.045), ankle, CHROME, bevel=0.018)


for s in (-1, 1):
    arm(s)
    leg(s)

# relaxed default pose (arms slightly out)
bpy.data.objects["shoulderL"].rotation_euler = (0, math.radians(-8), 0)
bpy.data.objects["shoulderR"].rotation_euler = (0, math.radians(8), 0)
bpy.data.objects["foreArmL"].rotation_euler = (math.radians(12), 0, 0)
bpy.data.objects["foreArmR"].rotation_euler = (math.radians(12), 0, 0)

# ---------- export ----------
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
                          export_lights=False, export_cameras=False)
print("EXPORTED", OUT)

# ---------- preview render ----------
if PREVIEW:
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.01, 0.05, 0.07, 1)
    bg.inputs["Strength"].default_value = 1.0
    for name, loc, energy, color in (("key", (2, -3, 3), 900, (0.8, 0.95, 1)), ("rim", (-2.5, 2, 2.5), 700, (0, 0.9, 1)),
                                     ("fill", (-2, -3, 1), 250, (0.3, 0.5, 1))):
        l = bpy.data.lights.new(name, "AREA")
        l.energy = energy
        l.color = color
        l.size = 2
        lo = bpy.data.objects.new(name, l)
        scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 1)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (0.9, -3.6, 1.2)
    cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    scene.camera = cam
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 640, 900
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print("RENDERED", PREVIEW)
