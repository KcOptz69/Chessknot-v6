import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState,createSafeChess} from '../src/utils/chessLogic.ts';
const harness=new URL('../.monolith-pawn-handler-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/, '\nexport { handleGameAction };\n'));
const interval=globalThis.setInterval;
globalThis.setInterval=(()=>0) as any;
let handleGameAction:any;
try {({handleGameAction}=await import(harness.href));} finally {globalThis.setInterval=interval;unlinkSync(harness);}
for(const color of ['w','b'] as const) {
 test(`${color}: Monolith after a double pawn move cannot spawn or recolor a pawn`,()=>{
  const state=createInitialGameState();state.status='playing';state.turn=color;state.grounds=undefined; // This regression isolates Monolith from random Portal placement.
  if(color==='b')state.fen=state.fen.replace(' w ',' b ');
  const from=color==='w'?'f2':'f7',to=color==='w'?'f4':'f5',other=color==='w'?'b':'w';
  state.hands[color]=[{id:'pawn-card',type:'pawn',name:'Pawn',description:'Move pawn'}];state.powerUps[other].monolith=1;
  const room:any={gameState:state,lobbyConfig:{},players:{}};
  handleGameAction(room,{type:'play_card_move',cardId:'pawn-card',from,to},color);
  const position=room.gameState.fen.split(' ')[0];
  handleGameAction(room,{type:'play_monolith',isPowerUp:true,cardId:null,targetSquare:color==='w'?'f5':'f4'},other);
  assert.equal(room.gameState.monolithSquare,color==='w'?'f5':'f4');
  assert.equal(room.gameState.fen.split(' ')[0],position);
  const board=createSafeChess(room.gameState.fen);board.fen();
  assert.equal(board.get(from as any),undefined);
  assert.equal(board.get(to as any)?.color,color);
  assert.equal(board.board().flat().filter(p=>p?.type==='p').length,16);
  assert.equal(room.gameState.fen.split(' ')[3],'-');
 });
}
test('valid en-passant remains available on the immediate next turn',()=>{
 const board=createSafeChess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
 assert.ok(board.moves({square:'e5',verbose:true}).some(move=>move.to==='d6'&&move.flags.includes('e')));
 board.move({from:'e5',to:'d6'});
 assert.equal(board.get('d5'),undefined);
 assert.equal(board.get('d6')?.color,'w');
});
