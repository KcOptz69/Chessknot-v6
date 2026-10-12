import React from 'react';
import {FRONTIER_RANKS} from '../utils/frontierBoard.ts';
import {FrontierArt} from './FrontierUI.tsx';
import {RuleDemo} from './RuleDemo.tsx';
import {ArrowLeft, Lock, X} from 'lucide-react';
import {Modal} from './UI.tsx';
import {CardArtwork} from './CardArtwork.tsx';
import {V5Piece, V5Power} from './V5Art.tsx';
import {RULE_BANNERS, RULE_SECTIONS, FRONTIER_RULES, AWAKENING_WILD_DESCRIPTION} from './rulebookData.ts';
import type {RuleItem, RuleSectionId} from './rulebookData.ts';

export function RuleArtwork({item}:{item:RuleItem}) {
 if(item.frontier)return <FrontierArt type={item.frontier} className="rb-art"/>;
 if(item.card)return <CardArtwork card={{id:`rule-${item.id}`,type:item.card,name:item.name,description:item.description}} className="rb-art"/>;
 if(item.piece)return <V5Piece type={item.piece} className="rb-art"/>;
 return <V5Power type={item.power||'wild'} className="rb-art"/>;
}

export function RuleGallery({title,items,introduction}:{title:string;items:RuleItem[];introduction?:string}) {
 const [selected,setSelected]=React.useState<RuleItem|null>(items[0]);
 const [wild,setWild]=React.useState(false);
 const detailId=React.useId();
 const gridRef=React.useRef<HTMLDivElement>(null);
 const hoverBlocked=React.useRef(false);
 const dismiss=()=>{const id=selected?.id;hoverBlocked.current=true;setSelected(null);window.requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLButtonElement>(`[data-rule-item="${id}"]`)?.focus());};
 const select=(item:RuleItem)=>{setSelected(item);setWild(false);};
 if(!items.length)return null;
 const awakened=selected?.card?.startsWith('awakening_');
 return <section className="rb-gallery" aria-label={title}>
  <h3 className="rb-section-heading">{title}</h3>{introduction&&<p className="rb-power-intro">{introduction}</p>}
  {selected&&<div className={`rb-detail ${selected.noDemo||['brick','vision','draw'].includes(selected.id)?'rb-detail-no-demo':''}`} id={detailId}>
   <button type="button" className="rb-detail-close" aria-label="Close card information" onClick={dismiss}><X size={16}/></button>
   <div className="rb-detail-icon" aria-hidden="true"><RuleArtwork item={selected}/></div>
   <div className="rb-detail-copy"><div className="rb-detail-title"><h4>{selected.name}</h4>{selected.count!==undefined&&<strong>×{selected.count}</strong>}</div>
    <span className={`rb-action ${selected.action==='FREE ACTION'?'rb-free':''}`}>{selected.action}</span>
    {awakened&&<div className="rb-awaken-choice" aria-label="Read Awakening modes"><button type="button" aria-pressed={!wild} onClick={()=>setWild(false)}>Awaken</button><button type="button" aria-pressed={wild} onClick={()=>setWild(true)}>As Wild</button></div>}
    <p>{wild?AWAKENING_WILD_DESCRIPTION:selected.description}</p>{!wild&&selected.note&&<p className="rb-note">{selected.note}</p>}
   </div>
   {!selected.noDemo&&<RuleDemo key={`${selected.id}-${wild}`} item={wild?{...selected,demo:'wild'}:selected}/>}
  </div>}
  {selected?.related&&<RuleEntryPanel item={selected.related}/>}
  <p className="rb-grid-help">Tap a card or icon to read its effect. Hover also works with a mouse.</p>
  <div className="rb-icon-grid" ref={gridRef}>{items.map(item=><button type="button" key={item.id} data-rule-item={item.id} className={`rb-icon-card ${item.card?.startsWith('awakening_')?'rb-red':item.card==='soul_release'?'rb-black':['joker','clock'].includes(item.card||'')?'rb-gold':item.card==='champion'?'rb-purple':''}`} aria-pressed={selected?.id===item.id} aria-controls={detailId} onClick={()=>select(item)} onPointerEnter={e=>{if(e.pointerType==='mouse'&&!hoverBlocked.current)select(item);}} onPointerLeave={()=>{hoverBlocked.current=false;}}><span className="rb-grid-art" aria-hidden="true"><RuleArtwork item={item}/></span><strong>{item.name}</strong>{item.count!==undefined&&<small>×{item.count}</small>}</button>)}</div>
 </section>;
}


export function RuleEntryPanel({item}:{item:RuleItem}) {return <div className="rb-detail rb-detail-no-demo rb-fixed-detail"><div className="rb-detail-icon"><RuleArtwork item={item}/></div><div className="rb-detail-copy"><h4>{item.name}</h4><span className="rb-action">{item.action}</span><p>{item.description}</p>{item.note&&<p className="rb-note">{item.note}</p>}</div></div>;}
export function FrontierRuleBoard(){return <figure className="rb-frontier-map"><div role="img" aria-label="An eight-file, twelve-rank board. Mystic ranks W, X, Y, Z are between ranks 4 and 5." className="rb-frontier-map-grid">{[...FRONTIER_RANKS].reverse().flatMap((rank,y)=>Array.from({length:8},(_,x)=><span key={`${x}${rank}`} className={`${(x+y)%2?'rb-frontier-map-dark':''} ${/[WXYZ]/.test(rank)?'rb-frontier-map-mystic':''}`}>{x===0&&<small>{rank}</small>}</span>))}</div><figcaption>Mystic Field · central four ranks</figcaption></figure>;}
export function FrontierRuleDiscoveries(){
 const find=(id:string)=>FRONTIER_RULES.discoveries.find(item=>item.id===id)!;
 return <section className="rb-frontier-discoveries" aria-label="Mystic Field discoveries"><h3 className="rb-section-heading">MYSTIC FIELD DISCOVERIES</h3>
 <section><h4 className="rb-discovery-title">The Backpack</h4><RuleEntryPanel item={find('bag')}/></section>
 <section><h4 className="rb-discovery-title">The Treasure Chest</h4><RuleEntryPanel item={find('chest')}/><div className="rb-chest-rewards"><RuleGallery title="CHEST REWARDS" introduction="Random reward on opening. Cooldowns count the owner’s turns; single-use rewards are consumed after a successful action." items={FRONTIER_RULES.items.filter(item=>['lens','wings','star','banner','sigil'].includes(item.id))}/></div><h5 className="rb-frontier-subheading">MIMIC CHEST</h5><RuleEntryPanel item={find('mimic')}/></section>
 <section><h4 className="rb-discovery-title">The Arcane Golem</h4><RuleEntryPanel item={find('boss')}/><RuleGallery title="GOLEM DROPS" introduction="The defeated boss drops one of these three items at random. Collect the dropped item to obtain it." items={FRONTIER_RULES.items.filter(item=>['eye','feather','core'].includes(item.id))}/></section>
 </section>;
}

export function Rulebook({isOpen,onClose,initialSection=null,onStartTutorial}:{isOpen:boolean;onClose:()=>void;onStartTutorial?:()=>void;initialSection?:RuleSectionId|null;hasShiftedParadigm?:boolean;hasChampionsOfTheMonolith?:boolean;hasTheAwakening?:boolean}) {
 const [section,setSection]=React.useState<RuleSectionId|null>(initialSection);
 const scrollRef=React.useRef<HTMLDivElement>(null);
 const titleRef=React.useRef<HTMLHeadingElement>(null);
 React.useEffect(()=>{if(isOpen){setSection(initialSection);}},[isOpen,initialSection]);
 React.useEffect(()=>{scrollRef.current?.scrollTo({top:0});titleRef.current?.focus({preventScroll:true});},[section]);
 if(!isOpen)return null;
 const banner=RULE_BANNERS.find(b=>b.id===section);
 const content=section?RULE_SECTIONS[section]:null;
 return <Modal className="rb-backdrop">
  <div className="rb-dialog">
   <div className={`rb-navigation ${section?'':'rb-navigation-menu'}`}>{section?<button type="button" onClick={()=>setSection(null)}><ArrowLeft size={17}/>Menu</button>:<span/>}<button type="button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>
   <div className="rb-scroll" ref={scrollRef}>
    <header className="rb-header"><div className="rb-cover"><>{banner?<img src={`/art/menu/${banner.image}.webp`} alt=""/>:<><img className="rb-hero-light" src="/art/menu/hero-light.webp" alt=""/><img className="rb-hero-dark" src="/art/menu/hero-dark.webp" alt=""/></>}</></div><div className="rb-brand"><div><img src="/logo.png" alt="ChessKnot logo"/><span><strong>ChessKnot</strong><small>made by Kaze</small></span></div><p><b>Chess meets cards:</b><br/>Your next move changes everything.</p></div></header>
    <h2 ref={titleRef} tabIndex={-1} className={section?'rb-section-heading rb-page-title':'rb-menu-title'}>{banner?.title||'CHESSKNOT OFFICIAL RULEBOOK'}</h2>
    {!section?<nav className="rb-banner-grid" aria-label="Rulebook sections">{RULE_BANNERS.map(b=><button type="button" key={b.id} disabled={!b.available} className={`rb-banner ${!b.available?'rb-banner-unreleased':''}`} onClick={()=>{if(b.available)setSection(b.id as RuleSectionId);}} aria-label={`${b.title}${b.available?'':' — Coming soon'}`}><img src={`/art/menu/${b.image}.webp`} alt="" loading="lazy"/>{b.id!=='soon'&&<span className="rb-banner-title">{b.title}</span>}{!b.available&&b.id!=='soon'&&<span className="rb-coming"><Lock size={13}/>COMING SOON</span>}</button>)}</nav>:content&&<main className="rb-content" key={section}>
     {content.introduction&&<p className="rb-expansion-intro">{content.introduction}</p>}
     <section className={`rb-mechanics ${section==='expansion5'?'rb-frontier-mechanics':''}`} aria-label="Mechanics"><ul>{content.mechanics.map(text=><li key={text}>{text}</li>)}</ul>{section==='expansion5'&&<FrontierRuleBoard/>}</section>
     {content.cards.length>0&&<RuleGallery title="CARDS IN DECK" introduction={content.deckIntroduction} items={content.cards}/>}
     {section==='expansion5'&&<FrontierRuleDiscoveries/>}
     {content.powers.length>0&&<RuleGallery title="POWER-UPS" introduction={section==='expansion4'?'Power-ups are special abilities activated from your power-up panel. Only the two tile types selected for this match can be received; unused charges accumulate.':'Power-ups are special abilities activated from your power-up panel without spending a hand card. Capture enemy pieces to earn one charge for every five capture points: Pawn 1, Knight/Bishop 3, Rook 5, Queen 9.'} items={content.powers}/>}
     {content.extra&&<RuleGallery title="CHAMPIONS & ULTIMATES" items={content.extra}/>}
     {section==='base'&&<section className="rb-victory"><h3 className="rb-section-heading">VICTORY CONDITIONS</h3><p><strong>Checkmate & King capture:</strong> Checkmate or capture the opponent’s King to win.</p><p><strong>Tactical army victory:</strong> Win when the opponent has nine or fewer army points. Queen 9 · Rook 5 · Bishop/Knight 3 · Pawn 1 · Champion 5.</p><p><strong>Chess clock:</strong> Run out of time and you lose. Time limits and increments are set in the lobby. Disconnects pause the match and clock; after five minutes, the connected opponent may claim a win.</p></section>}

    </main>}
   </div>
   <footer className="rb-footer">{section?<button type="button" onClick={()=>setSection(null)}><ArrowLeft size={14}/>Back to menu</button>:<button className="tutorial-entry-gold" type="button" onClick={onStartTutorial}>Play interactive tutorial</button>}<button type="button" onClick={onClose}>Close</button></footer>
  </div>
 </Modal>;
}
