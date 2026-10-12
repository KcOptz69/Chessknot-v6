import React from 'react';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {FrontierRuleDiscoveries,FrontierRuleBoard,RuleGallery} from '../src/components/Rulebook.tsx';
import {FRONTIER_RULES,RULE_BANNERS,RULE_SECTIONS} from '../src/components/rulebookData.ts';
test('Arcane Frontier is available and its discoveries group rewards by source',()=>{
 assert.equal(RULE_BANNERS.find(b=>b.id==='expansion5')!.available,true);assert.equal(RULE_SECTIONS.expansion5.cards[0].count,2);
 const html=renderToStaticMarkup(<FrontierRuleDiscoveries/>);for(const heading of ['The Backpack','The Treasure Chest','The Arcane Golem','CHEST REWARDS','GOLEM DROPS','MIMIC CHEST'])assert.ok(html.includes(heading));assert.ok(!html.includes('CHEST KEY'));assert.ok(!html.includes('>ITEMS<'));assert.ok(html.indexOf('MIMIC CHEST')>html.indexOf('CHEST REWARDS'));assert.ok(!html.includes('CONTROLLED GOLEM'));
});
test('Golem Core contains related rules and item descriptions omit activation steps',()=>{
 const core=FRONTIER_RULES.items.find(i=>i.id==='core')!;assert.equal(core.related!.name,'CONTROLLED GOLEM');const html=renderToStaticMarkup(<RuleGallery title="GOLEM DROPS" items={[core]}/>);assert.ok(html.includes('CONTROLLED GOLEM'));assert.ok(html.includes('10 CAPTURE POINTS'));
 for(const item of FRONTIER_RULES.items)assert.ok(!`${item.description} ${item.note}`.includes('→'));
 assert.match(FRONTIER_RULES.items.find(i=>i.id==='sigil')!.description,/only when Champions of the Monolith is enabled/);
});
test('expanded-board figure places Mystic ranks in the center',()=>{
 const html=renderToStaticMarkup(<FrontierRuleBoard/>);assert.equal((html.match(/<span/g)||[]).length,96);assert.equal((html.match(/rb-frontier-map-mystic/g)||[]).length,32);assert.ok(html.indexOf('<small>5</small>')<html.indexOf('<small>Z</small>'));assert.ok(html.indexOf('<small>W</small>')<html.indexOf('<small>4</small>'));
});
