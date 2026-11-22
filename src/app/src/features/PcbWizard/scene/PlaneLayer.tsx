/*
 * SVG drawn in the millimetres of a scene's plane (Y away from the viewer),
 * warped onto it. `box` is the area it covers: [x0, y0, x1, y1] in mm.
 */
import { Mat3, multiply, toCssMatrix } from './homography';
import { SceneMapping } from './SceneView';

const PlaneLayer = ({
    mapping,
    box,
    children,
}: {
    mapping: SceneMapping;
    box: [number, number, number, number];
    children: React.ReactNode;
}) => {
    const [x0, y0, x1, y1] = box;
    // layer pixel (x, y) = plane mm (x0 + x, y1 - y)
    const layerToPlane: Mat3 = [
        [1, 0, x0],
        [0, -1, y1],
        [0, 0, 1],
    ];
    const W = x1 - x0;
    const H = y1 - y0;
    return (
        <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="absolute left-0 top-0 overflow-visible pointer-events-none"
            style={{ transformOrigin: '0 0', transform: toCssMatrix(multiply(mapping.plane, layerToPlane)) }}
        >
            <g transform={`translate(${-x0} ${y1}) scale(1 -1)`}>{children}</g>
        </svg>
    );
};

export default PlaneLayer;
