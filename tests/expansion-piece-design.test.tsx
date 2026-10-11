import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PieceIcon } from '../src/components/PieceIcons.tsx';
const expansions=['berserker','musketeer','summoner','ninja','sp','sn'] as const;
for(const type of expansions) for(const color of ['w','b'] as const) {
  test(`${type} ${color}: SVG uses correct ownership palette and shared base`,()=>{
    const svg=renderToStaticMarkup(<PieceIcon type={type} color={color} className="piece-test" />);
    assert.ok(svg.includes('role="img"'));
    assert.ok(svg.includes(`aria-label="${color==='w'?'White':'Black'} `));
    assert.ok(svg.includes(type==='sp'?'/art/awakened-approved-v5.webp':type==='sn'?'/art/awakened-v5.png':'/art/pieces-solid-v5.png'));
    assert.ok(!svg.includes('NaN'));
  });
}
test('Monolith is neutral and identical for either player',()=>{
  assert.equal(renderToStaticMarkup(<PieceIcon type="m" color="w" />),renderToStaticMarkup(<PieceIcon type="m" color="b" />));
});
for(const type of ['p','n','b','r','q','k'] as const) for(const color of ['w','b'] as const) {
 test(`${type} ${color}: Awakening uses approved distinct artwork`,()=>{
  const svg=renderToStaticMarkup(<PieceIcon type={type} color={color} awakened />);
  assert.ok(svg.includes(['p','b','q','k'].includes(type)?'/art/awakened-approved-v5.webp':'/art/awakened-v5.png'));
  assert.notEqual(svg,renderToStaticMarkup(<PieceIcon type={type} color={color} />));
 });
}
test('different owners and Champions use distinct sprite cells',()=>{
 const render=(type:any,color:any)=>renderToStaticMarkup(<PieceIcon type={type} color={color}/>);
 assert.notEqual(render('n','w'),render('n','b'));
 assert.notEqual(render('n','w'),render('berserker','w'));
});
