import controller from 'app/lib/controller';
import { Button } from 'app/components/Button';
import { Jogging } from 'app/features/Jogging';

import { Card, Field, FieldGrid } from '../../PcbMilling/components/controls';
import { ProbeSettings } from '../definitions';
import { SET_XY_ZERO } from '../lib/machine';
import { updateSession, useSession } from '../lib/session';
import MachineStatus, { useMachine } from '../components/MachineStatus';
import { StepColumns } from '../components/Layout';
import { useZeroProbe } from '../useZeroProbe';

interface Props {
    probe: ProbeSettings;
    reference: { x: number; y: number };
    /** Bit of the first program, the one to insert now */
    firstBit: { key: string; label: string } | null;
    onProbe: (patch: Partial<ProbeSettings>) => void;
}

const ZeroStep = ({ probe, reference, firstBit, onProbe }: Props) => {
    const session = useSession();
    const { idle } = useMachine();
    const zeroProbe = useZeroProbe(() => updateSession({ zeroBit: firstBit?.key ?? null, reference: session.reference ?? reference }));
    const ref = session.reference ?? reference;
    const busy = zeroProbe.status === 'running';

    const setXY = () => {
        controller.command('gcode', SET_XY_ZERO);
        // a new X0 Y0 moves the reference point, so Z0 and the map start over
        updateSession({ xySet: true, reference: null, zeroBit: null, heightMapId: null });
    };

    return (
        <StepColumns
            leftWidth="30rem"
            left={
                <>
                    <Card>
                        <MachineStatus />
                    </Card>
                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">1. X0 Y0 — lower-left corner of the blank</p>
                            {session.xySet && <span className="text-sm text-green-600 shrink-0">✓ set</span>}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Fix the blank on the bed and insert the first bit{firstBit ? <b> {firstBit.label}</b> : null}. Jog
                            the bit tip right above the lower-left corner of the blank.
                        </p>
                        <Button variant="primary" onClick={setXY} disabled={!idle || busy}>
                            Set X0 Y0 here
                        </Button>
                    </Card>
                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">2. Z0 — probe the copper</p>
                            {session.zeroBit && zeroProbe.status !== 'failed' && <span className="text-sm text-green-600 shrink-0">✓ set</span>}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Clip the probe to the bit and to the copper. The bit goes up {probe.raise} mm, moves to X
                            {ref.x.toFixed(1)} Y{ref.y.toFixed(1)} (the corner of the height map) and probes down. Every
                            later bit is zeroed at the same point.
                        </p>
                        <Button variant="primary" onClick={() => zeroProbe.start(probe, ref)} disabled={!idle || busy || !session.xySet}>
                            Probe Z0
                        </Button>
                        {zeroProbe.message && (
                            <p className={zeroProbe.status === 'failed' ? 'text-xs text-red-500' : 'text-xs text-gray-500'}>{zeroProbe.message}</p>
                        )}
                        {!session.xySet && <p className="text-xs text-gray-500">Set X0 Y0 first.</p>}
                    </Card>
                </>
            }
            right={
                <>
                    <Card className="items-center">
                        <div className="w-full max-w-96">
                            <Jogging />
                        </div>
                    </Card>
                    <Card>
                        <p className="text-sm font-semibold">Probe settings</p>
                        <FieldGrid>
                            <Field label="Travel down" value={probe.travel} step={1} onChange={(v) => onProbe({ travel: v })} />
                            <Field label="Raise before moving" value={probe.raise} step={1} onChange={(v) => onProbe({ raise: v })} />
                            <Field label="Touch plate" value={probe.plateThickness} step={0.1} onChange={(v) => onProbe({ plateThickness: v })} hint="0 when the clip goes straight on the copper" />
                            <Field label="Probe feed" suffix="mm/min" step={10} value={probe.feed} onChange={(v) => onProbe({ feed: v })} />
                            <Field label="Slow touch (0 = off)" suffix="mm/min" step={5} value={probe.slowFeed} onChange={(v) => onProbe({ slowFeed: v })} />
                            <Field label="Back-off" value={probe.retract} step={0.5} onChange={(v) => onProbe({ retract: v })} />
                        </FieldGrid>
                    </Card>
                </>
            }
        />
    );
};

export default ZeroStep;
