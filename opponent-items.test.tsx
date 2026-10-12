import React from 'react';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {createInitialGameState} from '../src/utils/chessLogic.ts';
import {addItem} from '../src/utils/frontier.ts';
import {OpponentPowerUps,opponentReserves} from '../src/components/OpponentPowerUps.tsx';
test('opponent inventory exposes only owned items with cooldowns counted against that owner',()=>{
 const s=createInitialGameState();for(const item of ['wings','star','lens','eye','banner'] as const)addItem(s,'b',item);addItem(s,'w','core');const f=s.frontier!;f.bags.b=true;f.keys.b=2;f.ownerTurns={w:18,b:4};f.inventories.b.find(i=>i.type==='wings')!.readyAfter=11;f.inventories.b.find(i=>i.type==='star')!.readyAfter=9;f.inventories.b.find(i=>i.type==='banner')!.remaining=0;
 const before=structuredClone(s);const props={powerUps:s.powerUps.b,frontier:f,color:'b' as const};const reserves=opponentReserves(props);
 assert.match(reserves.find(i=>i.art==='wings')!.status,/7 owner turns remaining/);assert.match(reserves.find(i=>i.art==='star')!.status,/5 owner turns remaining/);assert.ok(reserves.some(i=>i.art==='bag'));assert.equal(reserves.find(i=>i.art==='key')!.count,2);assert.ok(!reserves.some(i=>i.art==='banner'||i.art==='core'));assert.deepEqual(s,before);
 f.ownerTurns.b=5;assert.match(opponentReserves(props).find(i=>i.art==='wings')!.status,/6 owner turns remaining/);
});
test('only opponent items are inspectable, including during cooldown',()=>{
 const s=createInitialGameState();addItem(s,'b','wings');const f=s.frontier!;f.inventories.b[0].readyAfter=7;
 const html=renderToStaticMarkup(<OpponentPowerUps powerUps={s.powerUps.b} frontier={f} color="b"/>);
 assert.match(html,/Inspect Wings of Flight/);assert.match(html,/7 owner turns remaining/);assert.ok(!html.includes("Tap an opponent"));assert.match(html,/reserve-charge/);assert.ok(html.includes('disabled=""'));assert.doesNotMatch(html.match(/<button[^>]*aria-label="Inspect Wings of Flight[^>]*>/)?.[0]||'',/disabled/);assert.ok(!html.includes('Activate'));assert.match(html,/aria-controls=/);
});
test('descriptions include item effects, ground effects and Bind; inspection never changes state',()=>{
 const s=createInitialGameState();addItem(s,'b','eye');addItem(s,'b','star');s.grounds={selected:['gravity','banish'],charges:{w:{},b:{gravity:2,banish:1}}} as any;
 const props={powerUps:s.powerUps.b,grounds:s.grounds,frontier:s.frontier,color:'b' as const,hasEye:true};const before=structuredClone(s);const reserves=opponentReserves(props);
 assert.equal(reserves.find(i=>i.id==='vision')!.name,'Bind');assert.match(reserves.find(i=>i.art==='star')!.description,/five|5/i);assert.match(reserves.find(i=>i.art==='gravity')!.description,/King/);assert.equal(reserves.find(i=>i.art==='banish')!.count,1);assert.deepEqual(s,before);
});

test('inventory groups standard powers, tiles and items; items have no charge badges',()=>{
 const s=createInitialGameState();s.frontier!.keys.b=2;addItem(s,'b','banner');
 const html=renderToStaticMarkup(<OpponentPowerUps powerUps={s.powerUps.b} frontier={s.frontier} color="b"/>);
 for(const title of ['Standard Power-ups','Powered Tiles/Traps','Items'])assert.ok(html.includes(title));
 const items=html.slice(html.indexOf('<h4>Items</h4>'));
 assert.ok(!items.includes('reserve-charge'));assert.ok(!items.includes('2 charges'));
});
