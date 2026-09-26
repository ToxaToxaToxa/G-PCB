/*
 * Gerber RS-274X parser and plotter.
 *
 * Produces the final dark image as polygons (clear polarity subtracted),
 * plus the centre lines of all strokes (used for board outlines).
 * All output is in millimetres.
 */
import {
    Path,
    Paths,
    Pt,
    arcPoints,
    circlePath,
    difference,
    obroundPath,
    rectPath,
    regularPolygonPath,
    rotatePaths,
    strokeRound,
    strokeShape,
    toInt,
    translatePaths,
    union,
    unionAll,
} from './geometry';
import { evaluateMacroExpression } from './macroExpr';

export interface GerberStroke {
    width: number;
    points: Pt[];
}

export interface GerberImage {
    polygons: Paths;
    strokes: GerberStroke[];
    /** Closed region contours as drawn (mm), used as an outline fallback */
    regions: Pt[][];
    warnings: string[];
    name?: string;
    fileFunction?: string;
}

interface Aperture {
    /** Shape centred on the origin, mm */
    shape: Paths;
    /** Diameter when the aperture is a plain circle (round strokes) */
    circle?: number;
}

interface MacroDef {
    name: string;
    body: string[];
}

type Op =
    | { kind: 'polys'; dark: boolean; paths: Paths }
    | { kind: 'round'; dark: boolean; width: number; line: Pt[] };

const numberRe = /([XYIJD])([+-]?[\d.]+)/g;

export const parseGerber = (content: string): GerberImage => {
    const warnings = new Set<string>();

    // --- format state
    let unitScale = 1; // 25.4 for inches
    let fsInt = 3;
    let fsDec = 4;
    let trailingOmitted = false;
    let incremental = false;
    let formatSet = false;

    const apertures = new Map<number, Aperture>();
    const macros = new Map<string, MacroDef>();

    // --- graphics state
    let current: Aperture | null = null;
    let x = 0;
    let y = 0;
    let interpolation: 1 | 2 | 3 = 1;
    let multiQuadrant = true;
    let dark = true;
    let regionMode = false;
    let contour: Pt[] = [];
    let regionContours: Pt[][] = [];
    // aperture transformations (LM/LR/LS)
    let mirror = '';
    let rotation = 0;
    let scaleT = 1;

    // step & repeat
    let sr: { nx: number; ny: number; dx: number; dy: number; ops: Op[] } | null = null;

    // --- output
    let image: Paths = [];
    let batchDark = true;
    let batchPolys: Paths = [];
    const batchRound = new Map<number, Paths>();
    const strokes: GerberStroke[] = [];
    const regions: Pt[][] = [];
    let name: string | undefined;
    let fileFunction: string | undefined;

    const flush = () => {
        const parts: Paths = unionAll(batchPolys);
        let shapes = parts;
        batchRound.forEach((lines, width) => {
            shapes = union(shapes, strokeRound(lines, width));
        });
        if (shapes.length) {
            image = batchDark ? union(image, shapes) : difference(image, shapes);
        }
        batchPolys = [];
        batchRound.clear();
    };

    const render = (op: Op) => {
        if (op.dark !== batchDark) {
            flush();
            batchDark = op.dark;
        }
        if (op.kind === 'polys') {
            batchPolys.push(...op.paths);
        } else {
            const list = batchRound.get(op.width) ?? [];
            list.push(op.line.map(([px, py]) => toInt(px, py)));
            batchRound.set(op.width, list);
        }
    };

    const emit = (op: Op) => {
        if (sr) {
            sr.ops.push(op);
        } else {
            render(op);
        }
    };

    const closeStepRepeat = () => {
        if (!sr) {
            return;
        }
        const block = sr;
        sr = null;
        for (let i = 0; i < block.nx; i++) {
            for (let j = 0; j < block.ny; j++) {
                const ox = i * block.dx;
                const oy = j * block.dy;
                for (const op of block.ops) {
                    if (op.kind === 'polys') {
                        render({ ...op, paths: translatePaths(op.paths, ox, oy) });
                    } else {
                        render({ ...op, line: op.line.map(([px, py]) => [px + ox, py + oy] as Pt) });
                    }
                }
            }
        }
    };

    const parseCoord = (raw: string, axis: 'x' | 'y' | 'ij'): number => {
        void axis;
        if (raw.includes('.')) {
            return Number(raw) * unitScale;
        }
        let sign = 1;
        let digits = raw;
        if (digits[0] === '-' || digits[0] === '+') {
            sign = digits[0] === '-' ? -1 : 1;
            digits = digits.slice(1);
        }
        if (trailingOmitted) {
            digits = digits.padEnd(fsInt + fsDec, '0');
        }
        return (sign * Number(digits)) / 10 ** fsDec * unitScale;
    };

    // ---------------- apertures

    const holeCut = (shape: Paths, hole?: number) =>
        hole && hole > 0 ? difference(shape, [circlePath(0, 0, hole / 2)]) : shape;

    const defineStandard = (template: string, params: number[]): Aperture | null => {
        const p = params.map((v) => v * unitScale);
        switch (template) {
            case 'C':
                return p[1] > 0
                    ? { shape: holeCut([circlePath(0, 0, p[0] / 2)], p[1]) }
                    : { shape: [circlePath(0, 0, p[0] / 2)], circle: p[0] };
            case 'R':
                return { shape: holeCut([rectPath(0, 0, p[0], p[1])], p[2]) };
            case 'O':
                return { shape: holeCut([obroundPath(0, 0, p[0], p[1])], p[2]) };
            case 'P':
                return {
                    shape: holeCut(
                        [regularPolygonPath(0, 0, p[0], Math.round(params[1]), params[2] || 0)],
                        params[3] ? params[3] * unitScale : 0,
                    ),
                };
            default:
                return null;
        }
    };

    const instantiateMacro = (macro: MacroDef, args: number[]): Aperture => {
        const vars: Record<number, number> = {};
        args.forEach((v, i) => {
            vars[i + 1] = v;
        });
        let shape: Paths = [];
        const s = unitScale;
        const ev = (expr: string) => evaluateMacroExpression(expr, vars);

        for (const statement of macro.body) {
            const st = statement.trim();
            if (!st || st.startsWith('0')) {
                continue; // comment
            }
            const assign = /^\$(\d+)=(.+)$/.exec(st);
            if (assign) {
                vars[Number(assign[1])] = ev(assign[2]);
                continue;
            }
            const parts = st.split(',');
            const code = Number(parts[0]);
            const v = parts.slice(1).map(ev);
            let paths: Paths = [];
            let exposure = 1;

            switch (code) {
                case 1: {
                    // circle: exposure, diameter, cx, cy, rotation
                    exposure = v[0];
                    paths = rotatePaths([circlePath(v[2] * s, v[3] * s, (v[1] * s) / 2)], v[4] || 0);
                    break;
                }
                case 2:
                case 20: {
                    // vector line: exposure, width, sx, sy, ex, ey, rotation
                    exposure = v[0];
                    const w = v[1] * s;
                    const [sx, sy, ex, ey] = [v[2] * s, v[3] * s, v[4] * s, v[5] * s];
                    const len = Math.hypot(ex - sx, ey - sy);
                    if (len > 0) {
                        const nx = (-(ey - sy) / len) * (w / 2);
                        const ny = ((ex - sx) / len) * (w / 2);
                        paths = [[
                            toInt(sx + nx, sy + ny),
                            toInt(ex + nx, ey + ny),
                            toInt(ex - nx, ey - ny),
                            toInt(sx - nx, sy - ny),
                        ]];
                    }
                    paths = rotatePaths(paths, v[6] || 0);
                    break;
                }
                case 21: {
                    // center line: exposure, width, height, cx, cy, rotation
                    exposure = v[0];
                    paths = rotatePaths([rectPath(v[3] * s, v[4] * s, v[1] * s, v[2] * s)], v[5] || 0);
                    break;
                }
                case 22: {
                    // lower-left line (deprecated): exposure, width, height, x, y, rotation
                    exposure = v[0];
                    const w = v[1] * s;
                    const h = v[2] * s;
                    paths = rotatePaths([rectPath(v[3] * s + w / 2, v[4] * s + h / 2, w, h)], v[5] || 0);
                    break;
                }
                case 4: {
                    // outline: exposure, n, x0, y0, ... xn, yn, rotation
                    exposure = v[0];
                    const n = Math.round(v[1]);
                    const pts: Path = [];
                    for (let k = 0; k <= n; k++) {
                        pts.push(toInt(v[2 + k * 2] * s, v[3 + k * 2] * s));
                    }
                    paths = rotatePaths([pts], v[4 + n * 2] || 0);
                    break;
                }
                case 5: {
                    // polygon: exposure, vertices, cx, cy, diameter, rotation
                    exposure = v[0];
                    paths = rotatePaths(
                        [regularPolygonPath(v[2] * s, v[3] * s, v[4] * s, Math.round(v[1]))],
                        v[5] || 0,
                    );
                    break;
                }
                case 6: {
                    // moire: cx, cy, outer d, thickness, gap, max rings, cross thickness, cross length, rotation
                    const [cx, cy, od, th, gap, rings, ct, cl, rot] = v;
                    let ringShapes: Paths = [];
                    let d = od;
                    for (let k = 0; k < rings && d > 0; k++) {
                        const inner = d - 2 * th;
                        let ring: Paths = [circlePath(cx * s, cy * s, (d * s) / 2)];
                        if (inner > 0) {
                            ring = difference(ring, [circlePath(cx * s, cy * s, (inner * s) / 2)]);
                        }
                        ringShapes = union(ringShapes, ring);
                        d = inner - 2 * gap;
                    }
                    const cross = unionAll([
                        rectPath(cx * s, cy * s, cl * s, ct * s),
                        rectPath(cx * s, cy * s, ct * s, cl * s),
                    ]);
                    paths = rotatePaths(union(ringShapes, cross), rot || 0);
                    break;
                }
                case 7: {
                    // thermal: cx, cy, outer d, inner d, gap, rotation
                    const [cx, cy, od, id, gap, rot] = v;
                    let ring: Paths = difference(
                        [circlePath(cx * s, cy * s, (od * s) / 2)],
                        [circlePath(cx * s, cy * s, (id * s) / 2)],
                    );
                    ring = difference(ring, unionAll([
                        rectPath(cx * s, cy * s, od * s * 2, gap * s),
                        rectPath(cx * s, cy * s, gap * s, od * s * 2),
                    ]));
                    paths = rotatePaths(ring, rot || 0);
                    break;
                }
                default:
                    warnings.add(`Unsupported aperture macro primitive ${code} in ${macro.name}`);
                    continue;
            }
            if (exposure === 0) {
                shape = difference(shape, unionAll(paths));
            } else {
                shape = union(shape, unionAll(paths));
            }
        }
        return { shape };
    };

    const transformAperture = (shape: Paths): Paths => {
        let out = shape;
        if (scaleT !== 1) {
            out = out.map((p) => p.map((pt) => ({ X: Math.round(pt.X * scaleT), Y: Math.round(pt.Y * scaleT) })));
        }
        if (mirror) {
            const mx = mirror.includes('X') ? -1 : 1;
            const my = mirror.includes('Y') ? -1 : 1;
            out = out.map((p) => {
                const m = p.map((pt) => ({ X: pt.X * mx, Y: pt.Y * my }));
                return mx * my < 0 ? m.reverse() : m;
            });
        }
        return rotatePaths(out, rotation);
    };

    // ---------------- interpolation helpers

    const arcCenter = (sx: number, sy: number, ex: number, ey: number, i: number, j: number, cw: boolean): { cx: number; cy: number; sweep: number } => {
        const sweepFor = (cx: number, cy: number) => {
            const a0 = Math.atan2(sy - cy, sx - cx);
            const a1 = Math.atan2(ey - cy, ex - cx);
            let sweep = a1 - a0;
            if (cw) {
                if (sweep >= -1e-9) sweep -= 2 * Math.PI;
            } else if (sweep <= 1e-9) {
                sweep += 2 * Math.PI;
            }
            return sweep;
        };
        if (multiQuadrant) {
            const cx = sx + i;
            const cy = sy + j;
            let sweep = sweepFor(cx, cy);
            // full circle when start == end
            if (Math.abs(sx - ex) < 1e-9 && Math.abs(sy - ey) < 1e-9) {
                sweep = cw ? -2 * Math.PI : 2 * Math.PI;
            }
            return { cx, cy, sweep };
        }
        // single quadrant: unsigned offsets, pick the centre giving a <= 90° arc
        let best = { cx: sx + i, cy: sy + j, sweep: 0, err: Infinity };
        for (const si of [1, -1]) {
            for (const sj of [1, -1]) {
                const cx = sx + si * Math.abs(i);
                const cy = sy + sj * Math.abs(j);
                const sweep = sweepFor(cx, cy);
                if (Math.abs(sweep) > Math.PI / 2 + 1e-6) continue;
                const err = Math.abs(Math.hypot(sx - cx, sy - cy) - Math.hypot(ex - cx, ey - cy));
                if (err < best.err) best = { cx, cy, sweep, err };
            }
        }
        return best;
    };

    const segmentPoints = (ex: number, ey: number, i: number, j: number): Pt[] => {
        if (interpolation === 1) {
            return [[ex, ey]];
        }
        const { cx, cy, sweep } = arcCenter(x, y, ex, ey, i, j, interpolation === 2);
        return arcPoints(cx, cy, [x, y], sweep, [ex, ey]);
    };

    // ---------------- command processing

    const handleOperation = (cmd: string) => {
        // Coordinates and D code of an operation block (G codes already stripped)
        let nx = x;
        let ny = y;
        let i = 0;
        let j = 0;
        let d: number | null = null;
        numberRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = numberRe.exec(cmd)) !== null) {
            const [, letter, raw] = m;
            if (letter === 'X') nx = incremental ? x + parseCoord(raw, 'x') : parseCoord(raw, 'x');
            else if (letter === 'Y') ny = incremental ? y + parseCoord(raw, 'y') : parseCoord(raw, 'y');
            else if (letter === 'I') i = parseCoord(raw, 'ij');
            else if (letter === 'J') j = parseCoord(raw, 'ij');
            else if (letter === 'D') d = Number(raw);
        }
        if (d === null) {
            // Deprecated: coordinate data without D code uses D01
            if (/[XY]/.test(cmd)) d = 1;
            else return;
        }

        if (d >= 10) {
            current = apertures.get(d) ?? null;
            if (!current) warnings.add(`Aperture D${d} is not defined`);
            return;
        }

        if (regionMode) {
            if (d === 1) {
                if (contour.length === 0) contour.push([x, y]);
                contour.push(...segmentPoints(nx, ny, i, j));
            } else if (d === 2) {
                if (contour.length >= 3) regionContours.push(contour);
                contour = [];
            }
            x = nx;
            y = ny;
            return;
        }

        if (d === 1) {
            if (!current) {
                warnings.add('Stroke without a selected aperture');
            } else {
                const pts: Pt[] = [[x, y], ...segmentPoints(nx, ny, i, j)];
                const width = current.circle;
                if (width !== undefined && !mirror && scaleT === 1) {
                    emit({ kind: 'round', dark, width, line: pts });
                    strokes.push({ width, points: pts });
                } else {
                    const line = pts.map(([px, py]) => toInt(px, py));
                    const shape = transformAperture(current.shape);
                    for (const outer of shape) {
                        emit({ kind: 'polys', dark, paths: strokeShape(outer, line) });
                    }
                    strokes.push({ width: width ?? 0, points: pts });
                }
            }
        } else if (d === 3) {
            if (!current) {
                warnings.add('Flash without a selected aperture');
            } else {
                emit({ kind: 'polys', dark, paths: translatePaths(transformAperture(current.shape), nx, ny) });
            }
        }
        x = nx;
        y = ny;
    };

    const handleExtended = (block: string) => {
        const code = block.slice(0, 2);
        const body = block.slice(2);
        switch (code) {
            case 'FS': {
                const m = /^([LT]?)([AI]?)X(\d)(\d)Y(\d)(\d)/.exec(body);
                if (m) {
                    trailingOmitted = m[1] === 'T';
                    incremental = m[2] === 'I';
                    fsInt = Number(m[3]);
                    fsDec = Number(m[4]);
                    formatSet = true;
                }
                break;
            }
            case 'MO':
                unitScale = body.startsWith('IN') ? 25.4 : 1;
                break;
            case 'AD': {
                const m = /^D(\d+)([^,]+),?(.*)$/.exec(body);
                if (!m) break;
                const dcode = Number(m[1]);
                const template = m[2];
                const params = m[3] ? m[3].split('X').map(Number) : [];
                const standard = defineStandard(template, params);
                if (standard) {
                    apertures.set(dcode, standard);
                } else if (macros.has(template)) {
                    apertures.set(dcode, instantiateMacro(macros.get(template)!, params));
                } else {
                    warnings.add(`Unknown aperture template ${template}`);
                }
                break;
            }
            case 'LP':
                dark = !body.startsWith('C');
                break;
            case 'LM':
                mirror = body.startsWith('N') ? '' : body;
                break;
            case 'LR':
                rotation = Number(body) || 0;
                break;
            case 'LS':
                scaleT = Number(body) || 1;
                break;
            case 'SR': {
                closeStepRepeat();
                const m = /X(\d+)Y(\d+)I([\d.+-]+)J([\d.+-]+)/.exec(body);
                if (m && (Number(m[1]) > 1 || Number(m[2]) > 1)) {
                    sr = {
                        nx: Number(m[1]),
                        ny: Number(m[2]),
                        dx: Number(m[3]) * unitScale,
                        dy: Number(m[4]) * unitScale,
                        ops: [],
                    };
                }
                break;
            }
            case 'IP':
                if (body.startsWith('NEG')) warnings.add('Negative image polarity (IPNEG) is not supported');
                break;
            case 'AB':
                warnings.add('Block apertures (AB) are not supported');
                break;
            case 'IN':
                name = body;
                break;
            case 'TF':
                if (body.startsWith('.FileFunction,')) fileFunction = body.slice(14);
                break;
            default:
                break; // LN, TA, TO, TD, IJ, OF, SF, ...
        }
    };

    // ---------------- tokenizer
    const text = content.replace(/\r/g, '');
    let pos = 0;
    while (pos < text.length) {
        const ch = text[pos];
        if (ch === '\n' || ch === ' ' || ch === '\t') {
            pos++;
            continue;
        }
        if (ch === '%') {
            const end = text.indexOf('%', pos + 1);
            if (end === -1) break;
            const block = text.slice(pos + 1, end).replace(/\n/g, '');
            pos = end + 1;
            if (block.startsWith('AM')) {
                const parts = block.split('*');
                const macroName = parts[0].slice(2);
                macros.set(macroName, { name: macroName, body: parts.slice(1).filter(Boolean) });
            } else {
                for (const part of block.split('*')) {
                    if (part) handleExtended(part);
                }
            }
            continue;
        }
        const end = text.indexOf('*', pos);
        if (end === -1) break;
        let cmd = text.slice(pos, end).replace(/\s+/g, '');
        pos = end + 1;
        if (!cmd) continue;

        if (cmd.startsWith('G04') || cmd.startsWith('G4 ')) continue; // comment
        if (cmd === 'M02' || cmd === 'M00' || cmd === 'M2') break;
        if (cmd.startsWith('M')) continue;

        // G codes at the start of the block
        let g: RegExpExecArray | null;
        while ((g = /^G0*(\d+)/.exec(cmd)) !== null) {
            const code = Number(g[1]);
            cmd = cmd.slice(g[0].length);
            if (code === 1) interpolation = 1;
            else if (code === 2) interpolation = 2;
            else if (code === 3) interpolation = 3;
            else if (code === 74) multiQuadrant = false;
            else if (code === 75) multiQuadrant = true;
            else if (code === 36) {
                regionMode = true;
                contour = [];
                regionContours = [];
            } else if (code === 37) {
                if (contour.length >= 3) regionContours.push(contour);
                if (regionContours.length) {
                    regions.push(...regionContours);
                    emit({
                        kind: 'polys',
                        dark,
                        paths: unionAll(regionContours.map((c) => c.map(([px, py]) => toInt(px, py)))),
                    });
                }
                regionMode = false;
                contour = [];
                regionContours = [];
            } else if (code === 70) unitScale = 25.4;
            else if (code === 71) unitScale = 1;
            else if (code === 90) incremental = false;
            else if (code === 91) incremental = true;
            else if (code === 4) {
                cmd = '';
            }
            // G54/G55 are prefixes for D codes
        }
        if (cmd) handleOperation(cmd);
    }

    closeStepRepeat();
    flush();

    if (!formatSet) warnings.add('No format specification (FS) found; assumed 3.4');

    return {
        polygons: image,
        strokes,
        regions,
        warnings: [...warnings],
        name,
        fileFunction,
    };
};
