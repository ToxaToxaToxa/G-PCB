import { PcbSettings } from '../definitions';

/** 0.1 ... 2.0 mm in 0.1 mm steps */
export const DEFAULT_DRILLS = Array.from({ length: 20 }, (_, i) => Number(((i + 1) / 10).toFixed(1)));

export const DEFAULT_PCB_SETTINGS: PcbSettings = {
    side: 'top',
    vbits: [
        { id: 'v30', name: 'V-bit 30°', angle: 30, tipDiameter: 0.1 },
        { id: 'v60', name: 'V-bit 60°', angle: 60, tipDiameter: 0.1 },
    ],
    isolation: {
        enabled: true,
        toolId: 'v30',
        depth: 0.05,
        passes: 2,
        overlap: 0.4,
        feed: 120,
        plunge: 30,
        rpm: 12000,
        direction: 'climb',
    },
    drilling: {
        enabled: true,
        drills: DEFAULT_DRILLS,
        boardThickness: 1.6,
        breakthrough: 0.3,
        plunge: 50,
        rpm: 12000,
        peck: 0,
    },
    outline: {
        enabled: true,
        endMillDiameter: 1,
        stepdown: 0.3,
        feed: 120,
        plunge: 30,
        rpm: 12000,
        tabs: 4,
        tabWidth: 2,
        tabHeight: 0.6,
        millLargeHoles: true,
    },
    travelZ: 1,
    safeZ: 5,
    dwell: 2,
    applyHeightMap: true,
};
