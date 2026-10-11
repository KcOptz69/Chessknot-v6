import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createInitialGameState, createSafeChess, syncFenTurn } from '../src/utils/chessLogic.ts';

// Load the real handler without opening a listening server or periodic timer.
const harness = new URL('../.knight-handler-test.ts', import.meta.url);
const source = readFileSync(new URL('../server.ts',import.meta.url),'utf8');
writeFileSync(harness, source.replace(/\nstartServer\(\);\s*$/, '\nexport { handleGameAction };\n'));
const interval = globalThis.setInterval;
globalThis.setInterval = (() => 0) as any;
let handleGameAction: any;
try { ({handleGameAction} = await import(harness.href)); }
finally { globalThis.setInterval = interval; unlinkSync(harness); }
function room(color: 'w' | 'b' = 'w', cardType = 'knight') {
  const state = createInitialGameState();
  state.status = 'playing';
  state.turn = color;
  state.fen = syncFenTurn(state.fen,color);
  state.grounds = undefined; // This suite isolates base movement from randomly selected portals.
  state.superKnights = [color === 'w' ? 'b1' : 'b8'];
  state.hands[color] = [{id:'test-card',type:cardType,name:'Test card',description:'Test'} as any];
  return {gameState:state,lobbyConfig:{},players:{}} as any;
}
for (const color of ['w','b'] as const) {
  test(`${color}: two jumps consume one card and stay a Knight`, () => {
    const r=room(color);
    const [from,to,secondTo] = color==='w' ? ['b1','c3','d5'] : ['b8','c6','d4'];
    handleGameAction(r,{type:'play_card_move',cardId:'test-card',from,to,secondTo},color);
    const board=createSafeChess(r.gameState.fen);
    assert.equal(board.get(secondTo as any)?.type,'n');
    assert.equal(board.get(from as any),undefined);
    assert.equal(board.get(to as any),undefined);
    assert.equal(r.gameState.turn,color==='w'?'b':'w');
    assert.equal(r.gameState.discard.filter((c:any)=>c.id==='test-card').length,1);
    assert.equal(r.gameState.superKnights.length,0);
  });
}
test('declining second move retains Super Knight on first destination', () => {
  const r=room();
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3'},'w');
  assert.ok(r.gameState.superKnights.includes('c3'));
  assert.equal(r.gameState.turn,'b');
});
for (const type of ['play_card_move','use_powerup_wild_move','play_awakening_knight']) {
  test(`${type}: invalid second jump leaves entire GameState unchanged`, () => {
    const r=room('w',type==='play_awakening_knight'?'awakening_knight':'knight');
    const before=JSON.stringify(r.gameState);
    handleGameAction(r,{type,cardId:'test-card',from:'b1',to:'c3',secondTo:'c4'},'w');
    assert.equal(JSON.stringify(r.gameState),before);
  });
}
test('two captures rejected without losing first captured piece or card', () => {
  const r=room(); const board=createSafeChess(r.gameState.fen);
  board.put({type:'r',color:'b'},'c3'); board.put({type:'p',color:'b'},'d5');
  r.gameState.fen=board.fen(); const before=JSON.stringify(r.gameState);
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(JSON.stringify(r.gameState),before);
});
test('Champion captured on second jump is removed only on success', () => {
  const r=room(); r.gameState.champions.b={color:'b',square:'d5',type:'berserker'};
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(r.gameState.champions.b,null);
  assert.equal(createSafeChess(r.gameState.fen).get('d5')?.type,'n');
});
test('ordinary Knight cannot request second jump', () => {
  const r=room(); r.gameState.superKnights=[]; const before=JSON.stringify(r.gameState);
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(JSON.stringify(r.gameState),before);
});
test('spectator and wrong-turn requests cannot change state', () => {
  for (const actor of ['spectator','b']) {
    const r=room(); const before=JSON.stringify(r.gameState);
    handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},actor);
    assert.equal(JSON.stringify(r.gameState),before);
  }
});
test('Awakening double jump exhausts only its one card after success', () => {
  const r=room('w','awakening_knight');
  handleGameAction(r,{type:'play_awakening_knight',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(createSafeChess(r.gameState.fen).get('d5')?.type,'n');
  assert.equal(r.gameState.exhausted.filter((c:any)=>c.id==='test-card').length,1);
});

test('Awakening card used as Wild pays once and is not exhausted', () => {
  const r=room('w','awakening_rook');
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',asWild:true,from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(createSafeChess(r.gameState.fen).get('d5')?.type,'n');
  assert.equal(r.gameState.exhausted.some((c:any)=>c.id==='test-card'),false);
  assert.equal(r.gameState.discard.filter((c:any)=>c.id==='test-card').length,1);
});
test('first Champion capture earns exactly five points', () => {
  const r=room(); r.gameState.champions.b={color:'b',square:'c3',type:'berserker'};
  handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3',secondTo:'d5'},'w');
  assert.equal(createSafeChess(r.gameState.fen).get('d5')?.type,'n');
  assert.equal(r.gameState.champions.b,null);
  assert.equal(r.gameState.powerUpProgress.w,0);
});

test('Champions contribute five army points after deployment and ordinary moves',()=>{
 const r=room();r.gameState.champions.w={color:'w',square:'d4',type:'summoner'};
 handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3'},'w');
 assert.equal(r.gameState.whitePoints,44);
});
test('Champion capture records its real artwork and awards exactly five',()=>{
 const r=room();r.gameState.superKnights=[];r.gameState.champions.b={color:'b',square:'c3',type:'musketeer'};
 handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'b1',to:'c3'},'w');
 assert.deepEqual(r.gameState.captures.w,[{type:'musketeer',color:'b'}]);
 assert.equal(r.gameState.powerUpProgress.w,0);
});
test('resignation works off-turn and stops the clock',()=>{
 const r=room();r.gameState.clock.isRunning=true;
 handleGameAction(r,{type:'resign'},'b');
 assert.equal(r.gameState.status,'resigned');assert.equal(r.gameState.winner,'w');
 assert.equal(r.gameState.clock.isRunning,false);
});
test('spectators cannot resign',()=>{
 const r=room(),before=JSON.stringify(r.gameState);handleGameAction(r,{type:'resign'},'spectator');
 assert.equal(JSON.stringify(r.gameState),before);
});
test('Queen noncapture uses Wild, discards and does not exhaust',()=>{
 const r=room('w','awakening_queen');r.gameState.superKnights=[];const board=createSafeChess(r.gameState.fen);
 board.remove('d2');r.gameState.fen=board.fen();
 handleGameAction(r,{type:'play_awakening_queen',cardId:'test-card',from:'d1',to:'d3'},'w');
 assert.equal(createSafeChess(r.gameState.fen).get('d3')?.type,'q');
 assert.ok(r.gameState.discard.some((c:any)=>c.id==='test-card'));
 assert.ok(!r.gameState.exhausted?.some((c:any)=>c.id==='test-card'));
});
test('Queen capture earns Soul Release, exhausts, records capture and earns points',()=>{
 const r=room('w','awakening_queen');r.gameState.superKnights=[];const board=createSafeChess(r.gameState.fen);
 board.remove('d2');board.put({type:'r',color:'b'},'d3');r.gameState.fen=board.fen();
 handleGameAction(r,{type:'play_awakening_queen',cardId:'test-card',from:'d1',to:'d3',deploySquare:'c3'},'w');
 assert.equal(createSafeChess(r.gameState.fen).get('c3'),undefined);
 assert.equal(r.gameState.hands.w.find((c:any)=>c.type==='soul_release')?.soul.piece.type,'r');
 assert.ok(r.gameState.exhausted.some((c:any)=>c.id==='test-card'));
 assert.deepEqual(r.gameState.captures.w,[{type:'r',color:'b'}]);
 assert.equal(r.gameState.powerUpProgress.w,0);
});
test('invalid Queen movement leaves the entire state unchanged',()=>{
 const r=room('w','awakening_queen');const board=createSafeChess(r.gameState.fen);
 board.remove('d2');board.put({type:'r',color:'b'},'d3');r.gameState.fen=board.fen();const before=JSON.stringify(r.gameState);
 handleGameAction(r,{type:'play_awakening_queen',cardId:'test-card',from:'d1',to:'e4'},'w');
 assert.equal(JSON.stringify(r.gameState),before);
});
test('Awakened Rook may capture King after its first capture',()=>{
 const r=room('w','rook');r.gameState.superKnights=[];const board=createSafeChess(r.gameState.fen);
 board.remove('e2');board.remove('e7');board.put({type:'r',color:'w'},'e4');r.gameState.fen=board.fen();
 r.gameState.awakenedRooks=[{square:'e4',color:'w',turnsRemaining:3,hasCaptured:true}];
 handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'e4',to:'e8'},'w');
 assert.equal(createSafeChess(r.gameState.fen).get('e8')?.color,'w');
 assert.equal(r.gameState.winner,'w');
 assert.ok(r.gameState.captures.w.some((p:any)=>p.type==='k'));
});
test('Awakened Rook still cannot capture another normal piece',()=>{
 const r=room('w','rook');const board=createSafeChess(r.gameState.fen);board.put({type:'r',color:'w'},'e4');board.put({type:'p',color:'b'},'e5');r.gameState.fen=board.fen();
 r.gameState.awakenedRooks=[{square:'e4',color:'w',turnsRemaining:3,hasCaptured:true}];const before=JSON.stringify(r.gameState);
 handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'e4',to:'e5'},'w');assert.equal(JSON.stringify(r.gameState),before);
});
test('Queen capturing a Champion discards as Wild and awards exactly five points',()=>{
 const r=room('w','awakening_queen');const board=createSafeChess(r.gameState.fen);board.remove('d2');r.gameState.fen=board.fen();r.gameState.champions.b={color:'b',square:'d3',type:'ninja'};
 handleGameAction(r,{type:'play_awakening_queen',cardId:'test-card',from:'d1',to:'d3'},'w');
 assert.equal(r.gameState.champions.b,null);assert.ok(!r.gameState.exhausted.some((c:any)=>c.id==='test-card'));assert.ok(r.gameState.discard.some((c:any)=>c.id==='test-card'));
 assert.deepEqual(r.gameState.captures.w,[{type:'ninja',color:'b'}]);assert.equal(r.gameState.powerUpProgress.w,0);
});
test('revoking an attempted Champion capture leaves the captured ledger unchanged',()=>{
 const r=room('w','rook');r.gameState.champions.b={color:'b',square:'e5',type:'berserker'};r.gameState.awakenedRooks=[{square:'e4',color:'w',turnsRemaining:3,hasCaptured:true}];const board=createSafeChess(r.gameState.fen);board.put({type:'r',color:'w'},'e4');r.gameState.fen=board.fen();const before=JSON.stringify(r.gameState);
 handleGameAction(r,{type:'play_card_move',cardId:'test-card',from:'e4',to:'e5'},'w');assert.equal(JSON.stringify(r.gameState),before);
});
