import fs from 'fs';
import path from 'path';
import { buildBoardModel, parseProject } from '../../PcbMilling/lib/board';
import { DEFAULT_WIZARD_SETTINGS } from '../lib/defaults';
import { fitCount, layoutPanel, panelizeModel, rotateModel } from '../lib/panel';
import { planOperations, planWarnings, programFileName } from '../lib/plan';
import { StockSettings, WizardSettings } from '../definitions';

const dir = path.join(__dirname, '../../PcbMilling/__tests__/fixtures/power-replay-usbc');
const inputs = fs
    .readdirSync(dir)
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), 'utf8') }));
// 28.88 x 45.49 mm board with 79 holes
const board = buildBoardModel(parseProject(inputs), 'top');

const stock = (patch: Partial<StockSettings> = {}): StockSettings => ({ ...DEFAULT_WIZARD_SETTINGS.stock, ...patch });

describe('layout', () => {
    it('counts boards along one side', () => {
        expect(fitCount(100, 30, 3, 3)).toBe(2); // 3 + 30 + 3 + 30 = 66, a third needs 99 + 3
        expect(fitCount(100, 29, 3, 3)).toBe(3); // 3 + 29 + 3 + 29 + 3 + 29 + 3 = 99
        expect(fitCount(20, 30, 3, 3)).toBe(0);
    });

    it('rotates the board when more copies fit', () => {
        const straight = layoutPanel(board.width, board.height, stock({ rotation: 0 }));
        expect([straight.cols, straight.rows]).toEqual([3, 1]);
        const auto = layoutPanel(board.width, board.height, stock());
        expect(auto.rotated).toBe(true);
        expect([auto.cols, auto.rows]).toEqual([2, 2]);
        expect(auto.copies[0]).toEqual([3, 3]);
        expect(auto.copies[1][0]).toBeCloseTo(3 + board.height + 3, 6);
    });

    it('warns when a fixed array does not fit', () => {
        const l = layoutPanel(board.width, board.height, stock({ fill: false, cols: 3, rows: 3, rotation: 0 }));
        expect(l.warnings[0]).toMatch(/do not fit/);
        expect(layoutPanel(200, 200, stock()).copies).toHaveLength(0);
    });
});

describe('panel model', () => {
    it('rotates holes and paths into the positive quadrant', () => {
        const r = rotateModel(board);
        expect(r.width).toBeCloseTo(board.height, 6);
        const h = board.holes[0];
        expect(r.holes[0].x).toBeCloseTo(board.height - h.y, 6);
        expect(r.holes[0].y).toBeCloseTo(h.x, 6);
        for (const p of r.holes) {
            expect(p.x).toBeGreaterThanOrEqual(-1e-6);
            expect(p.y).toBeGreaterThanOrEqual(-1e-6);
        }
    });

    it('generates one program per stage for all copies in the chosen order', () => {
        const s: WizardSettings = {
            ...DEFAULT_WIZARD_SETTINGS,
            // this board has gaps below the 60° bit's cut width
            tools: [...DEFAULT_WIZARD_SETTINGS.tools, { id: 'v30', kind: 'vbit', name: 'V 30', angle: 30, diameter: 0.1 }],
            isolation: { ...DEFAULT_WIZARD_SETTINGS.isolation, toolId: 'v30' },
        };
        const layout = layoutPanel(board.width, board.height, s.stock);
        const panel = panelizeModel(board, layout, s.stock);
        expect(panel.holes).toHaveLength(79 * 4);

        const ops = planOperations(panel, s);
        expect(ops.map((o) => o.stage)).toEqual(['isolation', 'drill', 'drill', 'drill', 'outline']);
        const outline = ops[ops.length - 1];
        // four boards, each outer contour cut separately
        expect(outline.paths).toHaveLength(4);
        for (const op of ops) {
            for (const [x, y] of op.paths.flat()) {
                expect(x).toBeGreaterThan(0);
                expect(x).toBeLessThan(s.stock.width);
                expect(y).toBeGreaterThan(0);
                expect(y).toBeLessThan(s.stock.height);
            }
        }
        expect(ops[0].unisolated).toEqual([]);
        expect(programFileName('pcb', 0, ops[0])).toBe('pcb_01_isolation-top.nc');

        const reordered = planOperations(panel, { ...s, order: ['outline', 'isolation', 'drill', 'holes'] });
        expect(reordered[0].stage).toBe('outline');
        expect(planWarnings({ ...s, order: ['outline', 'isolation', 'drill', 'holes'] })).toContainEqual(
            expect.stringMatching(/not the last stage/),
        );
    });

    it('flags tools that do not suit a stage', () => {
        const s = { ...DEFAULT_WIZARD_SETTINGS, outline: { ...DEFAULT_WIZARD_SETTINGS.outline, toolId: 'v60-0.1' } };
        expect(planWarnings(s)).toContain('Board outline needs an end mill.');
        expect(planWarnings(DEFAULT_WIZARD_SETTINGS)).toEqual([]);
    });
});
