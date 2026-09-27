/*
 * The G-code that is actually sent for each program, and what has to be
 * forgotten when the plan changes under a job in progress.
 */
import { HeightMap } from 'app/features/HeightMap/definitions';
import { applyHeightMap } from 'app/features/HeightMap/utils/applyHeightMap';

import { ProgramResult } from './session';
import { PlannedOperation } from './plan';

export interface Program {
    gcode: string;
    /** Identifies this exact G-code, to tell whether it is the one loaded */
    hash: string;
    /** Height map notes: points outside the map, moves left uncompensated */
    warnings: string[];
}

/** FNV-1a, enough to tell two programs apart. */
export const hashText = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
};

/**
 * Isolation follows the height map, taken relative to the reference point
 * where Z0 was probed; the other programs cut through the board and are
 * sent as generated.
 */
export const buildProgram = (
    op: PlannedOperation,
    map: HeightMap | null,
    reference: { x: number; y: number },
): Program => {
    if (op.kind !== 'isolation' || !map) {
        return { gcode: op.gcode, hash: hashText(op.gcode), warnings: [] };
    }
    const { gcode, stats } = applyHeightMap(op.gcode, map, {
        segmentLength: 1,
        referenceMode: 'point',
        refX: reference.x,
        refY: reference.y,
    });
    return { gcode, hash: hashText(gcode), warnings: stats.warnings.map((w) => `Height map: ${w}`) };
};

/** Results stay only for programs whose G-code did not change. */
export const keepResults = (
    before: PlannedOperation[],
    after: PlannedOperation[],
    results: Record<string, ProgramResult>,
): Record<string, ProgramResult> => {
    const kept: Record<string, ProgramResult> = {};
    for (const op of after) {
        const old = before.find((o) => o.id === op.id);
        if (old && old.gcode === op.gcode && results[op.id]) {
            kept[op.id] = results[op.id];
        }
    }
    return kept;
};
