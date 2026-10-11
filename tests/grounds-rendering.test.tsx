import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChessBoard} from '../src/components/ChessBoard.tsx';
import {ThemeProvider} from '../src/context/ThemeContext.tsx';
import {createInitialGameState} from '../src/utils/chessLogic.ts';
import {visibleGrounds} from '../src/utils/grounds.ts';
const s=createInitialGameState({treacherousGrounds:true});
s.grounds!.tiles={d4:'boost',e4:'gravity',e5:'defense',f4:'portal'};
s.grounds!.traps=[{id:'mine',type:'mine',owner:'w',square:'c3'}];
function render(color:'w'|'b') {
 const props:any={fen:s.fen,myColor:color,turn:'w',isMyTurn:color==='w',selectedCard:null,restrictedSquares:[],monolithSquare:null,lastMovedPiece:null,lastMovedSquare:null,isWildPowerUp:false,isMonolithPowerUp:false,champions:s.champions,grounds:visibleGrounds(s.grounds,color),groundNotice:'Both players received one tile power-up.',onDismissGroundNotice:()=>{}};
 return renderToStaticMarkup(<ThemeProvider><ChessBoard {...props}/></ThemeProvider>);
}
test('all four powered tile types are rendered for both players',()=>{
 for(const color of ['w','b'] as const){const html=render(color);for(const type of ['boost','gravity','defense','portal'])assert.ok(html.includes(`data-ground-type="${type}"`));}
});
test('tile reward notice is above the board with existing banner styling',()=>{
 const html=render('w');assert.ok(html.indexOf('board-ground-notice')<html.indexOf('id="chess-board"'));assert.ok(html.includes('Both players received one tile power-up.'));
});
test('opponent traps remain hidden while powered tiles are public',()=>{
 assert.ok(render('w').includes('Your traps at c3'));assert.ok(!render('b').includes('Your traps at c3'));
});
