/*
 * Step-by-step PCB workflow: project -> blank and array -> tools -> plan ->
 * work zero -> height map -> run the programs -> done.
 * The session (files, programs, machine progress) lives in lib/session.ts so
 * it survives leaving the page; the settings are saved with WidgetConfig.
 */
import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';

import { VISUALIZER_PRIMARY } from 'app/constants';
import controller from 'app/lib/controller';
import { uploadGcodeFileToServer } from 'app/lib/fileupload';
import { toast } from 'app/lib/toaster';
import { Button } from 'app/components/Button';
import WidgetConfig from 'app/features/WidgetConfig/WidgetConfig';
import { isMapComplete } from 'app/features/HeightMap/utils/heightMap';

import { InputFile, LayerKind } from '../PcbMilling/definitions';
import { buildBoardModel, parseProject } from '../PcbMilling/lib/board';
import { downloadText, readInputFiles } from '../PcbMilling/lib/files';
import { LayerOverrides, ProbeSettings, StageKind, WizardSettings } from './definitions';
import { DEFAULT_ORDER, DEFAULT_WIZARD_SETTINGS } from './lib/defaults';
import { layoutPanel, panelizeModel } from './lib/panel';
import { PlannedOperation, planOperations, planWarnings, programFileName } from './lib/plan';
import { bitKey, heightMapGrid, referencePoint } from './lib/machine';
import { Program, buildProgram, hashText, keepResults } from './lib/programs';
import {
    WizardSession,
    getSession,
    isFinished,
    resetMachineState,
    resetSession,
    setKeepProject,
    setSessionStages,
    updateSession,
    useSession,
} from './lib/session';
import { StoredSession, keepRestoredResults, loadStoredSession, restoreStep } from './lib/storedSession';
import RestoreCard from './components/RestoreCard';
import Stepper, { StepInfo } from './components/Stepper';
import ProjectStep from './steps/ProjectStep';
import StockStep from './steps/StockStep';
import ToolsStep from './steps/ToolsStep';
import PlanStep from './steps/PlanStep';
import ZeroStep from './steps/ZeroStep';
import HeightMapStep, { findHeightMap } from './steps/HeightMapStep';
import RunStep from './steps/RunStep';
import DoneStep from './steps/DoneStep';

const config = new WidgetConfig('pcbWizard');

export const loadWizardSettings = (): WizardSettings => {
    const saved = config.get('', {}) as Partial<WizardSettings>;
    const d = DEFAULT_WIZARD_SETTINGS;
    const order = saved.order ?? [];
    return {
        ...d,
        ...saved,
        stock: { ...d.stock, ...saved.stock },
        tools: saved.tools?.length ? saved.tools : d.tools,
        drills: saved.drills?.length ? saved.drills : d.drills,
        // a saved order must still name every stage exactly once
        order: order.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((k) => order.includes(k)) ? order : DEFAULT_ORDER,
        isolation: { ...d.isolation, ...saved.isolation },
        drill: { ...d.drill, ...saved.drill },
        holes: { ...d.holes, ...saved.holes },
        outline: { ...d.outline, ...saved.outline },
        probe: { ...d.probe, ...saved.probe },
    };
};

/** Settings that change the programs; probing and the height map switch do not. */
const programKey = (s: WizardSettings) =>
    JSON.stringify({ ...s, probe: undefined, applyHeightMap: undefined, keepProject: undefined });

const STAGES: StageKind[] = ['isolation', 'drill', 'holes', 'outline'];
const stagesOf = (s: WizardSettings) =>
    Object.fromEntries(STAGES.map((k) => [k, s[k].enabled])) as Record<StageKind, boolean>;
const withStages = (s: WizardSettings, on: Record<StageKind, boolean>): WizardSettings => ({
    ...s,
    isolation: { ...s.isolation, enabled: on.isolation ?? true },
    drill: { ...s.drill, enabled: on.drill ?? true },
    holes: { ...s.holes, enabled: on.holes ?? true },
    outline: { ...s.outline, enabled: on.outline ?? true },
});
const ALL_STAGES: Record<StageKind, boolean> = { isolation: true, drill: true, holes: true, outline: true };

const STEPS = [
    { title: 'Project', hint: 'Gerber files and layers' },
    { title: 'Blank & array', hint: 'Stock size, boards on it' },
    { title: 'Tools', hint: 'V-bits, end mills, drills' },
    { title: 'Plan', hint: 'Stages, order, programs' },
    { title: 'Work zero', hint: 'X0 Y0 and Z0 on the blank' },
    { title: 'Height map', hint: 'Probe the copper surface' },
    { title: 'Run', hint: 'Program by program' },
    { title: 'Done', hint: 'Summary' },
];
const PLAN_STEP = 3;
const ZERO_STEP = 4;

const downloadBlob = (name: string, blob: Blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

const PcbWizard = () => {
    const [settings, setSettings] = useState<WizardSettings>(loadWizardSettings);
    const session = useSession();
    const { step, inputs, overrides, projectName, project, ops } = session;
    const setStep = (next: number) => updateSession({ step: next });
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        // replace: set deep-merges arrays, so removed tools or drills would come back
        config.replace('', settings);
        setSessionStages(stagesOf(settings));
        setKeepProject(settings.keepProject);
    }, [settings]);

    // the project that was open when the app was closed
    const [offer, setOffer] = useState<StoredSession | null>(null);
    useEffect(() => {
        if (!settings.keepProject || getSession().inputs.length) return undefined;
        let live = true;
        loadStoredSession().then((stored) => {
            if (live && !getSession().inputs.length) setOffer(stored);
        });
        return () => {
            live = false;
        };
    }, []);

    const board = useMemo(() => (project ? buildBoardModel(project, settings.side) : null), [project, settings.side]);
    const layout = useMemo(
        () => (board ? layoutPanel(board.width, board.height, settings.stock) : null),
        [board, settings.stock],
    );
    const panel = useMemo(
        () => (board && layout ? panelizeModel(board, layout, settings.stock) : null),
        [board, layout, settings.stock],
    );
    const key = programKey(settings);
    const stale = !session.builtFrom || session.builtFrom.project !== project || session.builtFrom.settings !== key;

    useEffect(() => {
        // new files without copper: only the project step makes sense
        if (project && !board?.copper.length) setStep(0);
    }, [board]);

    const heightMap = useMemo(() => {
        const map = findHeightMap(session.heightMapId);
        return map && isMapComplete(map) ? map : null;
    }, [session.heightMapId]);
    const grid = useMemo(() => heightMapGrid(ops, settings), [ops, settings.stock, settings.probe.spacing]);
    const reference = session.reference ?? referencePoint(grid);

    // regenerate the programs a moment after the plan inputs settle
    useEffect(() => {
        if (step < PLAN_STEP || !stale || !panel) return undefined;
        const timer = setTimeout(() => {
            setBusy(true);
            // let the spinner render before the heavy geometry work
            setTimeout(() => {
                let next: PlannedOperation[] = [];
                try {
                    next = planOperations(panel, settings);
                } catch (e) {
                    toast.error(`Unable to generate the programs: ${(e as Error).message}`);
                }
                const prev = getSession();
                const patch: Partial<WizardSession> = { ops: next, builtFrom: { project, settings: key } };
                if (prev.restoredHashes) {
                    // first programs after a restore: keep only what still matches the programs that ran
                    patch.results = keepRestoredResults(next, prev.results, prev.restoredHashes, hashText);
                    patch.restoredHashes = null;
                    const map = findHeightMap(prev.heightMapId);
                    if (map && JSON.stringify(map.grid) !== JSON.stringify(heightMapGrid(next, settings))) {
                        patch.heightMapId = null;
                    }
                } else if (prev.ops.length) {
                    // the plan changed under a job in progress: forget what no longer holds
                    patch.results = keepResults(prev.ops, next, prev.results);
                    const sameArea = JSON.stringify(heightMapGrid(prev.ops, settings)) === JSON.stringify(heightMapGrid(next, settings));
                    if (!sameArea) {
                        // the map and its reference point were for the old isolation area
                        Object.assign(patch, { heightMapId: null, reference: null, zeroBit: null });
                    }
                }
                updateSession(patch);
                setSelected(null);
                setBusy(false);
            }, 30);
        }, 300);
        return () => clearTimeout(timer);
    }, [step, stale, panel, key]);

    const reparse = (files: InputFile[], layerOverrides: LayerOverrides) => {
        try {
            updateSession({ project: parseProject(files, layerOverrides) });
        } catch (e) {
            toast.error(`Unable to read the PCB files: ${(e as Error).message}`);
        }
    };

    const onFiles = async (files: File[]) => {
        setBusy(true);
        try {
            const read = await readInputFiles(files);
            resetMachineState();
            setOffer(null);
            // a new project starts with every stage; the choice is made in the plan
            setSettings((prev) => withStages(prev, ALL_STAGES));
            updateSession({
                restoredHashes: null,
                projectName: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'pcb',
                inputs: read,
                overrides: {},
                ops: [],
                builtFrom: null,
            });
            reparse(read, {});
        } catch (e) {
            toast.error(`Unable to read files: ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const onRestore = (stored: StoredSession, zeroKept: boolean) => {
        setOffer(null);
        setSettings((prev) => withStages(prev, stored.stages ?? ALL_STAGES));
        updateSession({
            step: restoreStep(stored.step, zeroKept, ZERO_STEP),
            inputs: stored.inputs,
            overrides: stored.overrides,
            projectName: stored.projectName,
            ops: [],
            builtFrom: null,
            xySet: zeroKept && stored.xySet,
            reference: zeroKept ? stored.reference : null,
            zeroBit: zeroKept ? stored.zeroBit : null,
            heightMapId: zeroKept ? stored.heightMapId : null,
            skipHeightMap: stored.skipHeightMap,
            results: stored.results,
            restoredHashes: stored.opHashes,
            runningId: null,
            loaded: null,
        });
        reparse(stored.inputs, stored.overrides);
        const started = Object.values(stored.results).some(isFinished);
        if (!zeroKept && (stored.xySet || stored.zeroBit)) {
            toast.warning(
                started
                    ? 'The machine position was not kept: set X0 Y0 exactly at the same blank corner before the remaining programs.'
                    : 'The machine position was not kept: set the work zero again.',
                { duration: 12000 },
            );
        }
    };

    const onDiscard = () => {
        setOffer(null);
        resetSession();
    };

    const onLayer = (name: string, kind: LayerKind) => {
        const next = { ...overrides, [name]: kind };
        updateSession({ overrides: next });
        reparse(inputs, next);
    };

    const update = (patch: Partial<WizardSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
    const updateStage = <K extends StageKind>(stage: K, patch: Partial<WizardSettings[K]>) =>
        setSettings((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));
    const updateProbe = (patch: Partial<ProbeSettings>) => setSettings((prev) => ({ ...prev, probe: { ...prev.probe, ...patch } }));

    // The G-code actually sent: isolation follows the map when it applies
    const mapInUse = settings.applyHeightMap && !session.skipHeightMap ? heightMap : null;
    const programs = useMemo(
        () => new Map<string, Program>(ops.map((op) => [op.id, buildProgram(op, mapInUse, reference)])),
        [ops, mapInUse, reference.x, reference.y],
    );
    const gcodeFor = (op: PlannedOperation) => programs.get(op.id)?.gcode ?? op.gcode;
    const mapWarnings = [...new Set([...programs.values()].flatMap((p) => p.warnings))];

    const loadProgram = async (op: PlannedOperation, index: number) => {
        const name = programFileName(projectName, index, op);
        const program = programs.get(op.id);
        if (!program) return false;
        try {
            await uploadGcodeFileToServer(new File([program.gcode], name), controller.port, VISUALIZER_PRIMARY);
            updateSession({ loaded: { opId: op.id, hash: program.hash, name } });
            return true;
        } catch (e) {
            toast.error(`Unable to load ${name}: ${(e as Error).message}`);
            return false;
        }
    };

    const onLoad = async (op: PlannedOperation, index: number) => {
        if (await loadProgram(op, index)) {
            setSelected(op.id);
            toast.success(`Loaded ${programFileName(projectName, index, op)}`);
        }
    };

    const onSaveAll = async () => {
        const zip = new JSZip();
        ops.forEach((op, index) => zip.file(programFileName(projectName, index, op), gcodeFor(op)));
        downloadBlob(`${projectName}_programs.zip`, await zip.generateAsync({ type: 'blob' }));
    };

    const hasCopper = !!board && board.copper.length > 0;
    const copies = layout?.copies.length ?? 0;
    const toolsOk =
        settings.tools.some((t) => t.kind === 'vbit') && settings.tools.some((t) => t.kind === 'endmill') && settings.drills.length > 0;
    // these need a decision; notes about the files (panel warnings) are shown but do not flag the step
    const problems = [...(layout?.warnings ?? []), ...planWarnings(settings)];
    const warnings = [...problems, ...(panel?.warnings ?? []), ...mapWarnings];
    const planReady = ops.length > 0 && !stale;
    const allDone = ops.length > 0 && ops.every((op) => isFinished(session.results[op.id]));
    const anyStopped = ops.some((op) => session.results[op.id] === 'stopped');
    const mapDone = !!heightMap || session.skipHeightMap;

    const steps: StepInfo[] = STEPS.map((s, index) => {
        if (index === 0) return { ...s, status: hasCopper ? 'done' : project ? 'attention' : 'todo' };
        if (!hasCopper) return { ...s, status: 'locked' };
        if (index === 1) return { ...s, status: copies > 0 ? (layout?.warnings.length ? 'attention' : 'done') : 'attention' };
        if (index === 2) return { ...s, status: toolsOk ? 'done' : 'attention' };
        if (index === 3) return { ...s, status: planReady ? (problems.length ? 'attention' : 'done') : 'todo' };
        // the machine steps work on generated programs
        if (!ops.length) return { ...s, status: 'locked' };
        if (index === 4) return { ...s, status: session.xySet && session.zeroBit ? 'done' : 'todo' };
        if (index === 5) return { ...s, status: mapDone ? 'done' : 'todo' };
        if (index === 6) return { ...s, status: allDone ? 'done' : anyStopped ? 'attention' : 'todo' };
        return { ...s, status: allDone ? 'done' : 'todo' };
    });
    // leaving a step mid-probing would stop listening to the probe while the machine keeps moving
    const canGo = (index: number) =>
        !session.probing && index >= 0 && index < STEPS.length && steps[index].status !== 'locked';

    const content = () => {
        if (step === 0 || !board || !layout || !panel) {
            return (
                <ProjectStep
                    restore={
                        offer && (
                            <RestoreCard
                                stored={offer}
                                stepTitle={STEPS[Math.min(offer.step, STEPS.length - 1)].title}
                                onContinue={(zeroKept) => onRestore(offer, zeroKept)}
                                onDiscard={onDiscard}
                            />
                        )
                    }
                    keepProject={settings.keepProject}
                    onKeepProject={(keepProject) => update({ keepProject })}
                    project={project}
                    board={board}
                    side={settings.side}
                    busy={busy}
                    onFiles={onFiles}
                    onLayer={onLayer}
                    onSide={(side) => update({ side })}
                />
            );
        }
        if (step === 1) {
            return <StockStep stock={settings.stock} board={board} panel={panel} layout={layout} onChange={(p) => update({ stock: { ...settings.stock, ...p } })} />;
        }
        if (step === 2) {
            return (
                <ToolsStep
                    tools={settings.tools}
                    drills={settings.drills}
                    isolationDepth={settings.isolation.depth}
                    onTools={(tools) => update({ tools })}
                    onDrills={(drills) => update({ drills })}
                />
            );
        }
        if (step === 3) {
            return (
                <PlanStep
                    settings={settings}
                    panel={panel}
                    ops={ops}
                    busy={busy || stale}
                    selected={selected}
                    warnings={warnings}
                    heightMapName={heightMap?.name ?? null}
                    onSettings={update}
                    onStage={updateStage}
                    onSelect={setSelected}
                    onLoad={onLoad}
                    onSave={(op, index) => downloadText(programFileName(projectName, index, op), gcodeFor(op))}
                    onSaveAll={onSaveAll}
                />
            );
        }
        if (!ops.length) {
            return <p className="text-sm text-gray-500">{busy || stale ? 'Preparing the programs...' : 'No programs in the plan.'}</p>;
        }
        if (step === 4) {
            return (
                <ZeroStep
                    probe={settings.probe}
                    reference={reference}
                    firstBit={{ key: bitKey(ops[0], settings), label: ops[0].tool }}
                    onProbe={updateProbe}
                />
            );
        }
        if (step === 5) {
            return (
                <HeightMapStep
                    grid={grid}
                    stock={settings.stock}
                    panel={panel}
                    projectName={projectName}
                    probe={settings.probe}
                    onProbe={updateProbe}
                />
            );
        }
        if (step === 6) {
            return (
                <RunStep
                    ops={ops}
                    programs={programs}
                    updating={busy || stale}
                    settings={settings}
                    projectName={projectName}
                    reference={reference}
                    heightMapReady={!!heightMap}
                    onLoad={loadProgram}
                    probe={settings.probe}
                    panel={panel}
                />
            );
        }
        return (
            <DoneStep
                ops={ops}
                boards={copies}
                onNewBlank={() => {
                    resetMachineState();
                    setStep(4);
                }}
                onNewProject={resetSession}
            />
        );
    };

    return (
        <div className="w-full h-full flex flex-col gap-2 dark:text-white min-h-0">
            <h1 className="flex items-baseline gap-2 min-w-0 whitespace-nowrap">
                <span className="text-xl font-bold">PCB Wizard</span>
                <span className="text-gray-400">/</span>
                <span className="text-lg font-semibold">
                    {step + 1}. {STEPS[step].title}
                </span>
                <span className="text-sm text-gray-500 truncate">
                    {STEPS[step].hint}
                    {project && ` · ${projectName}`}
                </span>
            </h1>
            <div className="flex flex-col min-h-0 flex-1">{content()}</div>
            {/* steps along the bottom, Back and Next at its ends */}
            <div className="flex items-center gap-3 border-t border-gray-200 dark:border-dark-lighter pt-2">
                <Button onClick={() => setStep(step - 1)} disabled={!canGo(step - 1)}>
                    Back
                </Button>
                <Stepper steps={steps} current={step} onSelect={(i) => canGo(i) && setStep(i)} />
                <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!canGo(step + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
};

export default PcbWizard;
