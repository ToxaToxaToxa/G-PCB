import { act, renderHook } from '@testing-library/react';

const listeners: Record<string, Function[]> = {};
const commands: unknown[][] = [];

jest.mock('app/lib/controller', () => ({
    __esModule: true,
    default: {
        addListener: (event: string, fn: Function) => {
            (listeners[event] ||= []).push(fn);
            return true;
        },
        removeListener: (event: string, fn: Function) => {
            listeners[event] = (listeners[event] || []).filter((l) => l !== fn);
            return true;
        },
        command: (...args: unknown[]) => commands.push(args),
    },
}));

const controllerState = {
    // WCO = (10, 20, -30): work X0 Y0 Z0 is machine X10 Y20 Z-30
    mpos: { x: 10, y: 20, z: -28 },
    wpos: { x: 0, y: 0, z: 2 },
    settings: { settings: { $13: '0' } },
    modal: { wcs: 'G55' },
};

jest.mock('app/store/redux', () => ({
    __esModule: true,
    default: { getState: () => ({ controller: controllerState }) },
}));

import { useHeightMapProbing } from '../useHeightMapProbing';

const grid = { xStart: 0, yStart: 0, width: 10, length: 10, xPoints: 2, yPoints: 2 };
const probe = { clearanceZ: 2, probeMinZ: -2, probeFeed: 100, probeFeedSlow: 20, retract: 0.5 };

const emit = (line: string) =>
    act(() => {
        (listeners['serialport:read'] || []).forEach((fn) => fn(line));
    });

const prb = (x: number, y: number, z: number, ok = 1) =>
    `[PRB:${(x + 10).toFixed(3)},${(y + 20).toFixed(3)},${(z - 30).toFixed(3)}:${ok}]`;

beforeEach(() => {
    Object.keys(listeners).forEach((k) => delete listeners[k]);
    commands.length = 0;
    controllerState.settings.settings.$13 = '0';
});

describe('useHeightMapProbing', () => {
    it('collects slow-touch results into work Z and completes the map', () => {
        const onComplete = jest.fn();
        const { result } = renderHook(() => useHeightMapProbing(onComplete));

        act(() => result.current.start(grid, probe));
        expect(commands[0][0]).toBe('gcode:safe');
        expect(commands[0][2]).toBe('G21');
        expect(result.current.status).toBe('running');

        const surface: Record<string, number> = { '0,0': 0.0, '10,0': 0.1, '10,10': 0.3, '0,10': 0.2 };
        for (const [key, z] of Object.entries(surface)) {
            const [x, y] = key.split(',').map(Number);
            emit(prb(x, y, z + 0.02)); // fast touch overshoots
            emit(prb(x, y, z)); // slow touch
            if (key === '10,0') {
                emit(prb(10, 0, z)); // stray $# report must not shift the map
            }
        }

        expect(onComplete).toHaveBeenCalledTimes(1);
        const map = onComplete.mock.calls[0][0];
        expect(map.z[0][0]).toBeCloseTo(0);
        expect(map.z[0][1]).toBeCloseTo(0.1);
        expect(map.z[1][0]).toBeCloseTo(0.2);
        expect(map.z[1][1]).toBeCloseTo(0.3);
        expect(map.wcs).toBe('G55');
        expect(result.current.status).toBe('done');
        expect(listeners['serialport:read']).toHaveLength(0);
    });

    it('converts inch reports ($13=1)', () => {
        controllerState.settings.settings.$13 = '1';
        const onComplete = jest.fn();
        const { result } = renderHook(() => useHeightMapProbing(onComplete));
        act(() => result.current.start(grid, { ...probe, probeFeedSlow: 0 }));
        const inch = (x: number, y: number, z: number) =>
            `[PRB:${((x + 10) / 25.4).toFixed(5)},${((y + 20) / 25.4).toFixed(5)},${((z - 30) / 25.4).toFixed(5)}:1]`;
        emit(inch(0, 0, 0.254));
        emit(inch(10, 0, 0));
        emit(inch(10, 10, 0));
        emit(inch(0, 10, 0));
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete.mock.calls[0][0].z[0][0]).toBeCloseTo(0.254, 3);
    });

    it('fails on a missed probe and on alarms', () => {
        const { result } = renderHook(() => useHeightMapProbing(jest.fn()));
        act(() => result.current.start(grid, probe));
        emit(prb(0, 0, 0, 0));
        expect(result.current.status).toBe('failed');

        act(() => result.current.start(grid, probe));
        emit('ALARM:4');
        expect(result.current.status).toBe('failed');
        expect(result.current.message).toContain('ALARM:4');
    });

    it('stops with a soft reset', () => {
        const { result } = renderHook(() => useHeightMapProbing(jest.fn()));
        act(() => result.current.start(grid, probe));
        act(() => result.current.stop());
        expect(commands[commands.length - 1]).toEqual(['reset']);
        expect(result.current.status).toBe('stopped');
    });
});
