import type { GameState, PlayerColor, Card, ClientMessage, ChampionPiece, BoardSnapshot } from '../types.ts';
import { boardFor, FrontierBoard, isExtendedFen, extendFen, allSquares, xy, squareAt, adjacent, DIRECTIONS } from './frontierBoard.ts';
import { createCard, drawCard, awardCaptureRefresh, isKingChecked, calculatePiecePoints, getLegalMovesForPiece, getClockBlockReason } from './chessLogic.ts';
import { landGround, relocateDebuffs, captureProtected, groundImmune, groundPiece, removeGroundPiece, groundEvent } from './grounds.ts';
import { placeRevived, isTemporary, kingSafe, validBishopCircle,soulTargets,activeCircle, interruptCircles } from './summoning.ts';
import type { Square, PieceSymbol } from 'chess.js';
export const FRONTIER_ITEMS = ['lens', 'wings', 'star', 'banner', 'sigil', 'eye', 'feather', 'core'] as const;
export type FrontierItem = typeof FRONTIER_ITEMS[number];
export const ITEM_NAMES: Record<FrontierItem, string> = { lens: 'Fateweaver’s Lens', wings: 'Wings of Flight', star: 'Wishing Star', banner: 'Footsoldier’s Banner', sigil: 'Champion’s Sigil', eye: 'Eye of Revelation', feather: 'Feather of the Fallen', core: 'Golem Core' };
export const ITEM_TEXT: Record<FrontierItem, string> = { lens: 'Free action: discard one card and draw its replacement, once per turn.', wings: 'Move action: move a friendly piece 1–2 squares in any direction without capturing. Seven owner-turn cooldown.', star: 'Move action: move an eligible piece as a Wild. Five owner-turn cooldown.', banner: 'Single-use move action: summon a Pawn onto your second rank.', sigil: 'Single-use move action: activate your Champion’s ultimate.', eye: 'Permanently reveals the opponent’s hand. Vision becomes Bind and keeps its charges.', feather: 'Single-use move action: revive your latest eligible loss since obtaining this item onto your first rank.', core: 'Single-use move action: summon a controllable Golem onto your first rank.' };
export interface OwnedItem {
    id: string;
    type: FrontierItem;
    acquiredTurn: number;
    remaining: number;
    usedTurn?: number;
    readyAfter?: number;
    captureBaseline?: number;
}
export interface FrontierState {
    expanded: boolean;
    id: string;
    expandedTurn?: number;
    preparation: Record<PlayerColor, boolean>;
    ready: boolean;
    pois: Record<string, 'bag' | 'key' | 'chest' | 'boss' | 'mimic' | FrontierItem>;
    boss?: {
        square: string;
        health: 1 | 2;
        drop: FrontierItem;
    };
    chestRoll?: FrontierItem | 'mimic';
    inventories: Record<PlayerColor, OwnedItem[]>;
    bags: Record<PlayerColor, boolean>;
    bagDiscardPending?: Partial<Record<PlayerColor,boolean>>;
    keys: Record<PlayerColor, number>;
    ownerTurns: Record<PlayerColor, number>;
    golems: Array<{
        id: string;
        owner: PlayerColor;
        square: string;
    }>;
    bind?: {
        owner: PlayerColor;
        target: PlayerColor;
        cardId: string;
        turn: number;
    };
    events: Array<{
        id: string;
        kind: string;
        detail: string;
        square?: string;
        item?: FrontierItem;
        recipient?: PlayerColor;
        from?: string;
        piece?: {type:string;color:PlayerColor;awakened?:boolean};
    }>;
    clockLocked?: boolean;
    traverseArrival?: {id:string;owner:PlayerColor;square:string};
}
export const initialFrontier = (): FrontierState => ({ expanded: false, id: '', preparation: { w: false, b: false }, ready: false, pois: {}, inventories: { w: [], b: [] }, bags: { w: false, b: false }, keys: { w: 0, b: 0 }, ownerTurns: { w: 0, b: 0 }, golems: [], events: [] });
const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const handLimit = (s: GameState, c: PlayerColor) => s.frontier?.bags[c] ? 7 : 5;
export function frontierNotice(s:GameState,kind:string,detail:string,square?:string,loot?:{item:FrontierItem;recipient?:PlayerColor},label?:string,actor?:PlayerColor){
 const f=s.frontier;if(!f)return;const id=uid('frontier'),event={id,kind,detail,...(square?{square}:{}),...loot};f.events.unshift(event);f.events=f.events.slice(0,24);
 const names:Record<string,string>={expand:'Expand Board',ready:'Mystic Field',bag:'Backpack',key:'Chest Key',chest:'Treasure Chest',mimic:'Mimic Chest',boss_hit:'Arcane Golem',boss_defeat:'Arcane Golem',clock:'Activate the Clock'};
 const cardName=label||(loot?ITEM_NAMES[loot.item]:names[kind])||'Frontier event';
 s.historyLog.unshift({id,turn:actor||loot?.recipient||s.turn,turnNumber:s.turnNumber,actionType:kind==='move'?'move':'powerup',cardName,detail,timestamp:Date.now(),whitePoints:s.whitePoints,blackPoints:s.blackPoints,frontierEvent:{kind,...(square?{square}:{}),...loot}});
}
export function trimBagHands(s:GameState,random=Math.random) {
    for(const c of ['w','b'] as const) {
        if(!s.frontier?.bagDiscardPending?.[c]||s.frontier.bags[c]||s.jokerLocked[c])continue;
        while(s.hands[c].length>5) s.discard.push(s.hands[c].splice(Math.floor(random()*s.hands[c].length),1)[0]);
        delete s.frontier.bagDiscardPending[c];
    }
}
export function canExpand(s: GameState, c: PlayerColor, test = false) { return !!s.frontier && !s.frontier.expanded && s.status === 'playing' && s.turn === c && !s.pendingPortal && !s.pendingSummon && !s.pendingSwapDiscard && (test || (c === 'w' ? s.whitePoints : s.blackPoints) <= 25); }
export function expandFrontier(s: GameState, random = Math.random) { const f = s.frontier; if (!f || f.expanded)
    return false; s.fen = extendFen(s.fen); f.expanded = true; f.id = uid('expansion'); f.expandedTurn = s.turnNumber; const pool = 'WXYZ'.split('').flatMap(r => [...'abcdefgh'].map(x => x + r)); for (const kind of ['bag', 'key', 'chest', 'boss'] as const) {
    const q = pool.splice(Math.floor(random() * pool.length), 1)[0];
    f.pois[q] = kind;
    if (kind === 'boss')
        f.boss = { square: q, health: 2, drop: (['eye', 'feather', 'core'] as const)[Math.floor(random() * 3)] };
} const chest = ['lens', 'wings', 'star', 'banner', ...(s.expansions?.championsOfTheMonolith !== false ? ['sigil' as const] : []), 'mimic'] as const; f.chestRoll = chest[Math.floor(random() * chest.length)]; s.deck.push(createCard('traverse', Date.now()), createCard('traverse', Date.now() + 1)); for (let i = s.deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]];
} frontierNotice(s, 'expand', 'The Mystic Field opened. Complete one preparation turn each before discoveries activate.'); return true; }
export function checkExpansion(s: GameState) { if (!s.frontier?.expanded && s.status === 'playing' && ((s.whitePoints <= 25 && s.blackPoints <= 25) || s.turnNumber > 50))
    expandFrontier(s); }
export function finishFrontierTurn(s: GameState, c: PlayerColor) { const f = s.frontier; if (!f)
    return; if(f.traverseArrival&&f.traverseArrival.owner!==c)delete f.traverseArrival; trimBagHands(s); f.ownerTurns[c]++; if (f.expanded && !f.ready && s.turnNumber >= (f.expandedTurn || 0)) {
    f.preparation[c] = true;
    if (f.preparation.w && f.preparation.b) {
        f.ready = true;
        frontierNotice(s, 'ready', 'The Mystic Field is active. Discoveries can now be collected.');
        for (const q of Object.keys(f.pois))
            if (['bag', 'key', 'chest'].includes(f.pois[q]) && occupant(s, q))
                collectFrontier(s, q);
    }
} if (f.bind?.target === c)
    delete f.bind; checkExpansion(s); }
export function occupant(s: GameState, q: string): {
    type: string;
    color: PlayerColor;
} | undefined { const golem = s.frontier?.golems.find(g => g.square === q); if (golem)
    return { type: 'golem', color: golem.owner }; const champ = Object.values(s.champions).find(c => c?.square === q); return champ ? { type: champ.type, color: champ.color } : boardFor(s.fen).get(q as Square); }
export function poiBlocks(s: GameState, q: string) { return !!s.frontier && ['boss', 'mimic'].includes(s.frontier.pois[q]); }
export function emptyFrontierSquare(s: GameState, q: string) { return allSquares(s.fen).includes(q) && !occupant(s, q) && !poiBlocks(s, q) && q !== s.monolithSquare && !s.restrictedSquares.includes(q) && !activeCircle(s, q); }
export function addItem(s: GameState, c: PlayerColor, type: FrontierItem) { const f = s.frontier!; const permanent = ['lens', 'wings', 'star', 'eye'].includes(type); if (permanent && f.inventories[c].some(i => i.type === type)) {
    frontierNotice(s, 'loot', `${c==='w'?'White':'Black'} found ${ITEM_NAMES[type]}, but already owns it.`,undefined,{item:type,recipient:c});
    return;
} f.inventories[c].push({ id: uid('item'), type, acquiredTurn: s.turnNumber, remaining: permanent ? -1 : 1, captureBaseline: s.captures?.[c === 'w' ? 'b' : 'w'].length || 0 }); if (type === 'eye')
    frontierNotice(s, 'eye', `${c==='w'?'White':'Black'} obtained Eye of Revelation. Vision is now Bind; its charges are retained.`,undefined,{item:type,recipient:c});
else
    frontierNotice(s, 'loot', `${c === 'w' ? 'White' : 'Black'} obtained ${ITEM_NAMES[type]}.`,undefined,{item:type,recipient:c}); }
export function featherReviveChoice(s:GameState,c:PlayerColor){const feather=s.frontier?.inventories[c].find(i=>i.type==='feather'&&i.remaining!==0);if(!feather)return;const losses=s.captures?.[c==='w'?'b':'w']||[];for(let index=losses.length-1;index>=0;index--){const piece=losses[index];if(piece.color===c&&piece.type!=='k'&&(!['berserker','musketeer','summoner','ninja'].includes(piece.type)||!s.champions[c])&&(piece.capturedTurn??-1)>=feather.acquiredTurn)return {index,piece};}}
export function wingsTargets(s:GameState,c:PlayerColor,from:string){if(occupant(s,from)?.color!==c||blockedActor(s,from))return [];const [x,y]=xy(from,s.fen);return allSquares(s.fen).filter(to=>{const [tx,ty]=xy(to,s.fen),n=Math.max(Math.abs(tx-x),Math.abs(ty-y));if(n<1||n>2||!(x===tx||y===ty||Math.abs(tx-x)===Math.abs(ty-y))||!emptyFrontierSquare(s,to))return false;const d=structuredClone(s);try{executeLandingMove(d,from,to);return frontierKingSafe(d,c);}catch{return false;}});}
export function collectFrontier(s: GameState, q: string) { const f = s.frontier, p = occupant(s, q); if (!f?.ready || !p)
    return; const kind = f.pois[q]; if (kind === 'bag') {
    f.bags[p.color] = true;
    delete f.pois[q];
    frontierNotice(s, 'bag', `${p.color === 'w' ? 'White' : 'Black'} collected the Bag: hand capacity is now seven.`);
}
else if (kind === 'key') {
    f.keys[p.color]++;
    delete f.pois[q];
    frontierNotice(s, 'key', `${p.color === 'w' ? 'White' : 'Black'} collected the Chest Key.`);
}
else if (kind === 'chest') {
    if (!f.keys[p.color]) {
        const id=uid('chest_locked');
        f.events.unshift({id,kind:'chest_locked',detail:'A Key is required to open this Chest.',square:q,recipient:p.color});
        f.events=f.events.slice(0,24);
        return;
    }
    f.keys[p.color]--;
    delete f.pois[q];
    frontierNotice(s,'chest','The Key opened the Chest.',q);
    if(f.chestRoll==='mimic') {
        if(p.type==='k') { awardCaptureRefresh(s,p.color,3); frontierNotice(s,'mimic','The King defeated the Mimic.',q); }
        else { removeEntity(s,q,p.color,false); f.pois[q]='mimic'; frontierNotice(s,'mimic','The Mimic devoured the opener. Capture it without a Key for three points.',q); }
    } else if(f.chestRoll) addItem(s,p.color,f.chestRoll);
}
else if (FRONTIER_ITEMS.includes(kind as FrontierItem)) {
    delete f.pois[q];
    addItem(s, p.color, kind as FrontierItem);
} }
export function frontierBoardFor(s: GameState, c: PlayerColor) { const b = boardFor(s.fen); if (s.monolithSquare && !b.get(s.monolithSquare as Square))
    b.put({ type: 'p', color: c }, s.monolithSquare as Square); for (const ch of Object.values(s.champions))
    if (ch && !b.get(ch.square as Square))
        b.put({ type: 'p', color: ch.color }, ch.square as Square); for (const g of s.frontier?.golems || [])
    b.put({ type: 'p', color: g.owner }, g.square as Square); for (const [q, k] of Object.entries(s.frontier?.pois || {}))
    if (['boss', 'mimic'].includes(k))
        b.put({ type: 'p', color: c === 'w' ? 'b' : 'w' }, q as Square); return b; }
export function frontierKingSafe(s: GameState, c: PlayerColor) {
    const b = boardFor(s.fen);
    const king = b.board().flat().find(p => p?.type === 'k' && p.color === c)?.square;
    if (!king)
        return false;
    if (s.beaconEffect?.active && s.beaconEffect.protectedSquares.includes(king))
        return true;
    const threats = boardFor(s.fen);
    if (s.monolithSquare)
        threats.put({ type: 'p', color: c }, s.monolithSquare as Square);
    for (const ch of Object.values(s.champions))
        if (ch)
            threats.put({ type: 'p', color: c }, ch.square as Square);
    for (const g of s.frontier?.golems || [])
        threats.put({ type: 'p', color: c }, g.square as Square);
    for (const [q, k] of Object.entries(s.frontier?.pois || {}))
        if (['boss', 'mimic'].includes(k))
            threats.put({ type: 'p', color: c }, q as Square);
    const enemy = c === 'w' ? 'b' : 'w';
    {
        const attackers = threats.attackers(king as Square, enemy).filter(q => !s.grounds?.disarm.some(d => d.square === q) && !(s.staticEffect?.active && s.staticEffect.stunnedSquares.includes(q)) && !['boost', 'gravity'].includes(s.grounds?.tiles[q] || ''));
        if (attackers.length)
            return false;
    }
    for (const q of s.superPawns || []) {
        const pawn = b.get(q as Square);
        if (pawn?.color !== enemy || blockedActor(s, q) || s.grounds?.disarm.some(d => d.square === q) || ['boost', 'gravity'].includes(s.grounds?.tiles[q] || ''))
            continue;
        const [x, y] = xy(q, s.fen);
        if (squareAt(x, y + (enemy === 'w' ? 1 : -1), s.fen) === king)
            return false;
    }
    const ch = s.champions[enemy];
    if (ch && ch.type !== 'ninja' && adjacent(ch.square, s.fen).includes(king) && !(s.staticEffect?.active && s.staticEffect.stunnedSquares.includes(ch.square)) && !s.grounds?.disarm.some(d => d.square === ch.square))
        return false;
    return !(s.frontier?.golems.some(g => g.owner === enemy && !blockedActor(s, g.square) && !s.grounds?.disarm.some(d => d.square === g.square) && adjacent(g.square, s.fen).includes(king)));
}
export function blockedActor(s: GameState, q: string) { return s.restrictedSquares.includes(q) || !!(s.staticEffect?.active && s.staticEffect.stunnedSquares.includes(q)) || q === s.monolithSquare; }
export function frontierMoves(s: GameState, from: string, as?: PieceSymbol, noncapture = false): string[] {
    const p = occupant(s, from);
    if (!p || blockedActor(s, from))
        return [];
    const b = frontierBoardFor(s, p.color) as unknown as FrontierBoard;
    const golem = p.type === 'golem';
    if (!b.get(from))
        b.put({ type: as || 'k', color: p.color }, from);
    let type = as || (golem ? 'k' : p.type as PieceSymbol);
    const tile = s.grounds?.tiles[from];
    let targets: string[];
    if (tile === 'boost' || tile === 'gravity') {
        targets = [];
        const [x, y] = xy(from, s.fen);
        for (const [dx, dy] of DIRECTIONS.all)
            for (let n = 1; n <= (tile === 'gravity' ? 1 : 11); n++) {
                const q = squareAt(x + dx * n, y + dy * n, s.fen);
                if (!q || occupant(s, q) || poiBlocks(s, q) || q === s.monolithSquare)
                    break;
                if (!s.restrictedSquares.includes(q))
                    targets.push(q);
            }
    }
    else if (!as && p.type === 'p' && s.superPawns?.includes(from)) {
        targets = b.raw(from, 'p');
        const [x, y] = xy(from, s.fen);
        const q = squareAt(x, y + (p.color === 'w' ? 1 : -1), s.fen);
        if (q && (occupant(s, q)?.color !== p.color) && (occupant(s, q) || poiBlocks(s, q)))
            targets.push(q);
    }
    else {
        if (['berserker', 'musketeer', 'summoner', 'ninja'].includes(p.type)) {
            type = p.type === 'ninja' ? 'q' : 'k';
            noncapture ||= p.type === 'ninja';
        }
        b.put({ type, color: p.color }, from);
        targets = b.raw(from, type);
        if (type === 'k' && !as && p.type === 'k')
            targets = (b.moves({ square: from, verbose: true, legal: false }) as any[]).map(m => m.to);
    }
    return targets.filter(q => { if (s.restrictedSquares.includes(q) || q === s.monolithSquare)
        return false; const target = occupant(s, q); if (p.type === 'k' && from[0] === 'e' && ['c', 'g'].includes(q[0]) && from[1] === q[1] && s.restrictedSquares.includes((q[0] === 'g' ? 'f' : 'd') + q[1]))
        return false; if (type === 'p' && boardFor(s.fen).fen().split(' ')[3] === q && from[0] !== q[0]) {
        const [tx, ty] = xy(q, s.fen);
        const victim = squareAt(tx, ty + (p.color === 'w' ? -1 : 1), s.fen);
        if (victim && (captureProtected(s, victim) || s.grounds?.disarm.some(d => d.square === from)))
            return false;
    } if (target?.color === p.color)
        return false; const poi = s.frontier?.ready ? s.frontier.pois[q] : undefined; if (!s.frontier?.ready && ['boss'].includes(s.frontier?.pois[q] || ''))
        return false; if ((target || poiBlocks(s, q)) && (noncapture || s.grounds?.disarm.some(d => d.square === from)))
        return false; if (target && captureProtected(s, q))
        return false; if ((target || poiBlocks(s, q)) && s.awakenedRooks?.some(r => r.square === from && r.hasCaptured && target?.type !== 'k'))
        return false; if (poi === 'boss' && p.type === 'k' && s.frontier?.boss?.health === 2)
        return false; const d = structuredClone(s); try {
        executeLandingMove(d, from, q);
        return frontierKingSafe(d, p.color);
    }
    catch {
        return false;
    } });
}
export function moveEntity(s: GameState, from: string, to: string, native = false) { const f = s.frontier, p = occupant(s, from); if (!p)
    throw Error('Piece missing'); const g = f?.golems.find(g => g.square === from), ch = s.champions[p.color]; const b = boardFor(s.fen); b.remove(to as Square); if (s.champions[p.color === 'w' ? 'b' : 'w']?.square === to)
    s.champions[p.color === 'w' ? 'b' : 'w'] = null; if (f)
    f.golems = f.golems.filter(x => x.square !== to); if (g)
    g.square = to;
else if (ch?.square === from)
    ch.square = to;
else {
    const piece = b.get(from as Square);
    if (native && b instanceof FrontierBoard)
        b.apply(from, to);
    else {
        b.remove(from as Square);
        if (piece)
            b.put(piece, to as Square);
        const parts = b.fen().split(' ');
        parts[3] = '-';
        if (piece?.type === 'k')
            parts[2] = parts[2].replace(piece.color === 'w' ? /[KQ]/g : /[kq]/g, '') || '-';
        for (const [q, right] of [['a1', 'Q'], ['h1', 'K'], ['a8', 'q'], ['h8', 'k']])
            if (from === q || to === q)
                parts[2] = parts[2].replace(right, '') || '-';
        b.load(parts.join(' '));
    }
} s.fen = b.fen(); if (s.pieceIds) {
    const id = s.pieceIds[from];
    delete s.pieceIds[from];
    if (id)
        s.pieceIds[to] = id;
    else
        delete s.pieceIds[to];
} for (const key of ['superPawns', 'superKnights', 'awakenedPieces'] as const)
    s[key] = s[key]?.filter(q => q !== to).map(q => q === from ? to : q); s.awakenedRooks = s.awakenedRooks?.filter(r => r.square !== to).map(r => r.square === from ? { ...r, square: to } : r); relocateDebuffs(s, from, to); if (s.beaconEffect?.active)
    s.beaconEffect.protectedSquares = adjacent(s.monolithSquare || '', s.fen, true); }
function removeEntity(s: GameState, q: string, c: PlayerColor, credit = true) { const p = occupant(s, q); if (!p)
    return; const temporary = isTemporary(s, q); const recorded=groundPiece(s,q)||p; const b = boardFor(s.fen); b.remove(q as Square); s.fen = b.fen(); if (s.champions[p.color]?.square === q)
    s.champions[p.color] = null; if (s.frontier)
    s.frontier.golems = s.frontier.golems.filter(g => g.square !== q); if (!temporary) {
    s.captures ||= { w: [], b: [] };
    s.captures[p.color === 'w' ? 'b' : 'w'].push({ ...recorded, capturedTurn: s.turnNumber } as any);
    if (credit && p.color !== c)
        awardCaptureRefresh(s, c, p.type === 'golem' ? 10 : ({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as any)[p.type] ?? 5);
} if (s.pieceIds)
    delete s.pieceIds[q]; for (const key of ['superPawns', 'superKnights', 'awakenedPieces'] as const)
    s[key] = s[key]?.filter(x => x !== q); s.awakenedRooks = s.awakenedRooks?.filter(x => x.square !== q); if (s.grounds)
    for (const key of ['poison', 'disarm'] as const)
        s.grounds[key] = s.grounds[key].filter(x => x.square !== q); }
export function frontierLanding(s: GameState, q: string) { interruptCircles(s, [q]); landGround(s, q); if (occupant(s, q))
    collectFrontier(s, q); }
export function executeLandingMove(s: GameState, from: string, to: string, attackType?: PieceSymbol) {
    const f = s.frontier!, p = occupant(s, from)!;
    const standard = boardFor(s.fen).get(from as Square);
    const captured = !!occupant(s, to) || poiBlocks(s, to);
    const native = !!standard && !['boost', 'gravity'].includes(s.grounds?.tiles[from] || '') && ((frontierBoardFor(s, p.color) as unknown as FrontierBoard).raw(from).includes(to) || standard.type === 'k' && from[0] === 'e' && ['c', 'g'].includes(to[0]) && from[1] === to[1]);
    if (p.type === 'k' && f.ready && f.pois[to] === 'boss' && f.boss?.health === 2)
        throw Error('Kings cannot attack the Boss at full health.');
    const kind = f.ready ? f.pois[to] : undefined;
    if (kind === 'boss') {
        const boss = f.boss!;
        if (boss.health === 2) {
            boss.health = 1;
            if (groundImmune(s, from)) {
                const [x, y] = xy(from, s.fen), [tx, ty] = xy(to, s.fen);
                const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
                let knock = squareAt(tx - dx, ty - dy, s.fen);
                const knight = (attackType || boardFor(s.fen).get(from as Square)?.type) === 'n';
                if (knight) {
                    const options = adjacent(to, s.fen).filter(q => q === from || emptyFrontierSquare(s, q)).filter(q => { const draft=structuredClone(s); if(q!==from)moveEntity(draft,from,q);frontierLanding(draft,q);return frontierKingSafe(draft,p.color); });
                    knock = options[Math.floor(Math.random() * options.length)] || null;
                }
                if (!knock || knock !== from && !emptyFrontierSquare(s, knock))
                    throw Error('No legal Boss knockback square.');
                if (knock !== from)
                    moveEntity(s, from, knock);
                frontierLanding(s, knock);
            }
            else
                removeEntity(s, from, p.color, false);
            frontierNotice(s, 'boss_hit', 'The Boss is weakened: one capture remains.');
            return;
        }
        delete f.pois[to];
        delete f.boss;
        moveEntity(s, from, to);
        frontierLanding(s, to);
        if (occupant(s, to))
            addItem(s, p.color, boss.drop);
        else {
            f.pois[to] = boss.drop;frontierNotice(s,'drop',`${ITEM_NAMES[boss.drop]} dropped at ${to}.`,to,{item:boss.drop});}
        frontierNotice(s, 'boss_defeat', 'The Arcane Golem was defeated. No capture points are awarded.');
        return;
    }
    if (kind === 'mimic') {
        delete f.pois[to];
        awardCaptureRefresh(s, p.color, 3);
    }
    else if (occupant(s, to))
        removeEntity(s, to, p.color);
    else if (standard?.type === 'p' && boardFor(s.fen).fen().split(' ')[3] === to && from[0] !== to[0]) {
        const [tx, ty] = xy(to, s.fen);
        const victim = squareAt(tx, ty + (p.color === 'w' ? -1 : 1), s.fen);
        if (victim)
            removeEntity(s, victim, p.color);
    }
    moveEntity(s, from, to, native);
    if (standard?.type === 'k' && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2) {
        const rookFrom = (to[0] === 'g' ? 'h' : 'a') + from[1], rookTo = (to[0] === 'g' ? 'f' : 'd') + from[1];
        if (s.pieceIds?.[rookFrom]) {
            s.pieceIds[rookTo] = s.pieceIds[rookFrom];
            delete s.pieceIds[rookFrom];
        }
        frontierLanding(s, rookTo);
    }
    if (s.awakenedRooks?.some(r => r.square === to) && captured)
        s.awakenedRooks = s.awakenedRooks.map(r => r.square === to ? { ...r, hasCaptured: true } : r);
    frontierLanding(s, to);
}
export interface FrontierHooks {
    consume: (s: GameState, c: PlayerColor, card: Card | null, exhaust?: boolean) => void;
    finish: (s: GameState, c: PlayerColor, next: PlayerColor) => void;
    error: (message: string) => void;
    evaluate?: (draft: GameState) => void;
    ultimate?: (draft: GameState, msg: any, c: PlayerColor) => void;
}
/** Return true when handled. Commit only once all primary and secondary effects are validated. */
export function executeFrontier(s: GameState, msg: ClientMessage, c: PlayerColor, h: FrontierHooks): boolean {
    const m = msg as any;
    const f = s.frontier;
    const ownType = ['expand_frontier', 'frontier_item', 'frontier_golem_move', 'frontier_self_destruct', 'frontier_bind'].includes(m.type);
    if (!f)
        return ownType ? (h.error('Arcane Frontier is disabled.'), true) : false;
    if (m.type === 'expand_frontier') {
        if (!canExpand(s, c, m.test === true)) {
            h.error('Expansion requires your army to have 25 or fewer points.');
            return true;
        }
        const chestChoices=['lens','wings','star','banner','mimic',...(s.expansions?.championsOfTheMonolith!==false?['sigil']:[])];
        if((m.chestDrop||m.bossDrop)&&m.test!==true || m.chestDrop&&!chestChoices.includes(m.chestDrop) || m.bossDrop&&!['eye','feather','core'].includes(m.bossDrop)){h.error('Invalid test reward selection.');return true;}
        const d = structuredClone(s);
        expandFrontier(d);
        if(m.test===true){if(m.chestDrop)d.frontier!.chestRoll=m.chestDrop;if(m.bossDrop&&d.frontier!.boss)d.frontier!.boss.drop=m.bossDrop;}
        Object.assign(s, d);
        return true;
    }
    const moveTypes = ['play_card_move', 'play_king_move', 'use_powerup_wild_move', 'play_champion_move', 'play_awakening_as_wild', 'play_awakening_knight', 'play_champion_ultimate', 'play_push', 'play_awakening_rook', 'play_awakening_king', 'play_awakening_bishop', 'play_awakening_queen', 'portal_move'];
    const traverse = s.hands[c].find(x => x.id === m.cardId)?.type === 'traverse';
    const intercepted = ownType || traverse || (f.expanded && moveTypes.includes(m.type));
    if (!intercepted)
        return false;
    if (s.status !== 'playing' || s.turn !== c || s.pendingPortal || s.pendingSummon || s.pendingSwapDiscard) {
        h.error('Complete the pending action on your turn first.');
        return true;
    }
    const d = structuredClone(s);
    let card: Card | null = null, exhaust = false, free = false;
    let detail = '';
    try {
        const fd = d.frontier!;
        const next = c === 'w' ? 'b' : 'w';
        if (m.type === 'frontier_bind') {
            if (!fd.inventories[c].some(i => i.type === 'eye') || d.powerUps[c].vision <= 0)
                throw Error('Bind is unavailable.');
            const target = d.hands[next].find(x => x.id === m.targetCardId);
            if (!target || ['pawn', 'knight', 'bishop', 'rook', 'queen', 'wild'].includes(target.type))
                throw Error('Choose one non-standard card.');
            d.powerUps[c].vision--;
            fd.bind = { owner: c, target: next, cardId: target.id, turn: d.turnNumber + 1 };
            detail = `Bind blocks ${target.name} on the opponent’s next turn.`;
            free = true;
        }
        else if(m.type==='portal_move'){
            const g=d.grounds,from=m.from,portals=Object.keys(g?.tiles||{}).filter(q=>g!.tiles[q]==='portal'),to=portals.find(q=>q!==from),p=occupant(d,from);
            if(!g||portals.length!==2||!to||!portals.includes(from)||p?.color!==c||blockedActor(d,from)||g.portalUsed[c]===g.completedTurns+1||d.restrictedSquares.includes(to)||to===d.monolithSquare||poiBlocks(d,to))throw Error('Portal travel is unavailable.');
            const target=occupant(d,to);
            if(target?.color===c){if(blockedActor(d,to))throw Error('The other piece cannot move.');const b=boardFor(d.fen),a=b.remove(from as Square),t=b.remove(to as Square);if(a)b.put(a,to as Square);if(t)b.put(t,from as Square);d.fen=b.fen();for(const ch of Object.values(d.champions))if(ch)ch.square=ch.square===from?to:ch.square===to?from:ch.square;for(const gl of fd.golems)gl.square=gl.square===from?to:gl.square===to?from:gl.square;for(const key of ['superPawns','superKnights','awakenedPieces']as const)d[key]=d[key]?.map(q=>q===from?to:q===to?from:q);d.awakenedRooks=d.awakenedRooks?.map(r=>({...r,square:r.square===from?to:r.square===to?from:r.square}));if(d.pieceIds){const a=d.pieceIds[from],b=d.pieceIds[to];delete d.pieceIds[from];delete d.pieceIds[to];if(a)d.pieceIds[to]=a;if(b)d.pieceIds[from]=b;}for(const list of [g.poison,g.disarm])for(const debuff of list)debuff.square=debuff.square===from?to:debuff.square===to?from:debuff.square;frontierLanding(d,from);}
            else{if(target&&(p.type==='golem'||captureProtected(d,to)||g.disarm.some(x=>x.square===from)||d.awakenedRooks?.some(r=>r.square===from&&r.hasCaptured&&target.type!=='k')))throw Error('That Portal capture is unavailable.');if(target)removeEntity(d,to,c);moveEntity(d,from,to);}
            frontierLanding(d,to);if(!frontierKingSafe(d,c))throw Error('Portal travel leaves your King unsafe.');g.portalUsed[c]=g.completedTurns+1;if(p.type==='golem'||target?.type==='golem')fd.clockLocked=true;free=true;d.lastMoveDetails={player:c,actionType:'powerup',from,to};detail=`Portal: ${from} → ${to}.`;
        }
        else if (['play_awakening_rook', 'play_awakening_king', 'play_awakening_bishop', 'play_awakening_queen'].includes(m.type)) {
            card = d.hands[c].find(x => x.id === m.cardId && x.type === m.type.replace('play_', '')) || null;
            const from = m.from, to = m.to, p = occupant(d, from);
            const matching: Record<string, string> = { play_awakening_rook: 'r', play_awakening_king: 'k', play_awakening_bishop: 'b', play_awakening_queen: 'q' };
            if (!card || !p || p.color !== c || p.type !== matching[m.type] || blockedActor(d, from))
                throw Error('Choose the matching Awakening card and piece.');
            if (m.type === 'play_awakening_king' && frontierKingSafe(d, c))
                throw Error('Awakening: King requires your King to be in check.');
            if (!frontierMoves(d, from, m.type === 'play_awakening_king' ? 'q' : undefined).includes(to))
                throw Error('Invalid Awakening destination.');
            const victim = groundPiece(d, to), temporary = isTemporary(d, to), pieceId = d.pieceIds?.[from] || uid('piece');
            executeLandingMove(d, from, to);
            const survives = occupant(d, to)?.color === c;

                if (m.type === 'play_awakening_bishop') {
                    if(!validBishopCircle(d,m.circleSquare||m.reviveSquare))throw Error('Choose an empty, unrestricted circle square on rank 4 or 5.');
                    d.summoningCircles ||= [];
                    d.summoningCircles.push({ id: uid('circle'), owner: c, bishopId: pieceId, bishopSquare:to, square: m.circleSquare||m.reviveSquare, remaining: 3, createdTurn: d.turnNumber });
                }
            if (survives) {
                d.pieceIds ||= {};
                d.pieceIds[to] = pieceId;
                d.awakenedPieces ||= [];
                if (!d.awakenedPieces.includes(to))
                    d.awakenedPieces.push(to);
                d.awakenedPieceSquare = to;
                d.awakenedByPlayer = c;
                d.awakenedOnTurnNumber = d.turnNumber;
                if (m.type === 'play_awakening_rook') {
                    d.awakenedRooks ||= [];
                    d.awakenedRooks = d.awakenedRooks.filter(r => r.square !== to);
                    d.awakenedRooks.push({ square: to, color: c, turnsRemaining: 5, hasCaptured: !!victim });
                }
                if (m.type === 'play_awakening_queen' && victim && victim.type !== 'k' && victim.type !== 'golem' && !temporary && !['berserker', 'musketeer', 'summoner', 'ninja'].includes(victim.type)) {
                    d.hands[c].push({ id: uid('soul_card'), type: 'soul_release', name: 'Soul Release', description: 'Summon the captured piece onto an empty unrestricted square within the 5×5 area of its original Queen. Lasts five subsequent owner turns. No army or capture value.', soul: { queenId: pieceId, piece: victim } });
                }
            }
            d.lastMovedPiece[c] = p.type as any;
            d.lastMovedSquare[c] = to;
            d.lastMoveDetails = { player: c, actionType: 'awakening', from, to, awakeningType: card.type };
            detail = `${card.name}: ${from} → ${to}.`;
        }
        else if (m.type === 'play_champion_ultimate') {
            card = d.hands[c].find(x => x.id === m.cardId && x.type === 'champion') || null;
            if (!card)
                throw Error('Champion card unavailable.');
            frontierUltimate(d, m, c);
            detail = 'Champion ultimate activated.';
        }
        else if (m.type === 'frontier_item') {
            const item = fd.inventories[c].find(i => i.type === m.item && (i.remaining !== 0));
            if (!item)
                throw Error('Item unavailable.');
            if ((item.readyAfter || 0) > fd.ownerTurns[c] || item.usedTurn === d.turnNumber)
                throw Error('Item is on cooldown.');
            const from = m.from, to = m.to || m.targetSquare;
            if (item.type === 'lens') {
                if (d.jokerLocked[c])
                    throw Error('Finish Joker Wild Surge before drawing.');
                const idx = d.hands[c].findIndex(x => x.id === m.cardId);
                if (idx < 0)
                    throw Error('Choose a hand card.');
                d.discard.push(d.hands[c].splice(idx, 1)[0]);
                const result = drawCard(d);
                if (!result.drawnCard)
                    throw Error('No replacement card is available.');
                d.deck = result.newDeck;
                d.discard = result.newDiscard;
                if (result.reshuffled)
                    d.powerUps = result.powerUps;
                d.hands[c].push(result.drawnCard);
                free = true;
            }
            else if (item.type === 'wings' || item.type === 'star') {
                if (!from || !to || occupant(d, from)?.color !== c || blockedActor(d, from))
                    throw Error('Choose a movable friendly piece.');
                if (item.type === 'wings') {
                    const [x, y] = xy(from, d.fen), [tx, ty] = xy(to, d.fen);
                    const distance = Math.max(Math.abs(tx - x), Math.abs(ty - y));
                    if (!emptyFrontierSquare(d, to) || distance < 1 || distance > 2 || !(x === tx || y === ty || Math.abs(tx - x) === Math.abs(ty - y)))
                        throw Error('Wings moves one or two squares in a straight direction without capture.');
                    moveEntity(d, from, to);
                    frontierLanding(d, to);
                    item.readyAfter = fd.ownerTurns[c] + 8;
                }
                else {
                    if (occupant(d, from)?.type === 'golem')
                        throw Error('Use a standard piece card for the Golem.');
                    if (!frontierMoves(d, from).includes(to))
                        throw Error('Invalid Wishing Star move.');
                    executeLandingMove(d, from, to);
                    item.readyAfter = fd.ownerTurns[c] + 6;
                }
                d.lastMovedPiece[c] = null;
            }
            else if (['banner', 'core', 'feather'].includes(item.type)) {
                const rank = item.type === 'banner' ? (c === 'w' ? '2' : '7') : (c === 'w' ? '1' : '8');
                if (!to || to.slice(1) !== rank || !emptyFrontierSquare(d, to))
                    throw Error(`Choose an empty, unrestricted square on rank ${rank}.`);
                if (item.type === 'core') {
                    const id = uid('golem');
                    fd.golems.push({ id, owner: c, square: to });
                    d.pieceIds ||= {};
                    d.pieceIds[to] = id;
                    fd.clockLocked = true;
                }
                else if (item.type === 'banner') {
                    const b = boardFor(d.fen);
                    b.put({ type: 'p', color: c }, to as Square);
                    d.fen = b.fen();
                    d.pieceIds ||= {};
                    d.pieceIds[to] = uid('pawn');
                }
                else {
                    const losses = d.captures?.[next] || [];
                    const choice=featherReviveChoice(d,c);
                    if(!choice)throw Error('No eligible loss since acquiring the Feather.');
                    if(m.captureIndex!==undefined&&m.captureIndex!==choice.index)throw Error('The eligible revival changed. Choose Feather again.');
                    const idx=choice.index;
                    const revived = losses.splice(idx, 1)[0];
                    placeRevived(d, to, revived, c);
                    if (revived.type === 'golem')
                        fd.clockLocked = true;
                }
                frontierLanding(d, to);
            }
            else if (item.type === 'sigil') {
                if (!d.champions[c] || d.expansions?.championsOfTheMonolith === false || blockedActor(d, d.champions[c]!.square) || d.grounds?.disarm.some(x => x.square === d.champions[c]!.square))
                    throw Error('An eligible active Champion is required.');
                if (!h.ultimate)
                    throw Error('Choose ultimate targets.');
                h.ultimate(d, { ...m, type: 'frontier_sigil' }, c);
                fd.clockLocked = true;
            }
            else
                throw Error('This item works passively.');
            item.usedTurn = d.turnNumber;
            if (item.remaining > 0)
                item.remaining--;
            detail = `${c === 'w' ? 'White' : 'Black'} used ${ITEM_NAMES[item.type]}.`;
        }
        else if (m.type === 'frontier_self_destruct') {
            const invalid=golemSelfDestructError(d,c,m.from);if(invalid)throw Error(invalid);
            const g = fd.golems.find(g => g.square === m.from && g.owner === c);
            if (!g || blockedActor(d, g.square) || d.grounds?.disarm.some(x => x.square === g.square))
                throw Error('Golem cannot self-destruct now.');
            for (const q of adjacent(g.square, d.fen))
                if (occupant(d, q) && !captureProtected(d, q))
                    removeEntity(d, q, c);
            removeEntity(d, g.square, c, false);
            fd.clockLocked = true;
            detail = 'Golem self-destructed.';
        }
        else {
            const from = m.from, to = m.to, p = occupant(d, from);
            if (!p || p.color !== c || blockedActor(d, from) || !allSquares(d.fen).includes(to))
                throw Error('Choose a legal friendly piece and destination.');
            card = m.cardId ? d.hands[c].find(x => x.id === m.cardId) || null : null;
            if (fd.bind?.target === c && fd.bind.cardId === card?.id)
                throw Error('This exact card is bound for this turn.');
            const golem = p.type === 'golem';
            if (golem) {
                if (m.type !== 'frontier_golem_move' || !card)
                    throw Error('A standard piece card is required to move the Golem.');
                const types: Record<string, PieceSymbol> = { pawn: 'k', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };
                const t = types[card.type];
                if (!t)
                    throw Error('The Golem uses standard piece cards only.');
                if (!frontierMoves(d, from, t, card.type !== 'pawn').includes(to))
                    throw Error('Invalid Golem move.');
                executeLandingMove(d, from, to, t);
                fd.clockLocked = true;
            }
            else if (card?.type === 'traverse') {
                if (!f.expanded || !/[WXYZ]$/.test(to) || !emptyFrontierSquare(d, to))
                    throw Error('Traverse requires an empty, unrestricted Mystic Field square.');
                moveEntity(d, from, to);
                frontierLanding(d, to);
                fd.traverseArrival={id:uid('traverse-arrival'),owner:c,square:to};
                d.lastMovedPiece[c] = null;
            }
            else {
                if (m.type === 'play_awakening_knight') {
                    if (card?.type !== 'awakening_knight' || p.type !== 'n')
                        throw Error('Choose a Knight and its Awakening card.');
                    d.superKnights ||= [];
                    if (!d.superKnights.includes(from))
                        d.superKnights.push(from);
                }
                const map: Record<string, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' };
                if (m.type === 'play_king_move') {
                    if (p.type !== 'k')
                        throw Error('Choose your King.');
                }
                else if (m.type === 'play_champion_move') {
                    if (d.champions[c]?.square !== from)
                        throw Error('Choose your Champion.');
                }
                else if (m.type === 'play_push') {
                    if (card?.type !== 'push' || p.type === 'golem')
                        throw Error('Push requires its card and an eligible friendly piece.');
                }
                else if (m.type === 'use_powerup_wild_move') {
                    if (d.powerUps[c].wild <= 0 || !['p', 'n', 'b', 'r', 'q', 'k'].includes(p.type))
                        throw Error('Wild is unavailable for this piece.');
                    d.powerUps[c].wild--;
                }
                else if (!card || !(m.type === 'play_awakening_knight' && card.type === 'awakening_knight' && p.type === 'n' || m.type === 'play_awakening_as_wild' && card.type.startsWith('awakening_') || map[card.type] === p.type || card.type === 'wild' || card.type === 'previous' && d.lastMovedPiece[c] === p.type || card.type.startsWith('awakening_') && m.asWild))
                    throw Error('The selected card cannot move this piece.');
                if (!(m.type === 'play_awakening_knight' && from === to && !m.secondTo) && !frontierMoves(d, from, m.type === 'play_push' ? 'q' : undefined, m.type === 'play_push').includes(to))
                    throw Error('Invalid destination.');
                const firstCapture = !!occupant(d, to) || poiBlocks(d, to);
                if (m.secondTo && !d.superKnights?.includes(from))
                    throw Error('Only a Super Knight may jump twice.');
                if (from !== to) executeLandingMove(d, from, to);
                if (m.secondTo) {
                    if (!occupant(d, to) || d.status !== 'playing')
                        throw Error('The first landing prevents a second jump.');
                    if (firstCapture && (occupant(d, m.secondTo) || poiBlocks(d, m.secondTo)))
                        throw Error('Only one capture per double jump.');
                    if (!frontierKingSafe(d, c) || !frontierMoves(d, to).includes(m.secondTo))
                        throw Error('Invalid second jump.');
                    executeLandingMove(d, to, m.secondTo);
                    d.superKnights = d.superKnights?.filter(q => q !== m.secondTo);
                }
                d.lastMovedPiece[c] = ['p', 'n', 'b', 'r', 'q'].includes(p.type) ? p.type as any : null;
            }
            d.lastMovedSquare[c] = m.secondTo || to;
            d.lastMoveDetails = { player: c, actionType: m.type === 'play_awakening_knight' ? 'awakening' : 'move', from, to: m.secondTo || to, firstTo: m.secondTo ? to : undefined };
            if(m.type==='play_awakening_knight'){const q=m.secondTo||to;d.awakenedPieces||=[];if(occupant(d,q)?.color===c&&!d.awakenedPieces.includes(q))d.awakenedPieces.push(q);d.awakenedPieceSquare=q;d.awakenedByPlayer=c;d.awakenedOnTurnNumber=d.turnNumber;d.awakeningAlert={player:c,cardType:card!.type,cardName:card!.name,effectTitle:'Super Knight Awakened!',effectDescription:'The Knight can make one double jump, with at most one capture, then returns to a normal Knight.',pieceSquare:q,timestamp:Date.now()};}
            detail = `${card?.name || p.type} ${from} → ${to}.`;
            if(card?.type.startsWith('awakening_')&&(m.asWild||m.type==='play_awakening_as_wild'))detail=`${c==='w'?'White':'Black'} played ${card.name} as Wild: ${from} → ${to}.`;
        }
        if (!free && ['frontier_item', 'frontier_self_destruct', 'play_champion_ultimate'].includes(m.type))
            d.lastMovedPiece[c] = null;
        if (!free && !frontierKingSafe(d, c))
            throw Error('The complete action leaves your King unsafe.');
        if (!free || m.type==='portal_move') {
            const enemyKing = boardFor(d.fen).board().flat().some(p => p?.type === 'k' && p.color === next);
            if (!enemyKing) {
                d.status = 'checkmate';
                d.winner = c;
                d.winReason = 'King captured.';
            }
        }
        if (card) {
            const idx = d.hands[c].findIndex(x => x.id === card!.id);
            if (idx < 0)
                throw Error('Card unavailable.');
            d.hands[c].splice(idx, 1);
            exhaust = card.type.startsWith('awakening_') && m.type !== 'play_awakening_as_wild' && !m.asWild;
            h.consume(d, c, card, exhaust);
        }
        if(m.type==='frontier_item'&&m.item==='wings') {
            const original=groundPiece(s,m.from)||occupant(s,m.from);
            const piece=original?{...original,awakened:s.awakenedPieces?.includes(m.from)}:undefined;
            const id=uid('flight');fd.events.unshift({id,kind:'wings_flight',detail:'Wings of Flight',from:m.from,square:m.to,piece});
        }
        if(m.type==='frontier_item'&&m.item==='banner') {
            const id=uid('pawn_summon');fd.events.unshift({id,kind:'pawn_summon',detail:'Footsoldier’s Banner summoned a Pawn.',square:m.to,piece:{type:'p',color:c}});
        }
        frontierNotice(d, m.type === 'frontier_self_destruct' ? 'golem_explosion' : card?.type === 'traverse' ? 'traverse' : m.type === 'frontier_item' && m.item === 'core' ? 'summon' : m.type === 'frontier_item' || m.type === 'frontier_bind' ? 'item' : 'move', detail, m.type === 'frontier_self_destruct' ? m.from : undefined,undefined,(card?.type.startsWith('awakening_')&&(m.asWild||m.type==='play_awakening_as_wild')?card.name+' (Played as Wild)':card?.name)||(m.type==='frontier_item'?ITEM_NAMES[m.item as FrontierItem]:({play_king_move:'King Move',use_powerup_wild_move:'Wild Move',play_champion_move:'Champion Move',play_champion_ultimate:'Champion Ultimate',frontier_self_destruct:'Golem Self-destruct',frontier_bind:'Bind',portal_move:'Portal'} as Record<string,string>)[m.type]),c);
        if (!free) {
            if (!d.lastMoveDetails || d.lastMoveDetails.player !== c)
                d.lastMoveDetails = { player: c, actionType: 'move' };
            const priorEp=s.fen.split(' ')[3];d.fen = d.fen.split(' ').map((x, i) => i === 1 ? next : i === 3&&x===priorEp ? '-' : x).join(' ');
            h.finish(d, c, next);
        }
        if(free&&m.type==='portal_move')h.evaluate?.(d);
        Object.assign(s, d);
    }
    catch (e) {
        h.error((e as Error).message);
    }
    return true;
}
export function frontierClockRestore(s: GameState, snapshot: BoardSnapshot) { const f = s.frontier, old = snapshot.frontier; if (!f?.expanded)
    return; if (snapshot.fen.split(' ')[0].split('/').length === 8)
    s.fen = extendFen(s.fen); const priorBags={...f.bags}; if (old?.expanded) {
    f.pois = structuredClone(old.pois);
    f.boss = structuredClone(old.boss);
    f.golems = structuredClone(old.golems);
    f.bags = {...old.bags};

    for (const c of ['w', 'b'] as const)
        f.inventories[c] = f.inventories[c].filter(item => old.inventories[c].some(x => x.id === item.id));
}
else {
    f.pois = { ...f.pois };
    f.bags = {w:false,b:false};
} for(const c of ['w','b'] as const)if(priorBags[c]&&!f.bags[c]) {f.bagDiscardPending||={};f.bagDiscardPending[c]=true;} trimBagHands(s); frontierNotice(s, 'clock', 'Board movement rewound. Spent cards, items, charges, cooldowns and capture points remain spent.'); }
export function frontierUltimate(s: GameState, m: any, c: PlayerColor) {
    if (s.frontier)
        s.frontier.clockLocked = true;
    const ch = s.champions[c];
    if (!ch || blockedActor(s, ch.square) || s.grounds?.disarm.some(d => d.square === ch.square))
        throw Error('Champion cannot activate its ultimate.');
    const enemy = c === 'w' ? 'b' : 'w';
    const from = ch.square;
    if (ch.type === 'summoner') {
        const ally = m.targetFriendlySquare, to = m.targetSquare;
        if (occupant(s, ally)?.color !== c || blockedActor(s, ally) || !adjacent(from, s.fen).includes(to) || s.restrictedSquares.includes(to) || to === s.monolithSquare || occupant(s, to)?.color === c)
            throw Error('Choose a friendly piece and a legal square beside the Summoner.');
        executeLandingMove(s, ally, to);
    }
    else if (ch.type === 'ninja') {
        const targets = m.targetSquares;
        if (!Array.isArray(targets) || targets.length < 1 || targets.length > 2 || new Set(targets).size !== targets.length)
            throw Error('Select one or two adjacent enemies.');
        for (const q of targets) {
            if (!adjacent(from, s.fen).includes(q) || (occupant(s, q)?.color !== enemy && !(s.frontier?.ready && ['boss', 'mimic'].includes(s.frontier.pois[q]))) || captureProtected(s, q))
                throw Error('Invalid assassination target.');
        }
        for (const q of targets)
            rangedCapture(s, q, c);
    }
    else {
        const to = m.targetSquare, [x, y] = xy(from, s.fen), [tx, ty] = xy(to || '', s.fen), dx = Math.sign(tx - x), dy = Math.sign(ty - y), n = Math.max(Math.abs(tx - x), Math.abs(ty - y));
        if (!n || !(x === tx || y === ty || Math.abs(tx - x) === Math.abs(ty - y)) || ch.type === 'musketeer' && n > 3 || s.restrictedSquares.includes(to))
            throw Error('Invalid ultimate direction or range.');
        const path = [];
        for (let i = 1; i <= n; i++) {
            const q = squareAt(x + dx * i, y + dy * i, s.fen)!;
            if (!q || q === s.monolithSquare || occupant(s, q)?.color === c || captureProtected(s, q))
                throw Error('Ultimate path is blocked.');
            path.push(q);
            if (ch.type === 'musketeer' && i < n && (occupant(s, q) || poiBlocks(s, q)))
                throw Error('The target is behind another unit.');
        }
        if (ch.type === 'musketeer') {
            rangedCapture(s, to, c);
        }
        else {
            for (const q of path) {
                if (s.frontier?.pois[q] === 'boss') {
                    executeLandingMove(s, ch.square, q);
                    if (s.champions[c]?.square !== q)
                        return;
                }
                else if (['chest', 'mimic'].includes(s.frontier?.pois[q] || '')) {
                    if (q !== to)
                        throw Error('A discovery blocks the sweep.');
                    executeLandingMove(s, ch.square, q);
                }
                else if (occupant(s, q))
                    removeEntity(s, q, c);
            }
            if (s.champions[c] && ch.square !== to)
                moveEntity(s, ch.square, to);
            frontierLanding(s, to);
        }
    }
    if (!frontierKingSafe(s, c))
        throw Error('The ultimate leaves your King unsafe.');
    if (s.frontier)
        s.frontier.clockLocked = true;
    s.lastMoveDetails = { player: c, actionType: 'champion_ultimate', from, to: m.targetSquare || from };
}
/** Legal defensive summons count as escapes before checkmate is declared. */
export function canSummonToEscapeCheck(s:GameState,c:PlayerColor):boolean {
    const hand=s.hands[c].filter(card=>s.frontier?.bind?.cardId!==card.id);
    if(!s.champions[c]&&hand.some(card=>card.type==='champion')) {
        for(const q of allSquares(s.fen)) {
            const rank=Number(q.slice(1));
            if(!(c==='w'?rank>=1&&rank<=4:rank>=5&&rank<=8)||!emptyFrontierSquare(s,q))continue;
            const d=structuredClone(s);
            d.champions[c]={type:'berserker',color:c,square:q};
            if(frontierKingSafe(d,c))return true;
        }
    }
    for(const card of hand)if(card.type==='soul_release'&&card.soul) {
        for(const q of soulTargets(s,card,c)) {
            const d=structuredClone(s);placeRevived(d,q,card.soul.piece,c,'escape-preview');
            if(d.frontier?.expanded)frontierLanding(d,q);else landGround(d,q);
            if(frontierKingSafe(d,c))return true;
        }
    }
    for(const item of s.frontier?.inventories[c]||[]) {
        if(!['banner','core','feather'].includes(item.type)||item.remaining===0||(item.readyAfter||0)>s.frontier!.ownerTurns[c]||item.usedTurn===s.turnNumber)continue;
        for(const q of allSquares(s.fen)) {
            const d=structuredClone(s);d.turn=c;
            d.fen=d.fen.split(' ').map((v,i)=>i===1?c:v).join(' ');
            let rejected=false;
            executeFrontier(d,{type:'frontier_item',item:item.type,to:q} as any,c,{consume:()=>{},finish:()=>{},error:()=>{rejected=true;}});
            if(!rejected&&frontierKingSafe(d,c))return true;
        }
    }
    return false;
}

export function frontierEscape(s: GameState, c: PlayerColor, freeDepth = 0) {
    if(canSummonToEscapeCheck(s,c))return true;
    const cardTypes = new Set(s.hands[c].filter(card => s.frontier?.bind?.cardId !== card.id).map(x => x.type));
    for (const q of allSquares(s.fen)) {
        const p = occupant(s, q);
        if (p?.color !== c)
            continue;
        const isFree = p.type === 'k' || s.champions[c]?.square === q;
        if (p.type === 'golem') {
            for (const [ct, t] of Object.entries({ pawn: 'k', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' }))
                if (cardTypes.has(ct as any) && frontierMoves(s, q, t as PieceSymbol, ct !== 'pawn').length)
                    return true;
        }
        if (p.type !== 'golem' && (cardTypes.has('push') && frontierMoves(s, q, 'q', true).length || [...cardTypes].some(t => t.startsWith('awakening_')) && frontierMoves(s, q).length))
            return true;
        if (p.type === 'k' && cardTypes.has('awakening_king') && frontierMoves(s, q, 'q').length)
            return true;
        const matching = ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' } as any)[p.type];
        if (p.type !== 'golem' && (isFree || cardTypes.has(matching) || cardTypes.has('wild') || cardTypes.has('joker') || s.powerUps[c].wild > 0 || cardTypes.has('previous') && s.lastMovedPiece[c] === p.type)) {
            if (frontierMoves(s, q).length)
                return true;
        }
        if (cardTypes.has('traverse') && !blockedActor(s, q))
            for (const to of allSquares(s.fen).filter(q => /[WXYZ]$/.test(q) && emptyFrontierSquare(s, q))) {
                const d = structuredClone(s);
                moveEntity(d, q, to);
                frontierLanding(d, to);
                if (frontierKingSafe(d, c))
                    return true;
            }
    }
    // Free defensive resources and item moves remain possible escapes.
    for (const item of s.frontier?.inventories[c] || []) {
        if (item.remaining === 0 || (item.readyAfter || 0) > s.frontier!.ownerTurns[c])
            continue;
        if (item.type === 'star' || item.type === 'wings')
            for (const q of allSquares(s.fen)) {
                if (occupant(s, q)?.color !== c || blockedActor(s, q))
                    continue;
                if (item.type === 'star' && occupant(s,q)?.type!=='golem' && frontierMoves(s, q).length)
                    return true;
                if (item.type === 'wings')
                    for (const to of allSquares(s.fen)) {
                        if (!emptyFrontierSquare(s, to))
                            continue;
                        const [x, y] = xy(q, s.fen), [tx, ty] = xy(to, s.fen), n = Math.max(Math.abs(tx - x), Math.abs(ty - y));
                        if (n < 1 || n > 2 || !(x === tx || y === ty || Math.abs(tx - x) === Math.abs(ty - y)))
                            continue;
                        const d = structuredClone(s);
                        moveEntity(d, q, to);
                        if (frontierKingSafe(d, c))
                            return true;
                    }
            }
    }
    const can = (msg: any) => { const d = structuredClone(s); d.turn = c; d.fen = d.fen.split(' ').map((x, i) => i === 1 ? c : x).join(' '); let error = false; executeFrontier(d, msg, c, { consume: () => { }, finish: () => { }, ultimate: frontierUltimate, error: () => { error = true; } }); return !error && frontierKingSafe(d, c) && JSON.stringify(d) !== JSON.stringify(s); };
    for(const golem of s.frontier?.golems||[])if(golem.owner===c&&can({type:'frontier_self_destruct',from:golem.square}))return true;
    for (const item of s.frontier?.inventories[c] || []) {
        if (item.remaining === 0 || (item.readyAfter || 0) > s.frontier!.ownerTurns[c] || item.usedTurn === s.turnNumber)
            continue;
        if (['banner', 'core', 'feather'].includes(item.type))
            for (const to of allSquares(s.fen))
                if (can({ type: 'frontier_item', item: item.type, to }))
                    return true;
        if (item.type === 'sigil') {
            const ch = s.champions[c];
            if (ch) {
                const allies = ch.type === 'summoner' ? allSquares(s.fen).filter(q => occupant(s, q)?.color === c) : [undefined];
                for (const ally of allies)
                    for (const to of allSquares(s.fen))
                        if (can({ type: 'frontier_item', item: 'sigil', targetSquare: to, targetFriendlySquare: ally, targetSquares: [to] }))
                            return true;
                if (ch.type === 'ninja') {
                    const targets = adjacent(ch.square, s.fen);
                    for (let i = 0; i < targets.length; i++)
                        for (let j = i + 1; j < targets.length; j++)
                            if (can({ type: 'frontier_item', item: 'sigil', targetSquares: [targets[i], targets[j]] }))
                                return true;
                }
            }
        }
    }
    if (cardTypes.has('champion') && s.champions[c]) {
        const card = s.hands[c].find(x => x.type === 'champion' && x.id !== s.frontier?.bind?.cardId)!;
        const ch = s.champions[c]!;
        const allies = ch.type === 'summoner' ? allSquares(s.fen).filter(q => occupant(s, q)?.color === c) : [undefined];
        for (const ally of allies)
            for (const to of allSquares(s.fen))
                if (can({ type: 'play_champion_ultimate', cardId: card.id, targetSquare: to, targetFriendlySquare: ally, targetSquares: [to] }))
                    return true;
    }
    if ((s.expansions?.shiftedParadigm!==false||s.expansions?.championsOfTheMonolith!==false)&&(cardTypes.has('monolith') || s.powerUps[c].monolith > 0)) {
        if (s.monolithLastMovedTurn !== s.turnNumber - 1)
            for (const q of allSquares(s.fen)) {
                if (!monolithPlacementSquare(s, q))
                    continue;
                const d = structuredClone(s);
                d.monolithSquare = q;
                if (d.beaconEffect?.active)
                    d.beaconEffect.protectedSquares = adjacent(q, d.fen, true);
                if (frontierKingSafe(d, c))
                    return true;
            }
    }
    if (cardTypes.has('beacon') && s.monolithSquare) {
        const d = structuredClone(s);
        d.beaconEffect = { active: true, protectedSquares: adjacent(s.monolithSquare, s.fen, true) } as any;
        if (frontierKingSafe(d, c))
            return true;
    }
    if (cardTypes.has('clock') && !getClockBlockReason(s, c)) {
        const old = s.boardHistory?.[s.boardHistory.length - 3];
        if (old) {
            const d = structuredClone(s);
            d.fen = old.fen;
            d.monolithSquare = old.monolithSquare;
            d.champions = structuredClone(old.champions);
            d.restrictedSquares = [...old.restrictedSquares];
            frontierClockRestore(d, old);
            if (frontierKingSafe(d, c))
                return true;
        }
    }
    if (cardTypes.has('switch')) {
        const allies = allSquares(s.fen).filter(q => occupant(s, q)?.color === c && !blockedActor(s, q) && occupant(s, q)?.type !== 'golem');
        for (let i = 0; i < allies.length; i++)
            for (let j = i + 1; j < allies.length; j++) {
                const d = structuredClone(s), a = allies[i], b = allies[j], board = boardFor(d.fen), pa = board.remove(a as Square), pb = board.remove(b as Square);
                if (pa)
                    board.put(pa, b as Square);
                if (pb)
                    board.put(pb, a as Square);
                d.fen = board.fen();
                for (const ch of Object.values(d.champions))
                    if (ch) {
                        if (ch.square === a)
                            ch.square = b;
                        else if (ch.square === b)
                            ch.square = a;
                    }
                frontierLanding(d, a);
                frontierLanding(d, b);
                if (frontierKingSafe(d, c))
                    return true;
            }
    }
    if(freeDepth<1&&!s.jokerLocked[c]&&(cardTypes.has('refresh')||s.powerUps[c].draw>0)){
        const cards=[...s.deck,...s.discard,...s.hands[c]].filter(card=>!['refresh','brick'].includes(card.type));
        const draft=structuredClone(s);draft.hands[c]=cards;
        if(frontierEscape(draft,c,freeDepth+1))return true;
    }
    if (freeDepth < 1 && !s.jokerLocked[c]) {
        for (const item of s.frontier?.inventories[c] || [])
            if (item.type === 'lens' && item.remaining !== 0 && item.usedTurn !== s.turnNumber) {
                const d = structuredClone(s), card = d.hands[c].find(x => x.id !== d.frontier?.bind?.cardId);
                if (card) {
                    let error = false;
                    executeFrontier(d, { type: 'frontier_item', item: 'lens', cardId: card.id }, c, { consume: () => { }, finish: () => { }, error: () => { error = true; } });
                    if (!error && frontierEscape(d, c, freeDepth + 1))
                        return true;
                }
            }
    }
    return false;
}
export function rangedCapture(s: GameState, to: string, c: PlayerColor) {
    const f = s.frontier;
    if (f?.pois[to] === 'boss' && f.boss && f.ready) {
        const boss = f.boss;
        if (boss.health === 2) {
            boss.health = 1;
            frontierNotice(s, 'boss_hit', 'The ranged attack weakened the Boss.');
        }
        else {
            delete f.pois[to];
            delete f.boss;
            f.pois[to] = boss.drop;
            frontierNotice(s,'drop',`${ITEM_NAMES[boss.drop]} dropped at ${to}.`,to,{item:boss.drop});
            frontierNotice(s, 'boss_defeat', 'The Boss dropped a reward on its square.');
        }
        return;
    }
    if (f?.pois[to] === 'mimic' && f.ready) {
        delete f.pois[to];
        awardCaptureRefresh(s, c, 3);
        return;
    }
    if (occupant(s, to)?.color !== (c === 'w' ? 'b' : 'w') || captureProtected(s, to))
        throw Error('Choose an unprotected enemy target.');
    removeEntity(s, to, c);
}
export function frontierUltimateTargets(s: GameState, c: PlayerColor, ally?: string) {
    const ch = s.champions[c];
    if (!ch)
        return [];
    const out: string[] = [];
    for (const to of allSquares(s.fen)) {
        const draft = structuredClone(s);
        try {
            frontierUltimate(draft, { targetSquare: to, targetFriendlySquare: ally, targetSquares: [to] }, c);
            if (frontierKingSafe(draft, c))
                out.push(to);
        }
        catch { }
    }
    return out;
}

export function traverseTargets(s:GameState,c:PlayerColor,from:string) {
 if(occupant(s,from)?.color!==c||blockedActor(s,from))return [];
 return allSquares(s.fen).filter(to=>{if(!/[WXYZ]$/.test(to)||!emptyFrontierSquare(s,to))return false;const d=structuredClone(s);try{moveEntity(d,from,to);frontierLanding(d,to);return frontierKingSafe(d,c);}catch{return false;}});
}
export function starTargets(s:GameState,c:PlayerColor,from:string) {
 if(occupant(s,from)?.color!==c||occupant(s,from)?.type==='golem'||blockedActor(s,from))return [];
 return frontierMoves(s,from);
}

export function monolithPlacementSquare(s:GameState,q:string) {
 return emptyFrontierSquare(s,q)&&!s.frontier?.pois[q];
}
export function golemBlastSquares(s:GameState,from:string){return adjacent(from,s.fen,true);}
export function golemSelfDestructError(s:GameState,c:PlayerColor,from:string):string|undefined {
 const golem=s.frontier?.golems.find(g=>g.square===from&&g.owner===c);
 if(!golem||blockedActor(s,from)||s.grounds?.disarm.some(d=>d.square===from))return 'This Golem cannot self-destruct while restricted, stunned, or disarmed.';
 const draft=structuredClone(s);
 for(const q of adjacent(from,draft.fen))if(occupant(draft,q)&&!captureProtected(draft,q))removeEntity(draft,q,c);
 removeEntity(draft,from,c,false);
 if(!frontierKingSafe(draft,c))return 'The explosion would remove your King or leave it unsafe.';
}
