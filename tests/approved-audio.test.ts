import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playChampionSound, playHolySound, playElectricSound, playTimeRewindSound } from '../src/utils/audio.ts';

test('approved recordings route each champion and activation at softer volume; mute prevents playback', () => {
  const clips: {url:string;volume:number;played:boolean}[]=[];
  let muted=false;
  const oldAudio=Object.getOwnPropertyDescriptor(globalThis,'Audio');
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  class FakeAudio {
    volume=1; played=false;
    constructor(public url:string){clips.push(this);}
    play(){this.played=true;return Promise.resolve();}
  }
  Object.defineProperty(globalThis,'Audio',{configurable:true,value:FakeAudio});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>muted?'false':'true'}});
  try {
    for(const type of ['berserker','musketeer','ninja'] as const){playChampionSound(type,false);playChampionSound(type,true);}
    playHolySound();playElectricSound();playTimeRewindSound();
    assert.deepEqual(clips.map(c=>c.url.split('/').pop()?.split('.mp3')[0]),['berserker-summon','berserker-ultimate','musketeer-summon','musketeer-ultimate','ninja-summon','ninja-ultimate','beacon-activation','static-activation','clock-activation']);
    assert.deepEqual(clips.map(c=>c.volume),[0.18,0.18,0.18,0.18,0.18,0.18,0.36,0.18,0.36]);
    assert.ok(clips.every(c=>c.played));
    muted=true;playChampionSound('berserker');playHolySound();playElectricSound();playTimeRewindSound();
    assert.equal(clips.length,9);
  } finally {
    if(oldAudio)Object.defineProperty(globalThis,'Audio',oldAudio);else delete (globalThis as any).Audio;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as any).localStorage;
  }
});
