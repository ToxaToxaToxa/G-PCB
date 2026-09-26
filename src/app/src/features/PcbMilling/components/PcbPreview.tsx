import { useMemo } from 'react';
import { Operation } from '../definitions';
import { BoardModel } from '../lib/board';
import { Paths, toMm } from '../lib/geometry';

interface Props {
    model: BoardModel;
    operations: Operation[];
    selectedId: string | null;
    /** Stock outline from X0 Y0; the model is then the whole panel */
    stock?: { width: number; height: number };
}

const PAD = 4; // mm around the board

const pathData = (paths: Paths) =>
    paths
        .map((p) => 'M' + p.map(toMm).map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join('L') + 'Z')
        .join('');

const polyline = (pts: [number, number][]) =>
    pts.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join(' ');

const COLORS: Record<string, string> = {
    isolation: '#2563eb',
    drill: '#111827',
    holes: '#7c3aed',
    outline: '#dc2626',
};

const PcbPreview = ({ model, operations, selectedId, stock }: Props) => {
    const copper = useMemo(() => pathData(model.copper), [model.copper]);
    const board = useMemo(() => pathData(model.board), [model.board]);

    const w = model.width + PAD * 2;
    const h = model.height + PAD * 2;
    const hairline = Math.max(w, h) / 600;

    return (
        <svg
            viewBox={`${-PAD} ${-model.height - PAD} ${w} ${h}`}
            className="w-full h-full bg-white dark:bg-dark-darker rounded"
            role="img"
            aria-label="PCB toolpath preview"
        >
            {stock && (
                <rect
                    x={0}
                    y={-stock.height}
                    width={stock.width}
                    height={stock.height}
                    fill="#b45309"
                    fillOpacity={0.08}
                    stroke="#92400e"
                    strokeWidth={hairline * 1.5}
                    strokeDasharray={`${hairline * 6} ${hairline * 4}`}
                />
            )}
            {board && (
                <path d={board} fill="#14532d" fillOpacity={0.15} stroke="#15803d" strokeWidth={hairline * 1.5} fillRule="evenodd" />
            )}
            <path d={copper} fill="#d97706" fillOpacity={0.55} fillRule="nonzero" />
            {operations.map((op) => {
                const active = selectedId === null || selectedId === op.id;
                const color = COLORS[op.kind];
                return (
                    <g key={op.id} opacity={active ? 1 : 0.15}>
                        {op.paths.map((p, i) => (
                            <polyline key={i} points={polyline(p)} fill="none" stroke={color} strokeWidth={hairline} />
                        ))}
                        {op.points.map(([x, y], i) => (
                            <circle
                                key={i}
                                cx={x}
                                cy={-y}
                                r={Math.max(Number(op.name.match(/[\d.]+/)?.[0] ?? 0.3) / 2, hairline * 2)}
                                fill={color}
                            />
                        ))}
                        {(op.unisolated ?? []).map((p, i) => (
                            <polygon key={`u${i}`} points={polyline(p)} fill="#ef4444" stroke="#ef4444" strokeWidth={hairline * 3} />
                        ))}
                    </g>
                );
            })}
            <g stroke="#6b7280" strokeWidth={hairline}>
                <line x1={0} y1={0} x2={Math.min(5, model.width / 4)} y2={0} />
                <line x1={0} y1={0} x2={0} y2={-Math.min(5, model.height / 4)} />
            </g>
            <text x={0.5} y={2.5} fontSize={Math.max(w, h) / 45} fill="#6b7280">
                X0 Y0
            </text>
        </svg>
    );
};

export default PcbPreview;
