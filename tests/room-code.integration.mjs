import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39852;
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const sockets=[];
async function wait(ws,pred){const end=Date.now()+8000;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await pause(15);}throw Error('Timed out: '+logs);}
async function connect(id,token){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId:'RESUME',playerId:id,playerName:id,mode:'online',resumeToken:token}));return ws;}
const send=(w,m)=>w.send(JSON.stringify(m));
try{
 for(let i=0;i<100&&!logs.includes('server running');i++)await pause(40);
 const host=await connect('Alice');await wait(host,m=>m.type==='session_credentials');await wait(host,m=>m.type==='room_state');
 let guest=await connect('Bob');await wait(guest,m=>m.type==='session_credentials');await wait(guest,m=>m.type==='room_state');
 send(guest,{type:'regenerate_room_code'});assert.match((await wait(guest,m=>m.type==='error')).message,/Only the host/);
 send(host,{type:'update_lobby_config',initialMinutes:12});await wait(host,m=>m.state?.lobbyConfig.initialMinutes===12);
 host.events=[];guest.events=[];send(host,{type:'regenerate_room_code'});
 const changed=await wait(host,m=>m.type==='room_state'&&m.state.roomId!=='RESUME');const code=changed.state.roomId;
 assert.ok(code);assert.ok(changed.state.players.Alice);assert.equal(changed.state.players.Bob,undefined);assert.equal(changed.state.lobbyConfig.initialMinutes,12);
 const replacement=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(replacement);replacement.events=[];replacement.on('message',b=>replacement.events.push(JSON.parse(b)));await once(replacement,'open');send(replacement,{type:'join_room',roomId:code,playerId:'Charlie',playerName:'Charlie',mode:'online'});const joined=await wait(replacement,m=>m.type==='room_state');assert.equal(joined.yourColor,'b');guest=replacement;const creds=await wait(host,m=>m.type==='session_credentials'&&m.roomId===code);assert.ok(creds.resumeToken);
 send(guest,{type:'set_player_ready',isReady:true});await wait(host,m=>m.state?.players.Charlie?.isReady);
 send(host,{type:'start_game',colorPreference:'w'});await wait(host,m=>m.state?.gameState.status==='playing');
 send(host,{type:'regenerate_room_code'});assert.match((await wait(host,m=>m.type==='error')).message,/before a match/);
 console.log('PASS: host-only lobby code regeneration removes guests, opens Player 2 seat, preserves host/settings and credentials; rejected after start.');
}finally{for(const ws of sockets)ws.close();child.kill();await once(child,'exit').catch(()=>{});}
