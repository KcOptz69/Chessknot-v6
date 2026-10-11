import type {FrontierState} from '../utils/frontier.ts';
import {ranksFor} from '../utils/frontierBoard.ts';
import {FrontierArt,FlightWing} from './FrontierUI.tsx';
import React from 'react';
import type {Grounds} from '../utils/grounds.ts';
import type {ChampionPiece, ClockAlertState, PlayerColor} from '../types.ts';
import {PieceIcon} from './PieceIcons.tsx';
import {V5Power} from './V5Art.tsx';

type Props={frontier?:FrontierState;fen:string;pieceIds?:Record<string,string>;champions?:{w:ChampionPiece|null;b:ChampionPiece|null}|null;grounds?:Grounds;clockAlert?:ClockAlertState|null;flipped:boolean;jokerEventId?:string};
const xy=(square:string,flipped:boolean,fen:string)=>{const ranks=ranksFor(fen),x=square.charCodeAt(0)-97,y=ranks.length-1-ranks.indexOf(square.slice(1));return [flipped?7-x:x,flipped?ranks.length-1-y:y];};
export function BoardEffects({frontier,fen,pieceIds,champions,grounds,clockAlert,flipped,jokerEventId}:Props){
 const animationSeen=React.useRef(new Set(frontier?.events.map(e=>e.id)));
 const [frontierAnimations,setFrontierAnimations]=React.useState<FrontierState['events']>([]);
 React.useLayoutEffect(()=>{
  const fresh=(frontier?.events||[]).filter(e=>!animationSeen.current.has(e.id)&&['wings_flight','pawn_summon','mimic'].includes(e.kind));
  frontier?.events.forEach(e=>animationSeen.current.add(e.id));
  if(!fresh.length)return;
  setFrontierAnimations(old=>[...old,...fresh]);
  for(const e of fresh){if(!e.square||!['wings_flight','pawn_summon'].includes(e.kind))continue;const node=document.getElementById(`square-${e.square}`)?.querySelector<HTMLElement>('[data-motion-piece]');if(node&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)node.animate([{opacity:0},{opacity:0}],{duration:1900});}
  const timer=setTimeout(()=>setFrontierAnimations(old=>old.filter(e=>!fresh.some(f=>f.id===e.id))),2200);pending.current.add(timer);
 },[frontier?.events,flipped,fen]);
 const explosionSeen=React.useRef(new Set(frontier?.events.map(e=>e.id)));
 const [explosions,setExplosions]=React.useState<FrontierState['events']>([]);
 React.useEffect(()=>{
  const fresh=(frontier?.events||[]).filter(e=>!explosionSeen.current.has(e.id)&&e.kind==='golem_explosion'&&e.square);
  frontier?.events.forEach(e=>explosionSeen.current.add(e.id));
  if(fresh.length){setExplosions(fresh);const timer=setTimeout(()=>setExplosions([]),1500);pending.current.add(timer);}
 },[frontier?.events]);
 const lastJoker=React.useRef(jokerEventId);
 const [joking,setJoking]=React.useState(false);
 React.useEffect(()=>{
  if(jokerEventId&&jokerEventId!==lastJoker.current){
   setJoking(true);
   const timer=setTimeout(()=>setJoking(false),1600);
   pending.current.add(timer);
  }
  lastJoker.current=jokerEventId;
 },[jokerEventId]);
 const previous=React.useRef({fen,pieceIds:{...pieceIds},champions,clock:clockAlert?.timestamp});
 const seen=React.useRef(new Set(grounds?.events.map(e=>e.id)));
 const [effects,setEffects]=React.useState<NonNullable<Grounds['events'][number]>[]>([]);
 const [rewinding,setRewinding]=React.useState(false);
 React.useLayoutEffect(()=>{
  const old=previous.current;
  const timers:ReturnType<typeof setTimeout>[]=[];
  if(clockAlert&&clockAlert.timestamp!==old.clock&&old.fen!==fen){
   setRewinding(true);timers.push(setTimeout(()=>setRewinding(false),1500));
   const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   for(const [square,id] of Object.entries(pieceIds||{})){
    const from=Object.keys(old.pieceIds).find(q=>old.pieceIds[q]===id);
    const node=document.getElementById(`square-${square}`)?.querySelector<HTMLElement>('[data-motion-piece]');
    if(!node||reduce)continue;
    if(from&&from!==square){const [a,b]=xy(from,flipped,fen),[x,y]=xy(square,flipped,fen);const rect=node.parentElement!.getBoundingClientRect();node.animate([{transform:`translate(${(a-x)*rect.width}px,${(b-y)*rect.height}px)`,filter:'drop-shadow(0 0 9px #f5c542)'},{transform:'translate(0,0)',filter:'none'}],{duration:1100,easing:'cubic-bezier(.4,0,.2,1)'});}
    else if(!from)node.animate([{opacity:0,filter:'blur(6px)'},{opacity:1,filter:'none'}],{duration:1100});
   }
   for(const c of Object.values(champions||{})){if(!c)continue;const from=old.champions?.[c.color]?.square;if(!from||from===c.square||reduce)continue;const node=document.getElementById(`square-${c.square}`)?.querySelector<HTMLElement>('[data-motion-piece="champion"]');if(node){const [a,b]=xy(from,flipped,fen),[x,y]=xy(c.square,flipped,fen),rect=node.parentElement!.getBoundingClientRect();node.animate([{transform:`translate(${(a-x)*rect.width}px,${(b-y)*rect.height}px)`},{transform:'translate(0,0)'}],{duration:1100,easing:'ease-in-out'});}}
  }
  const fresh=(grounds?.events||[]).filter(e=>!seen.current.has(e.id)&&e.square&&['mine','poison','banish','disarm'].includes(e.type));
  grounds?.events.forEach(e=>seen.current.add(e.id));
  if(fresh.length){setEffects(fresh);timers.push(setTimeout(()=>setEffects([]),1900));}
  previous.current={fen,pieceIds:{...pieceIds},champions:champions?structuredClone(champions):champions,clock:clockAlert?.timestamp};
  // Timers deliberately survive clock ticks; only unmount cleanup cancels them.
  timers.forEach(t=>pending.current.add(t));
 },[fen,pieceIds,champions,grounds?.events,clockAlert?.timestamp,flipped]);
 const pending=React.useRef(new Set<ReturnType<typeof setTimeout>>());
 React.useEffect(()=>()=>{pending.current.forEach(clearTimeout);},[]);
 return <div className="board-effects" aria-hidden="true">
  {frontierAnimations.map(e=>{if(e.kind==='mimic')return <div className="joker-activation-art mimic-activation-art" key={e.id}><span className="joker-surge-ring"/><FrontierArt type="mimic"/></div>;if(!e.square||!e.piece)return null;const [x,y]=xy(e.from||e.square,flipped,fen),[tx,ty]=xy(e.square,flipped,fen);return <div key={e.id} className={`frontier-action-fx ${e.kind}`} style={{left:`${x*12.5}%`,top:`${y*100/ranksFor(fen).length}%`,width:'12.5%',height:`${100/ranksFor(fen).length}%`,'--flight-x':`${(tx-x)*100}%`,'--flight-y':`${(ty-y)*100}%`} as React.CSSProperties}>{e.kind==='wings_flight'?<div className="flight-unit"><FlightWing side="left"/><FlightWing side="right"/>{e.piece.type==='golem'?<FrontierArt type={e.piece.color==='w'?'golem':'black_golem'}/>:<PieceIcon type={e.piece.type as any} color={e.piece.color} awakened={e.piece.awakened} className="w-full h-full"/>}</div>:<><span className="pawn-summon-circle"/><span className="pawn-summon-beam"/><div className="pawn-summon-unit"><PieceIcon type="p" color={e.piece.color} className="w-full h-full"/></div>{[0,1,2].map(i=><i key={i} className="pawn-summon-spark" style={{left:`${20+i*30}%`,animationDelay:`${i*.15}s`}}/>)}</>}</div>;})}
  {explosions.map(e=>{const [x,y]=xy(e.square!,flipped,fen);return <div key={e.id} className="arcane-golem-blast" style={{left:`${(x-1)*12.5}%`,top:`${(y-1)*100/ranksFor(fen).length}%`,width:'37.5%',height:`${300/ranksFor(fen).length}%`}}><div className="arcane-blast-grid">{Array.from({length:9},(_,i)=><span key={i} style={{animationDelay:`${i===4?0:60}ms`}}/>)}</div><span className="arcane-blast-core"/><span className="arcane-blast-ring"/><span className="arcane-blast-ring outer"/>{Array.from({length:12},(_,i)=><span key={i} className="arcane-blast-spark" style={{'--blast-angle':`${i*30}deg`} as React.CSSProperties}/>)}</div>})}
  {joking&&<div className="joker-activation-art"><span className="joker-surge-ring"/><V5Power type="joker" className="w-full h-full"/>{Array.from({length:5},(_,i)=><span key={i} className="joker-surge-star" style={{'--star-angle':`${i*72}deg`} as React.CSSProperties}><V5Power type="wild" className="w-full h-full"/></span>)}</div>}
  {rewinding&&<div className="clock-rewind-art"><V5Power type="clock" className="w-full h-full"/></div>}
  {effects.map(e=>{const [x,y]=xy(e.square!,flipped,fen);return <div key={e.id} className={`trap-fx trap-${e.type}`} style={{left:`${x*12.5}%`,top:`${y*100/ranksFor(fen).length}%`,height:`${100/ranksFor(fen).length}%`}}>
   {e.piece&&!e.immune&&['mine','banish'].includes(e.type)&&<div className="trap-victim">{e.piece.type==='golem'?<FrontierArt type={e.piece.color==='w'?'golem':'black_golem'}/>:<PieceIcon type={e.piece.type as any} color={e.piece.color} awakened={e.piece.awakened} className="w-full h-full"/>}</div>}
   {e.type==='mine'&&<><span className="trap-explosion"/>{Array.from({length:10},(_,i)=><span key={i} className="trap-debris" style={{'--dx':`${Math.cos(i*2.4)*100}%`,'--dy':`${Math.sin(i*2.4)*100}%`} as React.CSSProperties}/>)}</>}
   {e.type==='poison'&&Array.from({length:5},(_,i)=><span key={i} className="trap-fume" style={{'--drift':`${i%2?35:-35}%`,animationDelay:`${i*.12}s`} as React.CSSProperties}/>)}
   {e.type==='banish'&&<><span className="trap-hole"/><span className="trap-vortex"/></>}
   {e.type==='disarm'&&<><span className="trap-disarm-ring"/><div className="trap-sword top"><V5Power type="disarm" className="w-full h-full"/></div><div className="trap-sword bottom"><V5Power type="disarm" className="w-full h-full"/></div></>}
  </div>})}
 </div>;
}
