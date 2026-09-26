import cx from 'classnames';
import { LuArrowDown, LuArrowUp } from 'react-icons/lu';

import { Button } from 'app/components/Button';

import { BoardModel } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, Check, Num, Select } from '../../PcbMilling/components/controls';
import { MillStage, StageKind, Tool, WizardSettings } from '../definitions';
import { PlannedOperation, isolationWidth } from '../lib/plan';
import { toolLabel } from './ToolsStep';

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

const toolOptions = (tools: Tool[], kind: Tool['kind'], current: string) => {
    const list = tools.filter((t) => t.kind === kind).map((t) => ({ value: t.id, label: toolLabel(t) }));
    // keep a missing or unsuitable tool visible so the warning makes sense
    if (!list.some((o) => o.value === current)) {
        list.unshift({ value: current, label: tools.find((t) => t.id === current)?.name ?? '(no tool)' });
    }
    return list;
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
    const move = (index: number, delta: number) => {
        const order = [...settings.order];
        const target = index + delta;
        [order[index], order[target]] = [order[target], order[index]];
        onSettings({ order });
    };

    const millFields = (stage: 'holes' | 'outline', m: MillStage) => (
        <>
            <Select
                label="End mill"
                value={m.toolId}
                options={toolOptions(settings.tools, 'endmill', m.toolId)}
                onChange={(v) => onStage(stage, { toolId: v })}
            />
            <Num label="Stepdown" value={m.stepdown} step={0.05} onChange={(v) => onStage(stage, { stepdown: v })} />
            <Num label="Feed" suffix="mm/min" value={m.feed} onChange={(v) => onStage(stage, { feed: v })} />
            <Num label="Plunge" suffix="mm/min" value={m.plunge} onChange={(v) => onStage(stage, { plunge: v })} />
            <Num label="Spindle" suffix="RPM" value={m.rpm} onChange={(v) => onStage(stage, { rpm: v })} />
        </>
    );

    const stageFields = (stage: StageKind) => {
        switch (stage) {
            case 'isolation': {
                const iso = settings.isolation;
                return (
                    <>
                        <Select
                            label="V-bit"
                            value={iso.toolId}
                            options={toolOptions(settings.tools, 'vbit', iso.toolId)}
                            onChange={(v) => onStage('isolation', { toolId: v })}
                        />
                        <Num label="Depth" value={iso.depth} step={0.01} onChange={(v) => onStage('isolation', { depth: v })} />
                        <p className="text-xs text-gray-500">Cut width at this depth: {isolationWidth(settings).toFixed(3)} mm</p>
                        <Num label="Passes" suffix="" step={1} min={1} value={iso.passes} onChange={(v) => onStage('isolation', { passes: Math.max(1, Math.round(v)) })} />
                        <Num label="Pass overlap" suffix="%" value={Math.round(iso.overlap * 100)} onChange={(v) => onStage('isolation', { overlap: v / 100 })} />
                        <Num label="Feed" suffix="mm/min" value={iso.feed} onChange={(v) => onStage('isolation', { feed: v })} />
                        <Num label="Plunge" suffix="mm/min" value={iso.plunge} onChange={(v) => onStage('isolation', { plunge: v })} />
                        <Num label="Spindle" suffix="RPM" value={iso.rpm} onChange={(v) => onStage('isolation', { rpm: v })} />
                        <Select
                            label="Direction"
                            value={iso.direction}
                            options={[
                                { value: 'climb', label: 'Climb' },
                                { value: 'conventional', label: 'Conventional' },
                            ]}
                            onChange={(v) => onStage('isolation', { direction: v })}
                        />
                        <Check
                            label={heightMapName ? `Apply height map "${heightMapName}"` : 'Apply height map (none measured yet)'}
                            checked={settings.applyHeightMap}
                            onChange={(v) => onSettings({ applyHeightMap: v })}
                        />
                    </>
                );
            }
            case 'drill': {
                const d = settings.drill;
                return (
                    <>
                        <p className="text-xs text-gray-500">Drills: {settings.drills.join(', ')} mm (set in Tools)</p>
                        <Num label="Plunge" suffix="mm/min" value={d.plunge} onChange={(v) => onStage('drill', { plunge: v })} />
                        <Num label="Spindle" suffix="RPM" value={d.rpm} onChange={(v) => onStage('drill', { rpm: v })} />
                        <Num label="Peck depth (0 = off)" value={d.peck} step={0.1} onChange={(v) => onStage('drill', { peck: v })} />
                    </>
                );
            }
            case 'holes':
                return millFields('holes', settings.holes);
            case 'outline': {
                const o = settings.outline;
                return (
                    <>
                        {millFields('outline', o)}
                        <Num label="Tabs per board" suffix="" step={1} value={o.tabs} onChange={(v) => onStage('outline', { tabs: Math.max(0, Math.round(v)) })} />
                        <Num label="Tab width" value={o.tabWidth} onChange={(v) => onStage('outline', { tabWidth: v })} />
                        <Num label="Tab height" value={o.tabHeight} onChange={(v) => onStage('outline', { tabHeight: v })} />
                    </>
                );
            }
        }
    };

    const totalMinutes = ops.reduce((s, op) => s + op.stats.estimatedMinutes, 0);

    return (
        <div className="grid grid-cols-[minmax(20rem,26rem)_1fr] max-lg:grid-cols-1 gap-4 min-h-0 flex-1">
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                <Card>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Stages run from top to bottom, one bit per stage. Each covers all boards on the blank.
                    </p>
                    <Num label="Board thickness" value={settings.boardThickness} onChange={(v) => onSettings({ boardThickness: v })} />
                    <Num label="Cut below the board" value={settings.breakthrough} step={0.05} onChange={(v) => onSettings({ breakthrough: v })} />
                    <Num label="Travel Z" value={settings.travelZ} onChange={(v) => onSettings({ travelZ: v })} />
                    <Num label="Safe Z (start / end)" value={settings.safeZ} onChange={(v) => onSettings({ safeZ: v })} />
                </Card>
                {settings.order.map((stage, index) => (
                    <Card key={stage} className={cx({ 'opacity-60': !settings[stage].enabled })}>
                        <div className="flex items-center justify-between gap-2">
                            <Check
                                label={`${index + 1}. ${STAGE_TITLES[stage]}`}
                                checked={settings[stage].enabled}
                                onChange={(v) => onStage(stage, { enabled: v })}
                            />
                            <div className="flex gap-1">
                                <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${STAGE_TITLES[stage]} up`}>
                                    <LuArrowUp />
                                </Button>
                                <Button size="icon" variant="ghost" disabled={index === settings.order.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${STAGE_TITLES[stage]} down`}>
                                    <LuArrowDown />
                                </Button>
                            </div>
                        </div>
                        {settings[stage].enabled && stageFields(stage)}
                    </Card>
                ))}
            </div>

            <div className="flex flex-col gap-3 min-h-0">
                <Card className="flex-1 min-h-[20rem] relative">
                    <div className="flex-1 min-h-0">
                        <PcbPreview model={panel} operations={ops} selectedId={selected} stock={settings.stock} />
                    </div>
                    {busy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-dark/60 text-sm">
                            Generating toolpaths...
                        </div>
                    )}
                </Card>

                {warnings.length > 0 && (
                    <Card>
                        {warnings.map((w) => (
                            <p key={w} className="text-xs text-orange-500">{w}</p>
                        ))}
                    </Card>
                )}

                {ops.length > 0 && (
                    <Card>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                                Programs · ~{Math.max(1, Math.round(totalMinutes))} min in total
                            </p>
                            <Button size="sm" onClick={onSaveAll} disabled={busy}>
                                Save all (zip)
                            </Button>
                        </div>
                        {ops.map((op, index) => (
                            <div
                                key={op.id}
                                className={cx(
                                    'grid grid-cols-[1.5rem_1fr_auto] gap-2 items-center rounded p-1 cursor-pointer',
                                    selected === op.id ? 'bg-blue-50 dark:bg-dark-lighter' : 'hover:bg-gray-50 dark:hover:bg-dark-lighter',
                                )}
                                onClick={() => onSelect(selected === op.id ? null : op.id)}
                            >
                                <span className="text-sm text-gray-500">{index + 1}.</span>
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium">{op.name}</span>
                                    <span className="text-xs text-gray-500">
                                        {op.tool} · ~{Math.max(1, Math.round(op.stats.estimatedMinutes))} min
                                        {op.kind === 'isolation' && settings.applyHeightMap && heightMapName && ' · height map applied'}
                                    </span>
                                    {op.warnings.map((w) => (
                                        <span key={w} className="text-xs text-orange-500">{w}</span>
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
                    </Card>
                )}
            </div>
        </div>
    );
};

export default PlanStep;
