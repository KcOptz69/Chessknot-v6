import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createInitialGameState,createSafeChess,syncFenTurn,getClockBlockReason} from '../src/utils/chessLogic.ts';
import {portalTravelTarget,initialGrounds,landGround,visibleGrounds,finishGroundTurn,groundMoves} from '../src/utils/grounds.ts';
const harness=new URL('../.grounds-handler-test.ts',import.meta.url);
writeFileSync(harness,readFileSync(new URL('../server.ts',import.meta.url),'utf8').replace(/\nstartServer\(\);\s*$/,'\nexport {handleGameAction};\n'));
const interval=globalThis.setInterval;globalThis.setInterval=(()=>0) as any;let handleGameAction:any;
try{({handleGameAction}=await import(harness.href));}finally{globalThis.setInterval=interval;unlinkSync(harness);}
function state(){const s=createInitialGameState({shiftedParadigm:true,championsOfTheMonolith:true,theAwakening:true,treacherousGrounds:true});s.status='playing';s.grounds=initialGrounds(true,()=>0)!;s.grounds.selected=['mine','defense'];s.grounds.charges.w={mine:3,defense:3};s.grounds.charges.b={mine:3,defense:3};return s;}
function room(){return {gameState:state(),lobbyConfig:{},players:{}} as any;}
function action(r:any,msg:any,color='w'){handleGameAction(r,msg,color);}
function pawnAt(s:any,sq:string,color='w'){const b=createSafeChess(s.fen);b.put({type:'p',color},sq as any);s.fen=b.fen();}
test('disabled expansion creates no grounds; enabled selects two distinct types',()=>{assert.equal(initialGrounds(false),undefined);const g=initialGrounds(true,()=>0)!;assert.equal(new Set(g.selected).size,2);assert.equal(Object.keys(g.tiles).length,0);});
test('hidden opponent traps are removed, spectators see none, pass and play hides both',()=>{const g=state().grounds!;g.traps=[{id:'w',type:'mine',owner:'w',square:'d4'},{id:'b',type:'poison',owner:'b',square:'d5'}];assert.deepEqual(visibleGrounds(g,'w')!.traps.map(t=>t.id),['w']);assert.deepEqual(visibleGrounds(g,'spectator')!.traps,[]);assert.deepEqual(visibleGrounds(g,'w',true)!.traps,[]);assert.equal(g.traps.length,2);});
test('invalid placement has zero consequences',()=>{for(const msg of [{type:'place_ground',groundType:'mine',square:'a2'},{type:'place_ground',groundType:'mine',square:'a5'},{type:'place_ground',groundType:'boost',square:'a3'}]){const r=room();const before=JSON.stringify(r.gameState);action(r,msg);assert.equal(JSON.stringify(r.gameState),before);}});
test('valid trap consumes a charge and move but log does not disclose coordinates',()=>{const r=room();action(r,{type:'place_ground',groundType:'mine',square:'d4'});assert.equal(r.gameState.turn,'b');assert.equal(r.gameState.grounds.charges.w.mine,2);assert.equal(r.gameState.grounds.traps[0].square,'d4');assert.equal(r.gameState.historyLog.some((l:any)=>l.detail.includes('d4')),false);});
test('own duplicate rejected, opponent duplicate permitted',()=>{const r=room();r.gameState.grounds.traps.push({id:'a',owner:'w',square:'d4',type:'mine'});const before=JSON.stringify(r.gameState);action(r,{type:'place_ground',groundType:'mine',square:'d4'});assert.equal(JSON.stringify(r.gameState),before);r.gameState.grounds.traps[0].owner='b';action(r,{type:'place_ground',groundType:'mine',square:'d4'});assert.equal(r.gameState.grounds.traps.length,2);});
test('Defense clears traps; placement cannot overlap powered tiles',()=>{const r=room();r.gameState.grounds.traps.push({id:'a',owner:'b',square:'d4',type:'mine'});action(r,{type:'place_ground',groundType:'defense',square:'d4'});assert.equal(r.gameState.grounds.traps.length,0);assert.equal(r.gameState.grounds.tiles.d4,'defense');});
test('Mine removes enemy Champion, gives 5 capture points, and consumes trap',()=>{const s=state();s.champions.b={type:'ninja',square:'d4',color:'b'};s.grounds!.traps=[{id:'m',type:'mine',owner:'w',square:'d4'}];landGround(s,'d4');assert.equal(s.champions.b,null);assert.equal(s.powerUps.w.draw,2);assert.equal(s.grounds!.traps.length,0);assert.equal(s.captures!.w[0].type,'ninja');});
test('own Mine gives neither player capture progress',()=>{const s=state();pawnAt(s,'d4');s.grounds!.traps=[{id:'m',type:'mine',owner:'w',square:'d4'}];landGround(s,'d4');assert.equal(createSafeChess(s.fen).get('d4'),undefined);assert.deepEqual(s.powerUpProgress,{w:0,b:0});});
test('King survives and consumes every stacked trap',()=>{const s=state();s.grounds!.traps=['mine','poison','disarm','banish'].map((type,i)=>({id:String(i),type,owner:'b',square:'e1'} as any));landGround(s,'e1');assert.equal(createSafeChess(s.fen).get('e1')?.type,'k');assert.equal(s.grounds!.traps.length,0);assert.equal(s.grounds!.poison.length,0);assert.equal(s.grounds!.banished.length,0);});
test('Poison excludes landing turn then removes at end of third owner turn',()=>{const s=state();pawnAt(s,'d4');s.grounds!.traps=[{id:'p',type:'poison',owner:'b',square:'d4'}];landGround(s,'d4');finishGroundTurn(s,'w',()=>{});assert.equal(s.grounds!.poison[0].remaining,3);for(let i=0;i<2;i++){s.turnNumber+=2;finishGroundTurn(s,'w',()=>{});assert.ok(createSafeChess(s.fen).get('d4'));}s.turnNumber+=2;finishGroundTurn(s,'w',()=>{});assert.equal(createSafeChess(s.fen).get('d4'),undefined);});
test('Defense cures poison',()=>{const s=state();pawnAt(s,'d4');s.grounds!.poison=[{square:'d4',color:'w',owner:'b',remaining:2,appliedTurn:0}];s.grounds!.tiles.d4='defense';landGround(s,'d4');assert.equal(s.grounds!.poison.length,0);});
test('Banish retains alive material and returns after ten subsequent turns',()=>{const s=state();pawnAt(s,'d4');s.grounds!.traps=[{id:'b',type:'banish',owner:'b',square:'d4'}];landGround(s,'d4');finishGroundTurn(s,'w',()=>{});assert.equal(s.grounds!.banished[0].remaining,10);for(let i=0;i<9;i++){s.turnNumber++;finishGroundTurn(s,i%2?'w':'b',()=>{});}assert.equal(s.grounds!.banished.length,1);s.turnNumber++;finishGroundTurn(s,'w',()=>{});assert.equal(s.grounds!.banished.length,0);assert.equal(createSafeChess(s.fen).get('d4')?.color,'w');});
test('20 completed turns grant exactly one random charge per player',()=>{const s=state();s.grounds!.charges={w:{},b:{}};for(let i=0;i<20;i++){finishGroundTurn(s,i%2?'b':'w',()=>{});s.turnNumber++;}assert.equal(Object.values(s.grounds!.charges.w).reduce((n,v)=>n+v,0),1);assert.equal(Object.values(s.grounds!.charges.b).reduce((n,v)=>n+v,0),1);});
test('Boost slides noncapturing; Gravity moves one square',()=>{const s=state();pawnAt(s,'d4');s.grounds!.tiles.d4='boost';assert.ok(groundMoves(s,'d4')!.includes('d6'));assert.equal(groundMoves(s,'d4')!.includes('d7'),false);s.grounds!.tiles.d4='gravity';assert.equal(groundMoves(s,'d4')!.includes('d6'),false);assert.ok(groundMoves(s,'d4')!.includes('d5'));});
test('ordinary landing triggers Mine on live server handler without phantom pawn or wrong credit',()=>{const r=room();r.gameState.grounds.traps=[{id:'x',type:'mine',owner:'b',square:'c3'}];r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''}];action(r,{type:'play_card_move',cardId:'n',from:'b1',to:'c3'});assert.equal(createSafeChess(r.gameState.fen).get('c3'),undefined);assert.equal(r.gameState.grounds.traps.length,0);assert.equal(r.gameState.captures.b[0].type,'n');assert.equal(r.gameState.powerUpProgress.b,3);assert.equal(r.gameState.powerUpProgress.w,0);});
test('portal transport is free and once per turn',()=>{const r=room();r.gameState.grounds.tiles={b1:'portal',d4:'portal'};action(r,{type:'portal_move',from:'b1'});assert.equal(createSafeChess(r.gameState.fen).get('d4')?.type,'n');assert.equal(r.gameState.turnNumber,1);const before=JSON.stringify(r.gameState);action(r,{type:'portal_move',from:'d4'});assert.equal(JSON.stringify(r.gameState),before);});
test('tile card uses matching card and powered movement',()=>{const r=room();const board=createSafeChess(r.gameState.fen);board.remove('b1');board.put({type:'n',color:'w'},'d4');r.gameState.fen=board.fen();r.gameState.grounds.tiles.d4='boost';r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''}];action(r,{type:'play_card_move',cardId:'n',from:'d4',to:'d6'});assert.equal(createSafeChess(r.gameState.fen).get('d6')?.type,'n');assert.equal(r.gameState.turnNumber,2);assert.equal(r.gameState.discard[0].id,'n');});
test('Disarm prevents Champion ultimate and retains resources',()=>{const r=room();r.gameState.champions.w={color:'w',square:'d4',type:'ninja'};r.gameState.grounds.disarm=[{square:'d4',color:'w',owner:'b',appliedTurn:1}];r.gameState.hands.w=[{id:'c',type:'champion',name:'Champion',description:''}];const before=JSON.stringify(r.gameState);action(r,{type:'play_champion_ultimate',cardId:'c',targetSquare:'d5'});assert.equal(JSON.stringify(r.gameState),before);});
test('first-jump Mine stops a Super Knight before its second jump',()=>{const r=room();r.gameState.superKnights=['b1'];r.gameState.grounds.traps=[{id:'m',type:'mine',owner:'b',square:'c3'}];r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''}];action(r,{type:'play_card_move',cardId:'n',from:'b1',to:'c3',secondTo:'d5'});const b=createSafeChess(r.gameState.fen);assert.equal(b.get('c3'),undefined);assert.equal(b.get('d5'),undefined);assert.equal(r.gameState.discard.length,1);assert.equal(r.gameState.powerUpProgress.b,3);});
test('Super Knight second move is governed by the tile it just landed on',()=>{const r=room();r.gameState.superKnights=['b1'];r.gameState.grounds.tiles.c3='gravity';r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''}];action(r,{type:'play_card_move',cardId:'n',from:'b1',to:'c3',secondTo:'c4'});assert.equal(createSafeChess(r.gameState.fen).get('c4')?.type,'n');assert.equal(r.gameState.superKnights.length,0);});
test('invalid second move from Gravity does not spend card or change board',()=>{const r=room();r.gameState.superKnights=['b1'];r.gameState.grounds.tiles.c3='gravity';r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''}];const before=JSON.stringify(r.gameState);action(r,{type:'play_card_move',cardId:'n',from:'b1',to:'c3',secondTo:'d5'});assert.equal(JSON.stringify(r.gameState),before);});
test('portal swaps friendly pieces and transfers poison to the correct identity',()=>{const r=room();r.gameState.grounds.tiles={b1:'portal',g1:'portal'};r.gameState.grounds.poison=[{square:'b1',color:'w',owner:'b',remaining:2,appliedTurn:0}];action(r,{type:'portal_move',from:'b1'});assert.equal(r.gameState.grounds.poison[0].square,'g1');assert.equal(r.gameState.turnNumber,1);});
test('portal cannot capture protected enemy and retains once-per-turn action',()=>{const r=room();pawnAt(r.gameState,'d4','b');r.gameState.grounds.tiles={b1:'portal',d4:'portal'};r.gameState.beaconEffect={active:true,protectedSquares:['d4'],expiresOnTurnNumber:10};const before=JSON.stringify(r.gameState);action(r,{type:'portal_move',from:'b1'});assert.equal(JSON.stringify(r.gameState),before);});
test('Disarm prohibits en passant',()=>{const r=room();r.gameState.fen='4k3/8/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQ d6 0 1';r.gameState.grounds.disarm=[{square:'e5',color:'w',owner:'b',appliedTurn:0}];r.gameState.hands.w=[{id:'p',type:'pawn',name:'Pawn',description:''}];const before=JSON.stringify(r.gameState);action(r,{type:'play_card_move',cardId:'p',from:'e5',to:'d6'});assert.equal(JSON.stringify(r.gameState),before);});
test('melee capturing poisoned enemy removes capturer and credits poisoned owner',()=>{const r=room();r.gameState.fen='4k3/8/8/8/3p4/3R4/PPPP1PPP/RNBQKBNR w KQ - 0 1';r.gameState.grounds.poison=[{square:'d4',color:'b',owner:'w',remaining:2,appliedTurn:0}];r.gameState.hands.w=[{id:'r',type:'rook',name:'Rook',description:''}];action(r,{type:'play_card_move',cardId:'r',from:'d3',to:'d4'});assert.equal(createSafeChess(r.gameState.fen).get('d4'),undefined);assert.equal(r.gameState.powerUpProgress.w,1);assert.equal(r.gameState.powerUps.b.draw,2);});
test('Clock restores a Mine casualty and never resurrects the spent trap',()=>{const r=room();r.gameState.hands.w=[{id:'n',type:'knight',name:'Knight',description:''},{id:'c',type:'clock',name:'Clock',description:''}];r.gameState.grounds.traps=[{id:'m',type:'mine',owner:'b',square:'c3'}];action(r,{type:'play_card_move',cardId:'n',from:'b1',to:'c3'});action(r,{type:'pass_turn'},'b');assert.equal(r.gameState.turnNumber,3);action(r,{type:'play_clock',cardId:'c'});assert.equal(createSafeChess(r.gameState.fen).get('b1')?.type,'n');assert.equal(r.gameState.grounds.traps.length,0);assert.ok(r.gameState.discard.some((c:any)=>c.id==='n'));});
test('Clock rejects tile placement in either rewound turn',()=>{const r=room();r.gameState.hands.w=[{id:'c',type:'clock',name:'Clock',description:''}];action(r,{type:'place_ground',groundType:'mine',square:'d4'});action(r,{type:'pass_turn'},'b');assert.match(getClockBlockReason(r.gameState,'w')||'',/Tile/);const before=JSON.stringify(r.gameState);action(r,{type:'play_clock',cardId:'c'});assert.equal(JSON.stringify(r.gameState),before);});
test('stunned Champion cannot activate its ultimate',()=>{const r=room();r.gameState.champions.w={color:'w',square:'d4',type:'ninja'};r.gameState.staticEffect={active:true,stunnedSquares:['d4'],expiresOnTurnNumber:10};r.gameState.hands.w=[{id:'c',type:'champion',name:'Champion',description:''}];const before=JSON.stringify(r.gameState);action(r,{type:'play_champion_ultimate',cardId:'c',targetSquare:'d5'});assert.equal(JSON.stringify(r.gameState),before);});
test('Super Pawn stays with the same piece identity after Clock rewind',()=>{const r=room();r.gameState.superPawns=['a2'];r.gameState.hands.w=[{id:'p',type:'pawn',name:'Pawn',description:''},{id:'c',type:'clock',name:'Clock',description:''}];action(r,{type:'play_card_move',cardId:'p',from:'a2',to:'a4'});action(r,{type:'pass_turn'},'b');action(r,{type:'play_clock',cardId:'c'});assert.deepEqual(r.gameState.superPawns,['a2']);assert.equal(createSafeChess(r.gameState.fen).get('a2')?.color,'w');assert.ok(!r.gameState.superPawns.includes('a7'));});
test('Awakening Queen binds captured Super Pawn status to Soul Release',()=>{const r=room();r.gameState.fen='4k3/8/8/8/8/3p4/PPP2PPP/RNBQKBNR w KQ - 0 1';r.gameState.superPawns=['d3'];r.gameState.hands.w=[{id:'q',type:'awakening_queen',name:'Awakening',description:''}];action(r,{type:'play_awakening_queen',cardId:'q',from:'d1',to:'d3',deploySquare:'e3'});assert.equal(r.gameState.hands.w.find((c:any)=>c.type==='soul_release')?.soul.piece.type,'sp');assert.ok(!r.gameState.superPawns.includes('d3'));assert.equal(createSafeChess(r.gameState.fen).get('e3'),undefined);});
test('Bishop revives captured Super Pawn with upgrade',()=>{const r=room();r.gameState.fen='4k3/8/8/8/8/8/2PPPPPP/RNBQKBNR w KQ - 0 1';r.gameState.captures={w:[],b:[{type:'sp',color:'w'}]};r.gameState.hands.w=[{id:'b',type:'awakening_bishop',name:'Awakening',description:''}];r.gameState.summoningCircles=[{id:'c',owner:'w',square:'b3',remaining:0,createdTurn:1}];r.gameState.pendingSummon={player:'w',circleId:'c',nextTurn:'b'};action(r,{type:'resolve_summon',captureIndex:0});assert.equal(createSafeChess(r.gameState.fen).get('b3')?.type,'p');assert.ok(r.gameState.superPawns.includes('b3'));assert.equal(r.gameState.captures.b.length,0);});
test('all powered tile placements on restricted squares preserve the full state',()=>{
 for(const type of ['boost','gravity','defense','portal'] as const){
  const r=room();r.gameState.grounds.selected=[type,'mine'];r.gameState.grounds.charges.w[type]=1;
  r.gameState.restrictedSquares=['d4'];
  if(type==='portal')r.gameState.grounds.tiles.e4='portal';
  const before=structuredClone(r.gameState);
  action(r,{type:'place_ground',groundType:type,square:'d4',portalFrom:'e4'});
  assert.deepEqual(r.gameState,before);
 }
});

for(const transport of [true,false])test(`landing on Portal waits for choice; transport=${transport}`,()=>{
 const r=room();const s=r.gameState;s.grounds.selected=['portal','boost'];s.grounds.tiles={f4:'portal',a6:'portal'};
 s.hands.w=[{id:'portal-pawn',type:'pawn',name:'Pawn',description:'Pawn move'}];
 action(r,{type:'play_card_move',cardId:'portal-pawn',from:'f2',to:'f4'});
 assert.equal(s.turn,'w');assert.equal(s.pendingPortal?.from,'f4');
 const turn=s.turnNumber,completed=s.grounds.completedTurns;
 const waiting=structuredClone(s);
 action(r,{type:'resolve_portal',transport},'b');assert.deepEqual(s,waiting);
 action(r,{type:'pass_turn'});assert.deepEqual(s,waiting);
 action(r,{type:'resolve_portal',transport});
 assert.equal(s.pendingPortal,null);assert.equal(s.turn,'b');assert.equal(s.fen.split(' ')[1],'b');
 assert.equal(s.turnNumber,turn+1);assert.equal(s.grounds.completedTurns,completed+1);
 const board=createSafeChess(s.fen);
 assert.equal(board.get((transport?'a6':'f4') as any)?.color,'w');
 assert.equal(board.get((transport?'f4':'a6') as any),undefined);
});
test('blocked Portal transport leaves the choice pending and allows staying',()=>{
 const r=room(),s=r.gameState;s.grounds.selected=['portal','boost'];s.grounds.tiles={f4:'portal',a6:'portal'};
 pawnAt(s,'a6','b');s.awakenedRooks=[{square:'a6',color:'b',turnsRemaining:3,hasCaptured:false}];
 s.hands.w=[{id:'p',type:'pawn',name:'Pawn',description:'Pawn'}];
 action(r,{type:'play_card_move',cardId:'p',from:'f2',to:'f4'});
 const before=structuredClone(s);action(r,{type:'resolve_portal',transport:true});assert.deepEqual(s,before);
 action(r,{type:'resolve_portal',transport:false});assert.equal(s.turn,'b');
});

for(const occupant of ['empty','friendly','enemy'] as const)test(`one-click Portal Travel ${occupant}`,()=>{
 const r=room(),s=r.gameState;s.grounds.selected=['portal','boost'];s.grounds.tiles={c4:'portal',f5:'portal'};
 pawnAt(s,'c4','w');if(occupant!=='empty')pawnAt(s,'f5',occupant==='friendly'?'w':'b');
 const target=portalTravelTarget(s,'w');assert.deepEqual(target,{from:'c4',to:'f5'});
 const turn=s.turnNumber;action(r,{type:'portal_move',from:target!.from});
 const board=createSafeChess(s.fen);assert.equal(board.get('f5')?.color,'w');assert.equal(board.get('c4')?.color,occupant==='friendly'?'w':undefined);
 assert.equal(s.turnNumber,turn);assert.equal(s.turn,'w');assert.equal(portalTravelTarget(s,'w'),undefined);
 if(occupant==='enemy')assert.ok(s.captures.w.some((p:any)=>p.type==='p'&&p.color==='b'));
});
for(const blocked of ['monolith','restricted','invulnerable'] as const)test(`Travel rejects ${blocked} without changing state`,()=>{
 const r=room(),s=r.gameState;s.grounds.selected=['portal','boost'];s.grounds.tiles={c4:'portal',f5:'portal'};pawnAt(s,'c4','w');
 if(blocked==='monolith')s.monolithSquare='f5';
 if(blocked==='restricted')s.restrictedSquares=['f5'];
 if(blocked==='invulnerable'){pawnAt(s,'f5','b');s.awakenedRooks=[{square:'f5',color:'b',turnsRemaining:3,hasCaptured:false}];}
 const before=structuredClone(s);assert.equal(portalTravelTarget(s,'w'),undefined);action(r,{type:'portal_move',from:'c4'});assert.deepEqual(s,before);
});

for(const locked of [true,false])test(`end-turn hand refill respects Joker lock=${locked}`,()=>{
 const r=room(),s=r.gameState;
 s.hands.w=[{id:'remaining',type:'wild',name:'Wild',description:'Wild',isJokerWild:locked}];s.jokerLocked.w=locked;
 action(r,{type:'pass_turn'});
 assert.equal(s.hands.w.length,locked?1:5);assert.equal(s.turn,'b');
});
test('tile placement refills a short hand at turn end',()=>{
 const r=room();r.gameState.hands.w=[];
 action(r,{type:'place_ground',groundType:'defense',square:'d4'});
 assert.equal(r.gameState.hands.w.length,5);assert.equal(r.gameState.turn,'b');
});

test('Draw & Swap requires two unique hand cards before any other gameplay',()=>{
 const r=room(),s=r.gameState;s.powerUps.w.draw=1;
 action(r,{type:'start_powerup_draw'});assert.ok(s.pendingSwapDiscard);assert.equal(s.hands.w.length,7);
 const waiting=structuredClone(s);
 for(const msg of [{type:'use_powerup_draw',discardCardIds:[]},{type:'use_powerup_draw',discardCardIds:[s.hands.w[0].id]},{type:'use_powerup_draw',discardCardIds:[s.hands.w[0].id,s.hands.w[0].id]},{type:'pass_turn'},{type:'use_powerup_vision'},{type:'start_powerup_draw'}]){
  action(r,msg);assert.deepEqual(s,waiting);
 }
 action(r,{type:'use_powerup_draw',discardCardIds:s.hands.w.slice(0,2).map((c:any)=>c.id)});
 assert.equal(s.pendingSwapDiscard,null);assert.equal(s.hands.w.length,5);assert.equal(s.turn,'w');assert.equal(s.powerUps.w.draw,0);
});
for(const ownBackRank of [false,true])test(`Mature Bishop circle revival promotion respects own back rank=${ownBackRank}`,()=>{
 const r=room(),s=r.gameState;
 s.fen=ownBackRank?'7k/8/8/8/8/2B5/8/4K3 w - - 0 1':'7k/8/2B5/8/8/8/8/4K3 w - - 0 1';
 s.captures={w:[],b:[{type:'sp',color:'w'}]};s.hands.w=[{id:'bishop',type:'awakening_bishop',name:'Bishop',description:'Bishop'}];
 const turn=s.turnNumber,revive=ownBackRank?'c1':'c8';
 s.summoningCircles=[{id:'c',owner:'w',square:revive,remaining:0,createdTurn:1}];s.pendingSummon={player:'w',circleId:'c',nextTurn:'b'};action(r,{type:'resolve_summon',captureIndex:0});
 assert.equal(s.turn,'b');assert.equal(s.turnNumber,turn+1);assert.equal(s.fen.split(' ')[1],'b');
 assert.equal(createSafeChess(s.fen).get(revive as any)?.type,ownBackRank?'p':'q');
 assert.equal(s.superPawns.includes(revive),ownBackRank);assert.equal(s.pendingSummon,null);
});
test('Portal automatically promotes a landing Super Pawn to Queen',()=>{
 const r=room(),s=r.gameState;s.fen='7k/2P5/8/8/8/8/8/4K3 w - - 0 1';s.superPawns=['c7'];
 s.grounds.selected=['portal','boost'];s.grounds.tiles={c7:'portal',b8:'portal'};
 action(r,{type:'portal_move',from:'c7'});
 assert.equal(createSafeChess(s.fen).get('b8')?.type,'q');assert.ok(!s.superPawns.includes('b8'));
});

test('only the two guaranteed Pawns per player start publicly known',()=>{
 const s=state();
 for(const color of ['w','b'] as const){const known=s.hands[color].filter(c=>c.knownStartingPawnFor===color);assert.equal(known.length,2);assert.ok(known.every(c=>c.type==='pawn'));assert.equal(s.hands[color].filter(c=>!c.knownStartingPawnFor).length,3);}
 assert.ok(s.deck.every(c=>!c.knownStartingPawnFor));
});
test('playing a guaranteed Pawn removes its public-hand knowledge without changing the other Pawn',()=>{
 const r=room();const card=r.gameState.hands.w.find((c:any)=>c.knownStartingPawnFor==='w');
 action(r,{type:'play_card_move',cardId:card.id,from:'e2',to:'e4'});
 assert.equal(createSafeChess(r.gameState.fen).get('e4')?.type,'p');
 assert.equal(r.gameState.hands.w.filter((c:any)=>c.knownStartingPawnFor==='w').length,1);
 assert.equal(r.gameState.discard.find((c:any)=>c.id===card.id)?.knownStartingPawnFor,undefined);
 assert.equal(r.gameState.hands.b.filter((c:any)=>c.knownStartingPawnFor==='b').length,2);
});
test('trigger animation includes the landed piece and immunity without exposing untriggered traps',()=>{
 const s=state();s.grounds!.traps=[{id:'m',type:'mine',owner:'b',square:'e1'}];landGround(s,'e1');
 const event=s.grounds!.events.find(e=>e.type==='mine')!;assert.equal(event.square,'e1');assert.equal(event.piece?.type,'k');assert.equal(event.immune,true);
});
