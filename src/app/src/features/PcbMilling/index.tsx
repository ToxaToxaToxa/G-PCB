import { useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';

import { VISUALIZER_PRIMARY } from 'app/constants';
import controller from 'app/lib/controller';
import { uploadGcodeFileToServer } from 'app/lib/fileupload';
import { toast } from 'app/lib/toaster';
import { Button } from 'app/components/Button';
import { ControlledInput } from 'app/components/ControlledInput';
import WidgetConfig from 'app/features/WidgetConfig/WidgetConfig';
import { applyHeightMap } from 'app/features/HeightMap/utils/applyHeightMap';
import { isMapComplete } from 'app/features/HeightMap/utils/heightMap';
import { loadHeightMapState } from 'app/features/HeightMap/utils/storage';

import { InputFile, LayerKind, Operation, PcbSettings } from './definitions';
import { DEFAULT_PCB_SETTINGS } from './lib/defaults';
import { BoardModel, ParsedProject, buildBoardModel, parseProject } from './lib/board';
import { buildOperations, vbitWidth } from './lib/toolpaths';
import { downloadText, readInputFiles } from './lib/files';
import PcbPreview from './components/PcbPreview';

const config = new WidgetConfig('pcbMilling');

const loadSettings = (): PcbSettings => {
    const saved = config.get('', {}) as Partial<PcbSettings>;
    return {
        ...DEFAULT_PCB_SETTINGS,
        ...saved,
        vbits: saved.vbits?.length ? saved.vbits : DEFAULT_PCB_SETTINGS.vbits,
        isolation: { ...DEFAULT_PCB_SETTINGS.isolation, ...saved.isolation },
        drilling: { ...DEFAULT_PCB_SETTINGS.drilling, ...saved.drilling },
        outline: { ...DEFAULT_PCB_SETTINGS.outline, ...saved.outline },
    };
};

const inputStyle = 'text-base font-light text-center text-blue-500 px-1 w-full';

const Num = ({
    label,
    value,
    onChange,
    suffix = 'mm',
    step,
    min,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    suffix?: string;
    step?: number;
    min?: number;
}) => (
    <label className="grid grid-cols-[1fr_7.5rem] items-center gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <ControlledInput
            type="number"
            suffix={suffix}
            step={step}
            min={min}
            className={inputStyle}
            wrapperClassName="w-full"
            value={value}
            immediateOnChange
            onChange={(e) => onChange(Number(e.target.value))}
        />
    </label>
);

const Select = <T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) => (
    <label className="grid grid-cols-[1fr_7.5rem] items-center gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <select
            className="border border-gray-300 dark:border-dark-lighter rounded px-1 py-1 bg-white dark:bg-dark text-sm"
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    </label>
);

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
    </label>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={cx('flex flex-col gap-2 border border-gray-200 dark:border-dark-lighter rounded-md p-3', className)}>
        {children}
    </div>
);

const LAYER_OPTIONS: { value: LayerKind; label: string }[] = [
    { value: 'top', label: 'Top copper' },
    { value: 'bottom', label: 'Bottom copper' },
    { value: 'outline', label: 'Board outline' },
    { value: 'drill', label: 'Drill' },
    { value: 'ignored', label: 'Ignore' },
];

const PcbMilling = () => {
    const [settings, setSettings] = useState<PcbSettings>(loadSettings);
    const [inputs, setInputs] = useState<InputFile[]>([]);
    const [projectName, setProjectName] = useState('pcb');
    const [overrides, setOverrides] = useState<Record<string, LayerKind>>({});
    const [project, setProject] = useState<ParsedProject | null>(null);
    const [model, setModel] = useState<BoardModel | null>(null);
    const [ops, setOps] = useState<Operation[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [stale, setStale] = useState(false);
    const [drillText, setDrillText] = useState(settings.drilling.drills.join(', '));
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        config.set('', settings);
        setStale(true);
    }, [settings]);

    const heightMap = useMemo(() => {
        const state = loadHeightMapState();
        const map = state.maps.find((m) => m.id === state.activeMapId);
        return map && isMapComplete(map) ? { map, apply: state.apply } : null;
    }, [ops]);

    const set = <K extends keyof PcbSettings>(key: K, value: PcbSettings[K]) =>
        setSettings((prev) => ({ ...prev, [key]: value }));
    const setIso = (patch: Partial<PcbSettings['isolation']>) =>
        setSettings((prev) => ({ ...prev, isolation: { ...prev.isolation, ...patch } }));
    const setDrill = (patch: Partial<PcbSettings['drilling']>) =>
        setSettings((prev) => ({ ...prev, drilling: { ...prev.drilling, ...patch } }));
    const setOutline = (patch: Partial<PcbSettings['outline']>) =>
        setSettings((prev) => ({ ...prev, outline: { ...prev.outline, ...patch } }));

    const generate = (files = inputs, layerOverrides = overrides, current = settings) => {
        if (!files.length) return;
        setBusy(true);
        // let the spinner render before the heavy geometry work
        setTimeout(() => {
            try {
                const parsed = parseProject(files, layerOverrides);
                const board = buildBoardModel(parsed, current.side);
                const operations = buildOperations(board, current);
                setProject(parsed);
                setModel(board);
                setOps(operations);
                setSelected(null);
                setStale(false);
                if (!operations.length) {
                    toast.error('Nothing to mill: check the detected layers');
                }
            } catch (e) {
                toast.error(`Unable to process the PCB files: ${(e as Error).message}`);
            } finally {
                setBusy(false);
            }
        }, 30);
    };

    const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const list = e.target.files;
        if (!list || !list.length) return;
        try {
            const files = await readInputFiles(list);
            e.target.value = '';
            const first = list[0].name.replace(/\.[^.]+$/, '');
            setProjectName(list.length === 1 ? first : 'pcb');
            setInputs(files);
            setOverrides({});
            generate(files, {});
        } catch (err) {
            toast.error(`Unable to read files: ${(err as Error).message}`);
        }
    };

    const gcodeFor = (op: Operation) => {
        if (op.kind === 'isolation' && settings.applyHeightMap && heightMap) {
            return applyHeightMap(op.gcode, heightMap.map, heightMap.apply).gcode;
        }
        return op.gcode;
    };

    const fileName = (op: Operation) => `${projectName}_${settings.side}_${op.id}.nc`;

    const loadOp = async (op: Operation) => {
        const name = fileName(op);
        const file = new File([gcodeFor(op)], name);
        try {
            await uploadGcodeFileToServer(file, controller.port, VISUALIZER_PRIMARY);
            setSelected(op.id);
            toast.success(`Loaded ${name}`);
        } catch (e) {
            toast.error(`Unable to load ${name}: ${(e as Error).message}`);
        }
    };

    const bit = settings.vbits.find((b) => b.id === settings.isolation.toolId) ?? settings.vbits[0];
    const cutWidth = bit ? vbitWidth(bit, settings.isolation.depth) : 0;

    const allWarnings = [...(project?.warnings ?? []), ...(model?.warnings ?? [])];

    return (
        <div className="w-full h-full flex flex-col gap-3 dark:text-white">
            <div className="grid grid-cols-[minmax(20rem,26rem)_1fr] max-lg:grid-cols-1 gap-4 min-h-0 flex-1">
                {/* ---------- settings column */}
                <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                    <Card>
                        <p className="text-sm text-gray-500 dark:text-gray-300">
                            Load the Gerber and drill files exported from Fusion 360 (CAMOutputs folder or zip),
                            KiCad, EasyEDA and others. Work zero X0 Y0 is the lower-left corner of the board, Z0 is
                            the copper surface. Values are in mm.
                        </p>
                        <div className="flex gap-2 items-center">
                            <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
                                Open Gerber files / zip
                            </Button>
                            {inputs.length > 0 && (
                                <Button onClick={() => generate()} disabled={busy}>
                                    {stale ? 'Regenerate' : 'Generate'}
                                </Button>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                multiple
                                className="hidden"
                                accept=".zip,.gbr,.ger,.gtl,.gbl,.gko,.gm1,.gml,.drl,.xln,.txt,.nc,.xnc,.exc,.cmp,.sol,.dim"
                                onChange={onFiles}
                            />
                        </div>
                        {project && (
                            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                                {project.files.map((f) => (
                                    <div key={f.name} className="grid grid-cols-[1fr_8rem] gap-2 items-center text-xs">
                                        <span className={cx('truncate', { 'text-gray-400': f.kind === 'ignored' })} title={f.name}>
                                            {f.name}
                                        </span>
                                        <select
                                            className="border border-gray-300 dark:border-dark-lighter rounded px-1 bg-white dark:bg-dark"
                                            value={f.kind}
                                            onChange={(e) => {
                                                const next = { ...overrides, [f.name]: e.target.value as LayerKind };
                                                setOverrides(next);
                                                generate(inputs, next);
                                            }}
                                        >
                                            {LAYER_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <Select
                            label="Side to mill"
                            value={settings.side}
                            options={[
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom (mirrored)' },
                            ]}
                            onChange={(v) => set('side', v)}
                        />
                        <Num label="Board thickness" value={settings.drilling.boardThickness} onChange={(v) => setDrill({ boardThickness: v })} />
                        <Num label="Travel Z" value={settings.travelZ} onChange={(v) => set('travelZ', v)} />
                        <Num label="Safe Z (start / end)" value={settings.safeZ} onChange={(v) => set('safeZ', v)} />
                    </Card>

                    <Card>
                        <Check label="Isolation routing" checked={settings.isolation.enabled} onChange={(v) => setIso({ enabled: v })} />
                        <Select
                            label="V-bit"
                            value={settings.isolation.toolId}
                            options={settings.vbits.map((b) => ({ value: b.id, label: `${b.angle}° / ${b.tipDiameter} mm` }))}
                            onChange={(v) => setIso({ toolId: v })}
                        />
                        <Num label="Depth" value={settings.isolation.depth} step={0.01} onChange={(v) => setIso({ depth: v })} />
                        <p className="text-xs text-gray-500">Cut width at this depth: {cutWidth.toFixed(3)} mm</p>
                        <Num label="Passes" suffix="" step={1} min={1} value={settings.isolation.passes} onChange={(v) => setIso({ passes: Math.max(1, Math.round(v)) })} />
                        <Num label="Pass overlap" suffix="%" value={Math.round(settings.isolation.overlap * 100)} onChange={(v) => setIso({ overlap: v / 100 })} />
                        <Num label="Feed" suffix="mm/min" value={settings.isolation.feed} onChange={(v) => setIso({ feed: v })} />
                        <Num label="Plunge" suffix="mm/min" value={settings.isolation.plunge} onChange={(v) => setIso({ plunge: v })} />
                        <Num label="Spindle" suffix="RPM" value={settings.isolation.rpm} onChange={(v) => setIso({ rpm: v })} />
                        <Select
                            label="Direction"
                            value={settings.isolation.direction}
                            options={[
                                { value: 'climb', label: 'Climb' },
                                { value: 'conventional', label: 'Conventional' },
                            ]}
                            onChange={(v) => setIso({ direction: v })}
                        />
                        <Check
                            label={heightMap ? `Apply height map "${heightMap.map.name}"` : 'Apply height map (none selected)'}
                            checked={settings.applyHeightMap}
                            onChange={(v) => set('applyHeightMap', v)}
                        />
                    </Card>

                    <Card>
                        <Check label="Drilling" checked={settings.drilling.enabled} onChange={(v) => setDrill({ enabled: v })} />
                        <label className="flex flex-col gap-1 text-sm">
                            <span className="text-gray-700 dark:text-gray-300">Available drills, mm</span>
                            <input
                                className="border border-gray-300 dark:border-dark-lighter rounded px-2 py-1 bg-white dark:bg-dark text-sm"
                                value={drillText}
                                onChange={(e) => setDrillText(e.target.value)}
                                onBlur={() => {
                                    const drills = [...new Set(drillText.split(/[,;\s]+/).map(Number).filter((n) => n > 0))].sort((a, b) => a - b);
                                    setDrill({ drills });
                                    setDrillText(drills.join(', '));
                                }}
                            />
                        </label>
                        <Num label="Breakthrough" value={settings.drilling.breakthrough} onChange={(v) => setDrill({ breakthrough: v })} />
                        <Num label="Plunge" suffix="mm/min" value={settings.drilling.plunge} onChange={(v) => setDrill({ plunge: v })} />
                        <Num label="Peck (0 = off)" value={settings.drilling.peck} onChange={(v) => setDrill({ peck: v })} />
                        <Num label="Spindle" suffix="RPM" value={settings.drilling.rpm} onChange={(v) => setDrill({ rpm: v })} />
                    </Card>

                    <Card>
                        <Check label="Board outline" checked={settings.outline.enabled} onChange={(v) => setOutline({ enabled: v })} />
                        <Num label="End mill diameter" value={settings.outline.endMillDiameter} onChange={(v) => setOutline({ endMillDiameter: v })} />
                        <Num label="Stepdown" value={settings.outline.stepdown} onChange={(v) => setOutline({ stepdown: v })} />
                        <Num label="Feed" suffix="mm/min" value={settings.outline.feed} onChange={(v) => setOutline({ feed: v })} />
                        <Num label="Plunge" suffix="mm/min" value={settings.outline.plunge} onChange={(v) => setOutline({ plunge: v })} />
                        <Num label="Spindle" suffix="RPM" value={settings.outline.rpm} onChange={(v) => setOutline({ rpm: v })} />
                        <Num label="Tabs" suffix="" step={1} value={settings.outline.tabs} onChange={(v) => setOutline({ tabs: Math.max(0, Math.round(v)) })} />
                        <Num label="Tab width" value={settings.outline.tabWidth} onChange={(v) => setOutline({ tabWidth: v })} />
                        <Num label="Tab height" value={settings.outline.tabHeight} onChange={(v) => setOutline({ tabHeight: v })} />
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={settings.outline.millLargeHoles}
                                onChange={(e) => setOutline({ millLargeHoles: e.target.checked })}
                            />
                            Mill holes larger than the biggest drill
                        </label>
                    </Card>
                </div>

                {/* ---------- preview and operations */}
                <div className="flex flex-col gap-3 min-h-0">
                    <Card className="flex-1 min-h-[20rem] relative">
                        {model && model.width > 0 ? (
                            <PcbPreview model={model} operations={ops} selectedId={selected} />
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                                {busy ? 'Processing...' : 'Open Gerber files to see the board'}
                            </div>
                        )}
                        {busy && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-dark/60 text-sm">
                                Generating toolpaths...
                            </div>
                        )}
                        {model && model.width > 0 && (
                            <p className="text-xs text-gray-500">
                                Board {model.width.toFixed(2)} × {model.height.toFixed(2)} mm, {settings.side} side
                                {stale && ' — settings changed, press Regenerate'}
                            </p>
                        )}
                    </Card>

                    {allWarnings.length > 0 && (
                        <Card>
                            {allWarnings.map((w) => (
                                <p key={w} className="text-xs text-orange-500">{w}</p>
                            ))}
                        </Card>
                    )}

                    {ops.length > 0 && (
                        <Card>
                            <p className="text-sm font-semibold">Operations — run them in this order, changing the bit between them</p>
                            {ops.map((op, index) => (
                                <div
                                    key={op.id}
                                    className={cx(
                                        'grid grid-cols-[1.5rem_1fr_auto] gap-2 items-center rounded p-1 cursor-pointer',
                                        selected === op.id ? 'bg-blue-50 dark:bg-dark-lighter' : 'hover:bg-gray-50 dark:hover:bg-dark-lighter',
                                    )}
                                    onClick={() => setSelected(selected === op.id ? null : op.id)}
                                >
                                    <span className="text-sm text-gray-500">{index + 1}.</span>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium">{op.name}</span>
                                        <span className="text-xs text-gray-500">
                                            {op.tool} · ~{Math.max(1, Math.round(op.stats.estimatedMinutes))} min · {op.stats.lines} lines
                                            {op.kind === 'isolation' && settings.applyHeightMap && heightMap && ' · height map applied'}
                                        </span>
                                        {op.warnings.map((w) => (
                                            <span key={w} className="text-xs text-orange-500">{w}</span>
                                        ))}
                                    </div>
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="primary" onClick={() => loadOp(op)} disabled={stale || busy}>
                                            Load
                                        </Button>
                                        <Button size="sm" onClick={() => downloadText(fileName(op), gcodeFor(op))} disabled={stale || busy}>
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PcbMilling;
