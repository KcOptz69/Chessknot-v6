import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
const port=39861, sockets=[];
const server=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(ws,pred){for(let i=0;i<500;i++){const n=ws.events.findIndex(pred);if(n>=0)return ws.events.splice(n,1)[0];await pause(15);}throw Error('Timed out '+logs)}
function send(ws,msg){ws.send(JSON.stringify(msg))}
async function join(id){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));send(ws,{type:'join_room',roomId:'REMATCHQA',playerId:id,playerName:id,mode:'online'});await wait(ws,m=>m.type==='room_state');return ws}
try{
for(let i=0;i<200&&!logs.includes('server running');i++)await pause(30);
const a=await join('Host'),b=await join('Guest');send(b,{type:'set_player_ready',isReady:true});await wait(a,m=>m.state?.players.Guest?.isReady);
const exp={shiftedParadigm:false,championsOfTheMonolith:false,theAwakening:false,treacherousGrounds:false};send(a,{type:'start_game',colorPreference:'w',clockConfig:{enabled:true,initialMinutes:3,incrementSeconds:2},expansions:exp});await wait(a,m=>m.state?.gameState.status==='playing');
send(a,{type:'restart_game'});await wait(a,m=>m.type==='error');
send(a,{type:'resign'});const ended=(await wait(a,m=>m.state?.gameState.status==='resigned')).state;
send(a,{type:'restart_game'});const pending=(await wait(a,m=>m.state?.rematchRequest)).state;assert.deepEqual(pending.gameState,ended.gameState);
send(a,{type:'respond_rematch',requestId:pending.rematchRequest.id,accept:true});await wait(a,m=>m.type==='error');
send(b,{type:'respond_rematch',requestId:'stale',accept:true});await wait(b,m=>m.type==='error');
send(b,{type:'respond_rematch',requestId:pending.rematchRequest.id,accept:false});const declined=(await wait(a,m=>m.state&&!m.state.rematchRequest&&m.state.gameState.status==='resigned')).state;assert.deepEqual(declined.gameState,ended.gameState);
send(a,{type:'restart_game'});const request=(await wait(a,m=>m.state?.rematchRequest)).state.rematchRequest;
send(b,{type:'respond_rematch',requestId:request.id,accept:true});const fresh=(await wait(a,m=>m.state?.gameState.status==='playing')).state;
assert.equal(fresh.gameState.turnNumber,1);assert.equal(fresh.players.Host.color,'w');assert.equal(fresh.players.Guest.color,'b');assert.deepEqual(fresh.gameState.expansions,exp);assert.equal(fresh.gameState.clock.initialMinutes,3);assert.equal(fresh.gameState.clock.incrementSeconds,2);assert.equal(fresh.gameState.clock.isRunning,true);assert.equal(fresh.rematchRequest,undefined);
console.log('PASS: rematch consent, stale/self acceptance rejection, decline integrity, configuration and sides retained.');
}finally{for(const s of sockets)s.close();server.kill()}
