import WidgetConfig from 'app/features/WidgetConfig/WidgetConfig';
import { HeightMap, HeightMapWidgetState } from '../definitions';
import { parseHeightMap } from './heightMap';

export const DEFAULT_HEIGHT_MAP_STATE: HeightMapWidgetState = {
    grid: {
        xStart: 0,
        yStart: 0,
        width: 100,
        length: 80,
        xPoints: 6,
        yPoints: 5,
    },
    probe: {
        clearanceZ: 2,
        probeMinZ: -2,
        probeFeed: 100,
        probeFeedSlow: 20,
        retract: 0.5,
    },
    apply: {
        segmentLength: 1,
        referenceMode: 'absolute',
        refX: 0,
        refY: 0,
    },
    maps: [],
    activeMapId: null,
};

const config = new WidgetConfig('heightmap');

// JSON cannot store NaN (unprobed points), keep them as null on disk
const serializeMap = (map: HeightMap) => ({
    ...map,
    z: map.z.map((row) => row.map((v) => (Number.isFinite(v) ? v : null))),
});

/**
 * Up to 1.0.13 the map list was saved with a deep merge, which left the tail
 * of longer rows (and extra rows) of the previous first map in a new map.
 * The leading values are the real ones, so such a map is cut back to its grid.
 */
export const trimToGrid = (raw: any) => {
    const grid = raw?.grid;
    if (!grid || !Array.isArray(raw.z)) return raw;
    const { xPoints, yPoints } = grid;
    const fits =
        raw.z.length >= yPoints &&
        raw.z.slice(0, yPoints).every((row: unknown) => Array.isArray(row) && row.length >= xPoints);
    if (!fits) return raw;
    return { ...raw, z: raw.z.slice(0, yPoints).map((row: unknown[]) => row.slice(0, xPoints)) };
};

export const loadHeightMapState = (): HeightMapWidgetState => {
    const saved = config.get('', {}) as Partial<HeightMapWidgetState>;
    const maps: HeightMap[] = [];
    for (const raw of saved.maps || []) {
        try {
            maps.push(parseHeightMap(trimToGrid(raw)));
        } catch {
            // ignore broken entries
        }
    }
    return {
        grid: { ...DEFAULT_HEIGHT_MAP_STATE.grid, ...saved.grid },
        probe: { ...DEFAULT_HEIGHT_MAP_STATE.probe, ...saved.probe },
        apply: { ...DEFAULT_HEIGHT_MAP_STATE.apply, ...saved.apply },
        maps,
        activeMapId: saved.activeMapId ?? null,
    };
};

// replace, not set: set deep-merges arrays by index, so a new map at index 0
// would keep the tail of the longer rows of the previous first map (and the
// map is then dropped on load as not matching its grid), and a shorter list
// could never remove a deleted map
export const saveHeightMapState = (state: HeightMapWidgetState) => {
    config.replace('', {
        ...state,
        maps: state.maps.map(serializeMap),
    });
};

export const exportHeightMap = (map: HeightMap) => {
    const blob = new Blob([JSON.stringify(serializeMap(map), null, 2)], {
        type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeName = map.name.replace(/[^\w.-]+/g, '_') || 'heightmap';
    link.setAttribute('download', `${safeName}.heightmap.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

export const importHeightMap = (file: File): Promise<HeightMap> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const map = parseHeightMap(JSON.parse(String(reader.result)));
                resolve({ ...map, id: `hm-${Date.now()}` });
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
