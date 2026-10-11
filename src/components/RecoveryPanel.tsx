import React from 'react';
import { PopupLayer } from './UI';
import type {ClientMessage,PlayerColor,RoomState} from '../types.ts';
export function RecoveryPanel({roomId,recovery=[],myColor,send,requestCode=false,onDismiss,onLeave}:{roomId:string;recovery?:RoomState['recovery'];myColor:PlayerColor|'spectator';send:(m:ClientMessage)=>void;requestCode?:boolean;onDismiss?:()=>void;onLeave?:()=>void}){
 const [confirmLeave,setConfirmLeave]=React.useState(false);
 const [code,setCode]=React.useState('');const [now,setNow]=React.useState(Date.now());
 React.useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 return <PopupLayer><div className="ground-popup"><section className="ground-dialog recovery-dialog" role="dialog" aria-modal="true" aria-label={requestCode?'Recover your seat':'Player disconnected'}>
 <h2>{requestCode?'Rejoin your match':'Player disconnected'}</h2>
 {requestCode?<form onSubmit={e=>{e.preventDefault();if(code.length===4)send({type:'recover_seat',roomId,recoveryCode:code});}}><p>Room <strong>{roomId}</strong>. Enter the four-character recovery code provided by your opponent.</p><label htmlFor="seat-recovery-code">Recovery code</label><input id="seat-recovery-code" autoFocus value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,4))} maxLength={4} autoComplete="off" className="recovery-code-input"/><div className="placement-actions"><button type="button" onClick={onDismiss}>Cancel</button><button className="confirm-primary" type="submit" disabled={code.length!==4}>Rejoin match</button></div></form>:<>
 {recovery.map(r=><div key={r.playerId}><p><strong>{r.name}</strong> disconnected. The chess clock is paused.</p><p>{Math.max(0,Math.ceil((r.deadline-now)/1000))} seconds remaining to reconnect.</p>{r.code&&<><p>Share this recovery code with {r.name} if they rejoin from another device.</p><div className="recovery-code-display">{r.code}</div></>}{myColor!==r.color&&myColor!=='spectator'&&now>=r.deadline&&<button onClick={()=>send({type:'claim_disconnect'})}>Claim win</button>}</div>)}<p>On the same device, they can enter this room code to resume automatically: <strong>{roomId}</strong>.</p>
 </>}
 {!requestCode && onLeave && myColor!=='spectator' && recovery.some(r=>r.color!==myColor) && <div className="placement-actions">{confirmLeave?<><p>End this interrupted match and leave for a new lobby?</p><button onClick={()=>setConfirmLeave(false)}>Keep waiting</button><button onClick={onLeave}>Leave match</button></>:<button onClick={()=>setConfirmLeave(true)}>Leave match</button>}</div>}
 </section></div></PopupLayer>;
}
