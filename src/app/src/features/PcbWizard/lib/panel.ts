/*
 * Panelisation: places copies of one board on the stock in a cols x rows
 * array. Work zero X0 Y0 is the lower-left corner of the stock.
 */
import { BoardModel } from '../../PcbMilling/lib/board';
import { Paths, rotatePaths, translatePaths } from '../../PcbMilling/lib/geometry';
import { StockSettings } from '../definitions';

export interface PanelLayout {
    rotated: boolean;
    cols: number;
    rows: number;
    /** Board size on the stock (after rotation) */
    boardWidth: number;
    boardHeight: number;
    /** Lower-left corner of every copy, in stock coordinates */
    copies: [number, number][];
    warnings: string[];
}

/** How many boards of `size` fit along a stock side of `length`. */
export const fitCount = (length: number, size: number, margin: number, gap: number) => {
    if (size <= 0) return 0;
    const usable = length - 2 * margin;
    if (usable < size) return 0;
    return Math.floor((usable + gap + 1e-9) / (size + gap));
};

const fitGrid = (stock: StockSettings, w: number, h: number) => ({
    cols: fitCount(stock.width, w, stock.margin, stock.gap),
    rows: fitCount(stock.height, h, stock.margin, stock.gap),
});

export const layoutPanel = (boardWidth: number, boardHeight: number, stock: StockSettings): PanelLayout => {
    const warnings: string[] = [];
    const straight = fitGrid(stock, boardWidth, boardHeight);
    const turned = fitGrid(stock, boardHeight, boardWidth);

    let rotated: boolean;
    if (stock.rotation === 'auto') {
        if (stock.fill) {
            rotated = turned.cols * turned.rows > straight.cols * straight.rows;
        } else {
            // the requested array fits better one way or the other
            const fits = (g: { cols: number; rows: number }) => g.cols >= stock.cols && g.rows >= stock.rows;
            rotated = !fits(straight) && fits(turned);
        }
    } else {
        rotated = stock.rotation === 90;
    }

    const w = rotated ? boardHeight : boardWidth;
    const h = rotated ? boardWidth : boardHeight;
    const fit = rotated ? turned : straight;

    let cols = stock.fill ? fit.cols : Math.max(1, Math.round(stock.cols));
    let rows = stock.fill ? fit.rows : Math.max(1, Math.round(stock.rows));
    if (!stock.fill && (cols > fit.cols || rows > fit.rows)) {
        // never place a board past the edge of the blank: that cuts into clamps or the bed
        cols = Math.min(cols, fit.cols);
        rows = Math.min(rows, fit.rows);
        warnings.push(
            `${stock.cols} × ${stock.rows} boards do not fit on the ${stock.width} × ${stock.height} mm stock; ${cols} × ${rows} are placed.`,
        );
    }
    if (cols * rows === 0) {
        warnings.push(`The ${w.toFixed(1)} × ${h.toFixed(1)} mm board does not fit on the stock with the chosen margin.`);
        cols = 0;
        rows = 0;
    }

    const copies: [number, number][] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            copies.push([stock.margin + c * (w + stock.gap), stock.margin + r * (h + stock.gap)]);
        }
    }
    return { rotated, cols, rows, boardWidth: w, boardHeight: h, copies, warnings };
};

/** Rotates a board model 90° counter-clockwise, keeping its lower-left corner at 0,0. */
export const rotateModel = (model: BoardModel): BoardModel => {
    const turn = (paths: Paths) => translatePaths(rotatePaths(paths, 90), model.height, 0);
    return {
        ...model,
        width: model.height,
        height: model.width,
        copper: turn(model.copper),
        board: turn(model.board),
        holes: model.holes.map((h) => ({
            ...h,
            x: model.height - h.y,
            y: h.x,
            x2: h.y2 !== undefined ? model.height - h.y2 : undefined,
            y2: h.x2,
        })),
    };
};

/** One model of the whole stock with every copy placed; used to generate the programs. */
export const panelizeModel = (model: BoardModel, layout: PanelLayout, stock: StockSettings): BoardModel => {
    const board = layout.rotated ? rotateModel(model) : model;
    const copper: Paths = [];
    const outline: Paths = [];
    const holes: BoardModel['holes'] = [];
    for (const [x, y] of layout.copies) {
        copper.push(...translatePaths(board.copper, x, y));
        outline.push(...translatePaths(board.board, x, y));
        for (const h of board.holes) {
            holes.push({
                ...h,
                x: h.x + x,
                y: h.y + y,
                x2: h.x2 !== undefined ? h.x2 + x : undefined,
                y2: h.y2 !== undefined ? h.y2 + y : undefined,
            });
        }
    }
    return {
        ...board,
        width: stock.width,
        height: stock.height,
        copper,
        board: outline,
        holes,
    };
};
