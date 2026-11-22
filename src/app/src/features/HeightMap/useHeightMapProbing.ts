import { useCallback, useEffect, useRef, useState } from 'react';

import controller from 'app/lib/controller';
import reduxStore from 'app/store/redux';
import {
    HeightMap,
    HeightMapGridConfig,
    HeightMapProbeConfig,
} from './definitions';
import { createEmptyZ, GridPoint } from './utils/heightMap';
import {
    buildProbeProgram,
    parsePrbLine,
    probeReportTimeoutMs,
    touchesPerPoint,
} from './utils/probing';

export type ProbingStatus = 'idle' | 'running' | 'done' | 'failed' | 'stopped';

/** Why probing failed, so the page can say what to do next. */
export type ProbingFailure =
    | { kind: 'alarm'; code: string }
    | { kind: 'error'; code: string }
    | { kind: 'no-contact' }
    | { kind: 'timeout'; seconds: number };

interface Session {
    grid: HeightMapGridConfig;
    points: GridPoint[];
    touches: number;
    /** successful touches recorded per point (same order as points) */
    hits: number[];
    wco: { x: number; y: number; z: number };
    inches: boolean;
    z: number[][];
    wcs: string;
}

/**
 * Runs the probing program on the machine and collects the [PRB:...]
 * reports into a height map.
 *
 * PRB reports are in machine coordinates. They are converted to work
 * coordinates using the work offset captured when probing starts
 * (WCO = MPos - WPos) and matched to grid points by XY.
 */
export const useHeightMapProbing = (
    onComplete: (map: HeightMap) => void,
) => {
    const [status, setStatus] = useState<ProbingStatus>('idle');
    const [message, setMessage] = useState('');
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [liveZ, setLiveZ] = useState<number[][] | null>(null);
    const [failure, setFailure] = useState<ProbingFailure | null>(null);

    const session = useRef<Session | null>(null);
    const listener = useRef<((line: string) => void) | null>(null);
    const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeoutMs = useRef(0);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const detach = useCallback(() => {
        if (watchdog.current) {
            clearTimeout(watchdog.current);
            watchdog.current = null;
        }
        if (listener.current) {
            controller.removeListener('serialport:read', listener.current);
            listener.current = null;
        }
    }, []);

    useEffect(() => detach, [detach]);

    const finish = useCallback(
        (nextStatus: ProbingStatus, text: string, why: ProbingFailure | null = null) => {
            detach();
            session.current = null;
            setStatus(nextStatus);
            setMessage(text);
            setFailure(why);
        },
        [detach],
    );

    // Neither a report nor an alarm for longer than any touch can take: the
    // controller or its USB link stopped answering. A feed hold only pauses.
    const arm = useCallback(() => {
        if (watchdog.current) {
            clearTimeout(watchdog.current);
        }
        watchdog.current = setTimeout(() => {
            watchdog.current = null;
            const state = String(
                reduxStore.getState().controller?.state?.status?.activeState ?? '',
            );
            if (state.startsWith('Hold')) {
                arm();
                return;
            }
            const seconds = Math.round(timeoutMs.current / 1000);
            finish(
                'failed',
                `No answer from the controller for ${seconds} s`,
                { kind: 'timeout', seconds },
            );
        }, timeoutMs.current);
    }, [finish]);

    const handleLine = useCallback(
        (line: string) => {
            const current = session.current;
            if (!current || typeof line !== 'string') {
                return;
            }

            const halted = /^(ALARM|error):\s*(\w+)/i.exec(line);
            if (halted) {
                finish(
                    'failed',
                    `Probing stopped by the controller: ${line.trim()}`,
                    {
                        kind: halted[1].toUpperCase() === 'ALARM' ? 'alarm' : 'error',
                        code: halted[2],
                    },
                );
                return;
            }

            const report = parsePrbLine(line);
            if (!report) {
                return;
            }
            if (!report.success) {
                finish(
                    'failed',
                    'The probe did not make contact. Check the probe clip and the probe limit Z.',
                    { kind: 'no-contact' },
                );
                return;
            }

            // Match the report to a grid point by its XY position, so stray
            // [PRB] lines (e.g. a manual $# query) cannot shift the map.
            const k = current.inches ? 25.4 : 1;
            const workX = report.x * k - current.wco.x;
            const workY = report.y * k - current.wco.y;
            const index = current.points.findIndex(
                (p) => Math.hypot(p.x - workX, p.y - workY) < 0.05,
            );
            if (index === -1) {
                return;
            }
            const point = current.points[index];
            const workZ = Number((report.z * k - current.wco.z).toFixed(4));
            // The last (slow) touch wins
            current.z[point.row][point.col] = workZ;
            current.hits[index]++;
            arm();
            setLiveZ(current.z.map((row) => [...row]));

            const done = current.hits.filter((h) => h >= current.touches).length;
            setProgress({ done, total: current.points.length });

            if (done === current.points.length) {
                const now = new Date();
                const map: HeightMap = {
                    id: `hm-${now.getTime()}`,
                    name: `Height map ${now.toLocaleString()}`,
                    createdAt: now.toISOString(),
                    grid: { ...current.grid },
                    z: current.z.map((row) => [...row]),
                    wcs: current.wcs,
                };
                finish('done', 'Probing finished');
                onCompleteRef.current(map);
            }
        },
        [finish, arm],
    );

    const start = useCallback(
        (grid: HeightMapGridConfig, probe: HeightMapProbeConfig) => {
            const state = reduxStore.getState();
            const { mpos, wpos, settings, modal } = state.controller;
            // positions in the redux store are already converted to mm
            const wco = {
                x: Number(mpos.x) - Number(wpos.x),
                y: Number(mpos.y) - Number(wpos.y),
                z: Number(mpos.z) - Number(wpos.z),
            };
            const inches = Number(settings?.settings?.$13 ?? 0) > 0;

            const { commands, points } = buildProbeProgram(grid, probe);

            detach();
            session.current = {
                grid: { ...grid },
                points,
                touches: touchesPerPoint(probe),
                hits: points.map(() => 0),
                wco,
                inches,
                z: createEmptyZ(grid),
                wcs: modal?.wcs ?? 'G54',
            };
            setLiveZ(createEmptyZ(grid));
            setProgress({ done: 0, total: points.length });
            setStatus('running');
            setMessage('Probing...');
            setFailure(null);

            listener.current = handleLine;
            controller.addListener('serialport:read', handleLine);
            controller.command('gcode:safe', commands, 'G21');
            timeoutMs.current = probeReportTimeoutMs(probe);
            arm();
        },
        [detach, handleLine, arm],
    );

    const stop = useCallback(() => {
        controller.command('reset');
        finish('stopped', 'Probing stopped (soft reset). Unlock the machine before continuing.');
    }, [finish]);

    return { status, message, failure, progress, liveZ, start, stop };
};
