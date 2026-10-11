import React from 'react';
import {X, Crown, Sparkles} from 'lucide-react';
import type {ChampionPiece} from '../types.ts';
import {CHAMPION_DETAILS} from '../utils/chessLogic.ts';
import {PieceIcon} from './PieceIcons.tsx';
import {Modal} from './UI.tsx';

export function ChampionInfoDialog({champion,champions,onInspect,onClose,deployed=false}:{champion:ChampionPiece;champions?:{w:ChampionPiece|null;b:ChampionPiece|null}|null;onInspect?:(square:string)=>void;onClose:()=>void;deployed?:boolean}){
 const info=CHAMPION_DETAILS[champion.type];
 return <Modal className="champion-info-modal"><section id="champion-toolkit-banner" className={`champion-info-dialog border-2 ${info.borderTheme}`}>
  <header className="champion-info-heading"><div className={`champion-info-art ${info.accentBg}`}><PieceIcon type={champion.type} color={champion.color} className="w-full h-full"/></div><div><h2>{info.title}{deployed?' deployed':''}</h2><p>{info.subtitle}</p><small>{champion.color==='w'?'White':'Black'} Champion · {champion.square.toUpperCase()} · 5 army / capture points</small></div><button type="button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>
  {champions?.w&&champions.b&&onInspect&&<nav className="champion-info-tabs" aria-label="Inspect Champion">{(['w','b'] as const).map(color=>{const c=champions[color]!;return <button key={color} type="button" aria-pressed={champion.color===color} onClick={()=>onInspect(c.square)}><PieceIcon type={c.type} color={color} className="w-6 h-6"/>{color==='w'?'White':'Black'} · {CHAMPION_DETAILS[c.type].title}</button>})}</nav>}
  <div className="champion-info-section"><h3><Crown size={17}/>Standard Movement</h3><p>{info.standardMove}</p></div>
  <div className="champion-info-section champion-info-ultimate"><h3><Sparkles size={17}/>Ultimate: {info.ultimateName}</h3><p>{info.ultimateDesc}</p></div>
  <p className="champion-info-rules">Use a Champion card for the ultimate. Stunned or disarmed Champions cannot use it. Invulnerability and King safety still apply.</p>
  <footer><button type="button" onClick={onClose}>Got it</button></footer>
 </section></Modal>;
}
