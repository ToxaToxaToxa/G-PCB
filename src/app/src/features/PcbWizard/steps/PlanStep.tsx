import { useState } from 'react';
import cx from 'classnames';
import { LuArrowDown, LuArrowUp, LuChevronDown, LuChevronRight } from 'react-icons/lu';

import { Button } from 'app/components/Button';

import { BoardModel } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, Check, Field, FieldGrid, Select } from '../../PcbMilling/components/controls';
import { MillStage, StageKind, Tool, WizardSettings } from '../definitions';
import { PlannedOperation, findTool, isolationWidth } from '../lib/plan';
import { toolLabel } from './ToolsStep';
import { Warnings } from '../components/Layout';

export const STAGE_TITLES: Record<StageKind, string> = {
    isolation: 'Isolation',
    drill: 'Drilling',
    holes: 'Large holes',
    outline: 'Board outline',
};

interface Props {
    settings: WizardSettings;
    panel: BoardModel;
    ops: PlannedOperation[];
    busy: boolean;
    selected: string | null;
    warnings: string[];
    heightMapName: string | null;
    onSettings: (patch: Partial<WizardSettings>) => void;
    onStage: <K extends StageKind>(stage: K, patch: Partial<WizardSettings[K]>) => void;
    onSelect: (id: string | null) => void;
    onLoad: (op: PlannedOperation, index: number) => void;
    onSave: (op: PlannedOperation, index: number) => void;
    onSaveAll: () => void;
}

type Section = StageKind | 'common';

const toolOptions = (tools: Tool[], kind: Tool['kind'], current: string) => {
    const list = tools.filter((t) => t.kind === kind).map((t) => ({ value: t.id, label: toolLabel(t) }));
    // keep a missing or unsuitable tool visible so the warning makes sense
    if (!list.some((o) => o.value === current)) {
        list.unshift({ value: current, label: tools.find((t) => t.id === current)?.name ?? '(no tool)' });
    }
    return list;
};

const summary = (s: WizardSettings, stage: Section) => {
    const toolName = (id: string) => findTool(s, id)?.name ?? 'no tool';
    switch (stage) {
        case 'common':
            return `${s.boardThickness} mm board · ${s.breakthrough} mm below · travel ${s.travelZ} / safe ${s.safeZ} mm`;
        case 'isolation':
            return `${toolName(s.isolation.toolId)} · ${s.isolation.depth} mm deep · ${s.isolation.passes} pass${s.isolation.passes === 1 ? '' : 'es'}`;
        case 'drill':
            return `${s.drills.length} drill sizes · plunge ${s.drill.plunge} mm/min`;
        case 'holes':
            return `${toolName(s.holes.toolId)} · ${s.holes.stepdown} mm steps`;
        case 'outline':
            return `${toolName(s.outline.toolId)} · ${s.outline.stepdown} mm steps · ${s.outline.tabs} tabs`;
    }
};

const PlanStep = ({
    settings,
    panel,
    ops,
    busy,
    selected,
    warnings,
    heightMapName,
    onSettings,
    onStage,
    onSelect,
    onLoad,
    onSave,
    onSaveAll,
}: Props) => {
    const [open, setOpen] = useState<Section | null>('isolation');
    const toggle = (section: Section) => setOpen(open === section ? null : section);

    const move = (index: number, delta: number) => {
        const order = [...settings.order];
        const target = index + delta;
        [order[index], order[target]] = [order[target], order[index]];
        onSettings({ order });
    };

    const millFields = (stage: 'holes' | 'outline', m: MillStage) => (
        <>
            <Select
                stacked
                className="col-span-3"
                label="End mill"
                value={m.toolId}
                options={toolOptions(settings.tools, 'endmill', m.toolId)}
                onChange={(v) => onStage(stage, { toolId: v })}
            />
            <Field label="Stepdown" value={m.stepdown} step={0.05} onChange={(v) => onStage(stage, { stepdown: v })} />
            <Field label="Feed" suffix="mm/min" value={m.feed} step={10} onChange={(v) => onStage(stage, { feed: v })} />
            <Field label="Plunge" suffix="mm/min" value={m.plunge} step={5} onChange={(v) => onStage(stage, { plunge: v })} />
            <Field label="Spindle" suffix="RPM" value={m.rpm} step={1000} onChange={(v) => onStage(stage, { rpm: v })} />
        </>
    );

    const fields = (section: Section) => {
        switch (section) {
            case 'common':
                return (
                    <FieldGrid cols={2}>
                        <Field label="Board thickness" value={settings.boardThickness} step={0.1} onChange={(v) => onSettings({ boardThickness: v })} />
                        <Field label="Cut below the board" value={settings.breakthrough} step={0.05} onChange={(v) => onSettings({ breakthrough: v })} />
                        <Field label="Travel Z" value={settings.travelZ} step={0.5} onChange={(v) => onSettings({ travelZ: v })} />
                        <Field label="Safe Z (start / end)" value={settings.safeZ} step={1} onChange={(v) => onSettings({ safeZ: v })} />
                    </FieldGrid>
                );
            case 'isolation': {
                const iso = settings.isolation;
                return (
                    <>
                        <FieldGrid>
                            <Select
                                stacked
                                className="col-span-2"
                                label="V-bit"
                                value={iso.toolId}
                                options={toolOptions(settings.tools, 'vbit', iso.toolId)}
                                onChange={(v) => onStage('isolation', { toolId: v })}
                            />
                            <Select
                                stacked
                                label="Direction"
                                value={iso.direction}
                                options={[
                                    { value: 'climb', label: 'Climb' },
                                    { value: 'conventional', label: 'Conventional' },
                                ]}
                                onChange={(v) => onStage('isolation', { direction: v })}
                            />
                            <Field label="Depth" value={iso.depth} step={0.01} onChange={(v) => onStage('isolation', { depth: v })} hint="Copper is 0.035 mm thick" />
                            <Field label="Passes" suffix="" step={1} min={1} value={iso.passes} onChange={(v) => onStage('isolation', { passes: Math.max(1, Math.round(v)) })} />
                            <Field label="Pass overlap" suffix="%" step={5} value={Math.round(iso.overlap * 100)} onChange={(v) => onStage('isolation', { overlap: v / 100 })} />
                            <Field label="Feed" suffix="mm/min" step={10} value={iso.feed} onChange={(v) => onStage('isolation', { feed: v })} />
                            <Field label="Plunge" suffix="mm/min" step={5} value={iso.plunge} onChange={(v) => onStage('isolation', { plunge: v })} />
                            <Field label="Spindle" suffix="RPM" step={1000} value={iso.rpm} onChange={(v) => onStage('isolation', { rpm: v })} />
                        </FieldGrid>
                        <div className="flex items-center justify-between gap-2">
                            <Check
                                label={heightMapName ? `Apply height map "${heightMapName}"` : 'Apply the height map'}
                                checked={settings.applyHeightMap}
                                onChange={(v) => onSettings({ applyHeightMap: v })}
                            />
                            <span className="text-xs text-gray-500 shrink-0">cut width {isolationWidth(settings).toFixed(3)} mm</span>
                        </div>
                    </>
                );
            }
            case 'drill': {
                const d = settings.drill;
                return (
                    <>
                        <p className="text-xs text-gray-500">Drills: {settings.drills.join(', ')} mm (set in Tools)</p>
                        <FieldGrid>
                            <Field label="Plunge" suffix="mm/min" step={5} value={d.plunge} onChange={(v) => onStage('drill', { plunge: v })} />
                            <Field label="Spindle" suffix="RPM" step={1000} value={d.rpm} onChange={(v) => onStage('drill', { rpm: v })} />
                            <Field label="Peck (0 = off)" step={0.1} value={d.peck} onChange={(v) => onStage('drill', { peck: v })} />
                        </FieldGrid>
                    </>
                );
            }
            case 'holes':
                return <FieldGrid>{millFields('holes', settings.holes)}</FieldGrid>;
            case 'outline': {
                const o = settings.outline;
                return (
                    <FieldGrid>
                        {millFields('outline', o)}
                        <Field label="Tabs per board" suffix="" step={1} value={o.tabs} onChange={(v) => onStage('outline', { tabs: Math.max(0, Math.round(v)) })} />
                        <Field label="Tab width" step={0.5} value={o.tabWidth} onChange={(v) => onStage('outline', { tabWidth: v })} />
                        <Field label="Tab height" step={0.1} value={o.tabHeight} onChange={(v) => onStage('outline', { tabHeight: v })} />
                    </FieldGrid>
                );
            }
        }
    };

    const header = (section: Section, title: string, extra?: React.ReactNode, enabled = true) => (
        <div className="flex items-center gap-2 min-w-0">
            {extra}
            <button type="button" className="flex items-center gap-1.5 flex-1 min-w-0 text-left" onClick={() => toggle(section)}>
                {open === section ? <LuChevronDown className="shrink-0" /> : <LuChevronRight className="shrink-0" />}
                <span className="text-sm font-semibold shrink-0">{title}</span>
                {open !== section && enabled && <span className="text-xs text-gray-500 truncate">{summary(settings, section)}</span>}
                {!enabled && <span className="text-xs text-gray-400">off</span>}
            </button>
        </div>
    );

    const totalMinutes = ops.reduce((s, op) => s + op.stats.estimatedMinutes, 0);

    return (
        <div className="grid grid-cols-[minmax(0,30rem)_minmax(0,1fr)] gap-3 min-h-0 flex-1">
            <div className="flex flex-col gap-2 min-h-0 overflow-y-auto pr-1">
                <Card className="gap-1.5 py-2">
                    {header('common', 'Board and heights')}
                    {open === 'common' && fields('common')}
                </Card>
                {settings.order.map((stage, index) => {
                    const enabled = settings[stage].enabled;
                    return (
                        <Card key={stage} className={cx('gap-1.5 py-2', { 'opacity-70': !enabled })}>
                            <div className="flex items-center gap-1">
                                <div className="flex-1 min-w-0">
                                    {header(
                                        stage,
                                        `${index + 1}. ${STAGE_TITLES[stage]}`,
                                        <input
                                            type="checkbox"
                                            aria-label={`Run ${STAGE_TITLES[stage]}`}
                                            checked={enabled}
                                            onChange={(e) => onStage(stage, { enabled: e.target.checked })}
                                        />,
                                        enabled,
                                    )}
                                </div>
                                <Button size="icon" variant="ghost" className={cx({ invisible: index === 0 })} onClick={() => move(index, -1)} aria-label={`Move ${STAGE_TITLES[stage]} up`}>
                                    <LuArrowUp />
                                </Button>
                                <Button size="icon" variant="ghost" className={cx({ invisible: index === settings.order.length - 1 })} onClick={() => move(index, 1)} aria-label={`Move ${STAGE_TITLES[stage]} down`}>
                                    <LuArrowDown />
                                </Button>
                            </div>
                            {open === stage && enabled && fields(stage)}
                        </Card>
                    );
                })}
            </div>

            <div className="flex flex-col gap-2 min-h-0">
                <Card className="flex-1 min-h-[10rem] relative">
                    <div className="flex-1 min-h-0">
                        <PcbPreview model={panel} operations={ops} selectedId={selected} stock={settings.stock} />
                    </div>
                    {busy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-dark/60 text-sm">
                            Generating toolpaths...
                        </div>
                    )}
                </Card>

                <Warnings items={warnings} />

                {ops.length > 0 && (
                    <Card className="shrink min-h-0 max-h-[45%] gap-1 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                                {ops.length} program{ops.length === 1 ? '' : 's'} · ~{Math.max(1, Math.round(totalMinutes))} min
                            </p>
                            <Button size="sm" onClick={onSaveAll} disabled={busy}>
                                Save all (zip)
                            </Button>
                        </div>
                        <div className="flex flex-col min-h-0 overflow-y-auto">
                            {ops.map((op, index) => (
                                <div
                                    key={op.id}
                                    className={cx(
                                        'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-2 items-center rounded px-1 py-1 cursor-pointer',
                                        selected === op.id ? 'ring-1 ring-blue-400 bg-gray-50 dark:bg-dark-lighter' : 'hover:bg-gray-50 dark:hover:bg-dark-lighter',
                                    )}
                                    onClick={() => onSelect(selected === op.id ? null : op.id)}
                                >
                                    <span className="text-sm text-gray-500">{index + 1}.</span>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm truncate" title={op.tool}>
                                            <span className="font-medium">{op.name}</span>
                                            <span className="text-gray-500">
                                                {' '}
                                                · ~{Math.max(1, Math.round(op.stats.estimatedMinutes))} min
                                                {op.kind === 'isolation' && settings.applyHeightMap && heightMapName && ' · height map'}
                                            </span>
                                        </span>
                                        {op.warnings.map((w) => (
                                            <span key={w} className="text-xs text-orange-600">
                                                {w}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="primary" onClick={() => onLoad(op, index)} disabled={busy}>
                                            Load
                                        </Button>
                                        <Button size="sm" onClick={() => onSave(op, index)} disabled={busy}>
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default PlanStep;
