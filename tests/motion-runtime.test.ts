import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionBatch } from '../src/motion/runtime';

let reduced = false;
const visibility = { hidden: false };
Object.assign(globalThis, { document: visibility, window: { matchMedia: () => ({ matches: reduced }) } });

test('reduced motion completes immediately without calling the animation API', () => {
  reduced = true;
  let cleaned = 0;
  new MotionBatch().animate({ animate: () => { throw Error('must not animate'); } } as any, [], 240, 0, () => cleaned++);
  assert.equal(cleaned, 1);
  reduced = false;
});
test('hidden tabs complete immediately', () => {
  visibility.hidden = true;
  let cleaned = 0;
  new MotionBatch().animate({ animate: () => { throw Error('must not animate'); } } as any, [], 240, 0, () => cleaned++);
  assert.equal(cleaned, 1);
  visibility.hidden = false;
});
test('cancelling restores visuals once even if the animation later resolves', async () => {
  let finish!: () => void, cleaned = 0, cancelled = 0;
  const batch = new MotionBatch();
  const finished = new Promise<void>(resolve => { finish = resolve; });
  batch.animate({ animate: () => ({ finished, cancel: () => cancelled++ }) } as any, [], 240, 0, () => cleaned++);
  batch.cancel(); batch.cancel(); finish();
  await finished;
  assert.equal(cleaned, 1);
  assert.equal(cancelled, 1);
});
test('failed browser animation restores the visual', () => {
  let cleaned = 0;
  new MotionBatch().animate({ animate: () => { throw Error('unsupported'); } } as any, [], 240, 0, () => cleaned++);
  assert.equal(cleaned, 1);
});
test('a stalled animation cannot keep its target hidden indefinitely', async () => {
  let cancelled = false;
  await new Promise<void>(resolve => {
    new MotionBatch().animate({ animate: () => ({ finished: new Promise(() => {}), cancel: () => { cancelled = true; } }) } as any, [], 1, 0, resolve);
  });
  assert.equal(cancelled, true);
});
