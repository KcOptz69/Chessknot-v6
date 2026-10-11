import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSafeChess, getLegalMovesForPiece, createBoardWithMonolith } from '../src/utils/chessLogic.ts';
for (const [type, from, to] of [['r','d1','d5'],['b','b3','d5'],['n','c3','d5'],['q','d1','d5'],['k','c4','d5'],['p','c4','d5']] as const) {
  test(`${type} can legally capture Champion`, () => {
    const chess = createSafeChess('7k/8/8/8/8/8/8/K7 w - - 0 1');
    if (type === 'k') chess.remove('a1');
    chess.put({ type, color: 'w' }, from);
    const enemy = { type: 'berserker', square: to, color: 'b' } as const;
    const champions = { w: null, b: enemy };
    assert.ok(getLegalMovesForPiece(from, chess, [], null, [], [], null, enemy, champions).includes(to));
    const board = createBoardWithMonolith(chess.fen(), null, 'w', champions);
    // Normal server handler uses this temporary capture target.
    board.put({ type: 'p', color: 'b' }, to);
    assert.ok(board.move({ from, to }));
    assert.equal(board.get(to)?.color, 'w');
    assert.equal(chess.get(from)?.type, type); // validation did not mutate input
  });
}
test('normal pawn cannot capture Champion directly in front; Super Pawn can', () => {
  const chess = createSafeChess('7k/8/8/8/3P4/8/8/K7 w - - 0 1');
  const enemy = { type: 'berserker', square: 'd5', color: 'b' } as const;
  assert.ok(!getLegalMovesForPiece('d4', chess, [], null, [], [], null, enemy, {w:null,b:enemy}).includes('d5'));
  assert.ok(getLegalMovesForPiece('d4', chess, [], null, [], [], null, enemy, {w:null,b:enemy}, [], ['d4']).includes('d5'));
});
test('sliding piece cannot pass through Champion', () => {
  const chess = createSafeChess('7k/8/8/8/8/8/8/K2R4 w - - 0 1');
  const enemy = { type: 'berserker', square: 'd5', color: 'b' } as const;
  const moves = getLegalMovesForPiece('d1', chess, [], null, [], [], null, enemy, {w:null,b:enemy});
  assert.ok(moves.includes('d5'));
  assert.ok(!moves.includes('d6'));
});
