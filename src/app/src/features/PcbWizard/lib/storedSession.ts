/*
 * The wizard session on disk, so a project survives closing the app (an
 * update, a crash). In the desktop app both the session and the last machine
 * position are files in the app data folder; in a plain browser the session
 * goes to IndexedDB and the machine position to localStorage.
 *
 * Work zero and Z0 are only trusted again when the controller reports the
 * same machine position and work offset as before: a 3018 without limit
 * switches loses its position when it is switched off, and an old X0 Y0 would
 * then cut the remaining programs off the isolation already milled.
 */
import { InputFile } from '../../PcbMilling/definitions';
import { LayerOverrides, StageKind } from '../definitions';
import type { ProgramResult } from './session';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface StoredSession {
    version: 1;
    savedAt: string;
    step: number;
    inputs: InputFile[];
    overrides: LayerOverrides;
    projectName: string;
    stages: Record<StageKind, boolean>;
    xySet: boolean;
    reference: { x: number; y: number } | null;
    zeroBit: string | null;
    heightMapId: string | null;
    skipHeightMap: boolean;
    results: Record<string, ProgramResult>;
    /** Program id -> hash of its G-code, so a result is kept only for the same program */
    opHashes: Record<string, string>;
}

export interface MachineMark {
    mpos: Vec3;
    wco: Vec3;
    at: string;
}

const DB_NAME = 'gpcb-wizard';
const STORE = 'session';
const KEY = 'last';
const MACHINE_KEY = 'gpcb-wizard-machine';
/** mm; GRBL reports three decimals */
const POSITION_TOLERANCE = 0.005;

const openDb = (): Promise<IDBDatabase | null> =>
    new Promise((resolve) => {
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> => {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
        try {
            const tx = db.transaction(STORE, mode);
            const request = run(tx.objectStore(STORE));
            tx.oncomplete = () => {
                db.close();
                resolve(request ? (request.result as T) : null);
            };
            tx.onerror = () => {
                db.close();
                resolve(null);
            };
        } catch {
            db.close();
            resolve(null);
        }
    });
};

// ---- files in the app data folder (desktop app) ----
// The renderer's IndexedDB and localStorage belong to its origin, and the
// desktop app serves the page on a new port at every start, so there they
// would be empty after a restart. The preload exposes fs, and main.js tells
// where the app data folder is.

interface DesktopApi {
    ipcRenderer?: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
    readFileSync?: (path: string, encoding: string) => string;
    writeFileSync?: (path: string, data: string) => void;
    pathJoin?: (...parts: string[]) => string;
}

const desktop = (typeof window !== 'undefined' ? (window as unknown as DesktopApi) : {}) as DesktopApi;
const hasFiles = !!(desktop.ipcRenderer?.invoke && desktop.readFileSync && desktop.writeFileSync && desktop.pathJoin);
const SESSION_FILE = 'pcb-wizard-session.json';
const MACHINE_FILE = 'pcb-wizard-machine.json';

let dataDir: string | null = null;
const dataDirReady: Promise<string | null> = hasFiles
    ? desktop
          .ipcRenderer!.invoke('pcb:user-data-path')
          .then((dir) => {
              dataDir = typeof dir === 'string' && dir ? dir : null;
              return dataDir;
          })
          .catch(() => null)
    : Promise.resolve(null);

const filePath = (name: string) => (dataDir ? desktop.pathJoin!(dataDir, name) : null);

const readJson = <T>(name: string): T | null => {
    const path = filePath(name);
    if (!path) return null;
    try {
        const text = desktop.readFileSync!(path, 'utf8');
        return text ? (JSON.parse(text) as T) : null;
    } catch {
        return null;
    }
};

const writeText = (name: string, text: string) => {
    const path = filePath(name);
    if (!path) return false;
    try {
        desktop.writeFileSync!(path, text);
        return true;
    } catch {
        return false;
    }
};

const valid = (data: StoredSession | null) =>
    data && data.version === 1 && Array.isArray(data.inputs) && data.inputs.length > 0 ? data : null;

export const saveStoredSession = async (data: StoredSession) => {
    if (hasFiles && (await dataDirReady)) {
        writeText(SESSION_FILE, JSON.stringify(data));
        return;
    }
    await withStore('readwrite', (s) => s.put(data, KEY));
};

export const clearStoredSession = async () => {
    if (hasFiles && (await dataDirReady)) {
        writeText(SESSION_FILE, '');
        return;
    }
    await withStore('readwrite', (s) => s.delete(KEY));
};

export const loadStoredSession = async (): Promise<StoredSession | null> => {
    if (hasFiles && (await dataDirReady)) {
        return valid(readJson<StoredSession>(SESSION_FILE));
    }
    return valid(await withStore<StoredSession>('readonly', (s) => s.get(KEY)));
};

export const saveMachineMark = (mark: MachineMark) => {
    if (hasFiles && dataDir) {
        writeText(MACHINE_FILE, JSON.stringify(mark));
        return;
    }
    try {
        localStorage.setItem(MACHINE_KEY, JSON.stringify(mark));
    } catch {
        // storage unavailable: the zero is simply not kept after a restart
    }
};

export const loadMachineMark = (): MachineMark | null => {
    if (hasFiles && dataDir) {
        return readJson<MachineMark>(MACHINE_FILE);
    }
    try {
        const raw = localStorage.getItem(MACHINE_KEY);
        return raw ? (JSON.parse(raw) as MachineMark) : null;
    } catch {
        return null;
    }
};

const same = (a: Vec3, b: Vec3) =>
    Math.abs(a.x - b.x) <= POSITION_TOLERANCE &&
    Math.abs(a.y - b.y) <= POSITION_TOLERANCE &&
    Math.abs(a.z - b.z) <= POSITION_TOLERANCE;

const finite = (v: Vec3 | null | undefined): v is Vec3 =>
    !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export type MachineCheck = 'kept' | 'moved' | 'not-connected' | 'unknown';

/**
 * Whether the machine still stands where the session left it: same machine
 * position and same work offset. Anything else means the zero must be set again.
 */
export const checkMachine = (
    mark: MachineMark | null,
    current: { connected: boolean; mpos: Vec3 | null; wco: Vec3 | null },
): MachineCheck => {
    if (!mark || !finite(mark.mpos) || !finite(mark.wco)) return 'unknown';
    if (!current.connected) return 'not-connected';
    if (!finite(current.mpos) || !finite(current.wco)) return 'not-connected';
    return same(mark.mpos, current.mpos) && same(mark.wco, current.wco) ? 'kept' : 'moved';
};

/** Results stay only for programs whose G-code is the same as when they ran. */
export const keepRestoredResults = (
    ops: { id: string; gcode: string }[],
    results: Record<string, ProgramResult>,
    hashes: Record<string, string>,
    hash: (text: string) => string,
): Record<string, ProgramResult> => {
    const kept: Record<string, ProgramResult> = {};
    for (const op of ops) {
        if (results[op.id] && hashes[op.id] && hashes[op.id] === hash(op.gcode)) {
            kept[op.id] = results[op.id];
        }
    }
    return kept;
};

/** Step to reopen: without a trusted zero, the machine steps start again at Work zero. */
export const restoreStep = (savedStep: number, zeroKept: boolean, workZeroStep: number) =>
    zeroKept ? savedStep : Math.min(savedStep, workZeroStep);
