import { HeightMapGridConfig, HeightMapProbeConfig } from '../definitions';
import { GridPoint, getProbeOrder } from './heightMap';

const fmt = (value: number) => Number(value.toFixed(4)).toString();

export const validateProbeConfig = (
    probe: HeightMapProbeConfig,
): string[] => {
    const errors: string[] = [];
    if (!(probe.clearanceZ > probe.probeMinZ)) {
        errors.push('Clearance Z must be higher than the probe limit Z');
    }
    if (!(probe.probeFeed > 0)) {
        errors.push('Probe feed rate must be greater than 0');
    }
    if (probe.probeFeedSlow < 0) {
        errors.push('Slow probe feed rate cannot be negative');
    }
    if (probe.probeFeedSlow > 0 && !(probe.retract > 0)) {
        errors.push('Retract distance must be greater than 0');
    }
    if (
        probe.probeFeedSlow > 0 &&
        probe.retract >= probe.clearanceZ - probe.probeMinZ
    ) {
        errors.push('Retract distance is larger than the probing range');
    }
    return errors;
};

/** Number of [PRB:...] reports produced for every grid point. */
export const touchesPerPoint = (probe: HeightMapProbeConfig) =>
    probe.probeFeedSlow > 0 ? 2 : 1;

/**
 * Builds the probing program for the grid. All values are in mm and work
 * coordinates, the caller must make sure G21 is active (gcode:safe does it).
 */
export const buildProbeProgram = (
    grid: HeightMapGridConfig,
    probe: HeightMapProbeConfig,
): { commands: string[]; points: GridPoint[] } => {
    const points = getProbeOrder(grid);
    const commands: string[] = [
        '(gSender height map probing)',
        'G90 G94',
        `G0 Z${fmt(probe.clearanceZ)}`,
    ];

    for (const point of points) {
        commands.push(`G0 X${fmt(point.x)} Y${fmt(point.y)}`);
        commands.push(
            `G38.2 Z${fmt(probe.probeMinZ)} F${fmt(probe.probeFeed)}`,
        );
        if (probe.probeFeedSlow > 0) {
            commands.push(`G91 G0 Z${fmt(probe.retract)}`);
            commands.push(
                `G90 G38.2 Z${fmt(probe.probeMinZ)} F${fmt(probe.probeFeedSlow)}`,
            );
        }
        commands.push(`G0 Z${fmt(probe.clearanceZ)}`);
    }

    commands.push('G90');
    commands.push(`G0 Z${fmt(probe.clearanceZ)}`);
    commands.push(`G0 X${fmt(grid.xStart)} Y${fmt(grid.yStart)}`);

    return { commands, points };
};

export interface ProbeReport {
    x: number;
    y: number;
    z: number;
    success: boolean;
}

const PRB_REGEX = /\[PRB:([^:\]]+):(\d)\]/;

/** Parses a Grbl / grblHAL `[PRB:x,y,z(,a...):s]` line. */
export const parsePrbLine = (line: string): ProbeReport | null => {
    const match = PRB_REGEX.exec(line);
    if (!match) {
        return null;
    }
    const values = match[1].split(',').map(Number);
    if (values.length < 3 || values.slice(0, 3).some((v) => !Number.isFinite(v))) {
        return null;
    }
    return {
        x: values[0],
        y: values[1],
        z: values[2],
        success: match[2] === '1',
    };
};
