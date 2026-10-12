import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState,createCard,createSafeChess,canPlayerEscapeCheck} from '../src/utils/chessLogic.ts';
import {initialFrontier,expandFrontier,addItem,frontierKingSafe,frontierEscape} from '../src/utils/frontier.ts';
const harness=new URL('../.check-actions-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/,'\nexport {handleGameAction};\n'));
const interval=globalThis.setInterval;globalThis.setInterval=(()=>0) as any;
let handleGameAction:any;
try{({handleGameAction}=await import(harness.href));}finally{globalThis.setInterval=interval;unlinkSync(harness);}
function setup(expanded:boolean,fen='1qr1r2k/8/8/8/8/8/8/QR2K3 w - - 0 1') {
 const s=createInitialGameState({arcaneFrontier:true});s.status='playing';s.fen=fen;s.grounds=undefined;s.frontier=initialFrontier();
 if(expanded)expandFrontier(s,()=>.2);
 s.frontier!.ready=true;s.frontier!.pois={};delete s.frontier!.boss;
 s.hands={w:[],b:[]};s.powerUps.w={wild:0,vision:1,draw:1,monolith:0};s.clock.enabled=false;
 s.restrictedSquares=['d1','f1','d2','f2'];
 return {gameState:s,lobbyConfig:{},players:{}} as any;
}
function action(r:any,msg:any){const replies:any[]=[];handleGameAction(r,msg,'w',{readyState:1,send:(v:string)=>replies.push(JSON.parse(v))});return replies;}
for(const expanded of [false,true]) {
 test(`free Vision and Exchange remain available in check (${expanded?'8x12':'8x8'})`,()=>{
  const r=setup(expanded);assert.equal(frontierKingSafe(r.gameState,'w'),false);const turn=r.gameState.turnNumber,fen=r.gameState.fen;
  assert.deepEqual(action(r,{type:'use_powerup_vision'}),[]);assert.equal(r.gameState.visionActive.w,true);
  assert.deepEqual(action(r,{type:'use_powerup_draw'}),[]);assert.equal(r.gameState.pendingSwapDiscard.player,'w');
  const ids=r.gameState.hands.w.slice(-2).map((c:any)=>c.id);
  assert.deepEqual(action(r,{type:'use_powerup_draw',discardCardIds:ids}),[]);
  assert.equal(r.gameState.pendingSwapDiscard,null);assert.equal(r.gameState.turnNumber,turn);assert.equal(r.gameState.fen,fen);
 });
 test(`defensive Champion deployment counts as escape and blocks check (${expanded})`,()=>{
  const r=setup(expanded),s=r.gameState,card=createCard('champion',1);s.hands.w=[card];s.powerUps.w.draw=0;
  assert.equal(expanded?frontierEscape(s,'w'):canPlayerEscapeCheck(createSafeChess(s.fen),s,'w'),true);
  assert.deepEqual(action(r,{type:'play_champion_deploy',cardId:card.id,targetSquare:'e2',championType:'ninja'}),[]);
  assert.equal(r.gameState.champions.w.square,'e2');assert.equal(frontierKingSafe(r.gameState,'w'),true);
 });
 test(`Monolith blocks check and invalid placement is atomic (${expanded})`,()=>{
  const r=setup(expanded),card=createCard('monolith',2);r.gameState.hands.w=[card];const before=JSON.stringify(r.gameState);
  assert.ok(action(r,{type:'play_monolith',cardId:card.id,targetSquare:'a2'}).length);assert.equal(JSON.stringify(r.gameState),before);
  assert.deepEqual(action(r,{type:'play_monolith',cardId:card.id,targetSquare:'e2'}),[]);assert.equal(frontierKingSafe(r.gameState,'w'),true);
 });
 for(const item of ['banner','core'] as const)test(`${item} summon can escape check (${expanded})`,()=>{
  const fen=item==='core'?'1qr4k/8/8/8/8/1QR5/8/r6K w - - 0 1':undefined;
  const r=setup(expanded,fen);r.gameState.powerUps.w.draw=0;addItem(r.gameState,'w',item);
  assert.equal(frontierKingSafe(r.gameState,'w'),false);
  assert.equal(expanded?frontierEscape(r.gameState,'w'):canPlayerEscapeCheck(createSafeChess(r.gameState.fen),r.gameState,'w'),true);
  assert.deepEqual(action(r,{type:'frontier_item',item,to:item==='core'?'e1':'e2'}),[]);assert.equal(frontierKingSafe(r.gameState,'w'),true);
 });
 test(`Soul Release blocks check and is recognized as an escape (${expanded})`,()=>{
  const r=setup(expanded),s=r.gameState,b=createSafeChess(s.fen);b.remove('a1');b.put({type:'q',color:'w'},'d3');s.fen=b.fen();s.pieceIds={d3:'queen'};
  const card={...createCard('soul_release',3),soul:{queenId:'queen',piece:{type:'n',color:'b' as const}}};s.hands.w=[card];s.powerUps.w.draw=0;
  assert.equal(expanded?frontierEscape(s,'w'):canPlayerEscapeCheck(createSafeChess(s.fen),s,'w'),true);
  assert.deepEqual(action(r,{type:'play_soul_release',cardId:card.id,targetSquare:'e2'}),[]);assert.equal(frontierKingSafe(r.gameState,'w'),true);
 });
 test(`invalid Champion deployment in check consumes nothing (${expanded})`,()=>{
  const r=setup(expanded),card=createCard('champion',4);r.gameState.hands.w=[card];const before=JSON.stringify(r.gameState);
  assert.ok(action(r,{type:'play_champion_deploy',cardId:card.id,targetSquare:'a2'}).length);assert.equal(JSON.stringify(r.gameState),before);
 });
}
for(const type of ['play_joker','play_static','play_beacon'] as const)test(`${type} remains a free action in check on expanded board`,()=>{
 const r=setup(true),s=r.gameState,ct=type.slice(5) as any,card=createCard(ct,44);s.hands.w=[card];s.monolithSquare='a4';
 const turn=s.turnNumber;assert.equal(frontierKingSafe(s,'w'),false);
 assert.deepEqual(action(r,{type,cardId:card.id}),[]);assert.equal(r.gameState.turnNumber,turn);assert.equal(r.gameState.turn,'w');
 assert.equal(frontierKingSafe(r.gameState,'w'),false);
});
test('Lens and Bind are valid free actions while checked',()=>{
 const r=setup(true),s=r.gameState,card=createCard('pawn',45);s.hands.w=[card];addItem(s,'w','lens');addItem(s,'w','eye');
 const bound=createCard('monolith',46);s.hands.b=[bound];const turn=s.turnNumber;
 assert.deepEqual(action(r,{type:'frontier_item',item:'lens',cardId:card.id}),[]);
 assert.deepEqual(action(r,{type:'frontier_bind',targetCardId:bound.id}),[]);
 assert.equal(r.gameState.frontier.bind.cardId,bound.id);assert.equal(r.gameState.turnNumber,turn);assert.equal(frontierKingSafe(r.gameState,'w'),false);
});
test('a summon that cannot resolve double check is rejected without consuming its item',()=>{
 const r=setup(true,'1qr1r2k/8/8/8/7b/8/8/QR2K3 w - - 0 1');addItem(r.gameState,'w','banner');const before=JSON.stringify(r.gameState);
 assert.ok(action(r,{type:'frontier_item',item:'banner',to:'e2'}).length);assert.equal(JSON.stringify(r.gameState),before);
});
