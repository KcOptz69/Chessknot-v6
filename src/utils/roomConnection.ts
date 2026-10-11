type ConnectionTimer=ReturnType<typeof setTimeout>|number;
/** One socket and one retry timer per room. Gameplay requests are never replayed. */
export function createRoomConnection(options:{
 roomId:string;createSocket:()=>WebSocket;join:()=>unknown;
 onSocket:(socket:WebSocket|null)=>void;onConnected:(connected:boolean)=>void;
 onMessage:(data:string)=>void;onTerminal:(code:number)=>void;onError?:(error:unknown)=>void;
 online?:()=>boolean;now?:()=>number;random?:()=>number;
 setTimer?:(fn:()=>void,ms:number)=>ConnectionTimer;
 clearTimer?:(timer:ConnectionTimer)=>void;
}) {
 const now=options.now||Date.now,random=options.random||Math.random;
 const setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||((timer:ConnectionTimer)=>clearTimeout(timer));
 let current:WebSocket|null=null,stopped=false,terminal=false,attempt=0,lastHeard=0;
 let retry:ConnectionTimer|undefined,heartbeat:ConnectionTimer|undefined,opening:ConnectionTimer|undefined,probe:ConnectionTimer|undefined;
 const cancel=(timer:ConnectionTimer|undefined)=>{if(timer!==undefined)clearTimer(timer);};
 const detach=(socket:WebSocket)=>{socket.onopen=null;socket.onmessage=null;socket.onclose=null;socket.onerror=null;};
 const active=(socket:WebSocket)=>!stopped&&!terminal&&socket===current;
 function schedule(){if(stopped||terminal||retry!==undefined)return;const delay=Math.min(10000,750*2**Math.min(attempt++,4))+Math.floor(random()*250);retry=setTimer(()=>{retry=undefined;connect();},delay);}
 function fail(socket:WebSocket,error?:unknown){if(!active(socket))return;if(error)options.onError?.(error);cancel(opening);opening=undefined;cancel(heartbeat);heartbeat=undefined;cancel(probe);probe=undefined;detach(socket);current=null;options.onSocket(null);options.onConnected(false);try{socket.close();}catch{}schedule();}
 function beat(socket:WebSocket){
  if(!active(socket))return;
  try{socket.send(JSON.stringify({type:'ping'}));}catch(error){fail(socket,error);return;}
  // A sleeping tab may have a healthy socket. Probe it before discarding it.
  if(now()-lastHeard>45000&&probe===undefined)probe=setTimer(()=>fail(socket),15000);
  heartbeat=setTimer(()=>beat(socket),10000);
 }
 function connect(){
  if(stopped||terminal||current&&(current.readyState===0||current.readyState===1))return;
  cancel(retry);retry=undefined;
  if(options.online?.()===false){schedule();return;}
  let socket:WebSocket;try{socket=options.createSocket();}catch(error){options.onError?.(error);schedule();return;}
  current=socket;options.onSocket(socket);options.onConnected(false);
  opening=setTimer(()=>fail(socket,new Error('Connection timed out.')),15000);
  socket.onopen=()=>{if(!active(socket))return;cancel(opening);opening=undefined;lastHeard=now();try{socket.send(JSON.stringify(options.join()));}catch(error){fail(socket,error);return;}heartbeat=setTimer(()=>beat(socket),10000);};
  socket.onmessage=event=>{if(!active(socket))return;lastHeard=now();cancel(probe);probe=undefined;const data=String(event.data);try{const msg=JSON.parse(data);if(msg.type==='room_state'&&msg.state?.roomId===options.roomId){attempt=0;options.onConnected(true);}if(msg.type==='pong')return;}catch{}options.onMessage(data);};
  socket.onerror=error=>fail(socket,error);
  socket.onclose=event=>{if(!active(socket))return;if(event.code===4000||event.code===4001){terminal=true;cancel(probe);probe=undefined;cancel(retry);retry=undefined;cancel(heartbeat);heartbeat=undefined;cancel(opening);opening=undefined;current=null;options.onSocket(null);options.onConnected(false);options.onTerminal(event.code);return;}fail(socket);};
 }
 return {
  start:connect,
  wake(){if(stopped||terminal)return;if(current?.readyState===1){cancel(heartbeat);heartbeat=undefined;beat(current);return;}connect();},
  send(message:unknown){const socket=current;if(!socket||socket.readyState!==1||stopped||terminal)return false;try{socket.send(JSON.stringify(message));return true;}catch(error){fail(socket,error);return false;}},
  stop(){stopped=true;cancel(retry);cancel(heartbeat);cancel(opening);cancel(probe);if(current){detach(current);try{current.close();}catch{}}current=null;options.onSocket(null);},
 };
}
