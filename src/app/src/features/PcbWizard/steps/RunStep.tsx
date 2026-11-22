import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';

import { WORKFLOW_STATE_PAUSED } from 'app/constants';
import controller from 'app/lib/controller';
import { Button } from 'app/components/Button';
import { useTypedSelector } from 'app/hooks/useTypedSelector';

import { ProbeSettings, WizardSettings } from '../definitions';
import { bitKey } from '../lib/machine';
import { PlannedOperation, programFileName } from '../lib/plan';
import { Program } from '../lib/programs';
import { Warnings } from '../components/Layout';
import SceneView, { BED_SCENE } from '../scene/SceneView';
import BlankLayer from '../scene/BlankLayer';
import ScenePanel from '../scene/ScenePanel';
import { ZeroMark } from '../scene/BlankOnBed';
import { BoardModel } from '../../PcbMilling/lib/board';
import { updateSession, useSession } from '../lib/session';
import MachineStatus, { useMachine } from '../components/MachineStatus';
import { useZeroProbe } from '../useZeroProbe';

interface Props {
    ops: PlannedOperation[];
    programs: Map<string, Program>;
    /** Programs are being regenerated: nothing may be loaded or started */
    updating: boolean;
    settings: WizardSettings;
    projectName: string;
    reference: { x: number; y: number };
    heightMapReady: boolean;
    onLoad: (op: PlannedOperation, index: number) => Promise<boolean>;
    probe: ProbeSettings;
    panel: BoardModel;
}

const RunStep = ({ ops, programs, updating, settings, projectName, reference, heightMapReady, onLoad, probe, panel }: Props) => {
    const session = useSession();
    const { idle, connected } = useMachine();
    const file = useTypedSelector((s) => s.file);
    const workflowState = useTypedSelector((s) => s.controller.workflow.state);

    const firstOpen = ops.findIndex((op) => session.results[op.id] !== 'done');
    const [current, setCurrent] = useState(Math.max(firstOpen, 0));
    // move on to the next program when one finishes
    useEffect(() => {
        if (firstOpen >= 0) setCurrent(firstOpen);
    }, [firstOpen]);

    const op = ops[Math.min(current, ops.length - 1)];
    const index = ops.indexOf(op);
    const key = op ? bitKey(op, settings) : '';
    const ref = session.reference ?? reference;
    // the bit being probed is fixed when probing starts, whatever is selected meanwhile
    const probingBit = useRef<string | null>(null);
    const zeroProbe = useZeroProbe(() => updateSession({ zeroBit: probingBit.current, reference: ref }));
    const probing = zeroProbe.status === 'running';

    if (!op) {
        return <p className="text-sm text-gray-500">No programs in the plan.</p>;
    }

    const name = programFileName(projectName, index, op);
    const program = programs.get(op.id);
    // the loaded file must be this program's current G-code, not an older one with the same name
    const loaded =
        file.fileLoaded &&
        !file.fileProcessing &&
        file.name === name &&
        session.loaded?.opId === op.id &&
        session.loaded.hash === program?.hash;
    const running = session.runningId !== null;
    const zeroOk = session.zeroBit === key;
    const needsMap = op.kind === 'isolation' && settings.applyHeightMap && !heightMapReady && !session.skipHeightMap;
    const previous = index > 0 ? ops[index - 1] : null;
    const sameBit = previous && bitKey(previous, settings) === key;


    // the session marks the program as running when the job starts (see onJobStart),
    // so a start from the Carve screen is tracked the same way
    const start = () => controller.command('gcode:start');

    return (
        <SceneView
            scene={BED_SCENE}
            overlay={(mapping) => (
                <BlankLayer mapping={mapping} width={settings.stock.width} height={settings.stock.height} panel={panel} artwork="faint">
                    {ops.map((o, i) => (
                        <Toolpaths key={o.id} op={o} state={i === index ? 'current' : session.results[o.id] === 'done' ? 'done' : 'later'} />
                    ))}
                    <ZeroMark />
                </BlankLayer>
            )}
        >
            <ScenePanel className="w-80">
                <MachineStatus />
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-semibold">
                        Program {index + 1} of {ops.length}: {op.name}
                    </p>
                    <p className="text-xs text-gray-500">
                        {op.tool} · ~{Math.max(1, Math.round(op.stats.estimatedMinutes))} min
                    </p>

                    <p className="text-sm font-semibold mt-2">1. Bit and Z0</p>
                    {zeroOk ? (
                        <p className="text-sm text-green-600">
                            Z0 is set for this bit{sameBit ? ' (same bit as the previous program)' : ''}.
                        </p>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 dark:text-gray-300">
                                Raise Z, insert <b>{op.tool}</b>, clip the probe on. The bit goes up {probe.raise} mm, moves
                                to X{ref.x.toFixed(1)} Y{ref.y.toFixed(1)} and probes Z0 there.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="primary"
                                    onClick={() => {
                                        probingBit.current = key;
                                        zeroProbe.start(probe, ref);
                                    }}
                                    disabled={!idle || running || probing}
                                >
                                    Probe Z0
                                </Button>
                                <Button onClick={() => updateSession({ zeroBit: key })} disabled={running || probing}>
                                    Z0 is already right
                                </Button>
                            </div>
                        </>
                    )}
                    {zeroProbe.message && (
                        <p className={zeroProbe.status === 'failed' ? 'text-xs text-red-500' : 'text-xs text-gray-500'}>{zeroProbe.message}</p>
                    )}

                    <p className="text-sm font-semibold mt-2">2. Load and start</p>
                    {needsMap && (
                        <p className="text-xs text-orange-500">
                            Probe the height map first, or mark the blank as flat in the Height map step.
                        </p>
                    )}
                    {program && <Warnings items={program.warnings} />}
                    {updating && <p className="text-xs text-orange-500">The programs are being updated…</p>}
                    {!updating && file.name === name && !loaded && !running && (
                        <p className="text-xs text-orange-500">The loaded file is an older version of this program: load it again.</p>
                    )}
                    <p className="text-xs text-gray-500">Remove the probe clip before starting.</p>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => onLoad(op, index)} disabled={running || !connected || updating || probing}>
                            {loaded ? 'Loaded' : 'Load'}
                        </Button>
                        {!running ? (
                            <Button variant="primary" onClick={start} disabled={!idle || !loaded || !zeroOk || needsMap || updating || probing}>
                                Start
                            </Button>
                        ) : (
                            <>
                                {workflowState === WORKFLOW_STATE_PAUSED ? (
                                    <Button variant="primary" onClick={() => controller.command('gcode:resume')}>
                                        Resume
                                    </Button>
                                ) : (
                                    <Button onClick={() => controller.command('gcode:pause')}>Pause</Button>
                                )}
                                <Button variant="error" onClick={() => controller.command('gcode:stop', { force: true })}>
                                    Stop
                                </Button>
                            </>
                        )}
                    </div>
                    {running && (
                        <p className="text-sm text-blue-600">
                            Running {ops.find((o) => o.id === session.runningId)?.name}...{' '}
                            {idle && workflowState !== WORKFLOW_STATE_PAUSED && (
                                // the start did not go through or the end was missed
                                <button type="button" className="text-xs text-gray-500 underline" onClick={() => updateSession({ runningId: null })}>
                                    not running?
                                </button>
                            )}
                        </p>
                    )}
                    {session.results[op.id] === 'stopped' && <p className="text-xs text-orange-500">This program was stopped before the end.</p>}
                    {!running && session.results[op.id] !== 'done' && (
                        <button
                            type="button"
                            className="self-start text-xs text-gray-500 underline"
                            onClick={() => updateSession({ results: { ...session.results, [op.id]: 'done' } })}
                        >
                            Mark as done without running
                        </button>
                    )}
                </div>
            </ScenePanel>

            <ScenePanel side="right" className="w-72">
                <p className="text-sm font-semibold">Programs</p>
                {ops.map((o, i) => {
                    const result = session.results[o.id];
                    const isRunning = session.runningId === o.id;
                    return (
                        <button
                            type="button"
                            key={o.id}
                            disabled={running || probing}
                            onClick={() => setCurrent(i)}
                            className={cx(
                                'grid grid-cols-[1.5rem_1fr_auto] gap-2 items-center rounded p-2 text-left',
                                i === index ? 'ring-1 ring-blue-400 bg-gray-50 dark:bg-dark-lighter' : 'hover:bg-gray-50 dark:hover:bg-dark-lighter',
                            )}
                        >
                            <span className="text-sm text-gray-500">{i + 1}.</span>
                            <span className="flex flex-col">
                                <span className="text-sm font-medium">{o.name}</span>
                                <span className="text-xs text-gray-500">{o.tool}</span>
                            </span>
                            <span
                                className={cx('text-xs', {
                                    'text-green-600': result === 'done',
                                    'text-orange-500': result === 'stopped',
                                    'text-blue-600': isRunning,
                                    'text-gray-400': !result && !isRunning,
                                })}
                            >
                                {isRunning ? 'running' : result === 'done' ? 'done' : result === 'stopped' ? 'stopped' : 'to do'}
                            </span>
                        </button>
                    );
                })}
            </ScenePanel>
        </SceneView>
    );
};

const PATH_COLORS: Record<string, string> = {
    isolation: '#1d4ed8',
    drill: '#111827',
    holes: '#7c3aed',
    outline: '#b91c1c',
};

/** One program's cuts on the copper, in blank millimetres. */
const Toolpaths = ({ op, state }: { op: PlannedOperation; state: 'current' | 'done' | 'later' }) => {
    if (state === 'later') return null;
    const color = state === 'done' ? '#4b5563' : PATH_COLORS[op.kind] ?? '#1d4ed8';
    const opacity = state === 'done' ? 0.45 : 1;
    return (
        <g opacity={opacity}>
            {op.paths.map((p, i) => (
                <polyline key={i} points={p.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth={0.3} />
            ))}
            {op.points.map(([x, y], i) => (
                <circle key={`d${i}`} cx={x} cy={y} r={0.45} fill={color} />
            ))}
        </g>
    );
};

export default RunStep;
