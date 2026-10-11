import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasOtherAwakeningDialog} from '../src/components/AwakeningTutorial.tsx';

// The observer receives both the outer modal and nested ground-dialog panels.
// closest() distinguishes ownership even when an own panel shares generic classes.
function candidate(insideOwnModal:boolean,expansionOffer=false):Element {
 return {closest:(selector:string)=>(insideOwnModal&&selector.includes('.awakening-tutorial-modal'))||(expansionOffer&&selector.includes('.frontier-expand-offer'))?({} as Element):null} as unknown as Element;
}
test('Awakening modal and its nested ground-dialog never block themselves',()=>{
 assert.equal(hasOtherAwakeningDialog([candidate(true),candidate(true)]),false);
 assert.equal(hasOtherAwakeningDialog([]),false);
});
test('external dialogs pause Awakening until they are removed',()=>{
 const own=candidate(true),other=candidate(false);
 assert.equal(hasOtherAwakeningDialog([own,other]),true);
 assert.equal(hasOtherAwakeningDialog([other,own]),true);
 assert.equal(hasOtherAwakeningDialog([own]),false);
});

test('expansion offer cannot create a reciprocal wait loop with Awakening',()=>{
 assert.equal(hasOtherAwakeningDialog([candidate(true),candidate(false,true)]),false);
 assert.equal(hasOtherAwakeningDialog([candidate(false,true),candidate(false)]),true);
});
