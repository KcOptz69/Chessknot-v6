import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Execute the actual click-handler entry, through its inspection/turn guards.
// Falling through means the existing action handlers receive the target click.
const source = readFileSync(new URL('../src/components/ChessBoard.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    // Check if clicked a champion square');
const end = source.indexOf('    // 1. MONOLITH PLACEMENT MODE', start);
assert.ok(start >= 0 && end > start);
const entry = source.slice(start, end);
function route(overrides = {}) {
  let inspected = false;
  const state = {
    champions: { w: null, b: { square: 'd5', color: 'b', type: 'berserker' } },
    isMyTurn: true, turn: 'w', myChampion: { square: 'a1', color: 'w' },
    selectedSquare: 'd1', awaitingKnightSecondMove: false,
    validDestinations: ['d5'], selectedCard: { type: 'rook' },
    championUltimateTargets: [], inspectedChampionSquare: null,
    setInspectedChampionSquare: () => { inspected = true; },
    ...overrides,
  };
  const fn = new Function(...Object.keys(state), 'square', entry + '\nreturn "action";');
  return { result: fn(...Object.values(state), 'd5'), inspected };
}
for (const card of ['rook', 'bishop', 'knight', 'queen', 'pawn', 'wild', 'awakening_rook', 'awakening_bishop', 'awakening_queen', 'awakening_king']) {
  test(`${card}: legal Champion target reaches action handling`, () => {
    assert.deepEqual(route({ selectedCard: { type: card } }), { result: 'action', inspected: false });
  });
}
test('King without a card can target a Champion', () => {
  assert.equal(route({ selectedCard: null }).result, 'action');
});
test('capture works without a friendly Champion', () => {
  assert.equal(route({ myChampion: null }).result, 'action');
});
test('staged second Knight jump reaches its handler', () => {
  assert.equal(route({ selectedSquare: null, awaitingKnightSecondMove: true }).result, 'action');
});
test('Champion ultimate target reaches its handler', () => {
  assert.equal(route({ selectedSquare: null, selectedCard: { type: 'champion' }, championUltimateTargets: ['d5'] }).result, 'action');
});
test('illegal target opens inspection without dispatching an action', () => {
  assert.deepEqual(route({ validDestinations: [] }), { result: undefined, inspected: true });
});
test('unselected Champion opens inspection', () => {
  assert.deepEqual(route({ selectedSquare: null }), { result: undefined, inspected: true });
});
test('spectator or out-of-turn click only inspects', () => {
  assert.deepEqual(route({ isMyTurn: false }), { result: undefined, inspected: true });
});
test('Black can target White Champion', () => {
  assert.equal(route({ turn: 'b', champions: { w: { square: 'd5', color: 'w' }, b: null } }).result, 'action');
});
