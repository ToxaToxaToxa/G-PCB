import { HeightMapGridConfig } from '../definitions';
import { getMapStats, getStepX, getStepY } from '../utils/heightMap';

interface Props {
    grid: HeightMapGridConfig;
    z: number[][] | null;
    /** Toolpath bounds of the loaded file in mm (work coordinates) */
    fileBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

const VIEW = 400;
const PAD = 28;

// Blue (low) -> green -> red (high)
const colorFor = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) {
        return 'transparent';
    }
    const t = max - min > 1e-9 ? (value - min) / (max - min) : 0.5;
    const hue = 240 - 240 * t;
    return `hsl(${hue}, 75%, 55%)`;
};

const HeightMapPreview = ({ grid, z, fileBounds }: Props) => {
    const stats = z ? getMapStats({ z }) : null;
    const hasValues = !!stats && stats.count > 0;

    // Fit grid (and file bounds) into the view keeping aspect ratio
    const minX = Math.min(grid.xStart, fileBounds?.minX ?? Infinity);
    const minY = Math.min(grid.yStart, fileBounds?.minY ?? Infinity);
    const maxX = Math.max(grid.xStart + grid.width, fileBounds?.maxX ?? -Infinity);
    const maxY = Math.max(grid.yStart + grid.length, fileBounds?.maxY ?? -Infinity);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = (VIEW - PAD * 2) / Math.max(spanX, spanY);
    const width = spanX * scale + PAD * 2;
    const height = spanY * scale + PAD * 2;

    const sx = (x: number) => PAD + (x - minX) * scale;
    const sy = (y: number) => height - PAD - (y - minY) * scale;

    const stepX = getStepX(grid);
    const stepY = getStepY(grid);
    const showLabels = grid.xPoints <= 12 && grid.yPoints <= 12;
    const radius = Math.max(
        2,
        Math.min(8, (Math.min(stepX, stepY) * scale) / 4),
    );

    const cells = [];
    if (z && hasValues) {
        for (let r = 0; r < grid.yPoints - 1; r++) {
            for (let c = 0; c < grid.xPoints - 1; c++) {
                const values = [z[r][c], z[r][c + 1], z[r + 1][c], z[r + 1][c + 1]];
                if (!values.every(Number.isFinite)) {
                    continue;
                }
                const avg = values.reduce((a, b) => a + b, 0) / 4;
                const x0 = grid.xStart + c * stepX;
                const y0 = grid.yStart + r * stepY;
                cells.push(
                    <rect
                        key={`cell-${r}-${c}`}
                        x={sx(x0)}
                        y={sy(y0 + stepY)}
                        width={stepX * scale}
                        height={stepY * scale}
                        fill={colorFor(avg, stats!.min, stats!.max)}
                        opacity={0.55}
                    />,
                );
            }
        }
    }

    const points = [];
    for (let r = 0; r < grid.yPoints; r++) {
        for (let c = 0; c < grid.xPoints; c++) {
            const value = z?.[r]?.[c];
            const probed = Number.isFinite(value);
            const x = sx(grid.xStart + c * stepX);
            const y = sy(grid.yStart + r * stepY);
            points.push(
                <g key={`pt-${r}-${c}`}>
                    <circle
                        cx={x}
                        cy={y}
                        r={radius}
                        className={
                            probed
                                ? 'stroke-gray-800 dark:stroke-gray-100'
                                : 'fill-none stroke-gray-400'
                        }
                        fill={
                            probed
                                ? colorFor(value as number, stats!.min, stats!.max)
                                : 'none'
                        }
                        strokeWidth={1}
                    />
                    {probed && showLabels && (
                        <text
                            x={x}
                            y={y - radius - 3}
                            textAnchor="middle"
                            className="fill-gray-700 dark:fill-gray-200"
                            fontSize={10}
                        >
                            {(value as number).toFixed(3)}
                        </text>
                    )}
                </g>,
            );
        }
    }

    return (
        <div className="flex flex-col gap-2 w-full h-full">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full max-h-[55vh]"
                role="img"
                aria-label="Height map preview"
            >
                <rect
                    x={sx(grid.xStart)}
                    y={sy(grid.yStart + grid.length)}
                    width={grid.width * scale}
                    height={grid.length * scale}
                    className="fill-gray-100 dark:fill-dark-lighter stroke-gray-400"
                    strokeWidth={1}
                />
                {cells}
                {fileBounds && (
                    <rect
                        x={sx(fileBounds.minX)}
                        y={sy(fileBounds.maxY)}
                        width={(fileBounds.maxX - fileBounds.minX) * scale}
                        height={(fileBounds.maxY - fileBounds.minY) * scale}
                        fill="none"
                        className="stroke-blue-500"
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                    />
                )}
                {points}
                <text
                    x={sx(grid.xStart)}
                    y={sy(grid.yStart) + 18}
                    fontSize={11}
                    className="fill-gray-500"
                >
                    X{grid.xStart} Y{grid.yStart}
                </text>
            </svg>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300 justify-center">
                {hasValues ? (
                    <>
                        <span>Min: {stats!.min.toFixed(3)} mm</span>
                        <span>Max: {stats!.max.toFixed(3)} mm</span>
                        <span>Range: {stats!.range.toFixed(3)} mm</span>
                        <span>
                            Points: {stats!.count}/{grid.xPoints * grid.yPoints}
                        </span>
                    </>
                ) : (
                    <span>
                        No probe data. Grid: {grid.xPoints} × {grid.yPoints}{' '}
                        points, step {stepX.toFixed(2)} × {stepY.toFixed(2)} mm
                    </span>
                )}
                {fileBounds && (
                    <span className="text-blue-500">- - loaded file bounds</span>
                )}
            </div>
        </div>
    );
};

export default HeightMapPreview;
