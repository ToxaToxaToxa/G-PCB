jest.mock('app/lib/controller', () => ({ __esModule: true, default: { addListener: jest.fn() } }));
jest.mock('app/store/redux', () => ({ __esModule: true, default: { getState: () => ({ file: { name: null } }) } }));

import defaultState from 'app/store/defaultState';
import { HeightMap } from 'app/features/HeightMap/definitions';

import { DEFAULT_WIZARD_SETTINGS } from '../lib/defaults';
import { PlannedOperation } from '../lib/plan';
import { buildProgram, hashText, keepResults } from '../lib/programs';

const op = (id: string, kind: PlannedOperation['kind'], gcode: string): PlannedOperation => ({
    id,
    stage: kind === 'drill' ? 'drill' : kind,
    kind,
    name: id,
    tool: id,
    gcode,
    paths: [],
    points: [],
    stats: { lines: 0, cutLength: 0, estimatedMinutes: 1 },
    warnings: [],
});

// copper 0.1 mm higher towards +X
const map: HeightMap = {
    id: 'hm-1',
    name: 'test',
    createdAt: '2026-09-27T00:00:00Z',
    grid: { xStart: 0, yStart: 0, width: 10, length: 10, xPoints: 2, yPoints: 2 },
    z: [
        [0, 0.1],
        [0, 0.1],
    ],
};

const isolation = op('isolation-top', 'isolation', ['G90 G21', 'G0 X0 Y0 Z1', 'G1 Z-0.05 F30', 'G1 X10 F120'].join('\n'));

describe('programs', () => {
    it('follows the map for isolation only, relative to the reference point', () => {
        const flat = buildProgram(isolation, null, { x: 0, y: 0 });
        expect(flat.gcode).toBe(isolation.gcode);

        const leveled = buildProgram(isolation, map, { x: 0, y: 0 });
        expect(leveled.gcode).not.toBe(isolation.gcode);
        expect(leveled.gcode.split('\n').pop()).toMatch(/Z0\.05/);
        expect(leveled.hash).not.toBe(flat.hash);

        const drill = op('drill-0.8', 'drill', 'G0 X20 Y20\nG1 Z-1.9 F50');
        expect(buildProgram(drill, map, { x: 0, y: 0 }).gcode).toBe(drill.gcode);
    });

    it('reports toolpath points outside the probed area', () => {
        const wide = op('isolation-top', 'isolation', ['G90 G21', 'G0 X0 Y0 Z1', 'G1 Z-0.05 F30', 'G1 X30 F120'].join('\n'));
        expect(buildProgram(wide, map, { x: 0, y: 0 }).warnings).toContainEqual(expect.stringMatching(/outside the probed area/));
    });

    it('tells programs apart by content', () => {
        expect(hashText('G1 X1')).toBe(hashText('G1 X1'));
        expect(hashText('G1 X1')).not.toBe(hashText('G1 X2'));
    });

    it('keeps "done" only for programs that did not change', () => {
        const before = [isolation, op('outline', 'outline', 'G1 X1')];
        const after = [isolation, op('outline', 'outline', 'G1 X2')];
        expect(keepResults(before, after, { 'isolation-top': 'done', outline: 'done' })).toEqual({ 'isolation-top': 'done' });
    });
});

describe('settings', () => {
    it('survive a restart: the store keeps only widgets that have defaults', () => {
        expect((defaultState.widgets as Record<string, unknown>).pcbWizard).toEqual(DEFAULT_WIZARD_SETTINGS);
    });
});
