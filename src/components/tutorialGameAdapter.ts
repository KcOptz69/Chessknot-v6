import type {Card,ClientMessage,GameLogEntry,GameState} from '../types.ts';
import {createInitialGameState} from '../utils/chessLogic.ts';
import {tutorialArmy,type TutorialAction,type TutorialState} from './tutorialBattle.ts';
export const tutorialCard=(c:{id:string;type:Card['type']},joker=false):Card=>({...c,name:c.type.toUpperCase(),description:({refresh:'Free action: discard your entire hand and draw five fresh cards. Unavailable during Joker Wild Surge.',joker:'Free action: replace your hand with five gold Wilds. Do not draw until they are all spent.',brick:'Unplayable. Remove it by discarding.',previous:'Move an eligible piece of the same type you moved on your previous turn.'} as Record<string,string>)[c.type]||`Move a ${c.type} using its normal chess movement.`,isJokerWild:joker||undefined});
export function tutorialGameState(s:TutorialState,base:GameState=createInitialGameState()):GameState {
 const whitePoints=tutorialArmy(s.fen,'w'),blackPoints=tutorialArmy(s.fen,'b');
 const seed:GameLogEntry={id:'tutorial-start',turn:'w',turnNumber:1,actionType:'move',detail:'Practice match with Friendly Joe',timestamp:0,whitePoints:39,blackPoints:39};
 const historyLog=s.log.map<GameLogEntry>((detail,i)=>({id:`tutorial-log-${i}`,turn:detail.startsWith('Black')?'b':'w',turnNumber:Math.floor(i/2)+1,actionType:detail.includes('Joker')?'joker':detail.includes('Refresh')?'refresh':detail.includes('discard Brick')?'pass':'move',detail,timestamp:i+1,whitePoints,blackPoints})).reverse();
 historyLog.push(seed);
 const last=s.log.at(-1)||'';
 return {...base,grounds:undefined,historyLog,fen:s.fen,turn:s.pendingBot||s.animating?'b':'w',turnNumber:(Number(s.fen.split(' ')[5])-1)*2+(s.fen.split(' ')[1]==='b'?2:1),status:'playing',winner:null,winReason:null,expansions:{shiftedParadigm:false,championsOfTheMonolith:false,theAwakening:false,treacherousGrounds:false},hands:{w:s.hand.map(c=>tutorialCard(c,s.joker)),b:s.blackHand.map((type,i)=>tutorialCard({id:`joe-${i}`,type}))},deck:s.deckTypes.map((type,i)=>tutorialCard({id:`tutorial-deck-${i}`,type})),discard:s.discard.map((type,i)=>tutorialCard({id:`tutorial-discard-${i}`,type})),exhausted:[],whitePoints,blackPoints,powerUps:{w:{wild:s.wild,vision:s.visionCharges,draw:s.exchangeCharges,monolith:0},b:{wild:s.log.some(l=>l.includes('Wild power-up'))?0:1,vision:1,draw:1,monolith:0}},powerUpProgress:{w:s.capturePoints%5,b:s.blackPoints%5},visionActive:{w:s.vision,b:false},jokerLocked:{w:s.joker,b:false},lastMovedPiece:{w:s.step===7?'q':null,b:null},lastMovedSquare:{w:s.lastMove?.player==='w'?s.lastMove.to||null:null,b:s.lastMove?.player==='b'?s.lastMove.to||null:null},lastMoveDetails:last.includes('Joker')?{player:'w',actionType:'joker'}:last.includes('Refresh')?{player:'w',actionType:'refresh'}:last.includes('discard Brick')?{player:'w',actionType:'redraw'}:s.lastMove,pendingSwapDiscard:s.panel==='exchange'?{player:'w',newCardIds:s.hand.slice(-2).map(c=>c.id)}:null,clock:{enabled:true,initialMinutes:10,incrementSeconds:0,w:600,b:600,lastTick:null,isRunning:false}};
}
/** All practice actions stay local: no tutorial request reaches the WebSocket. */
export function tutorialClientAction(msg:ClientMessage):TutorialAction|null {
 switch(msg.type){
  case 'play_card_move':case 'play_king_move':case 'use_powerup_wild_move':return {type:'move',from:msg.from,to:msg.to};
  case 'use_powerup_vision':return {type:'power',value:'vision'};
  case 'start_powerup_draw':return {type:'power',value:'exchange'};
  case 'use_powerup_draw':return {type:'confirm-exchange',ids:msg.discardCardIds};
  case 'discard_redraw':return {type:'confirm-redraw',ids:msg.cardIds};
  case 'play_refresh':return {type:'refresh'};
  case 'play_joker':return {type:'joker'};
  default:return null;
 }
}
export function tutorialSquareAllowed(s:TutorialState,square:string):boolean {
 if(s.phase!=='play'||s.pendingBot||s.animating||s.step>7&&s.step!==11)return false;
 const route=[['e2','e4'],['e4','d5'],['b1','c3'],['d2','d3'],['c3','e4'],['e1','e2'],['d1','d2'],['d2','a5']];
 if(s.step===2&&!s.vision||s.step===4&&(!s.exchange||s.hand.length!==5)||s.step===3&&s.selectedCard!=='wild-power')return false;
 if(s.step!==1&&s.step!==5&&!s.selectedCard)return false;
 return s.step===11||route[s.step].includes(square);
}
export const TUTORIAL_ROUTE=[['e2','e4'],['e4','d5'],['b1','c3'],['d2','d3'],['c3','e4'],['e1','e2'],['d1','d2'],['d2','a5']];
