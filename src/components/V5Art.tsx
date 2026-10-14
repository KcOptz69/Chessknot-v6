import {useBoardSprite} from '../context/PieceView.tsx';
import React from 'react';
import type {PlayerColor} from '../types.ts';
const normal=['p','n','b','r','q','k'];const special=['berserker','musketeer','summoner','ninja','sp','sn'];
// Actual artwork bounds, rather than assuming a uniform grid. Each nested SVG clips
// its own piece; the common 240px canvas centers the silhouette and aligns bases.
const pieceBounds = [
 [[46,50,191,236],[258,41,419,239],[479,31,620,239],[710,56,862,238],[952,33,1101,239],[1172,22,1315,238]],
 [[48,280,191,467],[258,266,420,468],[476,256,619,468],[709,278,864,468],[947,256,1101,468],[1175,251,1319,468]],
 [[15,487,223,697],[253,486,443,697],[470,492,649,697],[703,500,911,697],[962,489,1106,695],[1173,486,1345,693]],
 [[14,718,229,928],[253,715,449,928],[468,717,651,928],[707,724,918,927],[962,718,1106,923],[1169,715,1346,922]],
 [[45,945,189,1129],[262,949,420,1129]],
];
export function V5Piece({type,color='w',className='w-full h-full',awakened=false}:{type:string;color?:PlayerColor;className?:string;awakened?:boolean}) {
 const sprite=useBoardSprite(type,color,awakened);
 if(sprite)return <img className={`piece-3d-art ${className}`} src={sprite} alt={`${color==='w'?'White':'Black'} ${type}`} draggable={false}/>;
 const awakenedType=type==='sp'?'p':type==='sn'?'n':type;
 if((awakened||type==='sp'||type==='sn')&&normal.includes(awakenedType))return <svg role="img" aria-label={`${color==='w'?'White':'Black'} awakened ${awakenedType}`} data-awakened-art={awakenedType} className={`v5-art ${className}`} viewBox="0 0 240 240"><svg viewBox={`${normal.indexOf(awakenedType)*240} ${color==='w'?0:240} 240 240`} width="240" height="240" overflow="hidden"><image href={['p','b','q','k'].includes(awakenedType)?'/art/awakened-approved-v5.webp?v=approved-2':'/art/awakened-v5.png?v=red-forms-1'} width="1440" height="480"/></svg></svg>;
 let row:number,col:number;
 if(normal.includes(type)){row=color==='w'?0:1;col=normal.indexOf(type);}
 else if(special.includes(type)){row=color==='w'?2:3;col=special.indexOf(type);}
 else{row=4;col=type==='m'?0:1;}
 const [left,top,right,bottom]=pieceBounds[row][col];
 const cropWidth=right-left+4,cropHeight=bottom-top+4;
 const height=type==='m'?232:cropHeight;
 const width=type==='m'?cropWidth*height/cropHeight:cropWidth;
 return <svg role="img" aria-label={`${type==='m'?'Neutral':color==='w'?'White':'Black'} ${type}`} className={`v5-art ${className}`} data-neutral={type==='m'||undefined} viewBox="0 0 240 240" preserveAspectRatio="xMidYMid meet" data-piece-crop={`${row}-${col}`}>
   <svg x={(240-width)/2} y={234-height} width={width} height={height} style={{width,height}} viewBox={`${left-2} ${top-2} ${cropWidth} ${cropHeight}`} overflow="hidden">
     <image href="/art/pieces-solid-v5.png" width="1374" height="1145"/>
   </svg>
 </svg>;
}

const powers=['draw','vision','wild','push','switch','restrict','beacon','static','clock','joker','mine','poison','banish','disarm','portal','boost','gravity','defense','previous'];
const powerBounds=[[27,58,272,268],[300,50,533,276],[585,54,815,270],[857,71,1093,262],[1147,57,1364,273],[57,317,236,535],[289,307,545,550],[585,318,812,546],[857,321,1085,540],[1106,331,1380,548],[34,582,257,835],[302,606,543,820],[575,598,824,832],[856,596,1088,840],[1137,597,1373,832],[41,870,254,1082],[293,863,553,1080],[570,857,830,1083],[863,886,1089,1062]];
export function V5Power({type,className='w-8 h-8'}:{type:string;className?:string}) {
 if(type==='refresh'||type==='brick')return <svg role="img" aria-label={type} data-power-crop={type} className={`v5-art ${className}`} viewBox="0 0 280 280"><svg viewBox={`${type==='refresh'?0:280} 0 280 280`} width="280" height="280" overflow="hidden"><image href="/art/base-refresh-brick-v5.webp" width="560" height="280"/></svg></svg>;
 if(type==='soul_release')return <V5Piece type="q" color="b" className={className}/>;
 const index=powers.indexOf(type);
 if(index<0)return <V5Piece type={type==='monolith'?'m':type} className={className}/>;
 const [left,top,right,bottom]=powerBounds[index],width=right-left+3,height=bottom-top+3;
 return <svg role="img" aria-label={type} data-power-crop={type} className={`v5-art ${className}`} viewBox="0 0 280 280">
  <svg x={(280-width)/2} y={(280-height)/2} width={width} height={height} style={{width,height}} viewBox={`${left-1} ${top-1} ${width} ${height}`} overflow="hidden"><image href="/art/powers-v5.png" width="1402" height="1122"/></svg>
 </svg>;
}
