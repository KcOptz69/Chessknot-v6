import React from 'react';
import {Sparkles, Shield, Zap, X, Clock} from 'lucide-react';
import type {AwakeningAlertState, BeaconEffectState, StaticEffectState, ClockAlertState, PlayerColor} from '../types.ts';
import {AWAKENING_DESCRIPTIONS} from '../utils/cardDescriptions.ts';
import {Modal, PopupLayer} from './UI.tsx';
import {V5Piece, V5Power} from './V5Art.tsx';

type Notice = {id:string;kind:'awakening'|'beacon'|'static';title:string;subtitle:string;detail:string;rules:string;piece?:string;color?:PlayerColor};
export function CardEffectNotifications({awakening,beacon,staticEffect,clock,turnNumber,onOpenChange}:{awakening?:AwakeningAlertState|null;beacon?:BeaconEffectState|null;staticEffect?:StaticEffectState|null;clock?:ClockAlertState|null;turnNumber:number;onOpenChange:(open:boolean)=>void}) {
 const [queue,setQueue]=React.useState<Notice[]>([]);
 const seen=React.useRef(new Set<string>());
 const [clockNotice,setClockNotice]=React.useState<ClockAlertState|null>(null);
 React.useEffect(()=>{
  const notices:Notice[]=[];
  if(awakening) notices.push({id:`awakening:${awakening.timestamp}`,kind:'awakening',title:`${awakening.cardName} activated`,subtitle:`${awakening.player==='w'?'White':'Black'} · ${awakening.effectTitle}${awakening.pieceSquare?` · ${awakening.pieceSquare.toUpperCase()}`:''}`,detail:awakening.effectDescription,rules:AWAKENING_DESCRIPTIONS[awakening.cardType]||awakening.effectDescription,piece:({awakening_pawn:'p',awakening_knight:'n',awakening_bishop:'b',awakening_rook:'r',awakening_queen:'q',awakening_king:'k'} as Record<string,string>)[awakening.cardType],color:awakening.player});
  if(beacon?.active) notices.push({id:`beacon:${beacon.expiresOnTurnNumber}`,kind:'beacon',title:'Beacon activated',subtitle:'Holy Sanctum',detail:'Pieces surrounding the Monolith are protected from every capture method.',rules:'Protection follows the Monolith’s surrounding squares. Leaving the field removes protection. The effect ends at its normal turn countdown.'});
  if(staticEffect?.pending||staticEffect?.active) notices.push({id:`static:${staticEffect.expiresOnTurnNumber}:${staticEffect.active?'active':'charging'}`,kind:'static',title:staticEffect.active?'Static shockwave active':'Static activated',subtitle:staticEffect.active?'Stun field':'Charging around the Monolith',detail:staticEffect.active?'All pieces on the highlighted squares beside the Monolith are stunned, including your own. They cannot move or activate Champion ultimates.':'Up to eight squares directly beside the Monolith are charging. Pieces can still move before the shockwave activates.',rules:'Static charges the squares adjacent to the Monolith, then activates on the caster’s next turn. The stun lasts through the following opponent turn and affects both players; stunned pieces cannot move by any method or activate Champion ultimates.'});
  const fresh=notices.filter(n=>!seen.current.has(n.id));
  fresh.forEach(n=>seen.current.add(n.id));
  if(fresh.length)setQueue(q=>[...q,...fresh]);
 },[awakening,beacon,staticEffect]);
 React.useEffect(()=>{onOpenChange(queue.length>0);},[queue.length,onOpenChange]);
 React.useEffect(()=>{
  if(!clock)return;
  setClockNotice({...clock});
 },[clock?.timestamp]);
 React.useEffect(()=>{
  if(!clockNotice)return;
  const timer=window.setTimeout(()=>setClockNotice(null),3000);
  return()=>clearTimeout(timer);
 },[clockNotice?.timestamp]);
 const notice=queue[0];
 const dismiss=()=>setQueue(q=>q.slice(1));
 const icon=notice?.kind==='awakening'?<Sparkles size={17}/>:notice?.kind==='beacon'?<Shield size={17}/>:<Zap size={17}/>;
 return <>
  {notice&&<Modal className="champion-info-modal card-effect-modal"><section className={`champion-info-dialog card-effect-dialog effect-${notice.kind}`} data-notification-kind={notice.kind}>
   <header className="champion-info-heading"><div className="champion-info-art">{notice.kind==='awakening'?<V5Piece type={notice.piece||'q'} color={notice.color} awakened className="w-full h-full"/>:<V5Power type={notice.kind} className="w-full h-full"/>}</div><div><h2>{notice.title}</h2><p>{notice.subtitle}</p></div><button type="button" onClick={dismiss} aria-label="Close dialog"><X size={20}/></button></header>
   <div className="champion-info-section"><h3>{icon}Effect</h3><p>{notice.detail}</p></div>
   <div className="champion-info-section champion-info-ultimate"><h3><Sparkles size={17}/>How it works</h3><p>{notice.rules}</p></div>
   {notice.kind==='static'&&<div className="champion-info-rules static-timing-summary">{staticEffect?.active?<><strong>Stun active · {Math.max(0,staticEffect.expiresOnTurnNumber-turnNumber)} total turns remaining</strong><p>Affected squares: {staticEffect.stunnedSquares.map(q=>q.toUpperCase()).join(' · ')||'None'}.</p></>:staticEffect?.pending?<><strong>Charging · activates in {Math.max(0,(staticEffect.procOnTurnNumber??turnNumber)-turnNumber)} total turn(s)</strong><p>Activates on turn {staticEffect.procOnTurnNumber}; ends on turn {staticEffect.expiresOnTurnNumber}.</p></>:<strong>This Static effect has ended.</strong>}</div>}
   {notice.kind==='beacon'&&beacon?.active&&<p className="champion-info-rules">Beacon: {Math.max(0,beacon.expiresOnTurnNumber-turnNumber)} turns remaining.</p>}
   <footer><button type="button" onClick={dismiss}>Got it{queue.length>1?` · ${queue.length-1} more`:''}</button></footer>
  </section></Modal>}
  {clockNotice&&<PopupLayer><div role="status" className="board-notification small-game-notice effect-clock-toast"><div><Clock size={18}/><span>{clockNotice.message}</span></div></div></PopupLayer>}
 </>;
}
