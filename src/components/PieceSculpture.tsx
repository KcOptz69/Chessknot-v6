import React, {useId} from 'react';
import type {PlayerColor} from '../types.ts';
type Palette={fill:string;edge:string;detail:string;shine:string;shadow:string};
export function PieceSculpture({color,className,design,neutral=false,children}:{color:PlayerColor;className:string;design:string;neutral?:boolean;children:(palette:Palette)=>React.ReactNode}) {
 const id=useId().replace(/[^a-zA-Z0-9_-]/g,'');const white=color==='w';
 const edge=neutral?'#233649':white?'#344253':'#101a29';
 const shine=neutral?'#b5c5d0':white?'#ffffff':'#718196';
 const shadow=neutral?'#4b6175':white?'#c2ccd6':'#182334';
 const detail=neutral?'#d4e0e9':white?'#667587':'#8797aa';
 return <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" data-piece-design={design}>
 <defs><linearGradient id={`stone-${id}`} x1="24" y1="40" x2="77" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor={shine}/><stop offset=".36" stopColor={neutral?'#8298aa':white?'#f8fafc':'#3b4b60'}/><stop offset="1" stopColor={shadow}/></linearGradient></defs>
 <g stroke={edge} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children({fill:`url(#stone-${id})`,edge,detail,shine,shadow})}</g></svg>;
}
export const sculptureBase=(fill:string,shine:string)=><><path d="M34 77 Q50 73 66 77 L71 82 Q75 87 74 91 H26 Q25 87 29 82 Z" fill={fill}/><path d="M30 85 Q50 82 70 85" strokeWidth="1.5"/><path d="M31 88 H67" stroke={shine} strokeWidth="1" opacity=".75"/></>;
