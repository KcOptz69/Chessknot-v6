import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {createInitialGameState} from '../src/utils/chessLogic.ts';
import {planSummonMotion} from '../src/motion/plan.ts';
function pair(kind:'revive'|'soul'){
 const before=createInitialGameState({theAwakening:true});
 before.status='playing';before.historyLog=[{id:'start'} as any];before.pieceIds={a2:'original-pawn'};
 before.summoningCircles=[{id:'circle',owner:'w',square:'a3',remaining:0,createdTurn:1}];
 const after=structuredClone(before);const b=new Chess(after.fen);b.put({type:'p',color:'w'},'a3');after.fen=b.fen();after.pieceIds!.a3='new-piece';
 after.historyLog.unshift({id:'summon',actionType:kind==='soul'?'soul_release':'revive'} as any);after.lastMoveDetails={player:'w',actionType:kind==='soul'?'soul_release':'revive'};
 if(kind==='soul')after.soulSummons=[{id:'soul',owner:'w',pieceId:'new-piece',remaining:5,createdTurn:1}];else after.summoningCircles![0].finished=true;
 return{before,after};
}
for(const kind of ['revive','soul'] as const)test(`${kind} confirmed arrival animates once, not on repeated snapshots`,()=>{const{before,after}=pair(kind);assert.deepEqual(planSummonMotion(before,after),[{square:'a3',kind}]);assert.deepEqual(planSummonMotion(after,structuredClone(after)),[])});
test('declining Bishop revival and a summon removed by landing effects produce no arrival',()=>{const{before,after}=pair('revive');delete after.pieceIds!.a3;assert.deepEqual(planSummonMotion(before,after),[]);const soul=pair('soul');const b=new Chess(soul.after.fen);b.remove('a3');soul.after.fen=b.fen();assert.deepEqual(planSummonMotion(soul.before,soul.after),[])});
test('Clock restoration never plays the summoning arrival effect',()=>{const{before,after}=pair('soul');after.lastMoveDetails={player:'w',actionType:'clock'};assert.deepEqual(planSummonMotion(before,after),[])});
test('an existing Soul moving preserves its identity without being summoned again',()=>{const{after:before}=pair('soul');const after=structuredClone(before);after.historyLog.unshift({id:'move',actionType:'move'} as any);after.pieceIds!.a4=after.pieceIds!.a3;delete after.pieceIds!.a3;assert.deepEqual(planSummonMotion(before,after),[])});
