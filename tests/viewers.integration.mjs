import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const port=39858,roomId='VIEWS';
const child=spawn(process.execPath,['dist/server.cjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);const sockets=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(ws,pred){const end=Date.now()+8000;while(Date.now()<end){const i=ws.events.findIndex(pred);if(i>=0)return ws.events.splice(i,1)[0];await pause(15);}throw Error('Timed out: '+logs);}
const send=(ws,m)=>ws.send(JSON.stringify(m));
async function connect(id,room=roomId){const ws=new WebSocket(`ws://127.0.0.1:${port}`);sockets.push(ws);ws.events=[];ws.on('message',b=>ws.events.push(JSON.parse(b)));await once(ws,'open');send(ws,{type:'join_room',roomId:room,playerId:id,playerName:id});return ws;}
const state=(ws,pred=()=>true)=>wait(ws,m=>m.type==='room_state'&&pred(m.state,m));
try{
 for(let i=0;i<100&&!logs.includes('server running');i++)await pause(40);
 const host=await connect('Host');await state(host);const guest=await connect('P2');await state(guest);
 send(host,{type:'update_lobby_config',allowArbiter:true,clockEnabled:true,initialMinutes:10,colorPreference:'w',expansions:{shiftedParadigm:false,championsOfTheMonolith:false,theAwakening:false,treacherousGrounds:true,treacherousGroundsSelected:['mine','poison']}});await state(host,s=>s.lobbyConfig.allowArbiter);
 let arb=await connect('Ref');await state(arb);send(arb,{type:'claim_arbiter'});await state(arb,s=>s.players.Ref?.role==='arbiter');const token=await wait(arb,m=>m.type==='session_credentials');assert.ok(token.resumeToken);
 const watcher=await connect('Watch');const view=await state(watcher);assert.deepEqual(view.state.gameState.hands,{w:[],b:[]});assert.equal(view.state.arbiterRecovery,undefined);
 send(watcher,{type:'rename_player',playerId:'Watch',playerName:'Rhea'});await state(host,s=>s.players.Watch?.name==='Rhea');
 send(watcher,{type:'rename_player',playerId:'Host',playerName:'Spoof'});send(watcher,{type:'claim_arbiter'});await wait(watcher,m=>m.type==='error');const verified=await state(host);assert.equal(verified.state.players.Host.name,'Host');
 send(guest,{type:'set_player_ready',isReady:true});await state(host,s=>s.players.P2?.isReady);send(host,{type:'start_game',colorPreference:'w'});const begun=await state(host,s=>s.gameState.status==='playing');
 const httpView=(await (await fetch(`http://127.0.0.1:${port}/api/rooms/${roomId}`)).json()).room;assert.deepEqual(httpView.gameState.hands,{w:[],b:[]});assert.equal(httpView.gameState.deck.length,0);assert.equal(httpView.arbiterRecovery,undefined);
 const arbView=await state(arb,s=>s.gameState.status==='playing');assert.equal(arbView.state.gameState.hands.w.length,5);assert.equal(arbView.state.gameState.hands.b.length,5);assert.equal(arbView.state.gameState.deck.length,0);
 const watching=await state(watcher,s=>s.gameState.status==='playing');assert.deepEqual(watching.state.gameState.hands,{w:[],b:[]});assert.equal(watching.state.gameState.hiddenDeckCount,begun.state.gameState.deck.length);
 send(watcher,{type:'send_chat',text:'Hello players'});await state(host,s=>s.chatMessages?.at(-1)?.text==='Hello players');
 send(watcher,{type:'return_to_lobby'});assert.match((await wait(watcher,m=>m.type==='error')).message,/Quit viewing/);
 send(watcher,{type:'resign'});assert.match((await wait(watcher,m=>m.type==='error')).message,/Spectators/);
 send(watcher,{type:'arbiter_pause',paused:true});assert.match((await wait(watcher,m=>m.type==='error')).message,/Only the Arbiter/);
 // Earn real tile charges through twenty turns, then verify both hidden trap sets on the wire.
 let turn=begun.state.gameState.turnNumber;
 for(let n=0;n<20;n++){host.events=[];send(n%2===0?host:guest,{type:'pass_turn'});const next=await state(host,s=>s.gameState.turnNumber===turn+1);turn=next.state.gameState.turnNumber;}
 host.events=[];send(host,{type:'send_chat',text:'Trap charge check'});const charged=await state(host,s=>s.chatMessages?.at(-1)?.text==='Trap charge check');
 const whiteTrap=Object.entries(charged.state.gameState.grounds.charges.w).find(([t,q])=>q>0)[0];
 send(host,{type:'place_ground',groundType:whiteTrap,square:'a3'});const whitePlaced=await state(host,s=>s.gameState.turnNumber===turn+1);turn=whitePlaced.state.gameState.turnNumber;
 const blackTrap=Object.entries(whitePlaced.state.gameState.grounds.charges.b).find(([t,q])=>q>0)[0];
 arb.events=[];watcher.events=[];send(guest,{type:'place_ground',groundType:blackTrap,square:'h6'});await state(host,s=>s.gameState.turnNumber===turn+1);turn++;
 const hidden=await state(watcher,s=>s.gameState.turnNumber===turn);assert.deepEqual(hidden.state.gameState.grounds.traps,[]);assert.ok(hidden.state.gameState.boardHistory.every(b=>!b.grounds?.traps.length));
 const bothTraps=await state(arb,s=>s.gameState.turnNumber===turn);assert.deepEqual(bothTraps.state.gameState.grounds.traps.map(t=>t.square).sort(),['a3','h6']);
 const publicRoom=(await (await fetch(`http://127.0.0.1:${port}/api/rooms/${roomId}`)).json()).room;assert.deepEqual(publicRoom.gameState.grounds.traps,[]);
 host.events=[];guest.events=[];send(arb,{type:'arbiter_pause',paused:true});const paused=await state(host,s=>s.arbiterClockPaused);await state(guest,s=>s.arbiterClockPaused);assert.equal(paused.state.gameState.clock.isRunning,false);
 const pawn=paused.state.gameState.hands.w.find(c=>c.type==='pawn');send(host,{type:'play_card_move',cardId:pawn.id,from:'e2',to:'e4'});assert.match((await wait(host,m=>m.type==='error')).message,/paused/);send(host,{type:'play_refresh',cardId:'anything'});await wait(host,m=>m.type==='error');
 send(arb,{type:'arbiter_pause',paused:false});const resumed=await state(host,s=>s.arbiterClockPaused===false);assert.equal(resumed.state.gameState.clock.isRunning,true);assert.equal(resumed.state.gameState.fen,paused.state.gameState.fen);assert.deepEqual(resumed.state.gameState.hands,paused.state.gameState.hands);assert.deepEqual(resumed.state.gameState.deck,paused.state.gameState.deck);
 send(host,{type:'play_card_move',cardId:pawn.id,from:'e2',to:'e4'});const moved=await state(host,s=>s.gameState.turn==='b');const recovery=moved.state.arbiterRecovery.code;
 host.events=[];watcher.events=[];send(guest,{type:'pass_turn'});const notice=await state(watcher,s=>s.gameState.passRedrawAlert?.player==='b');assert.ok(notice.state.gameState.passRedrawAlert);
 host.events=[];send(watcher,{type:'dismiss_pass_redraw_alert'});await state(watcher,s=>s.gameState.passRedrawAlert===null);const otherNotice=await state(host,s=>s.gameState.passRedrawAlert?.player==='b');assert.ok(otherNotice.state.gameState.passRedrawAlert);

 host.events=[];arb.close();await once(arb,'close');const gone=await state(host,s=>!s.players.Ref?.connected);assert.equal(gone.state.gameState.clock.isRunning,true);assert.deepEqual(gone.state.recovery,[]);
 arb=await connect('NewDevice');await state(arb);send(arb,{type:'recover_seat',roomId,recoveryCode:recovery});const recovered=await state(arb,s=>s.players.Ref?.connected&&s.players.NewDevice===undefined);assert.equal(recovered.state.players.Ref.role,'arbiter');assert.equal(recovered.state.gameState.hands.w.length,5);assert.equal(recovered.state.players.Host.color,'w');assert.equal(recovered.state.players.P2.color,'b');
 host.events=[];send(arb,{type:'arbiter_pause',paused:true});await state(host,s=>s.arbiterClockPaused);arb.close();await once(arb,'close');const released=await state(host,s=>s.arbiterClockPaused===false&&!s.players.Ref.connected);assert.equal(released.state.gameState.clock.isRunning,true);
 host.events=[];send(watcher,{type:'quit_viewing'});const fresh=await state(watcher,s=>s.roomId!==roomId);assert.equal(fresh.state.gameState.status,'lobby');assert.equal(fresh.yourColor,'w');const unviewed=await state(host,s=>!s.players.Watch);assert.equal(unviewed.state.gameState.fen,otherNotice.state.gameState.fen);assert.equal(unviewed.state.gameState.status,'playing');
 const late=await connect('Late');const lateView=await state(late);assert.equal(lateView.yourColor,'spectator');send(late,{type:'claim_arbiter'});await wait(late,m=>m.type==='error');
 host.events=[];send(host,{type:'kick_spectator',playerId:'Late'});const kicked=await state(late,s=>s.roomId!==roomId);assert.equal(kicked.state.gameState.status,'lobby');await state(host,s=>!s.players.Late);
 send(host,{type:'kick_spectator',playerId:'Ref'});await state(host,s=>!s.players.Ref);
 // A host may referee while two other players occupy the actual playing seats.
 const refHost=await connect('RefHost','REFHOST');await state(refHost);
 send(refHost,{type:'update_lobby_config',allowArbiter:true});await state(refHost,s=>s.lobbyConfig.allowArbiter);send(refHost,{type:'claim_arbiter'});await state(refHost,s=>s.players.RefHost?.role==='arbiter');
 const first=await connect('First','REFHOST');await state(first);const second=await connect('Second','REFHOST');await state(second);
 send(refHost,{type:'update_lobby_config',colorPreference:'b'});const configured=await state(refHost,s=>s.lobbyConfig.colorPreference==='b');assert.equal(configured.state.players.RefHost.color,'spectator');assert.equal(configured.state.players.First.color,'b');
 send(first,{type:'set_player_ready',isReady:true});send(second,{type:'set_player_ready',isReady:true});await state(refHost,s=>s.players.First?.isReady&&s.players.Second?.isReady);
 send(refHost,{type:'start_game'});const refStart=await state(refHost,s=>s.gameState.status==='playing');assert.equal(refStart.state.players.RefHost.color,'spectator');assert.equal(refStart.state.players.First.color,'b');assert.equal(refStart.state.players.Second.color,'w');
 console.log('PASS: spectator privacy/rename/chat/quit/kick; one lobby-only Arbiter; hands visibility; authoritative pause and resource preservation; cross-device recovery; disconnect releases pause without interrupting players.');
}finally{for(const ws of sockets)ws.close();child.kill();await once(child,'exit').catch(()=>{});}
