import React from 'react';
import {createPortal} from 'react-dom';
import {X,ChevronDown,ChevronUp,ArrowRight} from 'lucide-react';
import {Modal,Button} from './UI.tsx';
import {TOUR,tutorialDialogue,type TutorialState,type TutorialAction} from './tutorialBattle.ts';
import {TUTORIAL_ROUTE} from './tutorialGameAdapter.ts';

type Props={state:TutorialState;dispatch:React.Dispatch<TutorialAction>;compact:boolean;onExit:()=>void;onOpenPanel:(key:'info'|'powers'|'log'|null)=>void;onResetSelection:()=>void};
type Box={left:number;top:number;width:number;height:number};
function first(selector:string){return document.querySelector<HTMLElement>(selector);}
export function MainTutorialOverlay({state:s,dispatch,compact,onExit,onOpenPanel,onResetSelection}:Props){
 const [box,setBox]=React.useState<Box|null>(null),[collapsed,setCollapsed]=React.useState(false),[pending,setPending]=React.useState<string|null>(null),[ids,setIds]=React.useState<string[]>([]);
 const [viewport,setViewport]=React.useState({width:0,height:0});
 const popup=React.useRef<HTMLDivElement>(null);
 const [confirmExit,setConfirmExit]=React.useState(false);
 const [history,setHistory]=React.useState<{title:string;text:string}[]>([]);
 const [reviewIndex,setReviewIndex]=React.useState<number|null>(null);
 const requestExit=()=>setConfirmExit(true);
 const tour=s.phase==='tour'?TOUR[s.tour]:null;
 const busy=!!s.pendingBot||s.animating;
 const visibleTour=TOUR.filter(item=>compact||item.key!=='info');
 React.useEffect(()=>{if(tour?.key==='info'&&!compact){dispatch({type:'panel',value:'info'});dispatch({type:'next'});}},[tour?.key,compact,dispatch]);
 const dialogue=tutorialDialogue({...s,discardIds:ids},pending);
 const statement=tour?{title:tour.title,text:tour.text}:dialogue;
 React.useEffect(()=>{
  if(busy)return;
  setHistory(old=>old.at(-1)?.title===statement.title&&old.at(-1)?.text===statement.text?old:[...old,statement]);
  setReviewIndex(null);
 },[statement.title,statement.text,busy]);
 const displayed=reviewIndex===null?statement:history[reviewIndex]||statement;
 const navigation=<div className="main-tutorial-navigation"><Button disabled={busy||(reviewIndex??history.length-1)<=0} onClick={()=>setReviewIndex(index=>Math.max(0,(index??history.length-1)-1))}>← Back</Button>{reviewIndex!==null&&<Button onClick={()=>setReviewIndex(index=>index!==null&&index<history.length-2?index+1:null)}>Next →</Button>}</div>;
 const exitConfirmation=confirmExit?<Modal className="main-tutorial-complete main-tutorial-exit-confirm"><section role="alertdialog" aria-modal="true" aria-labelledby="tutorial-exit-title"><h2 id="tutorial-exit-title">Stop the tutorial?</h2><p>Your practice progress will be lost. Return to the main menu?</p><div><Button onClick={()=>setConfirmExit(false)}>Continue tutorial</Button><Button onClick={onExit}>Stop tutorial</Button></div></section></Modal>:null;
 React.useEffect(()=>{setPending(null);setIds([]);},[s.step,s.vision,s.exchange,s.wild,s.selectedCard]);
 React.useEffect(()=>{
  const onClick=(event:Event)=>{const target=event.target as HTMLElement;if(s.panel==='vision'&&target.closest('.ground-popup')&&!target.closest('.vision-dialog'))dispatch({type:'close-panel'});const button=target.closest('button');if(!button)return;
   if(button.id.startsWith('btn-powerup-')){const name=button.id.slice(12);setPending(old=>old===name?null:name);}
   if(button.textContent?.trim()==='Cancel')setPending(null);
   if(button.closest('.vision-dialog')&&button.textContent?.trim()==='Close')dispatch({type:'close-panel'});
   if(tour?.key==='info'&&(button.getAttribute('aria-label')==='Open match info'||button.closest('.landscape-info-actions')))dispatch({type:'panel',value:'info'});
  };const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&s.panel==='vision')dispatch({type:'close-panel'});};document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey);};
 },[tour?.key,dispatch,s.panel]);
 React.useEffect(()=>{if(!tour)return;if(compact&&['deck','discard','opponent','log'].includes(tour.key))onOpenPanel('info');},[tour?.key,compact]);
 React.useLayoutEffect(()=>{
  const locate=()=>{
   let node:HTMLElement|null=null;
   const buttons=()=>[...document.querySelectorAll<HTMLButtonElement>('button')];
   if(tour){
    const selectors:Record<string,string>={board:'#chess-board',hand:'#player-hand-container',powers:compact?'.compact-dock-actions button:first-child':'#power-ups-bar',info:compact?'button[aria-label="Open match info"], .landscape-info-actions button':'.desktop-left-column',deck:compact?'.compact-info-list button:nth-child(1)':'#btn-inspect-draw-pile',discard:compact?'.compact-info-list button:nth-child(2)':'#btn-inspect-discard-pile',opponent:compact?'.compact-info-list button:nth-child(3)':'.opponent-status',log:compact?'.compact-info-list button:nth-child(4)':'#game-history-log',chat:compact?'button[aria-label="Open chat"]':'.desktop-left-chat',points:'.dock-player-tag .player-points, .landscape-player-host .player-points',clock:'.header-clock-pair',options:'button[aria-label="Open options"]'};
    node=first(selectors[tour.key]);
    if(tour.key==='points'&&!node)node=first('.player-points');
   }else if(!busy&&s.phase==='play'){
    if(s.panel==='vision')node=first('.vision-dialog');
    if(!node&&pending)node=first('.powerup-use-panel');
    const powerButton=(id:string)=>first('#'+id)||first('.compact-dock-actions button:first-child');
    if(!node&&s.step===2&&!s.vision)node=powerButton('btn-powerup-vision');
    if(!node&&s.step===3&&s.selectedCard!=='wild-power')node=powerButton('btn-powerup-wild');
    if(!node&&s.step===4&&!s.exchange)node=powerButton('btn-powerup-draw');
    if(s.panel==='exchange'||s.panel==='redraw'){
     const choices=[...document.querySelectorAll<HTMLElement>('[data-discard-card-id]')],chosen=choices.filter(b=>b.getAttribute('aria-pressed')==='true'),selected=chosen.map(b=>b.dataset.discardCardId!);
     setIds(old=>old.join()===selected.join()?old:selected);
     node=first(s.panel==='exchange'?'[data-tutorial-dialog="exchange"]':'[data-tutorial-dialog="redraw"]');
    }
    if(!node&&s.step===8&&!s.brickExplained)node=first('#player-hand-container [data-card-type="brick"]');
    if(!node&&s.step===8&&s.brickExplained)node=first('#btn-discard-redraw-footer')||buttons().find(b=>/Redraw.*Pass|Discard & Redraw/.test(b.textContent||''))||null;
    if(!node&&(s.step===9||s.step===10)&&s.selectedCard)node=[...document.querySelectorAll<HTMLButtonElement>('.card-description-panel button')].find(b=>/REFRESH|ACTIVATE JOKER/.test(b.textContent||''))||null;
    const type=s.step<8?['pawn','pawn','knight',null,'knight',null,'queen','previous'][s.step]:s.step===9?'refresh':s.step===10?'joker':s.step===11?'wild':null;
    if(!node&&!s.selectedCard&&type&&s.step!==1)node=first(`[data-card-type="${type}"]`);
    if(!node&&s.step<8)node=first(`#square-${s.selectedSquare?TUTORIAL_ROUTE[s.step][1]:TUTORIAL_ROUTE[s.step][0]}`);
    if(!node&&s.step===11)node=first('#chess-board');
   }
   setViewport(old=>old.width===window.innerWidth&&old.height===window.innerHeight?old:{width:window.innerWidth,height:window.innerHeight});
   if(node){const r=node.getBoundingClientRect();const next={left:Math.max(0,r.left-4),top:Math.max(0,r.top-4),width:r.width+8,height:r.height+8};setBox(old=>old&&Object.keys(next).every(k=>old[k as keyof Box]===next[k as keyof Box])?old:next);}
   else setBox(null);
  };
  locate();const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.attributeName==='aria-pressed'))locate();});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
  window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);const timer=setTimeout(locate,80);
  return()=>{observer.disconnect();clearTimeout(timer);window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};
 },[tour?.key,s.step,s.brickExplained,s.selectedCard,s.selectedSquare,s.vision,s.exchange,s.panel,busy,pending,compact,s.phase]);
 const next=()=>{if(tour?.key==='info'&&!compact)dispatch({type:'panel',value:'info'});if(tour?.key==='options'){onOpenPanel(null);dispatch({type:'close-panel'});}dispatch({type:'next'});};
 if(tour?.key==='info'&&!compact)return null;
 if((s.phase==='play'&&s.step===12&&!busy)||s.phase==='finished')return <Modal className="main-tutorial-complete main-tutorial-victory"><section role="dialog" aria-modal="true" aria-label="Tutorial complete"><h2>Victory Conditions</h2><p>{tutorialDialogue({...s,step:12}).text}</p><div><Button onClick={onExit}>START GAME <ArrowRight size={15}/></Button></div></section></Modal>;
 const interactive=!busy&&s.phase==='play'&&s.step<12||tour?.key==='info'&&compact&&!s.info;
 const focus=interactive&&box;
 let popupWidth=Math.min(300,Math.max(220,viewport.width-20));
 let popupHeight=collapsed?45:Math.min(250,viewport.height-24);
 let left=box?Math.max(10,Math.min(viewport.width-popupWidth-10,box.left)):10;
 const below=box?box.top+box.height+12:70;
 let top=box?(below+popupHeight<viewport.height-10?below:Math.max(10,box.top-popupHeight-12)):Math.max(10,viewport.height-popupHeight-20);
 if(box&&box.width<viewport.width*.8){
  if(viewport.width-box.left-box.width>popupWidth+24){left=box.left+box.width+12;top=Math.max(10,Math.min(box.top,viewport.height-popupHeight-10));}
  else if(box.left>popupWidth+24){left=box.left-popupWidth-12;top=Math.max(10,Math.min(box.top,viewport.height-popupHeight-10));}
  else{const above=box.top-22,after=viewport.height-below-10;if(Math.max(above,after)>70){popupHeight=Math.min(popupHeight,Math.max(above,after));top=after>=above?below:box.top-popupHeight-12;}}
 }
 // Keep desktop pile explanations in their own column, directly under the piles.
 if(!compact&&box&&tour&&['deck','discard'].includes(tour.key)){
  const column=first('.desktop-left-column')?.getBoundingClientRect();
  const piles=first('#deck-discard-area')?.getBoundingClientRect();
  if(column&&piles){popupWidth=Math.min(300,column.width,viewport.width-20);left=Math.max(10,column.left);top=piles.bottom+10;popupHeight=Math.min(popupHeight,Math.max(70,viewport.height-top-10));}
 }
 return createPortal(<>
  {focus&&<div className="main-tutorial-spotlight" aria-hidden="true"><div style={{left:0,top:0,width:'100%',height:box.top}}/><div style={{left:0,top:box.top,width:box.left,height:box.height}}/><div style={{left:box.left+box.width,top:box.top,right:0,height:box.height}}/><div style={{left:0,top:box.top+box.height,width:'100%',bottom:0}}/></div>}
  {box&&!busy&&<div className="main-tutorial-gold-frame" style={{left:box.left,top:box.top,width:box.width,height:box.height}} aria-hidden="true"/>}
  <div ref={popup} className="main-tutorial-coach" style={{left,top,width:popupWidth,maxHeight:Math.max(70,Math.min(popupHeight,viewport.height-top-10))}} role="region" aria-label="Friendly Joe tutorial guidance">
   <header><strong>Friendly Joe · {displayed.title}</strong><button aria-label={collapsed?'Expand tutorial guidance':'Minimise tutorial guidance'} onClick={()=>setCollapsed(p=>!p)}>{collapsed?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button><button aria-label="Exit tutorial" onClick={requestExit}><X size={16}/></button></header>
   {!collapsed&&<><p className="main-tutorial-joe">{s.bot}</p>{tour?<><small>{visibleTour.findIndex(item=>item.key===tour.key)+1} / {visibleTour.length}</small><h3>{displayed.title}</h3><p>{displayed.text}</p><Button onClick={next} disabled={reviewIndex!==null||(tour.key==='info'&&compact&&!s.info)}> {s.tour===TOUR.length-1?'Start battle':'Next'}<ArrowRight size={14}/></Button></>:<><p>{displayed.text}</p>{s.notice&&<p className="main-tutorial-error" role="alert">{s.notice}</p>}{reviewIndex===null&&s.step===8&&!s.brickExplained&&<Button onClick={()=>dispatch({type:'next'})}>Next<ArrowRight size={14}/></Button>}</>}</>}{!collapsed&&navigation}
  </div>
  {exitConfirmation}
 </>,document.body);
}
