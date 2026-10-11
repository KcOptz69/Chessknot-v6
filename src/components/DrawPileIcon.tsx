import React from 'react';

export function DrawPileIcon({className='',discard=false}:{className?:string;discard?:boolean}) {
 return <svg className={className} viewBox="0 0 80 90" fill="none" role="img" aria-label={discard?"Discard pile: played cards":"Draw pile: blue card stack"}>
  <rect x="5" y="14" width="44" height="62" rx="9" transform="rotate(-12 5 14)" fill="#123b80" stroke="#76baff" strokeWidth="2.5"/>
  <rect x="27" y="5" width="44" height="62" rx="9" transform="rotate(12 27 5)" fill="#176bce" stroke="#a6d8ff" strokeWidth="2.5"/>
  <rect x="18" y="18" width="45" height="63" rx="10" fill="#0b4b9b" stroke="#5db4ff" strokeWidth="3"/>
  <rect x="23" y="23" width="35" height="53" rx="7" stroke="#a5d8ff" strokeWidth="1.5"/>
  {!discard && <path d="M40.5 33L44.5 42L54 43L47 49.5L49 59L40.5 54L32 59L34 49.5L27 43L36.5 42Z" fill="#e5f3ff" stroke="#62baff" strokeWidth="1.5" strokeLinejoin="round"/>}
  {discard && <path d="M30 38H47L42 33M47 38L42 43M50 55H33L38 50M33 55L38 60" stroke="#b6dcff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
  <path d="M29 67H52" stroke="#75bdff" strokeWidth="2" strokeLinecap="round"/>
 </svg>;
}
