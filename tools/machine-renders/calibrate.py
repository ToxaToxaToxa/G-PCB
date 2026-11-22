"""Finds the bed marks (marks render minus clean render) and fits the bed homography."""
import json
import sys

import numpy as np
from PIL import Image

base = sys.argv[1]
marks = {'front_left': (20, 15), 'front_right': (280, 15), 'back_right': (280, 165), 'back_left': (20, 165)}
a = np.asarray(Image.open(base + '-marks.png').convert('RGB')).astype(int)
b = np.asarray(Image.open(base + '.png').convert('RGB')).astype(int)
d = np.abs(a - b).sum(axis=2)
sat = a.max(axis=2) - a.min(axis=2)
ys, xs = np.nonzero((d > 120) & (sat > 50))
pts = np.stack([xs, ys], 1).astype(float)
# k-means with 4 centres started at the quadrants of the candidate cloud
cx, cy = np.median(pts, 0)
centres = np.array([[pts[:, 0].min(), pts[:, 1].max()], [pts[:, 0].max(), pts[:, 1].max()],
                    [pts[:, 0].max(), pts[:, 1].min()], [pts[:, 0].min(), pts[:, 1].min()]])
for _ in range(20):
    lab = np.argmin(((pts[:, None, :] - centres[None]) ** 2).sum(2), 1)
    centres = np.array([np.median(pts[lab == k], 0) for k in range(4)])
out = {}
for k, name in enumerate(['front_left', 'front_right', 'back_right', 'back_left']):
    ax, ay = centres[k].astype(int)
    w = d[ay - 30:ay + 30, ax - 30:ax + 30]
    m = w > 60
    yy, xx = np.nonzero(m)
    wt = w[m]
    out[name] = {'bed': marks[name], 'px': [ax - 30 + (xx * wt).sum() / wt.sum(), ay - 30 + (yy * wt).sum() / wt.sum()]}
    print(name, out[name])
A = []
for v in out.values():
    (x, y), (u, w_) = v['bed'], v['px']
    A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
    A.append([0, 0, 0, x, y, 1, -w_ * x, -w_ * y, -w_])
H = np.linalg.svd(np.array(A, float))[2][-1].reshape(3, 3)
H /= H[2, 2]
json.dump({'width': a.shape[1], 'height': a.shape[0], 'H': H.round(9).tolist()}, open(base + '-homography.json', 'w'), indent=1)
print(json.dumps(H.round(9).tolist()))
