/*
 * Close-ups for the Work zero step, rendered in Fusion (tools/machine-renders):
 * the bit over the blank's lower-left corner, and the probe clips for Z0.
 * `plane` maps copper millimetres from the blank corner (X0 Y0) to picture
 * pixels; `points` are callout targets. Both come from calibration renders.
 */
import zeroXY from '../assets/scene-zero-xy.webp';
import zeroZ from '../assets/scene-zero-z.webp';
import { Scene } from './SceneView';

export const ZERO_XY_SCENE: Scene = {
    src: zeroXY,
    width: 2200,
    height: 1000,
    plane: [
        [9.647116062, 0.707176274, 990.01114029],
        [-0.426568989, -0.98572666, 690.632336639],
        [0.001562233, 0.003782461, 1.0],
    ],
};

export const ZERO_Z_SCENE: Scene = {
    src: zeroZ,
    width: 2200,
    height: 1000,
    plane: [
        [8.112747477, 7.669497283, 891.856135195],
        [0.310087518, -1.122100138, 729.975595621],
        [-0.001195404, 0.004301583, 1.0],
    ],
    points: { redClip: [1081.2, 495.8], blackClip: [977.4, 757.2], tip: [1263.1, 633.7] },
};
