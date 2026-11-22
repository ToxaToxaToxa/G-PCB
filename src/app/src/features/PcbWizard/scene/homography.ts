/*
 * Plane-to-picture mapping for the rendered machine scenes. A 3 x 3
 * homography (row-major) takes a point of a plane in the scene, such as the
 * bed top in millimetres, to picture pixels.
 */
export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

export const multiply = (a: Mat3, b: Mat3): Mat3 =>
    [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c])) as Mat3;

export const apply = (h: Mat3, x: number, y: number): [number, number] => {
    const w = h[2][0] * x + h[2][1] * y + h[2][2];
    return [(h[0][0] * x + h[0][1] * y + h[0][2]) / w, (h[1][0] * x + h[1][1] * y + h[1][2]) / w];
};

export const translate = (x: number, y: number): Mat3 => [
    [1, 0, x],
    [0, 1, y],
    [0, 0, 1],
];

export const scale = (sx: number, sy = sx): Mat3 => [
    [sx, 0, 0],
    [0, sy, 0],
    [0, 0, 1],
];

/** CSS transform that draws an element's own pixels (origin top left) through `h`. */
export const toCssMatrix = (h: Mat3) => {
    const m = [h[0][0], h[1][0], 0, h[2][0], h[0][1], h[1][1], 0, h[2][1], 0, 0, 1, 0, h[0][2], h[1][2], 0, h[2][2]];
    return `matrix3d(${m.map((v) => Number(v.toPrecision(10))).join(',')})`;
};
