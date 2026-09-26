/*
 * Builds the ordered list of programs for the panel with the existing PCB
 * toolpath generators. Each stage gets its own tool and cutting data.
 */
import { Operation, PcbSettings } from '../../PcbMilling/definitions';
import { BoardModel } from '../../PcbMilling/lib/board';
import { DEFAULT_PCB_SETTINGS } from '../../PcbMilling/lib/defaults';
import { buildDrillOps, buildHoleMilling, buildIsolation, buildOutline, vbitWidth } from '../../PcbMilling/lib/toolpaths';
import { StageKind, Tool, WizardSettings } from '../definitions';

export interface PlannedOperation extends Operation {
    stage: StageKind;
}

export const findTool = (settings: WizardSettings, id: string) => settings.tools.find((t) => t.id === id);

/** Cut width of the isolation stage with its selected V-bit. */
export const isolationWidth = (settings: WizardSettings) => {
    const bit = findTool(settings, settings.isolation.toolId);
    if (!bit || bit.kind !== 'vbit') return 0;
    return vbitWidth({ angle: bit.angle ?? 60, tipDiameter: bit.diameter }, settings.isolation.depth);
};

/** Maps the wizard stages onto the single-tool settings of the PCB generators. */
export const toPcbSettings = (s: WizardSettings, millTool: Tool | undefined, millStage: 'holes' | 'outline'): PcbSettings => {
    const bit = findTool(s, s.isolation.toolId);
    const mill = millStage === 'holes' ? s.holes : s.outline;
    return {
        ...DEFAULT_PCB_SETTINGS,
        side: s.side,
        vbits: bit ? [{ id: bit.id, name: bit.name, angle: bit.angle ?? 60, tipDiameter: bit.diameter }] : [],
        isolation: { ...s.isolation },
        drilling: {
            enabled: s.drill.enabled,
            drills: s.drills,
            boardThickness: s.boardThickness,
            breakthrough: s.breakthrough,
            plunge: s.drill.plunge,
            rpm: s.drill.rpm,
            peck: s.drill.peck,
        },
        outline: {
            enabled: true,
            endMillDiameter: millTool?.diameter ?? 1,
            stepdown: mill.stepdown,
            feed: mill.feed,
            plunge: mill.plunge,
            rpm: mill.rpm,
            tabs: s.outline.tabs,
            tabWidth: s.outline.tabWidth,
            tabHeight: s.outline.tabHeight,
            // holes larger than the biggest drill go to the end mill stage
            millLargeHoles: s.holes.enabled,
        },
        travelZ: s.travelZ,
        safeZ: s.safeZ,
        dwell: s.dwell,
        applyHeightMap: s.applyHeightMap,
    };
};

export const planOperations = (model: BoardModel, s: WizardSettings): PlannedOperation[] => {
    const holeTool = findTool(s, s.holes.toolId);
    const outlineTool = findTool(s, s.outline.toolId);
    // isolation and drilling share these; drilling must know the hole milling tool
    const base = toPcbSettings(s, holeTool, 'holes');
    const outlineSettings = toPcbSettings(s, outlineTool, 'outline');

    const build: Record<StageKind, () => Operation[]> = {
        isolation: () => {
            if (!s.isolation.enabled) return [];
            const op = buildIsolation(model, base);
            return op ? [op] : [];
        },
        // drills and the hole milling stage share the "too big to drill" split
        drill: () => (s.drill.enabled ? buildDrillOps(model, base) : []),
        holes: () => {
            if (!s.holes.enabled) return [];
            const op = buildHoleMilling(model, base);
            return op ? [op] : [];
        },
        outline: () => {
            if (!s.outline.enabled) return [];
            const op = buildOutline(model, outlineSettings);
            return op ? [op] : [];
        },
    };

    const ops: PlannedOperation[] = [];
    for (const stage of s.order) {
        ops.push(...build[stage]().map((op) => ({ ...op, stage })));
    }
    return ops;
};

/** Problems with the plan that do not stop generation but deserve a look. */
export const planWarnings = (s: WizardSettings): string[] => {
    const warnings: string[] = [];
    const iso = findTool(s, s.isolation.toolId);
    if (s.isolation.enabled && iso?.kind !== 'vbit') {
        warnings.push('Isolation needs a V-bit.');
    }
    for (const stage of ['holes', 'outline'] as const) {
        const t = findTool(s, s[stage].toolId);
        if (s[stage].enabled && t?.kind !== 'endmill') {
            warnings.push(`${stage === 'holes' ? 'Hole milling' : 'Board outline'} needs an end mill.`);
        }
    }
    const outlineTool = findTool(s, s.outline.toolId);
    if (s.outline.enabled && outlineTool) {
        if (s.stock.gap < outlineTool.diameter + 0.5) {
            warnings.push(
                `The ${s.stock.gap} mm gap between boards is tight for the ${outlineTool.diameter} mm end mill; use at least ${outlineTool.diameter + 0.5} mm.`,
            );
        }
        if (s.stock.margin < outlineTool.diameter) {
            warnings.push(`The ${s.stock.margin} mm stock margin is smaller than the ${outlineTool.diameter} mm end mill.`);
        }
    }
    const last = s.order.filter((k) => s[k].enabled).pop();
    if (s.outline.enabled && last !== 'outline') {
        warnings.push('The board outline is not the last stage: boards held only by tabs may move during later stages.');
    }
    return warnings;
};

/** Numbered file name so the programs sort in running order. */
export const programFileName = (project: string, index: number, op: Operation) =>
    `${project}_${String(index + 1).padStart(2, '0')}_${op.id}.nc`;
