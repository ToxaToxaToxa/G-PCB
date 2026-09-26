import cx from 'classnames';

import { ControlledInput } from 'app/components/ControlledInput';

import { LayerKind } from '../definitions';

export const inputStyle = 'text-base font-light text-right text-blue-500 px-2 w-full';

export const Num = ({
    label,
    value,
    onChange,
    suffix = 'mm',
    step,
    min,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    suffix?: string;
    step?: number;
    min?: number;
}) => (
    <label className="grid grid-cols-[1fr_6rem_3.5rem] items-center gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        {/* units sit in their own column: the input's overlay suffix collides with the number */}
        <ControlledInput
            type="number"
            step={step}
            min={min}
            className={inputStyle}
            wrapperClassName="w-full"
            value={value}
            immediateOnChange
            onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{suffix}</span>
    </label>
);

export const Select = <T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) => (
    <label className="grid grid-cols-[1fr_10rem] items-center gap-2 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
        <select
            className="border border-gray-300 dark:border-dark-lighter rounded px-1 py-1 bg-white dark:bg-dark text-sm"
            value={value}
            onChange={(e) => onChange(e.target.value as T)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    </label>
);

export const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
    </label>
);

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={cx('flex flex-col gap-2 border border-gray-200 dark:border-dark-lighter rounded-md p-3', className)}>
        {children}
    </div>
);

export const LAYER_OPTIONS: { value: LayerKind; label: string }[] = [
    { value: 'top', label: 'Top copper' },
    { value: 'bottom', label: 'Bottom copper' },
    { value: 'outline', label: 'Board outline' },
    { value: 'drill', label: 'Drill' },
    { value: 'ignored', label: 'Ignore' },
];
