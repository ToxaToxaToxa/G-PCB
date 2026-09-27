import {
    ApplyHeightMapOptions,
    ApplyHeightMapResult,
    HeightMap,
} from '../definitions';
import { interpolateZ, isInsideMap } from './heightMap';

/*
 * Applies a Z height map to a G-code program.
 *
 * - Linear feed moves (G1) are split into segments not longer than
 *   `segmentLength` so the tool follows the probed surface.
 * - Arcs in the XY plane (G2/G3, G17) are converted into short G1 segments.
 * - Every move with a known XY position gets Z + offset(x, y).
 * - Rapid moves (G0) are not split, only their end point is compensated.
 * - Works with G20/G21 and G90/G91 input. Output keeps the program units
 *   and distance mode, and always carries an explicit motion word.
 */

type Axis = 'x' | 'y' | 'z';
type Vec = Record<Axis, number>;

interface Word {
    letter: string;
    value: number;
    raw: string;
}

const WORD_REGEX = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;

const stripComments = (line: string): { code: string; comment: string } => {
    let code = '';
    let comment = '';
    let depth = 0;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (depth === 0 && ch === ';') {
            comment += line.slice(i);
            break;
        }
        if (ch === '(') {
            depth++;
        }
        if (depth > 0) {
            comment += ch;
        } else {
            code += ch;
        }
        if (ch === ')' && depth > 0) {
            depth--;
        }
    }
    return { code: code.trim(), comment: comment.trim() };
};

const parseWords = (code: string): Word[] => {
    const words: Word[] = [];
    WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_REGEX.exec(code)) !== null) {
        words.push({
            letter: match[1].toUpperCase(),
            value: Number(match[2]),
            raw: `${match[1].toUpperCase()}${match[2]}`,
        });
    }
    return words;
};

const gCode = (value: number) => Math.round(value * 10) / 10;

const MOTION_CODES = [0, 1, 2, 3];
// Non-modal commands that use axis words without producing a normal move
const AXIS_CONSUMING_NON_MODAL = [10, 28, 30, 92, 28.1, 30.1, 92.1, 92.2, 92.3];

export const DEFAULT_APPLY_OPTIONS: ApplyHeightMapOptions = {
    segmentLength: 1,
    referenceMode: 'absolute',
    refX: 0,
    refY: 0,
};

export const applyHeightMap = (
    gcode: string,
    map: Pick<HeightMap, 'grid' | 'z'>,
    userOptions: Partial<ApplyHeightMapOptions> = {},
): ApplyHeightMapResult => {
    const options = { ...DEFAULT_APPLY_OPTIONS, ...userOptions };
    const segmentLength = Math.max(0.05, options.segmentLength || 1);

    const reference =
        options.referenceMode === 'point'
            ? interpolateZ(map, options.refX, options.refY)
            : 0;

    const warnings = new Set<string>();
    let pointsOutsideMap = 0;
    let movesCompensated = 0;
    let arcsLinearized = 0;
    let minOffset = Infinity;
    let maxOffset = -Infinity;

    const offsetAt = (x: number, y: number) => {
        if (!isInsideMap(map.grid, x, y, 0.01)) {
            pointsOutsideMap++;
        }
        const offset = interpolateZ(map, x, y) - reference;
        minOffset = Math.min(minOffset, offset);
        maxOffset = Math.max(maxOffset, offset);
        return offset;
    };

    // Modal state
    let units: 'G20' | 'G21' = 'G21';
    let absolute = true;
    let arcAbsolute = false; // G90.1
    let plane = 17;
    let motion: number | null = 0;

    // Program position (mm, work coordinates, uncompensated). NaN = unknown
    const pos: Vec = { x: NaN, y: NaN, z: NaN };
    // Position of the machine after the emitted (compensated) code, mm
    const out: Vec = { x: NaN, y: NaN, z: NaN };

    const scale = () => (units === 'G20' ? 25.4 : 1);
    const decimals = () =>
        options.precision ?? (units === 'G20' ? 5 : 4);
    const num = (mm: number) => {
        const value = Number((mm / scale()).toFixed(decimals()));
        return Object.is(value, -0) ? '0' : value.toString();
    };

    const output: string[] = [];
    const lines = gcode.split(/\r?\n/);

    /**
     * Emits a single straight move to the (compensated) absolute target.
     * `prefix` holds extra words (modal G codes) and `suffix` feed/spindle words.
     */
    const emitMove = (
        motionWord: string,
        target: Vec,
        axes: { x: boolean; y: boolean; z: boolean },
        prefix: string[],
        suffix: string[],
        comment: string,
    ) => {
        const words = [...prefix, motionWord];
        (['x', 'y', 'z'] as Axis[]).forEach((axis) => {
            if (!axes[axis] || !Number.isFinite(target[axis])) {
                return;
            }
            if (absolute) {
                words.push(`${axis.toUpperCase()}${num(target[axis])}`);
            } else {
                const delta = target[axis] - out[axis];
                words.push(`${axis.toUpperCase()}${num(delta)}`);
            }
        });
        words.push(...suffix);
        if (comment) {
            words.push(comment);
        }
        output.push(words.join(' '));
        (['x', 'y', 'z'] as Axis[]).forEach((axis) => {
            if (axes[axis] && Number.isFinite(target[axis])) {
                out[axis] = target[axis];
            }
        });
    };

    for (const originalLine of lines) {
        const { code, comment } = stripComments(originalLine);
        if (!code || code.startsWith('%')) {
            output.push(originalLine);
            continue;
        }

        const words = parseWords(code);
        const gWords = words.filter((w) => w.letter === 'G');
        const gValues = gWords.map((w) => gCode(w.value));

        // Update modal state that must be known before evaluating the move
        for (const g of gValues) {
            if (g === 20) {
                units = 'G20';
            } else if (g === 21) {
                units = 'G21';
            } else if (g === 90) {
                absolute = true;
            } else if (g === 91) {
                absolute = false;
            } else if (g === 90.1) {
                arcAbsolute = true;
            } else if (g === 91.1) {
                arcAbsolute = false;
            } else if (g === 17 || g === 18 || g === 19) {
                plane = g;
            } else if (MOTION_CODES.includes(g)) {
                motion = g;
            } else if (g === 80 || (g >= 38 && g < 39)) {
                motion = null;
            }
        }

        const axisWords = words.filter((w) => 'XYZ'.includes(w.letter));
        const hasAxis = axisWords.length > 0;
        const isProbe = gValues.some((g) => g >= 38 && g < 39);
        const isMachineCoords = gValues.includes(53);
        const isNonModalAxis = gValues.some((g) =>
            AXIS_CONSUMING_NON_MODAL.includes(g),
        );

        if (!hasAxis) {
            output.push(originalLine);
            continue;
        }

        if (isProbe || isMachineCoords || isNonModalAxis) {
            // Position after these commands is not known in work coordinates
            output.push(originalLine);
            pos.x = pos.y = pos.z = NaN;
            out.x = out.y = out.z = NaN;
            if (isNonModalAxis && gValues.some((g) => g === 92 || g === 10)) {
                warnings.add(
                    'Program changes work offsets (G10/G92); compensation after that point assumes the new coordinates match the height map.',
                );
            }
            continue;
        }

        if (motion === null) {
            output.push(originalLine);
            continue;
        }

        // The emitted program may leave a different motion mode active than
        // the source (arcs become G1), so pass-through moves get an explicit one.
        const hasMotionWord = gValues.some((g) => MOTION_CODES.includes(g));
        const withMotionWord = (line: string) =>
            hasMotionWord ? line : `G${motion} ${line.trim()}`;

        // Compute target in mm
        const start: Vec = { ...pos };
        const target: Vec = { ...pos };
        const specified = { x: false, y: false, z: false };
        for (const w of axisWords) {
            const axis = w.letter.toLowerCase() as Axis;
            const mm = w.value * scale();
            specified[axis] = true;
            target[axis] = absolute ? mm : start[axis] + mm;
        }

        // Words to keep: modal G codes (except motion), feed, spindle, etc.
        const prefix = gWords
            .filter((w) => !MOTION_CODES.includes(gCode(w.value)))
            .map((w) => w.raw);
        const suffix = words
            .filter(
                (w) =>
                    !'GXYZIJKRN'.includes(w.letter) &&
                    !(w.letter === 'P' && (motion === 2 || motion === 3)),
            )
            .map((w) => w.raw);

        const xyKnown =
            Number.isFinite(start.x) &&
            Number.isFinite(start.y) &&
            Number.isFinite(target.x) &&
            Number.isFinite(target.y);

        if (!xyKnown || !Number.isFinite(target.z)) {
            // Cannot compensate without a full position; pass it through
            output.push(withMotionWord(originalLine));
            (['x', 'y', 'z'] as Axis[]).forEach((axis) => {
                if (specified[axis]) {
                    out[axis] = absolute
                        ? target[axis]
                        : out[axis] + (target[axis] - start[axis]);
                }
            });
            Object.assign(pos, target);
            continue;
        }

        const isArc = motion === 2 || motion === 3;

        if (isArc && plane !== 17) {
            warnings.add(
                'Arcs outside the XY plane (G18/G19) are not compensated.',
            );
            output.push(withMotionWord(originalLine));
            (['x', 'y', 'z'] as Axis[]).forEach((axis) => {
                out[axis] = absolute
                    ? target[axis]
                    : out[axis] + (target[axis] - start[axis]);
            });
            Object.assign(pos, target);
            continue;
        }

        // Relative moves are emitted as deltas from the machine position; once
        // that is unknown (after an arc that could not be read) they can only
        // be passed through, or they would come out as X NaN
        if (!absolute && !(['x', 'y', 'z'] as Axis[]).every((axis) => Number.isFinite(out[axis]))) {
            warnings.add('Relative (G91) moves after an unreadable arc are not compensated.');
            output.push(withMotionWord(originalLine));
            Object.assign(pos, target);
            continue;
        }

        const segmentPoints: Vec[] = [];

        if (isArc) {
            const arc = linearizeArc(
                start,
                target,
                words,
                motion === 2,
                arcAbsolute,
                scale(),
                segmentLength,
            );
            if (!arc) {
                warnings.add('An arc with invalid parameters was left as is.');
                output.push(withMotionWord(originalLine));
                out.x = out.y = out.z = NaN;
                Object.assign(pos, target);
                continue;
            }
            if (words.some((w) => w.letter === 'P' && w.value > 1)) {
                warnings.add('Multi-turn arcs (P word) are not supported.');
            }
            arcsLinearized++;
            segmentPoints.push(...arc);
        } else if (motion === 1) {
            const dx = target.x - start.x;
            const dy = target.y - start.y;
            const dz = Number.isFinite(start.z) ? target.z - start.z : 0;
            const length = Math.hypot(dx, dy);
            const count = Math.max(1, Math.ceil(length / segmentLength - 1e-9));
            for (let i = 1; i <= count; i++) {
                const t = i / count;
                segmentPoints.push({
                    x: start.x + dx * t,
                    y: start.y + dy * t,
                    z: Number.isFinite(start.z) ? start.z + dz * t : target.z,
                });
            }
        } else {
            segmentPoints.push({ ...target });
        }

        const motionWord = isArc ? 'G1' : `G${motion}`;
        segmentPoints.forEach((p, index) => {
            const compensated = { ...p, z: p.z + offsetAt(p.x, p.y) };
            const first = index === 0;
            const fullAxes = {
                x: isArc || motion === 1 || specified.x,
                y: isArc || motion === 1 || specified.y,
                z: true,
            };
            emitMove(
                motionWord,
                compensated,
                fullAxes,
                first ? prefix : [],
                first ? suffix : [],
                first ? comment : '',
            );
        });
        movesCompensated++;
        Object.assign(pos, target);
    }

    if (pointsOutsideMap > 0) {
        warnings.add(
            `${pointsOutsideMap} point(s) of the toolpath are outside the probed area; the nearest edge of the map was used for them.`,
        );
    }

    return {
        gcode: output.join('\n'),
        stats: {
            linesIn: lines.length,
            linesOut: output.length,
            movesCompensated,
            arcsLinearized,
            pointsOutsideMap,
            minOffset: Number.isFinite(minOffset) ? minOffset : 0,
            maxOffset: Number.isFinite(maxOffset) ? maxOffset : 0,
            warnings: [...warnings],
        },
    };
};

/**
 * Converts an XY arc into points (excluding the start point, including the end).
 * Returns null when the arc is not valid.
 */
export const linearizeArc = (
    start: Vec,
    end: Vec,
    words: Word[],
    clockwise: boolean,
    arcAbsolute: boolean,
    scale: number,
    segmentLength: number,
): Vec[] | null => {
    const get = (letter: string) => {
        const w = words.find((word) => word.letter === letter);
        return w ? w.value * scale : undefined;
    };
    const i = get('I');
    const j = get('J');
    const r = get('R');

    let cx: number;
    let cy: number;

    if (i !== undefined || j !== undefined) {
        cx = arcAbsolute ? (i ?? start.x) : start.x + (i ?? 0);
        cy = arcAbsolute ? (j ?? start.y) : start.y + (j ?? 0);
    } else if (r !== undefined) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const d = Math.hypot(dx, dy);
        if (d === 0) {
            return null;
        }
        const radius = Math.abs(r);
        const h2 = radius * radius - (d * d) / 4;
        const h = h2 > 0 ? Math.sqrt(h2) : 0;
        // Choose the centre side from direction and sign of R (per NIST RS274)
        let sign = clockwise ? -1 : 1;
        if (r < 0) {
            sign = -sign;
        }
        const mx = start.x + dx / 2;
        const my = start.y + dy / 2;
        cx = mx - (sign * h * dy) / d;
        cy = my + (sign * h * dx) / d;
    } else {
        return null;
    }

    const radius = Math.hypot(start.x - cx, start.y - cy);
    if (!(radius > 0)) {
        return null;
    }

    const a0 = Math.atan2(start.y - cy, start.x - cx);
    const a1 = Math.atan2(end.y - cy, end.x - cx);
    let sweep = a1 - a0;
    if (clockwise) {
        if (sweep >= -1e-9) {
            sweep -= 2 * Math.PI;
        }
    } else if (sweep <= 1e-9) {
        sweep += 2 * Math.PI;
    }

    const arcLength = Math.abs(sweep) * radius;
    const count = Math.max(
        1,
        Math.ceil(arcLength / segmentLength),
        Math.ceil(Math.abs(sweep) / (Math.PI / 18)), // at most 10 degrees
    );
    const startZ = Number.isFinite(start.z) ? start.z : end.z;
    const dz = end.z - startZ;

    const points: Vec[] = [];
    for (let n = 1; n <= count; n++) {
        const t = n / count;
        if (n === count) {
            points.push({ x: end.x, y: end.y, z: end.z });
            break;
        }
        const angle = a0 + sweep * t;
        points.push({
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
            z: startZ + dz * t,
        });
    }
    return points;
};
