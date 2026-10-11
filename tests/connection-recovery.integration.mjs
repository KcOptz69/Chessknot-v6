import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39873;
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms)),sockets=[];
async function wait(ws,pred,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await pause(10);}throw Error('Timed out: '+logs);}
async function join(id,token,roomId='STABILITY'){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('error',()=>{});ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId,playerId:id,playerName:id,mode:'online',resumeToken:token}));const credentials=await wait(ws,m=>m.type==='session_credentials');ws.token=credentials.resumeToken;ws.initial=await wait(ws,m=>m.type==='room_state');return ws;}
const send=(ws,msg)=>ws.send(JSON.stringify(msg));
try{
 for(let i=0;i<150&&!logs.includes('server running');i++)await pause(30);
 let host=await join('Alice'),guest=await join('Bob');
 send(guest,{type:'set_player_ready',isReady:true});await wait(host,m=>m.state?.players.Bob?.isReady===true);guest.events=[];
 const hostToken=host.token;host.terminate();await once(host,'close');
 const dropped=await wait(guest,m=>m.state?.players.Alice?.connected===false);
 assert.equal(dropped.state.lobbyConfig.hostId,'Alice');assert.equal(dropped.state.players.Bob.isReady,true);
 host=await join('Alice',hostToken);assert.equal(host.initial.yourColor,'w');assert.equal(host.initial.state.lobbyConfig.hostId,'Alice');assert.equal(host.initial.state.players.Bob.isReady,true);
 console.log('PASS: temporary lobby disconnect retains host, color, credentials and readiness.');
 send(host,{type:'start_game',colorPreference:'w',clockConfig:{enabled:true,initialMinutes:5,incrementSeconds:0}});const begun=await wait(host,m=>m.state?.gameState.status==='playing');await wait(guest,m=>m.state?.gameState.status==='playing');
 const fen=begun.state.gameState.fen;const guestToken=guest.token;host.events=[];guest.terminate();await once(guest,'close');
 const paused=await wait(host,m=>m.state?.players.Bob?.connected===false);assert.equal(paused.state.gameState.clock.isRunning,false);assert.equal(paused.state.gameState.fen,fen);assert.equal(paused.state.recovery.length,1);
 guest=await join('Bob',guestToken);assert.equal(guest.initial.yourColor,'b');assert.equal(guest.initial.state.gameState.fen,fen);assert.equal(guest.initial.state.gameState.clock.isRunning,true);assert.equal(guest.initial.state.recovery.length,0);
 console.log('PASS: active-match reconnect restores the same board and seat; clock pauses and resumes.');
 const restored=await wait(host,m=>m.state?.players.Bob?.connected===true&&m.state?.gameState.status==='playing');
 const card=restored.state.gameState.hands.w.find(c=>c.type==='pawn');host.events=[];guest.events=[];send(host,{type:'play_card_move',cardId:card.id,from:'e2',to:'e3'});
 const a=await wait(host,m=>m.state?.gameState.turn==='b'),b=await wait(guest,m=>m.state?.gameState.turn==='b');assert.equal(a.state.gameState.fen,b.state.gameState.fen);
 console.log('PASS: both players receive the same successful move after recovery.');
 const bad=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(bad);bad.on('error',()=>{});await once(bad,'open');const closed=once(bad,'close');bad._socket.write(Buffer.from([0x81,0x00]));await closed;
 assert.equal(child.exitCode,null);assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status,200);
 host.events=[];send(host,{type:'ping'});await wait(host,m=>m.type==='pong');console.log('PASS: malformed transport is isolated; server and other players stay connected.');
 const expiryHost=await join('ExpireHost',undefined,'EXPIRY'),expiryGuest=await join('ExpireGuest',undefined,'EXPIRY');expiryGuest.events=[];
 expiryHost.terminate();await once(expiryHost,'close');await wait(expiryGuest,m=>m.state?.players.ExpireHost?.connected===false);
 const handoff=await wait(expiryGuest,m=>m.state?.lobbyConfig.hostId==='ExpireGuest',40000);assert.equal(handoff.state.players.ExpireHost,undefined);console.log('PASS: lobby grace expires and transfers hosting after 30 seconds.');
}finally{for(const ws of sockets)ws.terminate();child.kill();await once(child,'exit').catch(()=>{});}
