import cx from 'classnames';

/**
 * Two columns filling the step area. Only the left (settings) column
 * scrolls, and only when it has to; the right one sizes its own content.
 */
export const StepColumns = ({
    left,
    right,
    leftWidth = '26rem',
}: {
    left: React.ReactNode;
    right: React.ReactNode;
    leftWidth?: '26rem' | '30rem' | '34rem';
}) => (
    <div
        className={cx('grid gap-3 min-h-0 flex-1', {
            'grid-cols-[minmax(0,26rem)_minmax(0,1fr)]': leftWidth === '26rem',
            'grid-cols-[minmax(0,30rem)_minmax(0,1fr)]': leftWidth === '30rem',
            'grid-cols-[minmax(0,34rem)_minmax(0,1fr)]': leftWidth === '34rem',
        })}
    >
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto pr-1">{left}</div>
        <div className="flex flex-col gap-2 min-h-0">{right}</div>
    </div>
);

export const Warnings = ({ items }: { items: string[] }) =>
    items.length ? (
        <div className="shrink-0 rounded-md border border-gray-200 dark:border-dark-lighter border-l-4 border-l-orange-400 px-3 py-1.5">
            {items.map((w) => (
                <p key={w} className="text-xs text-gray-700 dark:text-gray-300">
                    {w}
                </p>
            ))}
        </div>
    ) : null;
