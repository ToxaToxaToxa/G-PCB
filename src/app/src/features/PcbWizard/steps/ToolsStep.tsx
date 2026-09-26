import { useEffect, useState } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import { Button } from 'app/components/Button';
import { ControlledInput } from 'app/components/ControlledInput';

import { vbitWidth } from '../../PcbMilling/lib/toolpaths';
import { Card, inputStyle } from '../../PcbMilling/components/controls';
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

/** "0.8, 1, 1.2" -> [0.8, 1, 1.2]; ignores anything that is not a positive number. */
export const parseDrills = (text: string) =>
    [...new Set(text.split(/[\s,;]+/).map(Number).filter((d) => d > 0))].sort((a, b) => a - b);

const NumCell = ({ value, onChange, step }: { value: number; onChange: (v: number) => void; step?: number }) => (
    <ControlledInput
        type="number"
        step={step}
        className={inputStyle}
        wrapperClassName="w-full"
        sizing="sm"
        value={value}
        immediateOnChange
        onChange={(e) => onChange(Number(e.target.value))}
    />
);

const ToolsStep = ({ tools, drills, isolationDepth, onTools, onDrills }: Props) => {
    const [drillText, setDrillText] = useState(drills.join(', '));
    useEffect(() => setDrillText(drills.join(', ')), [drills]);

    const update = (id: string, patch: Partial<Tool>) => onTools(tools.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const add = (kind: ToolKind) =>
        onTools([
            ...tools,
            kind === 'vbit'
                ? { id: newId(kind), kind, name: 'V-bit', angle: 60, diameter: 0.1 }
                : { id: newId(kind), kind, name: 'End mill', diameter: 1 },
        ]);

    const section = (kind: ToolKind) => {
        const list = tools.filter((t) => t.kind === kind);
        return (
            <Card>
                <p className="text-sm font-semibold">{kind === 'vbit' ? 'V-bits (isolation)' : 'End mills (outline, large holes)'}</p>
                <div className="grid grid-cols-[1fr_5.5rem_5.5rem_7rem_2rem] gap-2 items-center text-xs text-gray-500">
                    <span>Name</span>
                    <span>{kind === 'vbit' ? 'Tip, mm' : 'Diameter, mm'}</span>
                    <span>{kind === 'vbit' ? 'Angle, °' : ''}</span>
                    <span>{kind === 'vbit' ? `Cut width at ${isolationDepth} mm` : ''}</span>
                    <span />
                </div>
                {list.map((t) => (
                    <div key={t.id} className="grid grid-cols-[1fr_5.5rem_5.5rem_7rem_2rem] gap-2 items-center text-sm">
                        <input
                            className="border border-gray-300 dark:border-dark-lighter rounded px-2 h-8 bg-white dark:bg-dark"
                            value={t.name}
                            onChange={(e) => update(t.id, { name: e.target.value })}
                        />
                        <NumCell value={t.diameter} step={0.05} onChange={(v) => update(t.id, { diameter: v })} />
                        {kind === 'vbit' ? (
                            <NumCell value={t.angle ?? 60} step={5} onChange={(v) => update(t.id, { angle: v })} />
                        ) : (
                            <span />
                        )}
                        <span className="text-xs text-gray-500">
                            {kind === 'vbit' ? `${vbitWidth({ angle: t.angle ?? 60, tipDiameter: t.diameter }, isolationDepth).toFixed(3)} mm` : ''}
                        </span>
                        <Button size="icon" variant="ghost" onClick={() => onTools(tools.filter((x) => x.id !== t.id))} aria-label={`Remove ${t.name}`}>
                            <LuTrash2 />
                        </Button>
                    </div>
                ))}
                <div>
                    <Button size="sm" onClick={() => add(kind)}>
                        {kind === 'vbit' ? 'Add V-bit' : 'Add end mill'}
                    </Button>
                </div>
            </Card>
        );
    };

    return (
        <div className="flex flex-col gap-3 overflow-y-auto max-w-3xl">
            <p className="text-sm text-gray-500 dark:text-gray-300">
                The bits you have. Each stage of the plan picks one of them; its feeds are set in the plan.
            </p>
            {section('vbit')}
            {section('endmill')}
            <Card>
                <p className="text-sm font-semibold">Drills</p>
                <p className="text-xs text-gray-500">
                    Diameters in mm, separated by commas. Every hole gets the nearest drill; holes bigger than the
                    largest drill are milled with an end mill.
                </p>
                <input
                    className="border border-gray-300 dark:border-dark-lighter rounded px-2 h-8 bg-white dark:bg-dark text-sm"
                    value={drillText}
                    onChange={(e) => setDrillText(e.target.value)}
                    onBlur={() => onDrills(parseDrills(drillText))}
                />
            </Card>
        </div>
    );
};

export default ToolsStep;
