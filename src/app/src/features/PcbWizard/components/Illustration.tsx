/*
 * Rendered pictures of a 3018 for the machine steps. The card takes only the
 * room left at the bottom of the column, so it never makes the page scroll;
 * a click opens the picture full size.
 */
import { useEffect, useRef, useState } from 'react';
import cx from 'classnames';

import { Dialog, DialogContent, DialogTitle } from 'app/components/shadcn/Dialog';

import blank from '../assets/machine-blank.webp';
import zeroXY from '../assets/machine-zero-xy.webp';
import zeroZ from '../assets/machine-zero-z.webp';
import heightMap from '../assets/machine-heightmap.webp';
import run from '../assets/machine-run.webp';

export interface Picture {
    src: string;
    caption: string;
}

export const PICTURES = {
    blank: { src: blank, caption: 'Blank clamped on the bed' },
    zeroXY: { src: zeroXY, caption: 'X0 Y0: lower-left corner' },
    zeroZ: { src: zeroZ, caption: 'Z0: clips on bit and copper' },
    heightMap: { src: heightMap, caption: 'Height map: probing point by point' },
    run: { src: run, caption: 'Bit change between programs' },
} satisfies Record<string, Picture>;

const Illustration = ({ pictures }: { pictures: Picture[] }) => {
    const [open, setOpen] = useState<Picture | null>(null);
    // Hidden while the column has no room for a picture worth looking at,
    // e.g. when a probing failure notice takes the space.
    const box = useRef<HTMLDivElement>(null);
    const [roomy, setRoomy] = useState(true);
    useEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => setRoomy(el.clientHeight >= 90));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return (
        <>
            <div
                ref={box}
                className={cx(
                    'flex flex-1 min-h-0 gap-2 overflow-hidden rounded-md',
                    roomy ? 'border border-gray-200 dark:border-dark-lighter p-2' : 'border-0 p-0',
                )}
            >
                {roomy && pictures.map((p) => (
                    <button
                        key={p.caption}
                        type="button"
                        title={`${p.caption} (click to enlarge)`}
                        onClick={() => setOpen(p)}
                        className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-1"
                    >
                        <img src={p.src} alt={p.caption} className="min-h-0 w-full flex-1 object-contain" />
                        <span className="w-full truncate text-xs text-gray-500 dark:text-gray-400">{p.caption}</span>
                    </button>
                ))}
            </div>
            {open && (
                <Dialog open onOpenChange={(v) => !v && setOpen(null)}>
                    <DialogContent className="w-[min(90vw,64rem)]">
                        <DialogTitle className="text-base">{open.caption}</DialogTitle>
                        <img src={open.src} alt={open.caption} className="w-full" />
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
};

export default Illustration;
