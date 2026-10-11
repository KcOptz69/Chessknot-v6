import {Link2} from 'lucide-react';
import {Modal,Button,PopupLayer} from './UI.tsx';
import React from 'react';
import type { GameState, PlayerColor, ClientMessage } from '../types.ts';
import { ITEM_NAMES, ITEM_TEXT, featherReviveChoice, canExpand, golemSelfDestructError, type FrontierItem } from '../utils/frontier.ts';
export function FrontierArt({ type, className = '' }: {
    type: string;
    className?: string;
}) {
    if (['bag','key','chest'].includes(type))return <img className={`frontier-art frontier-original ${className}`} src={`/art/frontier/${type}-item.png`} alt=''/>;
    if (type === 'traverse')
        return <img className={`frontier-art frontier-original ${className}`} src="/art/frontier/traverse.png" alt=""/>;
    const boxes: Record<string, [
        number,
        number,
        number,
        number
    ]> = { bag: [28, 140, 350, 345], key: [470, 140, 260, 345], chest: [770, 145, 340, 340], mimic: [1150, 140, 365, 345], boss: [25, 530, 365, 375], weakened: [405, 530, 365, 375], golem: [775, 530, 365, 375], black_golem: [1150, 530, 365, 375] };
    if (boxes[type]) {
        const [x, y, w, h] = boxes[type];
        return <svg className={`frontier-art frontier-original ${className}`} viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true"><image href="/art/frontier/pieces.png" width="1536" height="1024"/></svg>;
    }
    const index = ['lens', 'wings', 'star', 'banner', 'sigil', 'eye', 'feather', 'core'].indexOf(type), x = 15 + (index % 4) * 384, y = index < 4 ? 140 : 525;
    return <svg className={`frontier-art frontier-original ${className}`} viewBox={`${x} ${y} 370 375`} aria-hidden="true"><image href="/art/frontier/rewards.png" width="1536" height="1024"/></svg>;
}
export function FrontierIntro({onClose}:{onClose:()=>void}) {
 const ref=React.useRef<HTMLDialogElement>(null),enterRef=React.useRef<HTMLButtonElement>(null);
 React.useEffect(()=>{
  const dialog=ref.current;if(dialog&&!dialog.open)dialog.showModal();
  const old=document.body.style.overflow;document.body.style.overflow='hidden';
  enterRef.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=old;};
 },[]);
 return <PopupLayer><dialog ref={ref} className="frontier-intro frontier-intro-poster" aria-modal="true" aria-labelledby="frontier-title" aria-describedby="frontier-intro-rules" onCancel={event=>{event.preventDefault();onClose();}} onClose={onClose}>
  <h2 id="frontier-title" className="sr-only">Arcane Frontier · Expansion V</h2>
  <div className="frontier-poster-frame">
   <picture><source media="(max-width: 1024px) and (orientation: portrait)" srcSet="/art/frontier/intro-mobile-approved.png"/><img src="/art/frontier/intro-desktop-approved.png" alt="" aria-hidden="true" width="1536" height="1024" decoding="async"/></picture>
   <button className="frontier-poster-control frontier-poster-close" aria-label="Close expansion introduction" onClick={onClose}><span className="sr-only">Close</span></button>
   <button ref={enterRef} className="frontier-poster-control frontier-poster-enter" onClick={onClose}><span className="sr-only">Enter the Frontier</span></button>
  </div>
  <div id="frontier-intro-rules" className="sr-only"><p>The Mystic Field has opened. The board expands to 8×12, with ranks W, X, Y, and Z between the two armies.</p><p>Traverse: two copies added to the deck. Teleports a friendly piece to an empty, unrestricted Mystic Field square.</p><p>Bag: increases hand capacity to seven cards.</p><p>Chest: requires a Key to open.</p><p>Arcane Golem: must be captured twice. Kings cannot attack it at full health.</p></div>
 </dialog></PopupLayer>;
}
export function GolemIdleArt({type,weakened=false}:{type:string;weakened?:boolean}) {
 return <div className={`golem-idle-art ${weakened?'golem-weakened':''}`}><FrontierArt type={type} className="golem-idle-base"/><FrontierArt type={type} className="golem-idle-body"/><span className="golem-core-pulse"/><i className="golem-idle-spark"/><i className="golem-idle-spark second"/></div>;
}
export function FlightWing({side}:{side:'left'|'right'}) {
 return <svg viewBox={side==='left'?'406 149 187 314':'605 149 187 314'} className={`flight-wing ${side}`} aria-hidden="true"><image href="/art/frontier/rewards.png" width="1536" height="1024"/></svg>;
}
export function BindIcon({className=''}:{className?:string}) {
 return <span className={`frontier-bind-icon ${className}`}><FrontierArt type="eye"/><Link2 aria-hidden="true"/></span>;
}
export function FrontierExpandOffer({state,color,enabled,paused,onOpenChange,send}:{state:GameState;color:PlayerColor;enabled:boolean;paused:boolean;onOpenChange:(open:boolean)=>void;send:(msg:ClientMessage)=>void}) {
 const [dismissed,setDismissed]=React.useState(false);
 React.useEffect(()=>{if(state.status==='lobby')setDismissed(false);},[state.status]);
 const visible=enabled&&!paused&&!dismissed&&canExpand(state,color);
 React.useEffect(()=>{onOpenChange(visible);},[visible,onOpenChange]);
 React.useEffect(()=>()=>onOpenChange(false),[onOpenChange]);
 if(!visible)return null;
 return <Modal className="frontier-expand-offer"><section className="lens-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="expand-offer-title"><FrontierArt type="traverse" className="lens-confirm-art"/><h2 id="expand-offer-title">Open the Arcane Frontier?</h2><p>Your army has <strong>{color==='w'?state.whitePoints:state.blackPoints} points</strong>. You may expand the board now.</p><small>Free action · The Expand Board button stays available if you wait.</small><div><Button onClick={()=>setDismissed(true)}>Not yet</Button><Button variant="primary" disabled={!canExpand(state,color)} onClick={()=>{if(canExpand(state,color)){send({type:'expand_frontier'});setDismissed(true);}}}>Expand now</Button></div></section></Modal>;
}
export function ItemActivateButton({name,disabled,onActivate}:{name:string;disabled:boolean;onActivate:()=>void}) {
 return <button className="ui-button ui-button--primary" disabled={disabled} aria-label={`Activate ${name}`} onClick={onActivate}>Activate</button>;
}
export function FrontierInventory({state,color,disabled,send,onIntro,onDeployGolem,onUseLens,onUseWings,onUseFeather,onUseBoardItem}: {
 state:GameState;color:PlayerColor;disabled:boolean;send:(msg:ClientMessage)=>void;onIntro:()=>void;onDeployGolem:()=>void;
 onUseLens:()=>void;onUseWings:()=>void;onUseFeather:()=>void;onUseBoardItem:(item:'star'|'banner'|'sigil')=>void;
}) {
 const [item,setItem]=React.useState<FrontierItem|null>(null);
 const [passive,setPassive]=React.useState<'bag'|'key'|null>(null);
 const f=state.frontier;if(!f)return null;
 const owned=f.inventories[color].find(i=>i.type===item&&i.remaining!==0);
 const cooldown=owned?Math.max(0,(owned.readyAfter||0)-f.ownerTurns[color]):0;
 const unavailable=!owned||cooldown>0||owned.usedTurn===state.turnNumber;
 const activate=()=>{if(!item)return;if(item==='lens')onUseLens();else if(item==='wings')onUseWings();else if(item==='feather')onUseFeather();else if(item==='core')onDeployGolem();else if(['star','banner','sigil'].includes(item))onUseBoardItem(item as 'star'|'banner'|'sigil');setItem(null);};
 return <section className="frontier-inventory"><h3>Arcane Frontier <button onClick={onIntro} aria-label="Expansion introduction">ⓘ</button></h3>
 {!f.expanded?<><button className="ui-button" disabled={disabled||!canExpand(state,color)} onClick={()=>send({type:'expand_frontier'})}>Expand Board<small>FREE ACTION · ≤25 army points</small></button><p className="frontier-status">{disabled?'Available on your turn.':!canExpand(state,color)?'Unlocks at 25 or fewer army points.':'Ready to expand.'}</p><button className="ui-button frontier-test-expand" disabled={disabled||!canExpand(state,color,true)} onClick={()=>send({type:'expand_frontier',test:true})}>Expand now — Test<small>Temporary testing control</small></button></>:<p className="frontier-status">Mystic Field {f.ready?'active':'preparing — one turn each'}</p>}
 <div className="frontier-item-list">{f.bags[color]&&<button aria-pressed={passive==='bag'} onClick={()=>{setPassive(passive==='bag'?null:'bag');setItem(null);}}><FrontierArt type="bag"/><span>Backpack</span><small>Hand capacity: 7</small></button>}{f.keys[color]>0&&<button aria-pressed={passive==='key'} onClick={()=>{setPassive(passive==='key'?null:'key');setItem(null);}}><FrontierArt type="key"/><span>Key</span><small>×{f.keys[color]}</small></button>}{f.inventories[color].filter(i=>i.remaining!==0).map(i=>{const turns=Math.max(0,(i.readyAfter||0)-f.ownerTurns[color]);return <button key={i.id} aria-pressed={item===i.type} onClick={()=>{setPassive(null);setItem(item===i.type?null:i.type);}}><FrontierArt type={i.type}/><span>{ITEM_NAMES[i.type]}</span>{['wings','star'].includes(i.type)&&<small className="frontier-cooldown" aria-label={turns?`${turns} owner turns remaining`:'Ready'}>{turns?`${turns} turns`:'Ready'}</small>}</button>;})}</div>
 {passive&&<div className="frontier-item-detail"><strong>{passive==='bag'?'Backpack':'Key'}</strong><p>{passive==='bag'?'Automatically increases your hand capacity to 7 cards while owned.':'Automatically consumed when your piece lands on a Chest to open it.'}</p><small>Passive item · {passive==='bag'?'Hand capacity: 7':`×${f.keys[color]}`}</small></div>}
 {item&&owned&&<div className="frontier-item-detail"><strong>{ITEM_NAMES[item]}</strong><p>{ITEM_TEXT[item]}</p>{item!=='eye'&&<ItemActivateButton name={ITEM_NAMES[item]} disabled={disabled||unavailable||(item==='lens'&&state.jokerLocked[color])||(item==='feather'&&!featherReviveChoice(state,color))||(item==='sigil'&&!state.champions[color])} onActivate={activate}/>}</div>}
 </section>;
}

export function FrontierDropNotices({state}:{state:GameState}){const seed=React.useRef(''),seen=React.useRef(new Set<string>()),noticeTimers=React.useRef(new Set<ReturnType<typeof setTimeout>>());React.useEffect(()=>()=>{noticeTimers.current.forEach(clearTimeout);},[]);const [queue,setQueue]=React.useState<NonNullable<GameState['frontier']>['events']>([]);React.useEffect(()=>{const f=state.frontier;if(!f?.expanded){seed.current='';setQueue([]);return;}if(seed.current!==f.id){seed.current=f.id;seen.current=new Set(f.events.map(e=>e.id));return;}const fresh=[...f.events].reverse().filter(e=>!seen.current.has(e.id)&&(!!e.item||['mimic','bag','key'].includes(e.kind)));f.events.forEach(e=>seen.current.add(e.id));if(fresh.length){if(fresh.some(e=>e.kind==='mimic')){const timer=setTimeout(()=>{setQueue(q=>[...q,...fresh]);noticeTimers.current.delete(timer);},2200);noticeTimers.current.add(timer);}else setQueue(q=>[...q,...fresh]);}},[state.frontier]);const e=queue[0];if(!e)return null;return <Modal className="frontier-drop-backdrop"><section className="frontier-drop-dialog" role="dialog" aria-modal="true" aria-labelledby="frontier-drop-title"><FrontierArt type={e.item||(['bag','key'].includes(e.kind)?e.kind:'mimic')} className="frontier-drop-art"/><h2 id="frontier-drop-title">{e.kind==='mimic'?'Mimic revealed!':'Frontier treasure'}</h2><p>{e.detail}</p>{e.item&&<small>{ITEM_TEXT[e.item]}</small>}<Button onClick={()=>setQueue(q=>q.slice(1))}>Got it</Button></section></Modal>;}

export function GolemActionPanel({state,color,square,disabled,onSelfDestruct,onCancel}:{state:GameState;color:PlayerColor;square:string;disabled:boolean;onSelfDestruct:()=>void;onCancel:()=>void}) {
 const reason=golemSelfDestructError(state,color,square);
 return <section className="golem-action-panel" aria-label="Selected Golem actions"><strong>Golem · {square}</strong><button className="ui-button ui-button--danger" disabled={disabled||!!reason} onClick={onSelfDestruct}>Self-destruct</button><button className="ui-button" onClick={onCancel}>Cancel</button>{reason&&<small>{reason}</small>}</section>;
}
