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

const Stepper = ({ steps, current, onSelect }: Props) => (
    <ol className="flex flex-col gap-1">
        {steps.map((step, index) => {
            const locked = step.status === 'locked';
            const active = index === current;
            return (
                <li key={step.title}>
                    <button
                        type="button"
                        disabled={locked}
                        onClick={() => onSelect(index)}
                        className={cx(
                            'w-full grid grid-cols-[1.75rem_1fr] gap-2 items-center text-left rounded-md p-2',
                            active ? 'bg-blue-50 dark:bg-dark-lighter' : 'hover:bg-gray-50 dark:hover:bg-dark-lighter',
                            { 'opacity-50 cursor-not-allowed hover:bg-transparent': locked },
                        )}
                    >
                        <span
                            className={cx(
                                'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold border',
                                step.status === 'done' && 'bg-green-500 border-green-500 text-white',
                                step.status === 'attention' && 'bg-orange-100 border-orange-400 text-orange-600',
                                (step.status === 'todo' || locked) && 'border-gray-300 text-gray-500',
                                active && step.status !== 'done' && 'border-blue-500 text-blue-600',
                            )}
                        >
                            {step.status === 'done' ? <LuCheck /> : index + 1}
                        </span>
                        <span className="flex flex-col min-w-0">
                            <span className={cx('text-sm', active ? 'font-semibold' : 'font-medium')}>{step.title}</span>
                            <span className="text-xs text-gray-500 truncate">{step.hint}</span>
                        </span>
                    </button>
                </li>
            );
        })}
    </ol>
);

export default Stepper;
