/*
 * Minimal GRBL post processor: G21/G90, G0/G1/G2, M3/M5, G4 dwell.
 * No canned cycles (Grbl 1.1 has none) and no tool changes: every
 * operation is a separate program for a single tool.
 */
type P3 = { x: number; y: number; z: number };

const RAPID_FEED = 1500; // mm/min, used only for the time estimate

export class GrblWriter {
    private lines: string[] = [];
    private pos: P3 = { x: NaN, y: NaN, z: NaN };
    private feed = NaN;
    cutLength = 0;
    private minutes = 0;

    constructor(
        private readonly safeZ: number,
        private readonly travelZ: number,
    ) {}

    static fmt(v: number) {
        const s = Number(v.toFixed(4)).toString();
        return s === '-0' ? '0' : s;
    }

    comment(text: string) {
        this.lines.push(`(${text.replace(/[()]/g, '')})`);
    }

    raw(line: string) {
        this.lines.push(line);
    }

    header(title: string, tool: string, rpm: number, dwell: number) {
        this.comment(`gSender PCB: ${title}`);
        this.comment(`Tool: ${tool}`);
        this.raw('G21 G90 G94 G17');
        this.rapidZ(this.safeZ);
        this.raw(`M3 S${Math.round(rpm)}`);
        if (dwell > 0) {
            this.raw(`G4 P${dwell}`);
            this.minutes += dwell / 60;
        }
    }

    footer() {
        this.rapidZ(this.safeZ);
        this.raw('M5');
        this.rapidXY(0, 0);
        this.raw('M2');
    }

    private dist(x: number, y: number, z: number) {
        const dx = Number.isFinite(this.pos.x) ? x - this.pos.x : 0;
        const dy = Number.isFinite(this.pos.y) ? y - this.pos.y : 0;
        const dz = Number.isFinite(this.pos.z) ? z - this.pos.z : 0;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    rapidZ(z: number) {
        if (this.pos.z === z) return;
        this.minutes += this.dist(this.pos.x, this.pos.y, z) / RAPID_FEED;
        this.raw(`G0 Z${GrblWriter.fmt(z)}`);
        this.pos.z = z;
    }

    rapidXY(x: number, y: number) {
        if (this.pos.x === x && this.pos.y === y) return;
        this.minutes += this.dist(x, y, this.pos.z) / RAPID_FEED;
        this.raw(`G0 X${GrblWriter.fmt(x)} Y${GrblWriter.fmt(y)}`);
        this.pos.x = x;
        this.pos.y = y;
    }

    /** Lift to (at least) travel height and move over (x, y). */
    travelTo(x: number, y: number) {
        if (this.pos.x === x && this.pos.y === y) {
            return;
        }
        if (!(this.pos.z >= this.travelZ)) {
            this.rapidZ(this.travelZ);
        }
        this.rapidXY(x, y);
    }

    /** Rapid down to just above the surface, then feed to z at the current XY. */
    plunge(z: number, feed: number, approach = 0.5) {
        if (!(this.pos.z <= approach)) {
            this.rapidZ(Math.max(approach, z));
        }
        this.linear(this.pos.x, this.pos.y, z, feed);
    }

    private feedWord(feed: number) {
        if (feed !== this.feed) {
            this.feed = feed;
            return ` F${Math.round(feed)}`;
        }
        return '';
    }

    linear(x: number, y: number, z: number, feed: number) {
        const words: string[] = ['G1'];
        if (x !== this.pos.x) words.push(`X${GrblWriter.fmt(x)}`);
        if (y !== this.pos.y) words.push(`Y${GrblWriter.fmt(y)}`);
        if (z !== this.pos.z) words.push(`Z${GrblWriter.fmt(z)}`);
        if (words.length === 1) return;
        const d = this.dist(x, y, z);
        this.cutLength += d;
        this.minutes += d / feed;
        this.raw(words.join(' ') + this.feedWord(feed));
        this.pos = { x, y, z };
    }

    /** Clockwise helical arc around (cx, cy) ending at (x, y, z). */
    arcCW(x: number, y: number, z: number, cx: number, cy: number, feed: number, sweep: number) {
        const r = Math.hypot(this.pos.x - cx, this.pos.y - cy);
        const d = Math.hypot(Math.abs(sweep) * r, z - this.pos.z);
        this.cutLength += d;
        this.minutes += d / feed;
        this.raw(
            `G2 X${GrblWriter.fmt(x)} Y${GrblWriter.fmt(y)} Z${GrblWriter.fmt(z)} I${GrblWriter.fmt(cx - this.pos.x)} J${GrblWriter.fmt(cy - this.pos.y)}${this.feedWord(feed)}`,
        );
        this.pos = { x, y, z };
    }

    get estimatedMinutes() {
        return this.minutes;
    }

    toString() {
        return this.lines.join('\n') + '\n';
    }

    get lineCount() {
        return this.lines.length;
    }
}
