/*
 * A label tied to a point of the scene by a leader line, as on an assembly
 * drawing. `offset` moves the label from the point, in screen pixels.
 */
import cx from 'classnames';

const Callout = ({
    at,
    offset,
    children,
    className,
}: {
    at: [number, number];
    offset: [number, number];
    children: React.ReactNode;
    className?: string;
}) => {
    const [x, y] = at;
    const [dx, dy] = offset;
    const lx = x + dx;
    const ly = y + dy;
    return (
        <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <line x1={x} y1={y} x2={lx} y2={ly} stroke="#111827" strokeWidth={1.2} />
                <circle cx={x} cy={y} r={3.5} fill="#fff" stroke="#111827" strokeWidth={1.2} />
            </svg>
            <div
                className={cx(
                    'absolute flex flex-col gap-1.5 rounded-md bg-white/90 px-2.5 py-1.5 text-xs text-gray-700 shadow ring-1 ring-black/10',
                    dx < 0 ? '-translate-x-full' : '',
                    '-translate-y-1/2',
                    className,
                )}
                style={{ left: lx, top: ly }}
            >
                {children}
            </div>
        </>
    );
};

export default Callout;
