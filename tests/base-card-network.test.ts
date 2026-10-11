import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createCard} from '../src/utils/chessLogic.ts';
const harness=new URL('../.base-card-network-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8')+'\nexport {rooms,server,wss};\n');
const oldPort=process.env.PORT,oldNodeEnv=process.env.NODE_ENV,interval=globalThis.setInterval;
process.env.PORT='39861';process.env.NODE_ENV='production';globalThis.setInterval=(()=>0) as any;
let api:any;try{api=await import(harness.href);}finally{globalThis.setInterval=interval;unlinkSync(harness);if(oldPort===undefined)delete process.env.PORT;else process.env.PORT=oldPort;if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;}
if(!api.server.listening)await once(api.server,'listening');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function wait(ws:any,predicate:(message:any)=>boolean){for(let i=0;i<200;i++){const index=ws.events.findIndex(predicate);if(index>=0)return ws.events.splice(index,1)[0];await pause(15);}throw new Error('Timed out waiting for shared card event');}
async function join(id:string){const ws:any=new WebSocket('ws://127.0.0.1:39861');ws.events=[];ws.on('message',(b:any)=>ws.events.push(JSON.parse(b.toString())));await once(ws,'open');ws.send(JSON.stringify({type:'join_room',roomId:'CARDS',playerId:id,playerName:id,mode:'online'}));await wait(ws,m=>m.type==='room_state');return ws;}
test('both clients receive the same Joker activation and deck-refresh events; guest can play Refresh',async()=>{
 const sockets:any[]=[];
 try{
  const host=await join('host'),guest=await join('guest');sockets.push(host,guest);
  guest.send(JSON.stringify({type:'set_player_ready',isReady:true}));await wait(host,m=>m.state?.players.guest?.isReady);
  host.send(JSON.stringify({type:'start_game',colorPreference:'w'}));await wait(host,m=>m.state?.gameState.status==='playing');await wait(guest,m=>m.state?.gameState.status==='playing');
  const state=api.rooms.get('CARDS').gameState;
  state.hands.w=[createCard('joker',1),createCard('brick',2),createCard('pawn',3)];
  host.send(JSON.stringify({type:'play_joker',cardId:state.hands.w[0].id}));
  const joker=(m:any)=>m.state?.gameState.historyLog.some((e:any)=>e.actionType==='joker');
  const a=await wait(host,joker),b=await wait(guest,joker);
  const ea=a.state.gameState.historyLog.find((e:any)=>e.actionType==='joker'),eb=b.state.gameState.historyLog.find((e:any)=>e.actionType==='joker');assert.equal(ea.id,eb.id);assert.equal(ea.actionType,'joker');assert.equal(a.state.gameState.hands.w.length,5);
  state.turn='b';state.fen=state.fen.replace(' w ',' b ');state.hands.b=[createCard('refresh',4),createCard('brick',5),createCard('pawn',6),createCard('bishop',7),createCard('rook',8)];state.deck=[createCard('pawn',9)];state.discard=[];
  guest.send(JSON.stringify({type:'play_refresh',cardId:state.hands.b[0].id}));
  const refreshed=(m:any)=>m.state?.gameState.historyLog.some((e:any)=>e.actionType==='refresh');
  const c=await wait(host,refreshed),d=await wait(guest,refreshed);
  assert.equal(c.state.gameState.historyLog.find((e:any)=>e.actionType==='deck_refresh').id,d.state.gameState.historyLog.find((e:any)=>e.actionType==='deck_refresh').id);
  assert.equal(d.state.gameState.hands.b.length,5);assert.equal(d.state.gameState.turn,'b');
 }finally{
  await Promise.all(sockets.map(async ws=>{const ended=once(ws,'close');ws.close();await ended;}));
  await new Promise<void>(resolve=>api.wss.close(()=>resolve()));
  await new Promise<void>(resolve=>api.server.close(()=>resolve()));
 }
});
