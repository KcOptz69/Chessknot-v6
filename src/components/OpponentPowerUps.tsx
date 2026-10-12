import React from 'react';
import type {PlayerColor,PowerUpsState} from '../types.ts';
import {GROUND_NAMES,type Grounds} from '../utils/grounds.ts';
import {ITEM_NAMES,ITEM_TEXT,type FrontierState} from '../utils/frontier.ts';
import {GROUND_DESCRIPTION} from './GroundsUI.tsx';
import {BindIcon,FrontierArt} from './FrontierUI.tsx';
import {V5Power,V5Piece} from './V5Art.tsx';
import {Badge} from './UI.tsx';
interface Reserve {id:string;name:string;status:string;description:string;art:string;kind:'power'|'item';count?:number;}
interface Props {powerUps:PowerUpsState;grounds?:Grounds;frontier?:FrontierState;color:PlayerColor;turnNumber?:number;hasEye?:boolean;showMonolith?:boolean;}
export function opponentReserves({powerUps,grounds,frontier,color,turnNumber,hasEye=false,showMonolith=true}:Props):Reserve[]{
 const reserves:Reserve[]=[
  {id:'draw',art:'draw',kind:'power',name:'Exchange',count:powerUps.draw,status:'Free action',description:'Draw two fresh cards, then choose two cards from your hand to discard. Cannot be used during Joker Wild Surge.'},
  ...(showMonolith?[{id:'monolith',art:'monolith',kind:'power' as const,name:'Monolith',count:powerUps.monolith,status:'Move action',description:'Spawn or reposition the Monolith on a legal empty square. It cannot move again on the immediately following turn.'}]:[]),
  {id:'wild',art:'wild',kind:'power',name:'Wild move',count:powerUps.wild,status:'Move action',description:'Move an eligible friendly piece using its normal movement without spending a card.'},
  {id:'vision',art:hasEye?'bind':'vision',kind:'power',name:hasEye?'Bind':'Vision',count:powerUps.vision,status:'Free action',description:hasEye?'Choose an eligible card in the opponent’s revealed hand to prevent that exact card from being played for their next turn.':'Reveal the opponent’s hand for this turn.'},
 ];
 for(const type of grounds?.selected||[])reserves.push({id:`ground:${type}`,name:GROUND_NAMES[type],art:type,kind:'power',count:grounds!.charges[color]?.[type]||0,status:'Move action',description:GROUND_DESCRIPTION[type]});
 if(frontier?.bags[color])reserves.push({id:'bag',art:'bag',kind:'item',name:'Backpack',status:'Passive · Hand capacity: 7',description:'Automatically increases hand capacity to seven cards while owned. Losing the Backpack randomly discards ordinary cards back to five.'});
 if(frontier?.keys[color])reserves.push({id:'key',art:'key',kind:'item',name:'Key',count:frontier.keys[color],status:'Passive item',description:'Automatically consumed when a friendly piece lands on a Chest to open it.'});
 for(const item of frontier?.inventories[color]||[]){
  if(item.remaining===0)continue;
  const turns=Math.max(0,(item.readyAfter||0)-frontier!.ownerTurns[color]);
  const status=item.type==='eye'?'Passive item':turns?`${turns} owner turn${turns===1?'':'s'} remaining`:item.usedTurn===turnNumber?'Used this turn':item.remaining>0?'Single use':'Ready';
  reserves.push({id:item.id,art:item.type,kind:'item',name:ITEM_NAMES[item.type],status,description:ITEM_TEXT[item.type],...(item.remaining>0?{count:item.remaining}:{})});
 }
 return reserves;
}
export function OpponentPowerUps(props:Props){
 const [selected,setSelected]=React.useState<string|null>(null);
 const detailId=React.useId();const reserves=opponentReserves(props),detail=reserves.find(r=>r.id===selected);
 return <div className="opponent-reserves-scroll custom-scrollbar">
  {[
   {title:'Standard Power-ups',entries:reserves.filter(r=>r.kind==='power'&&!r.id.startsWith('ground:'))},
   {title:'Powered Tiles/Traps',entries:reserves.filter(r=>r.id.startsWith('ground:'))},
   {title:'Items',entries:reserves.filter(r=>r.kind==='item')},
  ].map(group=><section className="opponent-reserve-section" key={group.title}><h4>{group.title}</h4>{group.entries.length?<div className="opponent-reserves-grid">{group.entries.map(reserve=><button type="button" className="opponent-reserve-card" key={reserve.id} disabled={reserve.kind!=='item'} aria-pressed={selected===reserve.id} aria-label={`Inspect ${reserve.name}: ${reserve.status}${reserve.kind==='power'&&reserve.count!==undefined?`, ${reserve.count} charges`:''}`} aria-controls={detailId} onClick={()=>{if(reserve.kind==='item')setSelected(selected===reserve.id?null:reserve.id);}}>
   <span className="opponent-reserve-art">{reserve.kind==='item'?<FrontierArt type={reserve.art}/>:reserve.art==='monolith'?<V5Piece type="m"/>:reserve.art==='bind'?<BindIcon/>:<V5Power type={reserve.art}/>}</span>
   <span className="opponent-reserve-copy"><strong>{reserve.name}</strong><small>{reserve.status}</small></span>
   {reserve.kind==='power'&&reserve.count!==undefined&&<Badge className="reserve-charge">×{reserve.count}</Badge>}
  </button>)}</div>:<p className="opponent-reserve-empty">None</p>}</section>)}
  {detail&&<div id={detailId} className="opponent-reserve-detail" role="status" aria-live="polite"><><strong>{detail.name}</strong><p>{detail.description}</p><small>{detail.status} · Opponent’s item</small></></div>}
 </div>;
}
