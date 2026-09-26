import { BoardModel } from '../../PcbMilling/lib/board';
import PcbPreview from '../../PcbMilling/components/PcbPreview';
import { Card, Check, Num, Select } from '../../PcbMilling/components/controls';
import { Rotation, StockSettings } from '../definitions';
import { PanelLayout } from '../lib/panel';

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
        <div className="grid grid-cols-[minmax(20rem,26rem)_1fr] max-lg:grid-cols-1 gap-4 min-h-0 flex-1">
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
                <Card>
                    <p className="text-sm text-gray-500 dark:text-gray-300">
                        Enter the copper clad blank size. Boards are placed in an array; work zero X0 Y0 is the
                        lower-left corner of the blank.
                    </p>
                    <Num label="Blank width (X)" value={stock.width} onChange={(v) => onChange({ width: v })} />
                    <Num label="Blank height (Y)" value={stock.height} onChange={(v) => onChange({ height: v })} />
                    <Num label="Margin to the edge" value={stock.margin} onChange={(v) => onChange({ margin: v })} />
                    <Num label="Gap between boards" value={stock.gap} onChange={(v) => onChange({ gap: v })} />
                    <Select
                        label="Board orientation"
                        value={String(stock.rotation)}
                        options={ROTATIONS}
                        onChange={(v) => onChange({ rotation: (v === 'auto' ? 'auto' : Number(v)) as Rotation })}
                    />
                </Card>
                <Card>
                    <Check label="As many boards as fit" checked={stock.fill} onChange={(v) => onChange({ fill: v })} />
                    {!stock.fill && (
                        <>
                            <Num label="Columns (X)" suffix="" step={1} min={1} value={stock.cols} onChange={(v) => onChange({ cols: Math.max(1, Math.round(v)) })} />
                            <Num label="Rows (Y)" suffix="" step={1} min={1} value={stock.rows} onChange={(v) => onChange({ rows: Math.max(1, Math.round(v)) })} />
                        </>
                    )}
                    <p className="text-sm">
                        <span className="font-semibold">{count}</span> board{count === 1 ? '' : 's'} ({layout.cols} × {layout.rows})
                        {layout.rotated && ', rotated 90°'}
                    </p>
                    <p className="text-xs text-gray-500">
                        Board {layout.boardWidth.toFixed(2)} × {layout.boardHeight.toFixed(2)} mm on the blank · {used.toFixed(0)}% of the blank used
                    </p>
                    {layout.warnings.map((w) => (
                        <p key={w} className="text-xs text-orange-500">{w}</p>
                    ))}
                </Card>
            </div>

            <Card className="min-h-[20rem]">
                <div className="flex-1 min-h-0">
                    <PcbPreview model={panel} operations={[]} selectedId={null} stock={stock} />
                </div>
            </Card>
        </div>
    );
};

export default StockStep;
