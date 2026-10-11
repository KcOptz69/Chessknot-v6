import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CardHand } from '../src/components/CardHand.tsx';
import { OpponentHand } from '../src/components/OpponentHand.tsx';
import { ThemeProvider } from '../src/context/ThemeContext.tsx';
const hand = Array.from({length:5},(_,i)=>({id:`test${i}`,name:`Knight ${i}`,type:'knight' as const,description:`Description ${i}`}));
function cards(selectedCardId: string | null) {
  return renderToStaticMarkup(<ThemeProvider><CardHand hand={hand} selectedCardId={selectedCardId}
    onSelectCard={()=>{}} isMyTurn={true} playerColor="w" lastMovedPiece={null} /></ThemeProvider>);
}
test('hand renders five icon/name tiles without inline descriptions',()=>{
  const html=cards(null);
  assert.equal((html.match(/data-card-id=/g)||[]).length,5);
  assert.ok(!html.includes('Description 0'));
  assert.ok(html.includes('compact-hand-card'));
});
test('selected card description appears below the grid',()=>{
  const html=cards('test0');
  const description = html.indexOf('Description 0');
  assert.ok(description>html.lastIndexOf('data-card-id='));
});
test('opponent card names are visible only while Vision is active',()=>{
  const render=(reveal:boolean)=>renderToStaticMarkup(<OpponentHand hand={hand} isVisionActive={reveal} opponentName="Black" />);
  assert.ok(!render(false).includes('Knight 0'));
  assert.ok(!render(false).includes("Black&#x27;s Hand"));
  assert.ok(render(false).includes('Power-ups'));
  assert.ok(!render(false).includes('Draw ×'));
  assert.ok(render(true).includes('Knight 0'));
  assert.ok(render(true).includes('Revealed cards'));
});
test('selected hand keeps Deselect without the duplicate clear action',()=>{
 const html=cards('test0');assert.ok(html.includes('Deselect'));assert.ok(!html.includes('Clear Selected Card'));
});
