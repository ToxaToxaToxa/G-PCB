/*
 * Excellon (NC drill) parser. Output in millimetres.
 */
export interface DrillHole {
    x: number;
    y: number;
    /** Hole diameter, mm */
    diameter: number;
    /** Slot end point, when the hole is a routed/G85 slot */
    x2?: number;
    y2?: number;
    plated?: boolean;
}

export interface DrillData {
    holes: DrillHole[];
    warnings: string[];
}

export const isExcellon = (content: string) =>
    /^\s*(M48|;.*\n\s*M48)/m.test(content) || /\bM48\b/.test(content.slice(0, 2000));

export const parseExcellon = (content: string): DrillData => {
    const warnings = new Set<string>();
    const holes: DrillHole[] = [];
    const tools = new Map<number, number>();

    let unitScale = 1; // 25.4 for inch
    let leadingZeros = true; // LZ: leading zeros kept -> trailing omitted
    let intDigits = 3;
    let decDigits = 3;
    let explicitFormat = false;
    let tool: number | null = null;
    let x = 0;
    let y = 0;
    let incremental = false;
    let plated: boolean | undefined;

    const parseNum = (raw: string): number => {
        if (raw.includes('.')) {
            return Number(raw) * unitScale;
        }
        let sign = 1;
        let digits = raw;
        if (digits[0] === '-' || digits[0] === '+') {
            sign = digits[0] === '-' ? -1 : 1;
            digits = digits.slice(1);
        }
        if (leadingZeros) {
            // trailing zeros omitted
            digits = digits.padEnd(intDigits + decDigits, '0');
        }
        return ((sign * Number(digits)) / 10 ** decDigits) * unitScale;
    };

    const setUnits = (line: string) => {
        const inch = line.startsWith('INCH') || line === 'M72';
        unitScale = inch ? 25.4 : 1;
        if (!explicitFormat) {
            intDigits = inch ? 2 : 3;
            decDigits = inch ? 4 : 3;
        }
        if (/,TZ/.test(line)) leadingZeros = false;
        if (/,LZ/.test(line)) leadingZeros = true;
        const fmt = /,(0+)\.(0+)/.exec(line);
        if (fmt) {
            intDigits = fmt[1].length;
            decDigits = fmt[2].length;
            explicitFormat = true;
        }
    };

    for (const rawLine of content.replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith(';')) {
            // KiCad: ; #@! TA.AperFunction,Plated,PTH,ComponentDrill
            if (/TA\.AperFunction,Plated/i.test(line)) plated = true;
            else if (/TA\.AperFunction,NonPlated/i.test(line)) plated = false;
            // EAGLE / Altium: ;FILE_FORMAT=2:4
            const ff = /FILE_FORMAT=(\d):(\d)/.exec(line);
            if (ff) {
                intDigits = Number(ff[1]);
                decDigits = Number(ff[2]);
                explicitFormat = true;
            }
            continue;
        }
        if (line.startsWith('METRIC') || line.startsWith('INCH') || line === 'M71' || line === 'M72') {
            setUnits(line === 'M71' ? 'METRIC' : line);
            continue;
        }
        if (line === 'G90') {
            incremental = false;
            continue;
        }
        if (line === 'G91') {
            incremental = true;
            continue;
        }
        // Tool definition: T1C0.800 or T01F00S00C0.0320
        const def = /^T(\d+)(?:[FSB][\d.]+)*C([\d.]+)/.exec(line);
        if (def) {
            tools.set(Number(def[1]), parseNum(def[2].includes('.') ? def[2] : `${def[2]}.`));
            continue;
        }
        const sel = /^T(\d+)$/.exec(line);
        if (sel) {
            const t = Number(sel[1]);
            tool = t === 0 ? null : t;
            if (tool !== null && !tools.has(tool)) warnings.add(`Drill tool T${tool} has no diameter`);
            continue;
        }
        if (/^(M30|M00|M48|M95|%|FMAT|ICI|VER|DETECT|ATC|G05|G00|M15|M16|M17)/.test(line) && !/^G00X/.test(line)) {
            if (/^(G00|M15|M16)/.test(line)) warnings.add('Routed drill paths (G00/M15) are not supported');
            continue;
        }

        const coord = /X([+-]?[\d.]+)?/.exec(line);
        const coordY = /Y([+-]?[\d.]+)/.exec(line);
        if (!coord && !coordY) continue;
        const nx = coord && coord[1] !== undefined ? parseNum(coord[1]) : incremental ? 0 : x;
        const ny = coordY ? parseNum(coordY[1]) : incremental ? 0 : y;
        const hx = incremental ? x + nx : nx;
        const hy = incremental ? y + ny : ny;

        if (tool === null || !tools.has(tool)) {
            warnings.add('Hole without a drill tool');
        } else {
            const slot = /G85X([+-]?[\d.]+)Y([+-]?[\d.]+)/.exec(line);
            if (slot) {
                holes.push({ x: hx, y: hy, x2: parseNum(slot[1]), y2: parseNum(slot[2]), diameter: tools.get(tool)!, plated });
            } else {
                holes.push({ x: hx, y: hy, diameter: tools.get(tool)!, plated });
            }
        }
        x = hx;
        y = hy;
    }

    return { holes, warnings: [...warnings] };
};
