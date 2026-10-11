import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialGameState, createSafeChess } from '../src/utils/chessLogic.ts';
import { prepareKnightSecondMove } from '../src/utils/knightMove.ts';

function fixture(color: 'w' | 'b' = 'w') {
  const state = createInitialGameState();
  const board = createSafeChess(`7k/8/8/8/8/2${color === 'w' ? 'N' : 'n'}5/8/K7 ${color === 'w' ? 'b' : 'w'} - - 0 1`);
  state.fen = board.fen();
  state.superKnights = ['b1'];
  return { state, board, color };
}
test('second Knight jump works after chess.js has changed the turn', () => {
  const {state, board} = fixture();
  const result = prepareKnightSecondMove(state, board, 'w', 'c3', 'd5', false, false);
  assert.ok(result);
  assert.deepEqual(result.board.get('d5'), {type:'n',color:'w'});
  assert.equal(result.board.get('c3'), undefined);
});
test('Black also gets a free second Knight jump', () => {
  const {state, board} = fixture('b');
  assert.ok(prepareKnightSecondMove(state, board, 'b', 'c3', 'd5', false, false));
});
for (const [firstCaptured, secondCapture, valid] of [[false,true,true],[true,false,true],[true,true,false]] as const) {
  test(`capture limits first=${firstCaptured}, second=${secondCapture}`, () => {
    const {state,board} = fixture();
    if (secondCapture) board.put({type:'r',color:'b'},'d5');
    assert.equal(Boolean(prepareKnightSecondMove(state,board,'w','c3','d5',firstCaptured,false)),valid);
  });
}
test('second jump may capture a Champion, but not after another capture', () => {
  const {state,board} = fixture();
  state.champions.b = {square:'d5',type:'berserker',color:'b'};
  assert.ok(prepareKnightSecondMove(state,board,'w','c3','d5',false,false)?.capturedChampion);
  assert.equal(prepareKnightSecondMove(state,board,'w','c3','d5',true,false),null);
});
for (const destination of ['bad', 'i9', 'c4', 'c3']) {
  test(`invalid destination ${destination} leaves state and board unchanged`, () => {
    const {state,board} = fixture();
    const snapshot = JSON.stringify(state), fen = board.fen();
    assert.equal(prepareKnightSecondMove(state,board,'w','c3',destination,false,false),null);
    assert.equal(JSON.stringify(state),snapshot);
    assert.equal(board.fen(),fen);
  });
}
test('wrong piece and restricted target rejected', () => {
  const {state,board} = fixture();
  state.restrictedSquares=['d5'];
  assert.equal(prepareKnightSecondMove(state,board,'w','c3','d5',false,false),null);
  state.restrictedSquares=[];
  board.put({type:'b',color:'w'},'c3');
  assert.equal(prepareKnightSecondMove(state,board,'w','c3','d5',false,false),null);
});
