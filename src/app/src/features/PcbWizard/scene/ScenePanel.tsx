import cx from 'classnames';

/** Floating panel over a scene, in the empty space beside the machine. */
const ScenePanel = ({
    children,
    side = 'left',
    className,
}: {
    children: React.ReactNode;
    side?: 'left' | 'right';
    className?: string;
}) => (
    <div
        className={cx(
            'absolute top-3 flex max-h-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto rounded-md bg-white/90 p-3 shadow ring-1 ring-black/10 backdrop-blur-sm dark:bg-dark/90 dark:ring-white/10',
            side === 'left' ? 'left-3' : 'right-3',
            className ?? 'w-64',
        )}
    >
        {children}
    </div>
);

export default ScenePanel;
