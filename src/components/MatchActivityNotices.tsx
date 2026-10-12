import {V5Piece,V5Power} from './V5Art.tsx';
import React from 'react';
import type {GameState,PlayerColor,GameLogEntry} from '../types.ts';
import {GROUND_NAMES, type GroundType} from '../utils/grounds.ts';
import {PopupLayer,Modal} from './UI.tsx';

type ActivityNotice={id:string;text:string;duration:number;title?:string;piece?:string;pieceColor?:PlayerColor;powers?:string[]};

export function activityInfoNotices(e:GameLogEntry,color:PlayerColor,sharedDevice=false,groundType?:string):ActivityNotice[] {
 if(e.actionType==='deck_refresh')return [{id:e.id,text:e.detail,duration:0,title:'Deck refreshed'}];
 if(!sharedDevice&&e.turn===color)return [];
 const who=e.turn==='w'?'White':'Black';
 const small=(text:string)=>({id:`${e.id}:${text}`,text,duration:3000});
 const extra=/Discarded Brick\./i.test(e.detail)?[small(`${who} discarded Brick.`)]:[];
 if(groundType==='trap-place'||e.trapEventType==='trap-place')return [small(`${who} placed a trap.`)];
 if(e.actionType==='refresh')return [small(`${who} played Refresh.`),...extra];
 if(/as Wild/i.test((e.cardName||'')+' '+e.detail)&&/Awaken/i.test(e.cardName||'')){
  const name=(e.cardName||'Awakening card').replace(/\s*\(Played as Wild\)/i,'');
  const piece=Object.entries({Pawn:'sp',Knight:'sn',Bishop:'b',Rook:'r',Queen:'q',King:'k'}).find(([name])=>(e.cardName||'').includes(name))?.[1]||'q';
  return [{id:e.id,text:`${who} played ${name} as Wild. The card was recycled; its Awakening skill was not activated.`,title:'Awakening played as Wild',duration:0,piece,pieceColor:e.turn}];
 }
 if(extra.length)return extra;
 
 return [];
}

export function MatchActivityNotices({state,color,sharedDevice}:{state:GameState;color:PlayerColor;sharedDevice:boolean}) {
 const seen=React.useRef<Set<string>|null>(null);
 const previousCharges=React.useRef(state.grounds?.charges);
 const previousPowers=React.useRef(state.powerUps);
 const [queue,setQueue]=React.useState<ActivityNotice[]>([]);
 React.useEffect(()=>{
  const entries=state.historyLog||[];
  if(state.status!=='playing'){seen.current=null;previousCharges.current=state.grounds?.charges;previousPowers.current=state.powerUps;setQueue([]);return;}
  if(seen.current===null){seen.current=new Set(entries.map(e=>e.id));previousCharges.current=state.grounds?.charges;previousPowers.current=state.powerUps;return;}
  const fresh=entries.filter(e=>!seen.current!.has(e.id)).reverse();
  entries.forEach(e=>seen.current!.add(e.id));
  const notices=fresh.flatMap<ActivityNotice>(e=>{
   const ground=state.grounds?.events.find(g=>g.id===e.id);
   if(ground?.type==='charge'){
    const owners:PlayerColor[]=sharedDevice?['w','b']:[color];
    const gainedIcons:string[]=[];
    const details=owners.map(owner=>{
     const charges=state.grounds!.charges[owner];
     const gained=Object.entries(charges).filter(([type,count])=>count>(previousCharges.current?.[owner]?.[type as GroundType]||0)).map(([type])=>{gainedIcons.push(type);return GROUND_NAMES[type as GroundType];});
     return `${sharedDevice?(owner==='w'?'White':'Black'):'You'} received ${gained.join(', ')||'a tile power-up'}`;
    });
    return [{id:e.id,text:`${details.join(' · ')}. Available in Power-ups.`,duration:0,powers:[...new Set(gainedIcons)]}];
   }
   const info=activityInfoNotices(e,color,sharedDevice,ground?.type);
   if(info.length)return info;
   if(ground||(!sharedDevice&&e.turn===color))return [];
   const power=e.actionType==='powerup'&&/activated|used/.test(e.detail)&&/power-up|Exchange|Draw & Swap/i.test(e.detail)
     || e.actionType==='monolith'&&/power-up/i.test(e.detail)
     ||e.actionType==='move'&&/wild power-up/i.test(e.detail);
   const name=/Vision/i.test(e.detail)?'Vision':/Exchange|Draw/i.test(e.detail)?'Exchange':/Monolith/i.test(e.detail)?'Monolith':'Wild';
   return power?[{id:e.id,text:`${e.turn==='w'?'White':'Black'} used ${name} power-up.`,duration:3000}]:[];
  });
  for(const owner of (sharedDevice?['w','b']:[color==='w'?'b':'w']) as PlayerColor[]){
   for(const type of ['wild','monolith'] as const){
    if(Number(state.powerUps[owner][type])<Number(previousPowers.current[owner][type])&&!notices.some(n=>n.text.toLowerCase().includes(type)))notices.push({id:`${owner}:${type}:${fresh[0]?.id||state.turnNumber}`,text:`${owner==='w'?'White':'Black'} used ${type==='wild'?'Wild':'Monolith'} power-up.`,duration:3000});
   }
  }
  previousPowers.current=state.powerUps;
  previousCharges.current=state.grounds?.charges;
  if(notices.length)setQueue(q=>[...q,...notices]);
 },[state,color,sharedDevice]);
 const notice=queue[0];
 React.useEffect(()=>{if(!notice||notice.duration===0)return;const timer=setTimeout(()=>setQueue(q=>q.slice(1)),notice.duration);return()=>clearTimeout(timer);},[notice?.id]);
 if(!notice)return null;
 if(notice.duration===0)return <Modal onClick={()=>setQueue(q=>q.slice(1))}><section className="ground-dialog" onClick={e=>e.stopPropagation()}>{(notice.piece||notice.powers?.length)&&<div className="activity-notice-art">{notice.piece&&<V5Piece type={notice.piece} color={notice.pieceColor} awakened className="w-16 h-16"/>}{notice.powers?.map(type=><V5Power key={type} type={type} className="w-16 h-16"/>)}</div>}<h2>{notice.title||'Tile power-up received'}</h2><p>{notice.text}</p>{!notice.title&&<p>Open Power-ups to select it. Placement uses your move action.</p>}<div className="flex justify-end"><button aria-label="Close dialog" onClick={()=>setQueue(q=>q.slice(1))}>Got it</button></div></section></Modal>;
 return <PopupLayer><div className="board-notification small-game-notice move-error-notice match-activity-notice" role="status"><div>{notice.text}</div></div></PopupLayer>;
}
