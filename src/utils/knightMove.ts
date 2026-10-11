import type { Chess, Square } from 'chess.js';
import type { GameState, PlayerColor } from '../types.ts';
import { createBoardWithMonolith, getLegalMovesForPiece, getSurroundingSquares, isKingChecked } from './chessLogic.ts';

// Prepare a second Knight jump on a private board. Neither input is mutated.
export function prepareKnightSecondMove(
  state: GameState, afterFirst: Chess, color: PlayerColor,
  from: string, to: string, firstCaptured: boolean, firstChampionCaptured: boolean
) {
  if (!/^[a-h][1-8]$/.test(to)) return null;
  const opponent = color === 'w' ? 'b' : 'w';
  const champions = state.champions ? { ...state.champions } : null;
  if (firstChampionCaptured && champions) champions[opponent] = null;
  const knight = afterFirst.get(from as Square);
  if (knight?.type !== 'n' || knight.color !== color) return null;
  const capturedPiece = afterFirst.get(to as Square);
  const capturedChampion = Boolean(champions?.[opponent]?.square === to);
  if (firstCaptured && (capturedPiece || capturedChampion)) return null;
  const board = createBoardWithMonolith(afterFirst.fen(), state.monolithSquare, color, champions);
  const targets = getLegalMovesForPiece(from as Square, board, state.restrictedSquares,
    state.monolithSquare, state.staticEffect?.stunnedSquares || [],
    state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [],
    champions?.[color]?.square || null, champions?.[opponent] || null, champions,
    state.awakenedRooks || [], state.superPawns || [], state.superKnights || [], undefined, state.grounds);
  if (!targets.includes(to)) return null;
  if (capturedChampion) board.put({ type: 'p', color: opponent }, to as Square);
  try { if (!board.move({ from: from as Square, to: to as Square })) return null; }
  catch { return null; }
  const remaining = champions ? { ...champions } : null;
  if (capturedChampion && remaining) remaining[opponent] = null;
  // Remove obstacle placeholders, keeping the Knight at its destination.
  for (const square of (board as any)._placeholderSquares || []) {
    if (square !== to) board.remove(square as Square);
  }
  if (isKingChecked(board, color, state.monolithSquare, remaining, undefined, state.grounds)) return null;
  return { board, capturedPiece, capturedChampion };
}
