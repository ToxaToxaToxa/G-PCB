import { BoardModel } from '../../PcbMilling/lib/board';
import { Check, Field, FieldGrid, Select } from '../../PcbMilling/components/controls';
import { Rotation, StockSettings } from '../definitions';
import { PanelLayout } from '../lib/panel';
import SceneView, { BED_SCENE } from '../scene/SceneView';
import BlankOnBed from '../scene/BlankOnBed';
import ScenePanel from '../scene/ScenePanel';

interface Props {
    stock: StockSettings;
    board: BoardModel;
    panel: BoardModel;
    layout: PanelLayout;
    onChange: (patch: Partial<StockSettings>) => void;
}

const ROTATIONS: { value: string; label: string }[] = [
    { value: 'auto', label: 'Best fit' },
    { value: '0', label: 'As designed' },
    { value: '90', label: 'Rotated 90°' },
];

const StockStep = ({ stock, board, panel, layout, onChange }: Props) => {
    const count = layout.copies.length;
    const boardsArea = count * board.width * board.height;
    const used = stock.width * stock.height > 0 ? (boardsArea / (stock.width * stock.height)) * 100 : 0;

    return (
        <SceneView
            scene={BED_SCENE}
            overlay={(mapping) => (
                <BlankOnBed
                    mapping={mapping}
                    width={stock.width}
                    height={stock.height}
                    panel={panel}
                    onWidth={(v) => onChange({ width: v })}
                    onHeight={(v) => onChange({ height: v })}
                />
            )}
        >
            <ScenePanel>
                <p className="text-sm font-semibold">Boards on the blank</p>
                <FieldGrid cols={2}>
                    <Field label="Margin to the edge" value={stock.margin} step={0.5} onChange={(v) => onChange({ margin: v })} />
                    <Field label="Gap between boards" value={stock.gap} step={0.5} onChange={(v) => onChange({ gap: v })} />
                </FieldGrid>
                <Select
                    label="Orientation"
                    value={String(stock.rotation)}
                    options={ROTATIONS}
                    onChange={(v) => onChange({ rotation: (v === 'auto' ? 'auto' : Number(v)) as Rotation })}
                />
                <Check label="As many boards as fit" checked={stock.fill} onChange={(v) => onChange({ fill: v })} />
                {!stock.fill && (
                    <FieldGrid cols={2}>
                        <Field label="Columns (X)" suffix="" step={1} min={1} value={stock.cols} onChange={(v) => onChange({ cols: Math.max(1, Math.round(v)) })} />
                        <Field label="Rows (Y)" suffix="" step={1} min={1} value={stock.rows} onChange={(v) => onChange({ rows: Math.max(1, Math.round(v)) })} />
                    </FieldGrid>
                )}
                <p className="text-sm">
                    <span className="text-lg font-semibold">{count}</span> board{count === 1 ? '' : 's'} ({layout.cols} × {layout.rows})
                    {layout.rotated && ', rotated 90°'}
                </p>
                <p className="text-xs text-gray-500">
                    Board {layout.boardWidth.toFixed(2)} × {layout.boardHeight.toFixed(2)} mm · {used.toFixed(0)}% of the blank used
                </p>
                {layout.warnings.map((w) => (
                    <p key={w} className="text-xs text-orange-600">
                        {w}
                    </p>
                ))}
            </ScenePanel>
        </SceneView>
    );
};

export default StockStep;
