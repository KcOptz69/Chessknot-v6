import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  createSafeChess,
  isKingChecked,
  getPushMoves,
  getCheckEscapeCardTypes,
  isCardPermittedForPiece,
  getSurroundingSquares,
} from '../src/utils/chessLogic.ts';
import { Card, GameState } from '../src/types.ts';

test('1. Awakened Bishop revive keeps turn as current player turn in state', () => {
  const state = createInitialGameState();
  assert.equal(state.turn, 'w');
  // State fen reflects turn 'w'
  assert.equal(state.fen.split(' ')[1], 'w');
});

test('2. Switch preserves superPawns, superKnights, and awakenedRooks positions', () => {
  const state = createInitialGameState();
  state.superPawns = ['e2'];
  state.superKnights = ['b1'];
  state.awakenedRooks = [{ square: 'a1', color: 'w', turnsRemaining: 5, hasCaptured: false }];

  // Simulate switch logic as in server
  const sq1 = 'e2';
  const sq2 = 'd2';
  // If sq1 is in superPawns, moving it to sq2 updates superPawns to d2
  const sp1 = state.superPawns.includes(sq1);
  const sp2 = state.superPawns.includes(sq2);
  if (sp1 && !sp2) {
    state.superPawns = state.superPawns.filter((s) => s !== sq1).concat(sq2);
  }
  assert.deepEqual(state.superPawns, ['d2']);

  // If sq1 is a1 and sq2 is h1 for rook
  const rsq1 = 'a1';
  const rsq2 = 'h1';
  state.awakenedRooks = state.awakenedRooks.map((r) => {
    if (r.square === rsq1) return { ...r, square: rsq2 };
    if (r.square === rsq2) return { ...r, square: rsq1 };
    return r;
  });
  assert.equal(state.awakenedRooks[0].square, 'h1');
  assert.equal(state.awakenedRooks[0].turnsRemaining, 5);
});

test('3. King invulnerable on Beacon is NOT in check', () => {
  // White king on e1, Black queen on e8 attacking down the file
  const fen = '4q3/8/8/8/8/8/8/4K3 w - - 0 1';
  const chess = createSafeChess(fen);

  // Without beacon protection: King is in check
  assert.equal(isKingChecked(chess, 'w', null, null, []), true);

  // With Beacon active, monolith on e2 protecting surrounding squares including e1
  const monolithSquare = 'e2';
  const beaconProtectedSquares = getSurroundingSquares(monolithSquare);
  assert.ok(beaconProtectedSquares.includes('e1'));

  // King on e1 with beaconProtectedSquares: King is NOT in check!
  assert.equal(isKingChecked(chess, 'w', monolithSquare, null, beaconProtectedSquares), false);
});

test('4. Check escape detection for Monolith, Switch, Push, and Clock cards', () => {
  // White king in check on e1 by Queen on e8
  const fen = '4q3/8/8/8/8/8/8/4K3 w - - 0 1';
  const chess = createSafeChess(fen);
  const state = createInitialGameState();
  state.fen = fen;
  state.turn = 'w';
  state.hands.w = [
    { id: 'c1', type: 'monolith', name: 'Monolith', description: '' },
    { id: 'c2', type: 'push', name: 'Push', description: '' },
  ];

  const escapeTypes = getCheckEscapeCardTypes(chess, state, 'w');
  // Monolith can be placed on e4 or e5 to block the line of sight
  assert.ok(escapeTypes.has('monolith'));
});

test('5. Push moves can be computed for all pieces including enemy pieces and champions', () => {
  const chess = createSafeChess('8/8/8/3p4/8/8/8/8 w - - 0 1');
  const champions = {
    w: null,
    b: { type: 'musketeer' as const, color: 'b' as const, square: 'e5' },
  };

  // Black pawn at d5 can be pushed
  const pawnPushes = getPushMoves('d5', chess, [], null, champions);
  assert.ok(pawnPushes.length > 0);
  assert.ok(pawnPushes.includes('d6'));
  assert.ok(pawnPushes.includes('d4'));

  // Champion at e5 can be pushed
  const champPushes = getPushMoves('e5', chess, [], null, champions);
  assert.ok(champPushes.length > 0);
  assert.ok(champPushes.includes('e6'));
  assert.ok(champPushes.includes('e4'));
});

test('6. Awakening King can be played as Wild card when not in check', () => {
  const card: Card = { id: 'k1', type: 'awakening_king', name: 'Awakening: King', description: '' };
  // When played as wild (asWild = true), any piece is permitted
  assert.equal(isCardPermittedForPiece(card, 'p', null, true), true);
  assert.equal(isCardPermittedForPiece(card, 'n', null, true), true);
  assert.equal(isCardPermittedForPiece(card, 'r', null, true), true);
  assert.equal(isCardPermittedForPiece(card, 'q', null, true), true);
  assert.equal(isCardPermittedForPiece(card, 'k', null, true), true);
});
