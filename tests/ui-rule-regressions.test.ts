import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInitialGameState,createSafeChess,evaluateGameEnd,getLegalMovesForPiece} from '../src/utils/chessLogic.ts';
import {capturedInAction} from '../src/utils/captureLedger.ts';
test('Champion material prevents an incorrect low-army victory',()=>{
 const s=createInitialGameState();s.status='playing';s.fen='r3k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1';s.champions.b={type:'berserker',color:'b',square:'d7'};
 const result=evaluateGameEnd(createSafeChess(s.fen),s);assert.equal(result.blackPoints,10);assert.notEqual(result.status,'points_win');
});
test('UI legal moves include King exception but exclude a second ordinary capture',()=>{
 const b=createSafeChess('4k3/8/8/8/4R2p/8/8/4K3 w - - 0 1');
 const moves=getLegalMovesForPiece('e4',b,[],null,[],[],null,null,{w:null,b:null},[{square:'e4',color:'w',turnsRemaining:3,hasCaptured:true}]);
 assert.ok(moves.includes('e8'));assert.ok(!moves.includes('h4'));
});
test('captured Super Pawn uses the lost square, not another pawn of the same color',()=>{
 const s=createInitialGameState();const before={...s,superPawns:['a7']};const board=createSafeChess(s.fen);board.remove('a7');const after={...s,fen:board.fen()};assert.deepEqual(capturedInAction(before,after,'w'),[{type:'sp',color:'b'}]);
});
test('repositioning an enemy piece does not create a capture record',()=>{
 const s=createInitialGameState(),board=createSafeChess(s.fen);board.remove('a7');board.put({type:'p',color:'b'},'a5');assert.deepEqual(capturedInAction(s,{...s,fen:board.fen()},'w'),[]);
});
