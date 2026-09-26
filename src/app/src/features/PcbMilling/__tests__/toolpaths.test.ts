import fs from 'fs';
import path from 'path';
import { buildBoardModel, parseProject } from '../lib/board';
import {
    buildOperations,
    findUnisolated,
    pickDrill,
    vbitWidth,
} from '../lib/toolpaths';
import { DEFAULT_DRILLS, DEFAULT_PCB_SETTINGS } from '../lib/defaults';
import { rectPath } from '../lib/geometry';
import { PcbSettings } from '../definitions';

const dir = path.join(__dirname, 'fixtures/power-replay-usbc');
const inputs = fs
    .readdirSync(dir)
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), 'utf8') }));
const project = parseProject(inputs);

const coords = (gcode: string) =>
    gcode
        .split('\n')
        .filter((l) => /^G[0-3]\b/.test(l))
        .flatMap((l) => [...l.matchAll(/([XYZ])(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])] as const));

describe('tools', () => {
    it('computes V-bit cut widths', () => {
        expect(vbitWidth({ angle: 30, tipDiameter: 0.1 }, 0.05)).toBeCloseTo(0.1268, 4);
        expect(vbitWidth({ angle: 60, tipDiameter: 0.1 }, 0.05)).toBeCloseTo(0.1577, 4);
        expect(vbitWidth({ angle: 60, tipDiameter: 0.1 }, 0)).toBeCloseTo(0.1, 4);
    });

    it('picks the nearest drill from 0.1 - 2.0 mm', () => {
        expect(pickDrill(0.203, DEFAULT_DRILLS)).toBe(0.2);
        expect(pickDrill(0.8128, DEFAULT_DRILLS)).toBe(0.8);
        expect(pickDrill(0.65, DEFAULT_DRILLS)).toBe(0.6);
        expect(pickDrill(3.2, DEFAULT_DRILLS)).toBe(2);
    });

    it('finds gaps narrower than the cut width', () => {
        // two pads 0.15 mm apart
        const copper = [rectPath(0, 0, 1, 1), rectPath(1.15, 0, 1, 1)];
        expect(findUnisolated(copper, 0.127)).toHaveLength(0);
        expect(findUnisolated(copper, 0.158).length).toBeGreaterThan(0);
    });
});

describe('Fusion 360 / EAGLE sample board', () => {
    it('detects all layers', () => {
        const kinds = Object.fromEntries(project.files.map((f) => [f.name, f.kind]));
        expect(kinds).toMatchObject({
            'copper_top.gbr': 'top',
            'copper_bottom.gbr': 'bottom',
            'profile.gbr': 'outline',
            'drill_1_16.xln': 'drill',
            'gerber_job.gbrjob': 'ignored',
        });
        expect(project.holes).toHaveLength(79);
        expect(project.warnings).toEqual([]);
    });

    it('matches the board size from the Gerber job file', () => {
        const model = buildBoardModel(project, 'top');
        const job = JSON.parse(fs.readFileSync(path.join(dir, 'gerber_job.gbrjob'), 'utf8'));
        expect(model.width).toBeCloseTo(job.Overall.Size.X, 1);
        expect(model.height).toBeCloseTo(job.Overall.Size.Y, 1);
        expect(model.hasOutline).toBe(true);
    });

    it.each(['top', 'bottom'] as const)('generates valid programs for the %s side', (side) => {
        // this board has gaps below the 60° bit's cut width, so use a fine 30° bit
        const settings: PcbSettings = {
            ...DEFAULT_PCB_SETTINGS,
            side,
            vbits: [{ id: 'v30', name: 'V-bit 30°', angle: 30, tipDiameter: 0.1 }],
            isolation: { ...DEFAULT_PCB_SETTINGS.isolation, toolId: 'v30' },
        };
        const model = buildBoardModel(project, side);
        const ops = buildOperations(model, settings);
        const kinds = ops.map((o) => o.kind);
        expect(kinds[0]).toBe('isolation');
        expect(kinds).toContain('drill');
        expect(kinds[kinds.length - 1]).toBe('outline');
        expect(ops.filter((o) => o.kind === 'drill').map((o) => o.name)).toEqual([
            'Drill 0.2 mm',
            'Drill 0.3 mm',
            'Drill 0.6 mm',
        ]);
        expect(ops.find((o) => o.id === 'drill-0.2')!.points).toHaveLength(59);

        for (const op of ops) {
            expect(op.gcode).not.toMatch(/NaN|Infinity/);
            expect(op.gcode).toMatch(/^\(gSender PCB/);
            expect(op.gcode).toContain('M3 S12000');
            expect(op.gcode.trim().endsWith('M2')).toBe(true);
            for (const [axis, v] of coords(op.gcode)) {
                if (axis === 'X') expect(v).toBeGreaterThan(-2);
                if (axis === 'X') expect(v).toBeLessThan(model.width + 2);
                if (axis === 'Y') expect(v).toBeGreaterThan(-2);
                if (axis === 'Y') expect(v).toBeLessThan(model.height + 2);
                if (axis === 'Z') expect(v).toBeGreaterThanOrEqual(-1.9 - 1e-9);
                if (axis === 'Z') expect(v).toBeLessThanOrEqual(5);
            }
        }

        const iso = ops[0];
        const isoZ = coords(iso.gcode).filter(([a]) => a === 'Z').map(([, v]) => v);
        expect(Math.min(...isoZ)).toBeCloseTo(-0.05);
        expect(iso.unisolated).toEqual([]);
    });

    it('mirrors the bottom side around the board centre', () => {
        const top = buildBoardModel(project, 'top');
        const bottom = buildBoardModel(project, 'bottom');
        const t = top.holes[0];
        const b = bottom.holes[0];
        expect(b.x).toBeCloseTo(top.width - t.x, 6);
        expect(b.y).toBeCloseTo(t.y, 6);
    });

    it('lifts over tabs only on the deepest passes', () => {
        const model = buildBoardModel(project, 'top');
        const outline = buildOperations(model, DEFAULT_PCB_SETTINGS).find((o) => o.kind === 'outline')!;
        const zs = coords(outline.gcode).filter(([a]) => a === 'Z').map(([, v]) => v);
        // passes 0.3 mm down to 1.9 mm, tabs at -1.6 + 0.6 = -1.0
        expect(zs.filter((z) => z === -1)).toHaveLength(16);
        expect(Math.min(...zs)).toBeCloseTo(-1.9);
    });

    it('reports unisolated copper for a bit that is too wide', () => {
        const model = buildBoardModel(project, 'top');
        const settings: PcbSettings = {
            ...DEFAULT_PCB_SETTINGS,
            vbits: [{ id: 'wide', name: 'wide', angle: 60, tipDiameter: 0.3 }],
            isolation: { ...DEFAULT_PCB_SETTINGS.isolation, toolId: 'wide', depth: 0.1 },
            drilling: { ...DEFAULT_PCB_SETTINGS.drilling, enabled: false },
            outline: { ...DEFAULT_PCB_SETTINGS.outline, enabled: false },
        };
        const [iso] = buildOperations(model, settings);
        expect(iso.unisolated!.length).toBeGreaterThan(0);
        expect(iso.warnings[0]).toMatch(/closer than/);
    });
});

describe('KiCad sample board', () => {
    const kdir = path.join(__dirname, 'fixtures/kicad-rp2040-adapter');
    const kinputs = fs
        .readdirSync(kdir)
        .map((name) => ({ name, content: fs.readFileSync(path.join(kdir, name), 'utf8') }));

    it('detects layers and generates programs without warnings', () => {
        const kproject = parseProject(kinputs);
        const kinds = Object.fromEntries(kproject.files.map((f) => [f.name, f.kind]));
        expect(kinds).toEqual({
            'pcb-B_Cu.gbr': 'bottom',
            'pcb-F_Cu.gbr': 'top',
            'pcb-Edge_Cuts.gbr': 'outline',
            'pcb-NPTH.drl': 'drill',
            'pcb-PTH.drl': 'drill',
            'pcb-F_Mask.gbr': 'ignored',
        });
        expect(kproject.warnings).toEqual([]);
        const model = buildBoardModel(kproject, 'top');
        expect(model.hasOutline).toBe(true);
        const ops = buildOperations(model, DEFAULT_PCB_SETTINGS);
        expect(ops[0].kind).toBe('isolation');
        expect(ops[ops.length - 1].kind).toBe('outline');
        for (const op of ops) {
            expect(op.gcode).not.toMatch(/NaN|Infinity/);
        }
    });
});
