import React from 'react';
import type {ChampionType,PlayerColor} from '../types.ts';
import {CartoonChampionIcon} from './CartoonChampionIcon.tsx';
import {PieceSculpture,sculptureBase} from './PieceSculpture.tsx';
type ExpansionType=ChampionType|'m'|'sp'|'sn';
export function ExpansionPieceIcon({type,color='w',className='w-full h-full'}:{type:ExpansionType;color?:PlayerColor;className?:string}) {
 if(type!=='m'&&type!=='sp')return <CartoonChampionIcon type={type} color={color} className={className}/>;
 return <PieceSculpture color={type==='m'?'w':color} className={className} design={type==='m'?'monolith':type} neutral={type==='m'}>{({fill,detail,shine})=><>{type==='m'?<><path d="M31 77 L36 31 Q36 27 40 23 L47 16 Q50 13 53 16 L60 23 Q64 27 64 31 L69 77 Z" fill={fill}/><path d="M50 17 V75" strokeWidth="1.4"/><path d="M50 35 V61 M43 43 L50 37 L57 43 M44 54 L50 60 L56 54" stroke={detail} strokeWidth="2"/></>:<><path d="M40 27 L38 21 Q38 18 41 21 L46 25 L49 20 Q50 18 51 20 L54 25 L59 21 Q62 18 62 21 L60 27 Z" fill={fill}/><circle cx="50" cy="37" r="10" fill={fill}/><path d="M40 49 Q50 46 60 49 Q62 52 58 54 Q56 62 65 77 H35 Q44 62 42 54 Q38 52 40 49 Z" fill={fill}/><path d="M46 61 L50 58 L54 61 L53 67 L50 70 L47 67 Z" fill={fill} strokeWidth="1.3"/><path d="M45 32 Q42 35 44 38" stroke={shine} strokeWidth="1.5"/></>}{sculptureBase(fill,shine)}</>}</PieceSculpture>;
}
