/*
 * Wizard session kept outside React, so leaving the page (to jog on the
 * Carve screen, say) does not lose the loaded project or the run progress,
 * and a program that ends while the page is closed is still recorded.
 * It is also saved to disk (lib/storedSession.ts), so an unfinished project
 * can be continued after the app was closed.
 */
import { useEffect, useSyncExternalStore } from 'react';
import pubsub from 'pubsub-js';

import controller from 'app/lib/controller';
import reduxStore from 'app/store/redux';

import { InputFile } from '../../PcbMilling/definitions';
import { ParsedProject } from '../../PcbMilling/lib/board';
import { LayerOverrides, StageKind } from '../definitions';
import { PlannedOperation, programFileName } from './plan';
import { hashText } from './programs';
import { StoredSession, clearStoredSession, saveMachineMark, saveStoredSession } from './storedSession';

export type ProgramResult = 'done' | 'stopped' | 'skipped';

/** A program that needs nothing more: it ran to the end or was skipped on purpose. */
export const isFinished = (result: ProgramResult | undefined) => result === 'done' || result === 'skipped';

export interface WizardSession {
    step: number;
    inputs: InputFile[];
    overrides: LayerOverrides;
    projectName: string;
    project: ParsedProject | null;
    ops: PlannedOperation[];
    /** What the programs were generated from: the project and the settings as JSON */
    builtFrom: { project: ParsedProject | null; settings: string } | null;
    /** X0 Y0 set on the blank corner */
    xySet: boolean;
    /** Point where Z0 is probed, fixed once the first Z0 is set */
    reference: { x: number; y: number } | null;
    /** Bit (see bitKey) that Z0 is valid for */
    zeroBit: string | null;
    heightMapId: string | null;
    skipHeightMap: boolean;
    /** Program id -> outcome */
    results: Record<string, ProgramResult>;
    /** Program that was started and has not ended yet */
    runningId: string | null;
    /** What the wizard loaded last: a program is startable only while this is its current G-code */
    loaded: { opId: string; hash: string; name: string } | null;
    /** Z0 or the height map is being probed: the wizard stays on that step */
    probing: boolean;
    /** Restored from disk and not regenerated yet: program id -> G-code hash the results belong to */
    restoredHashes: Record<string, string> | null;
}

const initial: WizardSession = {
    step: 0,
    inputs: [],
    overrides: {},
    projectName: 'pcb',
    project: null,
    ops: [],
    builtFrom: null,
    xySet: false,
    reference: null,
    zeroBit: null,
    heightMapId: null,
    skipHeightMap: false,
    results: {},
    runningId: null,
    loaded: null,
    probing: false,
    restoredHashes: null,
};

let session = initial;
const listeners = new Set<() => void>();

export const getSession = () => session;

// ---- saving to disk ----

let stages: Record<StageKind, boolean> = { isolation: true, drill: true, holes: true, outline: true };
let keepProject = true;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const toStored = (s: WizardSession): StoredSession => ({
    version: 1,
    savedAt: new Date().toISOString(),
    step: s.step,
    inputs: s.inputs,
    overrides: s.overrides,
    projectName: s.projectName,
    stages,
    xySet: s.xySet,
    reference: s.reference,
    zeroBit: s.zeroBit,
    heightMapId: s.heightMapId,
    skipHeightMap: s.skipHeightMap,
    results: s.results,
    // before the programs are regenerated, keep the hashes the results came with
    opHashes: s.ops.length
        ? Object.fromEntries(s.ops.map((op) => [op.id, hashText(op.gcode)]))
        : s.restoredHashes ?? {},
});

const scheduleSave = () => {
    if (!keepProject || !session.inputs.length) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (keepProject && session.inputs.length) {
            saveStoredSession(toStored(session));
            writeMachineMark(true);
        }
    }, 500);
};

/** Off: nothing is written, and the copy already on disk is removed. */
export const setKeepProject = (keep: boolean) => {
    if (keep === keepProject) return;
    keepProject = keep;
    if (keep) {
        scheduleSave();
    } else {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        clearStoredSession();
    }
};

/** The stages chosen in the plan belong to the project, so they are saved with it. */
export const setSessionStages = (next: Record<StageKind, boolean>) => {
    if (JSON.stringify(next) === JSON.stringify(stages)) return;
    stages = { ...next };
    scheduleSave();
};

export const updateSession = (patch: Partial<WizardSession>) => {
    session = { ...session, ...patch };
    listeners.forEach((l) => l());
    scheduleSave();
};

/** Keeps the wizard on the current step while `active` (probing) is true. */
export const useProbingLock = (active: boolean) => {
    useEffect(() => {
        updateSession({ probing: active });
        return () => updateSession({ probing: false });
    }, [active]);
};

/** Machine state for a new blank: zero, map and results start over. */
export const resetMachineState = () =>
    updateSession({
        xySet: false,
        reference: null,
        zeroBit: null,
        heightMapId: null,
        skipHeightMap: false,
        results: {},
        runningId: null,
        loaded: null,
    });

export const resetSession = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    clearStoredSession();
    session = initial;
    listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const useSession = () => useSyncExternalStore(subscribe, getSession, getSession);

/**
 * A job started, from the wizard or from the Carve screen: if the loaded
 * file is one of the wizard's programs, track it until it ends.
 */
export const onJobStart = (fileName: string | null | undefined) => {
    const index = session.ops.findIndex((op, i) => programFileName(session.projectName, i, op) === fileName);
    updateSession({ runningId: index >= 0 ? session.ops[index].id : null });
};

// The machine position tells after a restart whether the controller kept its
// position (see storedSession). It is written with every session save, about
// once a second while the store changes, and when the window closes.
let lastMark = '';
let lastMarkAt = 0;
const writeMachineMark = (force = false) => {
    if (!keepProject || !session.inputs.length) return;
    const now = Date.now();
    if (!force && now - lastMarkAt < 1000) return;
    const state = reduxStore.getState?.();
    if (!state?.connection?.isConnected) return;
    const { mpos, wpos } = state.controller ?? {};
    if (!mpos || !wpos) return;
    const m = { x: Number(mpos.x), y: Number(mpos.y), z: Number(mpos.z) };
    const w = { x: Number(wpos.x), y: Number(wpos.y), z: Number(wpos.z) };
    if (![m.x, m.y, m.z, w.x, w.y, w.z].every(Number.isFinite)) return;
    const wco = { x: m.x - w.x, y: m.y - w.y, z: m.z - w.z };
    const text = JSON.stringify([m, wco]);
    lastMarkAt = now;
    if (text === lastMark) return;
    lastMark = text;
    saveMachineMark({ mpos: m, wco, at: new Date(now).toISOString() });
};
reduxStore.subscribe?.(() => writeMachineMark());
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => writeMachineMark(true));
}

controller.addListener?.('job:start', () => onJobStart(reduxStore.getState().file?.name));

// finishTime is only set when the program ran to the end; a stop leaves it 0
pubsub.subscribe('job:end', (_msg: string, data: { status?: { finishTime?: number } }) => {
    const id = session.runningId;
    if (!id) return;
    const result: ProgramResult = (data?.status?.finishTime ?? 0) > 0 ? 'done' : 'stopped';
    updateSession({ runningId: null, results: { ...session.results, [id]: result } });
});
