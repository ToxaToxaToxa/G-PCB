/*
 * Step-by-step PCB workflow: project -> blank and array -> tools -> plan.
 * Machine steps (zero, height map, run) come next; they are shown locked.
 */
import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';

import { VISUALIZER_PRIMARY } from 'app/constants';
import controller from 'app/lib/controller';
import { uploadGcodeFileToServer } from 'app/lib/fileupload';
import { toast } from 'app/lib/toaster';
import { Button } from 'app/components/Button';
import WidgetConfig from 'app/features/WidgetConfig/WidgetConfig';
import { applyHeightMap } from 'app/features/HeightMap/utils/applyHeightMap';
import { isMapComplete } from 'app/features/HeightMap/utils/heightMap';
import { loadHeightMapState } from 'app/features/HeightMap/utils/storage';

import { InputFile, LayerKind } from '../PcbMilling/definitions';
import { BoardModel, ParsedProject, buildBoardModel, parseProject } from '../PcbMilling/lib/board';
import { downloadText, readInputFiles } from '../PcbMilling/lib/files';
import { LayerOverrides, StageKind, WizardSettings } from './definitions';
import { DEFAULT_ORDER, DEFAULT_WIZARD_SETTINGS } from './lib/defaults';
import { layoutPanel, panelizeModel } from './lib/panel';
import { PlannedOperation, planOperations, planWarnings, programFileName } from './lib/plan';
import Stepper, { StepInfo } from './components/Stepper';
import ProjectStep from './steps/ProjectStep';
import StockStep from './steps/StockStep';
import ToolsStep from './steps/ToolsStep';
import PlanStep from './steps/PlanStep';

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
    };
};

const STEPS = [
    { title: 'Project', hint: 'Gerber files and layers' },
    { title: 'Blank & array', hint: 'Stock size, boards on it' },
    { title: 'Tools', hint: 'V-bits, end mills, drills' },
    { title: 'Plan', hint: 'Stages, order, programs' },
    { title: 'Work zero', hint: 'Next stage: on the machine' },
    { title: 'Height map', hint: 'Next stage: probe the blank' },
    { title: 'Run', hint: 'Next stage: stage by stage' },
    { title: 'Done', hint: 'Next stage' },
];
const MACHINE_STEP = 4;

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
    const [step, setStep] = useState(0);
    const [inputs, setInputs] = useState<InputFile[]>([]);
    const [overrides, setOverrides] = useState<LayerOverrides>({});
    const [projectName, setProjectName] = useState('pcb');
    const [project, setProject] = useState<ParsedProject | null>(null);
    const [ops, setOps] = useState<PlannedOperation[]>([]);
    /** Inputs the current programs were generated from */
    const [builtFrom, setBuiltFrom] = useState<{ panel: BoardModel; settings: WizardSettings } | null>(null);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        config.set('', settings);
    }, [settings]);

    const board = useMemo(() => (project ? buildBoardModel(project, settings.side) : null), [project, settings.side]);
    const layout = useMemo(
        () => (board ? layoutPanel(board.width, board.height, settings.stock) : null),
        [board, settings.stock],
    );
    const panel = useMemo(
        () => (board && layout ? panelizeModel(board, layout, settings.stock) : null),
        [board, layout, settings.stock],
    );
    const stale = !builtFrom || builtFrom.panel !== panel || builtFrom.settings !== settings;

    useEffect(() => {
        // new files without copper: only the project step makes sense
        if (!board?.copper.length) setStep(0);
    }, [board]);

    const heightMap = useMemo(() => {
        const state = loadHeightMapState();
        const map = state.maps.find((m) => m.id === state.activeMapId);
        return map && isMapComplete(map) ? { map, apply: state.apply } : null;
    }, [step]);

    // regenerate the programs a moment after the plan inputs settle
    useEffect(() => {
        if (step !== 3 || !stale || !panel) return undefined;
        const timer = setTimeout(() => {
            setBusy(true);
            // let the spinner render before the heavy geometry work
            setTimeout(() => {
                try {
                    setOps(planOperations(panel, settings));
                    setSelected(null);
                } catch (e) {
                    setOps([]);
                    toast.error(`Unable to generate the programs: ${(e as Error).message}`);
                } finally {
                    setBuiltFrom({ panel, settings });
                    setBusy(false);
                }
            }, 30);
        }, 300);
        return () => clearTimeout(timer);
    }, [step, stale, panel, settings]);

    const reparse = (files: InputFile[], layerOverrides: LayerOverrides) => {
        try {
            setProject(parseProject(files, layerOverrides));
        } catch (e) {
            toast.error(`Unable to read the PCB files: ${(e as Error).message}`);
        }
    };

    const onFiles = async (files: File[]) => {
        setBusy(true);
        try {
            const read = await readInputFiles(files);
            setProjectName(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'pcb');
            setInputs(read);
            setOverrides({});
            setOps([]);
            reparse(read, {});
        } catch (e) {
            toast.error(`Unable to read files: ${(e as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const onLayer = (name: string, kind: LayerKind) => {
        const next = { ...overrides, [name]: kind };
        setOverrides(next);
        reparse(inputs, next);
    };

    const update = (patch: Partial<WizardSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
    const updateStage = <K extends StageKind>(stage: K, patch: Partial<WizardSettings[K]>) =>
        setSettings((prev) => ({ ...prev, [stage]: { ...prev[stage], ...patch } }));

    const gcodeFor = (op: PlannedOperation) =>
        op.kind === 'isolation' && settings.applyHeightMap && heightMap
            ? applyHeightMap(op.gcode, heightMap.map, heightMap.apply).gcode
            : op.gcode;

    const onLoad = async (op: PlannedOperation, index: number) => {
        const name = programFileName(projectName, index, op);
        try {
            await uploadGcodeFileToServer(new File([gcodeFor(op)], name), controller.port, VISUALIZER_PRIMARY);
            setSelected(op.id);
            toast.success(`Loaded ${name}`);
        } catch (e) {
            toast.error(`Unable to load ${name}: ${(e as Error).message}`);
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
    const warnings = [...(layout?.warnings ?? []), ...planWarnings(settings), ...(panel?.warnings ?? [])];

    const steps: StepInfo[] = STEPS.map((s, index) => {
        if (index === 0) return { ...s, status: hasCopper ? 'done' : project ? 'attention' : 'todo' };
        if (index >= MACHINE_STEP) return { ...s, status: 'locked' };
        if (!hasCopper) return { ...s, status: 'locked' };
        if (index === 1) return { ...s, status: copies > 0 ? (layout?.warnings.length ? 'attention' : 'done') : 'attention' };
        if (index === 2) return { ...s, status: toolsOk ? 'done' : 'attention' };
        return { ...s, status: ops.length && !stale ? (warnings.length ? 'attention' : 'done') : 'todo' };
    });
    const canGo = (index: number) => index >= 0 && index < MACHINE_STEP && steps[index].status !== 'locked';

    const content = () => {
        if (step === 0 || !board || !layout || !panel) {
            return (
                <ProjectStep
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
        return (
            <PlanStep
                settings={settings}
                panel={panel}
                ops={ops}
                busy={busy || stale}
                selected={selected}
                warnings={warnings}
                heightMapName={heightMap?.map.name ?? null}
                onSettings={update}
                onStage={updateStage}
                onSelect={setSelected}
                onLoad={onLoad}
                onSave={(op, index) => downloadText(programFileName(projectName, index, op), gcodeFor(op))}
                onSaveAll={onSaveAll}
            />
        );
    };

    return (
        <div className="w-full h-full grid grid-cols-[15rem_1fr] max-lg:grid-cols-1 gap-4 dark:text-white min-h-0">
            <div className="flex flex-col gap-3 overflow-y-auto">
                <Stepper steps={steps} current={step} onSelect={(i) => canGo(i) && setStep(i)} />
            </div>
            <div className="flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">
                        {step + 1}. {STEPS[step].title}
                        {project && <span className="ml-2 text-sm font-normal text-gray-500">{projectName}</span>}
                    </h2>
                    <div className="flex gap-2">
                        <Button onClick={() => setStep(step - 1)} disabled={!canGo(step - 1)}>
                            Back
                        </Button>
                        <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!canGo(step + 1)}>
                            Next
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col min-h-0 flex-1">{content()}</div>
            </div>
        </div>
    );
};

export default PcbWizard;
