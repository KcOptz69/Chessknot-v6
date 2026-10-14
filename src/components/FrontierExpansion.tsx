import React from 'react';
import {snapshot} from '../motion/runtime.ts';

/** Client-only presentation. Authoritative board, clocks and turn rules stay live. */
export function FrontierExpansion({id,onDone}:{id:string;onDone:()=>void}) {
 const doneRef=React.useRef(onDone);doneRef.current=onDone;
 React.useLayoutEffect(()=>{
  const board=document.getElementById('chess-board');
  if(!board||window.matchMedia('(prefers-reduced-motion: reduce)').matches){doneRef.current();return;}
  const squares=Array.from(board.children).filter((node):node is HTMLElement=>node instanceof HTMLElement&&node.id.startsWith('square-'));
  if(squares.length!==96){doneRef.current();return;}
  const overlay=document.createElement('div');overlay.className='ck-field-expansion';overlay.inert=true;overlay.setAttribute('aria-hidden','true');
  const groups=[document.createElement('div'),document.createElement('div'),document.createElement('div')];
  groups.forEach((group,index)=>{group.className=`ck-field-half ${['upper','middle','lower'][index]}`;overlay.append(group);});
  for(let index=0;index<squares.length;index++){
   const source=squares[index],copy=snapshot(source).node;
   copy.className='ck-field-square';copy.removeAttribute('role');copy.removeAttribute('tabindex');
   copy.querySelectorAll<HTMLElement>('[data-motion-piece],.frontier-boss-unit').forEach((node,index)=>{if(board.dataset.pieceView==='3d'){const original=source.querySelectorAll<HTMLElement>('[data-motion-piece],.frontier-boss-unit')[index];if(original){const paint=getComputedStyle(original);for(const property of ['position','inset','left','right','top','bottom','width','height','z-index'])node.style.setProperty(property,paint.getPropertyValue(property));}}node.removeAttribute('data-motion-piece');});
   if(board.dataset.pieceView==='3d'){copy.style.overflow='visible';copy.style.zIndex='auto';}
   const texture=document.createElement('span'),paint=getComputedStyle(source,'::before');texture.className='ck-field-stone';
   Object.assign(texture.style,{backgroundImage:paint.backgroundImage,backgroundSize:paint.backgroundSize,backgroundPosition:paint.backgroundPosition,backgroundRepeat:'no-repeat',opacity:paint.opacity});
   copy.prepend(texture);groups[Math.floor(index/32)].append(copy);
  }
  const glow=document.createElement('span');glow.className='ck-field-opening-glow';overlay.append(glow);board.append(overlay);board.classList.add('ck-field-running');
  const timers:ReturnType<typeof setTimeout>[]=[];let finished=false;
  const cleanup=()=>{timers.forEach(clearTimeout);overlay.remove();board.classList.remove('ck-field-running','ck-field-settling');window.removeEventListener('resize',finish);};
  function finish(){if(finished)return;finished=true;cleanup();doneRef.current();}
  timers.push(setTimeout(()=>overlay.classList.add('opening'),380));
  timers.push(setTimeout(()=>{board.classList.remove('ck-field-running');board.classList.add('ck-field-settling');},3580));
  timers.push(setTimeout(finish,4000));window.addEventListener('resize',finish);
  return()=>{finished=true;cleanup();};
 },[id]);
 return null;
}
