import { BoardModel } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, Check, Field, FieldGrid, Select } from '../../PcbMilling/components/controls';
import { Rotation, StockSettings } from '../definitions';
import { PanelLayout } from '../lib/panel';
import { StepColumns, Warnings } from '../components/Layout';

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
        <StepColumns
            left={
                <>
                    <Card>
                        <p className="text-sm font-semibold">Copper clad blank</p>
                        <FieldGrid cols={2}>
                            <Field label="Width (X)" value={stock.width} onChange={(v) => onChange({ width: v })} />
                            <Field label="Height (Y)" value={stock.height} onChange={(v) => onChange({ height: v })} />
                            <Field label="Margin to the edge" value={stock.margin} step={0.5} onChange={(v) => onChange({ margin: v })} />
                            <Field label="Gap between boards" value={stock.gap} step={0.5} onChange={(v) => onChange({ gap: v })} />
                        </FieldGrid>
                        <p className="text-xs text-gray-500">Work zero X0 Y0 is the lower-left corner of the blank.</p>
                    </Card>
                    <Card>
                        <p className="text-sm font-semibold">Boards on the blank</p>
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
                            Board {layout.boardWidth.toFixed(2)} × {layout.boardHeight.toFixed(2)} mm on the blank · {used.toFixed(0)}% of the blank used
                        </p>
                    </Card>
                </>
            }
            right={
                <>
                    <Card className="flex-1 min-h-0">
                        <div className="flex-1 min-h-0">
                            <PcbPreview model={panel} operations={[]} selectedId={null} stock={stock} />
                        </div>
                    </Card>
                    <Warnings items={layout.warnings} />
                </>
            }
        />
    );
};

export default StockStep;
