"""CNC 3018 Plus in Fusion (direct modelling), mm, Z up, machine Y towards the back.

Layout (checked against how a 3018 Pro is built):
- Base: 2040 rails, side rails along Y, cross rails along X between them, on rubber feet.
- Y axis inside the base: two 10 mm rods held in the front and back cross rails at
  rail height, T8 screw between them, NEMA17 on the outside of the back rail with the
  shaft through it, KFL08 bearing on the front rail.
- Bed (300 x 180 T-slot) rides above the base on four SCS10UU housings and a T8 nut block.
- Gantry: two plates bolted to the outside of the side rails; X rods, X screw and the top
  2040 beam span between the plates; X motor outside the right plate; controller on the left.
- X carriage: plate on four LM10UU, Z rods and Z screw between its top and bottom plates,
  Z motor on top.
- Z slide between the top and bottom plates (45 mm travel), 52 mm clamp with a 775 spindle,
  ER11 collet, 60 degree V-bit.
Everything is built at machine X150 Y90 Z0.
"""
import math

import adsk.core
import adsk.fusion

app = adsk.core.Application.get()
tbm = adsk.fusion.TemporaryBRepManager.get()
V = adsk.core.Vector3D.create

# key heights and positions
RAIL_Z = (5, 45)          # base rails, 40 tall on 5 mm feet
ROD_Y_Z = 35              # Y rods
SCREW_Y_Z = 26            # Y screw and motor axis (motor top 1 mm under the bed)
BED_BOTTOM = 48
BED_T = 14
BED_TOP = BED_BOTTOM + BED_T          # 62
# the spindle axis comes out at Y = GY - 68 = 0: the bed travel (+-90) is centred on the
# base, so the SCS10UU housings stay on the Y rods over the full 180 mm
GY = 68                   # gantry plane: X rods Y
X_RODS = (143, 191)
X_SCREW = 167
Z_BOTTOM_PLATE = (105, 113)
Z_TOP_PLATE = (225, 233)
TIP_Z0 = BED_TOP + 46     # 108: bit tip at machine Z0; at Z-45 it is 1 mm over the bed, below the copper


def P(x, y, z):
    return adsk.core.Point3D.create(x / 10, y / 10, z / 10)


def boxb(cx, cy, cz, dx, dy, dz, ax=(1, 0, 0)):
    a = V(*ax)
    a.normalize()
    b = V(0, 0, 1).crossProduct(a)
    if b.length < 1e-6:
        b = V(0, 1, 0)
    b.normalize()
    obb = adsk.core.OrientedBoundingBox3D.create(P(cx, cy, cz), a, b, dx / 10, dy / 10, dz / 10)
    return tbm.createBox(obb)


def cylb(p1, p2, r, r2=None):
    return tbm.createCylinderOrCone(P(*p1), r / 10, P(*p2), (r if r2 is None else r2) / 10)


def op(a, b, kind):
    tbm.booleanOperation(a, b, kind)
    return a


def sub(a, b):
    return op(a, b, adsk.fusion.BooleanTypes.DifferenceBooleanType)


def uni(a, b):
    return op(a, b, adsk.fusion.BooleanTypes.UnionBooleanType)


def hexz(cx, cy, z1, z2, across_flats):
    """Hexagonal prism along Z."""
    h = z2 - z1
    body = boxb(cx, cy, (z1 + z2) / 2, across_flats * 2, across_flats, h)
    for ang in (60, 120):
        a = math.radians(ang)
        op(body, boxb(cx, cy, (z1 + z2) / 2, across_flats * 2, across_flats, h, (math.cos(a), math.sin(a), 0)),
           adsk.fusion.BooleanTypes.IntersectionBooleanType)
    return body


_apps = {}


def look(name):
    if name not in _apps:
        lib = app.materialLibraries.itemByName('Fusion Appearance Library')
        if name == 'PCB copper':
            # polished copper renders almost white and raw copper blotchy: a warmer, satin copper
            d = adsk.fusion.Design.cast(app.activeProduct)
            a = d.appearances.itemByName(name) or d.appearances.addByCopy(lib.appearances.itemByName('Copper - Polished'), name)
            a.appearanceProperties.itemById('metal_f0').value = adsk.core.Color.create(226, 128, 82, 255)
            a.appearanceProperties.itemById('surface_roughness').value = 0.5
            _apps[name] = a
        elif name == 'Bed aluminium':
            # bead blasted but duller, so the bed does not mirror the rods
            d = adsk.fusion.Design.cast(app.activeProduct)
            a = d.appearances.itemByName(name) or d.appearances.addByCopy(lib.appearances.itemByName('Aluminum - Bead Blasted'), name)
            a.appearanceProperties.itemById('surface_roughness').value = 0.5
            _apps[name] = a
        else:
            _apps[name] = lib.appearances.itemByName(name)
    return _apps[name]


def add(comp, body, name, appearance):
    b = comp.bRepBodies.add(body)
    b.name = name
    a = look(appearance)
    if a:
        b.appearance = a
    return b


ANOD = 'Aluminum - Anodized Rough (Grey)'
ALU = 'Aluminum - Satin'
BLACK = 'Plastic - Matte (Black)'
MOTOR = 'Paint - Enamel Glossy (Black)'
ROD = 'Chrome'
BRASS = 'Brass - Polished'
STEEL = 'Steel - Satin'
GOLD = 'Gold - Polished'
BLASTED = 'Bed aluminium'


def extrusion(comp, name, axis, length, w, h, c):
    """20 x 20n T-slot profile; w across, h tall."""
    cx, cy, cz = c
    if axis == 'x':
        body = boxb(cx, cy, cz, length, w, h)
        for k in range(int(h // 20)):
            z = cz - h / 2 + 10 + 20 * k
            for s in (-1, 1):
                sub(body, boxb(cx, cy + s * (w / 2 - 3), z, length + 2, 6.01, 6))
        for k in range(int(w // 20)):
            y = cy - w / 2 + 10 + 20 * k
            for s in (-1, 1):
                sub(body, boxb(cx, y, cz + s * (h / 2 - 3), length + 2, 6, 6.01))
    else:
        body = boxb(cx, cy, cz, w, length, h)
        for k in range(int(h // 20)):
            z = cz - h / 2 + 10 + 20 * k
            for s in (-1, 1):
                sub(body, boxb(cx + s * (w / 2 - 3), cy, z, 6.01, length + 2, 6))
        for k in range(int(w // 20)):
            x = cx - w / 2 + 10 + 20 * k
            for s in (-1, 1):
                sub(body, boxb(x, cy, cz + s * (h / 2 - 3), 6, length + 2, 6.01))
    return add(comp, body, name, ANOD)


def stepper(comp, name, face, axis, sign, shaft=24):
    """NEMA17 whose mounting face (front cap) is at `face`; shaft points along axis*sign."""
    fx, fy, fz = face

    def along(d):
        return (fx + (d if axis == 'x' else 0), fy + (d if axis == 'y' else 0), fz + (d if axis == 'z' else 0))

    def blk(d0, d1):
        c = along((d0 + d1) / 2)
        t = abs(d1 - d0)
        if axis == 'x':
            return boxb(*c, t, 42, 42)
        if axis == 'y':
            return boxb(*c, 42, t, 42)
        return boxb(*c, 42, 42, t)
    back = -sign
    add(comp, blk(0, back * 6), name + ' front cap', ALU)
    add(comp, blk(back * 6, back * 34), name + ' body', MOTOR)
    add(comp, blk(back * 34, back * 40), name + ' rear cap', ALU)
    add(comp, cylb(along(0), along(sign * 2), 11), name + ' boss', ALU)
    add(comp, cylb(along(0), along(sign * shaft), 2.5), name + ' shaft', STEEL)


def run(_context: str):
    doc = app.activeDocument
    if doc.name != 'Untitled' or doc.isSaved:
        raise RuntimeError('active document is not the unsaved Untitled model: ' + doc.name)
    design = adsk.fusion.Design.cast(app.activeProduct)
    design.designType = adsk.fusion.DesignTypes.DirectDesignType
    root = design.rootComponent
    while root.occurrences.count:
        root.occurrences.item(0).deleteMe()

    def comp(name):
        o = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
        o.component.name = name
        return o.component

    rz = (RAIL_Z[0] + RAIL_Z[1]) / 2

    # ---------------- base and Y axis ----------------
    frame = comp('Frame')
    for s in (-1, 1):
        extrusion(frame, 'Side rail 2040', 'y', 330, 20, 40, (s * 175, 0, rz))
        extrusion(frame, 'Cross rail 2040', 'x', 330, 20, 40, (0, s * 155, rz))
        for t in (-1, 1):
            add(frame, cylb((s * 175, t * 150, 0), (s * 175, t * 150, 5), 9), 'Foot', 'Rubber - Soft')
        # Y rods end in SHF10 flanges on the inner faces of the cross rails (y = +-145)
        add(frame, cylb((s * 80, -145, ROD_Y_Z), (s * 80, 145, ROD_Y_Z), 5), 'Y rod 10 mm', ROD)
        for t in (-1, 1):
            add(frame, sub(boxb(s * 80, t * 141, ROD_Y_Z, 32, 8, 20),
                           cylb((s * 80, t * 130, ROD_Y_Z), (s * 80, t * 150, ROD_Y_Z), 5.05)), 'SHF10 flange', ALU)
    add(frame, cylb((0, -145, SCREW_Y_Z), (0, 145, SCREW_Y_Z), 4), 'Y lead screw T8', BRASS)
    add(frame, sub(boxb(0, -141, SCREW_Y_Z, 36, 8, 26), cylb((0, -150, SCREW_Y_Z), (0, -130, SCREW_Y_Z), 4.1)), 'KFL08 bearing', ALU)
    # motor on the outside of the back rail, shaft through the rail to a coupler inside
    stepper(frame, 'Y motor', (0, 168, SCREW_Y_Z), 'y', -1, shaft=2)
    # low plate: the bed passes over it at the back end of its travel
    add(frame, sub(boxb(0, 166.5, SCREW_Y_Z, 46, 3, 40), cylb((0, 160, SCREW_Y_Z), (0, 175, SCREW_Y_Z), 11.2)), 'Y motor plate', BLACK)
    add(frame, sub(cylb((0, 120, SCREW_Y_Z), (0, 145, SCREW_Y_Z), 9.5), cylb((0, 110, SCREW_Y_Z), (0, 150, SCREW_Y_Z), 4.1)), 'Y coupler', GOLD)

    # ---------------- gantry ----------------
    gantry = comp('Gantry')
    plate_top = Z_TOP_PLATE[1] - 5
    for s in (-1, 1):
        sp = boxb(s * 190, GY - 10, (5 + plate_top) / 2, 10, 110, plate_top - 5)
        for z, r in ((X_RODS[0], 5.05), (X_RODS[1], 5.05), (X_SCREW, 11.2 if s > 0 else 4.1)):
            sub(sp, cylb((s * 180, GY, z), (s * 200, GY, z), r))
        add(gantry, sp, 'Side plate', BLACK)
    extrusion(gantry, 'Top beam 2040', 'x', 370, 20, 40, (0, GY + 22, plate_top - 20))
    for z in X_RODS:
        add(gantry, cylb((-185, GY, z), (185, GY, z), 5), 'X rod 10 mm', ROD)
    add(gantry, cylb((-185, GY, X_SCREW), (185, GY, X_SCREW), 4), 'X lead screw T8', BRASS)
    stepper(gantry, 'X motor', (198, GY, X_SCREW), 'x', -1, shaft=3)
    add(gantry, sub(boxb(196.5, GY, X_SCREW, 3, 46, 46), cylb((190, GY, X_SCREW), (205, GY, X_SCREW), 11.2)), 'X motor plate', BLACK)
    # controller board on standoffs outside the left plate
    add(gantry, boxb(-203, GY - 10, 80, 2, 100, 70), 'Controller board', 'Plastic - Glossy (Blue)')
    for dy in (-45, 45):
        for dz in (-30, 30):
            add(gantry, cylb((-195, GY - 10 + dy, 80 + dz), (-202, GY - 10 + dy, 80 + dz), 2), 'Standoff', BRASS)
    add(gantry, boxb(-207, GY - 45, 100, 6, 12, 11), 'USB socket', STEEL)
    add(gantry, boxb(-208, GY + 20, 62, 8, 18, 10), 'Terminal block', 'Plastic - Glossy (Green)')

    # ---------------- X carriage ----------------
    car = comp('X carriage')
    cy0 = GY - 13            # carriage plate, in front of the X rods
    # 66 wide: half width 33 + half travel 150 stays 2 mm clear of the side plates
    add(car, boxb(0, cy0, X_SCREW, 66, 10, X_RODS[1] - X_RODS[0] + 40), 'Carriage plate', BLACK)
    for z in X_RODS:
        for s in (-1, 1):
            # bolted to the back of the carriage plate (y = cy0 + 5)
            add(car, sub(boxb(s * 18, cy0 + 15, z, 30, 20, 20), cylb((s * 18 - 20, GY, z), (s * 18 + 20, GY, z), 5.05)), 'LM10UU housing', ALU)
    add(car, sub(boxb(0, cy0 + 14, X_SCREW, 22, 18, 18), cylb((-20, GY, X_SCREW), (20, GY, X_SCREW), 4.05)), 'X screw nut', BRASS)
    zy = cy0 - 13            # Z rods and screw, in front of the carriage plate
    for z0, z1, nm in ((Z_BOTTOM_PLATE[0], Z_BOTTOM_PLATE[1], 'Z bottom plate'), (Z_TOP_PLATE[0], Z_TOP_PLATE[1], 'Z top plate')):
        zp = boxb(0, zy + 2, (z0 + z1) / 2, 66, 26, z1 - z0)
        for x, r in ((-22, 4.05), (22, 4.05), (0, 4.05)):
            sub(zp, cylb((x, zy, z0 - 1), (x, zy, z1 + 1), r))
        add(car, zp, nm, BLACK)
    for s in (-1, 1):
        add(car, cylb((s * 22, zy, Z_BOTTOM_PLATE[0]), (s * 22, zy, Z_TOP_PLATE[1]), 4), 'Z rod 8 mm', ROD)
    add(car, cylb((0, zy, Z_BOTTOM_PLATE[0]), (0, zy, Z_TOP_PLATE[1]), 4), 'Z lead screw T8', BRASS)
    # the motor stands on the top plate; its shaft meets the screw in the plate
    add(car, cylb((0, zy, Z_TOP_PLATE[1]), (0, zy, Z_TOP_PLATE[1] + 12), 9.5), 'Z coupler', GOLD)
    stepper(car, 'Z motor', (0, zy, Z_TOP_PLATE[1] + 14), 'z', -1, shaft=0.5)

    # ---------------- Z slide (at Z0: top of its travel) ----------------
    zs = comp('Z slide')
    slide_h = 60
    s_bot = Z_BOTTOM_PLATE[1] + 45 + 2      # 160 at Z0, 115 at Z-45
    s_mid = s_bot + slide_h / 2
    for s in (-1, 1):
        add(zs, sub(boxb(s * 22, zy, s_mid, 14, 14, slide_h), cylb((s * 22, zy, 0), (s * 22, zy, 400), 4.05)), 'LM8UU housing', ALU)
    add(zs, sub(boxb(0, zy, s_mid, 18, 14, 22), cylb((0, zy, 0), (0, zy, 400), 4.05)), 'Z screw nut', BRASS)
    plate_y = zy - 11
    add(zs, boxb(0, plate_y, s_mid, 60, 8, slide_h), 'Slide plate', BLACK)
    ring_y = plate_y - 4 - 27
    ring = sub(cylb((0, ring_y, s_mid - 17), (0, ring_y, s_mid + 17), 27),
               cylb((0, ring_y, s_mid - 20), (0, ring_y, s_mid + 20), 22.2))
    sub(ring, boxb(0, ring_y - 26, s_mid, 2, 8, 40))
    add(zs, ring, 'Spindle clamp 52 mm', ALU)
    bolt = ((-9, ring_y - 32, s_mid), (9, ring_y - 32, s_mid))
    for s in (-1, 1):
        add(zs, sub(boxb(s * 4, ring_y - 30, s_mid, 6, 10, 34), cylb(*bolt, 2.55)), 'Clamp lug', ALU)
    add(zs, cylb(*bolt, 2.5), 'Clamp bolt', STEEL)
    # 775 motor through the clamp, ER11 collet, bit
    m_bot = s_mid - 30
    add(zs, cylb((0, ring_y, m_bot), (0, ring_y, m_bot + 66), 22), '775 motor', MOTOR)
    add(zs, cylb((0, ring_y, m_bot + 66), (0, ring_y, m_bot + 70), 22.4), 'Motor end cap', STEEL)
    add(zs, cylb((0, ring_y, m_bot - 6), (0, ring_y, m_bot), 8), 'Bearing boss', STEEL)
    add(zs, cylb((0, ring_y, m_bot - 14), (0, ring_y, m_bot - 6), 2.5), 'Shaft', STEEL)
    add(zs, cylb((0, ring_y, m_bot - 18), (0, ring_y, m_bot - 14), 8), 'ER11 holder', STEEL)
    shank_hole = cylb((0, ring_y, m_bot - 40), (0, ring_y, m_bot - 14), 1.6)
    add(zs, sub(hexz(0, ring_y, m_bot - 29, m_bot - 18, 17), shank_hole), 'ER11 nut', STEEL)
    shank_hole = cylb((0, ring_y, m_bot - 40), (0, ring_y, m_bot - 14), 1.6)
    add(zs, sub(cylb((0, ring_y, m_bot - 33), (0, ring_y, m_bot - 29), 4.5, 7), shank_hole), 'ER11 nose', STEEL)
    collet = m_bot - 33
    r = 3.175 / 2
    cone = r / math.tan(math.radians(30))
    tip = TIP_Z0
    vbit = cylb((0, ring_y, tip + cone), (0, ring_y, m_bot - 18), r)
    uni(vbit, cylb((0, ring_y, tip), (0, ring_y, tip + cone), 0.05, r))
    add(zs, vbit, 'V-bit 60 deg', GOLD)

    # ---------------- bed ----------------
    bed = comp('Bed')
    yb = ring_y                     # bed centre under the spindle at machine Y90
    plate = boxb(0, yb, BED_BOTTOM + BED_T / 2, 300, 180, BED_T)
    for k in range(6):
        y = yb + 75 - 30 * k
        sub(plate, boxb(0, y, BED_TOP - 2, 302, 6, 4.01))
        sub(plate, boxb(0, y, BED_TOP - 5, 302, 11, 2))
    add(bed, plate, 'T-slot bed 300 x 180', BLASTED)
    for s in (-1, 1):
        for t in (-1, 1):
            # 28 mm from the bed centre: at full travel 90 + 28 + 15 = 133 mm, clear of the flanges at 137
            h = sub(boxb(s * 80, yb + t * 28, (ROD_Y_Z - 13 + BED_BOTTOM) / 2, 34, 30, BED_BOTTOM - ROD_Y_Z + 13),
                    cylb((s * 80, yb + t * 28 - 20, ROD_Y_Z), (s * 80, yb + t * 28 + 20, ROD_Y_Z), 5.2))
            add(bed, h, 'SCS10UU housing', ALU)
    nut = boxb(0, yb, (SCREW_Y_Z - 9 + BED_BOTTOM) / 2, 36, 22, BED_BOTTOM - SCREW_Y_Z + 9)
    sub(nut, cylb((0, yb - 20, SCREW_Y_Z), (0, yb + 20, SCREW_Y_Z), 4.2))
    add(bed, nut, 'Y nut block', ALU)
    add(bed, sub(cylb((0, yb - 14, SCREW_Y_Z), (0, yb - 11, SCREW_Y_Z), 11), cylb((0, yb - 20, SCREW_Y_Z), (0, yb, SCREW_Y_Z), 4.05)), 'T8 nut flange', BRASS)
    # copper clad blank 120 x 90 at machine X60 Y30, held by two toe clamps
    bx = -150 + 60 + 60
    by = yb - 90 + 30 + 45
    add(bed, boxb(bx, by, BED_TOP + 0.78, 120, 90, 1.56), 'FR4 blank', 'Plastic - Matte (Yellow)')
    add(bed, boxb(bx, by, BED_TOP + 1.58, 120, 90, 0.04), 'Copper', 'PCB copper')
    for s in (-1, 1):
        # bolt in the nearest T-slot, clamp toe on the blank edge
        slots = [yb + 75 - 30 * k for k in range(6)]
        sy = min(slots, key=lambda y: abs(y - (by + s * 52)))
        bolt = ((bx, sy, BED_TOP - 4), (bx, sy, BED_TOP + 10))
        cl_y = (sy + by + s * 43) / 2
        cl_len = abs(sy - (by + s * 43)) + 12
        add(bed, sub(boxb(bx, cl_y, BED_TOP + 3.6, 16, cl_len, 4), cylb(*bolt, 3.05)), 'Toe clamp', BLACK)
        add(bed, cylb(*bolt, 3), 'Clamp bolt', STEEL)
        add(bed, sub(hexz(bx, sy, BED_TOP + 5.6, BED_TOP + 9, 10), cylb(*bolt, 3.05)), 'Clamp nut', STEEL)

    app.activeViewport.fit()
    print('bodies', sum(o.component.bRepBodies.count for o in root.occurrences),
          'tip', TIP_Z0, 'spindle y', round(ring_y, 1), 'collet', collet, 'slide bottom', s_bot)
