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

export const loadHeightMapState = (): HeightMapWidgetState => {
    const saved = config.get('', {}) as Partial<HeightMapWidgetState>;
    const maps: HeightMap[] = [];
    for (const raw of saved.maps || []) {
        try {
            maps.push(parseHeightMap(raw));
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

export const saveHeightMapState = (state: HeightMapWidgetState) => {
    config.set('', {
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
