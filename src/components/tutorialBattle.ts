import {Chess, type Square} from 'chess.js';
import type {LastMoveDetails,CardType} from '../types.ts';

export type TutorialCard={id:string;type:CardType};
export type TutorialPhase='tour'|'play'|'finished';
export type TutorialState={fen:string;phase:TutorialPhase;step:number;tour:number;hand:TutorialCard[];blackHand:CardType[];selectedCard:string|null;selectedSquare:Square|null;exchange:boolean;brickExplained:boolean;discardIds:string[];vision:boolean;info:boolean;panel:string|null;log:string[];discard:CardType[];capturePoints:number;blackPoints:number;wild:number;visionCharges:number;exchangeCharges:number;deck:number;deckTypes:CardType[];serial:number;notice:string;bot:string;joker:boolean;pendingBot:{notation:string;index:number}|null;animating:boolean;lastMove:LastMoveDetails|null;moveId:number;};
export type TutorialAction={type:'next'|'square'|'card'|'power'|'exchange-confirm'|'redraw'|'refresh'|'joker'|'panel'|'close-panel'|'restart'|'bot'|'settle'|'move'|'deselect'|'confirm-exchange'|'confirm-redraw';value?:string;from?:string;to?:string;ids?:string[];};
export const TOUR=[
 {key:'board',title:'The board',text:'You are White. Pieces follow ordinary chess movement and capture rules. Blue squares show where your selected piece can go.'},
 {key:'hand',title:'Your hand',text:'Play a matching piece card to move. Your starting hand is two Pawns and three random cards. This lesson uses a prepared deck.'},
 {key:'powers',title:'Power-ups',text:'These abilities live outside your hand. Earn charges by capturing pieces. We will try Vision, Wild, and Exchange during this match.'},
 {key:'info',title:'Match info',text:'Open Info to find the deck, discard pile, opponent power-ups, and match log. These share a compact panel on phones and tablets.'},
 {key:'deck',title:'Draw pile',text:'The base deck contains 40 cards. Refill your hand to five at the end of your turn.'},
 {key:'discard',title:'Discard pile',text:'See played and discarded cards here. When the draw pile empties, the discard pile is shuffled into a new deck.'},
 {key:'opponent',title:'Opponent power-ups',text:'Check which power-ups your opponent still has. A Wild charge can move a standard piece even without its card.'},
 {key:'log',title:'Match log',text:'The log records moves, captures, and card effects so you can review what happened.'},
 {key:'chat',title:'Chat',text:'Use chat to talk to your opponent in online games.'},
 {key:'points',title:'Army and capture points',text:'Army points show the value of pieces still alive. Captured enemy pieces earn capture points: Pawn 1, Knight/Bishop 3, Rook 5, Queen 9.'},
 {key:'clock',title:'Chess clock',text:'A timed match ends when a player runs out of time. The clock is paused in this tutorial so you can learn at your own pace.'},
 {key:'options',title:'Options',text:'The real match Options menu contains appearance, sound, rules, and resign controls. You can leave this practice without affecting an online room.'},
] as const;
export const LESSONS=[
 ['Your opening','Select a PAWN card, then the pawn on e2 and its highlighted destination e4.'],
 ['Click the piece directly','Select your pawn on e4. Its matching Pawn card is selected automatically. Capture the black pawn on d5.'],
 ['Vision: inspect their hand','Use Vision first. Notice Black has no Queen card. Then select KNIGHT and move the b1 Knight to c3.'],
 ['Wild power-up','Black used a Wild charge to move its Queen, despite having no Queen card. Use your Wild power-up and move the d2 pawn to d3. Wild still obeys ordinary movement.'],
 ['Exchange: find a needed card','Your c1 Bishop could capture the Queen on g5, but you have no Bishop card or Wild left. Use Exchange: draw two cards, then discard exactly one QUEEN and one ROOK. No Bishop arrives, so move your c3 Knight to e4 instead.'],
 ['Escape check without a card','You can escape this check without spending any card. Select your King on e1 and move to e2. A normal King move needs no card; it still ends your turn.'],
 ['Move your Queen','Black developed its Knight. Select QUEEN and move your Queen from d1 to d2.'],
 ['Previous and capture rewards','Use PREVIOUS to move a Queen again, then capture Black’s Queen from d2 to a5. The captured Pawn and Queen total ten capture points: earn two new power-up charges.'],
 ['Brick: discard instead of playing','BRICK has no effect and cannot be played. Open Discard & Redraw, select only BRICK, and confirm. Redraw spends your move action; selecting no cards would pass.'],
 ['Refresh: a free new hand','REFRESH is a FREE ACTION: discard your entire hand and draw five new cards. Your move is still available. It cannot be used during Joker Wild Surge. Select REFRESH, then Use Refresh.'],
 ['Joker Wild Surge','Select JOKER and activate it for free. Your hand becomes five gold Wilds. No refills occur until all five are used.'],
 ['Your choice','Use one gold Wild to make any legal move with a standard piece. This time, you choose the piece and square.'],
 ['How to win','Win by checkmate, capturing the enemy King, reducing the enemy army to nine points or fewer, or winning on the chess clock. A capture also earns power-up charges every five capture points.'],
] as const;
const cards=(types:CardType[],start=0)=>types.map((type,i)=>({id:`tutorial-${start+i}`,type}));
function startingDeck():CardType[]{const pool:CardType[]=[];for(const [type,count] of Object.entries({pawn:6,knight:6,bishop:6,rook:6,queen:6,wild:4,previous:2,refresh:2,brick:1,joker:1}))for(let i=0;i<count;i++)pool.push(type as CardType);for(const type of ['pawn','pawn','knight','queen','rook','pawn','pawn','queen','knight','bishop'])pool.splice(pool.indexOf(type as CardType),1);return pool;}
export function initialTutorial():TutorialState{return {fen:new Chess().fen(),phase:'tour',step:0,tour:0,hand:cards(['pawn','pawn','knight','queen','rook']),blackHand:['pawn','pawn','queen','knight','bishop'],selectedCard:null,selectedSquare:null,exchange:false,brickExplained:false,discardIds:[],vision:false,info:false,panel:null,log:[],discard:[],capturePoints:0,blackPoints:0,wild:1,visionCharges:1,exchangeCharges:1,deck:30,deckTypes:startingDeck(),serial:5,notice:'',bot:'Welcome! I’m Friendly Joe. Let’s learn ChessKnot together.',joker:false,pendingBot:null,animating:false,lastMove:null,moveId:0};}
const cardPiece:Partial<Record<CardType,string>>={pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q'};
const expected=[['e2','e4','pawn'],['e4','d5','pawn'],['b1','c3','knight'],['d2','d3','wild-power'],['c3','e4','knight'],['e1','e2','king'],['d1','d2','queen'],['d2','a5','previous']] as const;
const responses=['d5','Qxd5','Qg5','e6','Qa5+','Nc6','Bd7','Nxa5'];
const botLines=['I’ll challenge your pawn with d5.','My Queen takes your pawn on d5. Watch how capture points work!','No Queen card? My Wild power-up lets me move her to g5.','I’ll open a path for my Bishop with e6.','Check! My Queen moves to a5. Your King must be safe.','I’ll bring my Knight to c6.','My Bishop develops to d7. What can your Queen do next?','My Knight takes your Queen. You still earned those ten capture points!'];
function draw(s:TutorialState,types:CardType[]):TutorialState{const deckTypes=[...s.deckTypes];for(const type of types){const index=deckTypes.indexOf(type);if(index<0)throw new Error('Tutorial deck has no '+type);deckTypes.splice(index,1);}return {...s,hand:[...s.hand,...cards(types,s.serial)],serial:s.serial+types.length,deck:deckTypes.length,deckTypes};}
function botMove(s:TutorialState,notation:string,index:number):TutorialState {
 const chess=new Chess(s.fen);const move=chess.move(notation);
 const type=({p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'} as Record<string,string>)[move.piece];
 let blackHand=[...s.blackHand],discard=[...s.discard],deckTypes=[...s.deckTypes],deck=s.deck;
 if(index!==2&&index!==8){const found=blackHand.indexOf(type as CardType);if(found>=0){blackHand.splice(found,1);discard.push(type as CardType);const next=({0:'bishop',1:'bishop',3:'queen',4:'pawn',5:'bishop',6:'rook',7:'knight'} as Record<number,CardType>)[index];const pos=deckTypes.indexOf(next);if(pos<0)throw new Error('Tutorial deck has no '+next);deckTypes.splice(pos,1);blackHand.push(next);deck=deckTypes.length;}}
 return {...s,pendingBot:null,animating:true,lastMove:{player:'b',actionType:'move',from:move.from,to:move.to},moveId:s.moveId+1,fen:chess.fen(),blackHand,discard,deck,deckTypes,log:[...s.log,`Black: ${move.san}${index===2?' (Wild power-up)':''}`],blackPoints:s.blackPoints+(move.captured?({p:1,n:3,b:3,r:5,q:9,k:0}[move.captured]):0),bot:index===8?'Queenside castling keeps my King safe. Ready for a fresh hand?':botLines[index]};
}
export function tutorialTargets(s:TutorialState):Square[]{
 if(s.phase!=='play'||!s.selectedSquare||s.step>11)return [];
 const c=new Chess(s.fen);
 if(s.step<8){const e=expected[s.step];return s.selectedSquare===e[0]?c.moves({square:s.selectedSquare,verbose:true}).filter(m=>m.to===e[1]).map(m=>m.to):[];}
 if(s.step===11)return c.moves({square:s.selectedSquare,verbose:true}).map(m=>m.to);
 return [];
}
export function tutorialReducer(state:TutorialState,action:TutorialAction):TutorialState {
 let s={...state,notice:''};const value=action.value||'';
 const error=(notice:string)=>({...state,notice});
 if(action.type==='restart')return initialTutorial();
 if(action.type==='bot')return s.pendingBot?botMove(s,s.pendingBot.notation,s.pendingBot.index):state;
 if(action.type==='settle')return {...s,animating:false};
 if(action.type==='close-panel')return {...s,panel:null};
 if(action.type==='panel')return {...s,panel:value,info:value==='info'||s.info};
 if(s.pendingBot||s.animating)return error('Watch the move finish before playing.');
 if(action.type==='deselect')return {...s,selectedCard:null,selectedSquare:null};
 if(action.type==='confirm-exchange')return tutorialReducer({...s,discardIds:action.ids||[]},{type:'exchange-confirm'});
 if(action.type==='confirm-redraw')return tutorialReducer({...s,discardIds:action.ids||[]},{type:'redraw'});
 if(action.type==='move'){
  if(!action.from||!action.to)return state;
  const fromState=tutorialReducer(s,{type:'square',value:action.from});
  return tutorialReducer(fromState,{type:'square',value:action.to});
 }



 if(action.type==='next'){
  if(s.phase==='tour'){if(TOUR[s.tour].key==='info'&&!s.info)return error('Open Info to try this control first.');return s.tour===TOUR.length-1?{...s,phase:'play',panel:null,bot:'You start as White. Show me your opening!'}:{...s,tour:s.tour+1};}
  if(s.phase==='play'&&s.step===8&&!s.brickExplained)return {...s,brickExplained:true};
  if(s.step===12)return {...s,phase:'finished',bot:'Well played! You’ve learned the base game. Try an online match when you’re ready.'};
  return s;
 }
 if(action.type==='power'){
  if(value==='vision'&&s.step===2&&!s.vision&&s.visionCharges)return {...s,vision:true,visionCharges:0,panel:'vision',bot:'You can see my cards now. Not a single Queen card!'};
  if(value==='wild'&&s.step===3&&s.wild)return {...s,selectedCard:'wild-power'};
  if(value==='exchange'&&s.step===4&&s.exchange&&s.hand.length===7)return {...s,panel:'exchange'};
  if(value==='exchange'&&s.step===4&&!s.exchange&&s.exchangeCharges){s=draw(s,['knight','queen']);return {...s,exchange:true,exchangeCharges:0,discardIds:[],panel:'exchange'};}
  return error('Follow the highlighted lesson before using another power-up.');
 }
 if(action.type==='card'){
  const card=s.hand.find(c=>c.id===value);if(!card)return state;
  if(s.panel==='exchange'||s.panel==='redraw')return {...s,discardIds:s.discardIds.includes(value)?s.discardIds.filter(id=>id!==value):[...s.discardIds,value]};
  const required=s.step<8?expected[s.step][2]:s.step===9?'refresh':s.step===10?'joker':s.step===11?'wild':null;
  if(card.type!==required)return error('Select the card named in this lesson.');
  if(s.step===2&&!s.vision)return error('Use Vision before moving your Knight.');
  if(s.step===4&&!s.exchange)return error('Use Exchange and finish discarding two cards first.');
  return {...s,selectedCard:value,selectedSquare:s.selectedCard===value?s.selectedSquare:null};
 }
 if(action.type==='exchange-confirm'){
  const chosen=s.hand.filter(c=>s.discardIds.includes(c.id));
  if(s.panel!=='exchange'||chosen.length!==2||!chosen.some(c=>c.type==='queen')||!chosen.some(c=>c.type==='rook'))return error('Discard exactly one Queen and one Rook.');
  return {...s,hand:s.hand.filter(c=>!s.discardIds.includes(c.id)),discard:[...s.discard,...chosen.map(c=>c.type)],discardIds:[],panel:null,bot:'No Bishop in those two cards. Your Knight can still improve its position.'};
 }
 if(action.type==='redraw'){
  if(s.step!==8)return error('Redraw comes later in this lesson.');
  if(!s.brickExplained)return error('Read about the highlighted Brick, then press Next first.');
  if(s.panel!=='redraw')return {...s,panel:'redraw',discardIds:[]};
  const chosen=s.hand.filter(c=>s.discardIds.includes(c.id));if(chosen.length!==1||chosen[0].type!=='brick')return error('Select only Brick for this redraw lesson.');
  s=draw({...s,hand:s.hand.filter(c=>c.type!=='brick'),discard:[...s.discard,'brick'],panel:null,discardIds:[],step:9},['refresh']);
  const c=new Chess(s.fen);c.load(s.fen.replace(' w ',' b '));s.fen=c.fen();s.log=[...s.log,'White: discard Brick and redraw (move action)'];return {...s,pendingBot:{notation:'O-O-O',index:8},bot:'You discarded Brick and spent your move. Let me think…'};
 }
 if(action.type==='refresh'){
  if(s.step!==9||s.hand.find(c=>c.id===s.selectedCard)?.type!=='refresh')return error('Select Refresh first.');
  s=draw({...s,hand:[],discard:[...s.discard,...s.hand.map(c=>c.type)],selectedCard:null,step:10},['joker','pawn','knight','bishop','queen']);return {...s,log:[...s.log,'White: Refresh (free action)'],bot:'A whole new hand, and you still have your move. Is that a Joker?'};
 }
 if(action.type==='joker'){
  if(s.step!==10||s.hand.find(c=>c.id===s.selectedCard)?.type!=='joker')return error('Select Joker first.');
  return {...s,hand:cards(Array(5).fill('wild'),s.serial),serial:s.serial+5,discard:[...s.discard,...s.hand.map(c=>c.type)],selectedCard:null,joker:true,step:11,log:[...s.log,'White: Joker (free action)'],bot:'Five gold Wilds! Choose any legal standard-piece move.'};
 }
 if(action.type==='square'){
  if(s.phase!=='play'||(s.step>7&&s.step!==11)||s.panel)return state;
  const c=new Chess(s.fen),piece=c.get(value as Square);
  if(piece?.color==='w'&&value!==s.selectedSquare){
   if(s.step<8&&value!==expected[s.step][0])return error('Select the piece named in this lesson.');
   if(s.step===2&&!s.vision)return error('Use Vision first.');
   if(s.step===4&&(!s.exchange||s.hand.length!==5))return error('Finish Exchange first.');
   if(s.step===11&&piece.type==='k')return error('Try a gold Wild with a standard piece in this lesson.');
   let card=s.selectedCard;
   if(s.step===1)card=s.hand.find(p=>p.type==='pawn')?.id||null;
   if(s.step===5)card='king';
   if(s.step===11)card=s.hand.find(p=>p.type==='wild')?.id||null;
   if(!card)return error('Select the highlighted card first.');
   return {...s,selectedCard:card,selectedSquare:value as Square};
  }
  if(!tutorialTargets(s).includes(value as Square))return error('Choose a highlighted destination.');
  const move=c.move({from:s.selectedSquare!,to:value as Square,promotion:'q'});
  const spent=s.hand.find(p=>p.id===s.selectedCard);s={...s,fen:c.fen(),lastMove:{player:'w',actionType:'move',from:move.from,to:move.to},moveId:s.moveId+1,selectedSquare:null,selectedCard:null,panel:null,vision:false,hand:s.hand.filter(p=>p.id!==state.selectedCard),discard:spent&&!s.joker?[...s.discard,spent.type]:s.discard,capturePoints:s.capturePoints+(move.captured?({p:1,n:3,b:3,r:5,q:9,k:0}[move.captured]):0),log:[...s.log,`White: ${move.san}`]};
  if(s.step===11)return {...s,step:12,bot:'Nice choice! Your Wild followed that piece’s normal movement. Let’s finish with victory conditions.'};
  if(s.step===1)s.notice='Pawn captured: +1 capture point. Every five capture points awards a power-up charge; army points are tracked separately.';
  if(s.step===3)s.wild--;
  const draws:Partial<Record<number,CardType>>={0:'knight',1:'previous',2:'rook',4:'rook',6:'queen',7:'brick'};
  if(draws[s.step])s=draw(s,[draws[s.step]!]);
  if(s.step===7){s.wild++;s.visionCharges++;s.notice='10 capture points! You earned two power-up charges: Wild + Vision.';}
  const index=s.step;s.step++;return {...s,pendingBot:{notation:responses[index],index},bot:'Nice move. Let me think…'};
 }
 return state;
}
export function tutorialArmy(fen:string,color:'w'|'b'){return new Chess(fen).board().flat().reduce((sum,p)=>sum+(p?.color===color?{p:1,n:3,b:3,r:5,q:9,k:0}[p.type]:0),0);}
export const tutorialPieceForCard=cardPiece;

/** Reveal information only after the corresponding player action. */
export function tutorialDialogue(s:TutorialState,pendingPower:string|null=null):{title:string;text:string}{
 if(s.pendingBot)return {title:'Friendly Joe is thinking…',text:'Watch the board. Your opponent will respond in a moment.'};
 if(s.animating)return {title:'Friendly Joe’s move',text:'Watch the piece move to its new square before choosing your response.'};
 if(pendingPower)return {title:'Read the power-up',text:'Read the highlighted description panel, then press Use to activate the power-up.'};
 const destination=['e4','d5','c3','d3','e4','e2','d2','a5'][s.step];
 if(s.selectedSquare&&destination)return {title:'Choose the destination',text:`Now press the glowing ${destination} square to finish your move.`};
 if(s.step===0)return {title:'Your opening',text:s.selectedCard?'Select your pawn on e2.':'Your starting hand has two Pawns and three random cards. Select the glowing Pawn card.'};
 if(s.step===1)return {title:'Select a piece directly',text:'Your pawn can capture the black pawn on d5. Click your pawn on e4; its matching Pawn card is selected automatically.'};
 if(s.step===2)return !s.vision?{title:'Try Vision',text:'Let’s find out which cards Friendly Joe holds. Open power-ups and select Vision.'}:{title:'Vision reveals their hand',text:s.selectedCard?'Select your Knight on b1.':'Now you can see Black has no Queen card. Close the revealed hand when ready, then select your Knight card.'};
 if(s.step===3)return {title:'Wild power-up',text:s.selectedCard==='wild-power'?'Select your pawn on d2.':'Black moved its Queen with a Wild power-up even without a Queen card. Use your own Wild charge to try a move without spending a hand card.'};
 if(s.step===4)return !s.exchange?{title:'Need a Bishop card?',text:'Your Bishop could capture the Queen, but you have no Bishop card and no Wild charge left. Try Exchange to draw two extra cards.'}:s.hand.length===7?{title:'Exchange: choose two discards',text:s.discardIds.length===0?'Select one Queen card to discard.':s.discardIds.length===1?'Now select one Rook card to discard.':'Press Confirm in the highlighted Exchange popup. Exchange is a free action; your move remains available.'}:{title:'Choose another move',text:s.selectedCard?'Select the Knight on c3.':'Those draws did not include a Bishop. You still have your move: select a Knight card instead.'};
 if(s.step===5)return {title:'Escape check',text:'Your King is in check! Select your King on e1. A normal King move uses no card, but still ends your turn.'};
 if(s.step===6)return {title:'Develop your Queen',text:s.selectedCard?'Select your Queen on d1.':'Black developed its Knight. Select your Queen card.'};
 if(s.step===7)return {title:'Play Previous',text:s.selectedCard?'Select your Queen on d2.':'You moved a Queen on your last turn. Previous lets you move that piece type again. Select Previous.'};
 if(s.step===8&&!s.brickExplained)return {title:'Meet Brick',text:'The highlighted card is Brick. It does nothing and cannot be played. Discard it to remove it from your hand. Press Next to try Discard & Redraw.'};
 if(s.step===8)return {title:'A Brick in your hand',text:'Brick cannot be played. Your Queen capture brought your total to ten capture points and earned two charges. Open Redraw, select only Brick, and confirm to spend your turn.'};
 if(s.step===9)return {title:'Refresh your hand',text:s.selectedCard?'Refresh is a free action: discard your entire hand and draw five fresh cards. You can still move afterward. It cannot be used during Joker Wild Surge. Press Use Refresh.':'Your redraw gave you Refresh. Select it to learn what it does.'};
 if(s.step===10)return {title:'You drew Joker!',text:s.selectedCard?'Joker is a free action. Replace your hand with five gold Wilds; no refills until all five are used. Press Activate Joker.':'Your fresh hand includes Joker. Select it to read its effect.'};
 if(s.step===11)return {title:'Your choice',text:s.selectedCard?'Choose any standard piece, then a legal destination.':'Your hand is now five gold Wilds. Select one, then choose any legal standard-piece move.'};
 return {title:'How to win',text:LESSONS[12][1]};
}
