import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const botMode=process.argv.includes('--bots');
const compiled=process.argv.includes('--compiled');
const port=compiled?8080:botMode?39742:39741;
const child=spawn(process.execPath,[compiled?'dist/server.cjs':'server.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs=''; child.stderr.on('data',b=>logs+=b); child.stdout.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const sockets=[];const resumeTokens=new Map();
async function connect(id,room,mode='online') {
 const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];
 ws.on('message',d=>ws.events.push(JSON.parse(d)));
 await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId:room,playerId:id,playerName:id,mode,resumeToken:resumeTokens.get(room+':'+id)}));
 ws.initial=await wait(ws,m=>m.type==='room_state');const credential=ws.events.find(m=>m.type==='session_credentials');if(credential)resumeTokens.set(room+':'+id,credential.resumeToken);return ws;
}
async function wait(ws,predicate,timeout=12000) {
 const end=Date.now()+timeout;
 while(Date.now()<end){const i=ws.events.findIndex(predicate);if(i>=0)return ws.events.splice(i,1)[0];await pause(20)}
 throw Error(`Timed out: ${logs}`);
}
const send=(ws,msg)=>ws.send(JSON.stringify(msg));
try {
 for(let i=0;i<100&&!logs.includes('Card Chess server running');i++)await pause(50);
 const response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(response.status,200);assert.match(await response.text(),/\/assets\//);
 const a=await connect('Alice','CHATQA'),b=await connect('Bob','CHATQA'),c=await connect('Elsewhere','OTHER');
 a.events=[];b.events=[];c.events=[];
 send(a,{type:'send_chat',text:'Hello <script>world</script>',senderName:'Forged'});
 const m=await wait(b,m=>m.type==='room_state'&&m.state.chatMessages.length===1);
 assert.equal(m.state.chatMessages[0].senderName,'Alice');assert.equal(m.state.chatMessages[0].text,'Hello <script>world</script>');
 await pause(120);assert.equal(c.events.some(m=>m.state?.chatMessages?.length),false);
 send(a,{type:'send_chat',text:'too fast'});assert.match((await wait(a,m=>m.type==='error')).message,/wait/);
 const local=await connect('Local','LOCAL','pass_and_play');local.events=[];send(local,{type:'send_chat',text:'legacy join uses online chat'});await wait(local,m=>m.state?.chatMessages?.at(-1)?.text==='legacy join uses online chat');assert.equal(local.initial.state.mode,'online');
 const reconnect=await connect('Alice','CHATQA');assert.equal(reconnect.initial.state.chatMessages.length,1);
 console.log('PASS: HTTP production page; room chat delivery, identity, isolation, rate limit, online-only legacy join, reconnect history.');
 if(botMode) for(const level of [400,800,1200,1600,2000]) {
   const host=await connect(`Human${level}`,`BOT${level}`);
   host.events=[];send(host,{type:'configure_bot',difficulty:level});
   const lobby=await wait(host,m=>m.state?.bot?.difficulty===level);assert.equal(lobby.state.players.__chessknot_bot__.isReady,true);
   send(host,{type:'start_game',colorPreference:'b',clockConfig:{enabled:false,initialMinutes:5,incrementSeconds:0}});
   const started=await wait(host,m=>m.state?.gameState.status==='playing');assert.equal(started.yourColor,'b');
   send(host,{type:'pass_turn'});assert.match((await wait(host,m=>m.type==='error')).message,/turn/);
   const moved=await wait(host,m=>m.state?.gameState.turn==='b'&&m.state.gameState.turnNumber>1);
   assert.equal(moved.state.gameState.status,'playing');
   send(host,{type:'pass_turn'});
   await wait(host,m=>m.state?.gameState.turn==='b'&&m.state.gameState.turnNumber>3);
   send(host,{type:'resign'});await wait(host,m=>m.state?.gameState.status==='resigned');
   console.log(`PASS: ${level} bot opens as White, rejects human off-turn input, replies to human turn, stops on resignation.`);
 }
} finally {for(const ws of sockets)ws.close();child.kill();await once(child,'exit').catch(()=>{});}
