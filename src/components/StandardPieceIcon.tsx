import React from 'react';
import type {PlayerColor,StandardPieceType} from '../types.ts';
import {PieceSculpture,sculptureBase} from './PieceSculpture.tsx';
export function StandardPieceIcon({type,color='w',className='w-full h-full'}:{type:StandardPieceType;color?:PlayerColor;className?:string;awakened?:boolean}) {
 return <PieceSculpture color={color} className={className} design={`classic-${type}`}>{({fill,edge,detail,shine})=>{
 let body:React.ReactNode;
 switch(type){
 case 'p':body=<><circle cx="50" cy="30" r="10" fill={fill}/><path d="M40 42 Q50 39 60 42 Q62 45 58 47 Q54 50 57 59 Q59 67 65 77 H35 Q41 67 43 59 Q46 50 42 47 Q38 45 40 42 Z" fill={fill}/><path d="M45 25 Q42 28 44 32" stroke={shine} strokeWidth="2"/><path d="M44 52 Q42 66 39 71" stroke={shine} strokeWidth="1.5"/></>;break;
 case 'n':body=<><path d="M37 26 Q35 18 39 17 L46 25 Q55 22 64 28 Q76 36 76 50 Q75 66 68 77 H31 Q31 65 44 51 L34 54 Q29 55 25 50 Q22 47 25 43 L35 34 Q38 31 37 26 Z" fill={fill}/><path d="M53 28 Q65 33 68 45 Q71 57 66 67" stroke={detail} strokeWidth="3.5"/><path d="M37 36 L31 43 M27 49 Q31 51 35 48" strokeWidth="1.4"/><ellipse cx="44" cy="34" rx="2" ry="1.5" fill={edge} stroke="none"/><path d="M42 20 L43 27" strokeWidth="1.3"/><path d="M40 61 Q35 66 35 72" stroke={shine} strokeWidth="1.5"/></>;break;
 case 'b':body=<><circle cx="50" cy="13" r="3.3" fill={fill}/><path d="M50 20 C42 26 34 34 34 42 Q34 54 50 57 Q66 54 66 42 C66 34 58 26 50 20 Z" fill={fill}/><path d="M50 25 L57 37" strokeWidth="2.4"/><path d="M40 59 Q50 56 60 59 Q64 62 58 64 Q56 69 64 77 H36 Q44 69 42 64 Q36 62 40 59 Z" fill={fill}/><path d="M42 32 Q37 40 40 46" stroke={shine} strokeWidth="1.5"/></>;break;
 case 'r':body=<><path d="M29 19 Q27 19 27 22 V35 Q27 42 34 44 H66 Q73 42 73 35 V22 Q73 19 71 19 H65 V28 H57 V19 H43 V28 H35 V19 Z" fill={fill}/><path d="M35 44 Q39 57 35 71 Q33 74 34 77 H66 Q67 74 65 71 Q61 57 65 44 Z" fill={fill}/><path d="M35 49 H65 M35 71 H65" strokeWidth="1.4"/><path d="M41 53 Q42 61 40 66" stroke={shine} strokeWidth="1.5"/></>;break;
 case 'q':body=<><path d="M26 26 Q25 23 28 26 L38 39 L38 19 Q38 17 40 20 L50 36 L60 20 Q62 17 62 19 L62 39 L72 26 Q75 23 74 26 L66 54 Q65 59 60 63 Q57 68 65 77 H35 Q43 68 40 63 Q35 59 34 54 Z" fill={fill}/><g fill={fill}><circle cx="25" cy="22" r="3"/><circle cx="38" cy="16" r="3"/><circle cx="50" cy="10" r="3"/><circle cx="62" cy="16" r="3"/><circle cx="75" cy="22" r="3"/></g><path d="M35 53 Q50 47 65 53 M38 61 Q50 56 62 61"/><path d="M42 65 Q44 70 39 74" stroke={shine} strokeWidth="1.5"/></>;break;
 case 'k':body=<><path d="M48 8 Q50 6 52 8 V15 H57 Q60 17 57 19 H52 V27 H48 V19 H43 Q40 17 43 15 H48 Z" fill={fill}/><path d="M50 33 Q39 25 33 32 Q25 42 37 54 Q43 59 40 66 Q39 71 34 77 H66 Q61 71 60 66 Q57 59 63 54 Q75 42 67 32 Q61 25 50 33 Z" fill={fill}/><path d="M31 43 Q40 39 50 48 Q60 39 69 43 M40 63 Q50 60 60 63"/><path d="M36 35 Q32 39 36 44 M43 67 Q43 72 39 74" stroke={shine} strokeWidth="1.5"/></>;break;
 }
 return <>{body}{sculptureBase(fill,shine)}</>;
 }}</PieceSculpture>;
}
