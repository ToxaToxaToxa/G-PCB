/*
 * Toolpath generation: V-bit isolation, drilling, large hole milling and
 * board outline with tabs. Produces GRBL programs via GrblWriter.
 */
import {
    CutDirection,
    Operation,
    PcbSettings,
    VBit,
} from '../definitions';
import { BoardModel } from './board';
import { DrillHole } from './excellon';
import {
    Paths,
    Pt,
    boundsOf,
    cleanPaths,
    intersection,
    isOuter,
    offset,
    toExPolygons,
    toMm,
} from './geometry';
import { GrblWriter } from './gcode';

/** Cutting width of a V-bit at the given depth. */
export const vbitWidth = (bit: Pick<VBit, 'angle' | 'tipDiameter'>, depth: number) =>
    bit.tipDiameter + 2 * Math.max(depth, 0) * Math.tan(((bit.angle / 2) * Math.PI) / 180);

const toLoops = (paths: Paths, direction: CutDirection) =>
    cleanPaths(paths, 0.004)
        .filter((p) => p.length >= 2)
        .map((p) => {
            const pts = p.map(toMm);
            // Clipper outer contours are counter-clockwise; with a clockwise
            // spindle, climb milling runs outer contours clockwise.
            return direction === 'climb' ? pts.reverse() : pts;
        });

/** Isolation loops (closed, without repeated first point). */
export const isolationLoops = (
    copper: Paths,
    width: number,
    passes: number,
    overlap: number,
    direction: CutDirection,
): Pt[][] => {
    const loops: Pt[][] = [];
    const step = width * (1 - Math.min(Math.max(overlap, 0), 0.9));
    for (let i = 0; i < Math.max(1, passes); i++) {
        loops.push(...toLoops(offset(copper, width / 2 + i * step), direction));
    }
    return loops;
};

/**
 * Regions where the tool cannot pass between two separate copper areas
 * (the gap is narrower than the cutting width). Returned in mm paths.
 */
export const findUnisolated = (copper: Paths, width: number): Paths => {
    const islands = toExPolygons(copper);
    const grown = islands.map((e) => {
        const g = offset([e.outer, ...e.holes], width / 2 - 0.0005);
        return { g, b: boundsOf(g) };
    });
    const result: Paths = [];
    for (let i = 0; i < grown.length; i++) {
        for (let j = i + 1; j < grown.length; j++) {
            const a = grown[i].b;
            const b = grown[j].b;
            if (!a || !b || a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) {
                continue;
            }
            const overlap = intersection(grown[i].g, grown[j].g);
            if (overlap.length) {
                result.push(...overlap);
            }
        }
    }
    return result;
};

/** Greedy nearest-neighbour ordering; closed loops are rotated to the closest vertex. */
export const orderLoops = (loops: Pt[][], start: Pt = [0, 0]): Pt[][] => {
    const remaining = loops.slice();
    const ordered: Pt[][] = [];
    let cur = start;
    while (remaining.length) {
        let best = 0;
        let bestVertex = 0;
        let bestDist = Infinity;
        remaining.forEach((loop, li) => {
            for (let vi = 0; vi < loop.length; vi++) {
                const d = (loop[vi][0] - cur[0]) ** 2 + (loop[vi][1] - cur[1]) ** 2;
                if (d < bestDist) {
                    bestDist = d;
                    best = li;
                    bestVertex = vi;
                }
            }
        });
        const loop = remaining.splice(best, 1)[0];
        const rotated = [...loop.slice(bestVertex), ...loop.slice(0, bestVertex)];
        ordered.push(rotated);
        cur = rotated[0];
    }
    return ordered;
};

export const orderPoints = <T extends { x: number; y: number }>(points: T[], start: Pt = [0, 0]): T[] => {
    const remaining = points.slice();
    const ordered: T[] = [];
    let cx = start[0];
    let cy = start[1];
    while (remaining.length) {
        let best = 0;
        let bestDist = Infinity;
        remaining.forEach((p, i) => {
            const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        });
        const p = remaining.splice(best, 1)[0];
        ordered.push(p);
        cx = p.x;
        cy = p.y;
    }
    return ordered;
};

const closeLoop = (loop: Pt[]): Pt[] => [...loop, loop[0]];

// ---------------------------------------------------------------- isolation

export const buildIsolation = (model: BoardModel, settings: PcbSettings): Operation | null => {
    const iso = settings.isolation;
    const bit = settings.vbits.find((b) => b.id === iso.toolId) ?? settings.vbits[0];
    if (!bit || !model.copper.length) {
        return null;
    }
    const width = vbitWidth(bit, iso.depth);
    const warnings: string[] = [];

    const unisolated = findUnisolated(model.copper, width);
    if (unisolated.length) {
        warnings.push(
            `${unisolated.length} place(s) where copper areas are closer than the ${width.toFixed(3)} mm cut width; they will stay connected. Use a finer bit or a shallower depth.`,
        );
    }

    const loops = orderLoops(isolationLoops(model.copper, width, iso.passes, iso.overlap, iso.direction));
    const tool = `${bit.name} (${bit.angle}°, tip ${bit.tipDiameter} mm), cut width ${width.toFixed(3)} mm at ${iso.depth} mm`;
    const w = new GrblWriter(settings.safeZ, settings.travelZ);
    w.header(`Isolation ${model.side}`, tool, iso.rpm, settings.dwell);
    const z = -Math.abs(iso.depth);
    for (const loop of loops) {
        const path = closeLoop(loop);
        w.travelTo(path[0][0], path[0][1]);
        w.plunge(z, iso.plunge);
        for (const [x, y] of path.slice(1)) {
            w.linear(x, y, z, iso.feed);
        }
    }
    w.footer();

    return {
        id: `isolation-${model.side}`,
        kind: 'isolation',
        name: `Isolation (${model.side})`,
        tool,
        gcode: w.toString(),
        paths: loops.map(closeLoop),
        points: [],
        stats: { lines: w.lineCount, cutLength: w.cutLength, estimatedMinutes: w.estimatedMinutes },
        warnings,
        unisolated: unisolated.map((p) => p.map(toMm)),
    };
};

// ---------------------------------------------------------------- drilling

export interface DrillAssignment {
    bit: number | null;
    holes: DrillHole[];
    mill: DrillHole[];
    warnings: string[];
}

/** Picks the nearest available drill for every hole diameter. */
export const pickDrill = (diameter: number, drills: number[]): number | null => {
    if (!drills.length) return null;
    let best = drills[0];
    for (const d of drills) {
        const diff = Math.abs(d - diameter);
        const bestDiff = Math.abs(best - diameter);
        if (diff < bestDiff - 1e-9 || (Math.abs(diff - bestDiff) < 1e-9 && d < best)) {
            best = d;
        }
    }
    return best;
};

export const groupHoles = (holes: DrillHole[], settings: PcbSettings) => {
    const drills = [...settings.drilling.drills].filter((d) => d > 0).sort((a, b) => a - b);
    const maxDrill = drills[drills.length - 1] ?? 0;
    const endMill = settings.outline.endMillDiameter;
    const groups = new Map<number, DrillHole[]>();
    const mill: DrillHole[] = [];
    const warnings: string[] = [];
    let slots = 0;

    for (const h of holes) {
        if (h.x2 !== undefined) {
            slots++;
        }
        if (h.diameter > maxDrill + 0.05 && settings.outline.millLargeHoles && endMill < h.diameter) {
            mill.push(h);
            continue;
        }
        const bit = pickDrill(h.diameter, drills);
        if (bit === null) continue;
        if (Math.abs(bit - h.diameter) > 0.1) {
            warnings.push(`Hole ${h.diameter.toFixed(3)} mm drilled with ${bit} mm`);
        }
        groups.set(bit, [...(groups.get(bit) ?? []), h]);
    }
    if (slots) {
        warnings.push(`${slots} slot(s) are drilled only at their start point.`);
    }
    return { groups, mill, warnings: [...new Set(warnings)] };
};

export const buildDrillOps = (model: BoardModel, settings: PcbSettings): Operation[] => {
    const dr = settings.drilling;
    const { groups, warnings } = groupHoles(model.holes, settings);
    const depth = -(dr.boardThickness + dr.breakthrough);
    const ops: Operation[] = [];
    [...groups.keys()].sort((a, b) => a - b).forEach((bit, index) => {
        const holes = orderPoints(groups.get(bit)!);
        const tool = `Drill ${bit} mm`;
        const w = new GrblWriter(settings.safeZ, settings.travelZ);
        w.header(`Drill ${bit} mm (${holes.length} holes)`, tool, dr.rpm, settings.dwell);
        for (const h of holes) {
            w.travelTo(h.x, h.y);
            if (dr.peck > 0) {
                let z = 0;
                while (z > depth) {
                    z = Math.max(z - dr.peck, depth);
                    w.plunge(z, dr.plunge);
                    if (z > depth) {
                        // clear chips, then return close to the bottom of the hole
                        w.rapidZ(settings.travelZ);
                        w.rapidZ(Math.min(z + 0.2, 0.5));
                    }
                }
            } else {
                w.plunge(depth, dr.plunge);
            }
            w.rapidZ(settings.travelZ);
        }
        w.footer();
        ops.push({
            id: `drill-${bit}`,
            kind: 'drill',
            name: `Drill ${bit} mm`,
            tool,
            gcode: w.toString(),
            paths: [],
            points: holes.map((h) => [h.x, h.y]),
            stats: { lines: w.lineCount, cutLength: w.cutLength, estimatedMinutes: w.estimatedMinutes },
            warnings: index === 0 ? warnings : [],
        });
    });
    return ops;
};

// ---------------------------------------------------------------- end mill work

export const buildHoleMilling = (model: BoardModel, settings: PcbSettings): Operation | null => {
    const { mill } = groupHoles(model.holes, settings);
    if (!mill.length) return null;
    const o = settings.outline;
    const D = o.endMillDiameter;
    const depth = -(settings.drilling.boardThickness + settings.drilling.breakthrough);
    const tool = `End mill ${D} mm`;
    const w = new GrblWriter(settings.safeZ, settings.travelZ);
    w.header(`Mill ${mill.length} large hole(s)`, tool, o.rpm, settings.dwell);
    const paths: Pt[][] = [];
    for (const h of orderPoints(mill)) {
        const r = (h.diameter - D) / 2;
        const sx = h.x + r;
        w.travelTo(sx, h.y);
        w.plunge(0, o.plunge);
        let z = 0;
        while (z > depth) {
            z = Math.max(z - o.stepdown, depth);
            w.arcCW(sx, h.y, z, h.x, h.y, o.feed, 2 * Math.PI);
        }
        w.arcCW(sx, h.y, depth, h.x, h.y, o.feed, 2 * Math.PI);
        w.rapidZ(settings.travelZ);
        const circle: Pt[] = [];
        for (let i = 0; i <= 36; i++) {
            const a = (-2 * Math.PI * i) / 36;
            circle.push([h.x + r * Math.cos(a), h.y + r * Math.sin(a)]);
        }
        paths.push(circle);
    }
    w.footer();
    return {
        id: 'holes',
        kind: 'holes',
        name: `Mill large holes (${mill.length})`,
        tool,
        gcode: w.toString(),
        paths,
        points: [],
        stats: { lines: w.lineCount, cutLength: w.cutLength, estimatedMinutes: w.estimatedMinutes },
        warnings: [],
    };
};

/** Splits a closed path at the given arc-length positions and lifts Z inside tabs. */
const withTabs = (path: Pt[], tabs: number, tabLength: number): { pts: Pt[]; inTab: boolean[] } => {
    const lengths = [0];
    for (let i = 1; i < path.length; i++) {
        lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    }
    const total = lengths[lengths.length - 1];
    if (tabs <= 0 || total <= tabs * tabLength * 2) {
        return { pts: path, inTab: path.map(() => false) };
    }
    const ranges: [number, number][] = [];
    for (let k = 0; k < tabs; k++) {
        const c = ((k + 0.5) / tabs) * total;
        ranges.push([c - tabLength / 2, c + tabLength / 2]);
    }
    const cuts = ranges.flat();
    const isTab = (s: number) => ranges.some(([a, b]) => s > a + 1e-9 && s < b - 1e-9);

    const pts: Pt[] = [path[0]];
    const flags: boolean[] = [false];
    for (let i = 1; i < path.length; i++) {
        const s0 = lengths[i - 1];
        const s1 = lengths[i];
        const inside = cuts.filter((c) => c > s0 + 1e-9 && c < s1 - 1e-9).sort((a, b) => a - b);
        for (const c of inside) {
            const t = (c - s0) / (s1 - s0);
            pts.push([
                path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
                path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
            ]);
            flags.push(false);
        }
        pts.push(path[i]);
        flags.push(false);
    }
    // a segment ending at point j is in a tab when its midpoint is
    let s = 0;
    for (let j = 1; j < pts.length; j++) {
        const len = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        flags[j] = isTab(s + len / 2);
        s += len;
    }
    return { pts, inTab: flags };
};

export const buildOutline = (model: BoardModel, settings: PcbSettings): Operation | null => {
    const o = settings.outline;
    if (!model.board.length) return null;
    const D = o.endMillDiameter;
    const warnings: string[] = [];
    const cutPaths = offset(model.board, D / 2);

    const holesBefore = model.board.filter((p) => !isOuter(p)).length;
    const holesAfter = cutPaths.filter((p) => !isOuter(p)).length;
    if (holesAfter < holesBefore) {
        warnings.push(`${holesBefore - holesAfter} internal cutout(s) are smaller than the ${D} mm end mill and were skipped.`);
    }

    // Inner cutouts first, the outer contour last so the board stays fixed
    const inner = cutPaths.filter((p) => !isOuter(p));
    const outer = cutPaths.filter((p) => isOuter(p));
    const loops = [
        ...orderLoops(toLoops(inner, 'climb')),
        ...orderLoops(toLoops(outer, 'climb')),
    ];
    const outerCount = outer.length;

    const depth = -(settings.drilling.boardThickness + settings.drilling.breakthrough);
    const tabTop = -settings.drilling.boardThickness + o.tabHeight;
    const tool = `End mill ${D} mm`;
    const w = new GrblWriter(settings.safeZ, settings.travelZ);
    w.header('Board outline', tool, o.rpm, settings.dwell);

    loops.forEach((loop, index) => {
        const isOuterLoop = index >= loops.length - outerCount;
        const closed = closeLoop(loop);
        const tabbed = isOuterLoop && o.tabs > 0
            ? withTabs(closed, o.tabs, o.tabWidth + D)
            : { pts: closed, inTab: closed.map(() => false) };
        w.travelTo(closed[0][0], closed[0][1]);
        let z = 0;
        while (z > depth + 1e-9) {
            z = Math.max(z - o.stepdown, depth);
            const pass = z;
            const zAt = (j: number) => (tabbed.inTab[j] && pass < tabTop ? tabTop : pass);
            let curZ: number | null = null;
            for (let j = 1; j < tabbed.pts.length; j++) {
                const zj = zAt(j);
                if (curZ === null) {
                    w.plunge(zj, o.plunge);
                } else if (zj !== curZ) {
                    // step over / back into a tab at the segment start
                    w.linear(tabbed.pts[j - 1][0], tabbed.pts[j - 1][1], zj, zj > curZ ? o.feed : o.plunge);
                }
                curZ = zj;
                w.linear(tabbed.pts[j][0], tabbed.pts[j][1], zj, o.feed);
            }
        }
        w.rapidZ(settings.travelZ);
    });
    w.footer();

    if (o.tabs > 0) {
        warnings.push(`${o.tabs} tab(s) ${o.tabWidth} mm wide and ${o.tabHeight} mm high hold the board.`);
    }

    return {
        id: 'outline',
        kind: 'outline',
        name: 'Board outline',
        tool,
        gcode: w.toString(),
        paths: loops.map(closeLoop),
        points: [],
        stats: { lines: w.lineCount, cutLength: w.cutLength, estimatedMinutes: w.estimatedMinutes },
        warnings,
    };
};

export const buildOperations = (model: BoardModel, settings: PcbSettings): Operation[] => {
    const ops: Operation[] = [];
    if (settings.isolation.enabled) {
        const iso = buildIsolation(model, settings);
        if (iso) ops.push(iso);
    }
    if (settings.drilling.enabled) {
        ops.push(...buildDrillOps(model, settings));
    }
    if (settings.outline.enabled) {
        const holes = buildHoleMilling(model, settings);
        if (holes) ops.push(holes);
        const outline = buildOutline(model, settings);
        if (outline) ops.push(outline);
    }
    return ops;
};
