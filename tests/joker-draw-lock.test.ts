import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState} from '../src/utils/chessLogic.ts';
const harness=new URL('../.joker-handler-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/, '\nexport { handleGameAction };\n'));
const interval=globalThis.setInterval;
globalThis.setInterval=(()=>0) as any;
let handleGameAction:any;
try {({handleGameAction}=await import(harness.href));} finally {globalThis.setInterval=interval;unlinkSync(harness);}
for(const color of ['w','b'] as const)for(const message of [{type:'start_powerup_draw'},{type:'use_powerup_draw'},{type:'use_powerup_draw',discardCardIds:['one','two']},{type:'discard_redraw',cardIds:['one']}]) {
 test(`${color}: Joker lock rejects ${message.type} without changing state`,()=>{
  const state=createInitialGameState();state.status='playing';state.turn=color;state.jokerLocked[color]=true;state.powerUps[color].draw=2;
  state.hands[color]=['one','two'].map(id=>({id,type:'wild',name:'Joker Wild',description:'Wild',isJokerWild:true}));
  const room:any={gameState:state,lobbyConfig:{},players:{}};const before=structuredClone(state);
  handleGameAction(room,message,color);assert.deepEqual(room.gameState,before);
 });
}
