import {
    HeightMap,
    HeightMapGridConfig,
    HeightMapPoint,
} from '../definitions';

export interface GridPoint {
    row: number;
    col: number;
    x: number;
    y: number;
}

const round = (value: number, digits = 4) => {
    const f = 10 ** digits;
    return Math.round(value * f) / f;
};

export const validateGrid = (grid: HeightMapGridConfig): string[] => {
    const errors: string[] = [];
    if (!Number.isFinite(grid.width) || grid.width <= 0) {
        errors.push('Width must be greater than 0');
    }
    if (!Number.isFinite(grid.length) || grid.length <= 0) {
        errors.push('Length must be greater than 0');
    }
    if (!Number.isInteger(grid.xPoints) || grid.xPoints < 2) {
        errors.push('X points must be a whole number of at least 2');
    }
    if (!Number.isInteger(grid.yPoints) || grid.yPoints < 2) {
        errors.push('Y points must be a whole number of at least 2');
    }
    if (grid.xPoints * grid.yPoints > 2500) {
        errors.push('Too many probe points (max 2500)');
    }
    return errors;
};

export const getStepX = (grid: HeightMapGridConfig) =>
    grid.width / (grid.xPoints - 1);
export const getStepY = (grid: HeightMapGridConfig) =>
    grid.length / (grid.yPoints - 1);

/**
 * Returns all grid points in serpentine (boustrophedon) order, which keeps
 * travel between probe points short.
 */
export const getProbeOrder = (grid: HeightMapGridConfig): GridPoint[] => {
    const points: GridPoint[] = [];
    const stepX = getStepX(grid);
    const stepY = getStepY(grid);

    for (let row = 0; row < grid.yPoints; row++) {
        const cols = [...Array(grid.xPoints).keys()];
        if (row % 2 === 1) {
            cols.reverse();
        }
        for (const col of cols) {
            points.push({
                row,
                col,
                x: round(grid.xStart + col * stepX),
                y: round(grid.yStart + row * stepY),
            });
        }
    }
    return points;
};

export const createEmptyZ = (grid: HeightMapGridConfig): number[][] =>
    Array.from({ length: grid.yPoints }, () =>
        Array.from({ length: grid.xPoints }, () => NaN),
    );

export const isMapComplete = (map: Pick<HeightMap, 'z'>) =>
    map.z.length > 0 &&
    map.z.every((row) => row.length > 0 && row.every(Number.isFinite));

const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);

/**
 * Returns true when (x, y) lies inside the probed area (with a small tolerance).
 */
export const isInsideMap = (
    grid: HeightMapGridConfig,
    x: number,
    y: number,
    tolerance = 0.001,
) =>
    x >= grid.xStart - tolerance &&
    x <= grid.xStart + grid.width + tolerance &&
    y >= grid.yStart - tolerance &&
    y <= grid.yStart + grid.length + tolerance;

/**
 * Bilinear interpolation of the probed surface at work (x, y), in mm.
 * Points outside the probed area are clamped to the nearest edge.
 */
export const interpolateZ = (
    map: Pick<HeightMap, 'grid' | 'z'>,
    x: number,
    y: number,
): number => {
    const { grid, z } = map;
    const stepX = getStepX(grid);
    const stepY = getStepY(grid);

    const fx = clamp((x - grid.xStart) / stepX, 0, grid.xPoints - 1);
    const fy = clamp((y - grid.yStart) / stepY, 0, grid.yPoints - 1);

    const c0 = Math.min(Math.floor(fx), grid.xPoints - 2);
    const r0 = Math.min(Math.floor(fy), grid.yPoints - 2);
    const tx = fx - c0;
    const ty = fy - r0;

    const z00 = z[r0][c0];
    const z01 = z[r0][c0 + 1];
    const z10 = z[r0 + 1][c0];
    const z11 = z[r0 + 1][c0 + 1];

    const bottom = z00 + (z01 - z00) * tx;
    const top = z10 + (z11 - z10) * tx;
    return bottom + (top - bottom) * ty;
};

export const getMapStats = (map: Pick<HeightMap, 'z'>) => {
    const values = map.z.flat().filter(Number.isFinite);
    if (values.length === 0) {
        return { min: 0, max: 0, range: 0, mean: 0, count: 0 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
        min: round(min),
        max: round(max),
        range: round(max - min),
        mean: round(mean),
        count: values.length,
    };
};

export const mapToPoints = (map: HeightMap): HeightMapPoint[] => {
    const stepX = getStepX(map.grid);
    const stepY = getStepY(map.grid);
    const points: HeightMapPoint[] = [];
    map.z.forEach((row, r) =>
        row.forEach((value, c) =>
            points.push({
                x: round(map.grid.xStart + c * stepX),
                y: round(map.grid.yStart + r * stepY),
                z: value,
            }),
        ),
    );
    return points;
};

/**
 * Validates an object loaded from disk / storage and returns a HeightMap or
 * throws with a readable message.
 */
export const parseHeightMap = (data: unknown): HeightMap => {
    const map = data as HeightMap;
    if (!map || typeof map !== 'object') {
        throw new Error('File does not contain a height map');
    }
    if (!map.grid || !Array.isArray(map.z)) {
        throw new Error('Height map is missing "grid" or "z"');
    }
    const errors = validateGrid(map.grid);
    if (errors.length) {
        throw new Error(errors.join(', '));
    }
    if (
        map.z.length !== map.grid.yPoints ||
        map.z.some(
            (row) => !Array.isArray(row) || row.length !== map.grid.xPoints,
        )
    ) {
        throw new Error('Height map size does not match its grid');
    }
    const z = map.z.map((row) => row.map((v) => (v === null ? NaN : Number(v))));
    return {
        id: map.id || `hm-${Date.now()}`,
        name: map.name || 'Imported height map',
        createdAt: map.createdAt || new Date().toISOString(),
        grid: { ...map.grid },
        z,
        wcs: map.wcs,
        notes: map.notes,
    };
};
