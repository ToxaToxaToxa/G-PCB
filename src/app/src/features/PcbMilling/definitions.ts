/*
 * PCB milling (Gerber -> GRBL G-code) definitions. All values in mm.
 */

export interface VBit {
    id: string;
    name: string;
    /** Included angle, degrees */
    angle: number;
    /** Tip (flat) diameter, mm */
    tipDiameter: number;
}

export type CutDirection = 'climb' | 'conventional';
export type BoardSide = 'top' | 'bottom';

export interface IsolationSettings {
    enabled: boolean;
    toolId: string;
    /** Cut depth into the copper, mm (positive) */
    depth: number;
    passes: number;
    /** Overlap between passes, 0..0.9 of the cut width */
    overlap: number;
    feed: number;
    plunge: number;
    rpm: number;
    direction: CutDirection;
}

export interface DrillSettings {
    enabled: boolean;
    /** Available drill bit diameters, mm */
    drills: number[];
    boardThickness: number;
    /** Extra depth below the board, mm */
    breakthrough: number;
    plunge: number;
    rpm: number;
    /** Peck depth, 0 = single plunge */
    peck: number;
}

export interface OutlineSettings {
    enabled: boolean;
    /** End mill diameter used for the outline and large holes, mm */
    endMillDiameter: number;
    stepdown: number;
    feed: number;
    plunge: number;
    rpm: number;
    tabs: number;
    tabWidth: number;
    tabHeight: number;
    /** Mill holes larger than the biggest drill with the end mill */
    millLargeHoles: boolean;
}

export interface PcbSettings {
    side: BoardSide;
    vbits: VBit[];
    isolation: IsolationSettings;
    drilling: DrillSettings;
    outline: OutlineSettings;
    travelZ: number;
    safeZ: number;
    /** Spindle spin-up dwell, seconds */
    dwell: number;
    applyHeightMap: boolean;
}

export type LayerKind = 'top' | 'bottom' | 'outline' | 'drill' | 'ignored';

export interface InputFile {
    name: string;
    content: string;
}

export interface DetectedFile {
    name: string;
    kind: LayerKind;
}

export type OperationKind = 'isolation' | 'drill' | 'holes' | 'outline';

export interface Operation {
    id: string;
    kind: OperationKind;
    name: string;
    tool: string;
    gcode: string;
    /** Cutting paths in work coordinates, for the preview */
    paths: [number, number][][];
    /** Drill points in work coordinates, for the preview */
    points: [number, number][];
    /** Isolation only: places where copper areas stay connected */
    unisolated?: [number, number][][];
    stats: {
        lines: number;
        cutLength: number;
        estimatedMinutes: number;
    };
    warnings: string[];
}
