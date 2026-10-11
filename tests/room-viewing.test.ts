import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInitialGameState} from '../src/utils/chessLogic.ts';
import {viewingGameState} from '../src/utils/roomViewing.ts';
import type {RoomPlayer} from '../src/types.ts';
test('ordinary spectators receive no private cards, trap locations, or private choice IDs',()=>{
 const s=createInitialGameState();s.grounds!.traps=[{id:'secret-w',owner:'w',type:'mine',square:'a3'},{id:'secret-b',owner:'b',type:'poison',square:'h6'}];
 s.boardHistory[0].grounds=structuredClone(s.grounds);s.pendingSwapDiscard={player:'w',newCardIds:['secret-card']};
 const before=JSON.stringify(s),view=viewingGameState(s,{id:'watch',name:'Watcher',color:'spectator',connected:true});
 assert.deepEqual(view.hands,{w:[],b:[]});assert.equal(view.deck.length,0);assert.equal(view.hiddenDeckCount,s.deck.length);assert.equal(view.handCounts?.w,s.hands.w.length);assert.equal(view.pendingSwapDiscard,null);
 assert.deepEqual(view.grounds?.traps,[]);assert.deepEqual(view.boardHistory[0].grounds?.traps,[]);assert.ok(!JSON.stringify(view).includes('secret-w'));assert.ok(!JSON.stringify(view).includes('secret-card'));assert.equal(JSON.stringify(s),before);
});
test('the Arbiter sees both hands and both trap sets without revealing deck order',()=>{
 const s=createInitialGameState();s.grounds!.traps=[{id:'secret',owner:'b',type:'mine',square:'e6'}];s.boardHistory[0].grounds=structuredClone(s.grounds);
 const a:RoomPlayer={id:'a',name:'Arbiter',color:'spectator',role:'arbiter',connected:true};const view=viewingGameState(s,a);
 assert.deepEqual(view.hands,s.hands);assert.deepEqual(view.grounds?.traps,s.grounds?.traps);assert.deepEqual(view.boardHistory[0].grounds?.traps,s.grounds?.traps);assert.equal(view.deck.length,0);
 const p=viewingGameState(s,{id:'w',name:'White',color:'w',connected:true});assert.deepEqual(p.grounds?.traps,[]);
});
test('notification dismissal affects only its viewer and only that alert instance',()=>{
 const s=createInitialGameState(),p:RoomPlayer={id:'v',name:'Viewer',color:'spectator',connected:true};s.passRedrawAlert={player:'w',count:1} as any;
 const signature=JSON.stringify(s.passRedrawAlert);assert.equal(viewingGameState(s,p,{passRedrawAlert:signature}).passRedrawAlert,null);assert.ok(viewingGameState(s,p).passRedrawAlert);assert.ok(s.passRedrawAlert);
 s.passRedrawAlert={player:'b',count:2} as any;assert.ok(viewingGameState(s,p,{passRedrawAlert:signature}).passRedrawAlert);
});
