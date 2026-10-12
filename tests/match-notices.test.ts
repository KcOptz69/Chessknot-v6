import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readMatchNotice,writeMatchNotice} from '../src/utils/matchNotices.ts';
test('match notices survive another read while a new match starts fresh',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');const values=new Map<string,string>();
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 try{writeMatchNotice('items:match1',['event1']);assert.deepEqual(readMatchNotice('items:match1',[]),['event1']);assert.deepEqual(readMatchNotice('items:match2',[]),[]);writeMatchNotice('awakening:match1',{w:true,b:null});assert.deepEqual(readMatchNotice('awakening:match1',{}),{w:true,b:null});}finally{if(previous)Object.defineProperty(globalThis,'sessionStorage',previous);else delete (globalThis as any).sessionStorage;}
});
