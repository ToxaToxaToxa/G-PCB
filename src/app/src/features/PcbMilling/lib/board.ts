/*
 * Loads a set of Gerber/Excellon files, detects layers and builds the
 * board model in work coordinates (origin = lower-left corner of the board).
 */
import { BoardSide, DetectedFile, InputFile, LayerKind } from '../definitions';
import { DrillHole, isExcellon, parseExcellon } from './excellon';
import { GerberImage, parseGerber } from './gerber';
import {
    Bounds,
    Paths,
    area,
    boundsOf,
    difference,
    offset,
    pointInPath,
    strokeRound,
    toExPolygons,
    toInt,
    totalArea,
    transformPaths,
    union,
    unionAll,
} from './geometry';

const IGNORE_RE = /silk|mask|paste|legend|overlay|assembly|courtyard|fab|keepout|\.gt[osp]$|\.gb[osp]$|\.gbrjob$|\.gpi$|\.pdf$|\.txt\.info$|readme|\.ipc$|\.csv$|\.pos$/i;
const TOP_RE = /copper[_ -]?top|top[_ -]?copper|\.gtl$|f[._]cu|toplayer|top[_ -]?layer|\.cmp$|[_-]l1\.|\.g1$/i;
const BOTTOM_RE = /copper[_ -]?bottom|bottom[_ -]?copper|\.gbl$|b[._]cu|bottomlayer|bottom[_ -]?layer|\.sol$|[_-]l2\.|\.g2$/i;
const OUTLINE_RE = /profile|outline|edge[._ ]?cuts|\.gko$|\.gm1$|\.gml$|\.gm$|board[_ -]?outline|\.dim$|mechanical[_ ]?1|\.gbr_?outline/i;
const DRILL_EXT_RE = /\.(xln|drl|drd|xnc|exc|nc|tap|txt)$/i;

export const detectLayer = (file: InputFile): LayerKind => {
    const name = file.name.split('/').pop() || file.name;
    const head = file.content.slice(0, 4000);

    if (DRILL_EXT_RE.test(name) && isExcellon(file.content)) {
        return 'drill';
    }
    if (isExcellon(head) && !/%FS/.test(head)) {
        return 'drill';
    }
    if (!/%FS|%MO|G04|%AD/.test(head)) {
        return 'ignored';
    }
    const ff = /%TF\.FileFunction,([^*]+)\*%/.exec(head)?.[1] ?? '';
    if (ff) {
        if (/^Copper,L\d+,Top/i.test(ff)) return 'top';
        if (/^Copper,L\d+,Bot/i.test(ff)) return 'bottom';
        if (/^Profile/i.test(ff)) return 'outline';
        if (/^(Legend|Soldermask|Paste|AssemblyDrawing|Other)/i.test(ff)) return 'ignored';
    }
    if (IGNORE_RE.test(name) && !OUTLINE_RE.test(name)) return 'ignored';
    if (OUTLINE_RE.test(name)) return 'outline';
    if (TOP_RE.test(name)) return 'top';
    if (BOTTOM_RE.test(name)) return 'bottom';
    const layerName = /%IN([^*]+)\*%/.exec(head)?.[1] ?? '';
    if (/top copper/i.test(layerName)) return 'top';
    if (/bottom copper/i.test(layerName)) return 'bottom';
    return 'ignored';
};

export interface ParsedProject {
    files: DetectedFile[];
    top: GerberImage | null;
    bottom: GerberImage | null;
    outline: GerberImage | null;
    holes: DrillHole[];
    warnings: string[];
}

export const parseProject = (inputs: InputFile[], overrides: Record<string, LayerKind> = {}): ParsedProject => {
    const files: DetectedFile[] = [];
    const warnings: string[] = [];
    let top: GerberImage | null = null;
    let bottom: GerberImage | null = null;
    let outline: GerberImage | null = null;
    const holes: DrillHole[] = [];

    for (const file of inputs) {
        const kind = overrides[file.name] ?? detectLayer(file);
        files.push({ name: file.name, kind });
        try {
            if (kind === 'drill') {
                const d = parseExcellon(file.content);
                holes.push(...d.holes);
                d.warnings.forEach((w) => warnings.push(`${file.name}: ${w}`));
            } else if (kind === 'top' || kind === 'bottom' || kind === 'outline') {
                const img = parseGerber(file.content);
                img.warnings.forEach((w) => warnings.push(`${file.name}: ${w}`));
                if (kind === 'top') top = top ? { ...img, polygons: union(top.polygons, img.polygons) } : img;
                if (kind === 'bottom') bottom = bottom ? { ...img, polygons: union(bottom.polygons, img.polygons) } : img;
                if (kind === 'outline') outline = img;
            }
        } catch (e) {
            warnings.push(`${file.name}: ${(e as Error).message}`);
        }
    }
    return { files, top, bottom, outline, holes, warnings };
};

export interface BoardModel {
    side: BoardSide;
    width: number;
    height: number;
    /** Copper of the milled side (work coordinates) */
    copper: Paths;
    /** Board shape including internal cutouts (work coordinates) */
    board: Paths;
    holes: DrillHole[];
    warnings: string[];
    hasOutline: boolean;
}

const LINE = 0.02;

/**
 * Index of the smallest contour that still holds all the copper. A frame
 * drawn around the real board (EAGLE's default 160 x 100 mm board, a panel
 * border) would otherwise make the board look like a cutout of the frame.
 */
const copperContour = (fills: { outer: Paths[number]; area: number }[], copper: Paths) => {
    if (fills.length < 2 || !copper.length) return 0;
    const all = unionAll(copper);
    const tolerance = Math.max(totalArea(all) * 1e-4, 1e-4);
    for (let i = fills.length - 1; i > 0; i--) {
        if (totalArea(difference(all, [fills[i].outer])) <= tolerance) return i;
    }
    return 0;
};

/**
 * Builds the board region from the outline layer. Stroked outlines are
 * re-drawn as thin lines so the centre line of the drawing is the board edge.
 */
export const buildBoardShape = (
    outline: GerberImage,
    holes: DrillHole[],
    warnings: string[],
    copper: Paths = [],
): Paths => {
    const lines = outline.strokes.map((s) => s.points.map(([x, y]) => toInt(x, y)));
    let drawn = strokeRound(lines, LINE);
    if (outline.regions.length) {
        drawn = union(drawn, unionAll(outline.regions.map((r) => r.map(([x, y]) => toInt(x, y)))));
    }
    const islands = toExPolygons(drawn);
    if (!islands.length) {
        return [];
    }
    const fills = islands
        .map((e) => ({ outer: e.outer, area: area(e.outer) }))
        .sort((a, b) => b.area - a.area);

    const mainIndex = copperContour(fills, copper);
    const main = fills[mainIndex];
    let board = offset([main.outer], -LINE / 2);
    let skipped = 0;
    let drilled = 0;
    if (mainIndex > 0) {
        const b = boundsOf([fills[0].outer]);
        const size = b ? `${(b.maxX - b.minX - LINE).toFixed(1)} × ${(b.maxY - b.minY - LINE).toFixed(1)} mm ` : '';
        warnings.push(`The outline has a ${size}frame around the board; the inner contour that holds the copper is used as the board.`);
    }
    for (const [index, f] of fills.entries()) {
        if (index === mainIndex) continue;
        const inside = pointInPath(f.outer[0], main.outer) !== 0;
        if (!inside) {
            // frames around the board are reported above
            if (index > mainIndex) skipped++;
            continue;
        }
        const cut = offset([f.outer], -LINE / 2);
        const b = boundsOf(cut);
        if (!b) continue;
        const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
        const cx = (b.minX + b.maxX) / 2;
        const cy = (b.minY + b.maxY) / 2;
        // Round cutouts that are also in the drill file are drilled, not milled
        const isDrilled = holes.some(
            (h) => Math.hypot(h.x - cx, h.y - cy) < 0.1 && h.diameter + 0.35 >= size,
        );
        if (isDrilled) {
            drilled++;
            continue;
        }
        board = difference(board, cut);
    }
    if (skipped) {
        warnings.push(`${skipped} outline shape(s) outside the board were ignored.`);
    }
    if (drilled) {
        warnings.push(`${drilled} round cutout(s) on the outline layer match drill holes and will be drilled.`);
    }
    return board;
};

export const buildBoardModel = (project: ParsedProject, side: BoardSide): BoardModel => {
    const warnings: string[] = [];
    const image = side === 'top' ? project.top : project.bottom;
    let board: Paths = [];
    if (project.outline) {
        const copper = [...(project.top?.polygons ?? []), ...(project.bottom?.polygons ?? [])];
        board = buildBoardShape(project.outline, project.holes, warnings, copper);
    }
    const hasOutline = board.length > 0;

    let bounds: Bounds | null = boundsOf(board);
    if (!bounds) {
        bounds = boundsOf(image?.polygons ?? []);
        if (bounds) {
            warnings.push('No board outline found; the copper bounds are used as the board size.');
        }
    }
    if (!bounds) {
        return { side, width: 0, height: 0, copper: [], board: [], holes: [], warnings: ['No copper or outline data found.'], hasOutline: false };
    }

    const mirror = side === 'bottom';
    const dx = mirror ? bounds.maxX : -bounds.minX;
    const dy = -bounds.minY;
    const tx = (x: number) => (mirror ? -x + dx : x + dx);

    const copper = image ? transformPaths(image.polygons, mirror, dx, dy) : [];
    if (!image) {
        warnings.push(`No ${side} copper layer loaded.`);
    }
    const holes = project.holes.map((h) => ({
        ...h,
        x: tx(h.x),
        y: h.y + dy,
        x2: h.x2 !== undefined ? tx(h.x2) : undefined,
        y2: h.y2 !== undefined ? h.y2 + dy : undefined,
    }));

    return {
        side,
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
        copper,
        board: hasOutline ? transformPaths(board, mirror, dx, dy) : [],
        holes,
        warnings,
        hasOutline,
    };
};
