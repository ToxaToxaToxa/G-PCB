import { useEffect, useState } from 'react';
import cx from 'classnames';

import { LayerKind } from '../definitions';

// Tailwind runs with `important: true` here, so these controls style plain
// elements instead of fighting the paddings of the shared input component.
const inputBox =
    'h-8 w-full min-w-0 rounded border border-gray-300 dark:border-dark-lighter bg-white dark:bg-dark px-2 text-sm text-right text-blue-600 dark:text-blue-300 focus:outline-none focus:border-blue-500';

/**
 * Number input that keeps what is being typed and reports only valid
 * numbers. A comma works as the decimal point; arrow keys step the value.
 */
export const NumberInput = ({
    value,
    onChange,
    step,
    min,
    className,
    ariaLabel,
}: {
    value: number;
    onChange: (v: number) => void;
    step?: number;
    min?: number;
    className?: string;
    ariaLabel?: string;
}) => {
    const [text, setText] = useState(String(value));
    const [focused, setFocused] = useState(false);
    useEffect(() => {
        if (!focused) setText(String(value));
    }, [value, focused]);

    const commit = (raw: string) => {
        const v = Number(raw.replace(',', '.'));
        if (raw.trim() !== '' && Number.isFinite(v) && (min === undefined || v >= min)) onChange(v);
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            aria-label={ariaLabel}
            className={cx(inputBox, className)}
            value={text}
            onFocus={(e) => {
                setFocused(true);
                e.target.select();
            }}
            onBlur={() => {
                setFocused(false);
                setText(String(value));
            }}
            onChange={(e) => {
                setText(e.target.value);
                commit(e.target.value);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && step) {
                    e.preventDefault();
                    const next = Number((value + (e.key === 'ArrowUp' ? step : -step)).toFixed(6));
                    if (min === undefined || next >= min) {
                        onChange(next);
                        setText(String(next));
                    }
                }
            }}
        />
    );
};

/** Label, number and unit in one row. */
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
        <NumberInput value={value} onChange={onChange} step={step} min={min} ariaLabel={label} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{suffix}</span>
    </label>
);

/** Label above the number, unit after it; several fit in one row of a FieldGrid. */
export const Field = ({
    label,
    value,
    onChange,
    suffix = 'mm',
    step,
    min,
    hint,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    suffix?: string;
    step?: number;
    min?: number;
    hint?: string;
}) => (
    <label className="flex flex-col gap-0.5 min-w-0" title={hint}>
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{label}</span>
        <span className="flex items-center gap-1 min-w-0">
            {/* a capped width keeps numbers compact on wide screens (w-* would lose to w-full here) */}
            <NumberInput value={value} onChange={onChange} step={step} min={min} ariaLabel={label} className="max-w-[7rem]" />
            {suffix && <span className="w-12 text-xs text-gray-500 dark:text-gray-400 shrink-0">{suffix}</span>}
        </span>
    </label>
);

export const FieldGrid = ({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) => (
    <div
        className={cx('grid gap-x-3 gap-y-2', {
            'grid-cols-2': cols === 2,
            'grid-cols-3': cols === 3,
            'grid-cols-4': cols === 4,
        })}
    >
        {children}
    </div>
);

const selectBox = 'h-8 w-full min-w-0 rounded border border-gray-300 dark:border-dark-lighter bg-white dark:bg-dark px-1 text-sm';

export const Select = <T extends string>({
    label,
    value,
    options,
    onChange,
    stacked,
    className,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    /** Label above the list, for use in a FieldGrid */
    stacked?: boolean;
    className?: string;
}) => (
    <label
        className={cx(
            stacked ? 'flex flex-col gap-0.5 min-w-0' : 'grid grid-cols-[1fr_10rem] items-center gap-2 text-sm',
            className,
        )}
    >
        <span className={stacked ? 'text-xs text-gray-600 dark:text-gray-300' : 'text-gray-700 dark:text-gray-300'}>{label}</span>
        <select className={selectBox} value={value} onChange={(e) => onChange(e.target.value as T)}>
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
