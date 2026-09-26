/*
 * PCB wizard definitions. All values in mm, feeds in mm/min.
 */
import { BoardSide, CutDirection, LayerKind } from '../PcbMilling/definitions';

export type ToolKind = 'vbit' | 'endmill';

export interface Tool {
    id: string;
    kind: ToolKind;
    name: string;
    /** V-bit: tip diameter; end mill: cutter diameter */
    diameter: number;
    /** V-bit included angle, degrees */
    angle?: number;
}

export type Rotation = 0 | 90 | 'auto';

export interface StockSettings {
    width: number;
    height: number;
    /** Distance from the stock edge to the nearest board edge */
    margin: number;
    /** Distance between neighbouring boards */
    gap: number;
    rotation: Rotation;
    /** Fill the stock with as many boards as fit, or use cols x rows */
    fill: boolean;
    cols: number;
    rows: number;
}

export type StageKind = 'isolation' | 'drill' | 'holes' | 'outline';

export interface IsolationStage {
    enabled: boolean;
    toolId: string;
    depth: number;
    passes: number;
    overlap: number;
    feed: number;
    plunge: number;
    rpm: number;
    direction: CutDirection;
}

export interface DrillStage {
    enabled: boolean;
    plunge: number;
    rpm: number;
    peck: number;
}

export interface MillStage {
    enabled: boolean;
    toolId: string;
    stepdown: number;
    feed: number;
    plunge: number;
    rpm: number;
}

export interface OutlineStage extends MillStage {
    tabs: number;
    tabWidth: number;
    tabHeight: number;
}

export interface ProbeSettings {
    /** Longest downward probe move when setting Z0 */
    travel: number;
    feed: number;
    /** Second, slow touch; 0 = single touch */
    slowFeed: number;
    /** Back-off between the fast and the slow touch */
    retract: number;
    /** Raise before moving to the reference point (relative, upwards) */
    raise: number;
    /** Touch plate thickness; 0 when the clip goes straight on the copper */
    plateThickness: number;
    /** Height above the copper after probing and between map points */
    clearance: number;
    /** How deep a height map point may probe below Z0 */
    mapDepth: number;
    /** Distance between height map points */
    spacing: number;
}

export interface WizardSettings {
    side: BoardSide;
    stock: StockSettings;
    tools: Tool[];
    /** Available drill bit diameters */
    drills: number[];
    order: StageKind[];
    isolation: IsolationStage;
    drill: DrillStage;
    holes: MillStage;
    outline: OutlineStage;
    boardThickness: number;
    breakthrough: number;
    travelZ: number;
    safeZ: number;
    dwell: number;
    applyHeightMap: boolean;
    probe: ProbeSettings;
}

export type LayerOverrides = Record<string, LayerKind>;
