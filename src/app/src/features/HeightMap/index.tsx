import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import cx from 'classnames';

import {
    GRBL_ACTIVE_STATE_IDLE,
    IMPERIAL_UNITS,
    METRIC_UNITS,
    RENDER_NO_FILE,
    VISUALIZER_PRIMARY,
} from 'app/constants';
import controller from 'app/lib/controller';
import { uploadGcodeFileToServer } from 'app/lib/fileupload';
import store from 'app/store';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { ControlledInput } from 'app/components/ControlledInput';
import InputArea from 'app/components/InputArea';
import { Button } from 'app/components/Button';
import { toast } from 'app/lib/toaster';

import {
    ApplyHeightMapResult,
    HeightMap,
    HeightMapWidgetState,
} from './definitions';
import HeightMapPreview from './components/HeightMapPreview';
import { useHeightMapProbing } from './useHeightMapProbing';
import { isMapComplete, validateGrid } from './utils/heightMap';
import { validateProbeConfig } from './utils/probing';
import { applyHeightMap } from './utils/applyHeightMap';
import {
    exportHeightMap,
    importHeightMap,
    loadHeightMapState,
    saveHeightMapState,
} from './utils/storage';

const inputStyle =
    'text-lg font-light z-0 align-center text-center text-blue-500 pl-1 pr-1 w-full';

const NumberField = ({
    value,
    onChange,
    suffix = 'mm',
    min,
    step,
    disabled,
}: {
    value: number;
    onChange: (value: number) => void;
    suffix?: string;
    min?: number;
    step?: number;
    disabled?: boolean;
}) => (
    <ControlledInput
        type="number"
        suffix={suffix}
        min={min}
        step={step}
        className={inputStyle}
        wrapperClassName="w-full"
        value={value}
        disabled={disabled}
        immediateOnChange
        onChange={(e) => onChange(Number(e.target.value))}
    />
);

const Section = ({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) => (
    <div className="flex flex-col gap-2 border border-gray-200 dark:border-dark-lighter rounded-md p-3">
        <p className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            {title}
        </p>
        {children}
    </div>
);

const HeightMapTool = () => {
    const navigate = useNavigate();
    const [state, setState] = useState<HeightMapWidgetState>(() =>
        loadHeightMapState(),
    );
    const [applyResult, setApplyResult] =
        useState<ApplyHeightMapResult | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const units = store.get('workspace.units', METRIC_UNITS);
    const isConnected = useTypedSelector(
        (s) => s.connection.isConnected,
    );
    const activeState = useTypedSelector(
        (s) => s.controller.state?.status?.activeState,
    );
    const wpos = useTypedSelector((s) => s.controller.wpos);
    const file = useTypedSelector((s) => s.file);
    const isIdle = activeState === GRBL_ACTIVE_STATE_IDLE;

    const { status, message, progress, liveZ, start, stop } =
        useHeightMapProbing((map: HeightMap) => {
            setState((prev) => ({
                ...prev,
                maps: [map, ...prev.maps],
                activeMapId: map.id,
            }));
            toast.success('Height map probed and saved');
        });
    const isProbing = status === 'running';

    useEffect(() => {
        saveHeightMapState(state);
    }, [state]);

    const activeMap = state.maps.find((m) => m.id === state.activeMapId) ?? null;

    const fileLoaded = file.fileLoaded && file.renderState !== RENDER_NO_FILE;
    const fileBounds = useMemo(() => {
        if (!fileLoaded || !file.bbox) {
            return null;
        }
        return {
            minX: file.bbox.min.x,
            minY: file.bbox.min.y,
            maxX: file.bbox.max.x,
            maxY: file.bbox.max.y,
        };
    }, [fileLoaded, file.bbox]);

    const gridErrors = validateGrid(state.grid);
    const probeErrors = validateProbeConfig(state.probe);
    const setupErrors = [...gridErrors, ...probeErrors];

    // Grid shown in the preview: live probing, the selected map, or the setup
    const previewGrid = isProbing || !activeMap ? state.grid : activeMap.grid;
    const previewZ = isProbing || (!activeMap && liveZ) ? liveZ : activeMap?.z ?? null;

    const updateGrid = (key: keyof HeightMapWidgetState['grid'], value: number) =>
        setState((prev) => ({ ...prev, grid: { ...prev.grid, [key]: value } }));
    const updateProbe = (key: keyof HeightMapWidgetState['probe'], value: number) =>
        setState((prev) => ({ ...prev, probe: { ...prev.probe, [key]: value } }));
    const updateApply = <K extends keyof HeightMapWidgetState['apply']>(
        key: K,
        value: HeightMapWidgetState['apply'][K],
    ) =>
        setState((prev) => ({ ...prev, apply: { ...prev.apply, [key]: value } }));

    const fitToFile = () => {
        if (!fileBounds) {
            return;
        }
        setState((prev) => ({
            ...prev,
            grid: {
                ...prev.grid,
                xStart: Number(fileBounds.minX.toFixed(3)),
                yStart: Number(fileBounds.minY.toFixed(3)),
                width: Number(Math.max(fileBounds.maxX - fileBounds.minX, 1).toFixed(3)),
                length: Number(Math.max(fileBounds.maxY - fileBounds.minY, 1).toFixed(3)),
            },
        }));
    };

    const setStartToCurrentPosition = () => {
        setState((prev) => ({
            ...prev,
            grid: {
                ...prev.grid,
                xStart: Number(Number(wpos.x).toFixed(3)),
                yStart: Number(Number(wpos.y).toFixed(3)),
            },
        }));
    };

    const startProbing = () => {
        if (setupErrors.length) {
            toast.error(setupErrors.join('\n'));
            return;
        }
        setApplyResult(null);
        start(state.grid, state.probe);
    };

    const renameMap = (name: string) =>
        setState((prev) => ({
            ...prev,
            maps: prev.maps.map((m) =>
                m.id === prev.activeMapId ? { ...m, name } : m,
            ),
        }));

    const deleteMap = () => {
        if (!activeMap) {
            return;
        }
        setState((prev) => {
            const maps = prev.maps.filter((m) => m.id !== prev.activeMapId);
            return { ...prev, maps, activeMapId: maps[0]?.id ?? null };
        });
    };

    const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        e.target.value = '';
        if (!selected) {
            return;
        }
        try {
            const map = await importHeightMap(selected);
            setState((prev) => ({
                ...prev,
                maps: [map, ...prev.maps],
                activeMapId: map.id,
            }));
            toast.success(`Imported "${map.name}"`);
        } catch (err) {
            toast.error(`Unable to import height map: ${(err as Error).message}`);
        }
    };

    const copyMapGrid = () => {
        if (activeMap) {
            setState((prev) => ({ ...prev, grid: { ...activeMap.grid } }));
        }
    };

    const applyToFile = () => {
        if (!activeMap || !fileLoaded || !file.content) {
            return;
        }
        if (!isMapComplete(activeMap)) {
            toast.error('The selected height map has unprobed points');
            return;
        }
        const result = applyHeightMap(file.content, activeMap, state.apply);
        setApplyResult(result);

        const baseName = (file.name || 'program').replace(/\.[^.]+$/, '');
        const extension = (file.name || '').match(/\.[^.]+$/)?.[0] ?? '.gcode';
        const name = baseName.endsWith('_leveled')
            ? `${baseName}${extension}`
            : `${baseName}_leveled${extension}`;
        const leveledFile = new File([result.gcode], name);
        uploadGcodeFileToServer(leveledFile, controller.port, VISUALIZER_PRIMARY);
        toast.success(`Loaded ${name} with the height map applied`);
    };

    const alreadyLeveled = /_leveled\./.test(file.name || '');

    return (
        <div className="bg-white dark:bg-transparent dark:text-white w-full flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                <div className="flex flex-col gap-3 overflow-y-auto">
                    <p className="text-sm font-normal text-gray-500 dark:text-gray-300">
                        <b>PCB height map:</b> attach the probe clip to the bit
                        and the lead to the copper, set X/Y zero on the board
                        and Z zero on the surface, then probe a grid. The saved
                        map adds the measured surface height to every move of
                        the loaded file, so shallow isolation cuts stay at the
                        same depth on a warped board. All values are in mm
                        {units === IMPERIAL_UNITS ? ' (workspace is set to inches)' : ''}.
                    </p>

                    <Section title="1. Probe area (work coordinates)">
                        <InputArea label="X / Y start">
                            <div className="grid grid-cols-2 gap-2 col-span-3">
                                <NumberField value={state.grid.xStart} onChange={(v) => updateGrid('xStart', v)} disabled={isProbing} />
                                <NumberField value={state.grid.yStart} onChange={(v) => updateGrid('yStart', v)} disabled={isProbing} />
                            </div>
                        </InputArea>
                        <InputArea label="Width / Length">
                            <div className="grid grid-cols-2 gap-2 col-span-3">
                                <NumberField value={state.grid.width} min={0.1} onChange={(v) => updateGrid('width', v)} disabled={isProbing} />
                                <NumberField value={state.grid.length} min={0.1} onChange={(v) => updateGrid('length', v)} disabled={isProbing} />
                            </div>
                        </InputArea>
                        <InputArea label="Points X / Y">
                            <div className="grid grid-cols-2 gap-2 col-span-3">
                                <NumberField value={state.grid.xPoints} min={2} step={1} suffix="pts" onChange={(v) => updateGrid('xPoints', Math.round(v))} disabled={isProbing} />
                                <NumberField value={state.grid.yPoints} min={2} step={1} suffix="pts" onChange={(v) => updateGrid('yPoints', Math.round(v))} disabled={isProbing} />
                            </div>
                        </InputArea>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={fitToFile} disabled={!fileBounds || isProbing}>
                                Fit to loaded file
                            </Button>
                            <Button size="sm" onClick={setStartToCurrentPosition} disabled={!isConnected || isProbing}>
                                Start at current X/Y
                            </Button>
                        </div>
                        {gridErrors.length > 0 && (
                            <p className="text-xs text-red-500">{gridErrors.join('. ')}</p>
                        )}
                    </Section>

                    <Section title="2. Probing">
                        <InputArea label="Clearance / limit Z">
                            <div className="grid grid-cols-2 gap-2 col-span-3">
                                <NumberField value={state.probe.clearanceZ} onChange={(v) => updateProbe('clearanceZ', v)} disabled={isProbing} />
                                <NumberField value={state.probe.probeMinZ} onChange={(v) => updateProbe('probeMinZ', v)} disabled={isProbing} />
                            </div>
                        </InputArea>
                        <InputArea label="Feed fast / slow">
                            <div className="grid grid-cols-2 gap-2 col-span-3">
                                <NumberField value={state.probe.probeFeed} min={1} suffix="mm/min" onChange={(v) => updateProbe('probeFeed', v)} disabled={isProbing} />
                                <NumberField value={state.probe.probeFeedSlow} min={0} suffix="mm/min" onChange={(v) => updateProbe('probeFeedSlow', v)} disabled={isProbing} />
                            </div>
                        </InputArea>
                        <InputArea label="Retract before slow touch">
                            <div className="col-span-3">
                                <NumberField value={state.probe.retract} min={0.05} onChange={(v) => updateProbe('retract', v)} disabled={isProbing || state.probe.probeFeedSlow <= 0} />
                            </div>
                        </InputArea>
                        {probeErrors.length > 0 && (
                            <p className="text-xs text-red-500">{probeErrors.join('. ')}</p>
                        )}
                        <div className="flex flex-wrap gap-2 items-center">
                            {isProbing ? (
                                <Button variant="error" onClick={stop}>
                                    Stop probing
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    onClick={startProbing}
                                    disabled={!isConnected || !isIdle || setupErrors.length > 0}
                                >
                                    Start probing ({state.grid.xPoints * state.grid.yPoints} points)
                                </Button>
                            )}
                            {status !== 'idle' && (
                                <span
                                    className={cx('text-sm', {
                                        'text-red-500': status === 'failed' || status === 'stopped',
                                        'text-green-600': status === 'done',
                                        'text-gray-600 dark:text-gray-300': status === 'running',
                                    })}
                                >
                                    {message}{' '}
                                    {progress.total > 0 && `(${progress.done}/${progress.total})`}
                                </span>
                            )}
                        </div>
                        {!isConnected && (
                            <p className="text-xs text-gray-500">Connect to the machine to probe.</p>
                        )}
                    </Section>

                    <Section title="3. Saved height maps">
                        <div className="flex gap-2 items-center">
                            <select
                                className="flex-1 border border-gray-300 dark:border-dark-lighter rounded px-2 py-1 bg-white dark:bg-dark text-sm"
                                value={state.activeMapId ?? ''}
                                onChange={(e) =>
                                    setState((prev) => ({ ...prev, activeMapId: e.target.value || null }))
                                }
                                disabled={isProbing}
                            >
                                {state.maps.length === 0 && <option value="">No saved maps</option>}
                                {state.maps.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} ({m.grid.xPoints}×{m.grid.yPoints})
                                    </option>
                                ))}
                            </select>
                        </div>
                        {activeMap && (
                            <InputArea label="Name">
                                <input
                                    className="col-span-3 border border-gray-300 dark:border-dark-lighter rounded px-2 py-1 bg-white dark:bg-dark text-sm"
                                    value={activeMap.name}
                                    onChange={(e) => renameMap(e.target.value)}
                                />
                            </InputArea>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => activeMap && exportHeightMap(activeMap)} disabled={!activeMap}>
                                Export
                            </Button>
                            <Button size="sm" onClick={() => importRef.current?.click()} disabled={isProbing}>
                                Import
                            </Button>
                            <Button size="sm" onClick={copyMapGrid} disabled={!activeMap || isProbing}>
                                Copy grid to setup
                            </Button>
                            <Button size="sm" variant="error" onClick={deleteMap} disabled={!activeMap || isProbing}>
                                Delete
                            </Button>
                            <input
                                ref={importRef}
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={onImport}
                            />
                        </div>
                    </Section>

                    <Section title="4. Apply to loaded file">
                        <InputArea label="Max segment length">
                            <div className="col-span-3">
                                <NumberField value={state.apply.segmentLength} min={0.1} onChange={(v) => updateApply('segmentLength', v)} />
                            </div>
                        </InputArea>
                        <InputArea label="Z zero reference">
                            <select
                                className="col-span-3 border border-gray-300 dark:border-dark-lighter rounded px-2 py-1 bg-white dark:bg-dark text-sm"
                                value={state.apply.referenceMode}
                                onChange={(e) => updateApply('referenceMode', e.target.value as 'absolute' | 'point')}
                            >
                                <option value="absolute">Same Z zero as when probing</option>
                                <option value="point">Z re-zeroed at a point</option>
                            </select>
                        </InputArea>
                        {state.apply.referenceMode === 'point' && (
                            <InputArea label="Z zero at X / Y">
                                <div className="grid grid-cols-2 gap-2 col-span-3">
                                    <NumberField value={state.apply.refX} onChange={(v) => updateApply('refX', v)} />
                                    <NumberField value={state.apply.refY} onChange={(v) => updateApply('refY', v)} />
                                </div>
                            </InputArea>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Use &quot;Z re-zeroed at a point&quot; after a tool change: touch off
                            the new bit at that X/Y and the map is shifted to match.
                        </p>
                        <div className="flex flex-wrap gap-2 items-center">
                            <Button
                                variant="primary"
                                onClick={applyToFile}
                                disabled={!activeMap || !fileLoaded || isProbing}
                            >
                                Apply height map and load
                            </Button>
                            {!fileLoaded && (
                                <span className="text-xs text-gray-500">Load a G-code file first.</span>
                            )}
                            {fileLoaded && alreadyLeveled && (
                                <span className="text-xs text-orange-500">
                                    The loaded file is already leveled; applying again doubles the offset.
                                </span>
                            )}
                        </div>
                        {applyResult && (
                            <div className="text-xs text-gray-600 dark:text-gray-300 flex flex-col gap-1">
                                <span>
                                    {applyResult.stats.linesIn} → {applyResult.stats.linesOut} lines,{' '}
                                    {applyResult.stats.movesCompensated} moves compensated,{' '}
                                    {applyResult.stats.arcsLinearized} arcs converted. Offset{' '}
                                    {applyResult.stats.minOffset.toFixed(3)} …{' '}
                                    {applyResult.stats.maxOffset.toFixed(3)} mm.
                                </span>
                                {applyResult.stats.warnings.map((w) => (
                                    <span key={w} className="text-orange-500">{w}</span>
                                ))}
                                <Button size="sm" className="self-start" onClick={() => navigate('/')}>
                                    Go to main visualizer
                                </Button>
                            </div>
                        )}
                    </Section>
                </div>

                <div className="flex flex-col border border-gray-200 dark:border-dark-lighter rounded-md p-3 min-h-80">
                    <p className="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-2">
                        {isProbing
                            ? 'Probing in progress'
                            : activeMap
                              ? activeMap.name
                              : 'Probe grid preview'}
                    </p>
                    <HeightMapPreview grid={previewGrid} z={previewZ} fileBounds={fileBounds} />
                </div>
            </div>
        </div>
    );
};

export default HeightMapTool;
