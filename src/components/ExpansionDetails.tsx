import React from 'react';
import {PopupLayer} from './UI.tsx';
import './ExpansionDetails.css';

export type ExpansionDetailsKey = 'shifted' | 'champions' | 'awakening' | 'grounds';
const titles: Record<ExpansionDetailsKey,string> = {
  shifted:'Shifting Paradigm', champions:'Champions of the Monolith',
  awakening:'The Awakening', grounds:'The Treacherous Grounds',
};

export function ExpansionDetails({expansion,onClose}:{expansion:ExpansionDetailsKey;onClose:()=>void}) {
  const ref=React.useRef<HTMLDialogElement>(null);
  const closeRef=React.useRef<HTMLButtonElement>(null);
  React.useEffect(()=>{
    const dialog=ref.current;
    if(dialog&&!dialog.open)dialog.showModal();
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus({preventScroll:true});
    return()=>{document.body.style.overflow=previous;};
  },[]);
  return <PopupLayer><dialog ref={ref} className={`expansion-details expansion-details--${expansion}`} aria-label={`${titles[expansion]} details`} onCancel={e=>{e.preventDefault();onClose();}} onClose={onClose}>
    <div className="expansion-details-poster">
      <img src={`/art/expansion-details/${expansion}.webp`} alt={`${titles[expansion]}: expansion abilities and effects`} />
      <button ref={closeRef} className="expansion-details-close" aria-label="Close expansion details" onClick={onClose}/>
      <button className="expansion-details-done" aria-label="Got it" onClick={onClose}/>
    </div>
  </dialog></PopupLayer>;
}
