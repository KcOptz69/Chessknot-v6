import React from 'react';
import {Chess} from 'chess.js';
import {X,Info,MessageCircle,ArrowRight,RotateCcw,Zap,BookOpen} from 'lucide-react';
import {ChessBoard} from './ChessBoard.tsx';
import {CardHand} from './CardHand.tsx';
import {PowerUpsBar} from './PowerUpsBar.tsx';
import {GameHeader} from './GameHeader.tsx';
import {PlayerPanel,PopupHostContext} from './UI.tsx';
import {DiscardAndDeck} from './DiscardAndDeck.tsx';
import {ChatPanel} from './ChatPanel.tsx';
import {GameLog} from './GameLog.tsx';
import {OpponentHand} from './OpponentHand.tsx';
import {DiscardModal,DiscardRedrawModal} from './Modals.tsx';
import {TOUR,initialTutorial,tutorialReducer,tutorialArmy,tutorialDialogue} from './tutorialBattle.ts';
import type {Card,ChatMessage,GameLogEntry} from '../types.ts';

const route=[['e2','e4'],['e4','d5'],['b1','c3'],['d2','d3'],['c3','e4'],['e1','e2'],['d1','d2'],['d2','a5']];
const cardHelp:Record<string,string>={pawn:'Move one Pawn using its normal movement or capture.',knight:'Move one Knight in an L-shape.',bishop:'Move one Bishop diagonally.',rook:'Move one Rook along a rank or file.',queen:'Move one Queen along a rank, file, or diagonal.',previous:'Move an eligible piece of the same type you moved on your previous turn.',wild:'Move any standard piece using its normal movement.',refresh:'Free action: discard your entire hand and draw five new cards.',joker:'Free action: replace your whole hand with five gold Wilds.',brick:'Unplayable. Remove it by discarding.'};
const makeCard=(c:{id:string;type:Card['type']},joker=false):Card=>({...c,name:c.type.toUpperCase(),description:cardHelp[c.type]||'',isJokerWild:joker||undefined});
export function InteractiveTutorial({onClose}:{onClose:()=>void}) {
 const [s,dispatch]=React.useReducer(tutorialReducer,undefined,initialTutorial);
 const [host,setHost]=React.useState<HTMLDivElement|null>(null);
 const [anchor,setAnchor]=React.useState<React.CSSProperties>({});
 const [messages,setMessages]=React.useState<ChatMessage[]>([]);
 const [compact,setCompact]=React.useState(false);
 const [powersOpen,setPowersOpen]=React.useState(false);
 const [pendingPower,setPendingPower]=React.useState<string|null>(null);
 const [boardSize,setBoardSize]=React.useState(320);
 const [controlsHost,setControlsHost]=React.useState<HTMLDivElement|null>(null);
 const [descriptionHost,setDescriptionHost]=React.useState<HTMLDivElement|null>(null);
 const [uiDiscard,setUiDiscard]=React.useState<string[]>([]);
 const [guideSelector,setGuideSelector]=React.useState('');
 const [opponentRequest,setOpponentRequest]=React.useState(0);
 const [confirmExit,setConfirmExit]=React.useState(false);
 const [previousStatement,setPreviousStatement]=React.useState<{title:string;text:string}|null>(null);
 const dialogueHistory=React.useRef<{title:string;text:string}[]>([]);
 const requestExit=()=>setConfirmExit(true);
 const coach=React.useRef<HTMLDivElement>(null),center=React.useRef<HTMLDivElement>(null),lesson=React.useRef<HTMLDivElement>(null);
 const tour=s.phase==='tour'?TOUR[s.tour]:null;
 const chess=React.useMemo(()=>new Chess(s.fen),[s.fen]);
 const busy=!!s.pendingBot||s.animating;
 const hand=React.useMemo(()=>s.hand.map(c=>makeCard(c,s.joker)),[s.hand,s.joker]);
 const selected=hand.find(c=>c.id===s.selectedCard)||null;
 const dialogue=tutorialDialogue({...s,discardIds:uiDiscard},pendingPower);
 React.useEffect(()=>{const h=dialogueHistory.current;if(!h.length||h[h.length-1].title!==dialogue.title||h[h.length-1].text!==dialogue.text){h.push(dialogue);setPreviousStatement(null);}},[dialogue.title,dialogue.text]);
 const activePanel=s.panel&& !['vision','exchange','redraw'].includes(s.panel)?s.panel:null;
 const whitePoints=tutorialArmy(s.fen,'w'),blackPoints=tutorialArmy(s.fen,'b');
 const logs:GameLogEntry[]=s.log.map<GameLogEntry>((detail,i)=>({id:`tutorial-log-${i}`,turn:detail.startsWith('Black')?'b':'w',turnNumber:Math.floor(i/2)+1,actionType:detail.includes('Joker')?'joker':'move',detail,timestamp:i,whitePoints,blackPoints})).reverse();
 const deck=s.deckTypes.map((type,i)=>makeCard({id:`deck-${i}`,type}));
 const blackHand=s.blackHand.map((type,i)=>makeCard({id:`black-${i}`,type}));
 React.useEffect(()=>{const query=window.matchMedia('(max-width: 900px)');const update=()=>setCompact(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 React.useEffect(()=>{if(!s.pendingBot)return;const timer=setTimeout(()=>dispatch({type:'bot'}),1300);return()=>clearTimeout(timer);},[s.pendingBot]);
 React.useEffect(()=>{if(!s.animating)return;const timer=setTimeout(()=>dispatch({type:'settle'}),1100);return()=>clearTimeout(timer);},[s.animating]);
 React.useEffect(()=>{setPendingPower(null);},[s.step,s.vision,s.exchange,s.wild]);
 React.useLayoutEffect(()=>{
  if(!s.lastMove||!host||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const board=host.querySelector<HTMLElement>('#chess-board');if(!board)return;
  const flipped=board.dataset.orientation==='black';
  const animate=(from:string,to:string)=>{
   const cell=board.querySelector<HTMLElement>(`#square-${to}`),piece=cell?.querySelector<HTMLElement>('[data-motion-piece="standard"]');if(!cell||!piece)return;
   const dx=(from.charCodeAt(0)-to.charCodeAt(0))*cell.offsetWidth*(flipped?-1:1),dy=(Number(to[1])-Number(from[1]))*cell.offsetHeight*(flipped?-1:1);
   piece.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:900,easing:'cubic-bezier(.4,0,.2,1)'});
  };
  if(s.lastMove.from&&s.lastMove.to){animate(s.lastMove.from,s.lastMove.to);if(s.lastMove.from==='e8'&&s.lastMove.to==='c8')animate('a8','d8');}
 },[s.moveId,host]);
 React.useLayoutEffect(()=>{
  const fit=()=>{const c=center.current,l=lesson.current;if(!c||!l)return;setBoardSize(Math.max(120,Math.floor(Math.min(c.clientWidth,Math.max(180,(host?.clientHeight||600)-l.offsetHeight-(compact?310:290))))));};fit();const observer=new ResizeObserver(fit);if(center.current)observer.observe(center.current);if(lesson.current)observer.observe(lesson.current);return()=>observer.disconnect();
 },[s.step,s.phase,compact,dialogue,host]);
 // Glow the actual component control, including controls added by its own local state.
 React.useLayoutEffect(()=>{
  if(!host)return;
  const update=()=>{
   host.querySelectorAll('.tutorial-next-control').forEach(n=>n.classList.remove('tutorial-next-control'));
   let target:Element|null=null;
   if(tour){target=host.querySelector(`[data-tour="${tour.key}"]`);if(tour.key==='deck'||tour.key==='discard')target=host.querySelector(tour.key==='deck'?'button[title="View unseen cards in the deck and hidden opponent hand"]':'button[title="Click to view played cards in discard pile"]');if(tour.key==='clock')target=host.querySelector('.header-clock-pair');if(tour.key==='options')target=host.querySelector('[aria-label="Open options"]');if(tour.key==='chat'&&compact)target=host.querySelector('[aria-label="Open chat"]');if(tour.key==='opponent')target=host.querySelector('.opponent-status');}
   else if(!busy){
    if(pendingPower)target=host.querySelector('.powerup-use-panel .powerup-panel-copy') || host.querySelector('.powerup-use-panel');
    if(s.panel==='vision')target=host.querySelector('.vision-dialog');
    if(!target&&s.step===2&&!s.vision)target=host.querySelector(compact&&!powersOpen?'[data-tutorial-powers]':'#btn-powerup-vision');
    if(!target&&s.step===3&&s.selectedCard!=='wild-power')target=host.querySelector(compact&&!powersOpen?'[data-tutorial-powers]':'#btn-powerup-wild');
    if(!target&&s.step===4&&!s.exchange)target=host.querySelector(compact&&!powersOpen?'[data-tutorial-powers]':'#btn-powerup-draw');
    if(s.panel==='exchange'||s.panel==='redraw'){
     const modal=host.querySelector<HTMLElement>('.tutorial-portal .fixed .rounded-2xl, .tutorial-portal [role=dialog], .tutorial-portal .ground-dialog');
     if(modal)target=modal;
     const choices=[...host.querySelectorAll<HTMLElement>('[data-discard-card-id]')];
     const picked=choices.filter(b=>b.getAttribute('aria-pressed')==='true');
     const ids=picked.map(b=>b.dataset.discardCardId!);setUiDiscard(old=>old.join()===ids.join()?old:ids);
     if(s.panel==='exchange'){
      const needed=picked.some(b=>b.dataset.discardCardType==='queen')?'rook':'queen';
      if(!modal)target=picked.length===2?host.querySelector('#btn-confirm-discard'):choices.find(b=>b.dataset.discardCardType===needed&&b.getAttribute('aria-pressed')!=='true')||null;
     }else if(!modal)target=picked.some(b=>b.dataset.discardCardType==='brick')?host.querySelector('#btn-confirm-discard-redraw'):choices.find(b=>b.dataset.discardCardType==='brick')||null;
    }
    if(!target&&s.step===8)target=host.querySelector('[data-tutorial-redraw]');
    if(!target&&(s.step===9||s.step===10)&&selected)target=[...host.querySelectorAll('.card-description-panel button')].find(b=>/REFRESH|Activate.*Joker|Play Joker/i.test(b.textContent||''))||host.querySelector('#mobile-btn-play-joker');
    const type=s.step<8?['pawn','pawn','knight',null,'knight',null,'queen','previous'][s.step]:s.step===9?'refresh':s.step===10?'joker':s.step===11?'wild':null;
    if(!target&&!s.selectedCard&&type&&s.step!==1)target=host.querySelector(`[data-card-type="${type}"]`);
    if(!target&&s.step<8)target=host.querySelector(`#square-${s.selectedSquare?route[s.step][1]:route[s.step][0]}`);
    if(!target&&s.step===11&&!selected)target=host.querySelector('[data-card-type="wild"]');
   }
   target?.classList.add('tutorial-next-control');
   const selector=target?.id?`#${target.id}`:target?.getAttribute('data-tour')?`[data-tour="${target.getAttribute('data-tour')}"]`:'';
   setGuideSelector(old=>old===selector?old:selector);
   if(tour&&target&&coach.current){const r=target.getBoundingClientRect(),bounds=host.getBoundingClientRect(),popup=coach.current,below=r.bottom-bounds.top+8;setAnchor({top:below+popup.offsetHeight<bounds.height-6?below:Math.max(6,r.top-bounds.top-popup.offsetHeight-8),left:Math.min(Math.max(6,r.left-bounds.left),Math.max(6,bounds.width-popup.offsetWidth-6))});}
  };
  update();const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.attributeName==='aria-pressed'))update();});observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});window.addEventListener('resize',update);host.addEventListener('scroll',update,true);return()=>{observer.disconnect();window.removeEventListener('resize',update);host.removeEventListener('scroll',update,true);host.querySelectorAll('.tutorial-next-control').forEach(n=>n.classList.remove('tutorial-next-control'));};
 },[host,tour?.key,s.step,s.selectedCard,s.selectedSquare,s.vision,s.exchange,s.panel,busy,pendingPower,powersOpen,compact]);
 React.useEffect(()=>{if(!tour||!host)return;const timer=setTimeout(()=>host.querySelector<HTMLElement>(`[data-tour="${tour.key}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'}),50);return()=>clearTimeout(timer);},[tour?.key,host]);
 React.useEffect(()=>{if(tour&&['deck','discard','opponent','log'].includes(tour.key))dispatch({type:'panel',value:'info'});},[tour?.key]);
 const panel=(value:string)=>dispatch({type:'panel',value});
 const selectCard=(card:Card|null)=>dispatch(card?{type:'card',value:card.id}:{type:'deselect'});
 const usePower=(value:string)=>{dispatch({type:'power',value});if(value==='vision')dispatch({type:'close-panel'});setPendingPower(null);setPowersOpen(false);};
 const guard=(square:string)=>{
  if(busy||s.phase!=='play'||s.step>7&&s.step!==11)return false;
  if(s.step===2&&!s.vision||s.step===4&&(!s.exchange||s.hand.length!==5)||s.step===3&&s.selectedCard!=='wild-power'){dispatch({type:'square',value:square});return false;}
  if(s.step<8&&square!==route[s.step][0]&&square!==route[s.step][1]){dispatch({type:'square',value:square});return false;}
  if(s.step!==1&&s.step!==5&&!s.selectedCard){dispatch({type:'square',value:square});return false;}
  if(s.step<8&&square===route[s.step][0]||s.step===11&&chess.get(square as any)?.color==='w')dispatch({type:'square',value:square});
  return true;
 };
 const powers=<PowerUpsBar confirmPlacement hasShiftedParadigm={false} hasChampionsOfTheMonolith={false} powerUps={{draw:s.exchangeCharges,vision:s.visionCharges,wild:s.wild,monolith:0}} progress={s.capturePoints%5} isMyTurn={s.phase==='play'&&!busy} isJokerLocked={s.joker} isWildActive={s.selectedCard==='wild-power'} isMonolithMode={false} onUseDraw={()=>usePower('exchange')} onUseVision={()=>usePower('vision')} onUseWild={()=>usePower('wild')} onUseMonolith={()=>{}}/>;
 const piles=<DiscardAndDeck compact={compact} deckCards={deck} unseenHandCards={s.vision?[]:blackHand} discardPile={s.discard.map((type,i)=>makeCard({id:`discard-${i}`,type}))} exhaustedCards={[]} historyLog={logs} isMyTurn={!busy}/>;
 const rival=<OpponentHand hand={blackHand} isVisionActive={s.vision} opponentName="Friendly Joe" opponentPowerUps={{draw:1,vision:1,wild:s.log.some(l=>l.includes('(Wild power-up)'))?0:1,monolith:0}} hasShiftedParadigm={false} hasChampionsOfTheMonolith={false} openRequest={opponentRequest}/>;
 if(s.phase==='finished')return <div className="tutorial-finished"><BookOpen size={36}/><h2>Tutorial complete!</h2><p>You practiced the base game using the same board, cards, and controls as an online match.</p><button onClick={onClose}>START GAME <ArrowRight size={16}/></button></div>;
 return <PopupHostContext.Provider value={host?.querySelector<HTMLElement>('.tutorial-portal')||host}><div ref={setHost} className={`tutorial-shell actual-tutorial ${compact?'tutorial-compact':''}`} data-guide={guideSelector} onClickCapture={e=>{const button=(e.target as HTMLElement).closest('button');if(button?.id.startsWith('btn-powerup-')){const name=button.id.slice(12);setPendingPower(old=>old===name?null:name);}else if(button?.textContent?.trim()==='Cancel')setPendingPower(null);}}>
  <div className="tutorial-scroll">
  <div className="tutorial-header" data-tour="options"><GameHeader compact={compact} roomId="PRACTICE" myColor="w" turn={busy?'b':'w'} mode="online" whitePoints={whitePoints} blackPoints={blackPoints} status="playing" clock={{enabled:true,initialMinutes:10,incrementSeconds:0,w:600,b:600,lastTick:null,isRunning:false}} onOpenRules={()=>panel('rules')} onOpenClockConfig={()=>panel('clock')} onResign={requestExit} onSwitchMode={()=>{}} onReturnToLobby={requestExit}/><button className="tutorial-exit" onClick={requestExit} aria-label="Exit tutorial"><X size={17}/></button><span className="tutorial-paused-clock" data-tour="clock">Clock paused · practice</span></div>
  <aside className="tutorial-left">
   {!compact&&<div data-tour="deck" className="tutorial-piles">{piles}</div>}
   <div data-tour="chat" className="tutorial-chat"><button onClick={()=>panel('chat')}><MessageCircle size={16}/>Chat</button><div className="tutorial-bubble" role="status"><strong>Friendly Joe says</strong><p>{s.bot}</p></div></div>
   {!compact&&<div className="tutorial-description" ref={setDescriptionHost}/>}
  </aside>
  <main className="tutorial-center" ref={center}>
   <div data-tour="opponent"><PlayerPanel name="Friendly Joe" color="b" cards={s.blackHand.length} active={busy} points={blackPoints} actions={<><button data-tour="info" className="tag-icon-button" onClick={()=>panel('info')} aria-label="Open match info"><Info size={18}/><span className="tutorial-info-label">Info</span></button>{compact&&<button className="tag-icon-button" onClick={()=>panel('chat')} aria-label="Open chat"><MessageCircle size={16}/></button>}{rival}</>}/></div>
   <div data-tour="board" className="tutorial-live-board" style={{width:boardSize}}><div ref={setControlsHost} className="tutorial-board-controls"/><ChessBoard tutorialGuide={{from:s.step<8?route[s.step][0]:null,to:s.step<8?route[s.step][1]:null,guard}} controlsHost={controlsHost} fen={s.fen} myColor="w" turn={busy?'b':'w'} turnNumber={Number(s.fen.split(' ')[5])} isMyTurn={s.phase==='play'&&!busy} hand={hand} selectedCard={selected} onSelectCard={selectCard} restrictedSquares={[]} monolithSquare={null} lastMovedPiece={s.step===7?'q':null} lastMovedSquare={s.lastMove?.to||null} lastMoveDetails={s.lastMove} historyLog={logs} isWildPowerUp={s.selectedCard==='wild-power'} isMonolithPowerUp={false} onMove={(from,to)=>dispatch({type:'move',from,to})} onPushMove={()=>{}} onSwitchMove={()=>{}} onRestrictSquare={()=>{}} onPlaceMonolith={()=>{}}/></div>
   <div className="tutorial-lesson" ref={lesson} aria-live="polite"><strong>{tour?'Meet your match controls':(previousStatement||dialogue).title}</strong><p>{tour?'Follow the highlighted control.':(previousStatement||dialogue).text}</p>{!tour&&dialogueHistory.current.length>1&&<button type="button" className="tutorial-statement-back" onClick={()=>setPreviousStatement(old=>{const h=dialogueHistory.current;const index=old?h.findIndex(x=>x===old):h.length-1;return h[Math.max(0,index-1)]||null;})}>← Previous statement</button>}{previousStatement&&<button type="button" className="tutorial-statement-current" onClick={()=>setPreviousStatement(null)}>Current statement →</button>}{s.step===12&&s.phase==='play'&&<button onClick={()=>dispatch({type:'next'})}>Finish tutorial <ArrowRight size={15}/></button>}</div>
   <div data-tour="points" className="tutorial-player"><PlayerPanel name="You" color="w" cards={s.hand.length} active={!busy} points={whitePoints} turnLabel={busy?'Rival’s turn':'Your turn'} deckCount={compact?s.deck:undefined} onInspectCaptures={()=>panel('captures')}/><small>Capture points: {s.capturePoints}</small></div>
   <div data-tour="hand" className="tutorial-hand"><CardHand compact={compact} floatingDetails={!compact} descriptionHost={compact?undefined:descriptionHost} hand={hand} selectedCardId={selected?.id||null} onSelectCard={selectCard} onPlayRefresh={()=>dispatch({type:'refresh'})} onPlayJoker={()=>dispatch({type:'joker'})} isMyTurn={s.phase==='play'&&!busy} playerColor="w" lastMovedPiece={s.step===7?'q':null} isJokerLocked={s.joker} isKingInCheck={chess.isCheck()}/></div>
   <div className="tutorial-dock-actions">{compact&&<button data-tour="powers" data-tutorial-powers onClick={()=>setPowersOpen(true)}><Zap size={16}/>Power-ups</button>}<button data-tutorial-redraw disabled={busy||s.joker} onClick={()=>dispatch({type:'redraw'})}><RotateCcw size={16}/>Redraw / Pass</button></div>
   {s.notice&&<div className="tutorial-notice" role="alert">{s.notice}</div>}
  </main>
  {!compact&&<aside className="tutorial-right"><div data-tour="powers">{powers}</div><div data-tour="log"><GameLog historyLog={logs}/></div></aside>}
  </div>
  {(activePanel||powersOpen)&&<section className="tutorial-panel" role="dialog" aria-label="Tutorial match information"><header><strong>{powersOpen?'Your power-ups':activePanel==='info'?'Match information':'Practice information'}</strong><button onClick={()=>{dispatch({type:'close-panel'});setPowersOpen(false);}} aria-label="Close tutorial panel"><X size={17}/></button></header>{powersOpen?powers:activePanel==='chat'?<div className="tutorial-real-chat"><ChatPanel messages={messages} playerId="tutorial-white" playerName="You" myColor="w" onSendMessage={text=>setMessages(old=>[...old,{id:`chat-${old.length}`,senderId:'tutorial-white',senderName:'You',senderColor:'w',text,timestamp:Date.now()},{id:`chat-${old.length+1}`,senderId:'tutorial-joe',senderName:'Friendly Joe',senderColor:'b',text:'Thanks! Let’s keep practicing together.',timestamp:Date.now()}])}/></div>:activePanel==='info'?<><div data-tour="deck">{piles}</div><div data-tour="opponent">{rival}</div><div data-tour="log"><GameLog historyLog={logs}/></div></>:<p>{activePanel==='chat'?'Your online match has a chat panel here. In practice, your rival speaks through the dialogue bubble.':activePanel==='captures'?`You have ${s.capturePoints} capture points. Every five earns a power-up charge.`:activePanel==='clock'?'The chess clock is paused while you learn.':TOUR[11].text}</p>}</section>}
  <DiscardModal isOpen={s.panel==='exchange'} hand={hand} onCancel={()=>dispatch({type:'close-panel'})} onConfirmDiscard={ids=>dispatch({type:'confirm-exchange',ids})}/>
  <DiscardRedrawModal isOpen={s.panel==='redraw'} hand={hand} onCancel={()=>dispatch({type:'close-panel'})} onConfirm={ids=>dispatch({type:'confirm-redraw',ids})}/>
  {tour&&<div ref={coach} className="tutorial-coach" style={anchor} role="dialog" aria-label="Control introduction"><small>{s.tour+1} / {TOUR.length}</small><h3>{tour.title}</h3><p>{tour.text}</p>{s.tour>0&&<button type="button" onClick={()=>dispatch({type:'previous'})}>← Previous</button>}<button onClick={()=>dispatch({type:'next'})} disabled={tour.key==='info'&&!s.info}>{s.tour===TOUR.length-1?'Start battle':'Next'}<ArrowRight size={15}/></button></div>}
  <div className="tutorial-portal"/>
  {confirmExit&&<div className="tutorial-confirm-backdrop" role="presentation"><div className="tutorial-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tutorial-confirm-title" aria-describedby="tutorial-confirm-message"><h3 id="tutorial-confirm-title">Stop the tutorial?</h3><p id="tutorial-confirm-message">Your practice progress will be lost. Do you want to return to the main menu?</p><div className="tutorial-confirm-actions"><button type="button" onClick={()=>setConfirmExit(false)}>Continue tutorial</button><button type="button" onClick={onClose}>Stop tutorial</button></div></div></div>}
  <style>{`
  .actual-tutorial .tutorial-confirm-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,.75);display:grid;place-items:center;padding:16px;}
  .actual-tutorial .tutorial-confirm-dialog{background:#10213d;color:#f8fafc;border:1px solid #3b82f6;border-radius:14px;padding:22px;width:min(400px,100%);box-shadow:0 20px 60px #0009;}
  .actual-tutorial .tutorial-confirm-dialog h3{font-size:18px;font-weight:800;margin:0 0 8px;}
  .actual-tutorial .tutorial-confirm-dialog p{font-size:13px;line-height:1.5;}
  .actual-tutorial .tutorial-confirm-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px;}
  .actual-tutorial .tutorial-confirm-actions button{font-size:12px;padding:9px 12px;border-radius:8px;border:1px solid #64748b;}
  .actual-tutorial .tutorial-confirm-actions button:last-child{background:#1d4ed8;border-color:#3b82f6;}
  .actual-tutorial .tutorial-statement-back,.actual-tutorial .tutorial-statement-current{font-size:12px;margin:8px 8px 0 0;padding:5px 8px;border:1px solid #36557d;border-radius:7px;color:#bfdbfe;}
  .actual-tutorial .tutorial-next-control {outline:3px solid #60a5fa!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgba(37,99,235,.18)!important;}
  .actual-tutorial:has(.tutorial-portal .tutorial-next-control) .tutorial-portal .tutorial-next-control {position:relative;}
  .actual-tutorial:has(.tutorial-portal .tutorial-next-control) .tutorial-portal .tutorial-next-control [data-discard-card-type="brick"]::before {content:'↓';position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:17px;color:#60a5fa;pointer-events:none;}
  .actual-tutorial:has(.tutorial-portal .tutorial-next-control) .tutorial-portal .tutorial-next-control [data-discard-card-id] {position:relative;}
  .actual-tutorial:has(.tutorial-portal .tutorial-next-control) .tutorial-portal .tutorial-next-control [data-discard-card-type="queen"]::after, .actual-tutorial:has(.tutorial-portal .tutorial-next-control) .tutorial-portal .tutorial-next-control [data-discard-card-type="rook"]::after{content:"↓";position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:17px;color:#60a5fa;pointer-events:none;}
  @media(min-width:901px){.actual-tutorial .tutorial-chat .tutorial-bubble{position:static!important;transform:none!important;max-width:100%!important;margin-top:6px!important;}}
  `}</style>
  {s.notice&&['exchange','redraw'].includes(s.panel||'')&&<div className="tutorial-popup-notice" role="alert">{s.notice}</div>}
 </div></PopupHostContext.Provider>;
}
