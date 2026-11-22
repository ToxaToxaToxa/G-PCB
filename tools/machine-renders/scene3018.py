"""Scenes for the G-PCB wizard pictures, built on the CNC 3018 model in Fusion.

The model (components Frame, Gantry, X carriage, Z slide, Bed; see build3018.py)
is made at machine X150 Y90 Z0: spindle axis at Y0, bit tip 46 mm over the bed. Everything here is in mm,
Fusion Z up; machine Y grows towards the back (+Y), the bed moves the other way.
"""
import math

import adsk.core
import adsk.fusion

app = adsk.core.Application.get()
tbm = adsk.fusion.TemporaryBRepManager.get()
V = adsk.core.Vector3D.create

BED_TOP = 62.0
TIP_Z0 = BED_TOP + 46      # tip height at machine Z0, as built
BLANK = dict(x0=60, y0=30, w=120, h=90)
COPPER_TOP = BED_TOP + 1.6


def P(x, y, z):
    return adsk.core.Point3D.create(x / 10, y / 10, z / 10)


def boxb(cx, cy, cz, dx, dy, dz, ax=(1, 0, 0)):
    ax = V(*ax)
    ax.normalize()
    ay = V(0, 0, 1).crossProduct(ax)
    if ay.length < 1e-6:
        ay = V(0, 1, 0)
    ay.normalize()
    obb = adsk.core.OrientedBoundingBox3D.create(P(cx, cy, cz), ax, ay, dx / 10, dy / 10, dz / 10)
    return tbm.createBox(obb)


def cylb(p1, p2, r, r2=None):
    return tbm.createCylinderOrCone(P(*p1), r / 10, P(*p2), (r if r2 is None else r2) / 10)


def design():
    return adsk.fusion.Design.cast(app.activeProduct)


def occ(name):
    root = design().rootComponent
    for o in root.occurrences:
        if o.component.name == name:
            return o
    return None


_apps = {}


def look(name):
    if name not in _apps:
        lib = app.materialLibraries.itemByName('Fusion Appearance Library')
        _apps[name] = lib.appearances.itemByName(name)
    return _apps[name]


def add(comp, body, name, appearance):
    b = comp.bRepBodies.add(body)
    b.name = name
    a = look(appearance)
    if a:
        b.appearance = a
    return b


def move(name, dx=0.0, dy=0.0, dz=0.0):
    o = occ(name)
    m = adsk.core.Matrix3D.create()
    m.translation = V(dx / 10, dy / 10, dz / 10)
    o.transform2 = m


# ---------------------------------------------------------------- machine

STATE = {'bed_dy': 0.0}


def set_position(mx, my, mz):
    """Machine position: X 0..300, Y 0..180, Z -45..0 (tip 48 mm over the bed at Z0)."""
    dx = mx - 150
    dz = mz
    dy = 90 - my
    move('X carriage', dx)
    move('Z slide', dx, 0, dz)
    move('Bed', 0, dy)
    STATE['bed_dy'] = dy


def on_blank(u, v, h=0.0):
    """Point u, v mm from the blank's lower-left corner, h mm above the copper."""
    x = -150 + BLANK['x0'] + u
    y = -90 + BLANK['y0'] + v + STATE['bed_dy']
    return (x, y, COPPER_TOP + h)


def tip():
    o = occ('Z slide')
    t = o.transform2.translation
    return (t.x * 10, t.y * 10, TIP_Z0 + t.z * 10)


# ---------------------------------------------------------------- props

def props():
    """Fresh 'Props' component for one scene (the old one is deleted)."""
    old = occ('Props')
    if old:
        old.deleteMe()
    root = design().rootComponent
    o = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    o.component.name = 'Props'
    return o.component


def board_rects():
    return [dict(x=7 + i * 56, y=5 + j * 42, w=50, h=38) for i in (0, 1) for j in (0, 1)]


def dashed_outlines(comp):
    """Planned boards: white dashes on the copper."""
    for b in board_rects():
        edges = [((b['x'], b['y']), (b['x'] + b['w'], b['y'])),
                 ((b['x'] + b['w'], b['y']), (b['x'] + b['w'], b['y'] + b['h'])),
                 ((b['x'] + b['w'], b['y'] + b['h']), (b['x'], b['y'] + b['h'])),
                 ((b['x'], b['y'] + b['h']), (b['x'], b['y']))]
        for (u1, v1), (u2, v2) in edges:
            length = math.hypot(u2 - u1, v2 - v1)
            n = int(length // 4)
            for k in range(n):
                t0 = (k * 4) / length
                t1 = (k * 4 + 2.4) / length
                if t1 > 1:
                    break
                a = on_blank(u1 + (u2 - u1) * t0, v1 + (v2 - v1) * t0, 0.02)
                c = on_blank(u1 + (u2 - u1) * t1, v1 + (v2 - v1) * t1, 0.02)
                mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, a[2])
                ax = (c[0] - a[0], c[1] - a[1], 0)
                add(comp, boxb(*mid, 2.4, 0.6, 0.04, ax), 'Board outline', 'Plastic - Glossy (White)')


def milled_boards(comp, seed=3):
    """Isolated traces and pads after the isolation and drilling programs."""
    rnd = _rand(seed)
    groove = 'Plastic - Matte (Yellow)'
    for b in board_rects():
        # outline groove
        for (u1, v1, u2, v2) in [(b['x'], b['y'], b['x'] + b['w'], b['y']),
                                 (b['x'] + b['w'], b['y'], b['x'] + b['w'], b['y'] + b['h']),
                                 (b['x'], b['y'] + b['h'], b['x'] + b['w'], b['y'] + b['h']),
                                 (b['x'], b['y'], b['x'], b['y'] + b['h'])]:
            a = on_blank(u1, v1, 0.01)
            c = on_blank(u2, v2, 0.01)
            mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, a[2])
            add(comp, boxb(*mid, math.hypot(c[0] - a[0], c[1] - a[1]) + 1, 1.0, 0.05,
                           (c[0] - a[0], c[1] - a[1], 0)), 'Outline groove', 'Paint - Enamel Glossy (Black)')
        for _ in range(6):
            u0 = b['x'] + 4 + rnd() * (b['w'] - 8)
            v0 = b['y'] + 4 + rnd() * (b['h'] - 8)
            u1 = b['x'] + 4 + rnd() * (b['w'] - 8)
            v1 = b['y'] + 4 + rnd() * (b['h'] - 8)
            for (pa, pb) in [((u0, v0), (u1, v0)), ((u1, v0), (u1, v1))]:
                for side in (-0.75, 0.75):
                    a = on_blank(pa[0], pa[1], 0.01)
                    c = on_blank(pb[0], pb[1], 0.01)
                    L = math.hypot(c[0] - a[0], c[1] - a[1])
                    if L < 1:
                        continue
                    dx, dy = (c[0] - a[0]) / L, (c[1] - a[1]) / L
                    mid = ((a[0] + c[0]) / 2 - dy * side, (a[1] + c[1]) / 2 + dx * side, a[2])
                    add(comp, boxb(*mid, L + 1.5, 0.3, 0.05, (dx, dy, 0)), 'Isolation', groove)
        for _ in range(8):
            u = b['x'] + 4 + rnd() * (b['w'] - 8)
            v = b['y'] + 4 + rnd() * (b['h'] - 8)
            c = on_blank(u, v, 0)
            ring = cylb((c[0], c[1], c[2]), (c[0], c[1], c[2] + 0.05), 1.45)
            tbm.booleanOperation(ring, cylb((c[0], c[1], c[2] - 1), (c[0], c[1], c[2] + 1), 1.15),
                                 adsk.fusion.BooleanTypes.DifferenceBooleanType)
            add(comp, ring, 'Pad isolation', groove)
            add(comp, cylb((c[0], c[1], c[2] - 0.5), (c[0], c[1], c[2] + 0.03), 0.4), 'Drill hole', 'Paint - Enamel Glossy (Black)')


def _rand(seed):
    state = [seed]

    def rnd():
        state[0] = (state[0] * 1103515245 + 12345) % 2147483648
        return state[0] / 2147483648
    return rnd


def arrow(comp, origin, direction, length, appearance, name):
    d = V(*direction)
    d.normalize()
    end = (origin[0] + d.x * (length - 6), origin[1] + d.y * (length - 6), origin[2] + d.z * (length - 6))
    tipp = (origin[0] + d.x * length, origin[1] + d.y * length, origin[2] + d.z * length)
    add(comp, cylb(origin, end, 0.9), name, appearance)
    add(comp, cylb(end, tipp, 2.6, 0.01), name + ' head', appearance)


def clip(comp, jaw, direction, appearance, name):
    """Alligator clip: jaws at `jaw`, body along `direction` (unit, XY plane)."""
    d = V(*direction)
    d.normalize()
    def at(t, dz=0.0):
        return (jaw[0] + d.x * t, jaw[1] + d.y * t, jaw[2] + dz)
    for dz in (-1.1, 1.1):
        mid = at(4.5, dz)
        add(comp, boxb(*mid, 9, 4, 1.2, direction), name + ' jaw', 'Chrome')
    add(comp, cylb(at(9), at(27), 3.2, 2.4), name + ' boot', appearance)
    return at(27)


def wire(comp, points, appearance, name, r=0.9):
    """Smooth wire through `points` (Catmull-Rom), made of short cylinders and spheres."""
    pts = [points[0]] + list(points) + [points[-1]]
    path = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(10):
            t = s / 10
            t2, t3 = t * t, t * t * t
            path.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                                     + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in range(3)))
    path.append(points[-1])
    body = None
    for a, c in zip(path, path[1:]):
        if math.dist(a, c) < 0.05:
            continue
        seg = cylb(a, c, r)
        body = seg if body is None else _union(body, seg)
        body = _union(body, tbm.createSphere(P(*c), r / 10))
    add(comp, body, name, appearance)


def _union(a, b):
    tbm.booleanOperation(a, b, adsk.fusion.BooleanTypes.UnionBooleanType)
    return a


def bit(comp, kind, tip_at, up=True, name=None):
    """PCB bit with 3.175 mm shank, 38 mm long; tip at `tip_at`, shank up (or down)."""
    s = 1 if up else -1
    x, y, z = tip_at
    r = 3.175 / 2
    if kind == 'drill':
        flute, fr = 6, 0.4
    else:
        flute, fr = 5, 0.5
    add(comp, cylb((x, y, z + s * 0.4), (x, y, z + s * flute), fr), (name or kind) + ' flute', 'Steel - Satin')
    add(comp, cylb((x, y, z), (x, y, z + s * 0.4), 0.01, fr), (name or kind) + ' point', 'Steel - Satin')
    add(comp, cylb((x, y, z + s * flute), (x, y, z + s * 12), fr, r), (name or kind) + ' taper', 'Steel - Satin')
    add(comp, cylb((x, y, z + s * 12), (x, y, z + s * 38), r), (name or kind) + ' shank', 'Steel - Satin')
    ring = 'Plastic - Glossy (Blue)' if kind == 'drill' else 'Plastic - Glossy (Green)'
    add(comp, cylb((x, y, z + s * 18.5), (x, y, z + s * 21.5), r + 0.9), (name or kind) + ' ring', ring)


# ---------------------------------------------------------------- render

def camera(eye, target, fov_deg=30):
    cam = app.activeViewport.camera
    cam.isFitView = False
    cam.cameraType = adsk.core.CameraTypes.PerspectiveCameraType
    cam.eye = P(*eye)
    cam.target = P(*target)
    cam.upVector = V(0, 0, 1)
    cam.perspectiveAngle = math.radians(fov_deg)
    app.activeViewport.camera = cam
    app.activeViewport.refresh()
    return app.activeViewport.camera


def render(path, cam, width=1400, height=900, quality=75):
    rm = design().renderManager
    r = rm.rendering
    r.aspectRatio = adsk.fusion.RenderAspectRatios.CustomRenderAspectRatio
    r.resolution = adsk.fusion.RenderResolutions.CustomRenderResolution
    r.resolutionWidth = width
    r.resolutionHeight = height
    r.isBackgroundTransparent = True
    r.renderQuality = quality
    return r.startLocalRender(path, cam)


def interference(positions):
    """Pairs of bodies that overlap, at each machine position (x, y, z)."""
    d = design()
    report = {}
    for pos in positions:
        set_position(*pos)
        bodies = adsk.core.ObjectCollection.create()
        for o in d.rootComponent.occurrences:
            if o.component.name == 'Props':
                continue
            for b in o.bRepBodies:
                bodies.add(b)
        inp = d.createInterferenceInput(bodies)
        inp.areCoincidentFacesIncluded = False
        res = d.analyzeInterference(inp)
        pairs = []
        for i in range(res.count):
            r = res.item(i)
            a, b = r.entityOne, r.entityTwo
            vol = r.interferenceBody.volume * 1000 if r.interferenceBody else 0
            pairs.append((a.parentComponent.name + '/' + a.name,
                          b.parentComponent.name + '/' + b.name, round(vol, 1)))
        report[pos] = pairs
    set_position(150, 90, 0)
    return report


# ---------------------------------------------------------------- scenes

AREA = dict(x=7, y=5, w=106, h=80)
PROBE_PINS = [(-200, 30, 96), (-200, 30, 90)]


def ring(comp, c, r_out, r_in, appearance, name):
    body = cylb((c[0], c[1], c[2]), (c[0], c[1], c[2] + 0.3), r_out)
    tbm.booleanOperation(body, cylb((c[0], c[1], c[2] - 1), (c[0], c[1], c[2] + 1), r_in),
                         adsk.fusion.BooleanTypes.DifferenceBooleanType)
    add(comp, body, name, appearance)


def wire_to(comp, start, direction, end, appearance, name, lift=18):
    d = V(*direction)
    d.normalize()
    p1 = (start[0] + d.x * 18, start[1] + d.y * 18, start[2] + 3)
    mid = ((p1[0] + end[0]) / 2, (p1[1] + end[1]) / 2, max(p1[2], end[2]) + lift)
    wire(comp, [start, p1, mid, end], appearance, name)


def scene_blank():
    set_position(155, 90, 0)
    comp = props()
    dashed_outlines(comp)
    return camera((470, -600, 420), (0, 0, 105), 30)


def scene_zero_xy():
    set_position(BLANK['x0'], BLANK['y0'], -45 + 0.6 + 1.0)
    comp = props()
    dashed_outlines(comp)
    c = on_blank(0, 0, 0.02)
    arrow(comp, c, (1, 0, 0), 34, 'Plastic - Glossy (Red)', 'X arrow')
    arrow(comp, c, (0, 1, 0), 34, 'Plastic - Glossy (Green)', 'Y arrow')
    ring(comp, c, 3.4, 2.7, 'Plastic - Glossy (White)', 'X0 Y0 mark')
    return camera((c[0] - 95, c[1] - 150, c[2] + 85), (c[0] + 14, c[1] + 16, c[2] + 12), 30)


def scene_zero_z():
    at = (30, 30)
    set_position(BLANK['x0'] + at[0], BLANK['y0'] + at[1], COPPER_TOP - TIP_Z0)
    comp = props()
    dashed_outlines(comp)
    t = tip()
    d_bit = (-1, -0.35, 0)
    end1 = clip(comp, (t[0] - 1.6, t[1], t[2] + 13), d_bit, 'Plastic - Glossy (Red)', 'Probe clip (bit)')
    wire_to(comp, end1, d_bit, PROBE_PINS[0], 'Plastic - Glossy (Red)', 'Probe wire')
    e = on_blank(12, 6, -0.8)
    end2 = clip(comp, e, (0, -1, 0), 'Plastic - Matte (Black)', 'Probe clip (copper)')
    wire_to(comp, end2, (0, -1, 0), PROBE_PINS[1], 'Plastic - Matte (Black)', 'Ground wire', lift=8)
    return camera((t[0] + 55, t[1] - 165, t[2] + 70), (t[0] - 28, t[1] + 10, t[2] + 8), 30)


def scene_heightmap():
    comp = props()
    dashed_outlines(comp)
    pts = []
    cols, rows = 7, 5
    for r in range(rows):
        for c in range(cols):
            cc = cols - 1 - c if r % 2 else c
            pts.append((AREA['x'] + AREA['w'] * cc / (cols - 1), AREA['y'] + AREA['h'] * r / (rows - 1)))
    done = 16
    nxt = pts[done]
    set_position(BLANK['x0'] + nxt[0], BLANK['y0'] + nxt[1], COPPER_TOP + 4 - TIP_Z0)
    for i, (u, v) in enumerate(pts):
        p = on_blank(u, v, 0)
        add(comp, cylb(p, (p[0], p[1], p[2] + 0.3), 1.4), 'Probe point',
            'Plastic - Glossy (Green)' if i < done else 'Plastic - Glossy (White)')
    t = tip()
    d_bit = (-1, -0.35, 0)
    end1 = clip(comp, (t[0] - 1.6, t[1], t[2] + 13), d_bit, 'Plastic - Glossy (Red)', 'Probe clip (bit)')
    wire_to(comp, end1, d_bit, PROBE_PINS[0], 'Plastic - Glossy (Red)', 'Probe wire')
    m = on_blank(BLANK['w'] / 2, BLANK['h'] / 2, 0)
    return camera((m[0] - 60, m[1] - 230, m[2] + 190), (m[0] + 5, m[1] + 8, m[2] + 8), 32)


def scene_run():
    set_position(BLANK['x0'] + 150, BLANK['y0'] + 45, 0)
    comp = props()
    milled_boards(comp)
    base = on_blank(BLANK['w'] + 34, BLANK['h'] - 30, 0)
    z0 = BED_TOP
    add(comp, boxb(base[0], base[1], z0 + 5, 40, 14, 10), 'Bit holder', 'Plastic - Matte (Black)')
    for i, kind in enumerate(('drill', 'endmill')):
        bit(comp, kind, (base[0] - 8 + i * 16, base[1], z0 + 10 + 30), up=False)
    t = tip()
    return camera((t[0] + 90, t[1] - 255, t[2] + 55), (t[0] - 28, t[1] + 5, t[2] - 30), 30)


SCENES = dict(blank=scene_blank, zero_xy=scene_zero_xy, zero_z=scene_zero_z,
              heightmap=scene_heightmap, run=scene_run)
