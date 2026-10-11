import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {renderToStaticMarkup} from 'react-dom/server';
import {initialTutorial,tutorialReducer,tutorialTargets,TOUR,tutorialDialogue} from '../src/components/tutorialBattle.ts';
import type {TutorialState,TutorialAction} from '../src/components/tutorialBattle.ts';
import {ThemeProvider} from '../src/context/ThemeContext.tsx';
import {Rulebook} from '../src/components/Rulebook.tsx';
import {InteractiveTutorial} from '../src/components/InteractiveTutorial.tsx';
const act=(s:TutorialState,type:TutorialAction['type'],value?:string)=>tutorialReducer(s,{type,value});
function start(){let s=initialTutorial();for(let i=0;i<TOUR.length;i++){if(TOUR[s.tour].key==='info')s=act(s,'panel','info');s=act(s,'next');}assert.equal(s.phase,'play');return s;}
function card(s:TutorialState,type:string){const c=s.hand.find(c=>c.type===type);assert.ok(c,`missing ${type}`);return act(s,'card',c.id);}
function move(s:TutorialState,from:string,to:string,type?:string){const step=s.step;if(type)s=card(s,type);s=act(s,'square',from);assert.ok(tutorialTargets(s).includes(to as any),`${from} → ${to}: ${s.notice}`);s=act(s,'square',to);assert.equal(s.step,step+1,s.notice);assert.equal(s.hand.length,s.joker?4:5);if(s.pendingBot){s=act(s,'bot');s=act(s,'settle');}return s;}
test('tutorial follows the complete legal scripted battle and card/power-up flow',()=>{
 let s=start();assert.deepEqual(s.hand.map(c=>c.type),['pawn','pawn','knight','queen','rook']);
 s=move(s,'e2','e4','pawn');s=move(s,'e4','d5');
 assert.equal(new Chess(s.fen).get('d5')?.type,'q');assert.equal(s.capturePoints,1);
 assert.ok(!s.blackHand.includes('queen'));s=act(s,'power','vision');assert.equal(s.panel,'vision');s=act(s,'close-panel');s=move(s,'b1','c3','knight');
 assert.equal(new Chess(s.fen).get('g5')?.type,'q');s=act(s,'power','wild');s=move(s,'d2','d3');assert.equal(s.wild,0);
 const unavailable=act(s,'card',s.hand.find(c=>c.type==='rook')!.id);assert.equal(unavailable.fen,s.fen);
 s=act(s,'power','exchange');assert.equal(s.hand.length,7);assert.ok(!s.hand.some(c=>c.type==='bishop'));
 s=card(s,'queen');s=card(s,'rook');s=act(s,'exchange-confirm');assert.equal(s.hand.length,5);assert.equal(s.panel,null);
 s=move(s,'c3','e4','knight');assert.ok(new Chess(s.fen).isCheck());
 const hand=s.hand.map(c=>c.id);s=move(s,'e1','e2');assert.deepEqual(s.hand.map(c=>c.id),hand);assert.ok(!new Chess(s.fen).isCheck());
 s=move(s,'d1','d2','queen');s=move(s,'d2','a5','previous');assert.equal(s.capturePoints,10);assert.equal(s.wild,1);assert.equal(s.visionCharges,1);assert.ok(s.hand.some(c=>c.type==='brick'));
 const beforeBrick=JSON.stringify({...s,notice:''});const blockedBrick=act(s,'redraw');assert.equal(blockedBrick.panel,null);assert.equal(JSON.stringify({...blockedBrick,notice:''}),beforeBrick);s=act(s,'next');assert.equal(s.brickExplained,true);s=act(s,'redraw');s=card(s,'brick');s=act(s,'redraw');s=act(s,'bot');s=act(s,'settle');assert.equal(s.step,9);assert.ok(s.hand.some(c=>c.type==='refresh'));assert.equal(new Chess(s.fen).get('c8')?.type,'k');
 s=card(s,'refresh');s=act(s,'refresh');assert.equal(s.step,10);assert.equal(s.hand.length,5);s=card(s,'joker');s=act(s,'joker');assert.equal(s.step,11);assert.ok(s.hand.every(c=>c.type==='wild'));
 s=move(s,'g1','f3');assert.equal(s.step,12);s=act(s,'next');assert.equal(s.phase,'finished');
 assert.ok(s.log.some(l=>l.includes('Qxd5')));assert.ok(s.log.some(l=>l.includes('O-O-O')));
});
test('invalid tutorial actions cannot spend cards, charges, or change the board',()=>{
 const s=start();for(const action of [{type:'square',value:'e4'},{type:'power',value:'exchange'},{type:'refresh'},{type:'joker'}] as TutorialAction[]){const result=tutorialReducer(s,action);assert.equal(result.fen,s.fen);assert.deepEqual(result.hand,s.hand);assert.equal(result.wild,s.wild);assert.equal(result.deck,s.deck);}
});
test('tour requires opening Info and tutorial starts from the lower-left rulebook button',()=>{
 let s=initialTutorial();s={...s,tour:3};assert.equal(act(s,'next').tour,3);s=act(s,'panel','info');assert.equal(act(s,'next').tour,4);
 const html=renderToStaticMarkup(<Rulebook isOpen onClose={()=>{}}/>);assert.match(html,/Play interactive tutorial/);assert.ok(!html.includes('Choose a section to learn the game.'));
 const practice=renderToStaticMarkup(<ThemeProvider><InteractiveTutorial onClose={()=>{}}/></ThemeProvider>);assert.match(practice,/Friendly Joe/);assert.match(practice,/e2 White Pawn/);assert.match(practice,/Clock paused/);
});
test('interrupted Exchange selection can be reopened without drawing again',()=>{
 let s=start();s={...s,step:4};s=act(s,'power','exchange');const deck=s.deck;s=act(s,'close-panel');s=act(s,'power','exchange');assert.equal(s.panel,'exchange');assert.equal(s.deck,deck);assert.equal(s.hand.length,7);
});

test('dialogue reveals Vision, Exchange outcomes and new draws only after the action',()=>{
 const initial=start();
 let s={...initial,step:2};assert.ok(!tutorialDialogue(s).text.includes('no Queen'));s=act(s,'power','vision');assert.match(tutorialDialogue(s).text,/no Queen/);
 s={...initial,step:4};assert.ok(!tutorialDialogue(s).text.includes('did not include'));s=act(s,'power','exchange');assert.match(tutorialDialogue(s).text,/one Queen/);
 s={...initial,step:9};assert.ok(!tutorialDialogue(s).text.includes('Joker'));s={...s,selectedCard:'selected-refresh'};assert.match(tutorialDialogue(s).text,/cannot be used during Joker/);
});
test('Black waits for an explicit scheduled bot action and input remains locked until animation settles',()=>{
 let s=start();s=card(s,'pawn');s=act(s,'move',undefined);s=tutorialReducer(s,{type:'move',from:'e2',to:'e4'});
 assert.ok(s.pendingBot);assert.equal(new Chess(s.fen).get('d7')?.type,'p');assert.equal(new Chess(s.fen).get('d5'),undefined);
 const blocked=act(s,'power','vision');assert.equal(blocked.visionCharges,s.visionCharges);assert.deepEqual(blocked.hand,s.hand);
 s=act(s,'bot');assert.equal(new Chess(s.fen).get('d5')?.type,'p');assert.ok(s.animating);assert.equal(s.pendingBot,null);
 s=act(s,'settle');assert.equal(s.animating,false);
});

test('prepared tutorial deck is the actual 40-card base pool',()=>{
 const s=initialTutorial(),all=[...s.hand.map(c=>c.type),...s.blackHand,...s.deckTypes];assert.equal(all.length,40);
 for(const [type,n] of Object.entries({pawn:6,knight:6,bishop:6,rook:6,queen:6,wild:4,previous:2,refresh:2,brick:1,joker:1}))assert.equal(all.filter(t=>t===type).length,n);
});
