import { useMemo } from 'react';

import { Button } from 'app/components/Button';
import controller from 'app/lib/controller';
import { toast } from 'app/lib/toaster';
import HeightMapPreview from 'app/features/HeightMap/components/HeightMapPreview';
import {
    ProbingFailure,
    useHeightMapProbing,
} from 'app/features/HeightMap/useHeightMapProbing';
import {
    HeightMap,
    HeightMapGridConfig,
} from 'app/features/HeightMap/definitions';
import { getMapStats } from 'app/features/HeightMap/utils/heightMap';
import {
    loadHeightMapState,
    saveHeightMapState,
} from 'app/features/HeightMap/utils/storage';

import {
    Card,
    Check,
    Field,
    FieldGrid,
} from '../../PcbMilling/components/controls';
import { ProbeSettings } from '../definitions';
import { heightMapProbeConfig } from '../lib/machine';
import { updateSession, useProbingLock, useSession } from '../lib/session';
import MachineStatus, { useMachine } from '../components/MachineStatus';
import { StepColumns } from '../components/Layout';

interface Props {
    grid: HeightMapGridConfig | null;
    projectName: string;
    probe: ProbeSettings;
    onProbe: (patch: Partial<ProbeSettings>) => void;
}

/** What went wrong, in the user's terms, and what to do about it. */
export const describeFailure = (failure: ProbingFailure) => {
    if (failure.kind === 'timeout') {
        return `No answer from the controller for ${failure.seconds} s. Check the USB cable and the controller power, then reset the controller.`;
    }
    if (failure.kind === 'error') {
        return `The controller rejected a probing command (error:${failure.code}).`;
    }
    const code = failure.kind === 'no-contact' ? '5' : failure.code;
    switch (code) {
        case '1':
            return 'A limit switch was triggered. Home the machine, then set X0 Y0 and Z0 again.';
        case '2':
            return 'The probing area or depth is outside the machine travel. Check X0 Y0 and the blank size.';
        case '3':
            return 'The machine was reset while moving, so its position may be lost. Home it, then set X0 Y0 and Z0 again.';
        case '4':
            return 'The probe circuit was closed before probing started. Check that the bit is clear of the copper and the clip wire is not shorted.';
        case '5':
            return 'The probe did not touch the copper before "Probe down to". Check that the clip is on the bit and the wire is on the copper, or probe deeper.';
        default:
            return `The controller stopped with ALARM:${code}.`;
    }
};

const FailureNotice = ({ failure, alarm }: { failure: ProbingFailure; alarm: boolean }) => (
    // same frame as the wizard's warnings, with a red edge
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 dark:border-dark-lighter border-l-4 border-l-red-500 px-3 py-2">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            {failure.kind === 'timeout' ? 'Probing stopped: no answer' : 'Probing stopped'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-300">{describeFailure(failure)}</p>
        {(alarm || failure.kind === 'timeout') && (
            <div className="flex gap-2">
                {failure.kind === 'timeout' && (
                    <Button onClick={() => controller.command('reset')}>Reset controller</Button>
                )}
                {alarm && <Button onClick={() => controller.command('unlock')}>Unlock</Button>}
            </div>
        )}
    </div>
);

export const findHeightMap = (id: string | null) =>
    id ? (loadHeightMapState().maps.find((m) => m.id === id) ?? null) : null;

const HeightMapStep = ({ grid, projectName, probe, onProbe }: Props) => {
    const session = useSession();
    const { idle, activeState } = useMachine();
    const saved = useMemo(
        () => findHeightMap(session.heightMapId),
        [session.heightMapId],
    );

    const probing = useHeightMapProbing((map: HeightMap) => {
        const named = {
            ...map,
            name: `${projectName} ${new Date().toLocaleString()}`,
        };
        // keep it with the other maps, so the Height Map tool shows it too
        const state = loadHeightMapState();
        saveHeightMapState({
            ...state,
            maps: [named, ...state.maps],
            activeMapId: named.id,
        });
        updateSession({ heightMapId: named.id, skipHeightMap: false });
        toast.success('Height map probed');
    });
    const running = probing.status === 'running';
    useProbingLock(running);

    const shownGrid = running || !saved ? grid : saved.grid;
    const shownZ = running ? probing.liveZ : (saved?.z ?? null);
    const stats = saved ? getMapStats(saved) : null;
    const canProbe = idle && !running && !!grid && !!session.zeroBit;

    return (
        <StepColumns
            leftWidth="30rem"
            left={
                <>
                    <Card>
                        <MachineStatus />
                    </Card>
                    <Card>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            The probe touches the copper on a grid over the
                            isolation area; the isolation program then follows
                            the surface. Keep the probe clip on the bit.
                        </p>
                        <FieldGrid>
                            <Field
                                label="Point spacing"
                                value={probe.spacing}
                                step={1}
                                onChange={(v) => onProbe({ spacing: v })}
                            />
                            <Field
                                label="Height between points"
                                value={probe.clearance}
                                step={0.5}
                                onChange={(v) => onProbe({ clearance: v })}
                            />
                            <Field
                                label="Probe down to"
                                value={probe.mapDepth}
                                step={0.5}
                                onChange={(v) => onProbe({ mapDepth: v })}
                            />
                        </FieldGrid>
                        {grid && (
                            <p className="text-xs text-gray-500">
                                {grid.xPoints} × {grid.yPoints} ={' '}
                                {grid.xPoints * grid.yPoints} points over{' '}
                                {grid.width.toFixed(1)} ×{' '}
                                {grid.length.toFixed(1)} mm from X
                                {grid.xStart.toFixed(1)} Y
                                {grid.yStart.toFixed(1)}
                            </p>
                        )}
                        <div className="flex gap-2">
                            {running ? (
                                <Button variant="error" onClick={probing.stop}>
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    disabled={!canProbe}
                                    onClick={() =>
                                        grid &&
                                        probing.start(
                                            grid,
                                            heightMapProbeConfig(probe),
                                        )
                                    }
                                >
                                    {saved ? 'Probe again' : 'Start probing'}
                                </Button>
                            )}
                        </div>
                        {!session.zeroBit && (
                            <p className="text-xs text-gray-500">
                                Set Z0 in the previous step first.
                            </p>
                        )}
                        {probing.status === 'failed' && probing.failure && (
                            <FailureNotice
                                failure={probing.failure}
                                alarm={activeState === 'Alarm'}
                            />
                        )}
                        {probing.status !== 'idle' && !probing.failure && (
                            <p
                                className={
                                    probing.status === 'failed'
                                        ? 'text-xs text-red-500'
                                        : 'text-xs text-gray-500'
                                }
                            >
                                {probing.message}
                                {running &&
                                    ` ${probing.progress.done} / ${probing.progress.total}`}
                            </p>
                        )}
                        {saved && stats && !running && (
                            <p className="text-sm text-green-600">
                                Map ready: the copper is{' '}
                                {((stats.max - stats.min) * 1000).toFixed(0)} µm
                                from lowest to highest point.
                            </p>
                        )}
                    </Card>
                    <Card>
                        <Check
                            label="Flat blank: skip the height map"
                            checked={session.skipHeightMap}
                            onChange={(v) =>
                                updateSession({ skipHeightMap: v })
                            }
                        />
                    </Card>
                </>
            }
            right={
                <Card className="flex-1 min-h-0 items-center justify-center">
                    {shownGrid ? (
                        <div className="w-full max-w-xl">
                            <HeightMapPreview grid={shownGrid} z={shownZ} />
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No isolation program in the plan.
                        </p>
                    )}
                </Card>
            }
        />
    );
};

export default HeightMapStep;
