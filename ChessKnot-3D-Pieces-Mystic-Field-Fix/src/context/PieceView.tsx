import React from 'react';
import type {PlayerColor} from '../types.ts';
export type PieceView='3d'|'2d';
const key='chessknot_piece_view';
let fallback:PieceView='3d';
export function readPieceView(storage?:Pick<Storage,'getItem'>):PieceView {
 try {const target=storage??globalThis.localStorage;if(!target)return fallback;const value=target.getItem(key);return value==='2d'?'2d':'3d';}catch{return fallback;}
}
function subscribe(listener:()=>void){
 window.addEventListener('chessknot-piece-view',listener);window.addEventListener('storage',listener);
 return()=>{window.removeEventListener('chessknot-piece-view',listener);window.removeEventListener('storage',listener);};
}
export function usePieceView(){
 const view=React.useSyncExternalStore(subscribe,readPieceView,()=> '3d' as PieceView);
 const setView=React.useCallback((next:PieceView)=>{fallback=next;try{localStorage.setItem(key,next);}catch{}window.dispatchEvent(new Event('chessknot-piece-view'));},[]);
 return {view,setView};
}
export const BoardViewerColor=React.createContext<PlayerColor|null>(null);
export function pieceFacing(color:PlayerColor,viewer:PlayerColor,boss=false){return boss?'front':color===viewer?'rear':'front';}
export function useBoardSprite(type:string,color:PlayerColor='w',awakened=false):string|undefined {
 const {view}=usePieceView(),viewer=React.useContext(BoardViewerColor);
 if(view!=='3d'||!viewer)return;
 const normalized=type==='sp'?'p':type==='sn'?'n':type;
 const standard=['p','n','b','r','q','k'].includes(normalized);
 const unit=(awakened||type==='sp'||type==='sn')&&standard?`awakening_${normalized}`:normalized;
 const isBoss=['boss','weakened'].includes(type),isGolem=['golem','black_golem'].includes(type);
 const side=isBoss||type==='m'?'neutral':isGolem?(type==='black_golem'?'b':'w'):color;
 if(!standard&&!['berserker','musketeer','summoner','ninja','m','boss','weakened','golem','black_golem'].includes(type))return;
 const facing=type==='m'?'front':pieceFacing(side==='neutral'?'w':side,viewer,isBoss);
 return `/art/pieces-3d/${facing}-${isGolem?'golem':unit}-${side}.webp`;
}
