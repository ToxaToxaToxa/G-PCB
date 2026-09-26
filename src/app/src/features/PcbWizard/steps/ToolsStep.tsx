import { useState } from 'react';
import { LuTrash2, LuX } from 'react-icons/lu';

import { Button } from 'app/components/Button';

import { vbitWidth } from '../../PcbMilling/lib/toolpaths';
import { DEFAULT_DRILLS } from '../../PcbMilling/lib/defaults';
import { Card, NumberInput } from '../../PcbMilling/components/controls';
import { Tool, ToolKind } from '../definitions';

interface Props {
    tools: Tool[];
    drills: number[];
    isolationDepth: number;
    onTools: (tools: Tool[]) => void;
    onDrills: (drills: number[]) => void;
}

const newId = (kind: ToolKind) => `${kind}-${Date.now().toString(36)}`;

export const toolLabel = (t: Tool) =>
    t.kind === 'vbit' ? `${t.name} (${t.angle}°, tip ${t.diameter} mm)` : `${t.name} (Ø${t.diameter} mm)`;

/**
 * "0.8, 1; 1,2" -> [0.8, 1, 1.2]. Spaces and semicolons separate values; a
 * lone comma between digits is a decimal comma, other commas separate.
 */
export const parseDrills = (text: string) =>
    [
        ...new Set(
            text
                .split(/[\s;]+/)
                .flatMap((t) => (/^\d+,\d+$/.test(t) ? [t.replace(',', '.')] : t.split(',')))
                .map(Number)
                .filter((d) => d > 0),
        ),
    ].sort((a, b) => a - b);

const nameBox = 'h-8 w-full min-w-0 rounded border border-gray-300 dark:border-dark-lighter bg-white dark:bg-dark px-2 text-sm';

const ToolsStep = ({ tools, drills, isolationDepth, onTools, onDrills }: Props) => {
    const [drillText, setDrillText] = useState('');

    const update = (id: string, patch: Partial<Tool>) => onTools(tools.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const add = (kind: ToolKind) =>
        onTools([
            ...tools,
            kind === 'vbit'
                ? { id: newId(kind), kind, name: 'V-bit', angle: 60, diameter: 0.1 }
                : { id: newId(kind), kind, name: 'End mill', diameter: 1 },
        ]);
    const addDrills = () => {
        const more = parseDrills(drillText);
        if (more.length) onDrills([...new Set([...drills, ...more])].sort((a, b) => a - b));
        setDrillText('');
    };

    const section = (kind: ToolKind) => {
        const list = tools.filter((t) => t.kind === kind);
        const vbit = kind === 'vbit';
        const cols = vbit ? 'grid-cols-[1fr_5rem_5rem_6rem_2rem]' : 'grid-cols-[1fr_5rem_2rem]';
        return (
            <Card>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{vbit ? 'V-bits — isolation' : 'End mills — outline and large holes'}</p>
                    <Button size="sm" onClick={() => add(kind)}>
                        {vbit ? 'Add V-bit' : 'Add end mill'}
                    </Button>
                </div>
                <div className={`grid ${cols} gap-2 items-end text-xs text-gray-500`}>
                    <span>Name</span>
                    <span>{vbit ? 'Tip, mm' : 'Ø, mm'}</span>
                    {vbit && <span>Angle, °</span>}
                    {vbit && <span>Cut at {isolationDepth} mm</span>}
                    <span />
                </div>
                {list.map((t) => (
                    <div key={t.id} className={`grid ${cols} gap-2 items-center text-sm`}>
                        <input className={nameBox} value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} aria-label="Name" />
                        <NumberInput value={t.diameter} step={0.05} min={0} onChange={(v) => update(t.id, { diameter: v })} ariaLabel="Diameter" />
                        {vbit && <NumberInput value={t.angle ?? 60} step={5} min={1} onChange={(v) => update(t.id, { angle: v })} ariaLabel="Angle" />}
                        {vbit && (
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                {vbitWidth({ angle: t.angle ?? 60, tipDiameter: t.diameter }, isolationDepth).toFixed(3)} mm
                            </span>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => onTools(tools.filter((x) => x.id !== t.id))} aria-label={`Remove ${t.name}`}>
                            <LuTrash2 />
                        </Button>
                    </div>
                ))}
                {!list.length && <p className="text-xs text-orange-600">Add at least one.</p>}
            </Card>
        );
    };

    return (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 min-h-0 flex-1 overflow-y-auto content-start">
            <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500 dark:text-gray-300">
                    The bits you have. Each stage of the plan picks one of them; cutting data is set in the plan.
                </p>
                {section('vbit')}
                {section('endmill')}
            </div>
            <Card className="self-start">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Drills</p>
                    <button type="button" className="text-xs text-gray-500 underline" onClick={() => onDrills(DEFAULT_DRILLS)}>
                        0.1 – 2.0 mm set
                    </button>
                </div>
                <p className="text-xs text-gray-500">
                    Every hole gets the nearest drill; holes bigger than the largest drill are milled with an end mill.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {drills.map((d) => (
                        <span key={d} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-dark-lighter pl-2.5 pr-1 py-0.5 text-sm">
                            {d}
                            <button
                                type="button"
                                aria-label={`Remove ${d} mm drill`}
                                className="rounded-full p-0.5 text-gray-500 hover:bg-gray-300 dark:hover:bg-gray-600"
                                onClick={() => onDrills(drills.filter((x) => x !== d))}
                            >
                                <LuX className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                    {!drills.length && <span className="text-xs text-orange-600">No drills: add the ones you have.</span>}
                </div>
                <div className="flex gap-2">
                    <input
                        className={nameBox}
                        placeholder="Add, e.g. 0.8 1.0 1.2"
                        value={drillText}
                        onChange={(e) => setDrillText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addDrills()}
                    />
                    <Button size="sm" onClick={addDrills} disabled={!drillText.trim()}>
                        Add
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default ToolsStep;
