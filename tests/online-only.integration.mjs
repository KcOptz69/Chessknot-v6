import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39859,child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const sockets=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(w,p){const end=Date.now()+8000;while(Date.now()<end){const i=w.events.findIndex(p);if(i>=0)return w.events.splice(i,1)[0];await pause(15)}throw Error('Timed out '+logs)}
async function join(id,mode){const w=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(w);w.events=[];w.on('message',b=>w.events.push(JSON.parse(b)));await once(w,'open');w.send(JSON.stringify({type:'join_room',roomId:'ONLINE',playerId:id,playerName:id,mode}));return w}
const send=(w,m)=>w.send(JSON.stringify(m));
try{for(let i=0;i<100&&!logs.includes('server running');i++)await pause(40);
 const host=await join('host','pass_and_play');const initial=await wait(host,m=>m.type==='room_state');assert.equal(initial.state.mode,'online');
 send(host,{type:'start_game'});assert.match((await wait(host,m=>m.type==='error')).message,/Player 2/);
 send(host,{type:'set_room_mode',mode:'pass_and_play'});assert.match((await wait(host,m=>m.type==='error')).message,/online matches only/);
 send(host,{type:'update_lobby_config',mode:'pass_and_play',initialMinutes:999});assert.match((await wait(host,m=>m.type==='error')).message,/online matches only/);
 const guest=await join('guest','online');const state=await wait(guest,m=>m.type==='room_state');assert.equal(state.state.mode,'online');assert.equal(state.state.lobbyConfig.initialMinutes,initial.state.lobbyConfig.initialMinutes);
 send(guest,{type:'set_player_ready',isReady:true});await wait(host,m=>m.state?.players.guest?.isReady);
 send(host,{type:'start_game',colorPreference:'w'});const match=await wait(host,m=>m.state?.gameState.status==='playing');assert.equal(match.state.players.host.color,'w');assert.equal(match.state.players.guest.color,'b');
 console.log('PASS legacy join becomes online; solo start blocked; both legacy switch routes rejected without config mutation; ready two-player match starts');
}finally{for(const w of sockets)w.close();child.kill();await once(child,'exit').catch(()=>{})}
