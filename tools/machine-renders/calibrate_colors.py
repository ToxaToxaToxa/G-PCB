"""Calibration of a close-up from coloured marks.

usage: calibrate_colors.py BASE plane x,y x,y x,y x,y   -> BASE-plane.json (homography)
       calibrate_colors.py BASE points name name name  -> BASE-points.json (picture pixels)

The marks render (BASE-plane.png / BASE-points.png) is compared with the clean
render (BASE.png); changed, saturated pixels are sorted by colour
(red, green, blue, yellow, in that order) and averaged.
"""
import json
import sys

import numpy as np
from PIL import Image

base, kind, *args = sys.argv[1:]
a = np.asarray(Image.open(f'{base}-{kind}.png').convert('RGB')).astype(int)
b = np.asarray(Image.open(f'{base}.png').convert('RGB')).astype(int)
r, g, bl = a[..., 0], a[..., 1], a[..., 2]
changed = (np.abs(a - b).sum(axis=2) > 90) & ((a.max(axis=2) - a.min(axis=2)) > 45)
classes = {
    'red': (r > g + 50) & (r > bl + 50) & (g < 120),
    'green': (g > r + 25) & (g > bl + 15),
    'blue': (bl > r + 25) & (bl > g + 5),
    'yellow': (r > bl + 70) & (g > bl + 50) & (abs(r - g) < 80),
}
found = []
for name, mask in classes.items():
    ys, xs = np.nonzero(changed & mask)
    if len(xs) < 5:
        found.append(None)
        print(name, 'not found')
        continue
    # keep the dense core around the median (a mark is a small blob)
    mx, my = np.median(xs), np.median(ys)
    keep = np.hypot(xs - mx, ys - my) < 40
    found.append((float(xs[keep].mean()), float(ys[keep].mean())))
    print(name, len(xs), keep.sum(), found[-1])

if kind == 'plane':
    src = [tuple(map(float, p.split(','))) for p in args]
    A = []
    for (x, y), px in zip(src, found):
        u, v = px
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    H = np.linalg.svd(np.array(A, float))[2][-1].reshape(3, 3)
    H /= H[2, 2]
    json.dump(H.round(9).tolist(), open(f'{base}-plane.json', 'w'))
    print(json.dumps(H.round(9).tolist()))
else:
    pts = {n: [round(p[0], 1), round(p[1], 1)] for n, p in zip(args, found) if p}
    json.dump(pts, open(f'{base}-points.json', 'w'))
    print(json.dumps(pts))
