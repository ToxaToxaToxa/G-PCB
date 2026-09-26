/**
 * Evaluates Gerber aperture macro arithmetic: numbers, $n variables,
 * + - x (or X) / and parentheses.
 */
export const evaluateMacroExpression = (
    source: string,
    vars: Record<number, number>,
): number => {
    const s = source.replace(/\s+/g, '');
    let i = 0;

    const peek = () => s[i];
    const expect = (ch: string) => {
        if (s[i] !== ch) {
            throw new Error(`Invalid macro expression "${source}"`);
        }
        i++;
    };

    const parseExpr = (): number => {
        let value = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = s[i++];
            const rhs = parseTerm();
            value = op === '+' ? value + rhs : value - rhs;
        }
        return value;
    };

    const parseTerm = (): number => {
        let value = parseFactor();
        while (peek() === 'x' || peek() === 'X' || peek() === '/') {
            const op = s[i++];
            const rhs = parseFactor();
            value = op === '/' ? value / rhs : value * rhs;
        }
        return value;
    };

    const parseFactor = (): number => {
        const ch = peek();
        if (ch === '+') {
            i++;
            return parseFactor();
        }
        if (ch === '-') {
            i++;
            return -parseFactor();
        }
        if (ch === '(') {
            i++;
            const v = parseExpr();
            expect(')');
            return v;
        }
        if (ch === '$') {
            i++;
            const m = /^\d+/.exec(s.slice(i));
            if (!m) {
                throw new Error(`Invalid macro variable in "${source}"`);
            }
            i += m[0].length;
            return vars[Number(m[0])] ?? 0;
        }
        const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
        if (!m) {
            throw new Error(`Invalid macro expression "${source}"`);
        }
        i += m[0].length;
        return Number(m[0]);
    };

    if (s === '') {
        return 0;
    }
    const value = parseExpr();
    if (i !== s.length) {
        throw new Error(`Invalid macro expression "${source}"`);
    }
    return value;
};
