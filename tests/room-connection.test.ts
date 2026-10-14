import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoomConnection} from '../src/utils/roomConnection.ts';

class Clock {
 time=0;next=0;timers=new Map<number,{at:number;fn:()=>void}>();
 set=(fn:()=>void,ms:number)=>{const id=++this.next;this.timers.set(id,{at:this.time+ms,fn});return id;};
 clear=(id:any)=>{this.timers.delete(id);};
 tick(ms:number){const end=this.time+ms;for(;;){const next=[...this.timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;this.time=next[1].at;this.timers.delete(next[0]);next[1].fn();}this.time=end;}
}
class Socket {
 readyState=0;onopen:any;onmessage:any;onclose:any;onerror:any;sent:any[]=[];throwSend=false;
 send(data:string){if(this.throwSend)throw Error('Network lost');this.sent.push(JSON.parse(data));}
 open(){this.readyState=1;this.onopen?.({});}
 message(msg:unknown){this.onmessage?.({data:JSON.stringify(msg)});}
 close(){this.readyState=3;this.onclose?.({code:1006});}
 disconnect(code=1006){this.readyState=3;this.onclose?.({code});}
}
function setup(){const clock=new Clock(),sockets:Socket[]=[],states:boolean[]=[],terminal:number[]=[],messages:string[]=[];let online=true,name='Alice';
 const connection=createRoomConnection({roomId:'ROOM',createSocket:()=>{const s=new Socket();sockets.push(s);return s as any;},join:()=>({type:'join_room',playerName:name}),onSocket:()=>{},onConnected:v=>states.push(v),onMessage:data=>messages.push(data),onTerminal:v=>terminal.push(v),online:()=>online,now:()=>clock.time,random:()=>0,setTimer:clock.set,clearTimer:clock.clear});
 return {clock,sockets,states,terminal,messages,connection,setOnline:(v:boolean)=>online=v,rename:(v:string)=>name=v};
}
test('online events cannot duplicate a connecting socket or a scheduled reconnect',()=>{
 const x=setup();x.connection.start();x.connection.wake();x.connection.wake();assert.equal(x.sockets.length,1);
 x.sockets[0].open();x.sockets[0].message({type:'room_state',state:{roomId:'ROOM'}});x.sockets[0].disconnect();
 x.connection.wake();assert.equal(x.sockets.length,2);x.clock.tick(750);assert.equal(x.sockets.length,2);x.connection.stop();
});
test('stale close callbacks cannot disconnect a newer socket',()=>{const x=setup();x.connection.start();const old=x.sockets[0],close=old.onclose;old.disconnect();x.connection.wake();const fresh=x.sockets[1];fresh.open();fresh.message({type:'room_state',state:{roomId:'ROOM'}});close({code:4000});assert.equal(x.states.at(-1),true);assert.deepEqual(x.terminal,[]);x.connection.stop();});
test('missing heartbeat replies reconnect; healthy replies keep the same socket',()=>{
 const x=setup();x.connection.start();const first=x.sockets[0];first.open();first.message({type:'room_state',state:{roomId:'ROOM'}});x.clock.tick(65000);assert.equal(x.states.at(-1),false);x.clock.tick(750);assert.equal(x.sockets.length,2);x.connection.stop();
 const healthy=setup();healthy.connection.start();healthy.sockets[0].open();healthy.sockets[0].message({type:'room_state',state:{roomId:'ROOM'}});for(let i=0;i<12;i++){healthy.clock.tick(10000);healthy.sockets[0].message({type:'pong'});}assert.equal(healthy.sockets.length,1);healthy.connection.stop();
});
test('connection status waits for the correct room acknowledgement',()=>{const x=setup();x.connection.start();x.sockets[0].open();assert.equal(x.states.at(-1),false);x.sockets[0].message({type:'room_state',state:{roomId:'OTHER'}});assert.equal(x.states.at(-1),false);x.sockets[0].message({type:'room_state',state:{roomId:'ROOM'}});assert.equal(x.states.at(-1),true);x.connection.stop();});
test('renaming changes the next join without restarting an open socket',()=>{const x=setup();x.connection.start();x.sockets[0].open();x.rename('Renamed');x.connection.wake();assert.equal(x.sockets.length,1);x.sockets[0].disconnect();x.clock.tick(750);x.sockets[1].open();assert.equal(x.sockets[1].sent[0].playerName,'Renamed');x.connection.stop();});
test('stalled handshakes retry and stop cancels every pending timer',()=>{const x=setup();x.connection.start();x.clock.tick(15000);assert.equal(x.states.at(-1),false);x.clock.tick(750);assert.equal(x.sockets.length,2);x.connection.stop();assert.equal(x.clock.timers.size,0);x.clock.tick(60000);assert.equal(x.sockets.length,2);});
test('terminal seat takeover never fights the other device with another reconnect',()=>{const x=setup();x.connection.start();x.sockets[0].open();x.sockets[0].disconnect(4000);x.connection.wake();x.clock.tick(120000);assert.equal(x.sockets.length,1);assert.deepEqual(x.terminal,[4000]);x.connection.stop();});
test('offline retries do not create sockets and waking cancels the pending timer',()=>{const x=setup();x.setOnline(false);x.connection.start();x.clock.tick(750);assert.equal(x.sockets.length,0);x.setOnline(true);x.connection.wake();assert.equal(x.sockets.length,1);x.clock.tick(1500);assert.equal(x.sockets.length,1);x.connection.stop();});
test('failed gameplay sends reconnect but never replay the action',()=>{const x=setup();x.connection.start();x.sockets[0].open();x.sockets[0].throwSend=true;assert.equal(x.connection.send({type:'play_card_move'}),false);x.clock.tick(750);x.sockets[1].open();assert.ok(!x.sockets[1].sent.some(m=>m.type==='play_card_move'));x.connection.stop();});

test('waking a sleeping tab probes a healthy socket instead of disconnecting it',()=>{const x=setup();x.connection.start();x.sockets[0].open();x.sockets[0].message({type:'room_state',state:{roomId:'ROOM'}});x.clock.time=60000;x.connection.wake();x.sockets[0].message({type:'pong'});x.clock.tick(15000);assert.equal(x.sockets.length,1);assert.equal(x.states.at(-1),true);x.connection.stop();});


test('open socket with pong replies still retries a missing room confirmation',()=>{
 const x=setup();x.connection.start();const first=x.sockets[0];first.open();
 first.message({type:'pong'});x.clock.tick(3000);first.message({type:'pong'});
 x.clock.tick(3000);assert.equal(first.readyState,3);assert.equal(x.states.at(-1),false);
 x.clock.tick(750);assert.equal(x.sockets.length,2);x.sockets[1].open();
 x.sockets[1].message({type:'room_state',state:{roomId:'ROOM',gameState:{status:'lobby'}}});
 assert.equal(x.states.at(-1),true);x.connection.stop();assert.equal(x.clock.timers.size,0);
});
test('wrong room confirmation cannot cancel the join watchdog',()=>{
 const x=setup();x.connection.start();x.sockets[0].open();
 x.sockets[0].message({type:'room_state',state:{roomId:'OTHER'}});x.clock.tick(6000);
 assert.equal(x.sockets[0].readyState,3);x.connection.stop();
});
test('lobby heartbeat refreshes snapshots and waking refreshes immediately without rejoining',()=>{
 const x=setup();x.connection.start();const socket=x.sockets[0];socket.open();
 socket.message({type:'room_state',state:{roomId:'ROOM',gameState:{status:'lobby'}}});
 x.clock.tick(2000);assert.deepEqual(socket.sent.at(-1),{type:'ping',sync:true});
 socket.message({type:'pong'});x.connection.wake();assert.deepEqual(socket.sent.at(-1),{type:'ping',sync:true});
 assert.equal(socket.sent.filter(m=>m.type==='join_room').length,1);
 assert.equal(x.sockets.length,1);x.connection.stop();assert.equal(x.clock.timers.size,0);
});
test('starting a match switches heartbeat back to normal and wake still refreshes',()=>{
 const x=setup();x.connection.start();const socket=x.sockets[0];socket.open();
 socket.message({type:'room_state',state:{roomId:'ROOM',gameState:{status:'lobby'}}});
 socket.message({type:'room_state',state:{roomId:'ROOM',gameState:{status:'playing'}}});
 x.clock.tick(2000);assert.equal(socket.sent.length,1);x.clock.tick(8000);
 assert.deepEqual(socket.sent.at(-1),{type:'ping'});x.connection.wake();
 assert.deepEqual(socket.sent.at(-1),{type:'ping',sync:true});x.connection.stop();
});
test('seat recovery prompt stops join timeout without claiming a successful connection',()=>{
 const x=setup();x.connection.start();x.sockets[0].open();
 x.sockets[0].message({type:'recovery_required',roomId:'ROOM'});x.clock.tick(7000);
 assert.equal(x.sockets.length,1);assert.equal(x.sockets[0].readyState,1);
 assert.equal(x.states.at(-1),false);x.connection.stop();
});
