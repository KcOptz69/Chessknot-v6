import React from 'react';
import {Eye,X,MessageSquare} from 'lucide-react';
import {Modal,Button} from './UI.tsx';
import type {ClientMessage,GameState,RoomPlayer,RoomState} from '../types.ts';
import './ViewerTools.css';

export function ViewerTools({players,myId,roomId,game,allowArbiter,recovery,send,onChat}:{players:Record<string,RoomPlayer>;myId:string;roomId:string;game:GameState;allowArbiter?:boolean;recovery?:RoomState['arbiterRecovery'];send:(m:ClientMessage)=>void;onChat:()=>void}){
 const [open,setOpen]=React.useState(false),[recover,setRecover]=React.useState(false),[code,setCode]=React.useState(''),[card,setCard]=React.useState<Card|null>(null);
 const me=players[myId],arbiter=me?.role==='arbiter',viewers=Object.values(players).filter(p=>p.color==='spectator'&&p.connected);
 const canKick=!!me&&(me.color!=='spectator'||me.isHost);
 return <>
  <div className="viewer-tools">
   <button className="viewer-count" aria-label={`View spectators (${viewers.length})`} onClick={()=>setOpen(true)}><Eye size={15}/><span>{viewers.length}</span></button>
   {game.status==='lobby'&&me?.color==='spectator'&&<button aria-label="Open chat" onClick={onChat}><MessageSquare size={16}/></button>}
   {allowArbiter&&!arbiter&&me?.color==='spectator'&&<button onClick={()=>setRecover(true)}>Recover Arbiter</button>}
  </div>
  {open&&<Modal className="viewer-modal"><section className="viewer-dialog"><header><h2>Viewing this match</h2><button aria-label="Close dialog" onClick={()=>setOpen(false)}><X size={20}/></button></header>
   {viewers.length===0?<p>No spectators are viewing.</p>:viewers.map(p=><div className="viewer-list-row" key={p.id}><strong>{p.name}</strong><span>{p.role==='arbiter'?'Arbiter':'Spectator'}</span>{canKick&&p.id!==myId&&<Button variant="danger" onClick={()=>send({type:'kick_spectator',playerId:p.id})}>Kick</Button>}</div>)}
   {recovery&&<div className="arbiter-recovery-code"><p>Arbiter: {recovery.name}</p><p>Recovery code: <strong>{recovery.code}</strong></p><small>Share with the Arbiter to reconnect from another device.</small>{canKick&&!arbiter&&<Button variant="danger" onClick={()=>{const a=Object.values(players).find(p=>p.role==='arbiter');if(a)send({type:'kick_spectator',playerId:a.id});}}>Remove Arbiter</Button>}</div>}
  </section></Modal>}
  {recover&&<Modal className="viewer-modal"><section className="viewer-dialog"><header><h2>Recover Arbiter seat</h2><button aria-label="Close dialog" onClick={()=>setRecover(false)}><X size={20}/></button></header><form onSubmit={e=>{e.preventDefault();if(code.length===4){send({type:'recover_seat',roomId,recoveryCode:code});setRecover(false);}}}><p>Enter the four-character code given by a player or saved from your Arbiter seat.</p><input aria-label="Arbiter recovery code" value={code} maxLength={4} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,4))}/><Button type="submit" disabled={code.length!==4}>Recover seat</Button></form></section></Modal>}

 </>;
}
