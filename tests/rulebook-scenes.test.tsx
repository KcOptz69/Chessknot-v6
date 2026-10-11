import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Rulebook,RuleGallery} from '../src/components/Rulebook.tsx';
import {RULE_SECTIONS,BASE_POWERS} from '../src/components/rulebookData.ts';
import {ruleScenes} from '../src/components/rulebookScenes.ts';
import {RuleDemo} from '../src/components/RuleDemo.tsx';

test('direct expansion links open the matching rulebook section, with introductions and no controls section',()=>{
 for(const id of ['expansion1','expansion2','expansion3','expansion4'] as const){
  const html=renderToStaticMarkup(<Rulebook isOpen initialSection={id} onClose={()=>{}}/>);
  assert.ok(html.includes(RULE_SECTIONS[id].introduction!));
  assert.match(html,/Back to menu/);assert.ok(!html.includes('IN-GAME CONTROLS'));assert.ok(!html.includes('rb-banner-grid'));
 }
 const awakening=renderToStaticMarkup(<Rulebook isOpen initialSection="expansion3" onClose={()=>{}}/>);
 assert.ok(!awakening.includes('aria-controls')||!awakening.includes('>SOUL RELEASE</strong>'));
 assert.equal(RULE_SECTIONS.expansion3.cards.some(c=>c.card==='soul_release'),false);
});
test('base copy appears in the requested order and uses one power-up heading',()=>{
 const html=renderToStaticMarkup(<Rulebook isOpen initialSection="base" onClose={()=>{}}/>);
 assert.ok(html.indexOf('CARDS IN DECK')<html.indexOf('The 40-card base draw pool'));
 assert.equal((html.match(/>POWER-UPS</g)||[]).length,1);
 assert.ok(!html.includes('except during Joker Wild Surge'));assert.ok(!html.includes('Exhausted cards never return'));
 assert.match(html,/Discard &amp; Redraw \(Move Action\)/);assert.match(html,/Power-ups are special abilities/);
});
test('all information panels offer a close control; Exchange, Vision and Brick have no animation',()=>{
 for(const item of [...BASE_POWERS,...RULE_SECTIONS.base.cards]){
  const html=renderToStaticMarkup(<RuleGallery title="Information" items={[item]}/>);
  assert.match(html,/Close card information/);
  if(['draw','vision','brick'].includes(item.id))assert.ok(!html.includes('Effect preview'));
 }
 assert.equal(BASE_POWERS.find(p=>p.id==='draw')!.name,'EXCHANGE');
});
test('standard capture examples use legal movement and replace an enemy with the moving piece',()=>{
 for(const type of ['pawn','knight','bishop','rook','queen']){
  const [before,after]=ruleScenes(type),attacker=before.units[0],victim=before.units.find(p=>p.color==='b')!;
  assert.ok(victim);const dx=Math.abs(attacker.x-victim.x),dy=Math.abs(attacker.y-victim.y);
  if(type==='pawn')assert.ok(dx===1&&dy===1&&victim.y<attacker.y);
  if(type==='knight')assert.ok(dx*dy===2);
  if(type==='bishop')assert.equal(dx,dy);
  if(type==='rook')assert.ok(dx===0||dy===0);
  if(type==='queen')assert.ok(dx===0||dy===0||dx===dy);
  assert.equal(after.units.length,1);assert.deepEqual([after.units[0].x,after.units[0].y],[victim.x,victim.y]);
 }
});
test('Previous uses successive turns; Awakened Knight uses two L jumps with only the second capturing',()=>{
 const previous=ruleScenes('previous');assert.match(previous[0].caption,/Turn 1/);assert.match(previous[2].caption,/Turn 2/);
 const stages=ruleScenes('awakening_knight');
 for(let n=1;n<stages.length;n++){
  const a=stages[n-1].units[0],b=stages[n].units[0];assert.equal(Math.abs(a.x-b.x)*Math.abs(a.y-b.y),2);
 }
 assert.ok(stages[1].units.some(p=>p.color==='b'));assert.ok(!stages[2].units.some(p=>p.color==='b'));assert.ok(!stages[2].units[0].awakened);
});
test('traps trigger on an opponent landing; powered tile departures follow the tile movement',()=>{
 for(const type of ['mine','poison','banish','disarm']){
  const stages=ruleScenes(type),tile=stages[0].tiles![0],landing=stages[1].units[0];
  assert.equal(landing.color,'b');assert.deepEqual([landing.x,landing.y],[tile.x,tile.y]);assert.equal(stages[1].effect,undefined);assert.ok(!landing.poison);assert.equal(stages[2].effect?.type,type);assert.deepEqual(stages[2].units.map(p=>[p.x,p.y]),[[landing.x,landing.y]]);
 }
 for(const type of ['boost','gravity']){
  const stages=ruleScenes(type),a=stages[1].units[0],b=stages[2].units[0];assert.equal(a.type,'n');
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  if(type==='gravity')assert.equal(Math.max(dx,dy),1);else assert.ok((dx===0||dy===0||dx===dy)&&Math.max(dx,dy)>1);
 }
});
test('Bishop revives a Queen on the circle and Queen summons a ghost within her 5×5 area',()=>{
 const bishop=ruleScenes('awakening_bishop'),circle=bishop[1].tiles![0],queen=bishop.at(-1)!.units.find(p=>p.type==='q')!;
 assert.deepEqual([queen.x,queen.y],[circle.x,circle.y]);
 const soul=ruleScenes('awakening_queen').at(-1)!.units,owner=soul.find(p=>p.id==='q')!,ghost=soul.find(p=>p.ghost)!;
 assert.equal(ghost.type,'q');assert.equal(ghost.color,'w');assert.ok(Math.abs(owner.x-ghost.x)<=2&&Math.abs(owner.y-ghost.y)<=2);
});
test('Wild selection covers all five standard piece types; hand examples contain five cards',()=>{
 assert.deepEqual(ruleScenes('wild').map(s=>s.units.find(p=>p.selected)!.type),['p','n','b','r','q']);
 for(const type of ['joker','refresh'])for(const s of ruleScenes(type))assert.equal(s.hand!.length,5);
 const joker=ruleScenes('joker').at(-1)!;assert.ok(joker.gold);assert.ok(joker.hand!.every(c=>c==='wild'));
 for(const section of Object.values(RULE_SECTIONS))for(const item of [...section.cards,...section.powers,...section.extra||[]]){
  for(const s of ruleScenes(item.demo||item.id))for(const p of s.units)assert.ok(p.x>=0&&p.x<5&&p.y>=0&&p.y<5);
 }
 const html=renderToStaticMarkup(<RuleDemo item={RULE_SECTIONS.base.cards[0]}/>);assert.match(html,/Next example step/);assert.match(html,/left:40%;top:80%/);
});

test('Champion examples move first, then demonstrate each ultimate',()=>{
 for(const type of ['berserker','musketeer','summoner','ninja']){
  const stages=ruleScenes(type);assert.match(stages[0].caption,/Movement/);assert.match(stages.at(-1)!.caption,/Ultimate/);
  assert.notDeepEqual([stages[0].units[0].x,stages[0].units[0].y],[stages[1].units[0].x,stages[1].units[0].y]);
  if(type!=='berserker')assert.deepEqual(stages[1].units[0],stages.at(-1)!.units[0]);
 }
 const ninja=ruleScenes('ninja');assert.equal(ninja[1].units.filter(p=>p.color==='b').length,2);assert.equal(ninja.at(-1)!.units.length,1);
 const summon=ruleScenes('summoner');assert.deepEqual(summon.at(-1)!.effect,{type:'portal-arrival',x:2,y:2});
});
test('Beacon and Static prevent capture with visible status markers; Clock restores the victim',()=>{
 for(const type of ['beacon','static']){
  const stages=ruleScenes(type),last=stages.at(-1)!;
  assert.ok(stages.some(s=>s.beam?.blocked));assert.ok(last.units.some(p=>p.id==='p'));
  assert.ok(last.units.some(p=>type==='beacon'?p.protected:p.stunned));
 }
 const clock=ruleScenes('clock');assert.ok(clock[0].units.some(p=>p.id==='n'));assert.ok(!clock[1].units.some(p=>p.id==='n'));
 assert.deepEqual(clock.at(-1)!.units,clock[0].units);
 assert.ok(ruleScenes('push')[1].units[0].wind);
});

test('Berserker ultimate preview captures only one destination enemy',()=>{
 const stages=ruleScenes('berserker');assert.equal(stages[2].units.filter(p=>p.color==='b').length,1);
 assert.deepEqual([stages[3].units[0].x,stages[3].units[0].y],[stages[2].units[1].x,stages[2].units[1].y]);
 assert.equal(stages[3].units.length,1);
});
