"""Philly OTB cheesesteak — photoreal Blender (Cycles) scene, built from code.

Usage (renders one still):
  blender -b -P scripts/blender/otb_scene.py -- --still out.png [--samples 128] [--res 1280x720]

Ingredients follow the menu (Philly OTB): fresh sesame hoagie roll, chopped
premium steak, grilled onions, red and green bell peppers, sharp white American, OTB Ranch
(white, peppery), OTB Tang (orange). Look is matched to the owner's reference
render: seared sliced steak, melted white cheese with drips, glossy crust,
dark board, warm rim light, steam.
"""

import math
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        return ARGS[i + 1] if i + 1 < len(ARGS) else True
    return default


rng = random.Random(7)

# ───────────────────────── scene reset ─────────────────────────

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def link(obj, coll=None):
    (coll or scene.collection).objects.link(obj)
    return obj


def new_collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c


# ───────────────────────── material helpers ─────────────────────────


def material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, bsdf, out


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
        else:
            setattr(n, k, v)
    return n


def ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0]
    els[1].position, els[1].color = stops[-1]
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = col
    return r


def hexc(h, a=1.0):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, a)


def bump_chain(nt, bsdf, height_socket, strength=0.4, distance=0.02):
    b = node(nt, "ShaderNodeBump", Strength=strength, Distance=distance)
    nt.links.new(height_socket, b.inputs["Height"])
    nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    return b


def mat_crust():
    m, nt, bsdf, _ = material("crust")
    tc = node(nt, "ShaderNodeTexCoord")
    noise = node(nt, "ShaderNodeTexNoise", Scale=4.5, Detail=14.0, Roughness=0.7)
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    # Darker, more baked on the crown (object Z), lighter golden on the sides.
    sep = node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    zmap = node(nt, "ShaderNodeMapRange", **{"From Min": -0.1, "From Max": 0.75})
    nt.links.new(sep.outputs["Z"], zmap.inputs["Value"])
    mix = node(nt, "ShaderNodeMix", data_type="FLOAT")
    mix.inputs["Factor"].default_value = 0.4
    nt.links.new(noise.outputs["Fac"], mix.inputs["A"])
    nt.links.new(zmap.outputs["Result"], mix.inputs["B"])
    cr = ramp(nt, [(0.0, hexc("#cf9550")), (0.35, hexc("#ae6c2f")), (0.65, hexc("#84481c")), (1.0, hexc("#52280e"))])
    nt.links.new(mix.outputs["Result"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.34
    bsdf.inputs["Subsurface Weight"].default_value = 0.04
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.7, 0.4)
    bsdf.inputs["Subsurface Scale"].default_value = 0.04
    bsdf.inputs["Coat Weight"].default_value = 0.3  # egg-wash sheen, like the reference
    bsdf.inputs["Coat Roughness"].default_value = 0.28
    # Bump: fine pores + baked cracks.
    pores = node(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=6.0)
    nt.links.new(tc.outputs["Object"], pores.inputs["Vector"])
    cracks = node(nt, "ShaderNodeTexNoise", Scale=1.6, Detail=4.0, Distortion=0.6)
    nt.links.new(tc.outputs["Object"], cracks.inputs["Vector"])
    cmap = node(nt, "ShaderNodeMapRange", **{"From Min": 0.45, "From Max": 0.6})
    nt.links.new(cracks.outputs["Fac"], cmap.inputs["Value"])
    add = node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
    nt.links.new(pores.outputs["Fac"], add.inputs[0])
    add.inputs[1].default_value = 0.25
    nt.links.new(cmap.outputs["Result"], add.inputs[2])
    bump_chain(nt, bsdf, add.outputs["Value"], strength=0.6, distance=0.035)
    return m


def mat_crumb():
    m, nt, bsdf, _ = material("crumb")
    tc = node(nt, "ShaderNodeTexCoord")
    vor = node(nt, "ShaderNodeTexVoronoi", Scale=40.0)
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    cr = ramp(nt, [(0.0, hexc("#d9bf8f")), (0.35, hexc("#f2e2c0")), (1.0, hexc("#fbf1dc"))])
    nt.links.new(vor.outputs["Distance"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Subsurface Weight"].default_value = 0.35
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.5)
    bsdf.inputs["Subsurface Scale"].default_value = 0.05
    bump_chain(nt, bsdf, vor.outputs["Distance"], strength=0.6, distance=0.02)
    return m


def mat_steak():
    m, nt, bsdf, _ = material("steak")
    tc = node(nt, "ShaderNodeTexCoord")
    info = node(nt, "ShaderNodeObjectInfo")
    geo = node(nt, "ShaderNodeNewGeometry")
    # Broad color variation per piece + across the surface.
    broad = node(nt, "ShaderNodeTexNoise", Scale=6.0, Detail=8.0, Roughness=0.6)
    nt.links.new(tc.outputs["Object"], broad.inputs["Vector"])
    mix1 = node(nt, "ShaderNodeMix", data_type="FLOAT")
    mix1.inputs["Factor"].default_value = 0.45
    nt.links.new(broad.outputs["Fac"], mix1.inputs["A"])
    nt.links.new(info.outputs["Random"], mix1.inputs["B"])
    meat = ramp(nt, [(0.0, hexc("#2e1508")), (0.25, hexc("#4f2711")), (0.55, hexc("#74401d")), (0.8, hexc("#9a5d2e")), (1.0, hexc("#b8783f"))])
    nt.links.new(mix1.outputs["Result"], meat.inputs["Fac"])
    # Char: dark crusty patches (noise threshold) + seared convex edges (pointiness).
    charn = node(nt, "ShaderNodeTexNoise", Scale=11.0, Detail=6.0)
    nt.links.new(tc.outputs["Object"], charn.inputs["Vector"])
    charmask = node(nt, "ShaderNodeMapRange", **{"From Min": 0.5, "From Max": 0.64})
    nt.links.new(charn.outputs["Fac"], charmask.inputs["Value"])
    edge = node(nt, "ShaderNodeMapRange", **{"From Min": 0.53, "From Max": 0.65})
    nt.links.new(geo.outputs["Pointiness"], edge.inputs["Value"])
    charsum = node(nt, "ShaderNodeMath", operation="MAXIMUM")
    nt.links.new(charmask.outputs["Result"], charsum.inputs[0])
    nt.links.new(edge.outputs["Result"], charsum.inputs[1])
    char = node(nt, "ShaderNodeMix", data_type="RGBA")
    char.inputs["B"].default_value = hexc("#1a0b04")
    nt.links.new(charsum.outputs["Value"], char.inputs["Factor"])
    nt.links.new(meat.outputs["Color"], char.inputs["A"])
    nt.links.new(char.outputs["Result"], bsdf.inputs["Base Color"])
    # Juice: glossy spots, matte crust elsewhere.
    juice = node(nt, "ShaderNodeTexNoise", Scale=18.0, Detail=3.0)
    nt.links.new(tc.outputs["Object"], juice.inputs["Vector"])
    rough = node(nt, "ShaderNodeMapRange", **{"From Min": 0.4, "From Max": 0.6, "To Min": 0.14, "To Max": 0.7})
    nt.links.new(juice.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Coat Weight"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.75
    bsdf.inputs["Subsurface Weight"].default_value = 0.05
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.3, 0.2)
    bsdf.inputs["Subsurface Scale"].default_value = 0.02
    # Crumbly, fibrous micro-surface.
    micro = node(nt, "ShaderNodeTexNoise", Scale=60.0, Detail=12.0, Roughness=0.7)
    nt.links.new(tc.outputs["Object"], micro.inputs["Vector"])
    bump_chain(nt, bsdf, micro.outputs["Fac"], strength=0.8, distance=0.008)
    return m


def mat_cheese():
    m, nt, bsdf, _ = material("white_american")
    bsdf.inputs["Base Color"].default_value = hexc("#f1e6cc")
    bsdf.inputs["Roughness"].default_value = 0.28
    bsdf.inputs["Subsurface Weight"].default_value = 0.75  # milky translucency
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.85, 0.6)
    bsdf.inputs["Subsurface Scale"].default_value = 0.06
    bsdf.inputs["Coat Weight"].default_value = 0.55
    bsdf.inputs["Coat Roughness"].default_value = 0.15
    tc = node(nt, "ShaderNodeTexCoord")
    n = node(nt, "ShaderNodeTexNoise", Scale=30.0, Detail=4.0)
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    bump_chain(nt, bsdf, n.outputs["Fac"], strength=0.15, distance=0.01)
    return m


def mat_onion():
    m, nt, bsdf, _ = material("grilled_onion")
    info = node(nt, "ShaderNodeObjectInfo")
    cr = ramp(nt, [(0.0, hexc("#e2c486")), (0.5, hexc("#c99245")), (1.0, hexc("#93531f"))])
    nt.links.new(info.outputs["Random"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.18
    bsdf.inputs["Transmission Weight"].default_value = 0.35
    bsdf.inputs["Subsurface Weight"].default_value = 0.6
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.9, 0.6)
    bsdf.inputs["Subsurface Scale"].default_value = 0.04
    bsdf.inputs["Coat Weight"].default_value = 0.6
    return m


def mat_pepper(color):
    m, nt, bsdf, _ = material(f"pepper_{color}")
    bsdf.inputs["Base Color"].default_value = hexc(color)
    bsdf.inputs["Roughness"].default_value = 0.15
    bsdf.inputs["Coat Weight"].default_value = 0.8
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    bsdf.inputs["Subsurface Weight"].default_value = 0.3
    bsdf.inputs["Subsurface Scale"].default_value = 0.02
    return m


def mat_sauce(name, color, flecks=False):
    m, nt, bsdf, _ = material(name)
    col_socket = None
    if flecks:
        tc = node(nt, "ShaderNodeTexCoord")
        v = node(nt, "ShaderNodeTexVoronoi", Scale=160.0)
        nt.links.new(tc.outputs["Object"], v.inputs["Vector"])
        r = ramp(nt, [(0.0, hexc("#1c140e")), (0.06, hexc("#1c140e")), (0.07, hexc(color)), (1.0, hexc(color))])
        nt.links.new(v.outputs["Distance"], r.inputs["Fac"])
        col_socket = r.outputs["Color"]
    if col_socket:
        nt.links.new(col_socket, bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = hexc(color)
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Subsurface Weight"].default_value = 0.45
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.6)
    bsdf.inputs["Subsurface Scale"].default_value = 0.03
    bsdf.inputs["Coat Weight"].default_value = 0.7
    bsdf.inputs["Coat Roughness"].default_value = 0.05
    return m


def mat_board():
    m, nt, bsdf, _ = material("board")
    tc = node(nt, "ShaderNodeTexCoord")
    n = node(nt, "ShaderNodeTexNoise", Scale=2.5, Detail=10.0, Roughness=0.65)
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    cr = ramp(nt, [(0.0, hexc("#0d0a08")), (0.6, hexc("#1d1611")), (1.0, hexc("#2a2018"))])
    nt.links.new(n.outputs["Fac"], cr.inputs["Fac"])
    nt.links.new(cr.outputs["Color"], bsdf.inputs["Base Color"])
    rmap = node(nt, "ShaderNodeMapRange", **{"To Min": 0.45, "To Max": 0.85})
    nt.links.new(n.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    bump_chain(nt, bsdf, n.outputs["Fac"], strength=0.25, distance=0.05)
    return m


def mat_seed():
    m, nt, bsdf, _ = material("sesame")
    bsdf.inputs["Base Color"].default_value = hexc("#eedcb0")
    bsdf.inputs["Roughness"].default_value = 0.4
    bsdf.inputs["Subsurface Weight"].default_value = 0.3
    bsdf.inputs["Subsurface Scale"].default_value = 0.01
    return m


def mat_steam():
    m = bpy.data.materials.new("steam")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (1, 1, 1, 1)
    tc = node(nt, "ShaderNodeTexCoord")
    mapping = node(nt, "ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.4, 1.4, 0.55)
    nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
    n = node(nt, "ShaderNodeTexNoise", Scale=2.2, Detail=8.0, Roughness=0.6, Distortion=1.4, noise_dimensions="4D")
    nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
    n.inputs["W"].default_value = 0.0
    m.node_tree.nodes.active = n
    wisps = node(nt, "ShaderNodeMapRange", **{"From Min": 0.56, "From Max": 0.78})
    nt.links.new(n.outputs["Fac"], wisps.inputs["Value"])
    # Fade out with height (object Z: -1 bottom .. 1 top of the steam box).
    sep = node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    fade = node(nt, "ShaderNodeMapRange", **{"From Min": 1.0, "From Max": -0.9})
    nt.links.new(sep.outputs["Z"], fade.inputs["Value"])
    mul = node(nt, "ShaderNodeMath", operation="MULTIPLY")
    nt.links.new(wisps.outputs["Result"], mul.inputs[0])
    nt.links.new(fade.outputs["Result"], mul.inputs[1])
    dens = node(nt, "ShaderNodeMath", operation="MULTIPLY")
    nt.links.new(mul.outputs["Value"], dens.inputs[0])
    dens.inputs[1].default_value = 0.55
    nt.links.new(dens.outputs["Value"], vol.inputs["Density"])
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    return m, n


MAT = {
    "crust": mat_crust(),
    "crumb": mat_crumb(),
    "steak": mat_steak(),
    "cheese": mat_cheese(),
    "onion": mat_onion(),
    "pepper_red": mat_pepper("#b51a10"),
    "pepper_green": mat_pepper("#3d6b1c"),
    "tang": mat_sauce("otb_tang", "#e07226"),
    "ranch": mat_sauce("otb_ranch", "#f4efe3", flecks=True),
    "board": mat_board(),
    "seed": mat_seed(),
}

# ───────────────────────── geometry ─────────────────────────

ROLL_L = 3.0  # half length
ROLL_W = 0.95  # half width
TOP_H = 0.62
BOT_H = 0.42


def roll_half(name, top):
    """Half of a split hoagie: outer crust shell + inner crumb (solidify)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=128, v_segments=64, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # Cylindrical body with rounded ends (superellipse along x).
        sx = math.copysign(abs(x) ** 0.5, x)
        v.co = Vector((sx * ROLL_L, y * ROLL_W, z * (TOP_H if z > 0 else BOT_H)))
    # Keep one half.
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=top is False, clear_inner=top is True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    me.materials.append(MAT["crust"])
    me.materials.append(MAT["crumb"])
    for p in me.polygons:
        p.use_smooth = True
    tex = bpy.data.textures.new(name + "_lumps", "CLOUDS")
    tex.noise_scale = 0.9
    d = obj.modifiers.new("lumps", "DISPLACE")
    d.texture = tex
    d.strength = 0.11
    d.mid_level = 0.5
    s = obj.modifiers.new("crumb", "SOLIDIFY")
    s.thickness = 0.13
    s.offset = -1
    s.material_offset = 1
    s.material_offset_rim = 1
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2
    return obj


bread = new_collection("bread")
bottom = roll_half("bottom_roll", top=False)
bread.objects.link(bottom)
scene.collection.objects.unlink(bottom)

top = roll_half("top_roll", top=True)
bread.objects.link(top)
scene.collection.objects.unlink(top)
# Crown hinged open at the back edge, leaning back like a stuffed hoagie.
top.location = (0, ROLL_W * 0.62, 0.36)
top.rotation_euler = Euler((math.radians(-22), 0, 0))

# Sesame seeds on the crown (particle instancing, aligned to the surface).
seed_me = bpy.data.meshes.new("seed")
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
bmesh.ops.scale(bm, vec=(0.032, 0.018, 0.008), verts=bm.verts)
bm.to_mesh(seed_me)
bm.free()
seed_me.materials.append(MAT["seed"])
seed_obj = bpy.data.objects.new("seed", seed_me)
seed_obj.location = (0, 0, -50)
link(seed_obj)



def bottom_height(x, y):
    """Top of the filling mound (z) at (x, y)."""
    ex = max(0.0, 1 - (abs(x) / (ROLL_L * 0.92)) ** 4) ** 0.25
    ey = y / (ROLL_W * 0.86 * max(ex, 0.05))
    if abs(ey) >= 1 or ex < 0.05:
        return None
    return -0.02 + 0.5 * ex**0.6 * (1 - ey * ey) ** 0.55


def make_variant(name, length, width, thick, curl, mat, seed):
    """An irregular, curled, thin slab (a chopped steak slice / onion / pepper strip)."""
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=12, y_segments=8, size=0.5)
    for v in bm.verts:
        x, y, _ = v.co
        edge = max(abs(x) * 2, abs(y) * 2)
        jag = 1 + (r.random() - 0.5) * 0.35 * edge  # ragged outline
        v.co.x = x * length * jag
        v.co.y = y * width * jag
        v.co.z = curl * (math.sin(x * 2.2 + r.random()) * 0.6 + (y * 2) ** 2 * 0.5) + (r.random() - 0.5) * thick * 0.35
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    obj = bpy.data.objects.new(name, me)
    link(obj)
    s = obj.modifiers.new("thick", "SOLIDIFY")
    s.thickness = thick
    s.offset = 0
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    bpy.context.view_layer.objects.active = obj
    for mname in ("thick", "smooth"):
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=mname)
    obj.hide_render = True
    obj.hide_viewport = True
    return me


def steak_chunk(name, seed):
    """A torn, crumbly piece of chopped steak: noisy flattened blob."""
    from mathutils import noise as mnoise
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    k0 = r.uniform(0.5, 1.0)
    sx, sy, sz = r.uniform(0.12, 0.19) * k0, r.uniform(0.08, 0.13) * k0, r.uniform(0.04, 0.065) * k0
    off = Vector((r.random() * 50, r.random() * 50, r.random() * 50))
    for v in bm.verts:
        n = v.co.normalized()
        tear = mnoise.noise(n * 2.2 + off) * 0.4 + mnoise.noise(n * 7 + off) * 0.16 + mnoise.noise(n * 18 + off) * 0.05
        k = 1 + tear
        v.co = Vector((n.x * sx * k, n.y * sy * k, n.z * sz * (1 + tear * 0.5)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(MAT["steak"])
    return me


steak_variants = [steak_chunk(f"steak_v{i}", 100 + i) for i in range(16)]
onion_variants = [make_variant(f"onion_v{i}", rng.uniform(0.28, 0.42), 0.055, 0.018, 0.12, MAT["onion"], 200 + i) for i in range(6)]
# Sliced bell peppers at real size (roll ≈ 30 cm → ~4 cm × 8 mm strips).
pepper_variants = [make_variant(f"pepper_v{i}", rng.uniform(0.7, 0.9), 0.15, 0.03, 0.1, MAT["pepper_red" if i % 3 else "pepper_green"], 300 + i) for i in range(6)]


def scatter(coll_name, variants, count, z_from, z_to, tilt, seed):
    r = random.Random(seed)
    coll = new_collection(coll_name)
    placed = 0
    guard = 0
    while placed < count and guard < count * 30:
        guard += 1
        x = r.uniform(-ROLL_L * 0.9, ROLL_L * 0.9)
        y = r.uniform(-ROLL_W * 0.9, ROLL_W * 0.9)
        h = bottom_height(x, y)
        if h is None:
            continue
        z = h * r.uniform(z_from, z_to) ** 0.6
        obj = bpy.data.objects.new(f"{coll_name}_{placed}", r.choice(variants))
        obj.location = (x, y, z)
        obj.rotation_euler = Euler((r.uniform(-tilt, tilt), r.uniform(-tilt, tilt), r.uniform(0, math.tau)))
        k = r.uniform(0.8, 1.25)
        obj.scale = (k, k, k)
        coll.objects.link(obj)
        placed += 1
    return coll


steak_coll = scatter("steak", steak_variants, 1700, 0.05, 1.0, 1.4, 1)
onion_coll = scatter("onions", onion_variants, 90, 0.4, 1.0, 0.7, 2)
pepper_coll = scatter("peppers", pepper_variants, 26, 0.6, 1.02, 0.5, 3)  # sliced red + green bell peppers

# Ray-cast helper against the filling, to drape cheese and sauces onto it.
depsgraph = bpy.context.evaluated_depsgraph_get()


def surface_z(x, y, default):
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = scene.ray_cast(dg, Vector((x, y, 3.0)), Vector((0, 0, -1)))
    return loc.z if hit else default


top.hide_viewport = True  # drape cheese/sauce on the filling, not the crown
bpy.context.view_layer.update()

# Melted white American: metaball blobs settled into the chop, with drips.
mb = bpy.data.metaballs.new("cheese")
mb.resolution = 0.03
mb.render_resolution = 0.018
mb.threshold = 0.45
cheese_obj = bpy.data.objects.new("cheese", mb)
cheese_obj.data.materials.append(MAT["cheese"])
cheese_coll = new_collection("cheese")
cheese_coll.objects.link(cheese_obj)
r = random.Random(4)
for i in range(520):
    x = r.uniform(-ROLL_L * 0.85, ROLL_L * 0.85)
    y = r.uniform(-ROLL_W * 0.75, ROLL_W * 0.75)
    h = bottom_height(x, y)
    if h is None:
        continue
    z = surface_z(x, y, h) - 0.06  # settled down into the chop
    e = mb.elements.new(type="ELLIPSOID")
    e.co = (x, y, z)
    e.radius = r.uniform(0.13, 0.22)
    e.size_x = r.uniform(1.0, 1.7)
    e.size_y = r.uniform(0.8, 1.2)
    e.size_z = 0.3
    e.rotation = Euler((0, 0, r.uniform(0, math.tau))).to_quaternion()
    # Drips running over the front edge of the roll.
    if y < -ROLL_W * 0.45 and r.random() < 0.35:
        for k in range(1, r.randint(2, 4)):
            d = mb.elements.new(type="ELLIPSOID")
            d.co = (x + r.uniform(-0.02, 0.02), y - 0.05 * k, z - 0.05 * k)
            d.radius = 0.09 * (1 - k * 0.15)
            d.size_x, d.size_y, d.size_z = 0.6, 0.6, 1.3

bpy.context.view_layer.update()


def drizzle(name, mat, amp, step, phase, radius, offset):
    pts = []
    x = -ROLL_L * 0.8
    k = 0
    while x <= ROLL_L * 0.8:
        y = (amp if (k + phase) % 2 == 0 else -amp) * ROLL_W - 0.12 * ROLL_W
        # Sample along the stroke so the sauce follows the surface.
        pts.append((x, y))
        x += step / 2
        k += 1
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for t in range(10):
            u = t / 10
            dense.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u))
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    curve.use_fill_caps = True
    sp = curve.splines.new("POLY")
    sp.points.add(len(dense) - 1)
    zs = [surface_z(x, y, bottom_height(x, y) or 0.2) for x, y in dense]
    # Low-pass the heights so the drizzle rests over gaps instead of dipping into them.
    sm = []
    for i in range(len(zs)):
        win = zs[max(0, i - 4) : i + 5]
        sm.append(max(sum(win) / len(win), zs[i] - 0.02))
    for i, (x, y) in enumerate(dense):
        z = sm[i] + offset
        sp.points[i].co = (x, y, z, 1)
        sp.points[i].radius = 0.75 + 0.35 * math.sin(i * 0.37) + 0.2 * math.sin(i * 1.9)
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(mat)
    sm = obj.modifiers.new("smooth", "SMOOTH") if False else None
    return obj


sauce_coll = new_collection("sauces")
bpy.context.view_layer.update()
tang = drizzle("otb_tang", MAT["tang"], 0.42, 0.5, 0, 0.036, 0.004)
ranch = drizzle("otb_ranch", MAT["ranch"], 0.38, 0.5, 1, 0.032, 0.008)
for o in (tang, ranch):
    o.scale.z = 1.0
    sauce_coll.objects.link(o)

top.hide_viewport = False
bpy.context.view_layer.update()
seed_coll = new_collection("sesame")
_dg = bpy.context.evaluated_depsgraph_get()
_placed = 0
_r = random.Random(9)
while _placed < 380:
    x = _r.uniform(-ROLL_L * 0.92, ROLL_L * 0.92)
    y = _r.uniform(-ROLL_W * 0.2, ROLL_W * 1.4)
    hit, loc, nrm, _i, hobj, _m = scene.ray_cast(_dg, Vector((x, y, 4.0)), Vector((0, 0, -1)))
    if not hit or hobj.name != "top_roll":
        continue
    o = bpy.data.objects.new(f"seed_{_placed}", seed_me)
    o.location = loc + nrm * 0.004
    q = nrm.to_track_quat("Z", "Y")
    o.rotation_euler = (q.to_matrix().to_4x4() @ Matrix.Rotation(_r.uniform(0, math.tau), 4, "Z")).to_euler()
    k = _r.uniform(0.75, 1.2)
    o.scale = (k, k, k)
    seed_coll.objects.link(o)
    _placed += 1

# ───────────────────────── set: board, crumbs, steam, lights, camera ─────────────────────────

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -BOT_H - 0.02))
board = bpy.context.active_object
board.data.materials.append(MAT["board"])

crumb_me = bpy.data.meshes.new("crumb")
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.025)
for v in bm.verts:
    v.co *= 0.7 + rng.random() * 0.6
bm.to_mesh(crumb_me)
bm.free()
crumb_me.materials.append(MAT["crust"])
for i in range(40):
    o = bpy.data.objects.new(f"crumb_{i}", crumb_me)
    ang = rng.uniform(0, math.tau)
    dist = rng.uniform(1.3, 3.0)
    o.location = (math.cos(ang) * dist * 1.6, -abs(math.sin(ang)) * dist - 0.4, -BOT_H - 0.01)
    k = rng.uniform(0.5, 1.4)
    o.scale = (k, k, k * 0.6)
    link(o)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0.2, 0.1, 1.55))
steam = bpy.context.active_object
steam.name = "steam"
steam.scale = (2.6, 1.0, 1.25)
steam_mat, steam_noise = mat_steam()
steam.data.materials.append(steam_mat)


def area(name, loc, size, power, color, target=(0, 0, 0.2)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "RECTANGLE"
    ld.size = size
    ld.size_y = size * 0.6
    ld.energy = power
    ld.color = color
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    direction = Vector(target) - Vector(loc)
    lo.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    link(lo)
    return lo


area("key", (-3.5, -4.5, 5.0), 4.0, 1900, (1.0, 0.86, 0.7))
area("rim", (3.5, 5.0, 2.6), 2.5, 2200, (1.0, 0.62, 0.32))
area("fill", (1.5, -7.0, 1.4), 5.0, 220, (1.0, 0.93, 0.85))
area("top", (0, 0, 7), 3.0, 180, (1.0, 0.92, 0.82))

world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.0035, 0.003, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
link(cam)
scene.camera = cam
target = bpy.data.objects.new("target", None)
target.location = (0.2, 0, 0.15)
link(target)
tr = cam.constraints.new("TRACK_TO")
tr.target = target
tr.track_axis = "TRACK_NEGATIVE_Z"
tr.up_axis = "UP_Y"
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.focus_object = target
cam_data.dof.aperture_fstop = 3.2
cam.location = (3.4, -5.0, 1.7)

# ───────────────────────── render settings ─────────────────────────

scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "METAL"
scene.cycles.device = "GPU"
scene.cycles.samples = int(arg("--samples", 128))
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.volume_bounces = 1
res = str(arg("--res", "1280x720")).split("x")
scene.render.resolution_x, scene.render.resolution_y = int(res[0]), int(res[1])
scene.render.resolution_percentage = 100
try:
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.exposure = -0.45  # moody, like the reference
except TypeError:
    pass
scene.render.image_settings.file_format = "PNG"

still = arg("--still")
if still:
    scene.render.filepath = str(still)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", still)
