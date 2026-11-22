jest.mock('app/store', () => {
    const ImmutableStore = jest.requireActual('app/lib/immutable-store').default;
    return { __esModule: true, default: new ImmutableStore({}) };
});

import { HeightMap } from '../definitions';
import { DEFAULT_HEIGHT_MAP_STATE, loadHeightMapState, saveHeightMapState, trimToGrid } from '../utils/storage';

const makeMap = (id: string, xPoints: number, yPoints: number, base: number): HeightMap => ({
    id,
    name: id,
    createdAt: '2026-11-22T00:00:00.000Z',
    grid: { xStart: 0, yStart: 0, width: 10 * (xPoints - 1), length: 10 * (yPoints - 1), xPoints, yPoints },
    z: Array.from({ length: yPoints }, (_, r) => Array.from({ length: xPoints }, (_, c) => base + r * 0.01 + c * 0.001)),
    wcs: 'G54',
});

describe('height map storage', () => {
    it('keeps a new map intact when the previous first map had longer rows', () => {
        const old = makeMap('old', 7, 3, 1);
        saveHeightMapState({ ...DEFAULT_HEIGHT_MAP_STATE, maps: [old], activeMapId: old.id });
        const fresh = makeMap('new', 6, 6, 2);
        saveHeightMapState({ ...loadHeightMapState(), maps: [fresh, old], activeMapId: fresh.id });

        const loaded = loadHeightMapState();
        expect(loaded.maps.map((m) => m.id)).toEqual(['new', 'old']);
        expect(loaded.maps[0].z).toEqual(fresh.z);
        expect(loaded.maps[1].z).toEqual(old.z);
        expect(loaded.activeMapId).toBe('new');
    });

    it('removes a deleted map for good', () => {
        const a = makeMap('a', 3, 3, 1);
        const b = makeMap('b', 3, 3, 2);
        saveHeightMapState({ ...DEFAULT_HEIGHT_MAP_STATE, maps: [a, b], activeMapId: a.id });
        saveHeightMapState({ ...loadHeightMapState(), maps: [b], activeMapId: b.id });
        expect(loadHeightMapState().maps.map((m) => m.id)).toEqual(['b']);
    });

    it('repairs a map saved with the tail of the previous rows', () => {
        const fresh = makeMap('new', 6, 6, 2);
        const damaged = {
            ...fresh,
            z: fresh.z.map((row, r) => (r < 3 ? [...row, -0.037] : row)),
        };
        expect(trimToGrid(damaged).z).toEqual(fresh.z);
        // a map that is really missing values is left for the validator to reject
        const short = { ...fresh, z: fresh.z.slice(0, 5) };
        expect(trimToGrid(short)).toBe(short);
    });
});
