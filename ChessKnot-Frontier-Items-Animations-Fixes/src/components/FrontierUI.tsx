import {Link2} from 'lucide-react';
import {Modal,Button} from './UI.tsx';
import React from 'react';
import { createPortal } from 'react-dom';
import type { GameState, PlayerColor, ClientMessage } from '../types.ts';
import { ITEM_NAMES, ITEM_TEXT, featherReviveChoice, canExpand, type FrontierItem } from '../utils/frontier.ts';
import { FRONTIER_RANKS } from '../utils/frontierBoard.ts';
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
export function FrontierIntro({ onClose }: {
    onClose: () => void;
}) { const ref = React.useRef<HTMLDialogElement>(null); React.useEffect(() => { ref.current?.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; }; }, []); return createPortal(<dialog ref={ref} className="frontier-intro" onCancel={onClose} onClose={onClose} aria-labelledby="frontier-title"><div className="frontier-intro-golem"><FrontierArt type="boss"/></div><div className="frontier-intro-shell"><button className="frontier-close" aria-label="Close expansion introduction" onClick={onClose}>×</button><div className="frontier-scroll"><header><small>CHESSKNOT · EXPANSION V</small><h2 id="frontier-title">ARCANE FRONTIER</h2><p>The Mystic Field has opened!</p></header><div className="frontier-intro-grid"><section className="frontier-intro-board"><div className="frontier-preview" aria-label="Eight files and twelve ranks, with W X Y Z in the center">{[...FRONTIER_RANKS].reverse().map((r, i) => [...'abcdefgh'].map((file, j) => <span key={file + r} className={`${i >= 4 && i < 8 ? 'mystic ' : ''}${(i + j) % 2 ? 'dark' : ''}`}>{j === 0 && <small>{r}</small>}</span>))}</div><h3>EXPANDED BATTLEFIELD</h3><p>The board expands to 8×12. Four new ranks—W, X, Y, and Z—open between the two armies.</p></section><section className="frontier-info traverse"><FrontierArt type="traverse"/><h3>TRAVERSE</h3><p>2 copies added to the deck. Teleports a friendly piece to an empty, unrestricted Mystic Field square.</p></section><section className="frontier-info bag"><FrontierArt type="bag"/><h3>BAG</h3><p>Increases your hand capacity to 7 cards.</p></section><section className="frontier-info chest"><FrontierArt type="chest"/><h3>CHEST</h3><p>Discover treasure in the Mystic Field. Requires a Key to open.</p></section><section className="frontier-info golem"><FrontierArt type="boss"/><h3>ARCANE GOLEM</h3><p>Must be captured twice. Kings cannot attack it at full health.</p></section></div></div><footer><button autoFocus className="ui-button ui-button--primary" onClick={onClose}>ENTER THE FRONTIER</button></footer></div></dialog>, document.body); }
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
export function FrontierInventory({state,color,disabled,send,onIntro,onDeployGolem,onUseLens,onUseWings,onUseFeather,onUseBoardItem}: {
 state:GameState;color:PlayerColor;disabled:boolean;send:(msg:ClientMessage)=>void;onIntro:()=>void;onDeployGolem:()=>void;
 onUseLens:()=>void;onUseWings:()=>void;onUseFeather:()=>void;onUseBoardItem:(item:'star'|'banner'|'sigil')=>void;
}) {
 const [item,setItem]=React.useState<FrontierItem|null>(null);
 const f=state.frontier;if(!f)return null;
 const owned=f.inventories[color].find(i=>i.type===item&&i.remaining!==0);
 const cooldown=owned?Math.max(0,(owned.readyAfter||0)-f.ownerTurns[color]):0;
 const unavailable=!owned||cooldown>0||owned.usedTurn===state.turnNumber;
 const activate=()=>{if(!item)return;if(item==='lens')onUseLens();else if(item==='wings')onUseWings();else if(item==='feather')onUseFeather();else if(item==='core')onDeployGolem();else if(['star','banner','sigil'].includes(item))onUseBoardItem(item as 'star'|'banner'|'sigil');setItem(null);};
 return <section className="frontier-inventory"><h3>Arcane Frontier <button onClick={onIntro} aria-label="Expansion introduction">ⓘ</button></h3>
 {!f.expanded?<><button className="ui-button" disabled={disabled||!canExpand(state,color)} onClick={()=>send({type:'expand_frontier'})}>Expand Board<small>FREE ACTION · ≤25 army points</small></button><p className="frontier-status">{disabled?'Available on your turn.':!canExpand(state,color)?'Unlocks at 25 or fewer army points.':'Ready to expand.'}</p><button className="ui-button frontier-test-expand" disabled={disabled||!canExpand(state,color,true)} onClick={()=>send({type:'expand_frontier',test:true})}>Expand now — Test<small>Temporary testing control</small></button></>:<p className="frontier-status">Mystic Field {f.ready?'active':'preparing — one turn each'}</p>}
 <div className="frontier-passives">{f.bags[color]&&<span><FrontierArt type="bag"/>Bag · 7 cards</span>}{f.keys[color]>0&&<span><FrontierArt type="key"/>Key ×{f.keys[color]}</span>}</div>
 <div className="frontier-item-list">{f.inventories[color].filter(i=>i.remaining!==0).map(i=>{const turns=Math.max(0,(i.readyAfter||0)-f.ownerTurns[color]);return <button key={i.id} aria-pressed={item===i.type} onClick={()=>setItem(item===i.type?null:i.type)}><FrontierArt type={i.type}/><span>{ITEM_NAMES[i.type]}</span>{['wings','star'].includes(i.type)&&<small className="frontier-cooldown" aria-label={turns?`${turns} owner turns remaining`:'Ready'}>{turns?`${turns} turns`:'Ready'}</small>}</button>;})}</div>
 {item&&owned&&<div className="frontier-item-detail"><strong>{ITEM_NAMES[item]}</strong><p>{ITEM_TEXT[item]}</p>{item!=='eye'&&<button className="ui-button ui-button--primary" disabled={disabled||unavailable||(item==='lens'&&state.jokerLocked[color])||(item==='feather'&&!featherReviveChoice(state,color))||(item==='sigil'&&!state.champions[color])} onClick={activate}>{item==='lens'?'Choose a card in your hand':item==='feather'?'Revive fallen unit':item==='core'?'Deploy Golem on board':item==='banner'?'Choose a square on the board':item==='sigil'?'Choose ultimate targets on the board':'Choose a piece on the board'}</button>}</div>}
 {f.golems.filter(g=>g.owner===color).map(g=><button className="ui-button" disabled={disabled} key={g.id} onClick={()=>{if(window.confirm('Self-destruct this Golem and capture adjacent unprotected pieces?'))send({type:'frontier_self_destruct',from:g.square});}}>Self-destruct Golem · {g.square}</button>)}
 </section>;
}

export function FrontierDropNotices({state}:{state:GameState}){const seed=React.useRef(''),seen=React.useRef(new Set<string>()),noticeTimers=React.useRef(new Set<ReturnType<typeof setTimeout>>());React.useEffect(()=>()=>{noticeTimers.current.forEach(clearTimeout);},[]);const [queue,setQueue]=React.useState<NonNullable<GameState['frontier']>['events']>([]);React.useEffect(()=>{const f=state.frontier;if(!f?.expanded){seed.current='';setQueue([]);return;}if(seed.current!==f.id){seed.current=f.id;seen.current=new Set(f.events.map(e=>e.id));return;}const fresh=[...f.events].reverse().filter(e=>!seen.current.has(e.id)&&(!!e.item||['mimic','bag','key'].includes(e.kind)));f.events.forEach(e=>seen.current.add(e.id));if(fresh.length){if(fresh.some(e=>e.kind==='mimic')){const timer=setTimeout(()=>{setQueue(q=>[...q,...fresh]);noticeTimers.current.delete(timer);},2200);noticeTimers.current.add(timer);}else setQueue(q=>[...q,...fresh]);}},[state.frontier]);const e=queue[0];if(!e)return null;return <Modal className="frontier-drop-backdrop"><section className="frontier-drop-dialog" role="dialog" aria-modal="true" aria-labelledby="frontier-drop-title"><FrontierArt type={e.item||(['bag','key'].includes(e.kind)?e.kind:'mimic')} className="frontier-drop-art"/><h2 id="frontier-drop-title">{e.kind==='mimic'?'Mimic revealed!':'Frontier treasure'}</h2><p>{e.detail}</p>{e.item&&<small>{ITEM_TEXT[e.item]}</small>}<Button onClick={()=>setQueue(q=>q.slice(1))}>Got it</Button></section></Modal>;}
