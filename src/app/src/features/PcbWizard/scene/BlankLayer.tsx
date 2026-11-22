/*
 * The copper-clad blank on the rendered bed: one SVG in blank millimetres,
 * warped onto the bed plane, so whatever a step draws on the blank (boards,
 * dimension lines, probe points, toolpaths) lies on the copper in the scene.
 */
import { useMemo } from 'react';

import { pathData } from '../../PcbMilling/components/PcbPreview';
import { BoardModel } from '../../PcbMilling/lib/board';
import { apply, Mat3, multiply, toCssMatrix } from './homography';
import { SceneMapping } from './SceneView';

const BED = { width: 300, height: 180 };
/** Room around the blank inside the layer, for marks drawn past its edges (mm) */
export const MARGIN = 40;

/** Where the blank lies on the bed: centred, as far as it fits. */
export const blankOrigin = (w: number, h: number): [number, number] => [
    Math.max(0, (BED.width - w) / 2),
    Math.max(0, (BED.height - h) / 2),
];

/** Screen point of blank millimetres (u right, v away from the viewer) in a bed scene. */
export const blankToScreen = (mapping: SceneMapping, width: number, height: number) => {
    const [bx, by] = blankOrigin(width, height);
    return (u: number, v: number) => apply(mapping.plane, bx + u, by + v);
};

interface Props {
    mapping: SceneMapping;
    width: number;
    height: number;
    /** Boards to show on the copper */
    panel?: BoardModel;
    /** How strongly the board artwork shows */
    artwork?: 'planned' | 'faint';
    /** Drawn in blank millimetres, Y up (no text: it would be mirrored) */
    children?: React.ReactNode;
}

const BlankLayer = ({ mapping, width, height, panel, artwork = 'planned', children }: Props) => {
    const [bx, by] = blankOrigin(width, height);
    // layer pixel (x, y) = blank mm (x - M, height + M - y)
    const layerToBed: Mat3 = [
        [1, 0, bx - MARGIN],
        [0, -1, by + height + MARGIN],
        [0, 0, 1],
    ];
    const layer = multiply(mapping.plane, layerToBed);

    const copper = useMemo(() => (panel ? pathData(panel.copper) : ''), [panel]);
    const outline = useMemo(() => (panel ? pathData(panel.board) : ''), [panel]);

    const W = width + 2 * MARGIN;
    const H = height + 2 * MARGIN;
    const x0 = MARGIN;
    const y0 = MARGIN + height;

    return (
        <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="absolute left-0 top-0 overflow-visible pointer-events-none"
            style={{ transformOrigin: '0 0', transform: toCssMatrix(layer) }}
        >
            <defs>
                <linearGradient id="blank-copper" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#e9a37a" />
                    <stop offset="0.5" stopColor="#d2804f" />
                    <stop offset="1" stopColor="#e39466" />
                </linearGradient>
            </defs>
            {/* shadow, FR4 edge, copper */}
            <rect x={x0 + 1.2} y={MARGIN + 1.6} width={width} height={height} fill="#000" opacity={0.18} />
            <rect x={x0} y={MARGIN + 0.6} width={width} height={height} fill="#c9c08a" />
            <rect x={x0} y={MARGIN} width={width} height={height} fill="url(#blank-copper)" />
            {panel && (
                <g transform={`translate(${x0} ${y0})`} opacity={artwork === 'faint' ? 0.5 : 1}>
                    <path d={copper} fill="#7a3a12" fillOpacity={0.28} />
                    <path d={outline} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={0.45} strokeDasharray="2.2 1.3" />
                </g>
            )}
            <g transform={`translate(${x0} ${y0}) scale(1 -1)`}>{children}</g>
        </svg>
    );
};

export default BlankLayer;
