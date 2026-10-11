import {viewingGameState,isArbiter} from './src/utils/roomViewing.ts';
import { randomBytes } from 'node:crypto';
import { activeCircle, isTemporary, eligibleRevives, emptySummonSquare, soulTargets, placeRevived, kingSafe, interruptCircles, tickSummons, summonNotice, removeSoul } from './src/utils/summoning.ts';
import { portalTravelTarget, captureProtected, removeGroundPiece, groundMoves, groundPiece, groundImmune, groundProtected, landGround, finishGroundTurn, relocateDebuffs, groundEvent, points } from './src/utils/grounds.ts';
import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type {
  Card,
  ChatMessage,
  ClientMessage,
  GameLogEntry,
  GameState,
  PlayerColor,
  RoomPlayer,
  RoomState,
  ServerMessage,
  StandardPieceType,
  GameExpansionsConfig,
  AwakenedRookState,
  AwakeningAlertState,
  ChampionPiece,
} from './src/types.ts';
import {
  createInitialGameState,
  createSafeChess,
  drawCard as drawRawCard,
  evaluateGameEnd,
  isSquareBlocked,
  getPushMoves,
  isCardPermittedForPiece,
  calculatePiecePoints,
  syncFenTurn,
  ensureEdgePawnsPromoted,
  createBoardWithMonolith,
  isKingChecked,
  getSurroundingSquares,
  getChampionDeploySquares,
  getChampionNormalMoves,
  getBerserkerUltimateMoves,
  getMusketeerSnipeTargets,
  getSummonerPlacementSquares,
  getNinjaAdjacentEnemyPieces,
  getClockBlockReason,
  getCapturedPieces,
  isCastlingBlockedByRestrictedSquares,
  updateBeaconPieceSquare,
  swapBeaconPieceSquares,
  getLegalMovesForPiece,
  getQueenMovesForKing,
  getPieceCapturePoints,
  awardCaptureRefresh as applyCaptureRefresh,
} from './src/utils/chessLogic.ts';

import { capturedInAction } from './src/utils/captureLedger.ts';

import { prepareKnightSecondMove } from './src/utils/knightMove.ts';

// Record reshuffles centrally so every draw path gives both players one notice.
function drawCard(state:GameState) {
 const result=drawRawCard(state);
 if(result.reshuffled)state.historyLog.unshift({
  id:`deck_refresh_${Date.now()}_${Math.random()}`,turn:state.turn,turnNumber:state.turnNumber,
  actionType:'deck_refresh',detail:'The draw pile ran out. Discarded cards were shuffled into a fresh deck. Exhausted cards remain excluded.',
  timestamp:Date.now(),whitePoints:state.whitePoints,blackPoints:state.blackPoints,
 });
 return result;
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// In-memory room store
const rooms = new Map<string, RoomState>();
const chatLastSent = new Map<string, number>();
const socketMeta = new Map<WebSocket, { roomId: string; playerId: string }>();
const socketAlive=new WeakMap<WebSocket,number>();
setInterval(()=>{for(const ws of wss.clients){if(Date.now()-(socketAlive.get(ws)||0)>30000)ws.terminate();else if(ws.readyState===WebSocket.OPEN)ws.ping();}},10000).unref?.();

// Credentials remain server-private; room broadcasts never contain resume tokens.
const seatCredentials=new Map<string,{token:string;code:string}>();
const viewerBans=new Map<string,Set<string>>();
const viewingDismissals=new Map<string,Record<string,string>>();
const disconnects=new Map<string,{deadline:number}>();
const seatKey=(roomId:string,playerId:string)=>roomId+':'+playerId;
function recoveryCode(roomId:string){let code:string;do{code=randomBytes(2).toString('hex').toUpperCase();}while([...seatCredentials].some(([key,value])=>key.startsWith(roomId+':')&&value.code===code));return code;}
function credentials(room:RoomState,id:string){const key=seatKey(room.roomId,id);let saved=seatCredentials.get(key);if(!saved){saved={token:randomBytes(24).toString('hex'),code:recoveryCode(room.roomId)};seatCredentials.set(key,saved);}return saved;}
function releaseLobbySeat(room:RoomState,id:string){
 delete room.players[id];viewingDismissals.delete(seatKey(room.roomId,id));seatCredentials.delete(seatKey(room.roomId,id));disconnects.delete(seatKey(room.roomId,id));
 if(room.lobbyConfig.hostId===id)room.lobbyConfig.hostId=Object.keys(room.players).find(key=>room.players[key].connected&&room.players[key].color!=='spectator')||'';
 for(const player of Object.values(room.players)){player.isHost=player.id===room.lobbyConfig.hostId;if(player.isHost)player.isReady=false;}
}
function roomIsPaused(room:RoomState){return room.arbiterClockPaused || room.mode==='online'&&room.gameState.status==='playing'&&Object.values(room.players).some(p=>p.color!=='spectator'&&!p.connected);}
function releaseArbiterPause(room:RoomState){if(!room.arbiterClockPaused)return;room.arbiterClockPaused=false;if(!roomIsPaused(room)&&!room.gameState.pendingSummon&&room.gameState.status==='playing'&&room.gameState.clock.enabled){room.gameState.clock.isRunning=true;room.gameState.clock.lastTick=Date.now();}}
function recoveryView(room:RoomState,viewerId:string){return Object.values(room.players).filter(p=>p.color!=='spectator'&&!p.connected&&room.gameState.status==='playing').map(p=>({playerId:p.id,name:p.name,color:p.color as PlayerColor,deadline:disconnects.get(seatKey(room.roomId,p.id))?.deadline||Date.now()+300000,...(room.players[viewerId]?.color!=='spectator'&&viewerId!==p.id?{code:credentials(room,p.id).code}:{})}));}
function reconnectSeat(room:RoomState,id:string,ws:WebSocket){
 if(room.players[id].color!=='spectator'&&room.gameState.clock.isRunning)pauseGameClock(room.gameState);
 for(const old of wss.clients){const meta=socketMeta.get(old);if(old!==ws&&meta?.roomId===room.roomId&&meta.playerId===id){socketMeta.delete(old);old.close(4000,'Seat resumed elsewhere');}}
 socketMeta.set(ws,{roomId:room.roomId,playerId:id});room.players[id].connected=true;disconnects.delete(seatKey(room.roomId,id));
 const saved=credentials(room,id);sendToSocket(ws,{type:'session_credentials',roomId:room.roomId,playerId:id,resumeToken:saved.token});
 if(room.players[id].color!=='spectator'&&!roomIsPaused(room)&&!room.gameState.pendingSummon&&room.gameState.clock.enabled&&room.gameState.status==='playing'){room.gameState.clock.isRunning=true;room.gameState.clock.lastTick=Date.now();}
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getOrCreateRoom(roomId: string, mode?: 'online' | 'pass_and_play', hostId?: string): RoomState {
  const cleanId = roomId.trim().toUpperCase();
  let room = rooms.get(cleanId);
  if (!room) {
    room = {
      roomId: cleanId,
      players: {},
      gameState: createInitialGameState(),
      createdAt: Date.now(),
      mode: 'online',
      chatMessages: [],
      lobbyConfig: {
        hostId: hostId || '',
        colorPreference: 'w',
        clockEnabled: false,
        initialMinutes: 5,
        incrementSeconds: 0,
        gameStarted: false,
        expansions: {
          shiftedParadigm: true,
          championsOfTheMonolith: true,
          theAwakening: true,
        },
      },
    };
    rooms.set(cleanId, room);
  } else {
    room.mode = 'online';
    if (!room.lobbyConfig) {
      room.lobbyConfig = {
        hostId: hostId || Object.keys(room.players)[0] || '',
        colorPreference: 'w',
        clockEnabled: false,
        initialMinutes: 5,
        incrementSeconds: 0,
        gameStarted: room.gameState.status === 'playing',
        expansions: {
          shiftedParadigm: true,
          championsOfTheMonolith: true,
          theAwakening: true,
        },
      };
    } else if (!room.lobbyConfig.expansions) {
      room.lobbyConfig.expansions = {
        shiftedParadigm: true,
        championsOfTheMonolith: true,
        theAwakening: true,
      };
    }
    if (!room.chatMessages) {
      room.chatMessages = [];
    }
  }
  return room;
}

function broadcastRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      const meta = socketMeta.get(ws);
      if (meta && meta.roomId === roomId) {
        const player = room.players[meta.playerId];
        const yourColor = player ? player.color : 'spectator';
        if(room.mode==='online'&&(yourColor!=='spectator'||isArbiter(player))&&!seatCredentials.has(seatKey(room.roomId,meta.playerId))){const saved=credentials(room,meta.playerId);sendToSocket(ws,{type:'session_credentials',roomId:room.roomId,playerId:meta.playerId,resumeToken:saved.token});}
        const msg: ServerMessage = {
          type: 'room_state',
          state: { ...room, arbiterRecovery: (yourColor!=='spectator'||isArbiter(player))?(()=>{const a=Object.values(room.players).find(isArbiter);return a?{name:a.name,code:credentials(room,a.id).code}:undefined;})():undefined, recovery:recoveryView(room,meta.playerId), gameState: viewingGameState(room.gameState,player,viewingDismissals.get(seatKey(roomId,meta.playerId))) },
          yourColor,
        };
        ws.send(JSON.stringify(msg));
      }
    }
  });
}

function sendToSocket(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// REST endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({room:{...room,arbiterRecovery:undefined,recovery:undefined,gameState:viewingGameState(room.gameState,undefined)}});
});

app.post('/api/rooms', (req, res) => {
  const roomId = req.body.roomId ? req.body.roomId.toUpperCase() : generateRoomId();
  const mode = 'online' as const;
  const room = getOrCreateRoom(roomId, mode);
  res.json({ roomId: room.roomId });
});

// WebSocket message handling
wss.on('connection', (ws: WebSocket) => {
  socketAlive.set(ws,Date.now());ws.on('pong',()=>socketAlive.set(ws,Date.now()));
  ws.on('message', (data: string) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        sendToSocket(ws, { type: 'pong' });
        return;
      }

      if(msg.type==='exit_to_new_lobby'){
        const meta=socketMeta.get(ws),old=meta&&rooms.get(meta.roomId),player=meta&&old?.players[meta.playerId];
        if(!meta||!old||!player||old.gameState.status!=='lobby'||old.lobbyConfig.hostId===player.id||(player.color==='spectator'&&!isArbiter(player))){sendToSocket(ws,{type:'error',message:'Only Player 2 can exit the pre-match lobby this way.'});return;}
        let code=generateRoomId();while(rooms.has(code))code=generateRoomId();
        releaseLobbySeat(old,player.id);broadcastRoom(old.roomId);
        const fresh=getOrCreateRoom(code,'online',player.id);
        fresh.players[player.id]={...player,color:'w',isHost:true,isReady:false,connected:true};
        socketMeta.set(ws,{roomId:code,playerId:player.id});const saved=credentials(fresh,player.id);
        sendToSocket(ws,{type:'session_credentials',roomId:code,playerId:player.id,resumeToken:saved.token});
        sendToSocket(ws,{type:'room_code_changed',roomId:code});broadcastRoom(code);return;
      }
      if(msg.type==='leave_lobby'){
        const meta=socketMeta.get(ws),room=meta&&rooms.get(meta.roomId);
        if(room&&meta&&room.gameState.status==='lobby'){
          releaseLobbySeat(room,meta.playerId);socketMeta.delete(ws);
          broadcastRoom(room.roomId);
        }return;
      }
      if(msg.type==='regenerate_room_code'){
        const meta=socketMeta.get(ws),room=meta&&rooms.get(meta.roomId);
        if(!room||room.lobbyConfig.hostId!==meta!.playerId||room.gameState.status!=='lobby'){sendToSocket(ws,{type:'error',message:'Only the host can change the room code before a match.'});return;}
        const oldId=room.roomId;let newId=generateRoomId();while(rooms.has(newId))newId=generateRoomId();
        rooms.delete(oldId);viewerBans.delete(oldId);room.roomId=newId;rooms.set(newId,room);
        for(const player of Object.values(room.players)){
          const oldKey=seatKey(oldId,player.id);const saved=seatCredentials.get(oldKey);
          seatCredentials.delete(oldKey);disconnects.delete(oldKey);
          if(player.id===meta!.playerId){if(saved)seatCredentials.set(seatKey(newId,player.id),saved);player.isReady=false;}
          else delete room.players[player.id];
        }
        for(const client of wss.clients){const cm=socketMeta.get(client);if(cm?.roomId===oldId){
          if(cm.playerId!==meta!.playerId){socketMeta.delete(client);client.close(4001,'Host generated a new room code');}
          else{cm.roomId=newId;const saved=credentials(room,cm.playerId);sendToSocket(client,{type:'session_credentials',roomId:newId,playerId:cm.playerId,resumeToken:saved.token});}
        }}
        sendToSocket(ws,{type:'room_code_changed',roomId:newId});broadcastRoom(newId);return;
      }
      if(msg.type==='recover_seat'){
        const room=rooms.get(String(msg.roomId||'').trim().toUpperCase());
        const id=room&&Object.keys(room.players).find(id=>(room.players[id].color!=='spectator'||isArbiter(room.players[id]))&&credentials(room,id).code===String(msg.recoveryCode||'').trim().toUpperCase());
        if(!room||!id){sendToSocket(ws,{type:'error',message:'Invalid room or recovery code.'});return;}
        if(room.players[id].connected){sendToSocket(ws,{type:'error',message:'That player is already connected.'});return;}
        const previous=socketMeta.get(ws);if(previous&&previous.roomId===room.roomId&&room.players[previous.playerId]?.color==='spectator'&&!isArbiter(room.players[previous.playerId]))delete room.players[previous.playerId];
        reconnectSeat(room,id,ws);broadcastRoom(room.roomId);return;
      }
      if (msg.type === 'join_room' || msg.type === 'create_room') {
        const roomId = (msg.roomId || generateRoomId()).trim().toUpperCase();
        const previous=socketMeta.get(ws),old=previous&&rooms.get(previous.roomId);
        if(previous&&old&&previous.roomId!==roomId&&(old.gameState.status==='lobby'||old.players[previous.playerId]?.color==='spectator')){
          if(isArbiter(old.players[previous.playerId]))releaseArbiterPause(old);
          releaseLobbySeat(old,previous.playerId);
          broadcastRoom(previous.roomId);
        }
        const mode = 'online' as const;
        // Kicks terminate the current viewing session; they do not permanently ban future joins.
        const room = getOrCreateRoom(roomId, mode, msg.playerId);

        const known=room.players[msg.playerId];
        if(room.mode==='online'&&known&&(known.color!=='spectator'||isArbiter(known))&&msg.type==='join_room'&&msg.resumeToken!==credentials(room,msg.playerId).token&&!(socketMeta.get(ws)?.roomId===roomId&&socketMeta.get(ws)?.playerId===msg.playerId)){sendToSocket(ws,{type:'recovery_required',roomId});return;}
        if(room.mode==='online'&&known&&(known.color!=='spectator'||isArbiter(known))){
          reconnectSeat(room,msg.playerId,ws);broadcastRoom(roomId);return;
        }
        socketMeta.set(ws, { roomId, playerId: msg.playerId });

        // If no host recorded, set this player as host
        if (!room.lobbyConfig.hostId) {
          room.lobbyConfig.hostId = msg.playerId;
        }

        const isHost = room.lobbyConfig.hostId === msg.playerId;

        // Assign player color
        let assignedColor: PlayerColor | 'spectator' = 'spectator';

        if (room.mode === 'pass_and_play') {
          assignedColor = 'w';
          room.players[msg.playerId] = {
            id: msg.playerId,
            name: msg.playerName || 'Commander (Pass & Play)',
            color: 'w',
            connected: true,
            isHost: true,
          };
        } else {
          const existingPlayer = room.players[msg.playerId];
          if (existingPlayer) {
            existingPlayer.connected = true;
            existingPlayer.name = msg.playerName || existingPlayer.name;
            existingPlayer.isHost = isHost;
            assignedColor = existingPlayer.color;
          } else {
            // Count non-spectator players
            const nonSpectators = Object.values(room.players).filter((p) => p.color !== 'spectator');

            if (room.gameState.status!=='lobby') {assignedColor='spectator';} else if (nonSpectators.length === 0) {
              // First player (Host)
              const pref = room.lobbyConfig.colorPreference;
              assignedColor = pref === 'b' ? 'b' : 'w';
            } else if (nonSpectators.length === 1) {
              // Second player (Opponent)
              const otherColor = nonSpectators[0].color;
              assignedColor = otherColor === 'w' ? 'b' : 'w';
            } else {
              assignedColor = 'spectator';
            }

            room.players[msg.playerId] = {
              id: msg.playerId,
              name: msg.playerName || `Commander ${Object.keys(room.players).length + 1}`,
              color: assignedColor,
              connected: true,
              isHost,
              isReady: false,
            };
          }
        }

        if(room.mode==='online'&&assignedColor!=='spectator')reconnectSeat(room,msg.playerId,ws);
        broadcastRoom(roomId);
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) {
        sendToSocket(ws, { type: 'error', message: 'Not connected to a room' });
        return;
      }

      const room = rooms.get(meta.roomId);
      if (!room) {
        sendToSocket(ws, { type: 'error', message: 'Room not found' });
        return;
      }

      const viewer=room.players[meta.playerId];
      if(msg.type==='quit_viewing'||msg.type==='kick_spectator'){
        const targetId=msg.type==='quit_viewing'?meta.playerId:msg.playerId;
        const target=room.players[targetId];
        if(!target||target.color!=='spectator'||(msg.type==='kick_spectator'&&(!viewer||(viewer.color==='spectator'&&room.lobbyConfig.hostId!==viewer.id)))){sendToSocket(ws,{type:'error',message:'Only players can remove a viewer.'});return;}
        // A kicked viewer may explicitly rejoin later with a new session.
        if(isArbiter(target))releaseArbiterPause(room);
        releaseLobbySeat(room,targetId);
        for(const client of wss.clients){const cm=socketMeta.get(client);if(cm?.roomId===room.roomId&&cm.playerId===targetId){
          let code=generateRoomId();while(rooms.has(code))code=generateRoomId();const fresh=getOrCreateRoom(code,'online',targetId);
          fresh.players[targetId]={id:targetId,name:target.name,color:'w',connected:true,isHost:true,isReady:false};socketMeta.set(client,{roomId:code,playerId:targetId});
          const saved=credentials(fresh,targetId);sendToSocket(client,{type:'session_credentials',roomId:code,playerId:targetId,resumeToken:saved.token});sendToSocket(client,{type:'room_code_changed',roomId:code});broadcastRoom(code);
        }}broadcastRoom(room.roomId);return;
      }
      if(msg.type==='return_as_player'){
        if(room.gameState.status!=='lobby'||!isArbiter(viewer)){sendToSocket(ws,{type:'error',message:'Only the pre-match Arbiter can return as a player.'});return;}
        const seats=Object.values(room.players).filter(p=>p.color!=='spectator'&&p.id!==viewer.id);
        if(seats.length>=2){sendToSocket(ws,{type:'error',message:'Both player seats are occupied.'});return;}
        const requestedColor=msg.color;
        if(requestedColor!==undefined&&requestedColor!=='w'&&requestedColor!=='b'){sendToSocket(ws,{type:'error',message:'Invalid player seat.'});return;}
        const availableColors=(['w','b'] as const).filter(color=>!seats.some(p=>p.color===color));
        const chosenColor=requestedColor??availableColors[0];
        if(!chosenColor||!availableColors.includes(chosenColor)){sendToSocket(ws,{type:'error',message:'That player seat is occupied.'});return;}
        viewer.role=undefined;viewer.color=chosenColor;viewer.isReady=false;
        if(!room.lobbyConfig.hostId){room.lobbyConfig.hostId=viewer.id;viewer.isHost=true;}
        reconnectSeat(room,viewer.id,ws);broadcastRoom(room.roomId);return;
      }
      if(msg.type==='claim_arbiter'){
        if(room.gameState.status!=='lobby'||!room.lobbyConfig.allowArbiter||!viewer||Object.values(room.players).some(isArbiter)){sendToSocket(ws,{type:'error',message:'The Arbiter seat is available only before the match when enabled.'});return;}
        viewer.color='spectator';viewer.role='arbiter';viewer.isReady=false;reconnectSeat(room,viewer.id,ws);broadcastRoom(room.roomId);return;
      }
      if(msg.type==='arbiter_pause'){
        if(!isArbiter(viewer)||!viewer?.connected||room.gameState.status!=='playing'||!room.gameState.clock.enabled||typeof msg.paused!=='boolean'){sendToSocket(ws,{type:'error',message:'Only the Arbiter can pause or resume an active chess clock.'});return;}
        if(msg.paused&&!room.arbiterClockPaused){pauseGameClock(room.gameState);room.arbiterClockPaused=true;}
        else if(!msg.paused)releaseArbiterPause(room);
        broadcastRoom(room.roomId);return;
      }
      const dismissField=({dismiss_clock_alert:'clockAlert',dismiss_pass_redraw_alert:'passRedrawAlert',dismiss_awakening_alert:'awakeningAlert'} as Record<string,string>)[msg.type];
      if(dismissField&&viewer){const key=seatKey(room.roomId,viewer.id);const saved=viewingDismissals.get(key)||{};saved[dismissField]=JSON.stringify((room.gameState as any)[dismissField]);viewingDismissals.set(key,saved);broadcastRoom(room.roomId);return;}
      if(msg.type==='claim_disconnect'){
        const actor=room.players[meta.playerId];const other=Object.values(room.players).find(p=>p.color!=='spectator'&&p.id!==meta.playerId&&!p.connected);
        if(room.gameState.status==='playing'&&actor?.color!=='spectator'&&other&&Date.now()>=(disconnects.get(seatKey(room.roomId,other.id))?.deadline||Infinity)){
          room.gameState.status='timeout';room.gameState.winner=actor.color as PlayerColor;room.gameState.winReason='Opponent did not reconnect within five minutes.';pauseGameClock(room.gameState);broadcastRoom(room.roomId);
        }return;
      }
      if(roomIsPaused(room)&&!['send_chat','rename_player','resign'].includes(msg.type)){sendToSocket(ws,{type:'error',message:room.arbiterClockPaused?'The Arbiter paused the match. Wait for Resume.':'Match paused while a player reconnects.'});return;}
      // Handle Player Ready Toggle
      if (msg.type === 'set_player_ready') {
        const player = room.players[meta.playerId];
        if (player && player.color!=='spectator') {
          player.isReady = Boolean(msg.isReady);
          broadcastRoom(meta.roomId);
        }
        return;
      }

      // Handle Player Rename
      if (msg.type === 'rename_player') {
        const cleanName = (msg.playerName || '').trim().slice(0, 24);
        if (cleanName) {
          const targetId = msg.playerId || meta.playerId;
          if (room.players[targetId] && (targetId===meta.playerId||room.lobbyConfig.hostId===meta.playerId)) {
            room.players[targetId].name = cleanName;
          }
          broadcastRoom(meta.roomId);
        }
        return;
      }

      // Handle Send Chat
      if (msg.type === 'send_chat') {
        if (room.mode === 'pass_and_play') {
          return;
        }
        if (typeof msg.text !== 'string') return;
        const text = msg.text.trim();
        const rateKey = `${meta.roomId}:${meta.playerId}`;
        if (Date.now() - (chatLastSent.get(rateKey) || 0) < 750) {
          sendToSocket(ws, {type:'error', message:'Please wait a moment before sending another message.'}); return;
        }
        if (!text) return;
        chatLastSent.set(rateKey, Date.now());
        const player = room.players[meta.playerId];
        const chatMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          senderId: meta.playerId,
          senderName: player?.name || 'Commander',
          senderColor: player?.color || 'spectator',
          text: text.slice(0, 500),
          timestamp: Date.now(),
        };
        if (!room.chatMessages) {
          room.chatMessages = [];
        }
        room.chatMessages.push(chatMsg);
        if (room.chatMessages.length > 200) {
          room.chatMessages = room.chatMessages.slice(-200);
        }
        broadcastRoom(meta.roomId);
        return;
      }

      // Handle Switch Mode request (Host Only)
      if (msg.type === 'set_room_mode') {
        if(msg.mode!=='online'){sendToSocket(ws,{type:'error',message:'ChessKnot now supports online matches only.'});return;}
        const hostId = room.lobbyConfig.hostId || Object.keys(room.players)[0];
        const isHost = room.mode === 'pass_and_play' || meta.playerId === hostId;
        if (!isHost) {
          sendToSocket(ws, { type: 'error', message: 'Only the room host can change game mode' });
          return;
        }
        room.mode = msg.mode;
        broadcastRoom(meta.roomId);
        return;
      }

      // Handle Update Lobby Configuration (Host Only for sides, clock, expansions)
      if (msg.type === 'update_lobby_config') {
        if(msg.mode&&msg.mode!=='online'){sendToSocket(ws,{type:'error',message:'ChessKnot now supports online matches only.'});return;}
        const hostId = room.lobbyConfig.hostId || Object.keys(room.players)[0];
        const isHost = room.mode === 'pass_and_play' || meta.playerId === hostId;

        if (!isHost || room.gameState.status !== 'lobby') {
          sendToSocket(ws, {type:'error',message:'Only the host can update configuration in the lobby.'}); return;
        }
        if(msg.allowArbiter!==undefined){if(typeof msg.allowArbiter!=='boolean'){sendToSocket(ws,{type:'error',message:'Invalid Arbiter setting.'});return;}if(!msg.allowArbiter){for(const p of Object.values(room.players)){if(isArbiter(p)){p.role=undefined;p.isReady=false;}}}room.lobbyConfig.allowArbiter=msg.allowArbiter;}
        if (msg.colorPreference) {
          room.lobbyConfig.colorPreference = msg.colorPreference;
        }
        if (msg.clockEnabled !== undefined) {
          room.lobbyConfig.clockEnabled = msg.clockEnabled;
        }
        if (msg.initialMinutes !== undefined) {
          room.lobbyConfig.initialMinutes = msg.initialMinutes;
        }
        if (msg.incrementSeconds !== undefined) {
          room.lobbyConfig.incrementSeconds = msg.incrementSeconds;
        }
        if (msg.mode && isHost) {
          room.mode = msg.mode;
        }
        if (msg.expansions) {
          room.lobbyConfig.expansions = {
            ...room.lobbyConfig.expansions,
            ...msg.expansions,
          };
        }

        // Spectators and the Arbiter never acquire a playing color through configuration.
        const seated=Object.values(room.players).filter(p=>p.color!=='spectator');
        const first=seated.find(p=>p.id===room.lobbyConfig.hostId)||seated[0];const second=seated.find(p=>p.id!==first?.id);
        if(first)first.color=room.lobbyConfig.colorPreference==='b'?'b':'w';if(second)second.color=first!.color==='w'?'b':'w';

        broadcastRoom(meta.roomId);
        return;
      }

      // Handle Start Game from Lobby (Host Only)
      if (msg.type === 'start_game') {
        const hostId = room.lobbyConfig.hostId || Object.keys(room.players)[0];
        const isHost = room.mode === 'pass_and_play' || meta.playerId === hostId;

        if (!isHost) {
          sendToSocket(ws, { type: 'error', message: 'Only the room host can start the match' });
          return;
        }

        const playerIds = Object.keys(room.players).filter(id=>room.players[id].color!=='spectator'&&room.players[id].connected);
        const firstPlayerId=playerIds.includes(hostId)?hostId:playerIds[0];
        const opponentId = playerIds.find(id=>id!==firstPlayerId);

        if (room.mode === 'online') {
          if(playerIds.length!==2||!opponentId){sendToSocket(ws,{type:'error',message:'Waiting for Player 2 to join.'});return;}
          if (playerIds.some(id=>id!==hostId&&!room.players[id]?.isReady)) {
            sendToSocket(ws, { type: 'error', message: 'Waiting for Player 2 to be ready before starting match' });
            return;
          }
        }
        const pref = msg.colorPreference || room.lobbyConfig.colorPreference || 'w';
        const clockCfg = msg.clockConfig || {
          enabled: room.lobbyConfig.clockEnabled,
          initialMinutes: room.lobbyConfig.initialMinutes,
          incrementSeconds: room.lobbyConfig.incrementSeconds,
        };
        const expansions: GameExpansionsConfig = msg.expansions || room.lobbyConfig.expansions || {
          shiftedParadigm: true,
          championsOfTheMonolith: true,
          theAwakening: true,
        };

        // Create fresh starting game state with configured expansions
        const freshState = createInitialGameState(expansions);
        room.gameState = freshState;room.arbiterClockPaused=false;

        // Configure clock
        freshState.clock = {
          enabled: clockCfg.enabled,
          initialMinutes: clockCfg.initialMinutes,
          incrementSeconds: clockCfg.incrementSeconds,
          w: Math.round(clockCfg.initialMinutes * 60),
          b: Math.round(clockCfg.initialMinutes * 60),
          lastTick: clockCfg.enabled ? Date.now() : null,
          isRunning: Boolean(clockCfg.enabled),
        };

        // Resolve Color Selection:
        let hostColor: PlayerColor = 'w';
        if (pref === 'random') {
          hostColor = Math.random() < 0.5 ? 'w' : 'b';
        } else {
          hostColor = pref;
        }
        const opponentColor: PlayerColor = hostColor === 'w' ? 'b' : 'w';

        if (room.players[firstPlayerId]) {
          room.players[firstPlayerId].color = hostColor;
        }
        if (opponentId && room.players[opponentId]) {
          room.players[opponentId].color = opponentColor;
        }

        // Set status to playing and start clock
        freshState.status = 'playing';
        room.lobbyConfig.gameStarted = true;
        room.lobbyConfig.colorPreference = pref;
        room.lobbyConfig.clockEnabled = clockCfg.enabled;
        room.lobbyConfig.initialMinutes = clockCfg.initialMinutes;
        room.lobbyConfig.incrementSeconds = clockCfg.incrementSeconds;
        room.lobbyConfig.expansions = expansions;

        const clockDesc = clockCfg.enabled
          ? `${clockCfg.initialMinutes}m + ${clockCfg.incrementSeconds}s`
          : 'No Clock';
        const hostName = room.players[firstPlayerId]?.name || 'Player 1';
        const oppName = opponentId && room.players[opponentId] ? room.players[opponentId].name : 'Opponent';
        const activeExpNames = [
          expansions.shiftedParadigm !== false ? 'Shifted Paradigm' : null,
          expansions.championsOfTheMonolith !== false ? 'Champions of the Monolith' : null,
          expansions.theAwakening !== false ? 'The Awakening' : null,
        ].filter(Boolean);
        const expansionTag = activeExpNames.length > 0 ? ` [${activeExpNames.join(', ')}]` : ' [Base Game]';

        freshState.historyLog = [
          {
            id: `start_${Date.now()}`,
            turn: 'w',
            turnNumber: 1,
            actionType: 'pass',
            detail: `Match started! ${hostName} (${hostColor.toUpperCase()}) vs ${oppName} (${opponentColor.toUpperCase()}) [${clockDesc}]${expansionTag}. White opens.`,
            timestamp: Date.now(),
            whitePoints: freshState.whitePoints,
            blackPoints: freshState.blackPoints,
          },
        ];

        broadcastRoom(meta.roomId);
        return;
      }

      // Handle Return to Lobby
      if (msg.type === 'return_to_lobby') {
        if(room.players[meta.playerId]?.color==='spectator'){sendToSocket(ws,{type:'error',message:'Use Quit viewing to leave without resetting the players match.'});return;}
        room.arbiterClockPaused=false;viewerBans.delete(room.roomId);
        delete room.rematchRequest;
        const expansions: GameExpansionsConfig = room.lobbyConfig.expansions || {
          shiftedParadigm: true,
          championsOfTheMonolith: true,
          theAwakening: true,
        };
        room.gameState = createInitialGameState(expansions);
        room.gameState.status = 'lobby';
        room.lobbyConfig.gameStarted = false;
        Object.values(room.players).forEach((p) => {
          p.isReady = false;
        });
        broadcastRoom(meta.roomId);
        return;
      }

      // Rematches require consent from the other seated player, independent of whose turn ended.
      if (msg.type === 'restart_game' || msg.type === 'respond_rematch') {
        const actor = room.players[meta.playerId];
        if (!actor || actor.color === 'spectator' || !actor.connected || ['lobby','waiting','playing'].includes(room.gameState.status)) {
          sendToSocket(ws,{type:'error',message:'Rematches are available to seated players after the match ends.'}); return;
        }
        const opponent = Object.values(room.players).find(p=>p.id!==actor.id && p.color!=='spectator');
        if (room.mode==='online' && (!opponent || !opponent.connected)) {
          sendToSocket(ws,{type:'error',message:'Your opponent must be connected for a rematch.'}); return;
        }
        if (msg.type==='restart_game' && room.mode==='online') {
          if (room.rematchRequest) return;
          room.rematchRequest={requesterId:actor.id,opponentId:opponent!.id,id:randomBytes(8).toString('hex')};
          broadcastRoom(meta.roomId); return;
        }
        if (msg.type==='respond_rematch') {
          const request=room.rematchRequest;
          if (!request || request.opponentId!==actor.id || request.id!==msg.requestId || typeof msg.accept!=='boolean') {
            sendToSocket(ws,{type:'error',message:'This rematch request is no longer available.'}); return;
          }
          if (!msg.accept) {delete room.rematchRequest;broadcastRoom(meta.roomId);return;}
        }
        const cfg=room.lobbyConfig;
        const fresh=createInitialGameState(cfg.expansions || room.gameState.expansions);
        fresh.status='playing';
        fresh.clock={enabled:cfg.clockEnabled,initialMinutes:cfg.initialMinutes,incrementSeconds:cfg.incrementSeconds,
          w:Math.round(cfg.initialMinutes*60),b:Math.round(cfg.initialMinutes*60),lastTick:cfg.clockEnabled?Date.now():null,isRunning:cfg.clockEnabled};
        room.gameState=fresh;room.arbiterClockPaused=false;viewerBans.delete(room.roomId);cfg.gameStarted=true;delete room.rematchRequest;
        broadcastRoom(meta.roomId);return;
      }

      const player = room.players[meta.playerId];
      const state = room.gameState;

      // Gameplay authorization is server-authoritative. Spectators may observe but never act.
      let actorColor: PlayerColor;
      if (room.mode === 'online') {
        if (!player || player.color === 'spectator') {
          sendToSocket(ws, { type: 'error', message: 'Spectators cannot perform gameplay actions.' });
          return;
        }
        const isNotificationDismiss =
          msg.type === 'dismiss_clock_alert' ||
          msg.type === 'dismiss_pass_redraw_alert' ||
          msg.type === 'dismiss_awakening_alert';

        if (player.color !== state.turn && msg.type !== 'resign' && !isNotificationDismiss) {
          sendToSocket(ws, { type: 'error', message: "It is not your turn!" });
          return;
        }
        actorColor = player.color;
      } else {
        // Pass & Play intentionally uses the authoritative turn, not the socket's lobby color.
        actorColor = state.turn;
      }

      // Handle Game Actions
      handleGameAction(room, msg, actorColor, ws);
      if(room.gameState.status!=='playing')room.arbiterClockPaused=false;
      broadcastRoom(meta.roomId);
    } catch (err: any) {
      console.error('WebSocket error:', err);
      sendToSocket(ws, { type: 'error', message: err?.message || 'Server error' });
    }
  });

  ws.on('close', () => {
    const meta = socketMeta.get(ws);
    if (meta) {
      const room = rooms.get(meta.roomId);
      if (room && room.players[meta.playerId]) {
        const stillConnected=[...wss.clients].some(other=>other!==ws&&other.readyState===WebSocket.OPEN&&socketMeta.get(other)?.roomId===meta.roomId&&socketMeta.get(other)?.playerId===meta.playerId);
        if(stillConnected)return;
        if(isArbiter(room.players[meta.playerId]))releaseArbiterPause(room);
        if(room.gameState.status==='lobby'&&!isArbiter(room.players[meta.playerId])){releaseLobbySeat(room,meta.playerId);broadcastRoom(meta.roomId);socketMeta.delete(ws);return;}
        if(room.players[meta.playerId].color==='spectator'&&!isArbiter(room.players[meta.playerId])){releaseLobbySeat(room,meta.playerId);broadcastRoom(meta.roomId);socketMeta.delete(ws);return;}
        room.players[meta.playerId].connected = false;
        if(room.mode==='online'&&room.gameState.status==='playing'&&room.players[meta.playerId].color!=='spectator'){
          disconnects.set(seatKey(room.roomId,meta.playerId),{deadline:Date.now()+300000});pauseGameClock(room.gameState);
        }
        broadcastRoom(meta.roomId);
      }
      socketMeta.delete(ws);
    }
  });
});

function consumeCardAndRefill(
  state: GameState,
  currentTurn: PlayerColor,
  cardPlayed: Card | null,
  isExhausted: boolean = false
) {
  if (cardPlayed) {
    if (isExhausted) {
      if (!state.exhausted) state.exhausted = [];
      state.exhausted.push(cardPlayed);
    } else {
      const isJokerWild = cardPlayed.isJokerWild || (state.jokerLocked && state.jokerLocked[currentTurn]);
      if (!isJokerWild) {
        state.discard.push(cardPlayed);
      }
    }
  }

  if (state.jokerLocked && state.jokerLocked[currentTurn]) {
    // Cannot draw until all wild cards in hand are exhausted
    if (state.hands[currentTurn].length === 0) {
      state.jokerLocked[currentTurn] = false;
      // Draw 5 new cards from the deck
      for (let i = 0; i < 5; i++) {
        const drawRes = drawCard(state);
        if (drawRes.drawnCard) state.hands[currentTurn].push(drawRes.drawnCard);
        state.deck = drawRes.newDeck;
        state.discard = drawRes.newDiscard;
        if (drawRes.reshuffled) state.powerUps = drawRes.powerUps;
      }
      state.historyLog.unshift({
        id: `log_${Date.now()}_${Math.random()}`,
        turn: currentTurn,
        turnNumber: state.turnNumber,
        actionType: 'move',
        cardName: 'Hand Refilled',
        detail: `${currentTurn === 'w' ? 'White' : 'Black'} exhausted all Joker Wilds and drew 5 new cards from the deck!`,
        timestamp: Date.now(),
        whitePoints: state.whitePoints,
        blackPoints: state.blackPoints,
      });
    }
  } else {
    // Draw cards until player has 5 cards in hand
    while (state.hands[currentTurn].length < 5) {
      const drawRes = drawCard(state);
      if (drawRes.drawnCard) state.hands[currentTurn].push(drawRes.drawnCard);
      state.deck = drawRes.newDeck;
      state.discard = drawRes.newDiscard;
      if (drawRes.reshuffled) state.powerUps = drawRes.powerUps;
      if (!drawRes.drawnCard) break;
    }
  }
}

function cleanMonolithAndChampions(
  board: Chess,
  monolithSquare: string | null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  landedSquare?: string
) {
  const epSquareBeforeRemove = (board as any)._epSquare;
  if (monolithSquare && monolithSquare !== landedSquare) {
    board.remove(monolithSquare as Square);
  }
  if (champions) {
    for (const side of ['w', 'b'] as PlayerColor[]) {
      const champ = champions[side];
      if (champ?.square && champ.square !== landedSquare) {
        board.remove(champ.square as Square);
      }
    }
  }
  // Remove all placeholder squares tracked during createBoardWithMonolith or temporary placements
  const placeholderSquares: string[] = (board as any)._placeholderSquares || [];
  for (const sq of placeholderSquares) {
    if (sq !== landedSquare) {
      board.remove(sq as Square);
    }
  }
  if (epSquareBeforeRemove !== undefined && epSquareBeforeRemove !== -1) {
    (board as any)._epSquare = epSquareBeforeRemove;
  }
}

function transferAwakenedState(
  state: GameState,
  fromSquare: string,
  toSquare: string,
  currentTurn: PlayerColor,
  didCapture: boolean = false,
  isPawnPromotion: boolean = false
) {
  if (!state.superPawns) state.superPawns = [];
  if (!state.superKnights) state.superKnights = [];
  if (!state.awakenedPieces) state.awakenedPieces = [];
  if (!state.awakenedRooks) state.awakenedRooks = [];

  const wasSuperPawn = state.superPawns.includes(fromSquare);
  const wasSuperKnight = state.superKnights.includes(fromSquare);
  const wasAwakenedPiece = state.awakenedPieces.includes(fromSquare);
  const wasAwakenedRook = state.awakenedRooks.some((r) => r.square === fromSquare);

  // Clean captured opponent piece on destination square
  state.superPawns = state.superPawns.filter((sq) => sq !== toSquare);
  state.superKnights = state.superKnights.filter((sq) => sq !== toSquare);
  state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== toSquare);
  state.awakenedRooks = state.awakenedRooks.filter((r) => r.square !== toSquare || r.color === currentTurn);

  // Transfer fromSquare
  if (wasSuperPawn) {
    state.superPawns = state.superPawns.filter((sq) => sq !== fromSquare && sq !== toSquare);
    if (!isPawnPromotion) {
      state.superPawns.push(toSquare);
    }
  }

  if (wasSuperKnight) {
    state.superKnights = state.superKnights.filter((sq) => sq !== fromSquare && sq !== toSquare);
    state.superKnights.push(toSquare);
  }

  if (wasAwakenedRook) {
    state.awakenedRooks = state.awakenedRooks.map((r) => {
      if (r.square === fromSquare) {
        return {
          ...r,
          square: toSquare,
          hasCaptured: r.hasCaptured || didCapture,
        };
      }
      return r;
    });
  }

  if (wasAwakenedPiece || wasSuperPawn || wasSuperKnight || wasAwakenedRook) {
    state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== fromSquare && sq !== toSquare);
    state.awakenedPieces.push(toSquare);
    state.awakenedPieceSquare = toSquare;
    state.awakenedByPlayer = currentTurn;
  } else if (state.awakenedPieceSquare === fromSquare) {
    state.awakenedPieceSquare = toSquare;
  } else if (state.awakenedPieceSquare === toSquare) {
    state.awakenedPieceSquare = null;
  }
}

function swapAwakenedState(state: GameState, sq1: string, sq2: string) {
  if (state.superPawns && state.superPawns.length > 0) {
    const sp1 = state.superPawns.includes(sq1);
    const sp2 = state.superPawns.includes(sq2);
    if (sp1 && !sp2) {
      state.superPawns = state.superPawns.filter((s) => s !== sq1).concat(sq2);
    } else if (!sp1 && sp2) {
      state.superPawns = state.superPawns.filter((s) => s !== sq2).concat(sq1);
    }
  }

  if (state.superKnights && state.superKnights.length > 0) {
    const sn1 = state.superKnights.includes(sq1);
    const sn2 = state.superKnights.includes(sq2);
    if (sn1 && !sn2) {
      state.superKnights = state.superKnights.filter((s) => s !== sq1).concat(sq2);
    } else if (!sn1 && sn2) {
      state.superKnights = state.superKnights.filter((s) => s !== sq2).concat(sq1);
    }
  }

  if (state.awakenedRooks && state.awakenedRooks.length > 0) {
    state.awakenedRooks = state.awakenedRooks.map((rook) => {
      if (rook.square === sq1) {
        return { ...rook, square: sq2 };
      } else if (rook.square === sq2) {
        return { ...rook, square: sq1 };
      }
      return rook;
    });
  }

  if (!state.awakenedPieces) state.awakenedPieces = [];
  const ap1 = state.awakenedPieces.includes(sq1);
  const ap2 = state.awakenedPieces.includes(sq2);
  if (ap1 && !ap2) {
    state.awakenedPieces = state.awakenedPieces.filter((s) => s !== sq1).concat(sq2);
  } else if (!ap1 && ap2) {
    state.awakenedPieces = state.awakenedPieces.filter((s) => s !== sq2).concat(sq1);
  }

  if (state.awakenedPieceSquare === sq1) {
    state.awakenedPieceSquare = sq2;
  } else if (state.awakenedPieceSquare === sq2) {
    state.awakenedPieceSquare = sq1;
  }
}

function isSquareProtectedAwakenedRook(
  chess: Chess,
  state: GameState,
  targetSquare: string,
  attackingColor: PlayerColor
): boolean {
  const piece = chess.get(targetSquare as Square);
  const isOpponentRook = piece?.type === 'r' && piece.color !== attackingColor;

  if (isOpponentRook) {
    if (state.awakenedPieces?.includes(targetSquare)) return true;
    if (
      state.awakenedRooks?.some(
        (ar) => ar.square === targetSquare && ar.color !== attackingColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0)
      )
    ) {
      return true;
    }
  }

  if (
    state.awakenedRooks?.some(
      (ar) => ar.square === targetSquare && ar.color !== attackingColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0)
    )
  ) {
    return true;
  }

  return false;
}

function promoteStatePawns(state:GameState){
 const board=createSafeChess(state.fen);
 if(ensureEdgePawnsPromoted(board))state.fen=board.fen({forceEnpassantSquare:true});
 state.superPawns=(state.superPawns||[]).filter(q=>board.get(q as Square)?.type==='p');
 const promotedIds=new Set(Object.entries(state.pieceIds||{}).filter(([q])=>board.get(q as Square)?.type!=='p').map(([,id])=>id));
 state.superPawnIds=(state.superPawnIds||[]).filter(id=>!promotedIds.has(id));
}

function advanceTurnState(state: GameState, currentTurn: PlayerColor, nextTurn: PlayerColor, portalResolved=false) {
  promoteStatePawns(state);
  reconcilePieceIdentities(state);
  resolveGroundAction(state);
  if(!portalResolved && state.status==='playing' && state.grounds && state.grounds.portalUsed[currentTurn]!==state.grounds.completedTurns+1){
    const request=groundRequests.get(state) as any;
    const prior=groundBefore.get(state);
    const candidates=[request?.secondTo,request?.to,request?.reviveSquare,request?.deploySquare,request?.square1,request?.square2,request?.targetSquare].filter(Boolean);
    const from=candidates.find(q=>state.grounds?.tiles[q]==='portal' && groundPiece(state,q)?.color===currentTurn && (request?.from!==q || request?.secondTo===q) && (!prior || JSON.stringify(groundPiece(prior,q))!==JSON.stringify(groundPiece(state,q)) || prior.pieceIds?.[q]!==state.pieceIds?.[q]));
    if(from){state.pendingPortal={player:currentTurn,from,nextTurn};state.fen=syncFenTurn(state.fen,currentTurn,false);return;}
  }
  consumeCardAndRefill(state, currentTurn, null);
  finishGroundTurn(state, currentTurn, (color, value) => applyCaptureRefresh(state,color,value));
  interruptCircles(state);
  tickSummons(state,currentTurn);
  const ready=state.summoningCircles?.find(c=>c.owner===currentTurn&&!c.finished&&!c.interrupted&&c.remaining===0);
  if(ready && state.status==='playing') {
    if(eligibleRevives(state,currentTurn).length){
      state.pendingSummon={player:currentTurn,circleId:ready.id,nextTurn};
      state.fen=syncFenTurn(state.fen,currentTurn,false);
      pauseGameClock(state);
      return;
    }
    ready.finished=true;summonNotice(state,'Summon failed: no eligible captured piece.');
  }
  completeTurnState(state,currentTurn,nextTurn);
}
function pauseGameClock(s:GameState){if(s.clock?.enabled&&s.clock.isRunning&&s.clock.lastTick)s.clock[s.turn]=Math.max(0,s.clock[s.turn]-(Date.now()-s.clock.lastTick)/1000);if(s.clock){s.clock.isRunning=false;s.clock.lastTick=null;}}
function completeTurnState(state:GameState,currentTurn:PlayerColor,nextTurn:PlayerColor){
  // Snapshot board history for Clock rewind
  if (!state.boardHistory) state.boardHistory = [];
  state.boardHistory.push({
    awakeningSkill: state.lastMoveDetails?.actionType==='awakening',
    summoningCircles: structuredClone(state.summoningCircles||[]),
    soulSummons: structuredClone(state.soulSummons||[]),
    grounds: structuredClone(state.grounds),
    pieceIds: {...state.pieceIds},
    captures: structuredClone(state.captures || { w: [], b: [] }),
    fen: state.fen,
    monolithSquare: state.monolithSquare,
    restrictedSquares: [...state.restrictedSquares],
    champions: {
      w: state.champions?.w ? { ...state.champions.w } : null,
      b: state.champions?.b ? { ...state.champions.b } : null,
    },
    superPawns: [...(state.superPawns || [])],
    superKnights: [...(state.superKnights || [])],
    awakenedRooks: state.awakenedRooks ? state.awakenedRooks.map((r) => ({ ...r })) : [],
    awakenedPieces: [...(state.awakenedPieces || [])],
  });
  if (state.boardHistory.length > 100) {
    state.boardHistory.shift();
  }

  // Red aura expiration: Remove after your opponent moves after you played an awakened card
  if (state.awakenedByPlayer && currentTurn !== state.awakenedByPlayer) {
    state.awakenedPieceSquare = null;
    state.awakenedByPlayer = null;
    state.awakenedOnTurnNumber = null;
    state.awakeningAlert = null;
  } else if (
    state.awakenedOnTurnNumber !== null &&
    state.awakenedOnTurnNumber !== undefined &&
    state.turnNumber >= state.awakenedOnTurnNumber + 1 &&
    currentTurn !== state.awakenedByPlayer
  ) {
    state.awakenedPieceSquare = null;
    state.awakenedByPlayer = null;
    state.awakenedOnTurnNumber = null;
    state.awakeningAlert = null;
  }

  state.turn = nextTurn;
  state.turnNumber += 1;
  state.visionActive[currentTurn] = false;

  // Activate the clock notif automatically removes after your opponent moved
  if (state.clockAlert && state.clockAlert.player !== currentTurn) {
    state.clockAlert = null;
  }

  // Clear champion marks from prior turns unless just set in champion_ultimate
  if (state.championMarks && state.lastMoveDetails?.actionType !== 'champion_ultimate') {
    state.championMarks = undefined;
  }

  // Beacon expiration check (lasts 4 turns: activation turn, opp turn, your turn, opp turn)
  if (state.beaconEffect && state.turnNumber >= state.beaconEffect.expiresOnTurnNumber) {
    state.beaconEffect = null;
  }

  // Awakened Rook duration counts OPPONENT turns only.
  // currentTurn is the player whose completed action is advancing the turn.
  if (state.awakenedRooks && state.awakenedRooks.length > 0) {
    const expiredRookSquares: string[] = [];
    state.awakenedRooks = state.awakenedRooks.flatMap((rook) => {
      if (rook.color === currentTurn) return [rook];
      const turnsRemaining = rook.turnsRemaining - 1;
      if (turnsRemaining > 0) {
        return [{ ...rook, turnsRemaining }];
      } else {
        expiredRookSquares.push(rook.square);
        return [];
      }
    });
    if (expiredRookSquares.length > 0 && state.awakenedPieces) {
      state.awakenedPieces = state.awakenedPieces.filter((sq) => !expiredRookSquares.includes(sq));
    }
  }

  // Static Card: check if stun procs at the 3rd turn (your next turn) and lasts through opponent's turn
  if (state.staticEffect && state.staticEffect.pending && state.turnNumber >= (state.staticEffect.procOnTurnNumber || 0)) {
    state.staticEffect.pending = false;
    state.staticEffect.active = true;
    state.staticEffect.stunnedSquares = state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [];
    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: state.turn,
      turnNumber: state.turnNumber,
      actionType: 'static',
      cardName: 'Static Stun Procs',
      detail: `⚡ STATIC STUN DISCHARGED! Electrifying shockwave stuns all units around the Monolith (active for both your turn and opponent's turn)!`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });
  } else if (state.staticEffect && state.staticEffect.active && state.turnNumber >= state.staticEffect.expiresOnTurnNumber) {
    state.staticEffect = null;
  }

  // Check Game End / Checkmate condition for the defending player (nextTurn)
  if (state.status === 'playing') {
    const evalChess = createSafeChess(state.fen);
    const evalRes = evaluateGameEnd(evalChess, state);
    if (evalRes.status !== 'playing') {
      state.status = evalRes.status;
      state.winner = evalRes.winner;
      state.winReason = evalRes.winReason;
    }
    state.whitePoints = evalRes.whitePoints;
    state.blackPoints = evalRes.blackPoints;
  }

  if (state.clock && state.clock.enabled && state.status === 'playing') {
    if (!state.clock.isRunning) {
      state.clock.isRunning = true;
      state.clock.lastTick = Date.now();
    } else if (state.clock.lastTick) {
      const elapsed = (Date.now() - state.clock.lastTick) / 1000;
      state.clock[currentTurn] = Math.max(0, Math.round(state.clock[currentTurn] - elapsed + state.clock.incrementSeconds));
      state.clock.lastTick = Date.now();

      if (state.clock[currentTurn] <= 0) {
        state.clock[currentTurn] = 0;
        state.status = 'timeout';
        state.winner = nextTurn;
        state.winReason = `Time Expired: ${currentTurn === 'w' ? 'White' : 'Black'} ran out of time! ${nextTurn === 'w' ? 'White' : 'Black'} wins.`;
      }
    }
  }
}

function executePoweredMovement(room:RoomState,msg:ClientMessage,color:PlayerColor,ws?:WebSocket):boolean {
 const s=room.gameState,m=msg as any; const g=s.grounds;
 const ordinary=['play_card_move','play_king_move','use_powerup_wild_move','play_awakening_as_wild','play_champion_move','play_awakening_knight'];
 if(!g||!ordinary.includes(msg.type)||(!groundMoves(s,m.from)&&!(m.secondTo&&(['boost','gravity'].includes(g.tiles[m.to])||g.traps.some(t=>t.square===m.to)))))return false;
 const fail=(text:string)=>{if(ws)sendToSocket(ws,{type:'error',message:text});return true;};
 if(s.status!=='playing'||s.turn!==color)return fail('It is not your turn.');
 const p=groundPiece(s,m.from);if(!p||p.color!==color)return fail('Choose your piece.');
 let card:Card|undefined;
 if(msg.type==='use_powerup_wild_move'){if(s.powerUps[color].wild<1)return fail('No Wild charge.');}
 else if(msg.type!=='play_king_move'&&msg.type!=='play_champion_move'){
 card=s.hands[color].find(c=>c.id===m.cardId);if(!card)return fail('Card is unavailable.');
 const normal=p.type==='sp'?'p':p.type==='sn'?'n':p.type;
 if(msg.type==='play_awakening_as_wild'){if(!card.type.startsWith('awakening_'))return fail('Choose an Awakening card.');}
 else if(!isCardPermittedForPiece(card,normal as StandardPieceType,s.lastMovedPiece[color],Boolean(m.asWild&&card.type.startsWith('awakening_'))))return fail('Use a matching piece card.');
 } else if(msg.type==='play_king_move'&&p.type!=='k')return fail('Only Kings move freely.');
 const draft=structuredClone(s);if(msg.type==='play_awakening_knight'){if(card?.type!=='awakening_knight'||p.type!=='n')return fail('Choose a Knight and its Awakening card.');draft.superKnights||=[];if(!draft.superKnights.includes(m.from))draft.superKnights.push(m.from);}
 let b=createSafeChess(draft.fen);let captured=false;const steps=[m.to,...(m.secondTo?[m.secondTo]:[])];let from=m.from;
 if(m.secondTo&&!draft.superKnights?.includes(from))return fail('Only Super Knight can move twice.');
 for(const [index,to] of steps.entries()){
 if(draft.staticEffect?.active&&draft.staticEffect.stunnedSquares.includes(from))return fail('A stunned piece cannot make a second move.');
 const tileMoves=groundMoves(draft,from);
 if(tileMoves){if(!tileMoves.includes(to))return fail('That tile changes movement and prohibits ordinary captures.');const piece=b.get(from as Square);b.remove(from as Square);if(piece)b.put(piece,to as Square);else if(draft.champions[color]?.square===from)draft.champions[color]!.square=to;}
 else{const valid=getLegalMovesForPiece(from as Square,b,draft.restrictedSquares,draft.monolithSquare,draft.staticEffect?.active?draft.staticEffect.stunnedSquares:[],draft.beaconEffect?.active?draft.beaconEffect.protectedSquares:[],draft.champions[color]?.square||null,draft.champions[color==='w'?'b':'w'],draft.champions,draft.awakenedRooks,draft.superPawns,draft.superKnights,draft.awakenedPieces, draft.grounds);if(!valid.includes(to))return fail('Invalid Knight jump.');const victim=groundPiece(draft,to);if(victim&&draft.grounds?.disarm.some(d=>d.square===from))return fail('Disarmed pieces cannot capture.');if(victim&&captured)return fail('Only one capture per double move.');if(victim&&(captureProtected(draft,to)))return fail('Target is invulnerable.');const enemy=color==='w'?'b':'w';
 const boardWithObstacles=createBoardWithMonolith(b.fen(),draft.monolithSquare,color,draft.champions);
 if(draft.champions[enemy]?.square===to)boardWithObstacles.put({type:'p',color:enemy},to as Square);
 if(victim?.type==='k'){const mover=boardWithObstacles.get(from as Square);boardWithObstacles.remove(from as Square);boardWithObstacles.remove(to as Square);boardWithObstacles.put(mover!,to as Square);draft.status='checkmate';draft.winner=color;draft.winReason='King captured.';}
 else try{moveWithGrounds(boardWithObstacles, draft, {from,to,promotion:m.promotion||'q'});}catch{return fail('Invalid move.');}
 cleanMonolithAndChampions(boardWithObstacles,draft.monolithSquare,draft.champions,to);b=boardWithObstacles;
 if(draft.champions[enemy]?.square===to)draft.champions[enemy]=null;
 captured||=!!victim;}
 if(draft.pieceIds?.[from]){draft.pieceIds[to]=draft.pieceIds[from];delete draft.pieceIds[from];}draft.fen=b.fen();transferAwakenedState(draft,from,to,color,captured);relocateDebuffs(draft,from,to);landGround(draft,to);b=createSafeChess(draft.fen);
 if(isKingChecked(b,color,draft.monolithSquare,draft.champions, undefined, draft.grounds))return fail('King must be safe after each jump.');from=to;
 if(!groundPiece(draft,to)||draft.status!=='playing')break;
 }
 if(m.secondTo)draft.superKnights=draft.superKnights?.filter(q=>q!==from);
 if(card){draft.hands[color]=draft.hands[color].filter(c=>c.id!==card!.id);consumeCardAndRefill(draft,color,card,msg.type==='play_awakening_knight');}if(msg.type==='use_powerup_wild_move')draft.powerUps[color].wild--;
 draft.lastMovedPiece[color]=p.type==='sp'?'p':p.type==='sn'?'n':['p','n','b','r','q'].includes(p.type)?p.type as StandardPieceType:null;
 draft.lastMoveDetails={player:color,actionType:'move',from:m.from,to:from,firstTo:m.secondTo?m.to:undefined};draft.lastMovedSquare[color]=from;
 groundEvent(draft,'move',`${color==='w'?'White':'Black'} moved ${p.type} from ${m.from} to ${from}.`);
 if(card?.type.startsWith('awakening_')&&msg.type!=='play_awakening_knight'){
  draft.historyLog[0].cardName=`${card.name} (Played as Wild)`;
  draft.historyLog[0].detail=`${color==='w'?'White':'Black'} played ${card.name} as Wild: ${m.from}->${from}.`;
 }

 Object.assign(s,draft);groundBefore.delete(s);const next=color==='w'?'b':'w';s.fen=syncFenTurn(s.fen,next);advanceTurnState(s,color,next);return true;
}

function moveWithGrounds(board:Chess,state:GameState,move:any):any {
 const options=groundMoves({...state,fen:board.fen()},move.from);
 if(options){if(!options.includes(move.to))throw Error('Tile movement prohibits that destination.');const p=board.get(move.from);if(!p)throw Error('Missing piece.');board.remove(move.from);board.put(p,move.to);if(isKingChecked(board,p.color,state.monolithSquare,state.champions,undefined,state.grounds))throw Error('King unsafe.');return {san:`${move.from}-${move.to}`,from:move.from,to:move.to};}
 try{return board.move(move);}catch(error){
 if(!state.grounds)throw error;
 const square=(n:number)=>String.fromCharCode(97+(n&15))+(8-(n>>4));
 const raw=(board as any)._moves({square:move.from,legal:false}).find((m:any)=>square(m.to)===move.to&&(!m.promotion||m.promotion===(move.promotion||'q')));
 if(!raw)throw error;(board as any)._makeMove(raw);
 if(isKingChecked(board,raw.color,state.monolithSquare,state.champions,undefined,state.grounds))throw error;
 return {...raw,from:move.from,to:move.to,flags:raw.flags&8?'e':'',san:`${move.from}-${move.to}`};
 }
}
const identityBefore=new WeakMap<GameState,GameState>();
function reconcilePieceIdentities(s:GameState){
 const old=identityBefore.get(s);if(!old)return;
 const msg=groundRequests.get(s) as any;
 if(msg?.type==='play_clock')return;
 const details=s.lastMoveDetails as any;
 if(s.fen===old.fen&&s.turnNumber===old.turnNumber&&JSON.stringify(s.champions)===JSON.stringify(old.champions)&&JSON.stringify(s.superPawns)===JSON.stringify(old.superPawns)&&JSON.stringify(s.superKnights)===JSON.stringify(old.superKnights))return;
 const previous=old.pieceIds||{}, mapped={...previous};let moves:Array<[string,string]>=[];
 if(details?.swappedSquares){const[a,b]=details.swappedSquares;moves=[[a,b],[b,a]];}else if(msg?.targetFriendlySquare&&msg.targetSquare)moves=[[msg.targetFriendlySquare,msg.targetSquare]];else if(details?.from&&details.to)moves=[[details.from,details.to]];
 if(msg?.from&&msg.to&&createSafeChess(old.fen).get(msg.from)?.type==='k'&&Math.abs(msg.from.charCodeAt(0)-msg.to.charCodeAt(0))===2){const rank=msg.from[1];moves.push([msg.to[0]==='g'?'h'+rank:'a'+rank,msg.to[0]==='g'?'f'+rank:'d'+rank]);}
 for(const[from]of moves)delete mapped[from];for(const[from,to]of moves)if(previous[from])mapped[to]=previous[from];
 if(msg?.type==='play_awakening_queen'&&msg.deploySquare&&previous[msg.to])mapped[msg.deploySquare]=previous[msg.to];
 const b=createSafeChess(s.fen);const next:Record<string,string>={};for(const row of b.board())for(const p of row)if(p)next[p.square]=s.pieceIds?.[p.square]&&Object.values(previous).includes(s.pieceIds[p.square])===false?s.pieceIds[p.square]:mapped[p.square]||`piece_${Date.now()}_${Math.random()}`;
 for(const c of Object.values(s.champions))if(c)next[c.square]=mapped[c.square]||`champ_${Date.now()}_${Math.random()}`;
 const pawnIds=new Set([...(s.superPawnIds||[]),...(old.superPawns||[]).map(q=>previous[q]).filter(Boolean),...(s.superPawns||[]).map(q=>next[q]).filter(Boolean)]);
 const knightIds=new Set([...(s.superKnightIds||[]),...(old.superKnights||[]).map(q=>previous[q]).filter(Boolean),...(s.superKnights||[]).map(q=>next[q]).filter(Boolean)]);
 if(msg?.secondTo&&previous[msg.from])knightIds.delete(previous[msg.from]);
 for(const q of Object.keys(next))if(b.get(q as Square)?.type!=='p')pawnIds.delete(next[q]);
 s.pieceIds=next;s.superPawnIds=[...pawnIds];s.superKnightIds=[...knightIds];identityBefore.delete(s);
}
const groundBefore = new WeakMap<GameState,GameState>();
const groundRequests=new WeakMap<GameState,ClientMessage>();
function groundsPreflight(s:GameState,msg:ClientMessage,color:PlayerColor):string|null {
 const m=msg as any; const b=createSafeChess(s.fen);const g=s.grounds;
 if((msg.type==='play_monolith'||msg.type==='place_ground')&&activeCircle(s,m.targetSquare||m.square))return 'A summoning circle is not an empty square.';
 const sources=[m.from,m.square1,m.square2,m.targetFriendlySquare].filter(Boolean);
 if(msg.type==='play_champion_ultimate'&&s.champions[color])sources.push(s.champions[color]!.square);
 if(sources.some(q=>s.staticEffect?.active&&s.staticEffect.stunnedSquares.includes(q)))return 'Stunned pieces cannot move or activate an ultimate.';
 if(msg.type==='play_switch'&&[m.square1,m.square2].some(q=>groundPiece(s,q)?.color!==color))return 'Switch targets must both belong to you.';
 if(msg.type==='play_push'&&groundPiece(s,m.from)?.color!==color)return 'Push targets must belong to you.';
 if(msg.type==='play_switch'&&[m.square1,m.square2].every(q=>g?.tiles[q]==='portal'))return 'Use the portal swap instead of Switch.';
 if((msg.type==='play_restrict'||msg.type==='play_monolith')&&g?.tiles[m.targetSquare]==='portal'&&!(msg.type==='play_restrict'&&activeCircle(s,m.targetSquare)))return 'Portals cannot be restricted or occupied by a Monolith.';
 const targets=[m.to,m.secondTo,m.targetSquare,...(m.targetSquares||[])].filter(Boolean);
 if(m.from&&m.to&&b.get(m.from)?.type==='p'&&m.from[0]!==m.to[0]&&!b.get(m.to))targets.push(m.to[0]+m.from[1]);
 if(targets.some(q=>groundPiece(s,q)?.color!==color&&groundPiece(s,q)&&groundProtected(s,q)))return 'A piece on Defense cannot be captured.';
 if(sources.some(q=>g?.disarm.some(d=>d.square===q))&&(msg.type==='play_champion_ultimate'||targets.some(q=>groundPiece(s,q)&&groundPiece(s,q)?.color!==color)))return 'Disarmed pieces cannot capture or activate an ultimate.';
 return null;
}
function resolveGroundAction(s:GameState){
 const old=groundBefore.get(s);if(!old||!s.grounds)return;
 const request=groundRequests.get(s) as any;
 const d=s.lastMoveDetails as any;let moves:Array<[string,string]>=[];
 if(d?.swappedSquares){const[a,b]=d.swappedSquares;moves=[[a,b],[b,a]];}else if(d?.from&&d?.to)moves=[[d.from,d.to]];
 // Some skills use their own coordinate fields. Compare identity for added/revived/converted pieces.
 if(d?.actionType==='portal'&&d.from&&d.to)moves=d.swappedSquares?moves:[[d.from,d.to]];
 if(request?.type==='play_champion_ultimate'&&request.targetFriendlySquare&&request.targetSquare)moves=[[request.targetFriendlySquare,request.targetSquare]];
 if(request?.from&&request.to&&createSafeChess(old.fen).get(request.from)?.type==='k'&&Math.abs(request.from.charCodeAt(0)-request.to.charCodeAt(0))===2){const rank=request.from[1];moves.push([request.to[0]==='g'?'h'+rank:'a'+rank,request.to[0]==='g'?'f'+rank:'d'+rank]);}
 if(request?.type==='play_champion_ultimate'&&old.champions[d?.player]?.type==='berserker'&&request.targetSquare)moves=[[old.champions[d.player]!.square,request.targetSquare]];
 const movingPoison=old.grounds?.poison||[];const movingDisarm=old.grounds?.disarm||[];
 for(const list of [s.grounds.poison,s.grounds.disarm])for(const debuff of list){const mv=moves.find(([from])=>from===debuff.square);if(mv)debuff.square=mv[1];}
 const landings=new Set(moves.map(x=>x[1]));
 for(const rank of '12345678')for(const file of 'abcdefgh'){const q=file+rank;const a=groundPiece(old,q),b=groundPiece(s,q);if(b&&(!a||a.color!==b.color||a.type!==b.type))landings.add(q);}
 // Poison retaliation applies to melee captures; ranged Champion abilities are exempt.
 const ranged=d?.actionType==='champion_ultimate'&&['musketeer','ninja'].includes(old.champions[s.turn]?.type||'');
 interruptCircles(s,[...landings]);
 for(const q of landings){const victim=movingPoison.find(x=>x.square===q&&!moves.some(([from])=>from===q));const p=groundPiece(s,q);if(victim&&p&&p.color!==victim.color&&!ranged&&!groundImmune(s,q)){removeGroundPiece(s,q,victim.color);groundEvent(s,'poison',`Poison retaliation removed the capturer at ${q}.`);}landGround(s,q);}
 s.grounds.poison=s.grounds.poison.filter(x=>groundPiece(s,x.square)?.color===x.color);
 s.grounds.disarm=s.grounds.disarm.filter(x=>groundPiece(s,x.square)?.color===x.color);
 groundBefore.delete(s);
}
function executeGroundAction(room:RoomState,msg:ClientMessage,color:PlayerColor,ws?:WebSocket):boolean {
 const s=room.gameState,g=s.grounds,m=msg as any;
 const fail=(text:string)=>{if(ws)sendToSocket(ws,{type:'error',message:text});return true;};
 if(msg.type!=='place_ground'&&msg.type!=='portal_move')return false;
 if(!g||s.status!=='playing'||s.turn!==color)return fail('This tile action is unavailable.');
 if(msg.type==='place_ground'){
  const type=m.groundType,q=m.square;
  if(!g.selected.includes(type)||(g.charges[color][type as keyof typeof g.charges.w]||0)<1)return fail('No charge available.');
  if(!/^[a-h][1-8]$/.test(q)||groundPiece(s,q)||s.monolithSquare===q||s.restrictedSquares.includes(q))return fail('Choose an empty unrestricted square.');
  if(isKingChecked(createSafeChess(s.fen),color,s.monolithSquare,s.champions, undefined, s.grounds))return fail('A tile placement cannot leave your King in check.');
  const trap=['mine','poison','disarm','banish'].includes(type);
  if(trap){if((color==='w'?Number(q[1])>4:Number(q[1])<5))return fail('Place traps on your half of the board.');if(['portal','defense'].includes(g.tiles[q]))return fail('Traps cannot be placed on Portal or Defense.');if(g.traps.some(t=>t.square===q&&t.owner===color&&t.type===type))return fail('Your same trap already exists here.');}
  else {if(g.tiles[q])return fail('Power tiles cannot overlap.');if(type==='portal'&&g.tiles[m.portalFrom]!=='portal')return fail('Choose which portal to relocate.');}
  g.charges[color][type as keyof typeof g.charges.w]!--;
  if(trap)g.traps.push({id:`trap_${Date.now()}_${Math.random()}`,type,owner:color,square:q});else{if(type==='portal')delete g.tiles[m.portalFrom];g.tiles[q]=type;if(type==='portal'||type==='defense')g.traps=g.traps.filter(t=>t.square!==q);}
  g.placementTurns.push(g.completedTurns+1);groundEvent(s,trap?'trap-place':'tile-place',trap?`${color==='w'?'White':'Black'} placed a trap.`:`${color==='w'?'White':'Black'} placed ${type} at ${q}.`);
  s.lastMoveDetails={player:color,actionType:'powerup'};const next=color==='w'?'b':'w';s.fen=syncFenTurn(s.fen,next);advanceTurnState(s,color,next);return true;
 }
 if(!portalTravelTarget(s,color,m.from))return fail('Warp is blocked, unavailable, or would leave your King unsafe.');
 const from=m.from,to=Object.keys(g.tiles).find(q=>q!==from&&g.tiles[q]==='portal');const piece=groundPiece(s,from);
 if(g.tiles[from]!=='portal'||!to||!piece||piece.color!==color||g.portalUsed[color]===g.completedTurns+1)return fail('Portal warp is available once per turn for your piece.');
 const enemy=groundPiece(s,to);if(enemy&&enemy.color!==color&&(captureProtected(s,to)))return fail('That destination piece is invulnerable.');if(enemy&&enemy.color!==color&&g.disarm.some(d=>d.square===from))return fail('A disarmed piece cannot capture.');
 if(enemy&&enemy.color!==color&&enemy.type!=='k'&&s.awakenedRooks?.some(r=>r.square===from&&r.hasCaptured))return fail('This Awakened Rook has already captured.');
 const board=createSafeChess(s.fen);const a=board.get(from as Square),b=board.get(to as Square);board.remove(from as Square);board.remove(to as Square);if(a)board.put(a,to as Square);if(enemy?.color===color&&b)board.put(b,from as Square);
 const draft=structuredClone(s);draft.fen=board.fen();if(draft.champions[color]?.square===from)draft.champions[color]!.square=to;if(enemy?.color===color&&draft.champions[color]?.square===to&&piece.type!==draft.champions[color]?.type)draft.champions[color]!.square=from;if(enemy?.color!==color&&enemy&&draft.champions[enemy.color]?.square===to)draft.champions[enemy.color]=null;
 if(isKingChecked(createSafeChess(draft.fen),color,draft.monolithSquare,draft.champions, undefined, s.grounds))return fail('Your King must be safe after transport.');
 s.fen=draft.fen;s.champions=draft.champions;if(enemy?.color===color)swapAwakenedState(s,from,to);else transferAwakenedState(s,from,to,color,!!enemy);
 if(enemy&&enemy.color!==color){if(!isTemporary(groundBefore.get(s)||s,to)){awardCaptureRefresh(s,color,points(enemy.type));s.captures||={w:[],b:[]};s.captures[color].push(enemy);}if(enemy.type==='k'){s.status='checkmate';s.winner=color;s.winReason='King captured through a portal.';}}
 g.portalUsed[color]=g.completedTurns+1;s.lastMoveDetails={player:color,actionType:'powerup',from,to,...(enemy?.color===color?{swappedSquares:[from,to]}:{})};groundEvent(s,'portal',`${color==='w'?'White':'Black'} used the portal from ${from} to ${to}.`);return true;
}

const actionCaptureAwards = new WeakMap<GameState, number>();
function awardCaptureRefresh(state: GameState, player: PlayerColor, points: number) {
  if (actionCaptureAwards.has(state)) actionCaptureAwards.set(state, (actionCaptureAwards.get(state) || 0) + points);
  const old=identityBefore.get(state),m=groundRequests.get(state) as any;
  const targets=[m?.to,m?.targetSquare,...(m?.targetSquares||[])].filter(Boolean);
  const exempt=old?targets.filter((q,i)=>targets.indexOf(q)===i&&isTemporary(old,q)&&groundPiece(old,q)?.color!==player).reduce((n,q)=>n+getPieceCapturePoints(createSafeChess(old.fen).get(q as Square)?.type||''),0):0;
  points=Math.max(0,points-exempt);
  if (actionCaptureAwards.has(state)) actionCaptureAwards.set(state,points);
  return applyCaptureRefresh(state, player, points);
}

function handleGameAction(room: RoomState, msg: ClientMessage, actorColor: PlayerColor | 'spectator', ws?: WebSocket) {
  if (actorColor === 'spectator') return;
  const before = room.gameState;
  const requestCard=before.hands[actorColor]?.find(c=>c.id===(msg as any).cardId);
  if(requestCard?.type==='brick'||(requestCard?.type==='refresh'&&msg.type!=='play_refresh')){
    if(ws)sendToSocket(ws,{type:'error',message:requestCard.type==='brick'?'Brick cannot be played. Discard it instead.':'Refresh is a free hand redraw, not a piece move.'});
    return;
  }
  if(before.pendingSummon){
    if(msg.type==='resolve_summon') { resolveCircleChoice(before,msg,actorColor,ws); return; }
    if(msg.type!=='resign'){if(ws)sendToSocket(ws,{type:'error',message:'Choose a revival or decline first.'});return;}
  } else if(msg.type==='resolve_summon')return;
  if(before.pendingSwapDiscard && msg.type!=='resign' && !(msg.type==='use_powerup_draw' && Array.isArray(msg.discardCardIds))){
    if(ws)sendToSocket(ws,{type:'error',message:'Exchange requires discarding exactly two hand cards before another action.'});return;
  }

  if(before.pendingPortal){
    if(msg.type==='resolve_portal'){
      if(typeof msg.transport!=='boolean')return;
      const pending=before.pendingPortal;
      if(before.status!=='playing'||pending.player!==actorColor||before.turn!==actorColor)return;
      if(msg.transport){
        const oldUsed=before.grounds?.portalUsed[actorColor];
        before.pendingPortal=null;
        handleGameAction(room,{type:'portal_move',from:pending.from},actorColor,ws);
        if(before.grounds?.portalUsed[actorColor]===oldUsed){before.pendingPortal=pending;return;}
      }
      before.pendingPortal=null;
      before.fen=syncFenTurn(before.fen,pending.nextTurn,false);
      if(pending.turnFinished)completeTurnState(before,actorColor,pending.nextTurn);else advanceTurnState(before,actorColor,pending.nextTurn,true);
      const board=createSafeChess(before.fen);
      before.whitePoints=calculatePiecePoints(board,'w',before.champions,before)+(before.grounds?.banished.filter(x=>x.piece.color==='w'&&!before.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+points(x.piece.type),0)||0);
      before.blackPoints=calculatePiecePoints(board,'b',before.champions,before)+(before.grounds?.banished.filter(x=>x.piece.color==='b'&&!before.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+points(x.piece.type),0)||0);
      return;
    }
    if(msg.type!=='resign'){if(ws)sendToSocket(ws,{type:'error',message:'Choose whether to use the Portal before another action.'});return;}
  } else if(msg.type==='resolve_portal')return;

  if((msg as any).secondTo&&(msg as any).to&&createSafeChess(before.fen).get((msg as any).to)?.type==='k')msg={...msg,secondTo:undefined} as ClientMessage;
  const issue = groundsPreflight(before,msg,actorColor);
  if(issue){if(ws)sendToSocket(ws,{type:"error",message:issue});return;}
  identityBefore.set(before,structuredClone(before));
  groundBefore.set(before, structuredClone(before));
  groundRequests.set(before,msg);
  const previousGrounds=structuredClone(before.grounds);
  const previousCaptures=structuredClone(before.captures||{w:[],b:[]});
  const snapshot = { pieceIds:{...before.pieceIds}, soulSummons:structuredClone(before.soulSummons||[]), fen: before.fen, champions: structuredClone(before.champions), superPawns: [...(before.superPawns || [])], superKnights: [...(before.superKnights || [])] };
  const turnNumber = before.turnNumber;
  actionCaptureAwards.set(before, 0);
  let awarded = 0;
  try { if (!executeGroundAction(room,msg,actorColor,ws) && !executePoweredMovement(room,msg,actorColor,ws)) executeGameAction(room, msg, actorColor, ws); }
  finally { awarded = actionCaptureAwards.get(before) || 0; actionCaptureAwards.delete(before); }
  const after = room.gameState;
  // Public knowledge ends as soon as a guaranteed starting Pawn leaves its owner's hand.
  for(const card of [...after.deck,...after.discard,...(after.exhausted||[]),...after.hands.w,...after.hands.b]){
    if(card.knownStartingPawnFor&&!after.hands[card.knownStartingPawnFor].some(c=>c.id===card.id))delete card.knownStartingPawnFor;
  }
  if(after===before && (after.fen!==snapshot.fen || after.turnNumber!==turnNumber))promoteStatePawns(after);
  if(after===before)reconcilePieceIdentities(after);
  identityBefore.delete(before);
  if(msg.type==='play_champion_move'&&after.turnNumber!==turnNumber)after.lastMovedPiece[actorColor]=null;
  if(msg.type==='portal_move'||msg.type==='play_clock') resolveGroundAction(after);
  if(after.grounds)after.grounds.poison=after.grounds.poison.filter(d=>!groundImmune(after,d.square));
  groundBefore.delete(before);groundRequests.delete(before);
  interruptCircles(after);
  expireInvalidSoulCards(after);
  if (after !== before || (after.fen === snapshot.fen && after.turnNumber === turnNumber)) return;
  if (msg.type !== 'play_clock') {
    let lost = capturedInAction(snapshot, after, actorColor);
    if(after.grounds){
      const accounted=[...(after.captures?.w.slice(previousCaptures.w.length)||[]),...(after.captures?.b.slice(previousCaptures.b.length)||[]),...after.grounds.banished.filter(x=>!previousGrounds?.banished.some(y=>y.square===x.square&&y.piece.type===x.piece.type)).map(x=>x.piece)];
      for(const p of accounted){const index=lost.findIndex(x=>x.type===p.type&&x.color===p.color);if(index>=0)lost.splice(index,1);}
    }
    if (lost.length) {
      const earned = lost.reduce((sum, piece) => sum + (['berserker','musketeer','summoner','ninja'].includes(piece.type) ? 5 : getPieceCapturePoints(piece.type === 'sp' ? 'p' : piece.type === 'sn' ? 'n' : piece.type)), 0);
      if (earned > awarded) applyCaptureRefresh(after, actorColor, earned - awarded);
      after.captures ||= { w: [], b: [] };
      after.captures[actorColor].push(...lost);
      const latest = after.boardHistory?.at(-1);
      if (latest) latest.captures = structuredClone(after.captures);
    }
  }
  const board = createSafeChess(after.fen);
  after.whitePoints = calculatePiecePoints(board, 'w', after.champions, after) + (after.grounds?.banished.filter(x=>x.piece.color==='w'&&!after.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+points(x.piece.type),0)||0);
  after.blackPoints = calculatePiecePoints(board, 'b', after.champions, after) + (after.grounds?.banished.filter(x=>x.piece.color==='b'&&!after.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+points(x.piece.type),0)||0);
}

function expireInvalidSoulCards(s:GameState){
 const b=createSafeChess(s.fen);
 for(const color of ['w','b'] as const){
  for(const card of [...s.hands[color]])if(card.type==='soul_release'&&card.soul){
   const alive=Object.entries(s.pieceIds||{}).some(([q,id])=>id===card.soul!.queenId&&b.get(q as Square)?.type==='q'&&b.get(q as Square)?.color===color);
   const banished=s.grounds?.banished.some(e=>e.pieceId===card.soul!.queenId&&e.piece.color===color);
   if(!alive&&!banished){s.hands[color]=s.hands[color].filter(c=>c.id!==card.id);s.exhausted||=[];s.exhausted.push(card);const replacement=drawCard(s);s.deck=replacement.newDeck;s.discard=replacement.newDiscard;if(replacement.reshuffled)s.powerUps=replacement.powerUps;if(replacement.drawnCard)s.hands[color].push(replacement.drawnCard);summonNotice(s,'Soul Release exhausted: its Queen is gone. A replacement card was drawn.');}
  }
 }
}
function resolveCircleChoice(s:GameState,msg:Extract<ClientMessage,{type:'resolve_summon'}>,color:PlayerColor,ws?:WebSocket){
 const pending=s.pendingSummon;if(!pending||pending.player!==color||s.turn!==color||s.status!=='playing')return;
 const circle=s.summoningCircles?.find(c=>c.id===pending.circleId&&!c.finished&&!c.interrupted);if(!circle)return;
 if(msg.captureIndex!==null){
  if(!Number.isInteger(msg.captureIndex))return;
  const choice=eligibleRevives(s,color).find(x=>x.index===msg.captureIndex);if(!choice)return;
  const draft=structuredClone(s);const c=draft.summoningCircles!.find(c=>c.id===circle.id)!;c.finished=true;
  if(!emptySummonSquare(draft,c.square))return;
  placeRevived(draft,c.square,choice.piece,color);landGround(draft,c.square);promoteStatePawns(draft);
  if(!kingSafe(draft,color)){if(ws)sendToSocket(ws,{type:'error',message:'That revival leaves your King unsafe. Choose another piece or decline.'});return;}
  draft.captures![color==='w'?'b':'w'].splice(msg.captureIndex,1);
  draft.lastMoveDetails={player:color,actionType:'revive'};
  summonNotice(draft,`${color==='w'?'White':'Black'} revived ${choice.piece.type} at ${c.square}.`,'revive','Piece Revival');Object.assign(s,draft);
 } else {circle.finished=true;summonNotice(s,'Summon failed: revival declined.');}
 s.pendingSummon=null;s.fen=syncFenTurn(s.fen,pending.nextTurn,false);
 if(s.clock?.enabled)s.clock[color]+=s.clock.incrementSeconds;
 const readySquare=circle.square;
 if(msg.captureIndex!==null&&s.grounds?.tiles[readySquare]==='portal'&&groundPiece(s,readySquare)?.color===color&&s.grounds.portalUsed[color]!==s.grounds.completedTurns){s.pendingPortal={player:color,from:readySquare,nextTurn:pending.nextTurn,turnFinished:true};s.fen=syncFenTurn(s.fen,color,false);return;}
 completeTurnState(s,color,pending.nextTurn);
}
function executeSummoningAction(room:RoomState,msg:ClientMessage,color:PlayerColor,ws?:WebSocket):boolean {
 if(!['play_awakening_bishop','play_awakening_queen','play_soul_release'].includes(msg.type))return false;
 const s=room.gameState,m=msg as any;const fail=(message:string)=>{if(ws)sendToSocket(ws,{type:'error',message});return true;};
 const expected=msg.type==='play_soul_release'?'soul_release':msg.type==='play_awakening_bishop'?'awakening_bishop':'awakening_queen';
 const card=s.hands[color].find(c=>c.id===m.cardId&&c.type===expected);if(!card)return fail('Card unavailable.');
 if(msg.type==='play_soul_release'){
  if(!card.soul||!soulTargets(s,card,color).includes(m.targetSquare))return fail('Choose an empty unrestricted square in the 5×5 area around the original Queen.');
  const draft=structuredClone(s);const id=`soul_piece_${Date.now()}_${Math.random()}`;
  placeRevived(draft,m.targetSquare,card.soul.piece,color,id);draft.soulSummons||=[];
  draft.soulSummons.push({id:`soul_${Date.now()}_${Math.random()}`,owner:color,pieceId:id,remaining:5,createdTurn:s.turnNumber});
  landGround(draft,m.targetSquare);promoteStatePawns(draft);
  if(!kingSafe(draft,color))return fail('The summon leaves your King unsafe.');
  draft.hands[color]=draft.hands[color].filter(c=>c.id!==card.id);draft.exhausted||=[];draft.exhausted.push(card);
  draft.lastMoveDetails={player:color,actionType:'soul_release'};summonNotice(draft,`Soul Release summoned ${card.soul.piece.type} at ${m.targetSquare} for five of your subsequent turns. It has no army or capture value.`,'soul_release','Soul Release');
  Object.assign(s,draft);groundBefore.delete(s);identityBefore.delete(s);const next=color==='w'?'b':'w';s.fen=syncFenTurn(s.fen,next,false);advanceTurnState(s,color,next);return true;
 }
 const board=createSafeChess(s.fen),piece=board.get(m.from as Square),isBishop=msg.type==='play_awakening_bishop';
 if(!piece||piece.color!==color||piece.type!==(isBishop?'b':'q'))return fail('Choose the matching friendly piece.');
 const enemy=color==='w'?'b':'w',victim=board.get(m.to as Square);
 if(!isBishop&&(!victim||victim.type==='k'||isTemporary(s,m.to)||s.champions[enemy]?.square===m.to)){
  executeGameAction(room,{type:'play_awakening_as_wild',cardId:card.id,from:m.from,to:m.to},color,ws);return true;
 }
 const legal=getLegalMovesForPiece(m.from,board,s.restrictedSquares,s.monolithSquare,s.staticEffect?.active?s.staticEffect.stunnedSquares:[],s.beaconEffect?.active?s.beaconEffect.protectedSquares:[],s.champions[color]?.square||null,s.champions[enemy],s.champions,s.awakenedRooks||[],s.superPawns||[],s.superKnights||[],s.awakenedPieces||[],s.grounds);
 if(!legal.includes(m.to))return fail('Invalid move.');
 const draft=structuredClone(s);const moved=createBoardWithMonolith(s.fen,s.monolithSquare,color,s.champions);
 try{moveWithGrounds(moved,draft,{from:m.from,to:m.to});}catch{return fail('Invalid move or King unsafe.');}
 cleanMonolithAndChampions(moved,s.monolithSquare,draft.champions,m.to);if(draft.champions[enemy]?.square===m.to)draft.champions[enemy]=null;
 draft.fen=moved.fen({forceEnpassantSquare:true});draft.pieceIds||={};const queenId=draft.pieceIds[m.from]||`piece_${Date.now()}_${Math.random()}`;delete draft.pieceIds[m.from];draft.pieceIds[m.to]=queenId;
 draft.awakenedPieces ||= [];
 draft.awakenedPieces = draft.awakenedPieces.filter(sq => sq !== m.from && sq !== m.to);
 draft.awakenedPieces.push(m.to);
 draft.awakenedPieceSquare = m.to;
 draft.awakenedByPlayer = color;
 transferAwakenedState(draft,m.from,m.to,color,!!victim);relocateDebuffs(draft,m.from,m.to);
 if(isBishop){draft.summoningCircles||=[];draft.summoningCircles.push({id:`circle_${Date.now()}_${Math.random()}`,owner:color,bishopId:queenId,square:m.from,remaining:3,createdTurn:s.turnNumber});}
 else {const captured={type:s.superPawns?.includes(m.to)?'sp':s.superKnights?.includes(m.to)?'sn':victim!.type,color:enemy} as any;
  draft.hands[color].push({id:`soul_card_${Date.now()}_${Math.random()}`,type:'soul_release',name:'Soul Release',description:`Move action: summon the captured ${captured.type==='sp'?'Super Pawn':captured.type==='sn'?'Super Knight':({p:'Pawn',n:'Knight',b:'Bishop',r:'Rook',q:'Queen'} as any)[captured.type]} onto an empty unrestricted square within the 5×5 area centered on its original Queen. Lasts five of your subsequent turns. No army or capture value. Exhausts on use.`,soul:{queenId,piece:captured}});
 }
 interruptCircles(draft,[m.to]);landGround(draft,m.to);if(!kingSafe(draft,color))return fail('The move leaves your King unsafe.');
 draft.hands[color]=draft.hands[color].filter(c=>c.id!==card.id);consumeCardAndRefill(draft,color,card,true);
 draft.lastMoveDetails={player:color,actionType:'awakening',from:m.from,to:m.to,awakeningType:card.type};draft.lastMovedPiece[color]=piece.type;draft.lastMovedSquare[color]=m.to;
 draft.awakeningAlert={player:color,cardType:card.type,cardName:card.name,effectTitle:isBishop?'Summoning Circle Created':'Soul Release Earned',effectDescription:isBishop?`Circle at ${m.from} matures after three subsequent turns of yours. Landing or Restrict interrupts it.`:'The captured piece is bound to Soul Release. Its original Queen must remain yours to summon it.',pieceSquare:m.to,timestamp:Date.now()};
 draft.historyLog.unshift({id:`log_${Date.now()}_${Math.random()}`,turn:color,turnNumber:s.turnNumber,actionType:'awakening',cardName:card.name,detail:draft.awakeningAlert.effectDescription,timestamp:Date.now(),whitePoints:s.whitePoints,blackPoints:s.blackPoints});
 Object.assign(s,draft);groundBefore.delete(s);const next=color==='w'?'b':'w';s.fen=syncFenTurn(s.fen,next,false);advanceTurnState(s,color,next);return true;
}

function executeGameAction(
  room: RoomState,
  msg: ClientMessage,
  actorColor: PlayerColor | 'spectator',
  ws?: WebSocket
) {
  const state = room.gameState;
  if (actorColor === 'spectator') return;
  const currentTurn: PlayerColor = actorColor;
  let chess = createSafeChess(state.fen);

  if (msg.type === 'resign') {
    if (state.status !== 'playing') return;
    state.status = 'resigned';
    state.winner = currentTurn === 'w' ? 'b' : 'w';
    state.winReason = `${currentTurn === 'w' ? 'White' : 'Black'} resigned.`;
    if (state.clock) { state.clock.isRunning = false; state.clock.lastTick = null; }
    return;
  }

  if (msg.type === 'restart_game') {
    const prevClock = room.gameState.clock ? { ...room.gameState.clock } : null;
    const currentExp: GameExpansionsConfig = room.gameState.expansions || room.lobbyConfig.expansions || {
      shiftedParadigm: true,
      championsOfTheMonolith: true,
    };
    room.gameState = createInitialGameState(currentExp);
    if (prevClock) {
      room.gameState.clock = {
        enabled: prevClock.enabled,
        initialMinutes: prevClock.initialMinutes,
        incrementSeconds: prevClock.incrementSeconds,
        w: prevClock.initialMinutes * 60,
        b: prevClock.initialMinutes * 60,
        lastTick: null,
        isRunning: false,
      };
    }
    return;
  }

  if (msg.type === 'update_clock_config') {
    if (!state.clock) {
      state.clock = {
        enabled: msg.enabled,
        initialMinutes: msg.initialMinutes,
        incrementSeconds: msg.incrementSeconds,
        w: msg.initialMinutes * 60,
        b: msg.initialMinutes * 60,
        lastTick: null,
        isRunning: false,
      };
    } else {
      state.clock.enabled = msg.enabled;
      state.clock.initialMinutes = msg.initialMinutes;
      state.clock.incrementSeconds = msg.incrementSeconds;
      state.clock.w = msg.initialMinutes * 60;
      state.clock.b = msg.initialMinutes * 60;
      state.clock.lastTick = null;
      state.clock.isRunning = false;
    }
    return;
  }

  if (msg.type === 'dismiss_clock_alert') {
    state.clockAlert = null;
    return;
  }

  if (msg.type === 'dismiss_pass_redraw_alert') {
    state.passRedrawAlert = null;
    return;
  }

  if (msg.type === 'dismiss_awakening_alert') {
    state.awakeningAlert = null;
    return;
  }

  if (state.status !== 'playing' || actorColor !== state.turn) {
    return;
  }

  if (msg.type === 'play_refresh') {
    if (state.jokerLocked?.[currentTurn]) {
      if (ws) sendToSocket(ws, {type:'error',message:'Refresh cannot be played during Joker Wild Surge.'});
      return;
    }
    const card = state.hands[currentTurn].find(c => c.id === msg.cardId && c.type === 'refresh');
    if (!card) return;
    // Validate before consuming; no turn, board, or countdown changes.
    const oldHand = state.hands[currentTurn];
    state.discard.push(...oldHand.filter(c => !c.isJokerWild));
    state.hands[currentTurn] = [];
    for (let i=0;i<5;i++) {
      const result=drawCard(state);
      state.deck=result.newDeck;state.discard=result.newDiscard;
      if(result.reshuffled)state.powerUps=result.powerUps;
      if(result.drawnCard)state.hands[currentTurn].push(result.drawnCard);
    }
    state.lastMoveDetails={player:currentTurn,actionType:'refresh'};
    state.historyLog.unshift({id:`log_${Date.now()}_${Math.random()}`,turn:currentTurn,
      turnNumber:state.turnNumber,actionType:'refresh',cardName:'Refresh',
      detail:`${currentTurn==='w'?'White':'Black'} played Refresh: discarded their hand and drew ${state.hands[currentTurn].length} new cards. Free action.${oldHand.some(c=>c.type==='brick')?' Discarded Brick.':''}`,
      timestamp:Date.now(),whitePoints:state.whitePoints,blackPoints:state.blackPoints});
    return;
  }

  if (msg.type === 'play_joker') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'joker');
    if (cardIdx === -1) return;

    const currentHand = state.hands[currentTurn];
    // Discard all other cards and the Joker card itself
    for (const c of currentHand) {
      if (!c.isJokerWild) {
        state.discard.push(c);
      }
    }

    // Change all cards in hand to wild
    const wildCount = 5;
    const wilds: Card[] = [];
    for (let i = 0; i < wildCount; i++) {
      wilds.push({
        id: `joker_wild_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'wild',
        name: 'Joker Wild',
        description: 'Move any piece. Vanishes on use (not sent to discard). Cannot draw until exhausted.',
        isJokerWild: true,
      });
    }

    state.hands[currentTurn] = wilds;
    state.jokerLocked[currentTurn] = true;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'joker',
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'joker',
      cardName: 'Joker Card',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} played Joker! Hand sent to discard and converted into ${wildCount} Wild cards. Card draws locked until exhausted. (Free action — Turn continues!)${currentHand.some(c=>c.type==='brick')?' Discarded Brick.':''}`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    // Does not count as turn
    return;
  }

  if (msg.type === 'play_beacon') {
    if (!state.monolithSquare) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Cannot activate Beacon: There is no Monolith on the board!' });
      return;
    }
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'beacon');
    if (cardIdx === -1) return;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    state.discard.push(cardPlayed);

    const protectedSquares = getSurroundingSquares(state.monolithSquare);

    // Beacon buff lasts 6 turns (your turn activation, opp's turn, your next turn, opp's next turn, your next next turn, and opp's next next turn)
    // Only units surrounding the Monolith receive the invulnerability buff.
    // If pieces leave the field or the Monolith changes position, they will not be invulnerable anymore.
    state.beaconEffect = {
      active: true,
      protectedSquares,
      expiresOnTurnNumber: state.turnNumber + 6,
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'beacon',
      monolithSquare: state.monolithSquare,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'beacon',
      cardName: 'Beacon Card',
      detail: `✨ ${currentTurn === 'w' ? 'White' : 'Black'} activated Beacon! Holy Sanctum protects all units surrounding the Monolith for 6 turns. (Leaving the field or moving the Monolith removes invulnerability!) (Free action — Turn continues!)`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });
    return;
  }

  if (msg.type === 'play_static') {
    if (!state.monolithSquare) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Cannot activate Static: There is no Monolith on the board!' });
      return;
    }
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'static');
    if (cardIdx === -1) return;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    state.discard.push(cardPlayed);

    // Static stun procs at the 3rd turn (your next turn when you activated the static) and lasts through the opponent's turn
    // (turn: activation, turn+1: opp 1st turn charging, turn+2: your 2nd turn PROCS stun, turn+3: opp 2nd turn STUNNED, turn+4: expires)
    state.staticEffect = {
      active: false,
      pending: true,
      casterColor: currentTurn,
      procOnTurnNumber: state.turnNumber + 2,
      expiresOnTurnNumber: state.turnNumber + 4,
      stunnedSquares: [],
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'static',
      monolithSquare: state.monolithSquare,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'static',
      cardName: 'Static Card Activated',
      detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} activated Static Card! Electrical surge is charging around the Monolith and will stun all units on the 3rd turn (your next turn) and through the opponent's turn! (Free action — Turn continues!)`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });
    return;
  }

  if (msg.type === 'play_clock') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'clock');
    if (cardIdx === -1) return;

    const blockReason = getClockBlockReason(state, currentTurn);
    if (blockReason) {
      if (ws) {
        sendToSocket(ws, {
          type: 'error',
          message: blockReason,
        });
      }
      return;
    }

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    state.discard.push(cardPlayed);

    // Revert board 2 turns (your opponent's previous move and your previous move)
    // In boardHistory: index 0 is game start. If length is 3 (turns 1 and 2 completed),
    // target index is length - 1 - 2 = 0.
    const targetIndex = state.boardHistory ? state.boardHistory.length - 1 - 2 : -1;
    if (targetIndex >= 0 && state.boardHistory && state.boardHistory[targetIndex]) {
      const targetSnapshot = state.boardHistory[targetIndex];

      if (state.grounds && targetSnapshot.grounds) {
        state.grounds.poison = structuredClone(targetSnapshot.grounds.poison);
        state.grounds.disarm = structuredClone(targetSnapshot.grounds.disarm);
        state.grounds.banished = structuredClone(targetSnapshot.grounds.banished);
      }
      const targetCircles=targetSnapshot.summoningCircles||[];
      for(const c of state.summoningCircles||[])if(!c.finished)c.interrupted=!targetCircles.some(old=>old.id===c.id&&!old.interrupted&&!old.finished);
      const oldSouls=state.soulSummons||[];
      state.soulSummons=oldSouls.filter(t=>targetSnapshot.soulSummons?.some(old=>old.id===t.id));
      state.fen = syncFenTurn(targetSnapshot.fen, currentTurn);
      state.monolithSquare = targetSnapshot.monolithSquare;
      state.restrictedSquares = [...targetSnapshot.restrictedSquares];
      state.captures = structuredClone(targetSnapshot.captures || { w: [], b: [] });
      state.champions = {
        w: targetSnapshot.champions.w ? { ...targetSnapshot.champions.w } : null,
        b: targetSnapshot.champions.b ? { ...targetSnapshot.champions.b } : null,
      };

      const currentIds=state.pieceIds||{};
      const pawnIds=new Set([...(state.superPawnIds||[]),...(state.superPawns||[]).map(q=>currentIds[q]).filter(Boolean)]);
      const knightIds=new Set([...(state.superKnightIds||[]),...(state.superKnights||[]).map(q=>currentIds[q]).filter(Boolean)]);
      const savedRooks=(state.awakenedRooks||[]).map(r=>({...r,id:currentIds[r.square]}));
      state.pieceIds={...(targetSnapshot.pieceIds||{})};
      const rewound=createSafeChess(state.fen);
      state.superPawns=Object.keys(state.pieceIds).filter(q=>pawnIds.has(state.pieceIds![q])&&rewound.get(q as Square)?.type==='p');
      state.superKnights=Object.keys(state.pieceIds).filter(q=>knightIds.has(state.pieceIds![q])&&rewound.get(q as Square)?.type==='n');
      state.awakenedRooks=savedRooks.flatMap(r=>{const q=Object.keys(state.pieceIds!).find(q=>state.pieceIds![q]===r.id);return q&&rewound.get(q as Square)?.type==='r'?[{square:q,color:r.color,turnsRemaining:r.turnsRemaining,hasCaptured:r.hasCaptured}]:[];});
      state.awakenedPieces=[...new Set([...state.superPawns,...state.superKnights,...state.awakenedRooks.map(r=>r.square)])];

      for(const t of targetSnapshot.soulSummons||[])if(!state.soulSummons?.some(now=>now.id===t.id))removeSoul(state,t.pieceId);
      chess = createSafeChess(state.fen);
      state.whitePoints = calculatePiecePoints(chess, 'w', state.champions, state);
      state.blackPoints = calculatePiecePoints(chess, 'b', state.champions, state);

      // Truncate board history to the reverted snapshot
      state.boardHistory = state.boardHistory.slice(0, targetIndex + 1);
      state.turnNumber = Math.max(1, state.turnNumber - 2);
      state.awakenedPieceSquare = null;
      state.awakenedByPlayer = null;
      state.awakenedOnTurnNumber = null;
      state.awakeningAlert = null;
    }

    state.clockAlert = {
      player: currentTurn,
      message: `⏰ TIME REVERSED! ${currentTurn === 'w' ? 'White' : 'Black'} activated the Clock! Reverted 2 turns (opponent's previous move and your previous move).`,
      timestamp: Date.now(),
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'clock',
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'clock',
      cardName: 'Activate the Clock',
      detail: `⏳ ${currentTurn === 'w' ? 'White' : 'Black'} activated the Clock! Reverted 2 turns (opponent's previous move and your previous move). (Free action — Turn continues!)`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });
    return;
  }

  // === THE AWAKENING EXPANSION HANDLERS ===
  if (msg.type === 'play_awakening_pawn') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'awakening_pawn');
    if (cardIdx === -1) return;

    const piece = chess.get(msg.targetSquare as Square);
    if (!piece || piece.color !== currentTurn || piece.type !== 'p') {
      if (ws) sendToSocket(ws, { type: 'error', message: 'You must select one of your Pawns to awaken into a Super Pawn!' });
      return;
    }

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed, true); // EXHAUSTED: will not reshuffle

    if (!state.superPawns) state.superPawns = [];
    if (!state.superPawns.includes(msg.targetSquare)) {
      state.superPawns.push(msg.targetSquare);
    }
    if (!state.awakenedPieces) state.awakenedPieces = [];
    if (!state.awakenedPieces.includes(msg.targetSquare)) {
      state.awakenedPieces.push(msg.targetSquare);
    }
    state.awakenedPieceSquare = msg.targetSquare;
    state.awakenedByPlayer = currentTurn;
    state.awakenedOnTurnNumber = state.turnNumber;

    state.awakeningAlert = {
      player: currentTurn,
      cardType: 'awakening_pawn',
      cardName: 'Awakening: Pawn',
      effectTitle: 'Super Pawn Awakened!',
      effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'} permanently upgraded a pawn on ${msg.targetSquare} into a Super Pawn! Super Pawns can now also capture pieces directly in front of them.`,
      pieceSquare: msg.targetSquare,
      timestamp: Date.now(),
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'awakening',
      from: msg.targetSquare,
      to: msg.targetSquare,
      awakeningType: 'awakening_pawn',
      awakeningDetails: `Pawn on ${msg.targetSquare} upgraded to Super Pawn`,
    };

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn, true);
    state.lastMovedPiece[currentTurn] = 'p';
    state.lastMovedSquare[currentTurn] = msg.targetSquare;
    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'awakening',
      cardName: 'Awakening: Pawn',
      detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} awoke Super Pawn on ${msg.targetSquare}! [Card Exhausted]`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_awakening_rook') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'awakening_rook');
    if (cardIdx === -1) return;

    const piece = chess.get(msg.from as Square);
    if (!piece || piece.color !== currentTurn || piece.type !== 'r') {
      if (ws) sendToSocket(ws, { type: 'error', message: 'You must select one of your Rooks to awaken!' });
      return;
    }

    const otherPlayer = currentTurn === 'w' ? 'b' : 'w';
    const validMoves = getLegalMovesForPiece(
      msg.from as Square,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.staticEffect?.stunnedSquares || [],
      state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [],
      state.champions ? state.champions[currentTurn]?.square || null : null,
      state.champions ? state.champions[otherPlayer] : null,
      state.champions,
      state.awakenedRooks || [],
      state.superPawns || [],
      state.superKnights || [],
      state.awakenedPieces || [], state.grounds
    );

    if (!validMoves.includes(msg.to)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid destination for Rook move!' });
      return;
    }

    // Execute move
    const capturedPiece = chess.get(msg.to as Square);
    const capturedChamp = Boolean(state.champions && state.champions[otherPlayer]?.square === msg.to);
    let earnedCapturePoints = (capturedPiece ? getPieceCapturePoints(capturedPiece.type) : 0) + (capturedChamp ? 5 : 0);
    const didCapture = Boolean(capturedPiece) || capturedChamp;
    const boardWithMonolith = createBoardWithMonolith(state.fen, state.monolithSquare, currentTurn, state.champions);

    let moveResult: any = null;
    try {
      moveResult = moveWithGrounds(boardWithMonolith, state, { from: msg.from as Square, to: msg.to as Square });
    } catch (e) {
      return;
    }
    if (!moveResult) return;

    cleanMonolithAndChampions(boardWithMonolith, state.monolithSquare, state.champions, msg.to);
    chess = boardWithMonolith;
    if (capturedChamp && state.champions) state.champions[otherPlayer] = null;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed, true); // EXHAUSTED

    if (!state.awakenedRooks) state.awakenedRooks = [];
    state.awakenedRooks = state.awakenedRooks.filter((r) => r.square !== msg.from);
    state.awakenedRooks.push({
      square: msg.to,
      color: currentTurn,
      turnsRemaining: 5,
      hasCaptured: didCapture,
    });
    if (!state.awakenedPieces) state.awakenedPieces = [];
    state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== msg.from);
    if (!state.awakenedPieces.includes(msg.to)) {
      state.awakenedPieces.push(msg.to);
    }
    state.awakenedPieceSquare = msg.to;
    state.awakenedByPlayer = currentTurn;
    state.awakenedOnTurnNumber = state.turnNumber;

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn, true);
    state.lastMovedPiece[currentTurn] = 'r';
    state.lastMovedSquare[currentTurn] = msg.to;

    state.awakeningAlert = {
      player: currentTurn,
      cardType: 'awakening_rook',
      cardName: 'Awakening: Rook',
      effectTitle: 'Shielded Rook Awakened!',
      effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'} moved Rook to ${msg.to}. It is uncapturable for 5 turns and can only capture once while awakened!`,
      pieceSquare: msg.to,
      timestamp: Date.now(),
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'awakening',
      from: msg.from,
      to: msg.to,
      awakeningType: 'awakening_rook',
      awakeningDetails: `Rook moved to ${msg.to} (5 turns invulnerable)`,
    };

    // Capture-Based Tactical Power-Up Refresh
    const { refreshed } = awardCaptureRefresh(state, currentTurn, earnedCapturePoints);
    let refreshDetail = '';
    if (refreshed.length > 0) {
      refreshDetail = ` | ⚡ Refreshed: ${refreshed.map((r) => `${r.name} (now x${r.newCount})`).join(', ')}`;
      for (const r of refreshed) {
        state.historyLog.unshift({
          id: `log_${Date.now()}_refresh_${Math.random()}`,
          turn: currentTurn,
          turnNumber: state.turnNumber,
          actionType: 'powerup_refresh',
          cardName: 'Tactical Power-Up Refresh',
          detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} refreshed ${r.name} (+1 stack, now x${r.newCount})!`,
          timestamp: Date.now(),
          whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
          blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
        });
      }
    }

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'awakening',
      cardName: 'Awakening: Rook',
      detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} awoke Rook on ${msg.to}! Shielded for 5 turns. [Card Exhausted]${refreshDetail}`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_awakening_knight') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'awakening_knight');
    if (cardIdx === -1) return;

    const fromSquare = (msg as any).targetSquare || msg.from;
    const piece = chess.get(fromSquare as Square);
    if (!piece || piece.color !== currentTurn || piece.type !== 'n') {
      if (ws) sendToSocket(ws, { type: 'error', message: 'You must select one of your Knights to awaken!' });
      return;
    }

    if ((!msg.to || msg.to === fromSquare) && msg.secondTo) return;

    // Case 1: In-place transformation without moving
    if (!msg.to || msg.to === fromSquare) {
      if (!state.superKnights) state.superKnights = [];
      const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
      consumeCardAndRefill(state, currentTurn, cardPlayed, true);
      if (!state.superKnights.includes(fromSquare)) {
        state.superKnights.push(fromSquare);
      }
      state.awakenedPieceSquare = fromSquare;
      state.awakenedByPlayer = currentTurn;
      state.awakenedOnTurnNumber = state.turnNumber;

      state.awakeningAlert = {
        player: currentTurn,
        cardType: 'awakening_knight',
        cardName: 'Awakening: Knight',
        effectTitle: 'Super Knight Awakened!',
        effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'} transformed Knight on ${fromSquare} into a Super Knight! It can move twice in a turn.`,
        pieceSquare: fromSquare,
        timestamp: Date.now(),
      };

      state.lastMoveDetails = {
        player: currentTurn,
        actionType: 'awakening',
        from: fromSquare,
        to: fromSquare,
        awakeningType: 'awakening_knight',
        awakeningDetails: `Knight on ${fromSquare} upgraded to Super Knight`,
      };

      const nextTurn = currentTurn === 'w' ? 'b' : 'w';
      state.fen = syncFenTurn(state.fen, nextTurn);
      state.lastMovedPiece[currentTurn] = 'n';
      state.lastMovedSquare[currentTurn] = fromSquare;

      state.historyLog.unshift({
        id: `log_${Date.now()}_${Math.random()}`,
        turn: currentTurn,
        turnNumber: state.turnNumber,
        actionType: 'awakening',
        cardName: 'Awakening: Knight',
        detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} awoke Super Knight on ${fromSquare}! [Card Exhausted]`,
        timestamp: Date.now(),
        whitePoints: state.whitePoints,
        blackPoints: state.blackPoints,
      });

      advanceTurnState(state, currentTurn, nextTurn);
      return;
    }

    // Case 2: Leaping move with optional double move
    const otherPlayer = currentTurn === 'w' ? 'b' : 'w';
    const validMoves1 = getLegalMovesForPiece(
      fromSquare as Square,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.staticEffect?.stunnedSquares || [],
      state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [],
      state.champions ? state.champions[currentTurn]?.square || null : null,
      state.champions ? state.champions[otherPlayer] : null,
      state.champions,
      state.awakenedRooks || [],
      state.superPawns || [],
      state.superKnights || [],
      state.awakenedPieces || [], state.grounds
    );

    if (!validMoves1.includes(msg.to)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid destination for Knight move!' });
      return;
    }

    const move1Piece = chess.get(msg.to as Square);
    const move1Champ = Boolean(state.champions && state.champions[otherPlayer]?.square === msg.to);
    let earnedCapturePoints = (move1Piece ? getPieceCapturePoints(move1Piece.type) : 0) + (move1Champ ? 5 : 0);
    const move1Captured = Boolean(move1Piece) || move1Champ;
    // Execute Move 1
    const boardWithMonolith = createBoardWithMonolith(state.fen, state.monolithSquare, currentTurn, state.champions);
    try {
      moveWithGrounds(boardWithMonolith, state, { from: fromSquare as Square, to: msg.to as Square });
    } catch (e) {
      return;
    }
    cleanMonolithAndChampions(boardWithMonolith, state.monolithSquare, state.champions, msg.to);
    chess = boardWithMonolith;
    let finalSquare = msg.to;
    let usedDoubleMove = false;
    let secondChampionCaptured = false;
    if (msg.secondTo) {
      const second = prepareKnightSecondMove(state, chess, currentTurn, msg.to, msg.secondTo, move1Captured, move1Champ);
      if (!second) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid second Knight jump. Only one capture is allowed across both moves.' });
        return;
      }
      chess = second.board;
      finalSquare = msg.secondTo;
      usedDoubleMove = true;
      secondChampionCaptured = second.capturedChampion;
      earnedCapturePoints += (second.capturedPiece ? getPieceCapturePoints(second.capturedPiece.type) : 0) + (second.capturedChampion ? 5 : 0);
    }
    // Commit only after the complete pair of jumps succeeds.
    if ((move1Champ || secondChampionCaptured) && state.champions) state.champions[otherPlayer] = null;
    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed, true);
    if (!state.superKnights) state.superKnights = [];

    state.superKnights = state.superKnights.filter((sq) => sq !== fromSquare && sq !== msg.to && sq !== finalSquare);

    if (usedDoubleMove) {
      // Reverted to normal knight!
      if (state.awakenedPieces) {
        state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== fromSquare && sq !== msg.to && sq !== finalSquare);
      }
      state.awakenedPieceSquare = finalSquare;
      state.awakeningAlert = {
        player: currentTurn,
        cardType: 'awakening_knight',
        cardName: 'Awakening: Knight',
        effectTitle: 'Super Knight Double Move!',
        effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'} executed a Double Move with Super Knight to ${finalSquare}, reverting it to a normal Knight!`,
        pieceSquare: finalSquare,
        timestamp: Date.now(),
      };
    } else {
      // Retains Super Knight status!
      state.superKnights.push(finalSquare);
      if (!state.awakenedPieces) state.awakenedPieces = [];
      state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== fromSquare && sq !== msg.to && sq !== finalSquare);
      state.awakenedPieces.push(finalSquare);
      state.awakenedPieceSquare = finalSquare;
      state.awakeningAlert = {
        player: currentTurn,
        cardType: 'awakening_knight',
        cardName: 'Awakening: Knight',
        effectTitle: 'Super Knight Awakened!',
        effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'} upgraded Knight on ${finalSquare} into a Super Knight! It can move twice in a turn.`,
        pieceSquare: finalSquare,
        timestamp: Date.now(),
      };
    }

    state.awakenedByPlayer = currentTurn;
    state.awakenedOnTurnNumber = state.turnNumber;

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn, true);
    state.lastMovedPiece[currentTurn] = 'n';
    state.lastMovedSquare[currentTurn] = finalSquare;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'awakening',
      from: fromSquare,
      to: finalSquare,
      intermediateSquare: usedDoubleMove ? msg.to : undefined,
      firstTo: usedDoubleMove ? msg.to : undefined,
      awakeningType: 'awakening_knight',
      awakeningDetails: usedDoubleMove ? `Double move to ${finalSquare}` : `Upgraded to Super Knight on ${finalSquare}`,
    };

    // Capture-Based Tactical Power-Up Refresh
    const { refreshed } = awardCaptureRefresh(state, currentTurn, earnedCapturePoints);
    let refreshDetail = '';
    if (refreshed.length > 0) {
      refreshDetail = ` | ⚡ Refreshed: ${refreshed.map((r) => `${r.name} (now x${r.newCount})`).join(', ')}`;
      for (const r of refreshed) {
        state.historyLog.unshift({
          id: `log_${Date.now()}_refresh_${Math.random()}`,
          turn: currentTurn,
          turnNumber: state.turnNumber,
          actionType: 'powerup_refresh',
          cardName: 'Tactical Power-Up Refresh',
          detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} refreshed ${r.name} (+1 stack, now x${r.newCount})!`,
          timestamp: Date.now(),
          whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
          blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
        });
      }
    }

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'awakening',
      cardName: 'Awakening: Knight',
      detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} awoke Knight to ${finalSquare}${usedDoubleMove ? ' (Double Move - Reverted)' : ' (Super Knight)'}! [Card Exhausted]${refreshDetail}`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (executeSummoningAction(room,msg,currentTurn,ws)) return;

  if (msg.type === 'play_awakening_king') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'awakening_king');
    if (cardIdx === -1) return;

    // Verification: King MUST be in check!
    const beaconSquares = state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [];
    const inCheck = isKingChecked(chess, currentTurn, state.monolithSquare, state.champions, beaconSquares, state.grounds);
    if (!inCheck) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Awakening: King can only be activated when your King is in Check!' });
      return;
    }

    const piece = chess.get(msg.from as Square);
    if (!piece || piece.color !== currentTurn || piece.type !== 'k') {
      if (ws) sendToSocket(ws, { type: 'error', message: 'You must select your King!' });
      return;
    }

    const otherPlayer = currentTurn === 'w' ? 'b' : 'w';
    const validQueenMoves = groundMoves(state,msg.from) ?? getQueenMovesForKing(
      msg.from as Square,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.champions,
      beaconSquares,
      state.awakenedRooks || []
    );

    if (!validQueenMoves.includes(msg.to)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid Queen-style move for King!' });
      return;
    }

    const capturesChampion = Boolean(state.champions && state.champions[otherPlayer]?.square === msg.to);
    const testChess = createSafeChess(chess.fen());
    testChess.remove(msg.from as Square);
    testChess.remove(msg.to as Square);
    testChess.put({ type: 'k', color: currentTurn }, msg.to as Square);
    const testChampions = state.champions ? { ...state.champions, [otherPlayer]: capturesChampion ? null : state.champions[otherPlayer] } : null;
    if (isKingChecked(testChess, currentTurn, state.monolithSquare, testChampions, beaconSquares, state.grounds)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Awakening King move must resolve the check.' });
      return;
    }

    // Commit only after the complete move has been validated.
    chess = testChess;
    if (capturesChampion && state.champions) state.champions[otherPlayer] = null;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed, true); // EXHAUSTED

    if (!state.awakenedPieces) state.awakenedPieces = [];
    state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== msg.from);
    if (!state.awakenedPieces.includes(msg.to)) {
      state.awakenedPieces.push(msg.to);
    }
    state.awakenedPieceSquare = msg.to;
    state.awakenedByPlayer = currentTurn;
    state.awakenedOnTurnNumber = state.turnNumber;
    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn, true);
    state.lastMovedPiece[currentTurn] = 'k';
    state.lastMovedSquare[currentTurn] = msg.to;

    state.awakeningAlert = {
      player: currentTurn,
      cardType: 'awakening_king',
      cardName: 'Awakening: King',
      effectTitle: 'Ascended King Moves Like a Queen!',
      effectDescription: `${currentTurn === 'w' ? 'White' : 'Black'}'s checked King broke free with Queen-like powers and moved to ${msg.to}!`,
      pieceSquare: msg.to,
      timestamp: Date.now(),
    };

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'awakening',
      from: msg.from,
      to: msg.to,
      awakeningType: 'awakening_king',
      awakeningDetails: `Checked King moved like a Queen to ${msg.to}`,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'awakening',
      cardName: 'Awakening: King',
      detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} awoke King! Moved like a Queen to ${msg.to}! [Card Exhausted]`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_awakening_as_wild') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type.startsWith('awakening_'));
    if (cardIdx === -1) return;

    const piece = chess.get(msg.from as Square);
    if (!piece || piece.color !== currentTurn) return;

    const otherPlayer = currentTurn === 'w' ? 'b' : 'w';
    const validMoves = getLegalMovesForPiece(
      msg.from as Square,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.staticEffect?.stunnedSquares || [],
      state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [],
      state.champions ? state.champions[currentTurn]?.square || null : null,
      state.champions ? state.champions[otherPlayer] : null,
      state.champions,
      state.awakenedRooks || [],
      state.superPawns || [],
      state.superKnights || [],
      state.awakenedPieces || [], state.grounds
    );

    if (!validMoves.includes(msg.to)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid move for piece!' });
      return;
    }

    const capturesChampion = Boolean(state.champions && state.champions[otherPlayer]?.square === msg.to);

    const boardWithMonolith = createBoardWithMonolith(state.fen, state.monolithSquare, currentTurn, state.champions);
    let moveResult: any = null;
    try {
      moveResult = moveWithGrounds(boardWithMonolith, state, {
        from: msg.from as Square,
        to: msg.to as Square,
        promotion: msg.promotion || 'q',
      });
    } catch (e) {
      return;
    }
    if (!moveResult) return;

    cleanMonolithAndChampions(boardWithMonolith, state.monolithSquare, state.champions, msg.to);
    chess = boardWithMonolith;
    if (capturesChampion && state.champions) state.champions[otherPlayer] = null;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed, false); // RECYCLES TO DISCARD (not exhausted)

    // Update piece tracking: preserve awakened states through wild card moves
    transferAwakenedState(
      state,
      msg.from,
      msg.to,
      currentTurn,
      Boolean(moveResult?.captured) || capturesChampion,
      Boolean(moveResult?.promotion)
    );

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn, true);
    state.lastMovedPiece[currentTurn] = piece.type==='k'?null:piece.type;
    state.lastMovedSquare[currentTurn] = msg.to;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'move',
      from: msg.from,
      to: msg.to,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'move',
      cardName: `${cardPlayed.name} (Played as Wild)`,
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} played ${cardPlayed.name} as Wild: ${msg.from}->${msg.to} (Recycled to discard)`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_champion_deploy') {
    if (state.champions && state.champions[currentTurn]) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'You already have an active Champion on the board!' });
      return;
    }
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'champion');
    if (cardIdx === -1) return;

    const otherColor = currentTurn === 'w' ? 'b' : 'w';
    const validDeploySquares = getChampionDeploySquares(
      currentTurn,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.champions ? state.champions[otherColor] : null
    );
    if (!validDeploySquares.includes(msg.targetSquare)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid deployment square on your side of the board!' });
      return;
    }

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed);

    if (!state.champions) {
      state.champions = { w: null, b: null };
    }
    const championTypes: ('berserker' | 'musketeer' | 'summoner' | 'ninja')[] = [
      'berserker',
      'musketeer',
      'summoner',
      'ninja',
    ];
    const pickedType: 'berserker' | 'musketeer' | 'summoner' | 'ninja' =
      msg.championType && championTypes.includes(msg.championType)
        ? msg.championType
        : championTypes[Math.floor(Math.random() * championTypes.length)];

    state.champions[currentTurn] = {
      type: pickedType,
      color: currentTurn,
      square: msg.targetSquare,
    };

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn);

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'champion_deploy',
      championType: pickedType,
      championSquare: msg.targetSquare,
    };

    const champName = pickedType.charAt(0).toUpperCase() + pickedType.slice(1);
    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'champion_deploy',
      cardName: 'Champion Deployed',
      detail: `⚔️ ${currentTurn === 'w' ? 'White' : 'Black'} deployed Champion ${champName} at ${msg.targetSquare}!`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_champion_move') {
    const champ = state.champions ? state.champions[currentTurn] : null;
    if (!champ || champ.square !== msg.from) return;

    const otherColor = currentTurn === 'w' ? 'b' : 'w';
    const enemyChamp = state.champions ? state.champions[otherColor] : null;
    const legalMoves = getChampionNormalMoves(
      champ,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      enemyChamp,
      state.staticEffect?.stunnedSquares || [],
      state.beaconEffect?.protectedSquares || [],
      state.awakenedRooks || [],
      state.awakenedPieces || [], state.grounds
    );
    if (!legalMoves.includes(msg.to)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Illegal champion move!' });
      return;
    }

    // Cannot capture an opponent's piece protected by Awakened Rook invulnerability
    if (isSquareProtectedAwakenedRook(chess, state, msg.to, currentTurn)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
      return;
    }

    const capturedPiece = chess.get(msg.to as Square);
    if (capturedPiece) {
      chess.remove(msg.to as Square);
      if (state.superPawns) state.superPawns = state.superPawns.filter((sq) => sq !== msg.to);
      if (state.superKnights) state.superKnights = state.superKnights.filter((sq) => sq !== msg.to);
      if (state.awakenedPieces) state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== msg.to);
      if (state.awakenedRooks) state.awakenedRooks = state.awakenedRooks.filter((ar) => ar.square !== msg.to);
    }
    let capturedEnemyChamp = false;
    if (enemyChamp && enemyChamp.square === msg.to) {
      if (state.champions) state.champions[otherColor] = null;
      capturedEnemyChamp = true;
    }

    // Beacon buff follows champion when it moves
    updateBeaconPieceSquare(state.beaconEffect, msg.from, msg.to);

    champ.square = msg.to;
    consumeCardAndRefill(state, currentTurn, null);

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn);

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'champion_move',
      from: msg.from,
      to: msg.to,
      championType: champ.type,
    };

    const champName = champ.type.charAt(0).toUpperCase() + champ.type.slice(1);

    // Capture-Based Tactical Power-Up Refresh
    let earnedCapturePoints = 0;
    if (capturedPiece) {
      earnedCapturePoints += getPieceCapturePoints(capturedPiece.type);
    }
    if (capturedEnemyChamp) {
      earnedCapturePoints += 5;
    }

    const { refreshed } = awardCaptureRefresh(state, currentTurn, earnedCapturePoints);
    let refreshDetail = '';
    if (refreshed.length > 0) {
      refreshDetail = ` | ⚡ Refreshed: ${refreshed.map((r) => `${r.name} (now x${r.newCount})`).join(', ')}`;
      for (const r of refreshed) {
        state.historyLog.unshift({
          id: `log_${Date.now()}_refresh_${Math.random()}`,
          turn: currentTurn,
          turnNumber: state.turnNumber,
          actionType: 'powerup_refresh',
          cardName: 'Tactical Power-Up Refresh',
          detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} refreshed ${r.name} (+1 stack, now x${r.newCount})!`,
          timestamp: Date.now(),
          whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
          blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
        });
      }
    }

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'champion_move',
      cardName: `${champName} Move`,
      detail: `⚔️ ${currentTurn === 'w' ? 'White' : 'Black'}'s ${champName} moved to ${msg.to}${capturedPiece ? ` (Captured ${capturedPiece.type.toUpperCase()})` : ''}${capturedEnemyChamp ? ' (Defeated enemy Champion!)' : ''}.${refreshDetail}`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    const evalRes = evaluateGameEnd(chess, state);
    state.status = evalRes.status;
    state.winner = evalRes.winner;
    state.winReason = evalRes.winReason;
    state.whitePoints = evalRes.whitePoints;
    state.blackPoints = evalRes.blackPoints;

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_champion_ultimate') {
    const champ = state.champions ? state.champions[currentTurn] : null;
    if (!champ) return;
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'champion');
    if (cardIdx === -1) return;

    const otherColor = currentTurn === 'w' ? 'b' : 'w';
    const enemyChamp = state.champions ? state.champions[otherColor] : null;
    const champName = champ.type.charAt(0).toUpperCase() + champ.type.slice(1);
    let ultimateDetail = '';
    let earnedCapturePoints = 0;

    if (champ.type === 'berserker') {
      if (!msg.targetSquare) return;
      const validMoves = getBerserkerUltimateMoves(
        champ,
        chess,
        state.restrictedSquares,
        state.monolithSquare,
        enemyChamp,
        state.beaconEffect?.protectedSquares || [],
        state.awakenedRooks || [],
        state.awakenedPieces || []
      );
      if (!validMoves.includes(msg.targetSquare)) return;

      // Cannot capture piece protected by Awakened Rook invulnerability
      if (isSquareProtectedAwakenedRook(chess, state, msg.targetSquare, currentTurn)) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
        return;
      }

      const capturedPiece = chess.get(msg.targetSquare as Square);
      if (capturedPiece) {
        earnedCapturePoints += getPieceCapturePoints(capturedPiece.type);
        chess.remove(msg.targetSquare as Square);
        if (state.superPawns) state.superPawns = state.superPawns.filter((sq) => sq !== msg.targetSquare);
        if (state.superKnights) state.superKnights = state.superKnights.filter((sq) => sq !== msg.targetSquare);
        if (state.awakenedPieces) state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== msg.targetSquare);
        if (state.awakenedRooks) state.awakenedRooks = state.awakenedRooks.filter((ar) => ar.square !== msg.targetSquare);
      }
      if (enemyChamp && enemyChamp.square === msg.targetSquare && state.champions) {
        earnedCapturePoints += 5;
        state.champions[otherColor] = null;
      }
      updateBeaconPieceSquare(state.beaconEffect, champ.square, msg.targetSquare);
      champ.square = msg.targetSquare;
      ultimateDetail = `Berserker swept across the board like a Queen to ${msg.targetSquare}${capturedPiece ? ` (Captured ${capturedPiece.type.toUpperCase()})` : ''}!`;
    } else if (champ.type === 'musketeer') {
      if (!msg.targetSquare) return;
      const validTargets = getMusketeerSnipeTargets(
        champ,
        chess,
        state.monolithSquare,
        enemyChamp,
        state.beaconEffect?.protectedSquares || [],
        state.awakenedRooks || [],
        state.awakenedPieces || []
      );
      if (!validTargets.includes(msg.targetSquare)) return;

      // Cannot snipe piece protected by Awakened Rook invulnerability
      if (isSquareProtectedAwakenedRook(chess, state, msg.targetSquare, currentTurn)) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
        return;
      }

      const capturedPiece = chess.get(msg.targetSquare as Square);
      if (capturedPiece) {
        earnedCapturePoints += getPieceCapturePoints(capturedPiece.type);
        chess.remove(msg.targetSquare as Square);
        if (state.superPawns) state.superPawns = state.superPawns.filter((sq) => sq !== msg.targetSquare);
        if (state.superKnights) state.superKnights = state.superKnights.filter((sq) => sq !== msg.targetSquare);
        if (state.awakenedPieces) state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== msg.targetSquare);
        if (state.awakenedRooks) state.awakenedRooks = state.awakenedRooks.filter((ar) => ar.square !== msg.targetSquare);
      }
      if (enemyChamp && enemyChamp.square === msg.targetSquare && state.champions) {
        earnedCapturePoints += 5;
        state.champions[otherColor] = null;
      }
      state.championMarks = [{ square: msg.targetSquare, mark: 'target' }];
      ultimateDetail = `Musketeer sniped target at ${msg.targetSquare} from range without moving!`;
    } else if (champ.type === 'summoner') {
      if (!msg.targetFriendlySquare || !msg.targetSquare) return;
      const friendlyPiece = chess.get(msg.targetFriendlySquare as Square);
      if (!friendlyPiece || friendlyPiece.color !== currentTurn) return;

      const validPlacement = getSummonerPlacementSquares(
        champ.square,
        currentTurn,
        chess,
        state.restrictedSquares,
        state.monolithSquare,
        enemyChamp,
        state.beaconEffect?.protectedSquares || [],
        state.awakenedRooks || [],
        state.awakenedPieces || []
      );
      if (!validPlacement.includes(msg.targetSquare)) return;

      // Cannot capture piece protected by Awakened Rook invulnerability
      if (isSquareProtectedAwakenedRook(chess, state, msg.targetSquare, currentTurn)) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
        return;
      }

      const opponentPiece = chess.get(msg.targetSquare as Square);
      if (opponentPiece) {
        earnedCapturePoints += getPieceCapturePoints(opponentPiece.type);
        chess.remove(msg.targetSquare as Square);
      }
      if (enemyChamp && enemyChamp.square === msg.targetSquare && state.champions) {
        earnedCapturePoints += 5;
        state.champions[otherColor] = null;
      }

      chess.remove(msg.targetFriendlySquare as Square);
      chess.put(friendlyPiece, msg.targetSquare as Square);
      updateBeaconPieceSquare(state.beaconEffect, msg.targetFriendlySquare, msg.targetSquare);
      ensureEdgePawnsPromoted(chess);

      // Check if summoned pawn reaches backline to promote
      const reachesBackline = (friendlyPiece.type === 'p') && ((currentTurn === 'w' && msg.targetSquare[1] === '8') || (currentTurn === 'b' && msg.targetSquare[1] === '1'));

      // Preserve and transfer Awakened States for the summoned friendly piece!
      const wasSuperPawn = Boolean(state.superPawns?.includes(msg.targetFriendlySquare));
      const wasSuperKnight = Boolean(state.superKnights?.includes(msg.targetFriendlySquare));
      transferAwakenedState(
        state,
        msg.targetFriendlySquare,
        msg.targetSquare,
        currentTurn,
        Boolean(opponentPiece) || Boolean(enemyChamp && enemyChamp.square === msg.targetSquare),
        reachesBackline
      );

      ultimateDetail = `Summoner summoned & teleported friendly ${friendlyPiece.type.toUpperCase()}${wasSuperPawn ? ' (Super Pawn)' : wasSuperKnight ? ' (Super Knight)' : ''} from ${msg.targetFriendlySquare} beside him to ${msg.targetSquare}${opponentPiece ? ' (Captured opponent piece!)' : ''}!`;
    } else if (champ.type === 'ninja') {
      const targets = msg.targetSquares || (msg.targetSquare ? [msg.targetSquare] : []);
      if (targets.length === 0 || targets.length > 2) return;

      const validAdjacent = getNinjaAdjacentEnemyPieces(
        champ.square,
        currentTurn,
        chess,
        enemyChamp,
        state.beaconEffect?.protectedSquares || [],
        state.awakenedRooks || [],
        state.awakenedPieces || []
      );
      for (const t of targets) {
        if (!validAdjacent.includes(t)) return;
      }

      // Cannot assassinate piece protected by Awakened Rook invulnerability
      for (const t of targets) {
        if (isSquareProtectedAwakenedRook(chess, state, t, currentTurn)) {
          if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
          return;
        }
      }

      for (const t of targets) {
        const piece = chess.get(t as Square);
        if (piece) {
          earnedCapturePoints += getPieceCapturePoints(piece.type);
          chess.remove(t as Square);
          if (state.superPawns) state.superPawns = state.superPawns.filter((sq) => sq !== t);
          if (state.superKnights) state.superKnights = state.superKnights.filter((sq) => sq !== t);
          if (state.awakenedPieces) state.awakenedPieces = state.awakenedPieces.filter((sq) => sq !== t);
          if (state.awakenedRooks) state.awakenedRooks = state.awakenedRooks.filter((ar) => ar.square !== t);
        }
        if (enemyChamp && enemyChamp.square === t && state.champions) {
          earnedCapturePoints += 5;
          state.champions[otherColor] = null;
        }
      }
      state.championMarks = targets.map((sq) => ({ square: sq, mark: 'katana' }));
      ultimateDetail = `Ninja assassinated ${targets.length} surrounding enemy target(s) at [${targets.join(', ')}] without moving!`;
    }

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed);

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn);

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'champion_ultimate',
      championType: champ.type,
      ultimateDetails: ultimateDetail,
      musketeerSnipedSquare: champ.type === 'musketeer' ? msg.targetSquare : null,
      ninjaAssassinatedSquares: champ.type === 'ninja' ? (msg.targetSquares || (msg.targetSquare ? [msg.targetSquare] : [])) : null,
    };

    // Capture-Based Tactical Power-Up Refresh
    const { refreshed } = awardCaptureRefresh(state, currentTurn, earnedCapturePoints);
    let refreshDetail = '';
    if (refreshed.length > 0) {
      refreshDetail = ` | ⚡ Refreshed: ${refreshed.map((r) => `${r.name} (now x${r.newCount})`).join(', ')}`;
      for (const r of refreshed) {
        state.historyLog.unshift({
          id: `log_${Date.now()}_refresh_${Math.random()}`,
          turn: currentTurn,
          turnNumber: state.turnNumber,
          actionType: 'powerup_refresh',
          cardName: 'Tactical Power-Up Refresh',
          detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} refreshed ${r.name} (+1 stack, now x${r.newCount})!`,
          timestamp: Date.now(),
          whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
          blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
        });
      }
    }

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'champion_ultimate',
      cardName: `${champName} Ultimate`,
      detail: `💥 ${currentTurn === 'w' ? 'White' : 'Black'} triggered ${champName}'s Ultimate: ${ultimateDetail}${refreshDetail}`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    const evalRes = evaluateGameEnd(chess, state);
    state.status = evalRes.status;
    state.winner = evalRes.winner;
    state.winReason = evalRes.winReason;
    state.whitePoints = evalRes.whitePoints;
    state.blackPoints = evalRes.blackPoints;

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  // Joker Wilds must be played before any optional card draw or redraw.
  if (state.jokerLocked?.[currentTurn] && ['discard_redraw', 'start_powerup_draw', 'use_powerup_draw'].includes(msg.type)) {
    if (ws) sendToSocket(ws, { type: 'error', message: 'Play all Joker Wild cards before drawing or redrawing.' });
    return;
  }

  if (msg.type === 'discard_redraw') {
    // "Instead of Passing the Turn, you can discard up to 5 cards and redraw the same number and it counts as a move."
    const toDiscardIds = Array.isArray(msg.cardIds) ? msg.cardIds : [];
    if (toDiscardIds.length === 0 || toDiscardIds.length > 5) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Select at least 1 card to discard and redraw' });
      return;
    }

    const hand = state.hands[currentTurn];
    if (new Set(toDiscardIds).size !== toDiscardIds.length ||
        toDiscardIds.some((id: string) => !hand.some(c => c.id === id))) {
      if (ws) sendToSocket(ws, {type:'error',message:'Choose unique cards that exist in your hand.'});
      return;
    }
    const keptHand: Card[] = [];
    const discardedCards: Card[] = [];

    for (const c of hand) {
      if (toDiscardIds.includes(c.id)) {
        discardedCards.push(c);
        // Only non-joker-wild cards go to the shared discard pile
        if (!c.isJokerWild) {
          state.discard.push(c);
        }
      } else {
        keptHand.push(c);
      }
    }

    // Redraw the exact same number of cards from deck
    const redrawCount = discardedCards.length;
    for (let i = 0; i < redrawCount; i++) {
      const drawRes = drawCard(state);
      if (drawRes.drawnCard) {
        keptHand.push(drawRes.drawnCard);
      }
      state.deck = drawRes.newDeck;
      state.discard = drawRes.newDiscard;
      if (drawRes.reshuffled) {
        state.powerUps = drawRes.powerUps;
      }
    }

    state.hands[currentTurn] = keptHand;

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(state.fen, nextTurn, false);

    const playerName = currentTurn === 'w' ? 'White' : 'Black';
    const alertMessage = `${playerName} only passed and redrew ${redrawCount} card${redrawCount > 1 ? 's' : ''} on their turn (no piece moved).`;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'redraw',
    };

    state.passRedrawAlert = {
      player: currentTurn,
      action: 'redraw',
      count: redrawCount,
      message: alertMessage,
      timestamp: Date.now(),
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'pass',
      detail: `🎴 ${playerName} only passed and redrew ${redrawCount} card${redrawCount > 1 ? 's' : ''} on their turn (no piece moved).${discardedCards.some(c=>c.type==='brick')?' Discarded Brick.':''}`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'pass_turn') {
    // "Passing is allowed if you don't have any cards to play."
    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(state.fen, nextTurn, false);

    const playerName = currentTurn === 'w' ? 'White' : 'Black';
    const alertMessage = `${playerName} passed their turn (no piece moved).`;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'pass',
    };

    state.passRedrawAlert = {
      player: currentTurn,
      action: 'pass',
      message: alertMessage,
      timestamp: Date.now(),
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'pass',
      detail: `⏭️ ${playerName} passed their turn (no piece moved).`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'use_powerup_vision') {
    const curVision = typeof state.powerUps[currentTurn].vision === 'number' ? state.powerUps[currentTurn].vision : state.powerUps[currentTurn].vision ? 1 : 0;
    if (curVision <= 0) return;
    state.powerUps[currentTurn].vision = curVision - 1;
    state.visionActive[currentTurn] = true;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'vision',
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'powerup',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} activated Vision power-up to peek at opponent's hand! (${state.powerUps[currentTurn].vision} stack(s) remaining)`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });
    return;
  }

  if (msg.type === 'start_powerup_draw' || (msg.type === 'use_powerup_draw' && !msg.discardCardIds)) {
    const curDraw = typeof state.powerUps[currentTurn].draw === 'number' ? state.powerUps[currentTurn].draw : state.powerUps[currentTurn].draw ? 1 : 0;
    if (curDraw <= 0) return;

    // Phase 1: Draw 2 fresh cards into hand first!
    state.powerUps[currentTurn].draw = curDraw - 1;
    const newlyDrawnIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const drawRes = drawCard(state);
      if (drawRes.drawnCard) {
        state.hands[currentTurn].push(drawRes.drawnCard);
        newlyDrawnIds.push(drawRes.drawnCard.id);
      }
      state.deck = drawRes.newDeck;
      state.discard = drawRes.newDiscard;
      if (drawRes.reshuffled) state.powerUps = drawRes.powerUps;
    }

    state.pendingSwapDiscard = { player: currentTurn, newCardIds: newlyDrawnIds };
    state.lastMoveDetails = { player: currentTurn, actionType: 'draw_powerup' };
    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'powerup',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} activated Exchange: drew 2 fresh cards and is choosing 2 cards to discard. (${state.powerUps[currentTurn].draw} stack(s) remaining)`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });
    return;
  }

  if (msg.type === 'use_powerup_draw' && msg.discardCardIds) {
    const discardIds = Array.isArray(msg.discardCardIds) ? msg.discardCardIds : [];
    if (discardIds.length !== 2 || new Set(discardIds).size !== 2) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Exchange requires discarding exactly 2 unique cards.' });
      return;
    }
    const hand = state.hands[currentTurn];
    const selected = discardIds.map((id: string) => hand.find((c) => c.id === id));
    if (selected.some((c) => !c)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Every discard card must exist in your hand.' });
      return;
    }

    if (state.pendingSwapDiscard && state.pendingSwapDiscard.player === currentTurn) {
      // Phase 2: Discard the 2 selected cards (can be any in hand, including newly drawn)
      const selectedIds = new Set(discardIds);
      state.hands[currentTurn] = hand.filter((c) => !selectedIds.has(c.id));
      for (const c of selected as Card[]) {
        if (!c.isJokerWild) state.discard.push(c);
      }
      state.pendingSwapDiscard = null;
      state.lastMoveDetails = { player: currentTurn, actionType: 'draw_powerup' };
      state.historyLog.unshift({
        id: `log_${Date.now()}_${Math.random()}`,
        turn: currentTurn,
        turnNumber: state.turnNumber,
        actionType: 'powerup',
        detail: `${currentTurn === 'w' ? 'White' : 'Black'} completed Exchange: discarded 2 cards.${selected.some(c=>c?.type==='brick')?' Discarded Brick.':''}`,
        timestamp: Date.now(),
        whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
        blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
      });
      return;
    } else {
      // Fallback for direct discard invocation
      const curDraw = typeof state.powerUps[currentTurn].draw === 'number' ? state.powerUps[currentTurn].draw : state.powerUps[currentTurn].draw ? 1 : 0;
      if (curDraw <= 0) return;
      state.powerUps[currentTurn].draw = curDraw - 1;
      const selectedIds = new Set(discardIds);
      state.hands[currentTurn] = hand.filter((c) => !selectedIds.has(c.id));
      for (const c of selected as Card[]) {
        if (!c.isJokerWild) state.discard.push(c);
      }
      for (let i = 0; i < 2; i++) {
        const drawRes = drawCard(state);
        if (drawRes.drawnCard) state.hands[currentTurn].push(drawRes.drawnCard);
        state.deck = drawRes.newDeck;
        state.discard = drawRes.newDiscard;
        if (drawRes.reshuffled) state.powerUps = drawRes.powerUps;
      }
      state.lastMoveDetails = { player: currentTurn, actionType: 'draw_powerup' };
      state.historyLog.unshift({
        id: `log_${Date.now()}_${Math.random()}`,
        turn: currentTurn,
        turnNumber: state.turnNumber,
        actionType: 'powerup',
        detail: `${currentTurn === 'w' ? 'White' : 'Black'} used Draw power-up (redrew 2 cards). (${state.powerUps[currentTurn].draw} stack(s) remaining)${selected.some(c=>c?.type==='brick')?' Discarded Brick.':''}`,
        timestamp: Date.now(),
        whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
        blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
      });
      return;
    }
  }

  if (msg.type === 'play_monolith') {
    const isPowerUp = msg.isPowerUp || false;
    let cardPlayed: Card | null = null;

    // Check monolith rule: cannot be moved if placed or moved on previous turn
    if (
      state.monolithSquare &&
      state.monolithLastMovedTurn !== null &&
      state.monolithLastMovedTurn === state.turnNumber - 1
    ) {
      if (ws) {
        sendToSocket(ws, {
          type: 'error',
          message: 'Monolith cannot be moved: It was placed or moved on the previous turn!',
        });
      }
      return;
    }

    let monolithCardIdx = -1;
    let monolithPowerCount = 0;
    if (isPowerUp) {
      monolithPowerCount = typeof state.powerUps[currentTurn].monolith === 'number' ? state.powerUps[currentTurn].monolith : state.powerUps[currentTurn].monolith ? 1 : 0;
      if (monolithPowerCount <= 0) return;
    } else {
      if (!msg.cardId) return;
      monolithCardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'monolith');
      if (monolithCardIdx === -1) return;
    }

    // Validate the complete placement before consuming the card/power-up.
    const target = msg.targetSquare;
    if (typeof target !== 'string' || !/^[a-h][1-8]$/.test(target)) return;
    if (state.monolithSquare && target === state.monolithSquare) {
      if (ws) {
        sendToSocket(ws, {
          type: 'error',
          message: 'Cannot move the Monolith to the same square where it is currently standing!',
        });
      }
      return;
    }
    if (isSquareBlocked(target, state.restrictedSquares, null) || chess.get(target as Square) ||
        state.champions?.w?.square === target || state.champions?.b?.square === target) {
      return; // Cannot place on occupied/restricted/champion square
    }

    // Commit resource consumption only after all placement validation succeeds.
    if (isPowerUp) {
      state.powerUps[currentTurn].monolith = monolithPowerCount - 1;
    } else {
      cardPlayed = state.hands[currentTurn].splice(monolithCardIdx, 1)[0];
      consumeCardAndRefill(state, currentTurn, cardPlayed);
    }

    const prevMonolith = state.monolithSquare;
    state.monolithSquare = target;
    state.monolithLastMovedTurn = state.turnNumber;

    // If Monolith changes position, Beacon invulnerability field moves to the new position
    // (pieces left at old position lose invulnerability)
    if (state.beaconEffect?.active) {
      state.beaconEffect.protectedSquares = getSurroundingSquares(target);
    }
    if (state.staticEffect?.active) {
      state.staticEffect.stunnedSquares = getSurroundingSquares(target);
    }

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'monolith',
      monolithFrom: prevMonolith,
      monolithSquare: target,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'monolith',
      cardName: cardPlayed ? 'Monolith Card' : 'Monolith Power-up',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} ${prevMonolith ? `moved Monolith from ${prevMonolith} to ${target}` : `summoned Monolith to ${target}`}.`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(state.fen, nextTurn);
    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_restrict') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'restrict');
    if (cardIdx === -1) return;

    const target = msg.targetSquare;
    // The Restrict card can only choose empty squares (no piece, no monolith, not already restricted)
    if (
      !target ||
      chess.get(target as Square) ||
      state.monolithSquare === target ||
      state.restrictedSquares.includes(target)
    ) {
      return;
    }

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed);

    if (!state.restrictedSquares.includes(target)) {
      state.restrictedSquares.push(target);
    }

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'restrict',
      restrictedSquare: target,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'restrict',
      cardName: 'Restrict Card',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} marked square ${target} as permanently restricted!`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(state.fen, nextTurn);
    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_switch') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'switch');
    if (cardIdx === -1) return;
    if (msg.square1 === msg.square2) return;

    const p1 = chess.get(msg.square1 as Square);
    const p2 = chess.get(msg.square2 as Square);
    const isChamp1 = Boolean(state.champions && state.champions[currentTurn]?.square === msg.square1);
    const isChamp2 = Boolean(state.champions && state.champions[currentTurn]?.square === msg.square2);

    if ((!p1 && !isChamp1) || (!p2 && !isChamp2)) return;
    if (p1 && p1.color !== currentTurn) return;
    if (p2 && p2.color !== currentTurn) return;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed);

    let name1 = '';
    let name2 = '';

    if (isChamp1 && !isChamp2) {
      name1 = `Champion ${state.champions![currentTurn]!.type.toUpperCase()}`;
      name2 = p2!.type.toUpperCase();
      chess.remove(msg.square2 as Square);
      chess.put(p2!, msg.square1 as Square);
      state.champions![currentTurn]!.square = msg.square2;
      state.lastMovedPiece[currentTurn] = p2!.type;
      state.lastMovedSquare[currentTurn] = msg.square1;
    } else if (!isChamp1 && isChamp2) {
      name1 = p1!.type.toUpperCase();
      name2 = `Champion ${state.champions![currentTurn]!.type.toUpperCase()}`;
      chess.remove(msg.square1 as Square);
      chess.put(p1!, msg.square2 as Square);
      state.champions![currentTurn]!.square = msg.square1;
      state.lastMovedPiece[currentTurn] = p1!.type;
      state.lastMovedSquare[currentTurn] = msg.square2;
    } else if (isChamp1 && isChamp2) {
      name1 = `Champion ${state.champions![currentTurn]!.type.toUpperCase()}`;
      name2 = name1;
      state.champions![currentTurn]!.square = msg.square2;
    } else {
      name1 = p1!.type.toUpperCase();
      name2 = p2!.type.toUpperCase();
      chess.remove(msg.square1 as Square);
      chess.remove(msg.square2 as Square);
      chess.put(p2!, msg.square1 as Square);
      chess.put(p1!, msg.square2 as Square);
      state.lastMovedPiece[currentTurn] = p1!.type;
      state.lastMovedSquare[currentTurn] = msg.square2;
    }

    ensureEdgePawnsPromoted(chess);

    // Swap awakened states for both squares
    swapAwakenedState(state, msg.square1, msg.square2);

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn);

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'switch',
      swappedSquares: [msg.square1, msg.square2],
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'switch',
      cardName: 'Switch Card',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} swapped ${name1} at ${msg.square1} and ${name2} at ${msg.square2}.`,
      timestamp: Date.now(),
      whitePoints: state.whitePoints,
      blackPoints: state.blackPoints,
    });

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_push') {
    const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId && c.type === 'push');
    if (cardIdx === -1) return;

    const isFriendlyChamp = state.champions?.[currentTurn]?.square === msg.from;
    const piece = chess.get(msg.from as Square);
    const isFriendlyPiece = Boolean(piece && piece.color === currentTurn);
    if (!isFriendlyPiece && !isFriendlyChamp) return;

    // Champions and other pieces block Push card movement
    const validPushMoves = getPushMoves(
      msg.from,
      chess,
      state.restrictedSquares,
      state.monolithSquare,
      state.champions
    );
    if (!validPushMoves.includes(msg.to)) return;

    const cardPlayed = state.hands[currentTurn].splice(cardIdx, 1)[0];
    consumeCardAndRefill(state, currentTurn, cardPlayed);

    let pushedPieceName = '';
    if (isFriendlyChamp) {
      const champ = state.champions![currentTurn]!;
      champ.square = msg.to;
      pushedPieceName = `Champion ${champ.type.toUpperCase()}`;
    } else if (piece) {
      // Move piece on chess board (no capture, simple move)
      chess.remove(msg.from as Square);

      // Pawn Promotion check: only when reaching opponent's back rank
      const targetRank = msg.to[1];
      let isPromoted = false;
      let placedPiece = piece;
      if (piece.type === 'p') {
        const reachesOpponentBackline =
          (piece.color === 'w' && targetRank === '8') ||
          (piece.color === 'b' && targetRank === '1');
        if (reachesOpponentBackline) {
          placedPiece = { type: 'q', color: piece.color };
          isPromoted = true;
        }
      }

      chess.put(placedPiece, msg.to as Square);
      ensureEdgePawnsPromoted(chess);

      // Preserve and transfer Awakened States when piece is pushed!
      transferAwakenedState(state, msg.from, msg.to, currentTurn, false, isPromoted);

      pushedPieceName = placedPiece.type.toUpperCase() + (isPromoted ? ' (Promoted to Queen!)' : '');
    }

    updateBeaconPieceSquare(state.beaconEffect, msg.from, msg.to);

    const nextTurn = currentTurn === 'w' ? 'b' : 'w';
    state.fen = syncFenTurn(chess.fen(), nextTurn);
    if (piece) {
      state.lastMovedPiece[currentTurn] = piece.type==='k'?null:piece.type;
    }
    state.lastMovedSquare[currentTurn] = msg.to;

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'push',
      from: msg.from,
      to: msg.to,
    };

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: 'push',
      cardName: 'Push Card',
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} pushed ${pushedPieceName} from ${msg.from} to ${msg.to}.`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
    });

    // Check game end conditions
    const evalRes = evaluateGameEnd(chess, state);
    state.status = evalRes.status;
    state.winner = evalRes.winner;
    state.winReason = evalRes.winReason;
    state.whitePoints = evalRes.whitePoints;
    state.blackPoints = evalRes.blackPoints;

    advanceTurnState(state, currentTurn, nextTurn);
    return;
  }

  if (msg.type === 'play_king_move' || msg.type === 'play_card_move' || msg.type === 'use_powerup_wild_move') {
    const piece = chess.get(msg.from as Square);
    if (!piece || piece.color !== currentTurn) return;

    if ((msg as any).secondTo && (piece.type !== 'n' || !state.superKnights?.includes(msg.from))) return;

    const isKingMove = piece.type === 'k';
    let cardPlayed: Card | null = null;
    let cardIdxToRemove = -1;

    if (msg.type === 'play_king_move') {
      if (!isKingMove) return;
      // King move and castling do not require a card
    } else if (msg.type === 'use_powerup_wild_move') {
      const curWild = typeof state.powerUps[currentTurn].wild === 'number' ? state.powerUps[currentTurn].wild : state.powerUps[currentTurn].wild ? 1 : 0;
      if (curWild <= 0) return;
    } else {
      // Standard card move
      if (msg.cardId) {
        const cardIdx = state.hands[currentTurn].findIndex((c) => c.id === msg.cardId);
        if (cardIdx !== -1) {
          const candidateCard = state.hands[currentTurn][cardIdx];
          const beaconSquares = state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [];
          const inCheck = isKingChecked(chess, currentTurn, state.monolithSquare, state.champions, beaconSquares, state.grounds);
          const isAwakenedKingWild = candidateCard.type === 'awakening_king' && !inCheck;
          const asWild = Boolean((msg as any).asWild || isAwakenedKingWild);

          if (isKingMove) {
            if (isCardPermittedForPiece(candidateCard, piece.type, state.lastMovedPiece[currentTurn], asWild)) {
              cardPlayed = candidateCard;
              cardIdxToRemove = cardIdx;
            }
          } else {
            if (!isCardPermittedForPiece(candidateCard, piece.type, state.lastMovedPiece[currentTurn], asWild)) {
              return;
            }
            cardPlayed = candidateCard;
            cardIdxToRemove = cardIdx;
          }
        } else if (!isKingMove) {
          return;
        }
      } else if (!isKingMove) {
        return;
      }
    }

    // Check if piece is stunned by Static
    if (state.staticEffect?.stunnedSquares?.includes(msg.from)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'This piece is stunned by Static and cannot move!' });
      return;
    }

    // Check if target is restricted or monolith (Monolith cannot be captured)
    if (state.restrictedSquares.includes(msg.to) || state.monolithSquare === msg.to) {
      return;
    }

    // Castling check: Impossible to castle if either the king or the rook lands on the restricted tile
    if (piece.type === 'k' && isCastlingBlockedByRestrictedSquares(msg.from, msg.to, state.restrictedSquares)) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Cannot castle: King or Rook lands on a restricted tile!' });
      return;
    }

    // Cannot land on friendly champion
    if (state.champions && state.champions[currentTurn]?.square === msg.to) {
      return;
    }

    // Cannot capture piece protected by Beacon (only surrounding the Monolith receives the invulnerability buff)
    const isEnPassantAttempt = piece.type === 'p' && msg.from[0] !== msg.to[0] && !chess.get(msg.to as Square);
    const capturedTargetSquare = isEnPassantAttempt ? `${msg.to[0]}${msg.from[1]}` : msg.to;
    const isTargetBeaconProtected = Boolean(
      state.beaconEffect?.active &&
      state.monolithSquare &&
      getSurroundingSquares(state.monolithSquare).includes(capturedTargetSquare)
    );

    if (isTargetBeaconProtected && (isEnPassantAttempt || !!chess.get(msg.to as Square))) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Target piece is in the Beacon field surrounding the Monolith and is invulnerable!' });
      return;
    }

    // Cannot capture piece protected by Awakened Rook invulnerable shield
    const isTargetAwakenedRook = isSquareProtectedAwakenedRook(chess, state, capturedTargetSquare, currentTurn);
    if (isTargetAwakenedRook && (isEnPassantAttempt || !!chess.get(msg.to as Square))) {
      if (ws) sendToSocket(ws, { type: 'error', message: 'Target Rook is protected by an Invulnerable Shield!' });
      return;
    }

    // If destination has enemy champion, verify not protected by Beacon or shield
    const otherPlayerColor = currentTurn === 'w' ? 'b' : 'w';
    let defeatedEnemyChamp = false;
    if (state.champions && state.champions[otherPlayerColor]?.square === msg.to) {
      if (isTargetBeaconProtected || isTargetAwakenedRook) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Target Champion is protected by an invulnerable field!' });
        return;
      }
      defeatedEnemyChamp = true;
    }

    // If moving piece is an Awakened Rook that already captured, it CANNOT capture again while awakened
    const movingAwakenedRook = state.awakenedRooks?.find((r) => r.square === msg.from && r.turnsRemaining > 0);
    if (movingAwakenedRook?.hasCaptured) {
      if (chess.get(msg.to as Square)?.type !== 'k' && (isEnPassantAttempt || !!chess.get(msg.to as Square) || defeatedEnemyChamp)) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'This Awakened Rook has already captured once and can no longer capture while awakened!' });
        return;
      }
    }

    let moveResult: any = null;

    // Check if this is a Super Pawn forward capture!
    const isSuperPawnForwardCapture =
      piece.type === 'p' &&
      Boolean(state.superPawns?.includes(msg.from)) &&
      msg.from[0] === msg.to[0] &&
      (currentTurn === 'w' ? parseInt(msg.to[1], 10) - parseInt(msg.from[1], 10) === 1 : parseInt(msg.from[1], 10) - parseInt(msg.to[1], 10) === 1) &&
      (Boolean(chess.get(msg.to as Square)) || defeatedEnemyChamp);

    if (isSuperPawnForwardCapture) {
      chess.remove(msg.from as Square);
      chess.remove(msg.to as Square);
      const promo = (msg as any).promotion || 'q';
      const isPromotion = (currentTurn === 'w' && msg.to[1] === '8') || (currentTurn === 'b' && msg.to[1] === '1');
      chess.put({ type: isPromotion ? (promo as any) : 'p', color: currentTurn }, msg.to as Square);
      moveResult = { san: `${msg.from}x${msg.to}`, captured: 'p', promotion: isPromotion ? promo : undefined };
    } else {
      // Use board with monolith/champions so sliding enemy threats blocked by obstacles do not cause false check/rejection
      const boardWithMonolith = createBoardWithMonolith(state.fen, state.monolithSquare, currentTurn, state.champions);
      // If capturing enemy champion, add a temporary enemy piece on msg.to so chess.js validates capture for any piece
      if (defeatedEnemyChamp) {
        boardWithMonolith.put({ type: 'p', color: otherPlayerColor }, msg.to as Square);
        ((boardWithMonolith as any)._placeholderSquares = (boardWithMonolith as any)._placeholderSquares || []).push(msg.to);
      }

      try {
        moveResult = moveWithGrounds(boardWithMonolith, state, {
          from: msg.from as Square,
          to: msg.to as Square,
          promotion: (msg as any).promotion || 'q',
        });
      } catch (e) {
        return;
      }

      if (!moveResult) return;

      // Cleanly remove the temporary monolith & champion placeholders while preserving en-passant square
      cleanMonolithAndChampions(boardWithMonolith, state.monolithSquare, state.champions, msg.to);
      chess = boardWithMonolith;
    }

    if (!moveResult) return;

    const isMovingSuperKnight = piece.type === 'n' && Boolean(state.superKnights?.includes(msg.from));
    let usedSuperKnightDoubleMove = false;
    let finalMoveSquare = msg.to;
    let didSecondCapture = false;
    let secondCapturedPieceType: string | null = null;
    let secondChampionCaptured = false;
    if (isMovingSuperKnight && (msg as any).secondTo) {
      const second = prepareKnightSecondMove(state, chess, currentTurn, msg.to, (msg as any).secondTo,
        Boolean(moveResult?.captured) || defeatedEnemyChamp, defeatedEnemyChamp);
      if (!second) {
        if (ws) sendToSocket(ws, { type: 'error', message: 'Invalid second Knight jump. Only one capture is allowed across both moves.' });
        return;
      }
      chess = second.board;
      finalMoveSquare = (msg as any).secondTo;
      usedSuperKnightDoubleMove = true;
      secondChampionCaptured = second.capturedChampion;
      didSecondCapture = Boolean(second.capturedPiece) || second.capturedChampion;
      secondCapturedPieceType = second.capturedChampion ? 'champion' : second.capturedPiece?.type || null;
    }
    // Consume one first-move resource only after both requested jumps succeed.
    if (msg.type === 'use_powerup_wild_move') {
      const curWild = typeof state.powerUps[currentTurn].wild === 'number' ? state.powerUps[currentTurn].wild : state.powerUps[currentTurn].wild ? 1 : 0;
      state.powerUps[currentTurn].wild = Math.max(0, curWild - 1);
    }
    if ((defeatedEnemyChamp || secondChampionCaptured) && state.champions) state.champions[otherPlayerColor] = null;

    // Update piece tracking for Super Pawns, Super Knights, and Awakened Rooks / Awakened Pieces
    transferAwakenedState(
      state,
      msg.from,
      finalMoveSquare,
      currentTurn,
      Boolean(moveResult?.captured) || defeatedEnemyChamp || didSecondCapture,
      Boolean(moveResult?.promotion)
    );
    // If usedSuperKnightDoubleMove, reverted to normal knight!
    if (usedSuperKnightDoubleMove && state.superKnights) {
      state.superKnights = state.superKnights.filter((sq) => sq !== finalMoveSquare);
    }

    if (!moveResult) return;

    // Successfully moved! Now consume card if one was used
    if (cardIdxToRemove !== -1) {
      state.hands[currentTurn].splice(cardIdxToRemove, 1);
      consumeCardAndRefill(state, currentTurn, cardPlayed);
    }

    ensureEdgePawnsPromoted(chess);
    const nextTurn = currentTurn === 'w' ? 'b' : 'w';

    // Track pawn double-push to allow standard En Passant on next turn
    const isPawnDoublePush = piece.type === 'p' && Math.abs(parseInt(msg.from[1], 10) - parseInt(msg.to[1], 10)) === 2;
    const epTargetSquare = isPawnDoublePush
      ? `${msg.from[0]}${(parseInt(msg.from[1], 10) + parseInt(msg.to[1], 10)) / 2}`
      : null;

    let newFen = syncFenTurn(chess.fen(), nextTurn, true);
    if (epTargetSquare) {
      const fenTokens = newFen.split(' ');
      fenTokens[3] = epTargetSquare;
      newFen = fenTokens.join(' ');
    }
    state.fen = newFen;

    state.lastMovedPiece[currentTurn] = piece.type==='k'?null:piece.type;
    state.lastMovedSquare[currentTurn] = finalMoveSquare;
    state.passRedrawAlert = null; // Clear previous pass & redraw notice once a move is made

    state.lastMoveDetails = {
      player: currentTurn,
      actionType: 'move',
      from: msg.from,
      to: finalMoveSquare,
      intermediateSquare: usedSuperKnightDoubleMove ? msg.to : undefined,
      firstTo: usedSuperKnightDoubleMove ? msg.to : undefined,
    };

    const actionDesc = cardPlayed
      ? `${cardPlayed.name}${cardPlayed.type.startsWith('awakening_')?' (Played as Wild)':' Card'}`
      : isKingMove
      ? 'King Move'
      : 'Wild Power-Up';

    const isEpCaptured = Boolean(moveResult?.flags?.includes('e'));

    // Capture-Based Tactical Power-Up Refresh
    let earnedCapturePoints = 0;
    if (moveResult?.captured && !defeatedEnemyChamp) {
      earnedCapturePoints += getPieceCapturePoints(moveResult.captured);
    }
    if (defeatedEnemyChamp) {
      earnedCapturePoints += 5;
    }
    if (usedSuperKnightDoubleMove && didSecondCapture) {
      if (secondCapturedPieceType === 'champion') {
        earnedCapturePoints += 5;
      } else if (secondCapturedPieceType) {
        earnedCapturePoints += getPieceCapturePoints(secondCapturedPieceType);
      }
    }

    const { refreshed } = awardCaptureRefresh(state, currentTurn, earnedCapturePoints);
    let refreshDetail = '';
    if (refreshed.length > 0) {
      refreshDetail = ` | ⚡ Refreshed: ${refreshed.map((r) => `${r.name} (now x${r.newCount})`).join(', ')}`;
      for (const r of refreshed) {
        state.historyLog.unshift({
          id: `log_${Date.now()}_refresh_${Math.random()}`,
          turn: currentTurn,
          turnNumber: state.turnNumber,
          actionType: 'powerup_refresh',
          cardName: 'Tactical Power-Up Refresh',
          detail: `⚡ ${currentTurn === 'w' ? 'White' : 'Black'} refreshed ${r.name} (+1 stack, now x${r.newCount})!`,
          timestamp: Date.now(),
          whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
          blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
        });
      }
    }

    state.historyLog.unshift({
      id: `log_${Date.now()}_${Math.random()}`,
      turn: currentTurn,
      turnNumber: state.turnNumber,
      actionType: isKingMove ? 'king_move' : 'move',
      cardName: actionDesc,
      detail: `${currentTurn === 'w' ? 'White' : 'Black'} played ${actionDesc}: ${moveResult.san || `${msg.from}->${msg.to}`}${isEpCaptured ? ' (En Passant)' : ''}${defeatedEnemyChamp ? ' (Defeated enemy Champion!)' : ''}${refreshDetail}`,
      timestamp: Date.now(),
      whitePoints: calculatePiecePoints(chess, 'w', state.champions, state),
      blackPoints: calculatePiecePoints(chess, 'b', state.champions, state),
      isCheck: isKingChecked(
        chess,
        nextTurn,
        state.monolithSquare,
        state.champions,
        state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [], state.grounds
      ),
    });

    // Evaluate Win Condition:
    const evalRes = evaluateGameEnd(chess, state);
    state.status = evalRes.status;
    state.winner = evalRes.winner;
    state.winReason = evalRes.winReason;
    state.whitePoints = evalRes.whitePoints;
    state.blackPoints = evalRes.blackPoints;

    advanceTurnState(state, currentTurn, nextTurn);
  }
}

// Background 1-second server tick to manage active chess clocks
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    const state = room.gameState;
    if(roomIsPaused(room)||state.pendingSummon){if(state.clock.isRunning){pauseGameClock(state);broadcastRoom(roomId);}return;}
    if (state.status === 'playing' && state.clock && state.clock.enabled && state.clock.isRunning && state.clock.lastTick) {
      const turn = state.turn;
      const elapsed = (now - state.clock.lastTick) / 1000;
      if (state.clock[turn] - elapsed <= 0) {
        state.clock[turn] = 0;
        state.status = 'timeout';
        const winner = turn === 'w' ? 'b' : 'w';
        state.winner = winner;
        state.winReason = `Time Expired: ${turn === 'w' ? 'White' : 'Black'} ran out of time! ${winner === 'w' ? 'White' : 'Black'} wins.`;
        broadcastRoom(roomId);
      }
    }
  });
}, 1000);

// Vite middleware & Static serving
async function startServer() {
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (isProduction && hasDist) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Card Chess server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
