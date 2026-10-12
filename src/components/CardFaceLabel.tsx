import React from 'react';
export function fittedCardFont(base:number,width:number,height:number,textWidth:number,textHeight:number){
 if(width<=0||height<=0||textWidth<=0||textHeight<=0)return base;
 return Math.max(1,Math.min(base,base*(width-2)/textWidth,base*(height-1)/textHeight));
}
export function CardFaceLabel({children}:{children:string}){
 const ref=React.useRef<HTMLSpanElement>(null);
 React.useEffect(()=>{
  const label=ref.current,box=label?.parentElement;if(!label||!box)return;
  let active=true;
  const fit=()=>{if(!active)return;const base=parseFloat(getComputedStyle(box).fontSize)||11;label.style.fontSize=`${base}px`;const size=fittedCardFont(base,box.clientWidth,box.clientHeight,label.scrollWidth,label.scrollHeight);label.style.fontSize=`${size}px`;};
  fit();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(fit):undefined;observer?.observe(box);window.addEventListener('resize',fit);document.fonts?.ready.then(fit);
  return()=>{active=false;observer?.disconnect();window.removeEventListener('resize',fit);};
 },[children]);
 return <span ref={ref} className="card-face-label">{children}</span>;
}
