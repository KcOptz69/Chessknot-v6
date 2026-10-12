import React from 'react';
import {BookOpen, Sparkles, Star, X} from 'lucide-react';
import type {Card, PlayerColor} from '../types.ts';
import {AWAKENING_DESCRIPTIONS, AWAKENING_WILD_DESCRIPTION} from '../utils/cardDescriptions.ts';
import {Modal} from './UI.tsx';
import {V5Piece} from './V5Art.tsx';

type Guide={key:number;owner:PlayerColor;card:Card};
const PIECES:Record<string,string>={awakening_pawn:'p',awakening_knight:'n',awakening_bishop:'b',awakening_rook:'r',awakening_queen:'q',awakening_king:'k'};
// Own panels do not block themselves. The expansion offer waits for Awakening
// in App, so it must not also make Awakening wait for the expansion offer.
export function hasOtherAwakeningDialog(candidates:Iterable<Element>) {
 return Array.from(candidates).some(node=>!node.closest('.awakening-tutorial-modal,.frontier-expand-offer'));
}
// This component is mounted for one active match only. Preferences and hand
// tracking are local: neither player can dismiss or see the other's guides.
export function AwakeningTutorial({hands,color,paused,sharedDevice=false,onOpenChange}:{sharedDevice?:boolean;hands:Record<PlayerColor,Card[]>;color:PlayerColor;paused:boolean;onOpenChange:(open:boolean)=>void}) {
 const [answers,setAnswers]=React.useState<Record<PlayerColor,boolean|null>>({w:null,b:null});
 const [showGuides,setShowGuides]=React.useState(false);
 const [guides,setGuides]=React.useState<Guide[]>([]);
 const previousHands=React.useRef<Record<PlayerColor,Set<string>>>({w:new Set(),b:new Set()});
 const sequence=React.useRef(0);
 const [anotherDialog,setAnotherDialog]=React.useState(false);
 React.useEffect(()=>{
  const update=()=>setAnotherDialog(hasOtherAwakeningDialog(document.querySelectorAll('.ui-modal,.ground-popup,.ground-dialog,[aria-label="Match Chat Drawer"]')));
  const observer=new MutationObserver(update);
  observer.observe(document.body,{childList:true,subtree:true});update();
  return()=>observer.disconnect();
 },[]);
 React.useEffect(()=>{
  if(paused||answers[color]===null)return;
  const hand=hands[color]||[];
  const fresh=hand.filter(c=>PIECES[c.type]&&!previousHands.current[color].has(c.id));
  previousHands.current[color]=new Set(hand.map(c=>c.id));
  if(answers[color]===false&&fresh.length)setGuides(q=>[...q,...fresh.map(card=>({key:++sequence.current,owner:color,card:{...card}}))]);
 },[hands,color,answers,paused]);
 const guide=guides.find(g=>g.owner===color);
 const introduction=answers[color]===null;
 const visible=!paused&&!anotherDialog&&(introduction||Boolean(guide));
 React.useEffect(()=>{onOpenChange(visible);},[visible,onOpenChange]);
 React.useEffect(()=>()=>onOpenChange(false),[onOpenChange]);
 const answer=(familiar:boolean)=>{setAnswers(a=>sharedDevice?{w:familiar,b:familiar}:{...a,[color]:familiar});};
 const dismiss=()=>setGuides(q=>q.filter(g=>g.key!==guide?.key));
 if(!visible)return null;
 if(introduction)return <Modal className="awakening-tutorial-modal"><section className="ground-dialog grounds-intro awakening-intro" role="dialog" aria-modal="true" aria-labelledby="awakening-intro-title" data-awakening-tutorial="intro"><div className="grounds-intro-eyebrow">EXPANSION III · THIS MATCH</div><h2 id="awakening-intro-title">The <span>Awakening</span></h2><p className="grounds-intro-lead">Awaken your army. Unlock each piece’s skill.</p><div className="grounds-intro-options">{Object.entries(PIECES).map(([type,piece])=><article key={type} className="grounds-intro-option"><div className="grounds-intro-icon"><V5Piece type={piece} color={color} awakened className="w-full h-full"/></div><div><span className="grounds-intro-kind">Awakening skill</span><h3>{({p:'Super Pawn',n:'Super Knight',b:'Awakened Bishop',r:'Awakened Rook',q:'Awakened Queen',k:'Awakened King'} as Record<string,string>)[piece]}</h3></div><p>{AWAKENING_DESCRIPTIONS[type]}</p></article>)}</div><div className="grounds-intro-timing"><strong>Play as Wild</strong><span>{AWAKENING_WILD_DESCRIPTION}</span></div><label className="awakening-guide-toggle"><input type="checkbox" checked={showGuides} onChange={e=>setShowGuides(e.target.checked)}/>Show a guide when I draw an Awakening card</label><p className="grounds-intro-privacy">This choice applies to this match. Activation notifications still appear.</p><button className="grounds-intro-continue" onClick={()=>answer(!showGuides)}>Let’s play <span aria-hidden="true">→</span></button></section></Modal>;
 return <Modal className="champion-info-modal awakening-tutorial-modal"><section className="champion-info-dialog card-effect-dialog effect-awakening" data-awakening-tutorial={introduction?'intro':'guide'}>
  <header className="champion-info-heading"><div className="champion-info-art"><V5Piece type={guide?PIECES[guide.card.type]:'q'} color={color} awakened className="w-full h-full"/></div><div><h2>{introduction?'The Awakening':`${guide!.card.name} drawn`}</h2><p>Expansion III · {color==='w'?'White':'Black'}</p></div>{!introduction&&<button type="button" onClick={dismiss} aria-label="Close dialog"><X size={20}/></button>}</header>
  {introduction?<>
   <div className="champion-info-section"><h3><BookOpen size={18}/>Are you familiar with Awakening card mechanics?</h3><p>These cards can activate a piece’s Awakening skill or be played as a Wild. Would you like a guide when you receive one?</p></div>
   <p className="champion-info-rules">Your choice applies to this match. Choosing Yes skips draw-time guides; activation notifications still appear.</p>
   <footer className="awakening-familiarity-actions"><button type="button" onClick={()=>answer(true)}>Yes, I’m familiar</button><button type="button" onClick={()=>answer(false)}>No, show me guides</button></footer>
  </>:<>
   <div className="champion-info-section champion-info-ultimate"><h3><Sparkles size={17}/>Awakening skill</h3><p>{AWAKENING_DESCRIPTIONS[guide!.card.type]}</p></div>
   <div className="champion-info-section"><h3><Star size={17}/>Play as Wild</h3><p>{AWAKENING_WILD_DESCRIPTION}</p></div>
   <footer><button type="button" onClick={dismiss}>Got it</button></footer>
  </>}
 </section></Modal>;
}
