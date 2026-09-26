import { evaluateMacroExpression } from '../lib/macroExpr';
import { parseGerber } from '../lib/gerber';
import { parseExcellon } from '../lib/excellon';
import { detectLayer } from '../lib/board';
import { boundsOf, totalArea, toExPolygons } from '../lib/geometry';

const header = '%FSLAX34Y34*%\n%MOMM*%\n';

describe('macro expressions', () => {
    it('evaluates arithmetic with variables', () => {
        expect(evaluateMacroExpression('1.08239X$1', { 1: 2 })).toBeCloseTo(2.16478);
        expect(evaluateMacroExpression('($1+$2)/2-0.5', { 1: 3, 2: 1 })).toBeCloseTo(1.5);
        expect(evaluateMacroExpression('-$1x-2', { 1: 3 })).toBeCloseTo(6);
        expect(() => evaluateMacroExpression('1+', {})).toThrow();
    });
});

describe('gerber', () => {
    it('flashes circles and rectangles', () => {
        const g = parseGerber(`${header}%ADD10C,1.0*%\n%ADD11R,2X1*%\nD10*\nX0Y0D03*\nD11*\nX50000Y0D03*\nM02*`);
        expect(totalArea(g.polygons)).toBeCloseTo(Math.PI * 0.25 + 2, 2);
        expect(toExPolygons(g.polygons)).toHaveLength(2);
    });

    it('subtracts clear polarity', () => {
        const g = parseGerber(`${header}%ADD10R,10X10*%\n%ADD11C,2*%\nD10*\nX0Y0D03*\n%LPC*%\nD11*\nX0Y0D03*\n%LPD*%\nM02*`);
        expect(totalArea(g.polygons)).toBeCloseTo(100 - Math.PI, 1);
    });

    it('draws round strokes and keeps centre lines', () => {
        const g = parseGerber(`${header}%ADD10C,0.2*%\nD10*\nX0Y0D02*\nX100000Y0D01*\nM02*`);
        expect(totalArea(g.polygons)).toBeCloseTo(10 * 0.2 + Math.PI * 0.01, 2);
        expect(g.strokes[0].points).toEqual([[0, 0], [10, 0]]);
    });

    it('fills regions with arcs (G75 multi quadrant)', () => {
        // half disc of radius 5 above the X axis
        const g = parseGerber(`${header}G75*\nG36*\nX50000Y0D02*\nG03X-50000Y0I-50000J0D01*\nG01X50000Y0D01*\nG37*\nM02*`);
        expect(totalArea(g.polygons)).toBeCloseTo((Math.PI * 25) / 2, 1);
        const b = boundsOf(g.polygons)!;
        expect(b.maxY).toBeCloseTo(5, 2);
        expect(b.minY).toBeCloseTo(0, 3);
    });

    it('supports aperture macros (EAGLE octagon)', () => {
        const g = parseGerber(`${header}%AMOC8*\n5,1,8,0,0,1.08239X$1,22.5*%\n%ADD10OC8,1.524*%\nD10*\nX0Y0D03*\nM02*`);
        // regular octagon with inscribed diameter 1.524
        const r = (1.08239 * 1.524) / 2;
        expect(totalArea(g.polygons)).toBeCloseTo(2 * Math.SQRT2 * r * r, 2);
    });

    it('handles inch units and trailing zero format', () => {
        const g = parseGerber('%FSTAX24Y24*%\n%MOIN*%\n%ADD10C,0.1*%\nD10*\nX1Y1D03*\nM02*');
        const b = boundsOf(g.polygons)!;
        // X1 with trailing zeros omitted in 2.4 = 10.0000 inch
        expect((b.minX + b.maxX) / 2).toBeCloseTo(254, 1);
    });

    it('step and repeat copies the block', () => {
        const g = parseGerber(`${header}%ADD10C,1*%\n%SRX3Y2I5J5*%\nD10*\nX0Y0D03*\n%SR*%\nM02*`);
        expect(toExPolygons(g.polygons)).toHaveLength(6);
    });
});

describe('excellon', () => {
    it('parses EAGLE / Fusion metric files with trailing zeros kept', () => {
        const d = parseExcellon('M48\n;GenerationSoftware,Autodesk,EAGLE,9.6.2*%\nFMAT,2\nICI,OFF\nMETRIC,TZ,000.000\nT1C0.800\n%\nG90\nM71\nT1\nX32100Y3740\nY5000\nM30');
        expect(d.holes).toEqual([
            { x: 32.1, y: 3.74, diameter: 0.8, plated: undefined },
            { x: 32.1, y: 5, diameter: 0.8, plated: undefined },
        ]);
    });

    it('parses KiCad decimal files and inch files with leading zeros', () => {
        const kicad = parseExcellon('M48\n; DRILL file {KiCad 8}\nFMAT,2\nMETRIC\nT1C0.300\n%\nG90\nG05\nT1\nX123.19Y-45.72\nM30');
        expect(kicad.holes[0]).toMatchObject({ x: 123.19, y: -45.72, diameter: 0.3 });
        const inch = parseExcellon('M48\nINCH,LZ\nT01C0.0320\n%\nT01\nX01Y005\nM30');
        expect(inch.holes[0].x).toBeCloseTo(25.4, 3);
        // Y005 in 2.4 with leading zeros kept = 00.5 inch
        expect(inch.holes[0].y).toBeCloseTo(12.7, 3);
        expect(inch.holes[0].diameter).toBeCloseTo(0.8128, 4);
    });
});

describe('layer detection', () => {
    const gerber = '%FSLAX34Y34*%\n%MOMM*%\n';
    const drill = 'M48\nMETRIC\nT1C0.8\n%\nM30';
    it.each([
        ['CAMOutputs/GerberFiles/copper_top.gbr', gerber, 'top'],
        ['CAMOutputs/GerberFiles/copper_bottom.gbr', gerber, 'bottom'],
        ['CAMOutputs/GerberFiles/profile.gbr', gerber, 'outline'],
        ['CAMOutputs/GerberFiles/silkscreen_top.gbr', gerber, 'ignored'],
        ['CAMOutputs/DrillFiles/drill_1_16.xln', drill, 'drill'],
        ['board-F_Cu.gbr', gerber, 'top'],
        ['board-B_Cu.gbr', gerber, 'bottom'],
        ['board-Edge_Cuts.gm1', gerber, 'outline'],
        ['board-F_Mask.gbr', gerber, 'ignored'],
        ['board-PTH.drl', drill, 'drill'],
        ['Gerber_TopLayer.GTL', gerber, 'top'],
        ['Gerber_BoardOutlineLayer.GKO', gerber, 'outline'],
        ['x.gbr', '%TF.FileFunction,Copper,L2,Bot*%\n' + gerber, 'bottom'],
    ])('%s -> %s', (name, content, kind) => {
        expect(detectLayer({ name, content })).toBe(kind);
    });
});
