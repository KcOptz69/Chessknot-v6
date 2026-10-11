import type {GameState,PlayerColor,CapturedPiece} from '../types.ts';
import {createSafeChess} from './chessLogic.ts';
/** Compare opposing material before and after a committed action, including conversion and multi-capture. */
export function capturedInAction(before:Pick<GameState,'fen'|'champions'|'superPawns'|'superKnights'> & Partial<Pick<GameState,'pieceIds'|'soulSummons'>>,after:GameState,actor:PlayerColor):CapturedPiece[] {
 const enemy=actor==='w'?'b':'w',previous=createSafeChess(before.fen),current=createSafeChess(after.fen);
 const counts=new Map<string,number>();
 for(const row of current.board()) for(const p of row) if(p?.color===enemy && (previous.get(p.square)?.color!==enemy || previous.get(p.square)?.type!==p.type)) counts.set(p.type,(counts.get(p.type)||0)+1);
 const lost:CapturedPiece[]=[];
 for(const row of previous.board())for(const p of row)if(p?.color===enemy && (current.get(p.square)?.color!==enemy || current.get(p.square)?.type!==p.type)){
  const remaining=counts.get(p.type)||0;
  if(remaining)counts.set(p.type,remaining-1);
  else if(!before.soulSummons?.some(t=>t.pieceId===before.pieceIds?.[p.square]))lost.push({type:before.superPawns?.includes(p.square)?'sp':before.superKnights?.includes(p.square)?'sn':p.type,color:enemy});
 }
 const champ=before.champions?.[enemy];
 if(champ&&!after.champions?.[enemy])lost.push({type:champ.type,color:enemy});
 return lost;
}
