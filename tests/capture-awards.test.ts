import assert from 'node:assert/strict';
import {test} from 'node:test';
import {awardCaptureRefresh,createInitialGameState,getPieceCapturePoints} from '../src/utils/chessLogic.ts';
import {captureAwardNotices} from '../src/components/CardEffectNotifications.tsx';
test('threshold awards carry surplus, keep distinct IDs and target only the earning player',()=>{
 const s=createInitialGameState();s.powerUpProgress={w:4,b:0};assert.equal(awardCaptureRefresh(s,'w',9).stacksEarned,2);assert.equal(s.powerUpProgress.w,3);assert.equal(s.powerUpAwards!.length,2);assert.equal(captureAwardNotices(s.powerUpAwards,'b').length,0);assert.equal(captureAwardNotices(s.powerUpAwards,undefined).length,0);const notices=captureAwardNotices(s.powerUpAwards,'w');assert.equal(notices.length,2);assert.equal(new Set(notices.map(n=>n.id)).size,2);assert.match(notices[0].title,/Power-up earned/);assert.match(notices[0].detail,/charge/);
 const previous=structuredClone(s);awardCaptureRefresh(s,'b',0);assert.deepEqual(s,previous);
});
test('Vision rewards are named Bind after Eye acquisition',()=>{
 const s=createInitialGameState();s.powerUps.w={draw:3,wild:3,monolith:3,vision:0};s.frontier!.inventories.w=[{id:'eye',type:'eye',remaining:-1,acquiredTurn:1}];awardCaptureRefresh(s,'w',5);assert.equal(s.powerUpAwards![0].name,'Bind');assert.equal(s.powerUpAwards![0].type,'vision');
});
test('capture values cover awakened units, Champions and controlled Golems',()=>{
 for(const [piece,points] of [['p',1],['sp',1],['n',3],['sn',3],['b',3],['r',5],['q',9],['golem',10],['berserker',5],['musketeer',5],['summoner',5],['ninja',5],['k',0]] as const)assert.equal(getPieceCapturePoints(piece),points);
});
