import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the server's actual ping handler and broadcast code without starting
// its unrelated game engine, HTTP server, or timers.
const source=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
const pingStart=source.indexOf("      if (msg.type === 'ping') {");
const pingEnd=source.indexOf("      if(msg.type==='exit_to_new_lobby')",pingStart);
const ping=source.slice(pingStart,pingEnd);
const broadcastStart=source.indexOf('function broadcastRoom(roomId: string) {');
const broadcastEnd=source.indexOf('\nfunction sendToSocket',broadcastStart);
const broadcast=source.slice(broadcastStart,broadcastEnd)
 .replace('roomId: string','roomId').replace('const msg: ServerMessage =','const msg =');
function setup(){
 const host={id:'host',name:'Host',color:'w',connected:true,isHost:true,isReady:false};
 const guest={id:'guest',name:'Guest',color:'b',connected:true,isHost:false,isReady:false};
 const room={roomId:'ROOM',mode:'online',players:{host,guest},lobbyConfig:{hostId:'host'},gameState:{status:'lobby'}};
 const hostSocket={sent:[] as any[],readyState:1},guestSocket={sent:[] as any[],readyState:1},outsider={sent:[] as any[],readyState:1};
 const rooms=new Map([['ROOM',room]]),socketMeta=new Map<any,any>([[hostSocket,{roomId:'ROOM',playerId:'host'}],[guestSocket,{roomId:'ROOM',playerId:'guest'}]]);
 const send=(ws:any,msg:any)=>ws.sent.push(JSON.parse(JSON.stringify(msg)));
 const broadcastRoom=new Function('rooms','wss','WebSocket','socketMeta','seatCredentials','seatKey','isArbiter','credentials','sendToSocket','recoveryView','viewingGameState','viewingDismissals',
  broadcast+'; return broadcastRoom;')(rooms,{clients:[hostSocket,guestSocket,outsider]},{OPEN:1},socketMeta,new Map([['ROOM:host',{}],['ROOM:guest',{}]]),(r:string,id:string)=>r+':'+id,()=>false,()=>({}),send,()=>[],(game:any)=>game,new Map());
 const handler=new Function('ws','msg','socketMeta','rooms','sendToSocket','broadcastRoom',ping);
 return {room,hostSocket,guestSocket,outsider,handle:(ws:any,msg:any)=>handler(ws,msg,socketMeta,rooms,send,broadcastRoom)};
}
test('a lobby refresh updates both host and guest immediately from the same room',()=>{
 const x=setup(),before=JSON.stringify(x.room);
 x.handle(x.guestSocket,{type:'ping',sync:true});
 assert.equal(x.guestSocket.sent[0].type,'pong');
 assert.equal(x.hostSocket.sent[0].type,'room_state');
 assert.equal(x.guestSocket.sent[1].type,'room_state');
 assert.deepEqual(x.hostSocket.sent[0].state.players,x.guestSocket.sent[1].state.players);
 assert.equal(x.hostSocket.sent[0].state.players.guest.connected,true);
 assert.equal(JSON.stringify(x.room),before);assert.equal(x.outsider.sent.length,0);
});
test('unauthenticated or spoofed room refresh cannot read a lobby',()=>{
 const x=setup();x.handle(x.outsider,{type:'ping',sync:true,roomId:'ROOM'});
 assert.deepEqual(x.outsider.sent,[{type:'pong'}]);assert.equal(x.hostSocket.sent.length,0);
});
test('normal heartbeat does not broadcast snapshots or change lobby readiness',()=>{
 const x=setup();x.handle(x.hostSocket,{type:'ping'});
 assert.deepEqual(x.hostSocket.sent,[{type:'pong'}]);assert.equal(x.guestSocket.sent.length,0);
 assert.equal(x.room.players.guest.isReady,false);
});
