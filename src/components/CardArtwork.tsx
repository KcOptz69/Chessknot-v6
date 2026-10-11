import React from 'react';
import type {Card, PlayerColor, ChampionPiece} from '../types.ts';
import {V5Piece,V5Power} from './V5Art.tsx';
export const cardDisplayName = (card: Card) => card.type.startsWith('awakening_') ? 'AWAKEN' : card.type === 'soul_release' ? 'SOUL RELEASE' : card.type === 'clock' ? 'CLOCK' : card.type === 'joker' ? 'JOKER' : card.name.toUpperCase();
export const isFreeActionCard = (type: Card['type']) => ['static','beacon','clock','joker','refresh'].includes(type);
export function FreeActionArtwork({children}:{children:React.ReactNode}) {
 return <span className="free-action-artwork">{children}<span className="free-action-icon-badge">FREE</span></span>;
}
export function CardArtwork({card,color='w',champion,className='w-full h-full'}:{card:Card;color?:PlayerColor;champion?:ChampionPiece|null;className?:string}) {
 if(card.type==='soul_release') {
  const pType = card.soul?.piece?.type || 'q';
  const pColor = card.soul?.piece?.color || (color === 'w' ? 'b' : 'w');
  return <V5Piece type={pType} color={pColor} className={className}/>;
 }
 const types:Record<string,string>={pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',awakening_pawn:'sp',awakening_knight:'sn',awakening_bishop:'b',awakening_rook:'r',awakening_queen:'q',awakening_king:'k',monolith:'m'};
 const artwork = types[card.type]||card.type==='champion'?<V5Piece awakened={card.type.startsWith('awakening_')} type={types[card.type]||champion?.type||'unknown'} color={color} className={className}/>:<V5Power type={card.type} className={className}/>;
 return isFreeActionCard(card.type)?<FreeActionArtwork>{artwork}</FreeActionArtwork>:artwork;
}
