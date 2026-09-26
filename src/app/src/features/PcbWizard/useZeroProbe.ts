import { useCallback, useEffect, useRef, useState } from 'react';

import controller from 'app/lib/controller';
import { parsePrbLine } from 'app/features/HeightMap/utils/probing';

import { ProbeSettings } from './definitions';
import { zeroZCommands, zProbeTouches } from './lib/machine';

export type ZeroProbeStatus = 'idle' | 'running' | 'done' | 'failed';

/**
 * Sends the Z0 probing program and watches the controller output: success
 * once every touch reported [PRB:...:1], failure on a missed touch, an alarm
 * or an error.
 */
export const useZeroProbe = (onDone: () => void) => {
    const [status, setStatus] = useState<ZeroProbeStatus>('idle');
    const [message, setMessage] = useState('');
    const touches = useRef({ needed: 0, got: 0 });
    const listener = useRef<((line: string) => void) | null>(null);
    const onDoneRef = useRef(onDone);
    onDoneRef.current = onDone;

    const detach = useCallback(() => {
        if (listener.current) {
            controller.removeListener('serialport:read', listener.current);
            listener.current = null;
        }
    }, []);
    useEffect(() => detach, [detach]);

    const start = useCallback(
        (probe: ProbeSettings, at?: { x: number; y: number }) => {
            detach();
            touches.current = { needed: zProbeTouches(probe), got: 0 };
            const handle = (line: string) => {
                if (typeof line !== 'string') return;
                if (/^ALARM/i.test(line) || /^error:/i.test(line)) {
                    detach();
                    setStatus('failed');
                    setMessage(`Stopped by the controller: ${line.trim()}. Unlock the machine and try again.`);
                    return;
                }
                const report = parsePrbLine(line);
                if (!report) return;
                if (!report.success) {
                    detach();
                    setStatus('failed');
                    setMessage('The probe did not touch the copper. Check the clip and the probe travel.');
                    return;
                }
                touches.current.got++;
                if (touches.current.got >= touches.current.needed) {
                    detach();
                    setStatus('done');
                    setMessage('Z0 set');
                    onDoneRef.current();
                }
            };
            listener.current = handle;
            controller.addListener('serialport:read', handle);
            setStatus('running');
            setMessage('Probing Z0...');
            controller.command('gcode:safe', zeroZCommands(probe, at), 'G21');
        },
        [detach],
    );

    return { status, message, start };
};
