import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39851;
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const sockets=[];
async function wait(ws,pred){const end=Date.now()+8000;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await pause(15);}throw Error('Timed out: '+logs);}
async function connect(id,token){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId:'RESUME',playerId:id,playerName:id,mode:'online',resumeToken:token}));return ws;}
const send=(w,m)=>w.send(JSON.stringify(m));
try{
 for(let i=0;i<100&&!logs.includes('Card Chess server running');i++){await pause(40);if(logs.includes('server running'))break;}
 const a=await connect('Alice');const ca=await wait(a,m=>m.type==='session_credentials');await wait(a,m=>m.type==='room_state');
 const b=await connect('Bob');await wait(b,m=>m.type==='session_credentials');await wait(b,m=>m.type==='room_state');
 send(b,{type:'set_player_ready',isReady:true});await wait(a,m=>m.state?.players.Bob?.isReady);
 send(a,{type:'start_game',colorPreference:'w',clockConfig:{enabled:true,initialMinutes:5,incrementSeconds:0}});await wait(a,m=>m.state?.gameState.status==='playing');
 const viewer=await connect('Viewer');await wait(viewer,m=>m.type==='room_state');
 b.events=[];viewer.events=[];a.close();await once(a,'close');
 const disconnected=await wait(b,m=>m.state?.recovery?.length===1);
 assert.equal(disconnected.state.gameState.clock.isRunning,false);const code=disconnected.state.recovery[0].code;assert.ok(code);assert.match(code,/^[A-F0-9]{4}$/);assert.ok(disconnected.state.recovery[0].deadline>Date.now()+290000);
 const hidden=await wait(viewer,m=>m.state?.recovery?.length===1);assert.equal(hidden.state.recovery[0].code,undefined);
 send(b,{type:'pass_turn'});assert.match((await wait(b,m=>m.type==='error')).message,/paused/);
 const resumed=await connect('Alice',ca.resumeToken);await wait(resumed,m=>m.type==='session_credentials');const restored=await wait(resumed,m=>m.state?.gameState.status==='playing');assert.equal(restored.yourColor,'w');assert.equal(restored.state.recovery.length,0);assert.equal(restored.state.gameState.clock.isRunning,true);
 b.events=[];resumed.close();await once(resumed,'close');await wait(b,m=>m.state?.recovery?.length===1);
 viewer.events=[];send(viewer,{type:'recover_seat',roomId:'RESUME',recoveryCode:code});const recoveredCredential=await wait(viewer,m=>m.type==='session_credentials');assert.equal(recoveredCredential.playerId,'Alice');const cross=await wait(viewer,m=>m.yourColor==='w');assert.equal(cross.state.recovery.length,0);assert.equal(cross.state.gameState.turnNumber,1);
 console.log('PASS: disconnect pauses clock; five-minute allowance; opponent-only code; blocked gameplay; same-browser token resume; other-device code resume preserves seat and state.');
}finally{for(const w of sockets)w.close();child.kill();await once(child,'exit').catch(()=>{});}
