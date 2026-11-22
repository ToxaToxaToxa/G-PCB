import { useEffect, useState } from 'react';
import cx from 'classnames';

import controller from 'app/lib/controller';
import { Button } from 'app/components/Button';
import { Jogging } from 'app/features/Jogging';

import { Field, FieldGrid } from '../../PcbMilling/components/controls';
import { ProbeSettings } from '../definitions';
import { SET_XY_ZERO } from '../lib/machine';
import { updateSession, useProbingLock, useSession } from '../lib/session';
import MachineStatus, { useMachine } from '../components/MachineStatus';
import { useZeroProbe } from '../useZeroProbe';
import SceneView from '../scene/SceneView';
import ScenePanel from '../scene/ScenePanel';
import PlaneLayer from '../scene/PlaneLayer';
import Callout from '../scene/Callout';
import { ZERO_XY_SCENE, ZERO_Z_SCENE } from '../scene/zeroScenes';

interface Props {
    probe: ProbeSettings;
    reference: { x: number; y: number };
    /** Bit of the first program, the one to insert now */
    firstBit: { key: string; label: string } | null;
    onProbe: (patch: Partial<ProbeSettings>) => void;
}

/** X and Y arrows from the corner of the blank, in copper millimetres. */
const CornerArrows = () => (
    <g strokeLinecap="round">
        <line x1={0} y1={0} x2={22} y2={0} stroke="#dc2626" strokeWidth={1.2} />
        <path d="M26 0l-5 -2.2v4.4Z" fill="#dc2626" />
        <line x1={0} y1={0} x2={0} y2={22} stroke="#16a34a" strokeWidth={1.2} />
        <path d="M0 26l-2.2 -5h4.4Z" fill="#16a34a" />
        <circle cx={0} cy={0} r={2.6} fill="none" stroke="#fff" strokeWidth={0.8} />
    </g>
);

const Phase = ({ n, label, done, active, onClick }: { n: number; label: string; done: boolean; active: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className={cx(
            'flex-1 rounded px-2 py-1 text-left text-xs',
            active ? 'bg-blue-50 ring-1 ring-blue-400 dark:bg-dark-lighter' : 'hover:bg-gray-100 dark:hover:bg-dark-lighter',
        )}
    >
        <span className="font-semibold">
            {n}. {label}
        </span>
        {done && <span className="ml-1 text-green-600">✓</span>}
    </button>
);

const ZeroStep = ({ probe, reference, firstBit, onProbe }: Props) => {
    const session = useSession();
    const { idle } = useMachine();
    const zeroProbe = useZeroProbe(() => updateSession({ zeroBit: firstBit?.key ?? null, reference: session.reference ?? reference }));
    const ref = session.reference ?? reference;
    const busy = zeroProbe.status === 'running';
    useProbingLock(busy);

    // X0 Y0 first; once it is set the scene moves on to Z0, and either can be reopened
    const [phase, setPhase] = useState<'xy' | 'z'>(session.xySet ? 'z' : 'xy');
    useEffect(() => {
        if (session.xySet) setPhase('z');
    }, [session.xySet]);

    const setXY = () => {
        controller.command('gcode', SET_XY_ZERO);
        // a new X0 Y0 moves the reference point, so Z0 and the map start over
        updateSession({ xySet: true, reference: null, zeroBit: null, heightMapId: null });
    };
    const zDone = !!session.zeroBit && zeroProbe.status !== 'failed';

    return (
        <SceneView
            key={phase}
            scene={phase === 'xy' ? ZERO_XY_SCENE : ZERO_Z_SCENE}
            overlay={(m) =>
                phase === 'xy' ? (
                    <>
                        <PlaneLayer mapping={m} box={[-10, -10, 40, 40]}>
                            <CornerArrows />
                        </PlaneLayer>
                        <Callout at={m.project(0, 0)} offset={[-150, 70]}>
                            <span className="font-semibold">Bit tip right above this corner</span>
                            <Button variant="primary" onClick={setXY} disabled={!idle || busy}>
                                Set X0 Y0 here
                            </Button>
                            {session.xySet && <span className="text-green-600">✓ X0 Y0 is set</span>}
                        </Callout>
                    </>
                ) : (
                    <>
                        <Callout at={m.point('redClip')} offset={[-120, -90]}>
                            <span className="font-semibold">Red clip on the bit shank</span>
                        </Callout>
                        <Callout at={m.point('blackClip')} offset={[90, 55]}>
                            <span className="font-semibold">Black clip on the copper</span>
                        </Callout>
                        <Callout at={m.point('tip')} offset={[170, 40]}>
                            <span className="font-semibold">
                                Probes here: X{ref.x.toFixed(1)} Y{ref.y.toFixed(1)}
                            </span>
                            <Button variant="primary" onClick={() => zeroProbe.start(probe, ref)} disabled={!idle || busy || !session.xySet}>
                                Probe Z0
                            </Button>
                            {zeroProbe.message && (
                                <span className={zeroProbe.status === 'failed' ? 'text-red-500' : 'text-gray-500'}>{zeroProbe.message}</span>
                            )}
                            {zDone && <span className="text-green-600">✓ Z0 is set</span>}
                        </Callout>
                    </>
                )
            }
        >
            <ScenePanel className="w-72">
                <MachineStatus />
                <div className="flex gap-1">
                    <Phase n={1} label="X0 Y0" done={session.xySet} active={phase === 'xy'} onClick={() => setPhase('xy')} />
                    <Phase n={2} label="Z0" done={zDone} active={phase === 'z'} onClick={() => setPhase('z')} />
                </div>
                {phase === 'xy' ? (
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Fix the blank on the bed and insert the first bit{firstBit ? <b> {firstBit.label}</b> : null}. Jog the
                        bit tip right above the lower-left corner of the blank, then set X0 Y0.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Clip the probe to the bit and to the copper. The bit goes up {probe.raise} mm, moves to the corner of
                            the height map and probes down. Every later bit is zeroed at the same point.
                        </p>
                        {!session.xySet && <p className="text-xs text-gray-500">Set X0 Y0 first.</p>}
                        <p className="text-sm font-semibold">Probe settings</p>
                        <FieldGrid cols={2}>
                            <Field label="Travel down" value={probe.travel} step={1} onChange={(v) => onProbe({ travel: v })} />
                            <Field label="Raise before moving" value={probe.raise} step={1} onChange={(v) => onProbe({ raise: v })} />
                            <Field label="Touch plate" value={probe.plateThickness} step={0.1} onChange={(v) => onProbe({ plateThickness: v })} hint="0 when the clip goes straight on the copper" />
                            <Field label="Back-off" value={probe.retract} step={0.5} onChange={(v) => onProbe({ retract: v })} />
                            <Field label="Probe feed" suffix="mm/min" step={10} value={probe.feed} onChange={(v) => onProbe({ feed: v })} />
                            <Field label="Slow touch" suffix="mm/min" step={5} value={probe.slowFeed} onChange={(v) => onProbe({ slowFeed: v })} hint="0 = off" />
                        </FieldGrid>
                    </>
                )}
            </ScenePanel>
            <ScenePanel side="right" className="w-72">
                <Jogging />
            </ScenePanel>
        </SceneView>
    );
};

export default ZeroStep;
