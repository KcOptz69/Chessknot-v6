import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MainTutorialOverlay} from '../src/components/MainTutorialOverlay.tsx';
import {initialTutorial} from '../src/components/tutorialBattle.ts';
import {DiscardModal,DiscardRedrawModal} from '../src/components/Modals.tsx';
const noop=()=>{};
test('active tutorial ends with exactly one START GAME action',()=>{
 for(const phase of ['play','finished'] as const){
  const html=renderToStaticMarkup(<MainTutorialOverlay state={{...initialTutorial(),phase,step:12}} dispatch={noop} compact={false} onExit={noop} onOpenPanel={noop} onResetSelection={noop}/>);
  assert.equal((html.match(/<button/g)||[]).length,1);
  assert.match(html,/START GAME/);
  assert.doesNotMatch(html,/Practice again|Finish tutorial|Return to your game|Exit tutorial/);
 }
});
test('discard dialogs identify the whole popup for the active spotlight',()=>{
 const exchange=renderToStaticMarkup(<DiscardModal isOpen hand={[]} onCancel={noop} onConfirmDiscard={noop}/>);
 const redraw=renderToStaticMarkup(<DiscardRedrawModal isOpen hand={[]} onCancel={noop} onConfirm={noop}/>);
 assert.match(exchange,/data-tutorial-dialog="exchange" role="dialog"/);
 assert.match(redraw,/data-tutorial-dialog="redraw" role="dialog"/);
});
