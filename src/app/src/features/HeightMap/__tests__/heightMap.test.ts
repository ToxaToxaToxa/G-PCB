import {
    getProbeOrder,
    interpolateZ,
    parseHeightMap,
    validateGrid,
} from '../utils/heightMap';
import {
    buildProbeProgram,
    parsePrbLine,
    touchesPerPoint,
} from '../utils/probing';
import { applyHeightMap } from '../utils/applyHeightMap';
import { HeightMap, HeightMapProbeConfig } from '../definitions';

const grid = {
    xStart: 0,
    yStart: 0,
    width: 100,
    length: 50,
    xPoints: 3,
    yPoints: 2,
};

// Plane z = 0.001 * x + 0.002 * y
const planeMap: Pick<HeightMap, 'grid' | 'z'> = {
    grid,
    z: [
        [0, 0.05, 0.1],
        [0.1, 0.15, 0.2],
    ],
};

const probe: HeightMapProbeConfig = {
    clearanceZ: 2,
    probeMinZ: -1,
    probeFeed: 100,
    probeFeedSlow: 20,
    retract: 0.5,
};

const moveWords = (line: string) => {
    const r: Record<string, number> = {};
    for (const m of line.matchAll(/([XYZ])(-?[\d.]+)/g)) {
        r[m[1]] = Number(m[2]);
    }
    return r;
};

describe('height map grid', () => {
    it('validates grid parameters', () => {
        expect(validateGrid(grid)).toEqual([]);
        expect(validateGrid({ ...grid, xPoints: 1 }).length).toBe(1);
        expect(validateGrid({ ...grid, width: 0 }).length).toBe(1);
    });

    it('orders probe points in a serpentine', () => {
        const order = getProbeOrder(grid).map((p) => [p.x, p.y]);
        expect(order).toEqual([
            [0, 0],
            [50, 0],
            [100, 0],
            [100, 50],
            [50, 50],
            [0, 50],
        ]);
    });

    it('interpolates bilinearly and clamps outside the map', () => {
        expect(interpolateZ(planeMap, 0, 0)).toBeCloseTo(0);
        expect(interpolateZ(planeMap, 25, 25)).toBeCloseTo(0.075);
        expect(interpolateZ(planeMap, 100, 50)).toBeCloseTo(0.2);
        expect(interpolateZ(planeMap, 75, 10)).toBeCloseTo(0.095);
        expect(interpolateZ(planeMap, -20, -20)).toBeCloseTo(0);
        expect(interpolateZ(planeMap, 200, 200)).toBeCloseTo(0.2);
    });

    it('parses saved maps and rejects invalid ones', () => {
        const json = JSON.parse(
            JSON.stringify({ id: 'a', name: 'n', grid, z: planeMap.z }),
        );
        expect(parseHeightMap(json).z[1][2]).toBe(0.2);
        expect(() => parseHeightMap({ grid, z: [[1, 2, 3]] })).toThrow();
        expect(() => parseHeightMap(null)).toThrow();
    });
});

describe('probing', () => {
    it('builds a probing program with two touches per point', () => {
        const { commands, points } = buildProbeProgram(grid, probe);
        expect(points).toHaveLength(6);
        expect(touchesPerPoint(probe)).toBe(2);
        expect(commands.filter((c) => c.includes('G38.2'))).toHaveLength(12);
        expect(commands).toContain('G38.2 Z-1 F100');
        expect(commands).toContain('G90 G38.2 Z-1 F20');
        expect(commands).toContain('G0 X100 Y50');
    });

    it('uses a single touch when the slow feed is 0', () => {
        const { commands } = buildProbeProgram(grid, {
            ...probe,
            probeFeedSlow: 0,
        });
        expect(commands.filter((c) => c.includes('G38.2'))).toHaveLength(6);
        expect(touchesPerPoint({ ...probe, probeFeedSlow: 0 })).toBe(1);
    });

    it('parses PRB reports from Grbl and grblHAL', () => {
        expect(parsePrbLine('[PRB:1.000,2.000,-3.250:1]')).toEqual({
            x: 1,
            y: 2,
            z: -3.25,
            success: true,
        });
        expect(parsePrbLine('[PRB:1.000,2.000,-3.250,0.000:0]')?.success).toBe(
            false,
        );
        expect(parsePrbLine('ok')).toBeNull();
    });
});

describe('applyHeightMap', () => {
    it('splits linear moves and adds the surface offset', () => {
        const input = ['G21 G90', 'G0 X0 Y0 Z1', 'G1 Z-0.1 F100', 'G1 X10 Y0'].join('\n');
        const { gcode, stats } = applyHeightMap(input, planeMap, {
            segmentLength: 2,
        });
        const lines = gcode.split('\n');
        const cut = lines.filter((l) => l.startsWith('G1'));
        // plunge + 5 segments
        expect(cut).toHaveLength(6);
        const last = moveWords(cut[cut.length - 1]);
        expect(last.X).toBeCloseTo(10);
        expect(last.Z).toBeCloseTo(-0.1 + 0.01);
        expect(cut[0]).toContain('F100');
        expect(stats.pointsOutsideMap).toBe(0);
        expect(stats.maxOffset).toBeCloseTo(0.01);
    });

    it('uses a reference point when Z was zeroed elsewhere', () => {
        const input = 'G90\nG0 X100 Y50 Z0';
        const { gcode } = applyHeightMap(input, planeMap, {
            referenceMode: 'point',
            refX: 100,
            refY: 50,
        });
        expect(moveWords(gcode.split('\n')[1]).Z).toBeCloseTo(0);
    });

    it('linearizes arcs and ends exactly at the arc end point', () => {
        const input = ['G90 G17', 'G0 X10 Y0 Z0', 'G2 X0 Y-10 I-10 J0 F200'].join('\n');
        const { gcode, stats } = applyHeightMap(input, planeMap, {
            segmentLength: 1,
        });
        expect(stats.arcsLinearized).toBe(1);
        const lines = gcode.split('\n').filter((l) => l.startsWith('G1'));
        // quarter circle of radius 10 is ~15.7mm long
        expect(lines.length).toBeGreaterThanOrEqual(16);
        const end = moveWords(lines[lines.length - 1]);
        expect(end.X).toBeCloseTo(0);
        expect(end.Y).toBeCloseTo(-10);
        // all points stay on the circle, clockwise from +X to -Y
        for (const line of lines) {
            const w = moveWords(line);
            expect(Math.hypot(w.X, w.Y)).toBeCloseTo(10, 1);
            expect(w.Y).toBeLessThanOrEqual(0.0001);
        }
        // the point outside the map is reported
        expect(stats.pointsOutsideMap).toBeGreaterThan(0);
    });

    it('handles R arcs on the correct side', () => {
        const input = ['G90', 'G0 X0 Y0 Z0', 'G2 X20 Y0 R10'].join('\n');
        const { gcode } = applyHeightMap(input, planeMap);
        const ys = gcode
            .split('\n')
            .filter((l) => l.startsWith('G1'))
            .map((l) => moveWords(l).Y);
        // CW from (0,0) to (20,0) with R10 goes over the top (positive Y)
        expect(Math.max(...ys)).toBeCloseTo(10, 1);
    });

    it('keeps inch units and relative mode consistent', () => {
        const input = ['G20 G91', 'G0 X1 Y1 Z0', 'G1 X1'].join('\n');
        // position is unknown at the start, the first relative move passes through
        const result = applyHeightMap(
            ['G20 G90', 'G0 X0 Y0 Z0', 'G91', 'G1 X1'].join('\n'),
            planeMap,
            { segmentLength: 25.4 },
        );
        const lines = result.gcode.split('\n');
        const rel = moveWords(lines[3]);
        expect(rel.X).toBeCloseTo(1, 4);
        // 25.4mm along X -> offset 0.0254mm = 0.001 inch, relative to Z at start
        expect(rel.Z).toBeCloseTo(0.001, 4);
        expect(applyHeightMap(input, planeMap).gcode.split('\n')[1]).toBe(
            'G0 X1 Y1 Z0',
        );
    });

    it('passes through comments, spindle and tool change lines', () => {
        const input = ['(header)', 'M3 S10000', 'T2 M6', '; done', 'M30'].join('\n');
        expect(applyHeightMap(input, planeMap).gcode).toBe(input);
    });

    it('keeps modal arcs working after linearized arcs', () => {
        const input = ['G90', 'G0 X0 Y0 Z0', 'G2 X20 Y0 R10', 'X40 Y0 R10', 'X50 Y0'].join('\n');
        const { gcode, stats } = applyHeightMap(input, planeMap);
        expect(stats.arcsLinearized).toBe(2);
        const lines = gcode.split('\n');
        // invalid modal arc without I/J/R keeps an explicit G2 word
        expect(lines[lines.length - 1]).toBe('G2 X50 Y0');
        expect(lines.every((l) => !/^[XYZ]/.test(l))).toBe(true);
    });

    it('never emits NaN in relative mode after an unreadable arc', () => {
        const input = ['G90', 'G0 X0 Y0 Z0', 'G91', 'G2 X10 Y0', 'G1 X5 Y5'].join('\n');
        const { gcode, stats } = applyHeightMap(input, planeMap);
        expect(gcode).not.toMatch(/NaN/);
        expect(gcode.split('\n').pop()).toBe('G1 X5 Y5');
        expect(stats.warnings).toContainEqual(expect.stringMatching(/not compensated/));
    });
});
