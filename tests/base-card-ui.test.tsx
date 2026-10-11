import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CardHand} from '../src/components/CardHand.tsx';
import {RulesModal} from '../src/components/Modals.tsx';
import {RuleGallery} from '../src/components/Rulebook.tsx';
import {RULE_SECTIONS} from '../src/components/rulebookData.ts';
import {PlayerPanel} from '../src/components/UI.tsx';
import {GameLog} from '../src/components/GameLog.tsx';
import {ThemeProvider} from '../src/context/ThemeContext.tsx';
import {activityInfoNotices} from '../src/components/MatchActivityNotices.tsx';
import {createCard} from '../src/utils/chessLogic.ts';
import type {GameLogEntry} from '../src/types.ts';
function hand(type:'brick'|'refresh',locked=false){const card=createCard(type,1);return renderToStaticMarkup(<ThemeProvider><CardHand hand={[card]} selectedCardId={card.id} onSelectCard={()=>{}} onPlayRefresh={()=>{}} isJokerLocked={locked} isMyTurn playerColor="w" lastMovedPiece={null}/></ThemeProvider>);}
test('Refresh card shows FREE on face and FREE ACTION beside name; Brick has neither action tag nor use button',()=>{
 const refresh=hand('refresh');assert.match(refresh,/hand-free-action-badge[^>]*>FREE/);assert.match(refresh,/FREE ACTION/);assert.match(refresh,/REFRESH \(FREE\)/);
 const brick=hand('brick');assert.match(brick,/UNPLAYABLE/);assert.ok(!brick.includes('FREE ACTION'));assert.ok(!brick.includes('MOVE ACTION'));assert.ok(!brick.includes('hand-free-action-badge'));
});
test('Refresh activation is disabled during Joker Wild Surge',()=>{assert.match(hand('refresh',true),/<button disabled=""[^>]*>REFRESH \(FREE\)<\/button>/);});
test('own player deck counter precedes army points without changing opponent tags',()=>{
 const tag=renderToStaticMarkup(<PlayerPanel name="Player" color="w" active cards={5} points={39} deckCount={34}/>);
 assert.ok(tag.indexOf('player-deck-count')<tag.indexOf('player-points'));assert.match(tag,/34 cards left in draw pile/);
 const opponent=renderToStaticMarkup(<PlayerPanel name="Opponent" color="b" active={false} cards={5} points={39}/>);assert.ok(!opponent.includes('player-deck-count'));
});
function event(overrides:Partial<GameLogEntry>):GameLogEntry{return {id:'event',turn:'b',turnNumber:1,actionType:'move',detail:'',timestamp:1,whitePoints:39,blackPoints:39,...overrides};}
test('opponent notices include trap placement without its location, Wild Awakening, Refresh and discarded Brick',()=>{
 const cases=[event({trapEventType:'trap-place',detail:'Black placed a trap.'}),event({cardName:'Awakening: Queen (Played as Wild)'}),event({actionType:'refresh'}),event({actionType:'pass',detail:'Discarded Brick.'})];
 const text=cases.flatMap(e=>activityInfoNotices(e,'w')).map(n=>n.text).join(' ');
 assert.match(text,/placed a trap/);assert.ok(!/[a-h][1-8]/.test(text));assert.match(text,/Awakening card as Wild/);assert.match(text,/played Refresh/);assert.match(text,/discarded Brick/);
 assert.deepEqual(cases.flatMap(e=>activityInfoNotices(e,'b')),[]);
});
test('Refresh plus Brick notices have distinct IDs so both dismiss after their timer',()=>{
 const n=activityInfoNotices(event({actionType:'refresh',detail:'Discarded Brick.'}),'w');assert.equal(n.length,2);assert.notEqual(n[0].id,n[1].id);
});
test('deck refresh confirmation is persistent for both players',()=>{
 const e=event({actionType:'deck_refresh',detail:'The draw pile ran out.'});
 for(const color of ['w','b'] as const){const n=activityInfoNotices(e,color);assert.equal(n[0].title,'Deck refreshed');assert.equal(n[0].duration,0);}
});
test('trap filter appears only with Expansion IV enabled',()=>{
 const entries=[event({trapEventType:'mine',cardName:'Mine Trap'})];
 assert.match(renderToStaticMarkup(<GameLog historyLog={entries} trapsEnabled/>),/Activated Traps/);
 assert.ok(!renderToStaticMarkup(<GameLog historyLog={entries}/>).includes('Activated Traps'));
});
test('rulebook opens to an image menu with unreleased banners disabled',()=>{
 const html=renderToStaticMarkup(<RulesModal isOpen onClose={()=>{}}/>);
 assert.match(html,/CHESSKNOT OFFICIAL RULEBOOK/);
 for(const name of ['HOW TO PLAY','SHIFTING PARADIGM','CHAMPIONS OF THE MONOLITH','THE AWAKENING','THE TREACHEROUS GROUNDS'])assert.ok(html.includes(name));
 const buttons=html.match(/<button[^>]*>[\s\S]*?<\/button>/g)||[];
 for(const name of ['ARCANE FRONTIER','ELEMENTAL KINGS','QUEST FOR GLORY','FORBIDDEN ARTIFACTS']){
  const button=buttons.find(b=>b.includes(name));assert.ok(button);assert.match(button!,/disabled=""/);
 }
 assert.ok(!html.includes('rb-detail-copy'));
 assert.equal(renderToStaticMarkup(<RulesModal isOpen={false} onClose={()=>{}}/>),'');
});
test('interactive rulebook retains new base rules and shows details above the icon grid',()=>{
 const base=RULE_SECTIONS.base;
 assert.match(base.deckIntroduction!,/40-card base draw pool/);assert.match(base.deckIntroduction!,/2 Refresh/);assert.match(base.deckIntroduction!,/1 Brick/);
 assert.match(base.cards.find(c=>c.id==='refresh')!.description,/including Refresh and any Brick/);
 assert.match(base.cards.find(c=>c.id==='brick')!.description,/neither a Move Action nor a Free Action/);
 const html=renderToStaticMarkup(<RuleGallery title="CARDS IN DECK" items={base.cards}/>);
 assert.ok(html.indexOf('rb-detail')<html.indexOf('rb-icon-grid'));
 assert.match(html,/Effect preview/);assert.match(html,/Pause example/);assert.match(html,/aria-controls=/);assert.match(html,/data-power-crop="wild"/);
});
