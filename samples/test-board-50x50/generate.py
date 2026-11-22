"""G-PCB test board, 50 x 50 mm, two layers.

Writes KiCad-style Gerber X2 + Excellon files and a zip next to this script.
Elements: trace width row 0.15..1.0 mm, clearance pairs 0.15..0.4 mm,
SOIC-8, TSSOP-14 (0.65 pitch, RoundRect macro), 1206/0805/0603/0402 pads,
DIP-8, 1x4 header with oval pads, hexagon (P) pad, arc and 45 deg traces,
copper pour with clear-polarity cut-outs, stroked text, vias, 4 mounting
holes and an oval slot (G85), rounded board corners.
Origin = bottom-left corner of the board.
"""
import math
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = "gpcb-test-50x50"
W = H = 50.0
DATE = "2026-11-22T12:00:00+02:00"


def c(v):
    return str(int(round(v * 1e6)))


class Gerber:
    def __init__(self, function, polarity="Positive"):
        self.lines = [
            "%TF.GenerationSoftware,G-PCB,TestBoard,1.0*%",
            f"%TF.CreationDate,{DATE}*%",
            "%TF.SameCoordinates,Original*%",
            f"%TF.FileFunction,{function}*%",
            f"%TF.FilePolarity,{polarity}*%",
            "%FSLAX46Y46*%",
            "%MOMM*%",
            "%LPD*%",
            "G01*",
            "G75*",
        ]
        self.ap = {}
        self.next_d = 10
        self.body = []
        self.cur = None
        self.macros = []

    def macro_roundrect(self):
        if "RoundRect" in self.macros:
            return
        self.macros.append("RoundRect")
        self.lines += [
            "%AMRoundRect*",
            "0 Rectangle with rounded corners*",
            "4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*",
            "1,1,$1+$1,$2,$3*",
            "1,1,$1+$1,$4,$5*",
            "1,1,$1+$1,$6,$7*",
            "1,1,$1+$1,$8,$9*",
            "20,1,$1+$1,$2,$3,$4,$5,0*",
            "20,1,$1+$1,$4,$5,$6,$7,0*",
            "20,1,$1+$1,$6,$7,$8,$9,0*",
            "20,1,$1+$1,$8,$9,$2,$3,0*%",
        ]

    def aperture(self, spec):
        if spec not in self.ap:
            self.ap[spec] = self.next_d
            self.lines.append(f"%ADD{self.next_d}{spec}*%")
            self.next_d += 1
        d = self.ap[spec]
        if self.cur != d:
            self.body.append(f"D{d}*")
            self.cur = d

    def circle(self, dia):
        self.aperture(f"C,{dia:g}")

    def rect(self, w, h):
        self.aperture(f"R,{w:g}X{h:g}")

    def oval(self, w, h):
        self.aperture(f"O,{w:g}X{h:g}")

    def poly(self, dia, n, rot=0):
        self.aperture(f"P,{dia:g}X{n}X{rot:g}")

    def roundrect(self, w, h, r):
        self.macro_roundrect()
        hx, hy = w / 2 - r, h / 2 - r
        pts = [(-hx, hy), (hx, hy), (hx, -hy), (-hx, -hy)]
        args = [r] + [v for p in pts for v in p]
        self.aperture("RoundRect," + "X".join(f"{a:g}" for a in args))

    def flash(self, x, y):
        self.body.append(f"X{c(x)}Y{c(y)}D03*")

    def move(self, x, y):
        self.body.append(f"X{c(x)}Y{c(y)}D02*")

    def line(self, pts):
        self.move(*pts[0])
        for x, y in pts[1:]:
            self.body.append(f"X{c(x)}Y{c(y)}D01*")

    def arc(self, start, end, center, ccw=True):
        self.move(*start)
        self.body.append("G03*" if ccw else "G02*")
        i, j = center[0] - start[0], center[1] - start[1]
        self.body.append(f"X{c(end[0])}Y{c(end[1])}I{c(i)}J{c(j)}D01*")
        self.body.append("G01*")

    def region(self, pts):
        self.body.append("G36*")
        self.move(*pts[0])
        for x, y in pts[1:] + [pts[0]]:
            self.body.append(f"X{c(x)}Y{c(y)}D01*")
        self.body.append("G37*")

    def polarity(self, dark):
        self.body.append("%LPD*%" if dark else "%LPC*%")

    def text(self):
        return "\n".join(self.lines + self.body + ["M02*"]) + "\n"


# ---------------------------------------------------------------- geometry
top = Gerber("Copper,L1,Top")
bot = Gerber("Copper,L2,Bot")
pth = []   # (x, y, dia)
npth = []  # (x, y, dia) or (x, y, dia, x2, y2) for slots


def both(fn):
    fn(top)
    fn(bot)


def via(x, y):
    both(lambda g: (g.circle(0.8), g.flash(x, y)))
    pth.append((x, y, 0.4))


# 1. Trace width row: y 44, pads at x 5..45
widths = [0.15, 0.2, 0.25, 0.3, 0.4, 0.6, 1.0]
for k, w in enumerate(widths):
    y = 46.5 - k * 1.6
    top.circle(w)
    top.line([(8.0, y), (20.0, y)])
    top.circle(1.2)
    top.flash(8.0, y)
    top.flash(20.0, y)

# 2. Clearance pairs: 0.3 mm traces, gaps 0.15 / 0.2 / 0.3 / 0.4
x0 = 24.0
for k, gap in enumerate([0.15, 0.2, 0.3, 0.4]):
    x = x0 + k * 3.0
    top.circle(0.3)
    top.line([(x, 36.5), (x, 47.0)])
    top.line([(x + 0.3 + gap, 36.5), (x + 0.3 + gap, 47.0)])

# 3. Stroked text "G-PCB" (0.25 mm strokes), x 35.5..47, y 38.5..41.5
def glyphs(x, y, s=1.0):
    g = []
    w, h = 2.0 * s, 3.5 * s
    # G
    g.append([(x + w, y + h), (x, y + h), (x, y), (x + w, y), (x + w, y + h / 2), (x + w / 2, y + h / 2)])
    x += w + 0.8
    # -
    g.append([(x, y + h / 2), (x + 1.2 * s, y + h / 2)])
    x += 1.2 * s + 0.8
    # P
    g.append([(x, y), (x, y + h), (x + w, y + h), (x + w, y + h / 2), (x, y + h / 2)])
    x += w + 0.8
    # C
    g.append([(x + w, y + h), (x, y + h), (x, y), (x + w, y)])
    x += w + 0.8
    # B
    g.append([(x, y), (x, y + h), (x + w * 0.8, y + h), (x + w, y + h * 0.75), (x + w * 0.8, y + h / 2),
              (x, y + h / 2), (x + w * 0.8, y + h / 2), (x + w, y + h * 0.25), (x + w * 0.8, y), (x, y)])
    return g


top.circle(0.25)
for stroke in glyphs(35.5, 38.5, 0.85):
    top.line(stroke)

# 4. SOIC-8 at (12, 30): pitch 1.27, pads 1.5 x 0.6, rows at +-2.7
sx, sy = 12.0, 30.0
top.rect(1.5, 0.6)
soic = []
for i in range(4):
    yy = sy + 1.905 - i * 1.27
    top.flash(sx - 2.7, yy)
    top.flash(sx + 2.7, yy)
    soic.append(((sx - 2.7, yy), (sx + 2.7, yy)))
# fan-out: parallel lanes with a 45 deg jog
top.circle(0.3)
for (lx, ly), _ in soic:
    top.line([(lx - 0.75, ly), (7.5, ly), (6.5, ly + 1.0), (4.0, ly + 1.0)])

# 5. TSSOP-14 at (30, 28): pitch 0.65, RoundRect pads 1.2 x 0.35, rows at +-2.9
tx, ty = 30.0, 28.0
top.roundrect(1.2, 0.35, 0.0875)
for i in range(7):
    yy = ty + 1.95 - i * 0.65
    top.flash(tx - 2.9, yy)
    top.flash(tx + 2.9, yy)
top.circle(0.2)
for i in range(0, 7, 2):
    yy = ty + 1.95 - i * 0.65
    ye = ty + (yy - ty) * 2
    top.line([(tx + 3.5, yy), (tx + 4.2, yy), (tx + 4.2 + abs(ye - yy), ye), (tx + 8.0, ye)])

# 6. Chip pads: 1206, 0805, 0603, 0402 at y 20, x 6..20
chips = [("1206", 1.6, 1.0, 1.8), ("0805", 1.4, 1.0, 1.25), ("0603", 1.0, 0.8, 0.95), ("0402", 0.6, 0.55, 0.6)]
cx = 7.0
for name, pitch_half, pw, ph in chips:
    top.roundrect(pw, ph, min(pw, ph) * 0.25)
    top.flash(cx - pitch_half, 21.0)
    top.flash(cx + pitch_half, 21.0)
    cx += 2 * pitch_half + 2.6

# 7. Arc traces: quarter circles R4 and R6 (0.4 mm) at (40, 30)
top.circle(0.4)
top.arc((44.0, 30.0), (40.0, 34.0), (40.0, 30.0), ccw=True)
top.arc((46.0, 30.0), (40.0, 36.0), (40.0, 30.0), ccw=True)
top.circle(1.0)
for p in [(44.0, 30.0), (40.0, 34.0), (46.0, 30.0), (40.0, 36.0)]:
    top.flash(*p)

# 8. Hexagon pad (P aperture) and an oval SMD pad
top.poly(2.0, 6, 0)
top.flash(45.0, 22.0)
top.oval(1.2, 2.4)
top.flash(41.0, 22.0)

# 9. DIP-8 at (14, 10): pitch 2.54, rows 7.62 apart, drill 0.8
dx, dy = 10.0, 6.0
for i in range(4):
    for col, xx in enumerate((dx, dx + 7.62)):
        yy = dy + i * 2.54 if col == 0 else dy + (3 - i) * 2.54
        first = col == 0 and i == 0
        if first:
            both(lambda g: (g.rect(1.6, 1.6), g.flash(xx, yy)))
        else:
            both(lambda g: (g.circle(1.6), g.flash(xx, yy)))
        pth.append((xx, yy, 0.8))

# 10. 1x4 header with oval pads at x 26, drill 1.0
for i in range(4):
    yy = 6.0 + i * 2.54
    both(lambda g: (g.oval(1.7, 2.0), g.flash(26.0, yy)))
    pth.append((26.0, yy, 1.0))

# Bottom traces: DIP pins to header through the bottom side, a via chain
bot.circle(0.5)
bot.line([(dx + 7.62, dy), (20.0, dy), (22.0, dy + 0.0), (26.0, 6.0)])
bot.line([(dx + 7.62, dy + 2.54), (22.5, dy + 2.54), (26.0, 8.54)])
bot.circle(0.3)
bot.line([(dx + 7.62, dy + 5.08), (23.0, 11.08), (26.0, 11.08)])
for p in [(18.0, 16.0), (22.0, 16.0)]:
    via(*p)
bot.circle(0.4)
bot.line([(18.0, 16.0), (22.0, 16.0)])
top.circle(0.4)
top.line([(dx, dy + 7.62), (dx, 16.0), (18.0, 16.0)])
top.line([(22.0, 16.0), (26.0, 16.0), (26.0, 6.0 + 3 * 2.54 + 1.0)])

# 11. Copper pour with clear-polarity cut-outs, x 30.5..44.8, y 5.5..16
pour = [(30.5, 5.5), (44.8, 5.5), (44.8, 16.0), (30.5, 16.0)]
top.region(pour)
top.polarity(False)
top.circle(2.4)
for p in [(35.0, 10.0), (39.0, 10.0), (43.0, 10.0)]:
    top.flash(*p)
top.rect(6.0, 1.0)
top.flash(39.0, 7.0)
top.polarity(True)
top.circle(1.4)
for p in [(35.0, 10.0), (39.0, 10.0), (43.0, 10.0)]:
    top.flash(*p)
    pth.append((p[0], p[1], 0.6))
    bot.circle(1.4)
    bot.flash(*p)
# thermal spokes on the middle pad
top.circle(0.4)
top.line([(39.0, 10.0), (39.0, 12.0)])
top.line([(39.0, 10.0), (41.0, 10.0)])

# Mounting holes and slot (NPTH)
for p in [(3.5, 3.5), (46.5, 3.5), (3.5, 46.5), (46.5, 46.5)]:
    npth.append((p[0], p[1], 3.2))
npth.append((48.0, 25.0, 1.2, 48.0, 29.0))

# ------------------------------------------------------------- outline
edge = Gerber("Profile,NP")
edge.circle(0.1)
r = 2.0
edge.move(r, 0)
edge.body.append(f"X{c(W - r)}Y{c(0)}D01*")
edge.body.append("G03*")
edge.body.append(f"X{c(W)}Y{c(r)}I{c(0)}J{c(r)}D01*")
edge.body.append("G01*")
edge.body.append(f"X{c(W)}Y{c(H - r)}D01*")
edge.body.append("G03*")
edge.body.append(f"X{c(W - r)}Y{c(H)}I{c(-r)}J{c(0)}D01*")
edge.body.append("G01*")
edge.body.append(f"X{c(r)}Y{c(H)}D01*")
edge.body.append("G03*")
edge.body.append(f"X{c(0)}Y{c(H - r)}I{c(0)}J{c(-r)}D01*")
edge.body.append("G01*")
edge.body.append(f"X{c(0)}Y{c(r)}D01*")
edge.body.append("G03*")
edge.body.append(f"X{c(r)}Y{c(0)}I{c(r)}J{c(0)}D01*")
edge.body.append("G01*")


# ------------------------------------------------------------- drills
def excellon(holes, function):
    tools = sorted({h[2] for h in holes})
    out = ["M48", f"; DRILL file G-PCB test board date {DATE}", "; FORMAT={-:-/ absolute / metric / decimal}",
           f"; #@! TF.FileFunction,{function}", "FMAT,2", "METRIC"]
    for i, d in enumerate(tools, 1):
        out.append(f"T{i}C{d:.3f}")
    out += ["%", "G90", "G05"]
    for i, d in enumerate(tools, 1):
        out.append(f"T{i}")
        for h in holes:
            if h[2] != d:
                continue
            if len(h) == 5:
                out.append(f"X{h[0]:.3f}Y{h[1]:.3f}G85X{h[3]:.3f}Y{h[4]:.3f}")
            else:
                out.append(f"X{h[0]:.3f}Y{h[1]:.3f}")
    out.append("M30")
    return "\n".join(out) + "\n"


files = {
    f"{NAME}-F_Cu.gbr": top.text(),
    f"{NAME}-B_Cu.gbr": bot.text(),
    f"{NAME}-Edge_Cuts.gbr": edge.text(),
    f"{NAME}-PTH.drl": excellon(pth, "Plated,1,2,PTH"),
    f"{NAME}-NPTH.drl": excellon(npth, "NonPlated,1,2,NPTH"),
}
out_dir = os.path.join(HERE, "gerber")
os.makedirs(out_dir, exist_ok=True)
for n, t in files.items():
    with open(os.path.join(out_dir, n), "w", newline="\n") as f:
        f.write(t)
with zipfile.ZipFile(os.path.join(HERE, f"{NAME}.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for n, t in files.items():
        z.writestr(n, t)
print("written:", ", ".join(files), "+ zip")
