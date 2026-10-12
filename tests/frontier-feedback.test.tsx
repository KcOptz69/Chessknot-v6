import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState,createCard,awardCaptureRefresh} from '../src/utils/chessLogic.ts';
import {expandFrontier,initialFrontier,addItem,frontierNotice} from '../src/utils/frontier.ts';
import {frontierRewardEvents} from '../src/components/FrontierUI.tsx';
import {fittedCardFont} from '../src/components/CardFaceLabel.tsx';
const harness=new URL('../.feedback-handler-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/,'\nexport {handleGameAction};\n'));
const timer=globalThis.setInterval;globalThis.setInterval=(()=>0) as any;let handleGameAction:any;
try{({handleGameAction}=await import(harness.href));}finally{globalThis.setInterval=timer;unlinkSync(harness);}
function room(){const s=createInitialGameState();s.status='playing';s.grounds=undefined;s.fen='4k1q1/7r/8/8/8/8/R7/1QR1K3 w - - 0 1';s.frontier=initialFrontier();expandFrontier(s);s.frontier!.ready=true;s.frontier!.pois={};delete s.frontier!.boss;s.hands.w=[];s.hands.b=[];s.clock.enabled=false;return {gameState:s,lobbyConfig:{},players:{}} as any;}
test('first expanded snapshot retains recent item rewards and never repeats the same notice',()=>{
 const s=room().gameState;addItem(s,'w','wings');const seen=new Set<string>();const events=frontierRewardEvents(s,seen,true);assert.equal(events.length,1);assert.equal(events[0].item,'wings');assert.equal(frontierRewardEvents(s,seen).length,0);
 const otherSeen=new Set<string>();assert.equal(frontierRewardEvents(s,otherSeen,true).length,1);
});
test('reward notices survive event-window truncation using persistent match logs',()=>{
 const s=room().gameState;frontierNotice(s,'drop','Golem Core dropped at cX.','cX',{item:'core'});s.frontier.events=[];const events=frontierRewardEvents(s,new Set<string>());assert.equal(events.length,1);assert.equal(events[0].item,'core');assert.equal(events[0].square,'cX');assert.equal(s.historyLog[0].cardName,'Golem Core');
});
test('fresh drops are not duplicated by history fallback and old reconnect rewards stay dismissed',()=>{
 const s=room().gameState;addItem(s,'b','eye');assert.equal(frontierRewardEvents(s,new Set<string>()).length,1);for(const log of s.historyLog)log.timestamp=1;assert.equal(frontierRewardEvents(s,new Set<string>(),true,50000).length,0);
});
test('expanded match badges identify the card, power-up and item actually used',()=>{
 for(const type of ['card','power','item']){const r=room();let expected:string,msg:any;
 if(type==='card'){const card=createCard('rook',501);r.gameState.hands.w=[card];expected=card.name;msg={type:'play_card_move',cardId:card.id,from:'a2',to:'a3'};}
 else if(type==='power'){expected='Wild Move';msg={type:'use_powerup_wild_move',from:'a2',to:'a3'};}
 else{addItem(r.gameState,'w','star');expected='Wishing Star';msg={type:'frontier_item',item:'star',from:'a2',to:'a3'};}
 handleGameAction(r,msg,'w');const log=r.gameState.historyLog.find((e:any)=>e.frontierEvent?.kind===(type==='item'?'item':'move'));assert.ok(log);assert.equal(log.cardName,expected);assert.equal(log.turn,'w');assert.notEqual(log.cardName,'Arcane Frontier');
 }
});
test('each five-point power-up reward has exactly one named log entry',()=>{
 const s=room().gameState;const result=awardCaptureRefresh(s,'b',12);assert.equal(result.refreshed.length,2);const logs=s.historyLog.filter((e:any)=>e.actionType==='powerup_refresh');assert.equal(logs.length,2);assert.ok(logs.every((e:any)=>e.turn==='b'&&e.cardName!=='Tactical Power-Up Refresh'&&e.detail.includes('five capture points')));assert.equal(s.powerUpProgress.b,2);
});
test('native capture rewards are logged once after legacy per-action logging is removed',()=>{
 const r=room();r.gameState.frontier.expanded=false;r.gameState.fen='4k3/7r/8/8/r7/8/R7/1Q2K3 w - - 0 1';const card=createCard('rook',551);r.gameState.hands.w=[card];handleGameAction(r,{type:'play_card_move',cardId:card.id,from:'a2',to:'a4'},'w');assert.equal(r.gameState.historyLog.filter((e:any)=>e.actionType==='powerup_refresh').length,1);
});
test('card label scaling fits both width and height without enlarging short names',()=>{
 for(const [width,height,textWidth,textHeight] of [[54,9,92,12],[36,8,115,12],[72,10,54,9]]){const font=fittedCardFont(12,width,height,textWidth,textHeight);assert.ok(textWidth*font/12<=width);assert.ok(textHeight*font/12<=height);assert.ok(font<=12);}
 assert.equal(fittedCardFont(12,100,20,30,10),12);
});

test('item reward events are shown once even when the same snapshot is received again',()=>{
 const s=room().gameState;addItem(s,'w','lens');addItem(s,'w','eye');
 const seen=new Set<string>();assert.equal(frontierRewardEvents(s,seen).length,2);
 assert.equal(frontierRewardEvents(structuredClone(s),seen).length,0);
});
