/*
 * Machine side of the wizard: work zero, Z probing, the height map grid and
 * the bit sequence. Everything here is plain data, the UI sends the commands.
 * All values are mm in the active work coordinate system.
 */
import { HeightMapGridConfig, HeightMapProbeConfig } from 'app/features/HeightMap/definitions';
import { Operation } from '../../PcbMilling/definitions';
import { ProbeSettings, WizardSettings } from '../definitions';
import { PlannedOperation } from './plan';

const fmt = (v: number) => Number(v.toFixed(4)).toString();

export const SET_XY_ZERO = 'G10 L20 P0 X0 Y0';

/** Number of [PRB] reports one Z probe produces. */
export const zProbeTouches = (p: ProbeSettings) => (p.slowFeed > 0 ? 2 : 1);

/**
 * Probes the copper at (x, y) and sets Z0 there. Before the XY move the bit
 * goes up by `raise` mm relative to where it is: after a bit change the old
 * Z0 says nothing about the new bit, so an absolute Z move could go down.
 * The probe then travels down at most `travel` mm.
 */
export const zeroZCommands = (p: ProbeSettings, at?: { x: number; y: number }): string[] => {
    const commands = ['(PCB wizard: probe Z0)', 'G21 G90'];
    if (at) {
        if (p.raise > 0) {
            commands.push(`G91 G0 Z${fmt(p.raise)}`, 'G90');
        }
        commands.push(`G0 X${fmt(at.x)} Y${fmt(at.y)}`);
    }
    commands.push('G91', `G38.2 Z-${fmt(p.travel)} F${fmt(p.feed)}`);
    if (p.slowFeed > 0) {
        commands.push(`G0 Z${fmt(p.retract)}`, `G38.2 Z-${fmt(p.retract * 2)} F${fmt(p.slowFeed)}`);
    }
    commands.push('G90', `G10 L20 P0 Z${fmt(p.plateThickness)}`, `G0 Z${fmt(p.clearance + p.plateThickness)}`);
    return commands;
};

/** Area the V-bit cuts, from the isolation program paths. */
export const isolationBounds = (ops: Operation[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const op of ops) {
        if (op.kind !== 'isolation') continue;
        for (const path of op.paths) {
            for (const [x, y] of path) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
};

/** Probe grid over the isolation area (plus a small border), inside the blank. */
export const heightMapGrid = (ops: Operation[], s: WizardSettings): HeightMapGridConfig | null => {
    const b = isolationBounds(ops);
    if (!b) return null;
    const border = 1;
    const x0 = Math.max(0, b.minX - border);
    const y0 = Math.max(0, b.minY - border);
    const x1 = Math.min(s.stock.width, b.maxX + border);
    const y1 = Math.min(s.stock.height, b.maxY + border);
    const spacing = Math.max(s.probe.spacing, 1);
    const width = Math.max(x1 - x0, 1);
    const length = Math.max(y1 - y0, 1);
    return {
        xStart: Number(x0.toFixed(3)),
        yStart: Number(y0.toFixed(3)),
        width: Number(width.toFixed(3)),
        length: Number(length.toFixed(3)),
        xPoints: Math.max(2, Math.ceil(width / spacing) + 1),
        yPoints: Math.max(2, Math.ceil(length / spacing) + 1),
    };
};

/** Z0 is set here; it is a corner point of the height map grid. */
export const referencePoint = (grid: HeightMapGridConfig | null) => (grid ? { x: grid.xStart, y: grid.yStart } : { x: 0, y: 0 });

export const heightMapProbeConfig = (p: ProbeSettings): HeightMapProbeConfig => ({
    clearanceZ: p.clearance,
    probeMinZ: -p.mapDepth,
    probeFeed: p.feed,
    probeFeedSlow: p.slowFeed,
    retract: Math.min(p.retract, p.clearance / 2),
});

/** Identifies the bit a program needs, so a change is asked for only when it differs. */
export const bitKey = (op: PlannedOperation, s: WizardSettings) => {
    if (op.stage === 'isolation') return `tool:${s.isolation.toolId}`;
    if (op.stage === 'holes') return `tool:${s.holes.toolId}`;
    if (op.stage === 'outline') return `tool:${s.outline.toolId}`;
    return `drill:${op.id}`;
};
