import { Chess } from 'chess.js';
import type { Square, PieceSymbol } from 'chess.js';
export const FRONTIER_RANKS = ['1', '2', '3', '4', 'W', 'X', 'Y', 'Z', '5', '6', '7', '8'];
export const isExtendedFen = (fen: string) => fen.split(' ')[0].split('/').length === 12;
export const ranksFor = (fen?: string) => fen && isExtendedFen(fen) ? FRONTIER_RANKS : ['1', '2', '3', '4', '5', '6', '7', '8'];
export const allSquares = (fen: string) => ranksFor(fen).flatMap(r => [...'abcdefgh'].map(f => f + r));
export const xy = (q: string, fen: string): [
    number,
    number
] => [q?.charCodeAt(0) - 97, ranksFor(fen).indexOf(q?.slice(1))];
export const squareAt = (x: number, y: number, fen: string) => x >= 0 && x < 8 && y >= 0 && y < ranksFor(fen).length ? String.fromCharCode(97 + x) + ranksFor(fen)[y] : null;
export const adjacent = (q: string, fen: string, includeCenter = false) => { const [x, y] = xy(q, fen); return [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => dx || dy || includeCenter ? squareAt(x + dx, y + dy, fen) : null)).filter(Boolean) as string[]; };
export function extendFen(fen: string) { const p = fen.split(' '), r = p[0].split('/'); if (r.length !== 8)
    throw Error('Board already expanded'); r.splice(4, 0, '8', '8', '8', '8'); p[0] = r.join('/'); p[3] = '-'; return p.join(' '); }
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
export const DIRECTIONS = { orth: ORTH, diag: DIAG, all: [...ORTH, ...DIAG], knight: KNIGHT };
type P = {
    type: PieceSymbol;
    color: 'w' | 'b';
};
/** Extended FEN retains ordinary square names. Original ranks never change identity. */
export class FrontierBoard {
    cells: Record<string, P> = {};
    active: 'w' | 'b' = 'w';
    rights = '-';
    ep = '-';
    half = 0;
    full = 1;
    stack: string[] = [];
    constructor(fen: string) { this.load(fen); }
    load(fen: string) { const p = fen.split(' '), rows = p[0].split('/'); if (rows.length !== 12)
        throw Error('Expected twelve ranks'); this.cells = {}; rows.forEach((row, i) => { let x = 0; for (const c of row) {
        if (/[1-8]/.test(c))
            x += Number(c);
        else {
            if (!/[pnbrqkPNBRQK]/.test(c) || x > 7)
                throw Error('Invalid extended FEN');
            this.cells[String.fromCharCode(97 + x++) + FRONTIER_RANKS[11 - i]] = { type: c.toLowerCase() as PieceSymbol, color: c === c.toUpperCase() ? 'w' : 'b' };
        }
    } if (x !== 8)
        throw Error('Expected eight files'); }); this.active = p[1] === 'b' ? 'b' : 'w'; this.rights = p[2] || '-'; this.ep = p[3] || '-'; this.half = Number(p[4]) || 0; this.full = Number(p[5]) || 1; return true; }
    fen(_options?: unknown) { return [...FRONTIER_RANKS].reverse().map(r => { let row = '', n = 0; for (const f of 'abcdefgh') {
        const p = this.cells[f + r];
        if (!p)
            n++;
        else {
            if (n) {
                row += n;
                n = 0;
            }
            row += p.color === 'w' ? p.type.toUpperCase() : p.type;
        }
    } if (n)
        row += n; return row; }).join('/') + ` ${this.active} ${this.rights || '-'} ${this.ep} ${this.half} ${this.full}`; }
    get(q: string) { return this.cells[q] ? { ...this.cells[q] } : undefined; }
    put(p: P, q: string) { if (!/^[a-h][1-8WXYZ]$/.test(q) || !/[pnbrqk]/.test(p.type))
        return false; this.cells[q] = { ...p }; return true; }
    remove(q: string) { const p = this.get(q); delete this.cells[q]; return p; }
    board() { return [...FRONTIER_RANKS].reverse().map(r => [...'abcdefgh'].map(f => this.cells[f + r] ? { ...this.cells[f + r], square: f + r } : null)); }
    turn() { return this.active; }
    raw(from: string, type?: PieceSymbol, attacks = false): string[] {
        const p = this.get(from);
        if (!p)
            return [];
        const t = type || p.type, fen = this.fen(), [x, y] = xy(from, fen), out: string[] = [];
        if (t === 'p') {
            const dy = p.color === 'w' ? 1 : -1;
            if (attacks) {
                for (const dx of [-1, 1]) {
                    const q = squareAt(x + dx, y + dy, fen);
                    if (q)
                        out.push(q);
                }
                return out;
            }
            const one = squareAt(x, y + dy, fen);
            if (one && !this.get(one)) {
                out.push(one);
                const two = squareAt(x, y + 2 * dy, fen);
                if (from[1] === (p.color === 'w' ? '2' : '7') && two && !this.get(two))
                    out.push(two);
            }
            for (const dx of [-1, 1]) {
                const q = squareAt(x + dx, y + dy, fen);
                if (q && (this.get(q)?.color !== p.color && this.get(q) || q === this.ep))
                    out.push(q);
            }
            return out;
        }
        const dirs = t === 'n' ? KNIGHT : t === 'k' ? [...ORTH, ...DIAG] : t === 'b' ? DIAG : t === 'r' ? ORTH : [...ORTH, ...DIAG];
        const limit = t === 'n' || t === 'k' ? 1 : 11;
        for (const [dx, dy] of dirs)
            for (let i = 1; i <= limit; i++) {
                const q = squareAt(x + dx * i, y + dy * i, fen);
                if (!q)
                    break;
                const target = this.get(q);
                if (attacks || target?.color !== p.color)
                    out.push(q);
                if (target)
                    break;
            }
        return out;
    }
    attackers(q: string, color: 'w' | 'b') { return Object.keys(this.cells).filter(from => this.cells[from].color === color && this.raw(from, undefined, true).includes(q)); }
    isAttacked(q: string, c: 'w' | 'b') { return !!this.attackers(q, c).length; }
    isCheck() { const k = Object.keys(this.cells).find(q => this.cells[q].type === 'k' && this.cells[q].color === this.active); return !!k && this.isAttacked(k, this.active === 'w' ? 'b' : 'w'); }
    inCheck() { return this.isCheck(); }
    moves(options: {
        square?: string;
        verbose?: boolean;
        legal?: boolean;
    } = {}) {
        const out: any[] = [];
        for (const from of options.square ? [options.square] : Object.keys(this.cells)) {
            const p = this.get(from);
            if (!p || p.color !== this.active)
                continue;
            const targets = this.raw(from);
            if (p.type === 'k' && from === 'e' + (p.color === 'w' ? '1' : '8') && !this.isCheck())
                for (const [letter, to, rook, path] of [[p.color === 'w' ? 'K' : 'k', 'g', 'h', ['f', 'g']], [p.color === 'w' ? 'Q' : 'q', 'c', 'a', ['d', 'c', 'b']]] as const) {
                    const rank = from[1];
                    if (this.rights.includes(letter) && this.get(rook + rank)?.type === 'r' && path.every(f => !this.get(f + rank)) && path.slice(0, 2).every(f => !this.isAttacked(f + rank, p.color === 'w' ? 'b' : 'w')))
                        targets.push(to + rank);
                }
            for (const to of targets) {
                const b = new FrontierBoard(this.fen());
                b.apply(from, to, 'q');
                const k = Object.keys(b.cells).find(q => b.cells[q].type === 'k' && b.cells[q].color === p.color);
                if (options.legal !== false && k && b.isAttacked(k, p.color === 'w' ? 'b' : 'w'))
                    continue;
                const [fx, fy] = xy(from, this.fen()), [tx, ty] = xy(to, this.fen());
                const flags = p.type === 'k' && Math.abs(tx - fx) === 2 ? (tx > fx ? 'k' : 'q') : p.type === 'p' && to === this.ep ? 'e' : this.get(to) ? 'c' : p.type === 'p' && Math.abs(ty - fy) === 2 ? 'b' : 'n';
                const promotion = p.type === 'p' && to[1] === (p.color === 'w' ? '8' : '1') ? 'q' : undefined;
                out.push({ color: p.color, piece: p.type, from, to, flags, captured: this.get(to)?.type, promotion, san: from + to, lan: from + to, before: this.fen(), after: b.fen(), isCapture: () => flags === 'c' || flags === 'e', isEnPassant: () => flags === 'e', isKingsideCastle: () => flags === 'k', isQueensideCastle: () => flags === 'q' });
            }
        }
        return options.verbose ? out : out.map(m => m.san);
    }
    apply(from: string, to: string, promotion = 'q') {
        const p = this.get(from);
        if (!p)
            throw Error('Piece missing');
        const fen = this.fen(), [fx, fy] = xy(from, fen), [tx, ty] = xy(to, fen);
        if (p.type === 'p' && to === this.ep && !this.get(to)) {
            const q = squareAt(tx, ty + (p.color === 'w' ? -1 : 1), fen);
            if (q)
                this.remove(q);
        }
        this.remove(from);
        this.put({ ...p, type: p.type === 'p' && to[1] === (p.color === 'w' ? '8' : '1') ? promotion as PieceSymbol : p.type }, to);
        if (p.type === 'k' && Math.abs(tx - fx) === 2) {
            const rook = (tx > fx ? 'h' : 'a') + from[1], dest = (tx > fx ? 'f' : 'd') + from[1], r = this.remove(rook);
            if (r)
                this.put(r, dest);
        }
        if (p.type === 'k')
            this.rights = this.rights.replace(p.color === 'w' ? /[KQ]/g : /[kq]/g, '');
        for (const [q, right] of [['a1', 'Q'], ['h1', 'K'], ['a8', 'q'], ['h8', 'k']])
            if (from === q || to === q)
                this.rights = this.rights.replace(right, '');
        this.ep = p.type === 'p' && Math.abs(ty - fy) === 2 ? squareAt(fx, (fy + ty) / 2, fen)! : '-';
        this.active = p.color === 'w' ? 'b' : 'w';
        if (p.color === 'b')
            this.full++;
    }
    move(m: {
        from: string;
        to: string;
        promotion?: string;
    }) { const found = (this.moves({ square: m.from, verbose: true }) as any[]).find(x => x.to === m.to); if (!found)
        throw Error('Illegal move'); this.stack.push(this.fen()); this.apply(m.from, m.to, m.promotion); found.after = this.fen(); return found; }
    undo() { const f = this.stack.pop(); if (f)
        this.load(f); return f; }
    isCheckmate() { return this.isCheck() && !this.moves().length; }
    isStalemate() { return !this.isCheck() && !this.moves().length; }
    isInsufficientMaterial() { return Object.values(this.cells).every(p => p.type === 'k'); }
    isThreefoldRepetition() { return false; }
    isDrawByFiftyMoves() { return false; }
    isDraw() { return this.isStalemate() || this.isInsufficientMaterial(); }
    isGameOver() { return this.isCheckmate() || this.isDraw(); }
    squareColor(q: string) { const [x, y] = xy(q, this.fen()); return (x + y) % 2 ? 'light' : 'dark'; }
}
export function boardFor(fen?: string): Chess { return fen && isExtendedFen(fen) ? new FrontierBoard(fen) as unknown as Chess : fen ? new Chess(fen, { skipValidation: true }) : new Chess(); }
