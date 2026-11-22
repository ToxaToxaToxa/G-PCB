/*
 * Blank & array scene: the blank on the bed with its planned boards,
 * dimension lines along the front and left edges and the X0 Y0 corner. The
 * editable sizes sit on the dimension lines, unwarped, so they stay readable.
 */
import cx from 'classnames';

import { NumberInput } from '../../PcbMilling/components/controls';
import { BoardModel } from '../../PcbMilling/lib/board';
import BlankLayer, { blankToScreen } from './BlankLayer';
import { SceneMapping } from './SceneView';

const DIM = 12; // dimension line distance from the blank edge (mm)
const ARROW = 2.2;

/** A value on the scene: placed in screen pixels next to its dimension line. */
const Chip = ({
    at,
    place,
    label,
    value,
    onChange,
}: {
    at: [number, number];
    /** below the point, or left of it */
    place: 'below' | 'left';
    label: string;
    value: number;
    onChange: (v: number) => void;
}) => (
    <label
        className={cx(
            'absolute flex items-center gap-1.5 whitespace-nowrap rounded-md bg-white/90 px-2 py-1 text-xs text-gray-700 shadow ring-1 ring-black/10',
            place === 'below' ? '-translate-x-1/2' : '-translate-x-full -translate-y-1/2',
        )}
        style={{ left: at[0] + (place === 'left' ? -6 : 0), top: at[1] + (place === 'below' ? 6 : 0) }}
    >
        <span className="font-semibold">{label}</span>
        <span className="inline-block" style={{ width: '4.5rem' }}>
            <NumberInput value={value} onChange={onChange} ariaLabel={label} />
        </span>
        mm
    </label>
);

/** X0 Y0 marker in blank millimetres: X to the right, Y away from the viewer. */
export const ZeroMark = () => (
    <g strokeWidth={1.1} strokeLinecap="round">
        <line x1={0} y1={0} x2={14} y2={0} stroke="#dc2626" />
        <line x1={0} y1={0} x2={0} y2={14} stroke="#16a34a" />
        <circle cx={0} cy={0} r={2} fill="#fff" stroke="#111827" strokeWidth={0.6} />
    </g>
);

interface Props {
    mapping: SceneMapping;
    width: number;
    height: number;
    panel: BoardModel;
    onWidth: (v: number) => void;
    onHeight: (v: number) => void;
}

const BlankOnBed = ({ mapping, width, height, panel, onWidth, onHeight }: Props) => {
    const onBlank = blankToScreen(mapping, width, height);
    return (
        <>
            <BlankLayer mapping={mapping} width={width} height={height} panel={panel}>
                <g stroke="#1f2937" strokeWidth={0.45} fill="#1f2937">
                    {/* width: along the front edge */}
                    <line x1={0} y1={-2} x2={0} y2={-DIM - 3} />
                    <line x1={width} y1={-2} x2={width} y2={-DIM - 3} />
                    <line x1={0} y1={-DIM} x2={width} y2={-DIM} />
                    <path d={`M0 ${-DIM}l${ARROW * 2} ${ARROW}v${-ARROW * 2}Z`} stroke="none" />
                    <path d={`M${width} ${-DIM}l${-ARROW * 2} ${ARROW}v${-ARROW * 2}Z`} stroke="none" />
                    {/* height: along the left edge */}
                    <line x1={-2} y1={0} x2={-DIM - 3} y2={0} />
                    <line x1={-2} y1={height} x2={-DIM - 3} y2={height} />
                    <line x1={-DIM} y1={0} x2={-DIM} y2={height} />
                    <path d={`M${-DIM} 0l${-ARROW} ${ARROW * 2}h${ARROW * 2}Z`} stroke="none" />
                    <path d={`M${-DIM} ${height}l${-ARROW} ${-ARROW * 2}h${ARROW * 2}Z`} stroke="none" />
                </g>
                <ZeroMark />
            </BlankLayer>

            <Chip at={onBlank(width / 2, -DIM)} place="below" label="Width X" value={width} onChange={onWidth} />
            <Chip at={onBlank(-DIM, height / 2)} place="left" label="Height Y" value={height} onChange={onHeight} />
            {(() => {
                const [px, py] = onBlank(-DIM, -DIM);
                return (
                    <span
                        className="absolute -translate-x-full rounded bg-gray-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                        style={{ left: px - 6, top: py + 4 }}
                    >
                        X0 Y0 — lower-left corner
                    </span>
                );
            })()}
        </>
    );
};

export default BlankOnBed;
