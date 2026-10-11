import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {FrontierIntro} from '../src/components/FrontierUI.tsx';

test('image-based Frontier introduction has separate desktop and portrait artwork with real controls',()=>{
 const html=renderToStaticMarkup(<FrontierIntro onClose={()=>{}}/>);
 assert.match(html,/intro-desktop-approved\.png/);
 assert.match(html,/intro-mobile-approved\.png/);
 assert.match(html,/orientation: portrait/);
 assert.equal((html.match(/<button /g)||[]).length,2);
 assert.match(html,/aria-label="Close expansion introduction"/);
 assert.match(html,/frontier-poster-enter/);
 assert.match(html,/Enter the Frontier/);
});
test('poster rules remain readable to assistive technology',()=>{
 const html=renderToStaticMarkup(<FrontierIntro onClose={()=>{}}/>);
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/aria-describedby="frontier-intro-rules"/);
 assert.match(html,/requires a Key to open/);
 assert.match(html,/must be captured twice/);
 assert.match(html,/Kings cannot attack it at full health/);
});
