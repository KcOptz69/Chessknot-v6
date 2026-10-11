import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39853;
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));const sockets=[];
async function wait(ws,pred){const end=Date.now()+8000;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await pause(15);}throw Error('Timed out: '+logs);}
async function connect(id,token){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId:'RESUME',playerId:id,playerName:id,mode:'online',resumeToken:token}));return ws;}
const send=(w,m)=>w.send(JSON.stringify(m));
try{
 for(let i=0;i<100&&!logs.includes('server running');i++)await pause(40);
 const host=await connect('Alice');await wait(host,m=>m.type==='room_state');
 const guest=await connect('Bob');await wait(guest,m=>m.type==='room_state');guest.events=[];
 send(host,{type:'leave_lobby'});
 const released=await wait(guest,m=>m.state?.lobbyConfig.hostId==='Bob');guest.events.push(released);
 host.close();await once(host,'close');
 const handed=await wait(guest,m=>m.state?.lobbyConfig.hostId==='Bob');
 assert.equal(handed.state.players.Alice,undefined);assert.equal(handed.state.players.Bob.isHost,true);
 send(guest,{type:'regenerate_room_code'});const changed=await wait(guest,m=>m.type==='room_code_changed');assert.notEqual(changed.roomId,'RESUME');
 const state=await wait(guest,m=>m.state?.roomId===changed.roomId);assert.equal(state.state.lobbyConfig.hostId,'Bob');assert.deepEqual(Object.keys(state.state.players),['Bob']);
 console.log('PASS: departed lobby host removed; Player 2 becomes host and generates new code without refreshing.');
}finally{for(const ws of sockets)ws.close();child.kill();await once(child,'exit').catch(()=>{});}
