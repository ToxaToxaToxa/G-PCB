/**
 * Z height map (auto-levelling) definitions.
 *
 * All linear values are stored in millimetres and work coordinates,
 * regardless of the workspace units selected in gSender.
 */

export interface HeightMapGridConfig {
    /** Work X of the first (lower-left) probe point, mm */
    xStart: number;
    /** Work Y of the first (lower-left) probe point, mm */
    yStart: number;
    /** Size of the probed area along X, mm */
    width: number;
    /** Size of the probed area along Y, mm */
    length: number;
    /** Number of probe points along X (>= 2) */
    xPoints: number;
    /** Number of probe points along Y (>= 2) */
    yPoints: number;
}

export interface HeightMapProbeConfig {
    /** Work Z to travel at between probe points, mm */
    clearanceZ: number;
    /** Lowest work Z the probe is allowed to reach before failing, mm */
    probeMinZ: number;
    /** Fast (seek) probing feed rate, mm/min */
    probeFeed: number;
    /** Slow (accurate) probing feed rate, mm/min. 0 disables the second touch */
    probeFeedSlow: number;
    /** Distance to back off after the fast touch before the slow touch, mm */
    retract: number;
}

export interface HeightMapPoint {
    /** Work X, mm */
    x: number;
    /** Work Y, mm */
    y: number;
    /** Work Z where the probe triggered (at probing time), mm */
    z: number;
}

export interface HeightMap {
    id: string;
    name: string;
    /** ISO date */
    createdAt: string;
    grid: HeightMapGridConfig;
    /**
     * Probed Z values in work coordinates, row major:
     * z[row][col], row 0 = yStart, col 0 = xStart.
     */
    z: number[][];
    /** Work coordinate system that was active while probing (G54...) */
    wcs?: string;
    notes?: string;
}

export type HeightMapReferenceMode = 'absolute' | 'point';

export interface ApplyHeightMapOptions {
    /** Maximum length of a single linear segment after splitting, mm */
    segmentLength: number;
    /**
     * 'absolute' - Z zero of the job is the same Z zero that was used while
     * probing, so the probed values are used directly as offsets.
     * 'point' - Z zero was (re)set on the surface at (refX, refY); offsets are
     * taken relative to the map value at that point.
     */
    referenceMode: HeightMapReferenceMode;
    refX: number;
    refY: number;
    /** Decimal places used in the output */
    precision?: number;
}

export interface ApplyHeightMapResult {
    gcode: string;
    stats: {
        linesIn: number;
        linesOut: number;
        movesCompensated: number;
        arcsLinearized: number;
        pointsOutsideMap: number;
        minOffset: number;
        maxOffset: number;
        warnings: string[];
    };
}

export interface HeightMapWidgetState {
    grid: HeightMapGridConfig;
    probe: HeightMapProbeConfig;
    apply: Omit<ApplyHeightMapOptions, 'precision'>;
    maps: HeightMap[];
    activeMapId: string | null;
}
