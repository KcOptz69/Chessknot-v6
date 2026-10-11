import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState,createCard,isCardPermittedForPiece,canPlayerEscapeCheck,createSafeChess} from '../src/utils/chessLogic.ts';
import {groundEvent} from '../src/utils/grounds.ts';
const harness=new URL('../.base-cards-handler-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/, '\nexport {handleGameAction};\n'));
const interval=globalThis.setInterval;globalThis.setInterval=(()=>0) as any;
let handleGameAction:any;try{({handleGameAction}=await import(harness.href));}finally{globalThis.setInterval=interval;unlinkSync(harness);}
function room(){const s=createInitialGameState({shiftedParadigm:false,championsOfTheMonolith:false,theAwakening:false,treacherousGrounds:false});s.status='playing';s.pieceIds={};return {gameState:s,players:{},lobbyConfig:{}} as any;}
function setup(){const r=room(),s=r.gameState;s.hands.w=['refresh','brick','pawn','knight','bishop'].map((t,i)=>createCard(t as any,i));s.deck=Array.from({length:8},(_,i)=>createCard('rook',100+i));s.discard=[];return r;}
test('base draw pool has 40 cards before random starting deals, plus four guaranteed Pawns',()=>{const s=room().gameState;const cards=[...s.deck,...s.hands.w,...s.hands.b];assert.equal(cards.length,44);assert.equal(s.deck.length,34);assert.equal(cards.filter(c=>c.type==='refresh').length,2);assert.equal(cards.filter(c=>c.type==='brick').length,1);assert.equal(cards.filter(c=>c.knownStartingPawnFor).length,4);});
test('Refresh discards Brick and whole hand, draws five, stays free, and preserves board/countdowns',()=>{const r=setup(),s=r.gameState,before=structuredClone(s),ids=s.hands.w.map(c=>c.id);handleGameAction(r,{type:'play_refresh',cardId:ids[0]},'w');assert.equal(s.hands.w.length,5);assert.ok(s.hands.w.every(c=>c.type==='rook'));assert.deepEqual(s.discard.map(c=>c.id),ids);assert.equal(s.deck.length,3);for(const key of ['fen','turn','turnNumber','clock','powerUps','pieceIds','awakenedRooks','soulSummons','boardHistory'])assert.deepEqual(s[key],before[key]);assert.equal(s.historyLog[0].actionType,'refresh');assert.match(s.historyLog[0].detail,/Discarded Brick/);});
for(const variant of ['opponent','spectator','joker','missing','wrong-type','lobby','pending-swap','pending-portal'])test(`invalid Refresh is atomic: ${variant}`,()=>{const r=setup(),s=r.gameState;let actor:any='w',id=s.hands.w[0].id;if(variant==='opponent')actor='b';if(variant==='spectator')actor='spectator';if(variant==='joker')s.jokerLocked.w=true;if(variant==='missing')id='missing';if(variant==='wrong-type')id=s.hands.w[2].id;if(variant==='lobby')s.status='lobby';if(variant==='pending-swap')s.pendingSwapDiscard={player:'w',newCardIds:[]};if(variant==='pending-portal')s.pendingPortal={player:'w',from:'a4',nextTurn:'b'};const before=structuredClone(s);handleGameAction(r,{type:'play_refresh',cardId:id},actor);assert.deepEqual(r.gameState,before);});
test('Refresh safely reshuffles when the draw pile is short without losing or duplicating cards',()=>{const r=setup(),s=r.gameState;s.deck=s.deck.slice(0,2);const ids=[...s.deck,...s.hands.w].map(c=>c.id).sort();handleGameAction(r,{type:'play_refresh',cardId:s.hands.w[0].id},'w');assert.equal(s.hands.w.length,5);assert.deepEqual([...s.deck,...s.discard,...s.hands.w].map(c=>c.id).sort(),ids);});
for(const type of ['brick','refresh'] as const)test(`${type} cannot be forged into a Wild or piece move`,()=>{const r=room(),s=r.gameState,card=createCard(type,1);s.hands.w=[card];assert.equal(isCardPermittedForPiece(card,'p',null,true),false);const before=structuredClone(s);handleGameAction(r,{type:'play_card_move',cardId:card.id,from:'a2',to:'a3',asWild:true},'w');assert.deepEqual(s,before);});
test('Joker discards Brick and gives exactly five temporary Wilds without spending a turn',()=>{const r=setup(),s=r.gameState;s.hands.w[0]=createCard('joker',90);const brick=s.hands.w[1].id,n=s.turnNumber;handleGameAction(r,{type:'play_joker',cardId:s.hands.w[0].id},'w');assert.equal(s.hands.w.length,5);assert.ok(s.hands.w.every(c=>c.isJokerWild));assert.ok(s.discard.some(c=>c.id===brick));assert.equal(s.turnNumber,n);assert.equal(s.turn,'w');assert.match(s.historyLog[0].detail,/Discarded Brick/);});
test('Redraw can discard Brick; malformed Redraw cannot discard or draw anything',()=>{const r=setup(),s=r.gameState,brick=s.hands.w[1].id;const before=structuredClone(s);handleGameAction(r,{type:'discard_redraw',cardIds:[brick,'missing']},'w');assert.deepEqual(s,before);handleGameAction(r,{type:'discard_redraw',cardIds:[brick]},'w');assert.ok(s.discard.some(c=>c.id===brick));assert.equal(s.turn,'b');assert.match(s.historyLog.find(e=>e.detail.includes('Discarded Brick'))!.detail,/Discarded Brick/);});
test('Draw & Swap permits discarding Brick',()=>{const r=setup(),s=r.gameState,brick=s.hands.w[1].id,other=s.hands.w[2].id;s.pendingSwapDiscard={player:'w',newCardIds:[]};handleGameAction(r,{type:'use_powerup_draw',discardCardIds:[brick,other]},'w');assert.ok(s.discard.some(c=>c.id===brick));assert.equal(s.pendingSwapDiscard,null);assert.match(s.historyLog[0].detail,/Discarded Brick/);});
test('activated trap metadata survives beyond the 30-event animation window, placement reveals no square',()=>{const r=room(),s=r.gameState;s.grounds={selected:['mine','poison'],charges:{w:{},b:{}},tiles:{},traps:[],poison:[],disarm:[],banished:[],portalUsed:{w:0,b:0},completedTurns:0,placementTurns:[],events:[]};groundEvent(s,'mine','Mine Trap triggered at a3.');const id=s.historyLog[0].id;for(let i=0;i<35;i++)groundEvent(s,'tile-place','White placed a Boost tile.');assert.ok(!s.grounds.events.some(e=>e.id===id));assert.equal(s.historyLog.find(e=>e.id===id)?.trapEventType,'mine');groundEvent(s,'trap-place','Black placed a trap.');assert.equal(s.historyLog[0].detail,'Black placed a trap.');assert.equal(s.historyLog[0].trapEventType,'trap-place');});

test('a usable Refresh is considered before declaring card-based checkmate; unusable draws do not evade mate',()=>{
 const r=room(),s=r.gameState;s.fen='4r2k/8/8/8/8/8/1B1P1P2/3RKR2 w - - 0 1';
 s.powerUps.w={draw:0,wild:0,monolith:0,vision:0};s.hands.w=[createCard('brick',4)];s.deck=[createCard('bishop',5)];s.discard=[];
 const chess=createSafeChess(s.fen);assert.equal(canPlayerEscapeCheck(chess,s,'w'),false);
 s.hands.w.push(createCard('refresh',6));const before=structuredClone(s);
 assert.equal(canPlayerEscapeCheck(chess,s,'w'),true);assert.deepEqual(s,before);
 s.deck=[createCard('pawn',7)];assert.equal(canPlayerEscapeCheck(chess,s,'w'),false);
});
test('Refresh generates one shared reshuffle event when deck is exhausted',()=>{
 const r=setup(),s=r.gameState;s.deck=s.deck.slice(0,2);
 handleGameAction(r,{type:'play_refresh',cardId:s.hands.w[0].id},'w');
 assert.equal(s.historyLog.filter(e=>e.actionType==='deck_refresh').length,1);
});

test('ordinary Awakening-as-Wild move is logged explicitly for opponent notices',()=>{
 const r=room(),s=r.gameState,c=createCard('awakening_queen',100);s.hands.w=[c];
 handleGameAction(r,{type:'play_card_move',cardId:c.id,from:'a2',to:'a3',asWild:true},'w');
 assert.match(s.historyLog.find(e=>e.cardName?.includes('Awakening: Queen'))!.cardName,/Played as Wild/);
 assert.ok(s.discard.some(x=>x.id===c.id));
});
