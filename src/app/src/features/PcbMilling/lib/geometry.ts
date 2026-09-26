/*
 * Polygon helpers on top of Clipper (clipper-lib, Boost licence).
 *
 * Geometry is kept as integer paths scaled by SCALE (1 unit = 0.1 µm) so
 * Clipper can do exact boolean operations and offsets.
 */
import ClipperLib from 'clipper-lib';

export const SCALE = 10000;
/** Maximum deviation of arc approximations, mm */
export const ARC_TOLERANCE = 0.002;

export interface IntPoint {
    X: number;
    Y: number;
}
export type Path = IntPoint[];
export type Paths = Path[];

/** Plain mm point used outside of the geometry kernel */
export type Pt = [number, number];

export const toInt = (x: number, y: number): IntPoint => ({
    X: Math.round(x * SCALE),
    Y: Math.round(y * SCALE),
});
export const toMm = (p: IntPoint): Pt => [p.X / SCALE, p.Y / SCALE];

export const segmentsForRadius = (r: number, tol = ARC_TOLERANCE) => {
    if (r <= tol) {
        return 8;
    }
    const n = Math.ceil(Math.PI / Math.acos(1 - tol / r));
    return Math.min(Math.max(n, 8), 720);
};

export const circlePath = (cx: number, cy: number, r: number, n?: number): Path => {
    const count = n ?? segmentsForRadius(r);
    const path: Path = [];
    for (let i = 0; i < count; i++) {
        const a = (2 * Math.PI * i) / count;
        path.push(toInt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return path;
};

/**
 * Points along an arc from start to end around centre (start excluded,
 * end included). `sweep` is signed: positive = counter-clockwise.
 */
export const arcPoints = (
    cx: number,
    cy: number,
    start: Pt,
    sweep: number,
    end: Pt,
): Pt[] => {
    const r = Math.hypot(start[0] - cx, start[1] - cy);
    const a0 = Math.atan2(start[1] - cy, start[0] - cx);
    const full = segmentsForRadius(r);
    const n = Math.max(1, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * full));
    const pts: Pt[] = [];
    for (let i = 1; i < n; i++) {
        const a = a0 + (sweep * i) / n;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    pts.push(end);
    return pts;
};

export const rectPath = (cx: number, cy: number, w: number, h: number): Path => [
    toInt(cx - w / 2, cy - h / 2),
    toInt(cx + w / 2, cy - h / 2),
    toInt(cx + w / 2, cy + h / 2),
    toInt(cx - w / 2, cy + h / 2),
];

export const obroundPath = (cx: number, cy: number, w: number, h: number): Path => {
    if (Math.abs(w - h) < 1e-9) {
        return circlePath(cx, cy, w / 2);
    }
    const r = Math.min(w, h) / 2;
    const pts: Pt[] = [];
    const n = Math.ceil(segmentsForRadius(r) / 2);
    if (w > h) {
        const dx = w / 2 - r;
        for (let i = 0; i <= n; i++) {
            const a = -Math.PI / 2 + (Math.PI * i) / n;
            pts.push([cx + dx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        for (let i = 0; i <= n; i++) {
            const a = Math.PI / 2 + (Math.PI * i) / n;
            pts.push([cx - dx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
    } else {
        const dy = h / 2 - r;
        for (let i = 0; i <= n; i++) {
            const a = (Math.PI * i) / n;
            pts.push([cx + r * Math.cos(a), cy + dy + r * Math.sin(a)]);
        }
        for (let i = 0; i <= n; i++) {
            const a = Math.PI + (Math.PI * i) / n;
            pts.push([cx + r * Math.cos(a), cy - dy + r * Math.sin(a)]);
        }
    }
    return pts.map(([x, y]) => toInt(x, y));
};

export const regularPolygonPath = (
    cx: number,
    cy: number,
    diameter: number,
    vertices: number,
    rotationDeg = 0,
): Path => {
    const path: Path = [];
    const r = diameter / 2;
    for (let i = 0; i < vertices; i++) {
        const a = (rotationDeg * Math.PI) / 180 + (2 * Math.PI * i) / vertices;
        path.push(toInt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return path;
};

export const translatePaths = (paths: Paths, dx: number, dy: number): Paths => {
    const ix = Math.round(dx * SCALE);
    const iy = Math.round(dy * SCALE);
    return paths.map((p) => p.map((pt) => ({ X: pt.X + ix, Y: pt.Y + iy })));
};

/** Rotates paths around the origin (degrees, counter-clockwise). */
export const rotatePaths = (paths: Paths, deg: number): Paths => {
    if (!deg) {
        return paths;
    }
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return paths.map((p) =>
        p.map((pt) => ({
            X: Math.round(pt.X * c - pt.Y * s),
            Y: Math.round(pt.X * s + pt.Y * c),
        })),
    );
};

const execute = (
    type: number,
    subject: Paths,
    clip: Paths,
    fill = ClipperLib.PolyFillType.pftNonZero,
): Paths => {
    const c = new ClipperLib.Clipper();
    c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    if (clip.length) {
        c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
    }
    const solution: Paths = [];
    c.Execute(type, solution, fill, fill);
    return solution;
};

/** Normalises every path to positive orientation and unions them. */
export const unionAll = (paths: Paths): Paths => {
    if (paths.length === 0) {
        return [];
    }
    const oriented = paths
        .filter((p) => p.length >= 3)
        .map((p) => (ClipperLib.Clipper.Orientation(p) ? p : [...p].reverse()));
    return execute(ClipperLib.ClipType.ctUnion, oriented, []);
};

/** Union of already valid polygon sets (holes preserved). */
export const union = (a: Paths, b: Paths): Paths =>
    execute(ClipperLib.ClipType.ctUnion, a, b);

export const difference = (a: Paths, b: Paths): Paths =>
    b.length ? execute(ClipperLib.ClipType.ctDifference, a, b) : a;

export const intersection = (a: Paths, b: Paths): Paths =>
    execute(ClipperLib.ClipType.ctIntersection, a, b);

/** Offsets closed polygons by `delta` mm (positive grows). */
export const offset = (paths: Paths, delta: number): Paths => {
    if (!paths.length) {
        return [];
    }
    const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE * SCALE);
    co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    const solution: Paths = [];
    co.Execute(solution, delta * SCALE);
    return solution;
};

/** Thickens open polylines into polygons with round ends (a round aperture stroke). */
export const strokeRound = (lines: Paths, width: number): Paths => {
    if (!lines.length || width <= 0) {
        return [];
    }
    const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE * SCALE);
    co.AddPaths(lines, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const solution: Paths = [];
    co.Execute(solution, (width / 2) * SCALE);
    return solution;
};

/** Sweeps an arbitrary aperture shape along an open polyline. */
export const strokeShape = (shape: Path, line: Path): Paths => {
    if (line.length === 1) {
        return [shape.map((p) => ({ X: p.X + line[0].X, Y: p.Y + line[0].Y }))];
    }
    const sum = ClipperLib.Clipper.MinkowskiSum(shape, line, false);
    return unionAll(sum);
};

export const area = (path: Path) => ClipperLib.Clipper.Area(path) / (SCALE * SCALE);
export const totalArea = (paths: Paths) => paths.reduce((s, p) => s + area(p), 0);
export const isOuter = (path: Path) => ClipperLib.Clipper.Orientation(path);

/** 1 = inside, 0 = outside, -1 = on the boundary */
export const pointInPath = (pt: IntPoint, path: Path): number =>
    ClipperLib.Clipper.PointInPolygon(pt, path);

export interface ExPolygon {
    outer: Path;
    holes: Path[];
}

/** Groups outer contours with their holes. */
export const toExPolygons = (paths: Paths): ExPolygon[] => {
    const c = new ClipperLib.Clipper();
    c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    c.Execute(
        ClipperLib.ClipType.ctUnion,
        tree,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero,
    );
    return ClipperLib.JS.PolyTreeToExPolygons(tree) as ExPolygon[];
};

export const cleanPaths = (paths: Paths, distance = 0.0005): Paths =>
    ClipperLib.Clipper.CleanPolygons(paths, distance * SCALE);

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export const boundsOf = (paths: Paths): Bounds | null => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of paths) {
        for (const pt of p) {
            minX = Math.min(minX, pt.X);
            minY = Math.min(minY, pt.Y);
            maxX = Math.max(maxX, pt.X);
            maxY = Math.max(maxY, pt.Y);
        }
    }
    if (!Number.isFinite(minX)) {
        return null;
    }
    return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE };
};

/** Applies (x, y) -> (sx * x + dx, y + dy) in mm, keeping valid orientation. */
export const transformPaths = (paths: Paths, mirrorX: boolean, dx: number, dy: number): Paths => {
    const ix = Math.round(dx * SCALE);
    const iy = Math.round(dy * SCALE);
    return paths.map((p) => {
        const moved = p.map((pt) => ({ X: (mirrorX ? -pt.X : pt.X) + ix, Y: pt.Y + iy }));
        return mirrorX ? moved.reverse() : moved;
    });
};
