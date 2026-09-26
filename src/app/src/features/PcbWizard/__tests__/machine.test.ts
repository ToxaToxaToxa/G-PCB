import pubsub from 'pubsub-js';

jest.mock('app/lib/controller', () => ({ __esModule: true, default: { addListener: jest.fn() } }));
jest.mock('app/store/redux', () => ({ __esModule: true, default: { getState: () => ({ file: { name: null } }) } }));

import { DEFAULT_WIZARD_SETTINGS } from '../lib/defaults';
import { bitKey, heightMapGrid, referencePoint, zeroZCommands } from '../lib/machine';
import { PlannedOperation } from '../lib/plan';
import { getSession, onJobStart, resetSession, updateSession } from '../lib/session';

const s = DEFAULT_WIZARD_SETTINGS;

const op = (id: string, stage: PlannedOperation['stage'], paths: [number, number][][] = []): PlannedOperation => ({
    id,
    stage,
    kind: stage === 'drill' ? 'drill' : stage,
    name: id,
    tool: id,
    gcode: '',
    paths,
    points: [],
    stats: { lines: 0, cutLength: 0, estimatedMinutes: 1 },
    warnings: [],
});

describe('Z0 probing', () => {
    it('raises, moves to the reference point, probes twice and sets Z0', () => {
        const cmds = zeroZCommands(s.probe, { x: 4, y: 5.5 });
        expect(cmds).toEqual([
            '(PCB wizard: probe Z0)',
            'G21 G90',
            'G91 G0 Z5',
            'G90',
            'G0 X4 Y5.5',
            'G91',
            'G38.2 Z-25 F100',
            'G0 Z1',
            'G38.2 Z-2 F20',
            'G90',
            'G10 L20 P0 Z0',
            'G0 Z2',
        ]);
    });

    it('probes in place with one touch and a touch plate', () => {
        const cmds = zeroZCommands({ ...s.probe, slowFeed: 0, plateThickness: 0.5 });
        expect(cmds).not.toContainEqual(expect.stringMatching(/^G0 X/));
        expect(cmds.filter((c) => c.startsWith('G38.2'))).toHaveLength(1);
        expect(cmds).toContain('G10 L20 P0 Z0.5');
    });
});

describe('height map grid', () => {
    it('covers the isolation paths with a border, inside the blank', () => {
        const ops = [op('isolation-top', 'isolation', [[[0.5, 3], [40, 3], [40, 30]]]), op('outline', 'outline', [[[0, 0], [99, 69]]])];
        const grid = heightMapGrid(ops, s)!;
        expect(grid.xStart).toBe(0);
        expect(grid.yStart).toBe(2);
        expect(grid.width).toBeCloseTo(41, 6);
        expect(grid.length).toBeCloseTo(29, 6);
        expect([grid.xPoints, grid.yPoints]).toEqual([6, 4]);
        expect(referencePoint(grid)).toEqual({ x: 0, y: 2 });
        expect(heightMapGrid([op('outline', 'outline')], s)).toBeNull();
    });
});

describe('bit changes', () => {
    it('asks for a new bit only when the stage uses another one', () => {
        const same = { ...s, outline: { ...s.outline, toolId: 'em-1' }, holes: { ...s.holes, toolId: 'em-1' } };
        expect(bitKey(op('holes', 'holes'), same)).toBe(bitKey(op('outline', 'outline'), same));
        expect(bitKey(op('drill-0.8', 'drill'), s)).not.toBe(bitKey(op('drill-1', 'drill'), s));
        expect(bitKey(op('isolation-top', 'isolation'), s)).toBe('tool:v60-0.1');
    });
});

describe('session', () => {
    beforeEach(resetSession);

    it('records how the running program ended', () => {
        updateSession({ runningId: 'isolation-top' });
        pubsub.publishSync('job:end', { status: { finishTime: 1234 } });
        expect(getSession().results).toEqual({ 'isolation-top': 'done' });
        expect(getSession().runningId).toBeNull();

        updateSession({ runningId: 'outline' });
        pubsub.publishSync('job:end', { status: { finishTime: 0 } });
        expect(getSession().results.outline).toBe('stopped');

        // a job the wizard did not start is ignored
        pubsub.publishSync('job:end', { status: { finishTime: 99 } });
        expect(Object.keys(getSession().results)).toHaveLength(2);
    });

    it('tracks its programs however they were started', () => {
        updateSession({ projectName: 'pcb', ops: [op('isolation-top', 'isolation'), op('outline', 'outline')] });
        onJobStart('pcb_02_outline.nc');
        expect(getSession().runningId).toBe('outline');
        pubsub.publishSync('job:end', { status: { finishTime: 1 } });
        expect(getSession().results.outline).toBe('done');

        // some other file started on the Carve screen
        onJobStart('bracket.nc');
        expect(getSession().runningId).toBeNull();
    });
});
