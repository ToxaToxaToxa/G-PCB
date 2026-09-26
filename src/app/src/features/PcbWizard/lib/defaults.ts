import { DEFAULT_DRILLS } from '../../PcbMilling/lib/defaults';
import { StageKind, WizardSettings } from '../definitions';

export const DEFAULT_ORDER: StageKind[] = ['isolation', 'drill', 'holes', 'outline'];

export const DEFAULT_WIZARD_SETTINGS: WizardSettings = {
    side: 'top',
    stock: {
        width: 100,
        height: 70,
        margin: 3,
        gap: 3,
        rotation: 'auto',
        fill: true,
        cols: 1,
        rows: 1,
    },
    tools: [
        { id: 'v60-0.1', kind: 'vbit', name: 'V-bit 60° / 0.1', angle: 60, diameter: 0.1 },
        { id: 'v60-0.2', kind: 'vbit', name: 'V-bit 60° / 0.2', angle: 60, diameter: 0.2 },
        { id: 'v60-0.3', kind: 'vbit', name: 'V-bit 60° / 0.3', angle: 60, diameter: 0.3 },
        { id: 'em-1', kind: 'endmill', name: 'End mill 1.0', diameter: 1 },
        { id: 'em-2', kind: 'endmill', name: 'End mill 2.0', diameter: 2 },
    ],
    drills: DEFAULT_DRILLS,
    order: DEFAULT_ORDER,
    isolation: {
        enabled: true,
        toolId: 'v60-0.1',
        depth: 0.05,
        passes: 2,
        overlap: 0.4,
        feed: 120,
        plunge: 30,
        rpm: 12000,
        direction: 'climb',
    },
    drill: {
        enabled: true,
        plunge: 50,
        rpm: 12000,
        peck: 0,
    },
    holes: {
        enabled: true,
        toolId: 'em-1',
        stepdown: 0.3,
        feed: 120,
        plunge: 30,
        rpm: 12000,
    },
    outline: {
        enabled: true,
        toolId: 'em-1',
        stepdown: 0.3,
        feed: 120,
        plunge: 30,
        rpm: 12000,
        tabs: 4,
        tabWidth: 2,
        tabHeight: 0.6,
    },
    boardThickness: 1.6,
    breakthrough: 0.3,
    travelZ: 1,
    safeZ: 5,
    dwell: 2,
    applyHeightMap: true,
};
