import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fly,PIECE_MOVE_MS,PUSH_MOVE_MS,DOUBLE_JUMP_MS} from '../src/motion/runtime.ts';
import {isCardPermittedForPiece,createCard} from '../src/utils/chessLogic.ts';
import {isMotionBusy,setMotionBusy} from '../src/motion/status.ts';

class Element {
 style:any={getPropertyValue(key:string){return this[key]||''},getPropertyPriority(){return ''},setProperty(key:string,value:string){this[key]=value},removeProperty(key:string){delete this[key]}};
 dataset:any={};attributes:any[]=[];id='';namespaceURI='html';removed=false;children:any[]=[];
 constructor(public rect:any){}
 append(node:any){this.children.push(node)} setAttribute(){} removeAttribute(){} hasAttribute(){return false}
 querySelectorAll(){return []} cloneNode(){return new Element(this.rect)} getBoundingClientRect(){return this.rect}
 remove(){this.removed=true}
}
function setup(){
 const nodes:Element[]=[];const start={left:40,top:120,width:40,height:40,right:80,bottom:160};
 const end={left:200,top:40,width:40,height:40,right:240,bottom:80};const target=new Element(end);
 Object.assign(globalThis,{innerWidth:1000,innerHeight:1000,window:{matchMedia:()=>({matches:false})},document:{hidden:false,createElement:()=>new Element(end),body:{append:(n:Element)=>nodes.push(n)}}});
 const animations:any[][]=[];const batch={animate:(...args:any[])=>animations.push(args)};
 return {nodes,start,end,target,animations,batch};
}
test('Push is a 320ms straight slide without lift or a double-move path',()=>{
 const x=setup();fly(x.batch as any,{node:new Element(x.start) as any,rect:x.start},x.end,x.target as any,0,false,'push');
 const flight=x.animations.at(-1)!;assert.equal(flight[2],PUSH_MOVE_MS);assert.equal(PUSH_MOVE_MS,320);
 assert.equal(flight[1].length,2);assert.equal(flight[1][0].transform,'translate(-160px,80px) scale(1,1)');
 assert.equal(flight[1][1].transform,'translate(0,0) scale(1)');assert.equal(x.target.style.opacity,'0');
 for(const a of x.animations)a[4]();assert.equal(x.target.style.opacity,undefined);assert(x.nodes.every(n=>n.removed));
});
test('normal travel uses 1.25 seconds and retains independent lift/land stages',()=>{
 const x=setup();fly(x.batch as any,{node:new Element(x.start) as any,rect:x.start},x.end,x.target as any);
 const flight=x.animations.at(-1)!;assert.equal(flight[2],1250);assert.equal(PIECE_MOVE_MS,1250);
 assert.equal(flight[5],'linear');assert.deepEqual(flight[1].map((f:any)=>f.offset),[0,.25,.75,.94,1]);
 for(const a of x.animations)a[4]();
});
test('double jump keeps two 1.25s jumps with a 200ms landing pause',()=>{
 const x=setup(),via={...x.end,left:120,top:80};
 fly(x.batch as any,{node:new Element(x.start) as any,rect:x.start},x.end,x.target as any,0,false,'move',()=>{},via);
 const flight=x.animations.at(-1)!;assert.equal(flight[2],2700);assert.equal(DOUBLE_JUMP_MS,2700);
 const times=flight[1].map((f:any)=>f.offset*DOUBLE_JUMP_MS);
 assert.equal(times[3],1250);assert.ok(Math.abs(times[4]-1450)<.001);assert.equal(times.at(-1),2700);
 for(const a of x.animations)a[4]();
});
test('piece-card matching is type-specific while Joker Wild still matches all types',()=>{
 const knight=createCard('knight',888),wild=createCard('wild',889);
 for(const type of ['p','n','b','r','q','k'] as const){assert.equal(isCardPermittedForPiece(knight,type,null),type==='n');assert.equal(isCardPermittedForPiece(wild,type,null),true);}
});
test('movement gate blocks a following action until released',()=>{
 setMotionBusy(true);assert.equal(isMotionBusy(),true);setMotionBusy(false);assert.equal(isMotionBusy(),false);
});
