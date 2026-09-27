/*
 * Wizard session kept outside React, so leaving the page (to jog on the
 * Carve screen, say) does not lose the loaded project or the run progress,
 * and a program that ends while the page is closed is still recorded.
 * It lives for the app session; nothing here is written to disk.
 */
import { useSyncExternalStore } from 'react';
import pubsub from 'pubsub-js';

import controller from 'app/lib/controller';
import reduxStore from 'app/store/redux';

import { InputFile } from '../../PcbMilling/definitions';
import { ParsedProject } from '../../PcbMilling/lib/board';
import { LayerOverrides } from '../definitions';
import { PlannedOperation, programFileName } from './plan';

export type ProgramResult = 'done' | 'stopped';

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
};

let session = initial;
const listeners = new Set<() => void>();

export const getSession = () => session;

export const updateSession = (patch: Partial<WizardSession>) => {
    session = { ...session, ...patch };
    listeners.forEach((l) => l());
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

export const resetSession = () => updateSession(initial);

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

controller.addListener?.('job:start', () => onJobStart(reduxStore.getState().file?.name));

// finishTime is only set when the program ran to the end; a stop leaves it 0
pubsub.subscribe('job:end', (_msg: string, data: { status?: { finishTime?: number } }) => {
    const id = session.runningId;
    if (!id) return;
    const result: ProgramResult = (data?.status?.finishTime ?? 0) > 0 ? 'done' : 'stopped';
    updateSession({ runningId: null, results: { ...session.results, [id]: result } });
});
