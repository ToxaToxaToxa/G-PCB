/*
 * A rendered machine scene filling the step area, with the step's controls
 * drawn on top of it as parts of the scene. The picture covers the area
 * (cropped at the edges if the shapes differ) and `children` get the mapping
 * from scene plane millimetres to on-screen pixels.
 */
import { useEffect, useRef, useState } from 'react';

import bedPicture from '../assets/scene-bed.webp';
import { apply, Mat3, multiply, scale, translate } from './homography';

export interface Scene {
    src: string;
    width: number;
    height: number;
    /**
     * A plane of the scene in millimetres to picture pixels: the bed top (mm from the
     * bed's front-left corner) in bed scenes, the copper (mm from X0 Y0) in close-ups.
     * Y points away from the viewer.
     */
    plane: Mat3;
    /** Named points of the scene in picture pixels, for callouts */
    points?: Record<string, [number, number]>;
}

/** Empty 300 x 180 bed seen from the front, spindle parked back right (tools/machine-renders). */
export const BED_SCENE: Scene = {
    src: bedPicture,
    width: 2200,
    height: 1000,
    plane: [
        [4.976295852, 2.469944563, 307.293439024],
        [0.009075936, -1.911211373, 847.562746791],
        [-1.2763e-5, 0.002230832, 1.0],
    ],
};

export interface SceneMapping {
    /** Plane millimetres to on-screen pixels inside the scene box */
    plane: Mat3;
    project: (x: number, y: number) => [number, number];
    /** A named point of the scene on screen */
    point: (name: string) => [number, number];
    width: number;
    height: number;
}

interface Props {
    scene: Scene;
    /** Parts of the scene that sit on the machine, drawn once the box has a size */
    overlay: (m: SceneMapping) => React.ReactNode;
    /** Panels that do not depend on the picture */
    children?: React.ReactNode;
}

const SceneView = ({ scene, overlay, children }: Props) => {
    const box = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const el = box.current;
        if (!el) return undefined;
        const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // cover: fill the box, crop what does not fit, keep the centre
    const s = size.w && size.h ? Math.max(size.w / scene.width, size.h / scene.height) : 0;
    const dx = (size.w - scene.width * s) / 2;
    const dy = (size.h - scene.height * s) / 2;
    const toScreen = multiply(translate(dx, dy), scale(s));
    const plane = multiply(toScreen, scene.plane);
    const point = (name: string) => apply(toScreen, ...(scene.points?.[name] ?? [0, 0]));

    return (
        <div ref={box} className="relative flex-1 min-h-0 overflow-hidden rounded-md border border-gray-200 dark:border-dark-lighter bg-gray-100">
            <img
                src={scene.src}
                alt=""
                className="absolute max-w-none select-none pointer-events-none"
                style={{ left: dx, top: dy, width: scene.width * s, height: scene.height * s }}
            />
            {s > 0 && overlay({ plane, project: (x, y) => apply(plane, x, y), point, width: size.w, height: size.h })}
            {children}
        </div>
    );
};

export default SceneView;
