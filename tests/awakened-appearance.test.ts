import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awakenedAppearance as form} from '../src/utils/awakenedAppearance.ts';
test('Bishop follows its identity only while its circle is active',()=>{
 const c:any={id:'circle',bishopId:'bishop',owner:'w',square:'c1',remaining:3,createdTurn:1};
 assert.equal(form('b','w','bishop',2,[c],undefined,[]),true);
 assert.equal(form('b','w','other',2,[c],undefined,[]),false);
 for(const status of ['finished','interrupted'])assert.equal(form('b','w','bishop',2,[{...c,[status]:true}],undefined,[]),false);
});
test('Queen stays transformed only while its exact Soul Release is held',()=>{
 const hands:any={w:[{type:'soul_release',soul:{queenId:'queen'}}],b:[]};
 assert.equal(form('q','w','queen',4,[],hands,[]),true);
 assert.equal(form('q','w','other',4,[],hands,[]),false);
 assert.equal(form('q','w','queen',5,[],{w:[],b:[]},[]),false);
});
test('King reverts after opponent completes the next turn',()=>{
 const history:any=[{actionType:'awakening',cardName:'Awakening: King',turn:'w',turnNumber:7}];
 assert.equal(form('k','w','king',8,[],undefined,history),true);
 assert.equal(form('k','w','king',9,[],undefined,history),false);
 assert.equal(form('k','b','king',8,[],undefined,history),false);
});
