import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { isNewAction, planBoardMotion, type MotionState } from '../src/motion/plan';

function state(fen = new Chess().fen()): MotionState {
  return { fen, turn: 'w', turnNumber: 1, status: 'playing', champions: { w: null, b: null }, monolithSquare: null,
    historyLog: [{ id: 'start' } as any], lastMoveDetails: null };
}
function move(before: MotionState, from: string, to: string, promotion?: string): MotionState {
  const chess = new Chess(before.fen);
  chess.move({ from, to, promotion });
  return { ...before, fen: chess.fen(), turn: chess.turn(), turnNumber: before.turnNumber + 1,
    historyLog: [{ id: `${from}-${to}` } as any, ...before.historyLog],
    lastMoveDetails: { player: before.turn, actionType: 'move', from, to } };
}

test('confirmed pawn move has one traveller and no capture', () => {
  const before = state(), after = move(before, 'e2', 'e4');
  assert.deepEqual(planBoardMotion(before, after), { moves: [{ from: 'e2', to: 'e4' }], captures: [] });
});
test('clock broadcasts and duplicate snapshots never replay an action', () => {
  const after = move(state(), 'e2', 'e4');
  assert.equal(isNewAction(after, structuredClone(after)), false);
  assert.deepEqual(planBoardMotion(after, structuredClone(after)), { moves: [], captures: [] });
});
test('reset and reconnect history snapshots do not animate historical moves', () => {
  const before = move(state(), 'e2', 'e4');
  const reset = move(state(), 'd2', 'd4');
  reset.historyLog[1].id = 'new-match';
  assert.equal(isNewAction(before, reset), false);
  assert.equal(isNewAction({ ...before, status: 'lobby' }, reset), false);
});
test('stale earlier events cannot replay after later actions', () => {
  const first = move(state(), 'e2', 'e4'), second = move(first, 'e7', 'e5');
  assert.equal(isNewAction(second, first), false);
});
test('captures preserve the captured square', () => {
  const before = move(move(state(), 'e2', 'e4'), 'd7', 'd5');
  assert.deepEqual(planBoardMotion(before, move(before, 'e4', 'd5')), { moves: [{ from: 'e4', to: 'd5' }], captures: ['d5'] });
});
test('en passant removes the pawn beside the landing square', () => {
  const before = state('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.deepEqual(planBoardMotion(before, move(before, 'e5', 'd6')), { moves: [{ from: 'e5', to: 'd6' }], captures: ['d5'] });
});
test('castling moves the rook as well as the king', () => {
  const before = state('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.deepEqual(planBoardMotion(before, move(before, 'e1', 'g1')), { moves: [{ from: 'e1', to: 'g1' }, { from: 'h1', to: 'f1' }], captures: [] });
});
test('promotion travels from the pawn without treating promotion as a capture', () => {
  const before = state('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.deepEqual(planBoardMotion(before, move(before, 'a7', 'a8', 'q')), { moves: [{ from: 'a7', to: 'a8' }], captures: [] });
});
test('switch moves both units without false captures', () => {
  const before = state();
  const after = { ...before, fen: before.fen.replace('RNBQKBNR', 'NRBQKBNR'),
    historyLog: [{ id: 'switch' } as any, ...before.historyLog],
    lastMoveDetails: { player: 'w', actionType: 'switch', swappedSquares: ['a1', 'b1'] } } as MotionState;
  assert.deepEqual(planBoardMotion(before, after), { moves: [{ from: 'a1', to: 'b1' }, { from: 'b1', to: 'a1' }], captures: [] });
});
test('clock reversal snaps rather than inventing reverse captures', () => {
  const before = move(state(), 'e2', 'e4');
  const after = { ...before, fen: state().fen, historyLog: [{ id: 'clock' } as any, ...before.historyLog],
    lastMoveDetails: { player: 'b', actionType: 'clock' } } as MotionState;
  assert.deepEqual(planBoardMotion(before, after), { moves: [], captures: [] });
});
test('switching identical pawns still shows both travellers', () => {
  const before = state();
  const after = { ...before, historyLog: [{ id: 'same-pawns' } as any, ...before.historyLog],
    lastMoveDetails: { player: 'w', actionType: 'switch', swappedSquares: ['a2', 'b2'] } } as MotionState;
  assert.deepEqual(planBoardMotion(before, after), { moves: [{ from: 'a2', to: 'b2' }, { from: 'b2', to: 'a2' }], captures: [] });
});
test('champion teleport metadata cannot label a friendly relocation as a capture', () => {
  const before = state('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  const after = { ...before, fen: '4k3/8/8/8/4R3/8/8/4K3 b - - 0 1',
    historyLog: [{ id: 'teleport' } as any, ...before.historyLog],
    lastMoveDetails: { player: 'w', actionType: 'champion_ultimate' } } as MotionState;
  assert.deepEqual(planBoardMotion(before, after), { moves: [{ from: 'e2', to: 'e4' }], captures: [] });
});
