import { Fragment } from 'react';
import cx from 'classnames';
import { LuCheck } from 'react-icons/lu';

export type StepStatus = 'done' | 'attention' | 'todo' | 'locked';

export interface StepInfo {
    title: string;
    hint: string;
    status: StepStatus;
}

interface Props {
    steps: StepInfo[];
    current: number;
    onSelect: (index: number) => void;
}

// one background class per state: with `important: true` two competing
// bg-* classes resolve by stylesheet order, not by the order written here
const circleStyle = (status: StepStatus, active: boolean) => {
    if (status === 'done') return 'bg-green-500 border-green-500 text-white';
    if (status === 'attention') return 'bg-orange-100 border-orange-400 text-orange-600';
    if (active) return 'bg-white dark:bg-dark border-blue-500 text-blue-600';
    return 'bg-white dark:bg-dark border-gray-300 text-gray-500';
};

/** Step bar: numbered circles with titles, joined by lines between them. */
const Stepper = ({ steps, current, onSelect }: Props) => (
    <ol className="flex items-center w-full min-w-0 gap-1">
        {steps.map((step, index) => {
            const locked = step.status === 'locked';
            const active = index === current;
            return (
                <Fragment key={step.title}>
                    {index > 0 && (
                        <li
                            aria-hidden
                            className={cx(
                                'h-0.5 flex-1 min-w-2 rounded',
                                steps[index - 1].status === 'done' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600',
                            )}
                        />
                    )}
                    <li className="shrink-0">
                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => onSelect(index)}
                            title={step.hint}
                            aria-current={active ? 'step' : undefined}
                            className={cx(
                                'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5',
                                active ? 'ring-1 ring-blue-400 bg-gray-50 dark:bg-dark-lighter' : !locked && 'hover:bg-gray-100 dark:hover:bg-dark-lighter',
                                locked && 'opacity-50 cursor-not-allowed',
                            )}
                        >
                            <span
                                className={cx(
                                    'w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold shrink-0',
                                    circleStyle(step.status, active),
                                )}
                            >
                                {step.status === 'done' ? <LuCheck className="w-3.5 h-3.5" /> : index + 1}
                            </span>
                            <span
                                className={cx(
                                    'text-sm whitespace-nowrap',
                                    active ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300',
                                )}
                            >
                                {step.title}
                            </span>
                        </button>
                    </li>
                </Fragment>
            );
        })}
    </ol>
);

export default Stepper;
