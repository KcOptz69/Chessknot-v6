import React from 'react';
import {Pause,Play,ChevronRight,ShieldCheck,Zap,Wind} from 'lucide-react';
import {CardArtwork} from './CardArtwork.tsx';
import {V5Piece,V5Power} from './V5Art.tsx';
import type {CardType} from '../types.ts';
import type {RuleItem} from './rulebookData.ts';
import {ruleScenes} from './rulebookScenes.ts';

const tileColors:Record<string,string>={boost:'#22c55e',gravity:'#a56b3d',defense:'#f5c542',portal:'#ff8b24'};
function square(x:number,y:number):React.CSSProperties {return {left:`${x*20}%`,top:`${y*20}%`};}
function SceneEffect({type}:{type:string}) {
 if(type==='mine')return <><span className="trap-explosion"/>{Array.from({length:8},(_,i)=><span key={i} className="trap-debris" style={{'--dx':`${Math.cos(i*2.4)*100}%`,'--dy':`${Math.sin(i*2.4)*100}%`} as React.CSSProperties}/>)}</>;
 if(type==='poison')return <>{Array.from({length:4},(_,i)=><span key={i} className="trap-fume" style={{'--drift':`${i%2?35:-35}%`,animationDelay:`${i*.12}s`} as React.CSSProperties}/>)}</>;
 if(type==='banish')return <><span className="trap-hole"/><span className="trap-vortex"/></>;
 if(type==='disarm')return <><span className="trap-disarm-ring"/><div className="trap-sword top"><V5Power type="disarm" className="rb-art"/></div><div className="trap-sword bottom"><V5Power type="disarm" className="rb-art"/></div></>;
 if(type==='blocked'||type==='disarmed')return <span className="rb-blocked-symbol">×</span>;
 if(type==='clock')return <V5Power type="clock" className="rb-art"/>;
 if(type==='beacon'||type==='static')return <span className={`rb-field rb-field-${type}`}/>;
 return <><span className="summon-arrival-ring"/>{Array.from({length:5},(_,i)=><span className="summon-arrival-wisp" key={i} style={{'--wisp-x':`${10+i*18}%`,'--wisp-y':`${20+i%2*20}%`} as React.CSSProperties}/>)}</>;
}
export function RuleDemo({item}:{item:RuleItem}) {
 const [paused,setPaused]=React.useState(false);
 const [frame,setFrame]=React.useState(0);
 const [reduced,setReduced]=React.useState(false);
 const type=item.demo||item.id;
 const noAnimation=['brick','vision','draw'].includes(type);
 const scenes=React.useMemo(()=>ruleScenes(type),[type]);
 React.useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 React.useEffect(()=>{
  if(paused||reduced||noAnimation)return;
  const timer=window.setInterval(()=>setFrame(n=>(n+1)%scenes.length),1800);
  return()=>window.clearInterval(timer);
 },[paused,reduced,noAnimation,scenes.length]);
 if(noAnimation)return null;
 const current=scenes[frame];
 const previous=scenes[(frame+scenes.length-1)%scenes.length];
 const departed=frame===0?[]:previous.units.filter(p=>!current.units.some(q=>q.id===p.id));
 return <figure className={`rb-demo ${paused||reduced?'rb-demo-paused':''}`} aria-label={`${item.name} illustrated example`}>
  <div className="rb-demo-caption"><span>Effect preview</span><div><button type="button" disabled={reduced} aria-label={paused?'Play example':'Pause example'} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={12}/>:<Pause size={12}/>}</button><button type="button" aria-label="Next example step" onClick={()=>{setPaused(true);setFrame(n=>(n+1)%scenes.length);}}><ChevronRight size={12}/></button></div></div>
  {current.hand?<div className={`rb-hand-example ${current.discard?'rb-hand-discard':''}`} aria-hidden="true">{current.hand.map((card,i)=><span key={`${frame}-${i}`} className={`rb-hand-card ${current.gold?'rb-hand-gold':''}`}><CardArtwork card={{id:`demo-${i}`,type:card as CardType,name:card,description:''}} className="rb-art"/><small>{card.toUpperCase()}</small></span>)}</div>:<div className={`rb-demo-board rb-storyboard rb-example-${type}`} aria-hidden="true">
   {Array.from({length:25},(_,i)=><span className={`rb-demo-cell ${(Math.floor(i/5)+i%5)%2?'rb-dark-cell':''}`} key={i}/>)}
   {current.targets?.map(([x,y],i)=><span key={i} className="rb-legal-dot" style={square(x,y)}/>)}
   {current.tiles?.map(tile=><span key={`${tile.type}-${tile.x}-${tile.y}`} className="rb-scene-tile" style={square(tile.x,tile.y)}>{tile.type==='circle'?<div className="summoning-circle circle-white"><span>✦</span><b>{tile.count}</b></div>:tileColors[tile.type]?<div className={`ground-tile ${tile.occupied?'occupied':''}`} data-ground-type={tile.type} data-square-tone={(tile.x+tile.y)%2?'dark':'light'} style={{'--tile-color':tileColors[tile.type]} as React.CSSProperties}><V5Power type={tile.type} className="rb-art"/><span className="powered-tile-aura"/>{[0,1,2].map(i=><span className="powered-tile-mote" key={i} style={{left:`${20+i*30}%`,animationDelay:`${i*.4}s`}}/>)}</div>:tile.type==='banished'||tile.type==='poison-count'?<b className="rb-scene-count">{tile.count}</b>:<V5Power type={tile.type} className="rb-art"/>}</span>)}
   {current.beam&&<svg className={`rb-attack-line ${current.beam.blocked?'rb-line-blocked':''}`} viewBox="0 0 100 100"><line x1={current.beam.from[0]*20+10} y1={current.beam.from[1]*20+10} x2={current.beam.to[0]*20+10} y2={current.beam.to[1]*20+10}/></svg>}
   {[...current.units,...departed].map(unit=><span key={unit.id} className={`rb-scene-piece ${unit.selected?'rb-piece-selected':''} ${unit.blocked?'rb-piece-blocked':''} ${departed.includes(unit)?'rb-piece-departed':''} ${current.effect&&['revive','soul','portal-arrival'].includes(current.effect.type)&&unit.x===current.effect.x&&unit.y===current.effect.y?'rb-piece-arriving':''} ${current.effect?.type==='portal-arrival'&&unit.x===current.effect.x&&unit.y===current.effect.y?'rb-piece-teleport':''}`} data-trap-victim={current.effect&&['mine','banish'].includes(current.effect.type)&&unit.x===current.effect.x&&unit.y===current.effect.y||undefined} style={square(unit.x,unit.y)}><span data-motion-piece="standard" data-soul-piece={unit.ghost||undefined} data-poisoned={unit.poison||undefined}><V5Piece type={unit.type} color={unit.color} awakened={unit.awakened} className="rb-art"/></span>{unit.protected&&<span className="rb-status-marker rb-protected" title="Invulnerable"><ShieldCheck/></span>}{unit.stunned&&<span className="rb-status-marker rb-stunned" title="Stunned"><Zap/></span>}{unit.wind&&<span className="rb-push-wind"><Wind className="animate-wind-gust"/></span>}</span>)}
   {current.effect&&<span key={`effect-${frame}`} className={`rb-scene-effect trap-fx trap-${current.effect.type} ${current.effect.type==='soul'?'match-summon-effect--soul':''}`} style={square(current.effect.x,current.effect.y)}><SceneEffect type={current.effect.type}/></span>}
  </div>}
  <figcaption>{current.caption}</figcaption>
 </figure>;
}
