import { checkMachine, keepRestoredResults, loadMachineMark, restoreStep, saveMachineMark } from '../lib/storedSession';

const mark = { mpos: { x: -120.5, y: -80.25, z: -10 }, wco: { x: -150, y: -100, z: -30.123 }, at: '2026-11-22T17:00:00Z' };

describe('restoring a project', () => {
    it('keeps the zero only when the machine reports the same position and offset', () => {
        expect(checkMachine(mark, { connected: true, mpos: { ...mark.mpos }, wco: { ...mark.wco } })).toBe('kept');
        // within the three decimals GRBL reports
        expect(checkMachine(mark, { connected: true, mpos: { ...mark.mpos, x: -120.502 }, wco: mark.wco })).toBe('kept');
        // switched off: the controller starts at machine 0,0,0 with the old offset from EEPROM
        expect(checkMachine(mark, { connected: true, mpos: { x: 0, y: 0, z: 0 }, wco: mark.wco })).toBe('moved');
        // offset changed (a new zero set from another program)
        expect(checkMachine(mark, { connected: true, mpos: mark.mpos, wco: { ...mark.wco, z: -29 } })).toBe('moved');
        expect(checkMachine(mark, { connected: false, mpos: null, wco: null })).toBe('not-connected');
        expect(checkMachine(mark, { connected: true, mpos: { x: NaN, y: 0, z: 0 }, wco: mark.wco })).toBe('not-connected');
        expect(checkMachine(null, { connected: true, mpos: mark.mpos, wco: mark.wco })).toBe('unknown');
    });

    it('stores the machine mark', () => {
        saveMachineMark(mark);
        expect(loadMachineMark()).toEqual(mark);
    });

    it('keeps results only for programs with the same G-code', () => {
        const hash = (t: string) => `h:${t}`;
        const ops = [
            { id: 'iso', gcode: 'A' },
            { id: 'drill-0.8', gcode: 'B2' },
            { id: 'outline', gcode: 'C' },
        ];
        const results = { iso: 'done', 'drill-0.8': 'done', outline: 'skipped', gone: 'done' } as const;
        const hashes = { iso: 'h:A', 'drill-0.8': 'h:B', outline: 'h:C', gone: 'h:X' };
        expect(keepRestoredResults(ops, { ...results }, hashes, hash)).toEqual({ iso: 'done', outline: 'skipped' });
    });

    it('reopens the machine steps at Work zero when the zero is not kept', () => {
        expect(restoreStep(6, true, 4)).toBe(6);
        expect(restoreStep(6, false, 4)).toBe(4);
        expect(restoreStep(2, false, 4)).toBe(2);
    });
});

describe('session files in the desktop app', () => {
    it('saves and loads the session and the machine mark as files in the app data folder', async () => {
        const files: Record<string, string> = {};
        const w = window as unknown as Record<string, unknown>;
        w.ipcRenderer = { invoke: async (channel: string) => (channel === 'pcb:user-data-path' ? 'C:/data' : null) };
        w.readFileSync = (p: string) => {
            if (!(p in files)) throw new Error('ENOENT');
            return files[p];
        };
        w.writeFileSync = (p: string, d: string) => {
            files[p] = d;
        };
        w.pathJoin = (...parts: string[]) => parts.join('/');

        let mod: typeof import('../lib/storedSession') | null = null;
        jest.isolateModules(() => {
            mod = require('../lib/storedSession');
        });
        const m = mod!;
        expect(await m.loadStoredSession()).toBeNull();

        const stored = {
            version: 1 as const,
            savedAt: '2026-11-22T20:00:00Z',
            step: 6,
            inputs: [{ name: 'a.gbr', content: 'G04*' }],
            overrides: {},
            projectName: 'board',
            stages: { isolation: true, drill: true, holes: false, outline: true },
            xySet: true,
            reference: { x: 1, y: 2 },
            zeroBit: 'tool:v',
            heightMapId: 'hm-1',
            skipHeightMap: false,
            results: { iso: 'done' as const },
            opHashes: { iso: 'h' },
        };
        await m.saveStoredSession(stored);
        expect(Object.keys(files)).toEqual(['C:/data/pcb-wizard-session.json']);
        expect(await m.loadStoredSession()).toEqual(stored);

        m.saveMachineMark(mark);
        expect(m.loadMachineMark()).toEqual(mark);
        expect(files['C:/data/pcb-wizard-machine.json']).toBeTruthy();

        await m.clearStoredSession();
        expect(await m.loadStoredSession()).toBeNull();

        delete w.ipcRenderer;
        delete w.readFileSync;
        delete w.writeFileSync;
        delete w.pathJoin;
    });
});
