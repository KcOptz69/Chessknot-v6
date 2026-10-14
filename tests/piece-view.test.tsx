import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {BoardViewerColor,pieceFacing,readPieceView} from '../src/context/PieceView.tsx';
import {V5Piece} from '../src/components/V5Art.tsx';
import {FrontierArt} from '../src/components/FrontierUI.tsx';
function markup(viewer:'w'|'b',node:React.ReactNode){return renderToStaticMarkup(<BoardViewerColor.Provider value={viewer}>{node}</BoardViewerColor.Provider>);}
test('3D is the default; a saved 2D choice is retained',()=>{
 assert.equal(readPieceView({getItem:()=>null}),'3d');assert.equal(readPieceView({getItem:()=> '2d'}),'2d');assert.equal(readPieceView({getItem:()=> '3d'}),'3d');assert.equal(readPieceView({getItem:()=> 'invalid'}),'3d');
});
test('opposing armies face each other from either board orientation',()=>{
 assert.equal(pieceFacing('w','w'),'rear');assert.equal(pieceFacing('b','w'),'front');assert.equal(pieceFacing('w','b'),'front');assert.equal(pieceFacing('b','b'),'rear');
});
test('board sprites change facing for standard and Champion pieces',()=>{
 assert.match(markup('w',<V5Piece type="n" color="w"/>),/rear-n-w.webp/);
 assert.match(markup('b',<V5Piece type="n" color="w"/>),/front-n-w.webp/);
 assert.match(markup('w',<V5Piece type="musketeer" color="b"/>),/front-musketeer-b.webp/);
 assert.match(markup('b',<V5Piece type="musketeer" color="b"/>),/rear-musketeer-b.webp/);
});
test('Awakened pieces keep their separate approved artwork',()=>{
 assert.match(markup('w',<V5Piece type="sp" color="w"/>),/rear-awakening_p-w.webp/);
 assert.match(markup('w',<V5Piece type="r" color="b" awakened/>),/front-awakening_r-b.webp/);
});
test('Boss always faces the viewer; controlled Golems follow their armies',()=>{
 for(const view of ['w','b'] as const){assert.match(markup(view,<FrontierArt type="boss"/>),/front-boss-neutral.webp/);assert.match(markup(view,<FrontierArt type="weakened"/>),/front-weakened-neutral.webp/);}
 assert.match(markup('w',<FrontierArt type="golem"/>),/rear-golem-w.webp/);
 assert.match(markup('w',<FrontierArt type="black_golem"/>),/front-golem-b.webp/);
});
test('cards and rulebook retain original 2D artwork outside the board',()=>{
 const rendered=renderToStaticMarkup(<V5Piece type="q" color="w"/>);assert.match(rendered,/pieces-solid-v5.png/);assert.doesNotMatch(rendered,/pieces-3d/);
});


test('every versioned sprite URL resolves to an included source asset',async()=>{
 const {pieceSpriteUrls}=await import('../src/context/pieceSpriteAssets.ts');
 const {existsSync}=await import('node:fs');const {fileURLToPath}=await import('node:url');
 assert.equal(Object.keys(pieceSpriteUrls).length,74);
 for(const value of Object.values(pieceSpriteUrls))assert.ok(existsSync(fileURLToPath(value)),value);
});
