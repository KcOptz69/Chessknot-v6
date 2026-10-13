import {ranksFor} from '../utils/frontierBoard';
import type { GameState } from '../types';

export type MotionState = Pick<GameState, 'fen' | 'turn' | 'turnNumber' | 'status' | 'historyLog' | 'lastMoveDetails' | 'champions' | 'monolithSquare' | 'frontier'>;
export interface BoardMotion { moves: { from: string; to: string }[]; captures: string[] }

export function matchIdentity(state: MotionState): string {
  return state.historyLog.at(-1)?.id || '';
}

// Server clock broadcasts repeat the move metadata. Only a new log entry in
// the same match may produce a visual event; joining/resetting is a snapshot.
export function isNewAction(before: MotionState, after: MotionState): boolean {
  const id = after.historyLog[0]?.id;
  return before.status === 'playing' && !!id && !!matchIdentity(before)
    && matchIdentity(before) === matchIdentity(after)
    && !before.historyLog.some(entry => entry.id === id) && after.turnNumber >= before.turnNumber;
}

function units(state: MotionState): Map<string, string> {
  const result = new Map<string, string>();
  state.fen.split(' ')[0].split('/').forEach((row, rank) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else { result.set(`${'abcdefgh'[file]}${ranksFor(state.fen)[ranksFor(state.fen).length-1-rank]}`, ch); file++; }
    }
  });
  for (const color of ['w', 'b'] as const) {
    const champion = state.champions?.[color];
    if (champion) result.set(champion.square, `${color}:${champion.type}`);
  }
  for(const golem of state.frontier?.golems||[])result.set(golem.square,`${golem.owner}:golem`);
  if (state.monolithSquare) result.set(state.monolithSquare, 'monolith');
  return result;
}

export function planBoardMotion(before: MotionState, after: MotionState): BoardMotion {
  const result: BoardMotion = { moves: [], captures: [] };
  if (!isNewAction(before, after)) return result;
  const move = after.lastMoveDetails;
  if (!move || move.actionType === 'clock') return result;
  const oldUnits = units(before), newUnits = units(after);
  const add = (from?: string | null, to?: string | null, swapped = false) => {
    if (from && to && from !== to && oldUnits.has(from) && newUnits.has(to)
      && (swapped || oldUnits.get(from) !== newUnits.get(from) || oldUnits.get(to) !== newUnits.get(to))) {
      result.moves.push({ from, to });
    }
  };
  if (move.swappedSquares && (move.actionType === 'switch' || move.actionType === 'powerup')) {
    add(move.swappedSquares[0], move.swappedSquares[1], true);
    add(move.swappedSquares[1], move.swappedSquares[0], true);
  } else if (move.actionType === 'monolith') {
    add(before.monolithSquare, after.monolithSquare);
  } else {
    add(move.from, move.to);
    // The rook is a second traveller when the king castles.
    if (move.from && move.to && oldUnits.get(move.from)?.toLowerCase() === 'k'
      && Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0)) === 2) {
      const rank = move.from[1];
      add(move.to[0] === 'g' ? `h${rank}` : `a${rank}`, move.to[0] === 'g' ? `f${rank}` : `d${rank}`);
    }
  }
  // Champion moves/teleports do not always include from/to in server metadata.
  // Infer only an unambiguous same-unit relocation; never guess among copies.
  const colorOf = (unit: string) => unit.includes(':') ? unit[0] : unit === unit.toUpperCase() ? 'w' : 'b';
  for (const [from, unit] of oldUnits) {
    if (unit === 'monolith' || colorOf(unit) !== move.player || newUnits.get(from) === unit
      || result.moves.some(item => item.from === from)) continue;
    const sources = [...oldUnits].filter(([square, value]) => value === unit && newUnits.get(square) !== unit);
    const destinations = [...newUnits].filter(([square, value]) => value === unit && oldUnits.get(square) !== unit
      && !result.moves.some(item => item.to === square));
    if (sources.length === 1 && destinations.length === 1) add(from, destinations[0][0]);
  }
  const leaving = new Set(result.moves.map(item => item.from));
  // Covers ordinary captures and en passant's distinct capture square.
  for (const [square, unit] of oldUnits) {
    if (!leaving.has(square) && unit !== 'monolith' && colorOf(unit) !== move.player && newUnits.get(square) !== unit) result.captures.push(square);
  }
  return result;
}

/** New piece identities distinguish a real summon from movement or rewind. */
export function planSummonMotion(before: GameState, after: GameState): {square:string;kind:'revive'|'soul'}[] {
  if(!isNewAction(before,after)||after.lastMoveDetails?.actionType==='clock')return [];
  const oldIds=new Set(Object.values(before.pieceIds||{}));
  const newEntries=after.historyLog.filter(e=>!before.historyLog.some(old=>old.id===e.id));
  const result:{square:string;kind:'revive'|'soul'}[]=[];
  for(const [square,id] of Object.entries(after.pieceIds||{})){
    if(oldIds.has(id)||!units(after).has(square))continue;
    const soul=after.soulSummons?.find(s=>s.pieceId===id&&!before.soulSummons?.some(old=>old.id===s.id));
    if(soul&&newEntries.some(e=>e.actionType==='soul_release'))result.push({square,kind:'soul'});
    else if(newEntries.some(e=>e.actionType==='revive')&&after.summoningCircles?.some(c=>c.square===square&&c.finished&&before.summoningCircles?.some(old=>old.id===c.id&&!old.finished)))result.push({square,kind:'revive'});
  }
  return result;
}
