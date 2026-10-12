import {createRoomConnection} from './utils/roomConnection.ts';
import {GolemActionPanel,FrontierExpandOffer,FrontierDropNotices,FrontierIntro,FrontierInventory,FrontierArt} from './components/FrontierUI.tsx';
import {golemBlastSquares,golemSelfDestructError,featherReviveChoice,wingsTargets,starTargets,traverseTargets,frontierUltimateTargets,frontierMoves,occupant,emptyFrontierSquare,frontierKingSafe} from './utils/frontier.ts';
import {allSquares,ranksFor} from './utils/frontierBoard.ts';
import {ViewerTools} from './components/ViewerTools.tsx';
import {MainTutorialOverlay} from './components/MainTutorialOverlay.tsx';
import {initialTutorial,tutorialReducer} from './components/tutorialBattle.ts';
import {tutorialCard,tutorialClientAction,tutorialGameState,tutorialSquareAllowed,TUTORIAL_ROUTE} from './components/tutorialGameAdapter.ts';
import type {RuleSectionId} from './components/rulebookData.ts';
import {MatchActivityNotices} from './components/MatchActivityNotices.tsx';
import './match-theme.css';
import {AwakeningTutorial} from './components/AwakeningTutorial.tsx';
import {ChampionInfoDialog} from './components/ChampionInfoDialog.tsx';
import { RecoveryPanel } from './components/RecoveryPanel.tsx';
import { activeCircle, eligibleRevives, soulTargets } from './utils/summoning.ts';
import {GroundsIntro,GROUND_DESCRIPTION} from './components/GroundsUI.tsx';
import {portalTravelTarget,GROUND_NAMES, type GroundType} from './utils/grounds.ts';
import {V5Power,V5Piece} from './components/V5Art.tsx';
import { PlayerPanel, Toast, Modal, Button, PopupLayer } from './components/UI';
import React from 'react';
import { createPortal } from 'react-dom';
import { MatchMotion, useVisualTurn } from './motion/MatchMotion';
import {
  ChatMessage,
  Card,
  ClientMessage,
  GameState,
  PlayerColor,
  ServerMessage,
  RoomPlayer,
  RoomState,
  RoomLobbyConfig,
  GameExpansionsConfig,
  StandardPieceType,
} from './types.ts';
import {
  CHAMPION_DETAILS,
  createInitialGameState,
  createSafeChess,
  isKingChecked,
  getClockBlockReason,
  getSurroundingSquares,
  getCheckEscapeCardTypes,
} from './utils/chessLogic.ts';
import { GameHeader } from './components/GameHeader.tsx';
import { ChessBoard } from './components/ChessBoard.tsx';
import { CardHand } from './components/CardHand.tsx';
import { OpponentHand } from './components/OpponentHand.tsx';
import { PowerUpsBar } from './components/PowerUpsBar.tsx';
import { DiscardAndDeck } from './components/DiscardAndDeck.tsx';
import { PieceIcon } from './components/PieceIcons.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ChatDrawer } from './components/ChatDrawer.tsx';
import { GameLog } from './components/GameLog.tsx';
import { RoomLobby } from './components/RoomLobby.tsx';
import {
  ClockConfigModal,
  DiscardModal,
  DiscardRedrawModal,
  LobbyModal,
  RulesModal,
  VictoryModal,
} from './components/Modals.tsx';
import { Wifi, WifiOff, ArrowRightLeft, Ban, RefreshCw, Info, X, Layers, ScrollText, Zap, Maximize, ZoomIn, Crosshair, MessageSquare } from 'lucide-react';
import {
  playOpponentMoveSound,
  playMoveSound,
  playWindSound,
  playCheckAlertSound,
  playClownLaughSound,
  playLockChainsSound,
  playRockyMonolithSound,
  playVisionRevealSound,
  playCardDrawSound,
  playAwakeningPowerupSound,
  playOpponentChatSound,
  playChampionSound,
  playHolySound,
  playElectricSound,
  playTimeRewindSound,
  playReviveSound,
  playSoulReleaseSound,
  playSwitchSound,
  playCaptureSound,
  playGroundEffect,
  isSoundEnabled,
  getSoundVolume,
} from './utils/audio.ts';

// Helper to generate a fresh random 6-character room code (e.g. "E7K29X")
function generateRandomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export default function App({tutorialMode=false,onExitTutorial}:{tutorialMode?:boolean;onExitTutorial?:()=>void}={}) {
  const [tutorialLaunch,setTutorialLaunch]=React.useState(false);
  const [welcomeTutorial,setWelcomeTutorial]=React.useState(()=>{if(tutorialMode)return false;try{return localStorage.getItem('chessknot_tutorial_welcome_v1')!=='seen';}catch{return true;}});
  const dismissWelcome=(play:boolean)=>{try{localStorage.setItem('chessknot_tutorial_welcome_v1','seen');}catch{}setWelcomeTutorial(false);if(play)setTutorialLaunch(true);};
  const [tutorialState,tutorialDispatch]=React.useReducer(tutorialReducer,undefined,initialTutorial);
  const tutorialBase=React.useRef<GameState>(createInitialGameState({shiftedParadigm:false,championsOfTheMonolith:false,theAwakening:false,treacherousGrounds:false}));
  React.useEffect(()=>{if(!tutorialMode||!tutorialState.pendingBot)return;const timer=setTimeout(()=>tutorialDispatch({type:'bot'}),7500);return()=>clearTimeout(timer);},[tutorialMode,tutorialState.pendingBot]);
  React.useEffect(()=>{if(!tutorialMode||!tutorialState.animating)return;const timer=setTimeout(()=>tutorialDispatch({type:'settle'}),1100);return()=>clearTimeout(timer);},[tutorialMode,tutorialState.animating]);
  // Extract room ID from URL search params if present, otherwise generate a private random room code
  const queryRoom = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
  const [roomId, setRoomId] = React.useState<string>(() => queryRoom || localStorage.getItem('chessknot_last_online_room') || generateRandomRoomCode());
  const [mode, setMode] = React.useState<'online'>('online');

  const modeRef = React.useRef<'online' | 'pass_and_play'>(mode);
  modeRef.current = mode;

  // Keep URL updated with the room code if not already present
  React.useEffect(() => {
    if (!tutorialMode && !queryRoom && roomId && mode === 'online') {
      window.history.replaceState({}, '', `?room=${roomId}`);
    }
  }, [roomId, queryRoom, mode]);

  // Player ID - scoped per session so multiple tabs on the same device act as distinct players
  const [playerId,setPlayerId] = React.useState<string>(() => {
    let saved:any;try{saved=JSON.parse(localStorage.getItem('chessknot_resume_'+roomId)||'null');}catch{}
    let id = saved?.playerId || sessionStorage.getItem('chessbound_session_player_id');
    if (!id) {
      id = 'p_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('chessbound_session_player_id', id);
    }
    return id;
  });

  const [recovery,setRecovery]=React.useState<import('./types.ts').RoomState['recovery']>([]);
  const [uiNotice, setUiNotice] = React.useState<string | null>(null);
  const [playerName, setPlayerName] = React.useState<string>(() => {
    const sessionName = sessionStorage.getItem('chessbound_session_player_name');
    if (sessionName && sessionName.trim()) return sessionName.trim();
    const saved = localStorage.getItem('chessbound_player_name');
    if (saved && saved.trim()) {
      sessionStorage.setItem('chessbound_session_player_name', saved.trim());
      return saved.trim();
    }
    const generated = 'Commander ' + Math.floor(Math.random() * 900 + 100);
    sessionStorage.setItem('chessbound_session_player_name', generated);
    return generated;
  });

  // Connection & Room state
  const [onlineConnected, setConnected] = React.useState(false);
  const [onlineColor, setMyColor] = React.useState<PlayerColor | 'spectator'>('w');
  const [onlineGameState, setGameState] = React.useState<GameState>(() => createInitialGameState());
  const [onlineRoomPlayers, setRoomPlayers] = React.useState<Record<string, RoomPlayer>>({});
  const [arbiterPaused,setArbiterPaused]=React.useState(false);
  const [arbiterRecovery,setArbiterRecovery]=React.useState<RoomState['arbiterRecovery']>();
  const [showArbiterPause,setShowArbiterPause]=React.useState(false);
  const connected=tutorialMode?true:onlineConnected;
  const myColor=tutorialMode?'w':onlineColor;
  const tutorialWhiteHand=React.useMemo(()=>tutorialState.hand.map(c=>tutorialCard(c,tutorialState.joker)),[tutorialState.hand,tutorialState.joker]);
  const tutorialBlackHand=React.useMemo(()=>tutorialState.blackHand.map((type,i)=>tutorialCard({id:`joe-${i}`,type})),[tutorialState.blackHand]);
  const gameState=React.useMemo(()=>tutorialMode?{...tutorialGameState(tutorialState,tutorialBase.current),hands:{w:tutorialWhiteHand,b:tutorialBlackHand}}:onlineGameState,[tutorialMode,tutorialState,onlineGameState,tutorialWhiteHand,tutorialBlackHand]);
  const roomPlayers:Record<string,RoomPlayer>=tutorialMode?{[playerId]:{id:playerId,name:playerName,color:'w',connected:true},joe:{id:'joe',name:'Friendly Joe',color:'b',connected:true}}:onlineRoomPlayers;
  const [lobbyConfig, setLobbyConfig] = React.useState<RoomLobbyConfig>({
    hostId: '',
    colorPreference: 'w',
    clockEnabled: false,
    initialMinutes: 5,
    incrementSeconds: 0,
    gameStarted: false,
    expansions: {
      shiftedParadigm: true,
      championsOfTheMonolith: true,
      arcaneFrontier: true,
    },
  });

  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [phoneLandscape, setPhoneLandscape] = React.useState(false);
  const [landscapeOpponentHost, setLandscapeOpponentHost] = React.useState<HTMLDivElement|null>(null);
  const [landscapePlayerHost, setLandscapePlayerHost] = React.useState<HTMLDivElement|null>(null);
  const landscapeTag=(node:React.ReactNode,host:HTMLElement|null)=>phoneLandscape && host?createPortal(node,host):node;
  const [landscapeDescriptionHost, setLandscapeDescriptionHost] = React.useState<HTMLDivElement|null>(null);
  const [compactUI, setCompactUI] = React.useState(false);
  const [compactPanel, setCompactPanel] = React.useState<'info'|'powers'|'log'|null>(null);
  const [opponentInfoRequest, setOpponentInfoRequest] = React.useState(0);
  const [pileRequest, setPileRequest] = React.useState<{type:'deck'|'discard';id:number}|null>(null);
  const [desktopDescriptionHost, setDesktopDescriptionHost] = React.useState<HTMLDivElement|null>(null);
  const [boardControlsHost, setBoardControlsHost] = React.useState<HTMLDivElement|null>(null);
  const boardViewport = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px), (max-width: 1366px) and (any-pointer: coarse)');
    const update = () => setCompactUI(media.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  React.useEffect(() => {
    // Use the game viewport so phone previews and embedded windows activate too.
    const query=window.matchMedia('(orientation: landscape) and (max-height: 500px) and (max-width: 1024px)');
    const update=()=>setPhoneLandscape(query.matches);
    update();query.addEventListener('change',update);window.addEventListener('resize',update);
    return()=>{query.removeEventListener('change',update);window.removeEventListener('resize',update);};
  },[]);
  React.useEffect(() => { setCompactPanel(null); }, [roomId, gameState.status]);
  const [sidebarTab, setSidebarTab] = React.useState<'log' | 'chat'>('log');
  const [unreadChat, setUnreadChat] = React.useState(0);
  const chatLastId = React.useRef<string | undefined>(undefined);
  const chatHistoryInitialized = React.useRef(false);
  const chatVisible = React.useRef(false);
  React.useEffect(() => {
    chatVisible.current = gameState.status !== 'lobby' && (compactUI ? chatOpen : true);
    if (chatVisible.current) setUnreadChat(0);
  }, [chatOpen, compactUI, gameState.status]);
  React.useEffect(() => { setChatMessages([]); setUnreadChat(0); chatLastId.current = undefined; chatHistoryInitialized.current = false; setChatOpen(false); }, [roomId]);

  const [frontierZoomOut,setFrontierZoomOut]=React.useState(false);

  // Tactical selections
  const [onlineSelectedCard, setSelectedCard] = React.useState<Card | null>(null);
  const selectedCard=tutorialMode?gameState.hands.w.find(c=>c.id===tutorialState.selectedCard)||null:onlineSelectedCard;
  React.useLayoutEffect(() => {
    if (gameState.status==='lobby') return;
    const app=document.querySelector<HTMLElement>('.compact-match, .desktop-match');
    if(!app)return;
    const nodes=['header','.compact-top-stack','.match-hand-dock','.dock-player-tag','.compact-dock-actions','.board-viewport'].map(q=>app.querySelector<HTMLElement>(q));
    const names=['--compact-header-height','--compact-top-height','--compact-dock-height','--compact-tag-height','--compact-actions-height'];
    const measure=()=>{
      nodes.forEach((el,i)=>{if(el && names[i]){const value=`${el.getBoundingClientRect().height}px`;app.style.setProperty(names[i],value);document.body.style.setProperty(names[i],value);}});
      const region=nodes[5]?.getBoundingClientRect();
      const boardWidth=Math.max(0,(region?.width||0)-(!compactUI?180:0));
      if(compactUI&&!phoneLandscape&&window.innerWidth<=640&&window.innerHeight>window.innerWidth){
        const card=app.querySelector<HTMLElement>('#player-hand-container .compact-hand-card');
        const current=card?.getBoundingClientRect().height||62;
        // Include the current card height so resizing converges rather than oscillates.
        const height=gameState.frontier?.expanded?62:Math.max(62,Math.floor(current+(region?.height||0)-boardWidth));
        const value=`${height}px`;
        if(app.style.getPropertyValue('--portrait-hand-card-height')!==value)app.style.setProperty('--portrait-hand-card-height',value);
      }else app.style.removeProperty('--portrait-hand-card-height');
      const dockTop=nodes[2]?.getBoundingClientRect().top;
      const availableHeight=!compactUI && region && dockTop!=null ? Math.min(region.height,dockTop-region.top-8) : region?.height||0;
      // The expanded portrait phone board uses full width and scrolls its 12 ranks.
      const fullWidth=gameState.frontier?.expanded&&!frontierZoomOut&&(!compactUI||!phoneLandscape&&window.innerWidth<=640);
      const size=Math.max(0,(fullWidth?boardWidth:Math.min(boardWidth,availableHeight))-4);
      app.style.setProperty('--compact-board-size',`${size}px`);
    };
    const observer=new ResizeObserver(measure);nodes.forEach(el=>{if(el)observer.observe(el);});measure();
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
  },[compactUI,phoneLandscape,gameState.status,Boolean(selectedCard),Boolean(gameState.frontier?.expanded),frontierZoomOut]);
  const [onlineWildPowerUp, setIsWildPowerUp] = React.useState(false);
  const [onlineMonolithPowerUp, setIsMonolithPowerUp] = React.useState(false);
  const isWildPowerUp=tutorialMode?tutorialState.selectedCard==='wild-power':onlineWildPowerUp;
  const isMonolithPowerUp=tutorialMode?false:onlineMonolithPowerUp;
  const [recoveryRequired,setRecoveryRequired]=React.useState(false);
  const [groundMode,setGroundMode]=React.useState<GroundType|'transport'|null>(null);
  const [groundSquare,setGroundSquare]=React.useState<string|null>(null);
  const [portalFrom,setPortalFrom]=React.useState<string|null>(null);
  const [expansionOfferOpen,setExpansionOfferOpen]=React.useState(false);
  const [frontierIntro,setFrontierIntro]=React.useState(false);
  const [channelMoveConfirm,setChannelMoveConfirm]=React.useState<ClientMessage|null>(null);
  const [frontierItemMode,setFrontierItemMode]=React.useState<'wings'|'feather'|'star'|'banner'|'sigil'|null>(null);
  const [boardItemFrom,setBoardItemFrom]=React.useState<string|null>(null);
  const [boardItemTargets,setBoardItemTargets]=React.useState<string[]>([]);
  const [bannerConfirm,setBannerConfirm]=React.useState<string|null>(null);
  const [bindRequest,setBindRequest]=React.useState(0);
  const [chestNotice,setChestNotice]=React.useState<string|null>(null);
  const chestSeen=React.useRef(new Set<string>());
  const chestNoticeTimer=React.useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  React.useEffect(()=>()=>{clearTimeout(chestNoticeTimer.current);},[]);
  const [wingsFrom,setWingsFrom]=React.useState<string|null>(null);
  const [featherConfirm,setFeatherConfirm]=React.useState<ReturnType<typeof featherReviveChoice>>(undefined);
  const [featherChoice,setFeatherChoice]=React.useState<ReturnType<typeof featherReviveChoice>>(undefined);
  const [lensMode,setLensMode]=React.useState(false);
  const [lensCandidate,setLensCandidate]=React.useState<Card|null>(null);
  const [golemActionSquare,setGolemActionSquare]=React.useState<string|null>(null);
  const [selfDestructConfirm,setSelfDestructConfirm]=React.useState<string|null>(null);
  const [golemPlacement,setGolemPlacement]=React.useState(false);
  React.useEffect(()=>{setGolemPlacement(false);setLensMode(false);setLensCandidate(null);setFrontierItemMode(null);setWingsFrom(null);setFeatherConfirm(undefined);setFeatherChoice(undefined);setChannelMoveConfirm(null);setBoardItemFrom(null);setBoardItemTargets([]);setBannerConfirm(null);setGolemActionSquare(null);setSelfDestructConfirm(null);},[gameState.turn,gameState.status,roomId]);
  React.useEffect(()=>{const fresh=(gameState.frontier?.events||[]).filter(e=>!chestSeen.current.has(e.id));gameState.frontier?.events.forEach(e=>chestSeen.current.add(e.id));const locked=fresh.find(e=>e.kind==='chest_locked'&&e.recipient===myColor);if(!locked)return;setChestNotice(locked.detail);clearTimeout(chestNoticeTimer.current);chestNoticeTimer.current=setTimeout(()=>setChestNotice(null),3500);},[gameState.frontier?.events,myColor]);
  const [frontierFrom,setFrontierFrom]=React.useState<string|null>(null);
  const frontierSeen=React.useRef('');
  const frontierSounds=React.useRef(new Set<string>());
  React.useEffect(()=>{const f=gameState.frontier;if(!f?.expanded){frontierSeen.current='';return;}if(frontierSeen.current!==f.id){frontierSeen.current=f.id;setFrontierIntro(true);}const audioMap:Record<string,string>={expand:'01-board-expansion',key:'02-chest-key',bag:'03-wayfarers-satchel',chest:'04-chest-opening',mimic:'05-mimic-chest',item:'06-item-use',boss_hit:'07-boss-first-damage',boss_defeat:'08-boss-fallen',summon:'09-golem-summon',traverse:'10-traverse',golem_explosion:'11-golem-explosion'};for(const e of [...f.events].reverse()){if(frontierSounds.current.has(e.id))continue;frontierSounds.current.add(e.id);if(audioMap[e.kind]&&isSoundEnabled()){const a=new Audio(`/audio/frontier/${audioMap[e.kind]}.mp3`);a.volume=.3 * getSoundVolume();void a.play().catch(()=>{});}}},[gameState.frontier]);
  React.useEffect(()=>setFrontierFrom(null),[gameState.turnNumber]);
  const [groundsIntro,setGroundsIntro]=React.useState(false);
  const groundsMatchRef=React.useRef<string>('');
  const [groundNotice,setGroundNotice]=React.useState<string|null>(null);
  const groundEventRef=React.useRef<string>('');
  React.useEffect(()=>{
    if(gameState.status!=='playing'){groundsMatchRef.current='';return;}
    const key=gameState.grounds?.selected.join(',');
    if(key&&groundsMatchRef.current!==key){groundsMatchRef.current=key;setGroundsIntro(true);}
    const event=gameState.grounds?.events[0];
    if(event&&event.id!==groundEventRef.current){
      groundEventRef.current=event.id;
      if(!['move','charge'].includes(event.type))setGroundNotice(event.detail);
      if(isSoundEnabled()&&['mine','poison','banish','disarm','portal','tile-place','trap-place'].includes(event.type)){
        playGroundEffect(event.type as any);
      }
    }
  },[gameState]);
  React.useEffect(()=>{if(!groundNotice)return;const timer=setTimeout(()=>setGroundNotice(null),1000);return()=>clearTimeout(timer);},[groundNotice,compactUI]);
  React.useEffect(()=>{setGroundMode(null);setGroundSquare(null);setPortalFrom(null);},[gameState.turnNumber, gameState.turn]);
  const [clockBlockToast, setClockBlockToast] = React.useState<string | null>(null);
  React.useEffect(()=>{if(!clockBlockToast)return;const timer=setTimeout(()=>setClockBlockToast(null),3000);return()=>clearTimeout(timer);},[clockBlockToast]);
  const [deployedChampion,setDeployedChampion]=React.useState<GameState['champions']['w']|null>(null);
  const seenDeployments=React.useRef(new Set<string>());
  React.useEffect(()=>{seenDeployments.current.clear();setDeployedChampion(null);},[roomId]);
  React.useEffect(()=>{
    const fresh=gameState.historyLog?.filter(entry=>entry.actionType==='champion_deploy'&&!seenDeployments.current.has(entry.id))||[];
    fresh.forEach(entry=>seenDeployments.current.add(entry.id));
    if(gameState.status==='lobby'||!fresh.length)return;
    const champion=gameState.champions?.[fresh[0].turn];
    if(champion)setDeployedChampion({...champion});
  },[gameState.historyLog,gameState.champions,gameState.status]);

  const [awakeningTutorialOpen,setAwakeningTutorialOpen]=React.useState(false);
  const [awakeningMode, setAwakeningMode] = React.useState<'wild' | 'skill' | null>('skill');

  const [captureViewer, setCaptureViewer] = React.useState<PlayerColor | null>(null);
  const [confirmResign, setConfirmResign] = React.useState(false);

  // Modals
  const [isRulesModalOpen, setIsRulesModalOpen] = React.useState(false);
  const [rulesSection,setRulesSection]=React.useState<RuleSectionId|null>(null);
  const openRules=(section:RuleSectionId|null=null)=>{setRulesSection(section);setIsRulesModalOpen(true);};
  const [isLobbyModalOpen, setIsLobbyModalOpen] = React.useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = React.useState(false);
  const [isDiscardRedrawModalOpen, setIsDiscardRedrawModalOpen] = React.useState(false);
  const [isClockModalOpen, setIsClockModalOpen] = React.useState(false);

  const [rematchRequest,setRematchRequest]=React.useState<import('./types.ts').RoomState['rematchRequest']>();
  const socketRef = React.useRef<WebSocket | null>(null);
  const connectionRef=React.useRef<ReturnType<typeof createRoomConnection>|null>(null);
  const identityRef=React.useRef({playerId,playerName});identityRef.current={playerId,playerName};

  // Send message helper
  const sendMessage = React.useCallback((msg: ClientMessage) => {
    if(tutorialMode){
      if(msg.type==='return_to_lobby'||msg.type==='resign'){onExitTutorial?.();return;}
      if(msg.type==='restart_game'){tutorialDispatch({type:'restart'});return;}
      if(msg.type==='send_chat'){setChatMessages(old=>[...old,{id:'practice-chat-'+old.length,senderId:playerId,senderName:playerName,senderColor:'w',text:msg.text,timestamp:Date.now()}]);return;}
      const action=tutorialClientAction(msg);if(action)tutorialDispatch(action);return;
    }
    if(!connectionRef.current?.send(msg))setUiNotice('Connection interrupted. Please wait to reconnect, then try that action again.');
  }, [tutorialMode,onExitTutorial,playerId,playerName]);

  // Renames and adopted credentials update refs without reopening the socket.
  React.useEffect(()=>{
    if(tutorialMode)return;
    const protocol=window.location.protocol==='https:'?'wss:':'ws:';
    const connection=createRoomConnection({roomId,
      createSocket:()=>new WebSocket(`${protocol}//${window.location.host}`),
      join:()=>{let saved:any;try{saved=JSON.parse(localStorage.getItem('chessknot_resume_'+roomId)||'null');}catch{}return {type:'join_room',roomId,playerId:saved?.playerId||identityRef.current.playerId,playerName:identityRef.current.playerName,resumeToken:saved?.resumeToken,mode:modeRef.current};},
      online:()=>navigator.onLine,
      onSocket:socket=>{socketRef.current=socket;},onConnected:setConnected,
      onTerminal:code=>setUiNotice(code===4000?'Your seat was resumed in another tab or device.':'The host generated a new room code. Ask the host for the new code to join again.'),
      onError:error=>console.warn('WebSocket connection interrupted:',error),
      onMessage:data=>{
        try {
          const msg: ServerMessage = JSON.parse(data);
          if(msg.type==='recovery_required'){setRecoveryRequired(true);
          } else if(msg.type==='session_credentials'){
            setRecoveryRequired(false);
            localStorage.setItem('chessknot_resume_'+msg.roomId,JSON.stringify({playerId:msg.playerId,resumeToken:msg.resumeToken}));
            localStorage.setItem('chessknot_last_online_room',msg.roomId);
            sessionStorage.setItem('chessbound_session_player_id',msg.playerId);
            if(msg.playerId!==identityRef.current.playerId)setPlayerId(msg.playerId);
          } else if(msg.type==='room_code_changed'){
            setRoomId(msg.roomId);const url=new URL(window.location.href);url.searchParams.set('room',msg.roomId);window.history.replaceState(null,'',url);
          } else if (msg.type === 'room_state') {
            if(msg.state.roomId!==roomId)return;
            setRecovery(msg.state.recovery||[]);setArbiterPaused(!!msg.state.arbiterClockPaused);setArbiterRecovery(msg.state.arbiterRecovery);
            setRematchRequest(msg.state.rematchRequest);
            if(msg.yourColor!=='spectator')setRecoveryRequired(false);
            const incoming = msg.state.chatMessages || [];
            const previous = incoming.findIndex(m => m.id === chatLastId.current);
            // Seed existing history on join; an initially empty history still
            // needs to notify for the very first live incoming message.
            const fresh = chatHistoryInitialized.current ? (previous >= 0 ? incoming.slice(previous + 1) : incoming) : [];
            const opponentMessages = fresh.filter(m => m.senderId !== identityRef.current.playerId);
            if (!chatVisible.current) setUnreadChat(n => n + opponentMessages.length);
            if (opponentMessages.length > 0) {
              playOpponentChatSound();
            }
            chatLastId.current = incoming.at(-1)?.id;
            chatHistoryInitialized.current = true;
            setChatMessages(incoming);
            setGameState(msg.state.gameState);
            if (msg.state.mode) {
              setMode('online');
              modeRef.current = 'online';
            }
            setMyColor(msg.yourColor);
            setRoomPlayers(msg.state.players || {});
            if (msg.state.lobbyConfig) {
              setLobbyConfig(msg.state.lobbyConfig);
            }
          } else if (msg.type === 'error') {
            console.warn('Server error notice:', msg.message);
            setUiNotice(msg.message);
          }
        } catch (err) {
          console.error('Failed to parse server message:', err);
        }

      },
    });
    connectionRef.current=connection;connection.start();
    const wake=()=>connection.wake();
    const visible=()=>{if(document.visibilityState==='visible')wake();};
    window.addEventListener('online',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',visible);
    return()=>{window.removeEventListener('online',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',visible);connection.stop();if(connectionRef.current===connection)connectionRef.current=null;};
  },[roomId,tutorialMode]);

  React.useEffect(()=>{if(tutorialMode)setIsDiscardRedrawModalOpen(tutorialState.panel==='redraw');},[tutorialMode,tutorialState]);
  React.useEffect(()=>{if(tutorialMode&&tutorialState.phase==='play'){setCompactPanel(null);tutorialDispatch({type:'close-panel'});}},[tutorialMode,tutorialState.phase]);
  // Active color evaluation
  const visualTurn = useVisualTurn(gameState, `${roomId}:${mode}`, connected);
  const handoffPending = false;
  const activeColor: PlayerColor =
    myColor === 'spectator' ? (roomPlayers[playerId]?.role==='arbiter' ? gameState.turn : 'w') : myColor;
  React.useEffect(()=>{setShowArbiterPause(arbiterPaused&&myColor!=='spectator');},[arbiterPaused,myColor,roomId]);
  const isMyTurn = !arbiterPaused && (!tutorialMode||(tutorialState.phase==='play'&&!tutorialState.pendingBot&&!tutorialState.animating&&tutorialState.step<12)) && connected && !gameState.pendingSummon && !(mode==='online'&&recovery?.length) && !handoffPending && (myColor === gameState.turn);

  const validGroundTargets = groundMode && isMyTurn?allSquares(gameState.fen).filter(q=>{const g=gameState.grounds;if(!g)return false;if(groundMode==='transport'||(groundMode==='portal'&&!portalFrom))return g.tiles[q]==='portal' && (groundMode!=='transport' || createSafeChess(gameState.fen).get(q as any)?.color===activeColor || Object.values(gameState.champions).some(c=>c?.square===q && c.color===activeColor));if(gameState.frontier?.pois[q]||gameState.frontier?.golems.some(g=>g.square===q)||createSafeChess(gameState.fen).get(q as any)||gameState.monolithSquare===q||Object.values(gameState.champions).some(c=>c?.square===q)||gameState.restrictedSquares.includes(q)||activeCircle(gameState,q))return false;if(['mine','poison','banish','disarm'].includes(groundMode))return (activeColor==='w'?ranksFor(gameState.fen).indexOf(q.slice(1))<ranksFor(gameState.fen).length/2:ranksFor(gameState.fen).indexOf(q.slice(1))>=ranksFor(gameState.fen).length/2)&&!['portal','defense'].includes(g.tiles[q])&&!g.traps.some(t=>t.owner===activeColor&&t.square===q&&t.type===groundMode);return !g.tiles[q];}):[];

  const travelTarget = portalTravelTarget(gameState,activeColor);
  const currentHand = gameState.hands[activeColor] || [];
  const opponentColor: PlayerColor = activeColor === 'w' ? 'b' : 'w';
  const opponentHand = gameState.hands[opponentColor] || [];
  const activeVision = myColor!=='spectator' && (!!gameState.visionActive?.[activeColor] || !!gameState.frontier?.inventories[activeColor].some(i=>i.type==='eye'));
  const currentPowerUps = gameState.powerUps ? gameState.powerUps[activeColor] : { draw: 1, monolith: 1, wild: 1, vision: 1 };
  const lastPieceMoved = gameState.lastMovedPiece ? gameState.lastMovedPiece[activeColor] : null;
  const lastMovedSquare = gameState.lastMovedSquare ? gameState.lastMovedSquare[activeColor] : null;
  const isJokerLocked = gameState.jokerLocked ? gameState.jokerLocked[activeColor] : false;

  // Active chess instance and King check status
  const activeChess = React.useMemo(() => {
    return createSafeChess(gameState.fen);
  }, [gameState.fen]);

  const beaconProtectedSquares = React.useMemo(() => {
    if (!gameState.beaconEffect?.active || !gameState.monolithSquare) return [];
    return getSurroundingSquares(gameState.monolithSquare,gameState.fen);
  }, [gameState.beaconEffect?.active, gameState.monolithSquare]);

  const isCurrentKingInCheck = React.useMemo(() => {
    if(gameState.frontier?.expanded)return !frontierKingSafe(gameState,gameState.turn);return isKingChecked(activeChess, gameState.turn, gameState.monolithSquare, gameState.champions, beaconProtectedSquares, gameState.grounds);
  }, [activeChess, gameState.turn, gameState.monolithSquare, gameState.champions, beaconProtectedSquares,gameState.grounds,gameState.frontier]);

  const checkEscapeCardTypes = React.useMemo(() => {
    if (!isCurrentKingInCheck) return undefined;
    return getCheckEscapeCardTypes(activeChess, gameState, activeColor);
  }, [isCurrentKingInCheck, activeChess, gameState, activeColor]);

  const clockBlockReason = React.useMemo(() => {
    if (!gameState) return null;
    return getClockBlockReason(gameState, activeColor);
  }, [gameState, activeColor]);

  // Clear selections if turn shifts
  React.useEffect(() => {
    setSelectedCard(null);
    setIsWildPowerUp(false);
    setIsMonolithPowerUp(false);
  }, [gameState.turn, gameState.turnNumber]);

  // Open discard modal when pendingSwapDiscard is active for the current active player
  React.useEffect(() => {
    setIsDiscardModalOpen(Boolean(gameState.pendingSwapDiscard && gameState.pendingSwapDiscard.player===activeColor));
  }, [gameState.pendingSwapDiscard, activeColor]);

  // Event IDs survive room/chat refreshes; object references do not.
  const heardEventRef=React.useRef<string|null>(null);
  const checkedRef=React.useRef(false);
  React.useEffect(()=>{
    const latest=gameState.historyLog?.find(entry=>entry.actionType!=='powerup_refresh'&&entry.actionType!=='deck_refresh');
    if(gameState.status==='lobby'){heardEventRef.current=latest?.id||'';return;}
    if(!latest)return;
    if(heardEventRef.current===null){heardEventRef.current=latest.id;checkedRef.current=isCurrentKingInCheck;return;}
    if(heardEventRef.current!==latest.id){
      heardEventRef.current=latest.id;
      const action = ['powerup','pass'].includes(latest.actionType) ? gameState.lastMoveDetails?.actionType || latest.actionType : latest.actionType;
      const champType =
        gameState.lastMoveDetails?.championType ||
        (gameState.lastMoveDetails?.player && gameState.champions?.[gameState.lastMoveDetails.player]?.type) ||
        (latest.detail.toLowerCase().includes('berserker')
          ? 'berserker'
          : latest.detail.toLowerCase().includes('musketeer')
          ? 'musketeer'
          : latest.detail.toLowerCase().includes('summoner')
          ? 'summoner'
          : latest.detail.toLowerCase().includes('ninja')
          ? 'ninja'
          : undefined);

      const isRevive = action === 'revive' ||
        latest.actionType === 'revive' ||

        latest.detail.toLowerCase().includes('revived') ||
        latest.cardName === 'Piece Revival';

      const isSoulRelease = action === 'soul_release' ||
        latest.actionType === 'soul_release' ||

        latest.cardName === 'Soul Release';

      if (isRevive) {
        playReviveSound();
      } else if (isSoulRelease) {
        playSoulReleaseSound();
      } else if (action === 'champion_deploy') {
        playChampionSound(champType, false);
      } else if (action === 'champion_ultimate') {
        playChampionSound(champType, true);
      } else if (action === 'awakening') {
        playAwakeningPowerupSound();
      } else if (action === 'refresh' || action === 'redraw' || action === 'draw_powerup') {
        playCardDrawSound();
      } else if (action === 'vision') {
        playVisionRevealSound();
      } else if (action === 'beacon') {
        playHolySound();
      } else if (action === 'static') {
        playElectricSound();
      } else if (action === 'clock') {
        playTimeRewindSound();
      } else if (action === 'joker') {
        playClownLaughSound();
      } else if (action === 'restrict') {
        playLockChainsSound();
      } else if (action === 'monolith') {
        playRockyMonolithSound();
      } else if (action === 'push') {
        playWindSound();
      } else if (action === 'switch') {
        playSwitchSound();
      } else if (action === 'move' || action === 'champion_move' || action === 'king_move' || action === 'castle') {
        if (latest.detail.toLowerCase().includes('captured') || latest.detail.toLowerCase().includes('takes')) {
          playCaptureSound();
        } else {
          const movePlayer = gameState.lastMoveDetails?.player || latest.turn;
          if (movePlayer === myColor) {
            playMoveSound();
          } else {
            playOpponentMoveSound();
          }
        }
      }
    }
    if(isCurrentKingInCheck&&!checkedRef.current)playCheckAlertSound();
    checkedRef.current=isCurrentKingInCheck;
  },[gameState.historyLog,gameState.lastMoveDetails,gameState.status,isCurrentKingInCheck,myColor,mode]);

  React.useEffect(()=>{if(gameState.notice)setGroundNotice(gameState.notice.text);},[gameState.notice?.id]);

  const [idleReminder, setIdleReminder] = React.useState(false);
  React.useEffect(() => {
    setIdleReminder(false);
    if (tutorialMode || gameState.status !== 'playing' || !isMyTurn || !connected || recovery.length || gameState.pendingSummon || awakeningTutorialOpen) return;
    let timer: number;
    const resetIdle = () => {
      window.clearTimeout(timer);
      setIdleReminder(false);
      timer = window.setTimeout(() => setIdleReminder(true), 45000);
    };
    resetIdle();
    const events = ['pointerdown', 'keydown', 'input', 'wheel', 'touchmove'];
    events.forEach(event => document.addEventListener(event, resetIdle, {passive: true}));
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => document.removeEventListener(event, resetIdle));
    };
  }, [gameState.status, gameState.turnNumber, gameState.turn, gameState.historyLog?.[0]?.id, gameState.pendingSummon, isMyTurn, connected, recovery.length, awakeningTutorialOpen]);

  const clearFrontierSelection=()=>{setFrontierItemMode(null);setWingsFrom(null);setFeatherChoice(undefined);setFeatherConfirm(undefined);setLensMode(false);setLensCandidate(null);setGolemPlacement(false);setChannelMoveConfirm(null);setBoardItemFrom(null);setBoardItemTargets([]);setBannerConfirm(null);setFrontierFrom(null);setGolemActionSquare(null);setSelfDestructConfirm(null);};
  const sendFrontierBoardMove=(from:string,msg:ClientMessage)=>{if(gameState.summoningCircles?.some(c=>c.bishopId===gameState.pieceIds?.[from]&&!c.finished&&!c.interrupted)){setChannelMoveConfirm(msg);return;}sendMessage(msg);};
  // Actions
  const handleSelectCard = (card: Card | null) => {
    if(lensMode){if(card&&isMyTurn)setLensCandidate(card);return;}
    setFrontierItemMode(null);setWingsFrom(null);setBoardItemFrom(null);setBoardItemTargets([]);setFrontierFrom(null);
    setGolemPlacement(false);setGolemActionSquare(null);setSelfDestructConfirm(null);
    if(tutorialMode){tutorialDispatch(card?{type:'card',value:card.id}:{type:'deselect'});return;}
    if (!isMyTurn) return;
    setGroundMode(null); setGroundSquare(null); setPortalFrom(null);
    if(card?.type.startsWith('awakening_'))setAwakeningMode('skill');
    setSelectedCard(card);
    setIsWildPowerUp(false);
    setIsMonolithPowerUp(false);
  };

  const handleStandardMove = (from: string, to: string, secondTo?: string) => {
    if (isWildPowerUp) {
      sendMessage({ type: 'use_powerup_wild_move', from, to, secondTo, promotion: 'q' });
      setIsWildPowerUp(false);
    } else if (selectedCard) {
      sendMessage({ type: 'play_card_move', cardId: selectedCard.id, from, to, secondTo, asWild: selectedCard.type.startsWith('awakening_') && awakeningMode === 'wild', promotion: 'q' });
      setSelectedCard(null);
    } else {
      // King move without card
      sendMessage({ type: 'play_king_move', from, to });
    }
  };

  const handlePushMove = (from: string, to: string) => {
    if (!selectedCard || selectedCard.type !== 'push') return;
    
    sendMessage({ type: 'play_push', cardId: selectedCard.id, from, to });
    setSelectedCard(null);
  };

  const handleSwitchMove = (sq1: string, sq2: string) => {
    if (!selectedCard || selectedCard.type !== 'switch') return;
    
    sendMessage({ type: 'play_switch', cardId: selectedCard.id, square1: sq1, square2: sq2 });
    setSelectedCard(null);
  };

  const handleRestrictSquare = (sq: string) => {
    if (!selectedCard || selectedCard.type !== 'restrict') return;
    
    sendMessage({ type: 'play_restrict', cardId: selectedCard.id, targetSquare: sq });
    setSelectedCard(null);
  };

  const handlePlaceMonolith = (sq: string) => {
    
    if (isMonolithPowerUp) {
      sendMessage({ type: 'play_monolith', cardId: null, targetSquare: sq, isPowerUp: true });
      setIsMonolithPowerUp(false);
    } else if (selectedCard?.type === 'monolith') {
      sendMessage({ type: 'play_monolith', cardId: selectedCard.id, targetSquare: sq });
      setSelectedCard(null);
    }
  };

  const handleDeployChampion = (targetSquare: string) => {
    if (!selectedCard || selectedCard.type !== 'champion') return;
    sendMessage({ type: 'play_champion_deploy', cardId: selectedCard.id, targetSquare });
    setSelectedCard(null);
  };

  const handleChampionMove = (from: string, to: string) => {
    sendMessage({ type: 'play_champion_move', from, to });
    setSelectedCard(null);
  };

  const handleChampionUltimate = (payload: {
    cardId: string;
    targetSquare?: string;
    targetFriendlySquare?: string;
    targetSquares?: string[];
  }) => {
    sendMessage({ type: 'play_champion_ultimate', ...payload });
    setSelectedCard(null);
  };

  const handlePlayBeacon = (cardId: string) => {
    
    sendMessage({ type: 'play_beacon', cardId });
    setSelectedCard(null);
  };

  const handlePlayStatic = (cardId: string) => {
    
    sendMessage({ type: 'play_static', cardId });
    setSelectedCard(null);
  };

  const handlePlayClock = (cardId: string) => {
    if (clockBlockReason) {
      setClockBlockToast(clockBlockReason);
      return;
    }
    
    sendMessage({ type: 'play_clock', cardId });
    setSelectedCard(null);
  };

  const handleClockBlocked = (reason: string) => {
    setClockBlockToast(reason);
  };

  const handleDismissClockAlert = () => {
    sendMessage({ type: 'dismiss_clock_alert' });
  };

  const handleDismissPassRedrawAlert = () => {
    sendMessage({ type: 'dismiss_pass_redraw_alert' });
  };

  const handlePlayJoker = (cardId: string) => {
    
    sendMessage({ type: 'play_joker', cardId });
    setSelectedCard(null);
  };

  const handleUseDraw = () => {
    clearFrontierSelection();
    if (!isMyTurn || isJokerLocked) return;
    
    sendMessage({ type: 'start_powerup_draw' });
  };

  const handleConfirmDiscard = (discardIds: [string, string]) => {
    
    sendMessage({ type: 'use_powerup_draw', discardCardIds: discardIds });
  };

  const handleUseMonolith = () => {
    clearFrontierSelection();
    setGolemPlacement(false);
    if (!isMyTurn) return;
    setGroundMode(null); setGroundSquare(null); setPortalFrom(null);
    setIsMonolithPowerUp(value=>!value);
    setSelectedCard(null);
    setIsWildPowerUp(false);
  };

  const handleUseWild = () => {
    clearFrontierSelection();
    if(tutorialMode){tutorialDispatch({type:'power',value:'wild'});return;}
    if (!isMyTurn) return;
    setGroundMode(null); setGroundSquare(null); setPortalFrom(null);
    setIsWildPowerUp(value=>!value);
    setSelectedCard(null);
    setIsMonolithPowerUp(false);
  };

  const handleUseVision = () => {
    clearFrontierSelection();
    if (!isMyTurn) return;
    
    sendMessage({ type: 'use_powerup_vision' });
  };

  const handlePassTurn = () => {
    sendMessage({ type: 'pass_turn' });
  };

  const handleOpenDiscardRedraw = () => {
    if(tutorialMode){tutorialDispatch({type:'redraw'});return;}
    if (!isMyTurn || isJokerLocked) return;
    setIsDiscardRedrawModalOpen(true);
  };

  const handleConfirmDiscardRedraw = (selectedCardIds: string[]) => {
    
    sendMessage({ type: 'discard_redraw', cardIds: selectedCardIds });
    setIsDiscardRedrawModalOpen(false);
    setSelectedCard(null);
  };

  // Awakening Card Handlers
  const handlePlayAwakeningPawn = (targetSquare: string) => {
    if (!selectedCard) return;
    sendMessage({ type: 'play_awakening_pawn', cardId: selectedCard.id, targetSquare });
    setSelectedCard(null);
  };

  const handlePlayAwakeningRook = (from: string, to: string) => {
    if (!selectedCard) return;
    sendMessage({ type: 'play_awakening_rook', cardId: selectedCard.id, from, to });
    setSelectedCard(null);
  };

  const handlePlayAwakeningKnight = (from: string, to?: string, secondTo?: string) => {
    if (!selectedCard) return;
    sendMessage({
      type: 'play_awakening_knight',
      cardId: selectedCard.id,
      from,
      to: to || from,
      secondTo,
      targetSquare: from,
    });
    setSelectedCard(null);
  };

  const handlePlayAwakeningBishop = (from: string, to: string, revivePieceType: StandardPieceType, reviveSquare: string) => {
    if (!selectedCard) return;
    sendMessage({ type: 'play_awakening_bishop', cardId: selectedCard.id, from, to, revivePieceType, reviveSquare, circleSquare:reviveSquare });
    setSelectedCard(null);
  };

  const handlePlayAwakeningQueen = (from: string, to: string, deploySquare?: string) => {
    if (!selectedCard) return;
    sendMessage({ type: 'play_awakening_queen', cardId: selectedCard.id, from, to, deploySquare });
    setSelectedCard(null);
  };

  const handlePlayAwakeningKing = (from: string, to: string) => {
    if (!selectedCard) return;
    sendMessage({ type: 'play_awakening_king', cardId: selectedCard.id, from, to });
    setSelectedCard(null);
  };

  const handlePlayAwakeningAsWild = (cardId: string, from: string, to: string, promotion?: string) => {
    sendMessage({ type: 'play_awakening_as_wild', cardId, from, to, promotion });
    setSelectedCard(null);
  };

  const handleDismissAwakeningAlert = () => {
    sendMessage({ type: 'dismiss_awakening_alert' });
  };

  const handleUpdateLobbyConfig = (config: {
    allowArbiter?:boolean;
    colorPreference?: 'w' | 'b' | 'random';
    clockEnabled?: boolean;
    initialMinutes?: number;
    incrementSeconds?: number;
    mode?: 'online' | 'pass_and_play';
    expansions?: GameExpansionsConfig;
  }) => {
    setLobbyConfig((prev) => ({
      ...prev,
      ...config,
    }));
    if (config.mode) {
      setMode('online');
    }
    sendMessage({
      type: 'update_lobby_config',
      ...config,
    });
  };

  const handleStartGameFromLobby = () => {
    sendMessage({
      type: 'start_game',
      colorPreference: lobbyConfig.colorPreference,
      clockConfig: {
        enabled: lobbyConfig.clockEnabled,
        initialMinutes: lobbyConfig.initialMinutes,
        incrementSeconds: lobbyConfig.incrementSeconds,
      },
      expansions: lobbyConfig.expansions,
    });
  };

  const handleSetPlayerReady = (isReady: boolean) => {
    sendMessage({
      type: 'set_player_ready',
      isReady,
    });
  };

  const handleReturnToLobby = () => {
    if(myColor==='spectator'&&!connected){handleJoinRoom(generateRandomRoomCode(),'online');return;}
    sendMessage(myColor==='spectator'?{type:'quit_viewing'}:{ type: 'return_to_lobby' });
  };

  const handleRestartGame = () => {
    sendMessage({ type: 'restart_game' });
  };

  const handleSaveClockConfig = (enabled: boolean, initialMinutes: number, incrementSeconds: number) => {
    sendMessage({
      type: 'update_clock_config',
      enabled,
      initialMinutes,
      incrementSeconds,
    });
  };

  const handleRenamePlayer = (newName: string, targetPlayerId?: string) => {
    const clean = newName.trim().slice(0, 24);
    if (!clean) return;
    const pId = targetPlayerId || playerId;
    if (pId === playerId) {
      setPlayerName(clean);
      localStorage.setItem('chessbound_player_name', clean);
      sessionStorage.setItem('chessbound_session_player_name',clean);
    }
    setRoomPlayers((prev) => {
      const existing = prev[pId];
      if (!existing) {
        const isThisHost = (lobbyConfig.hostId ? lobbyConfig.hostId === pId : false);
        return {
          ...prev,
          [pId]: {
            id: pId,
            name: clean,
            color: myColor,
            connected: true,
            isHost: isThisHost,
          },
        };
      }
      return {
        ...prev,
        [pId]: {
          ...existing,
          name: clean,
        },
      };
    });

    sendMessage({
      type: 'rename_player',
      playerId: pId,
      playerName: clean,
    });
  };

  const handleSwitchMode = (newMode: 'online' | 'pass_and_play') => {
    if(newMode!=='online')return;
    setMode(newMode);
    modeRef.current = newMode;
    try {
      localStorage.setItem('chessknot_game_mode', newMode);
    } catch {}
    sendMessage({ type: 'set_room_mode', mode: newMode });
    if (newMode === 'online') {
      window.history.pushState({}, '', `?room=${roomId}`);
    } else {
      window.history.pushState({}, '', '/');
    }
  };

  const handleJoinRoom = (newRoomId: string, _newMode: 'online' | 'pass_and_play') => {
    const newMode='online' as const;
    const cleanId = newRoomId.trim().toUpperCase();
    if (!cleanId) return;
    setRecoveryRequired(false);
    setRoomId(cleanId);
    setMode(newMode);
    modeRef.current = newMode;
    try {
      localStorage.setItem('chessknot_game_mode', newMode);
    } catch {}
    window.history.pushState({}, '', newMode === 'online' ? `?room=${cleanId}` : '/');
    setIsLobbyModalOpen(false);

    // Room change reconnects once via the roomId effect; never join on the outgoing socket.
    if(socketRef.current?.readyState===WebSocket.OPEN)socketRef.current.send(JSON.stringify({type:'leave_lobby'}));

  };

  const otherPopupActive = Boolean(
    (showArbiterPause&&arbiterPaused) ||
    compactPanel ||
    gameState.pendingSummon ||
    (gameState.status === 'playing' && gameState.pendingPortal && isMyTurn) ||
    (groundMode && groundSquare) ||
    selfDestructConfirm || bannerConfirm || channelMoveConfirm || featherConfirm || lensCandidate || frontierIntro || groundsIntro ||
    awakeningTutorialOpen ||
    groundNotice ||
    isRulesModalOpen ||
    isLobbyModalOpen ||
    isDiscardModalOpen ||
    isDiscardRedrawModalOpen ||
    isClockModalOpen ||
    confirmResign ||
    captureViewer ||
    chatOpen ||
    gameState.passRedrawAlert ||
    gameState.status === 'checkmate' ||
    gameState.status === 'resigned' ||
    gameState.status === 'timeout' ||
    gameState.status === 'points_win'
  );

  const isAnyPopupActive=otherPopupActive||expansionOfferOpen;
  const selectedChampion=gameState.champions[activeColor];
  const boardItemSquares=frontierItemMode==='star'?(boardItemFrom?starTargets(gameState,activeColor,boardItemFrom):allSquares(gameState.fen).filter(q=>starTargets(gameState,activeColor,q).length>0)):frontierItemMode==='banner'?allSquares(gameState.fen).filter(q=>q.slice(1)===(activeColor==='w'?'2':'7')&&emptyFrontierSquare(gameState,q)):frontierItemMode==='sigil'?(selectedChampion?.type==='summoner'&&!boardItemFrom?allSquares(gameState.fen).filter(q=>occupant(gameState,q)?.color===activeColor&&frontierUltimateTargets(gameState,activeColor,q).length>0):frontierUltimateTargets(gameState,activeColor,boardItemFrom||undefined)):[];
  const itemGuide=frontierItemMode==='star'?(boardItemFrom?'Wishing Star · click a highlighted destination':'Wishing Star · choose your piece'):frontierItemMode==='banner'?'Banner · choose an empty square on your second rank':frontierItemMode==='sigil'?(selectedChampion?.type==='summoner'&&!boardItemFrom?'Sigil · choose a friendly piece':'Sigil · choose highlighted ultimate target(s), then Activate'):frontierItemMode==='wings'?(wingsFrom?'Wings · click a highlighted empty destination':'Wings · click your piece'):'Feather · choose an empty square on your first rank';
  const submitBoardItem=()=>{if(!isMyTurn||!boardItemTargets.length)return;const to=boardItemTargets[0];if(frontierItemMode==='sigil')sendMessage({type:'frontier_item',item:'sigil',targetFriendlySquare:boardItemFrom||undefined,targetSquare:to,targetSquares:boardItemTargets});setFrontierItemMode(null);setBoardItemFrom(null);setBoardItemTargets([]);};
  const tacticalPowers = (<section className="tactical-powers-panel"><PowerUpsBar confirmPlacement={compactUI||tutorialMode}
            isJokerLocked={isJokerLocked} grounds={gameState.grounds} color={activeColor} selectedGround={groundMode} onGround={type=>{clearFrontierSelection();setCompactPanel(null);if(!isMyTurn)return;setGroundMode(groundMode===type?null:type);setGroundSquare(null);setPortalFrom(null);setSelectedCard(null);setIsWildPowerUp(false);setIsMonolithPowerUp(false);}}
            powerUps={currentPowerUps}
            progress={gameState.powerUpProgress ? gameState.powerUpProgress[activeColor] || 0 : 0}
            isMyTurn={isMyTurn}
            onUseDraw={()=>{setCompactPanel(null);handleUseDraw();}}
            onUseMonolith={()=>{setCompactPanel(null);handleUseMonolith();}}
            onUseWild={()=>{setCompactPanel(null);handleUseWild();}}
            hasEye={!!gameState.frontier?.inventories[activeColor].some(i=>i.type==='eye')} onUseVision={()=>{setCompactPanel(null);if(gameState.frontier?.inventories[activeColor].some(i=>i.type==='eye')){clearFrontierSelection();setBindRequest(v=>v+1);return;}handleUseVision();}}
            isWildActive={isWildPowerUp}
            isMonolithMode={isMonolithPowerUp}
            hasShiftedParadigm={gameState.expansions?.shiftedParadigm !== false}
            hasChampionsOfTheMonolith={gameState.expansions?.championsOfTheMonolith !== false}
          >{myColor!=='spectator'&&<FrontierInventory state={gameState} color={activeColor} disabled={!isMyTurn} send={sendMessage} onIntro={()=>setFrontierIntro(true)} onUseBoardItem={item=>{clearFrontierSelection();setCompactPanel(null);setFrontierItemMode(item);setSelectedCard(null);setGroundMode(null);setIsWildPowerUp(false);setIsMonolithPowerUp(false);}} onUseWings={()=>{clearFrontierSelection();setCompactPanel(null);setFrontierItemMode('wings');setWingsFrom(null);setSelectedCard(null);setLensMode(false);setGolemPlacement(false);setGroundMode(null);setIsMonolithPowerUp(false);setIsWildPowerUp(false);}} onUseFeather={()=>{clearFrontierSelection();const choice=featherReviveChoice(gameState,activeColor);if(!choice)return;setCompactPanel(null);setFeatherConfirm(choice);setSelectedCard(null);setLensMode(false);setGolemPlacement(false);setGroundMode(null);setIsMonolithPowerUp(false);setIsWildPowerUp(false);}} onUseLens={()=>{clearFrontierSelection();setFrontierItemMode(null);setCompactPanel(null);setLensMode(true);setLensCandidate(null);setSelectedCard(null);setGolemPlacement(false);setGroundMode(null);setIsMonolithPowerUp(false);setIsWildPowerUp(false);}} onDeployGolem={()=>{clearFrontierSelection();setFrontierItemMode(null);setLensMode(false);setLensCandidate(null);setCompactPanel(null);setGolemPlacement(true);setSelectedCard(null);setGroundMode(null);setIsMonolithPowerUp(false);setIsWildPowerUp(false);}}/>}</PowerUpsBar></section>);
  const opponentWidget = (<OpponentHand
            bindRequest={bindRequest} canBind={isMyTurn&&!!gameState.frontier?.inventories[activeColor].some(i=>i.type==='eye')&&currentPowerUps.vision>0} boundCardId={gameState.frontier?.bind?.target===opponentColor?gameState.frontier.bind.cardId:undefined} onBind={targetCardId=>sendMessage({type:'frontier_bind',targetCardId})} hidePowerButton={compactUI} openRequest={opponentInfoRequest}
            grounds={gameState.grounds} frontier={gameState.frontier} turnNumber={gameState.turnNumber} color={opponentColor}
            hand={opponentHand} champion={gameState.champions?.[opponentColor]}
            isVisionActive={activeVision || (myColor === 'spectator' && roomPlayers[playerId]?.role === 'arbiter')}
            alwaysReveal={myColor === 'spectator' && roomPlayers[playerId]?.role === 'arbiter'}
            opponentName={opponentColor === 'w' ? 'White' : 'Black'}
            opponentHasEye={!!gameState.frontier?.inventories[opponentColor].some(i=>i.type==='eye')} permanentVision={!!gameState.frontier?.inventories[activeColor].some(i=>i.type==='eye')} opponentPowerUps={gameState.powerUps ? gameState.powerUps[opponentColor] : undefined}
            hasShiftedParadigm={gameState.expansions?.shiftedParadigm !== false}
            hasChampionsOfTheMonolith={gameState.expansions?.championsOfTheMonolith !== false}
          />);
  const viewerTools=!tutorialMode?<ViewerTools roomId={roomId} players={roomPlayers} myId={playerId} game={gameState} allowArbiter={lobbyConfig.allowArbiter} recovery={arbiterRecovery} send={sendMessage} onChat={()=>setChatOpen(true)}/>:undefined;
  if(tutorialLaunch&&!tutorialMode)return <App tutorialMode onExitTutorial={()=>setTutorialLaunch(false)}/>;
  return (
    <div className={`game-app min-h-screen bg-gradient-to-b from-stone-50 via-stone-100 to-blue-50/30 text-stone-800 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 dark:text-stone-100 flex flex-col font-sans antialiased selection:bg-blue-500 selection:text-white transition-colors duration-200 ${gameState.frontier?.expanded?'frontier-expanded':''} ${frontierZoomOut?'frontier-zoomed-out':''} ${isAnyPopupActive ? 'has-popup-open' : ''} ${phoneLandscape && gameState.status !== 'lobby' ? 'phone-landscape' : ''} ${gameState.status !== 'lobby' ? (compactUI ? 'compact-match' : 'desktop-match') : ''}`}>
      {!tutorialMode&&welcomeTutorial&&gameState.status==='lobby'&&<Modal className="tutorial-welcome-modal"><section className="tutorial-welcome-dialog"><h2>New to ChessKnot?</h2><p>Learn the board, cards, and power-ups with Friendly Joe in an interactive practice match.</p><div><Button className="tutorial-entry-gold" onClick={()=>dismissWelcome(true)}>Play tutorial</Button><Button aria-label="Close dialog" onClick={()=>dismissWelcome(false)}>Skip for now</Button></div><p className="tutorial-welcome-note">You can always start the tutorial from the rulebook.</p></section></Modal>}
      {channelMoveConfirm&&<Modal className="lens-discard-backdrop"><section className="lens-discard-dialog" role="dialog" aria-modal="true"><h2>Cancel the Bishop’s ritual?</h2><p>Moving this Bishop interrupts its summoning circle.</p><div><Button onClick={()=>setChannelMoveConfirm(null)}>Keep channeling</Button><Button disabled={!isMyTurn} onClick={()=>{sendMessage(channelMoveConfirm);setChannelMoveConfirm(null);}}>Move Bishop</Button></div></section></Modal>}
      {selfDestructConfirm&&<Modal className="golem-self-destruct-confirm"><section className="lens-discard-dialog" role="dialog" aria-modal="true"><FrontierArt type={activeColor==='w'?'golem':'black_golem'} className="lens-confirm-art"/><h2>Self-destruct Golem at {selfDestructConfirm}?</h2><p>Destroys this Golem and captures adjacent unprotected pieces in the highlighted area.</p><small>Move action · This cannot be undone with Activate the Clock.</small><div><Button onClick={()=>setSelfDestructConfirm(null)}>Cancel</Button><Button variant="danger" disabled={!isMyTurn||!!golemSelfDestructError(gameState,activeColor,selfDestructConfirm)} onClick={()=>{sendMessage({type:'frontier_self_destruct',from:selfDestructConfirm});setSelfDestructConfirm(null);setGolemActionSquare(null);}}>Self-destruct</Button></div></section></Modal>}
      {bannerConfirm&&<Modal className="lens-discard-backdrop"><section className="lens-discard-dialog" role="dialog" aria-modal="true"><V5Piece type="p" color={activeColor} className="w-16 h-16 mx-auto"/><h2>Summon Pawn at {bannerConfirm}?</h2><p>Footsoldier’s Banner is a single-use move action.</p><div><Button onClick={()=>setBannerConfirm(null)}>Choose another square</Button><Button variant="primary" disabled={!isMyTurn||!boardItemSquares.includes(bannerConfirm)} onClick={()=>{sendMessage({type:'frontier_item',item:'banner',to:bannerConfirm});clearFrontierSelection();}}>Activate</Button></div></section></Modal>}
      <FrontierExpandOffer key={`expand-offer-${roomId}`} state={gameState} color={activeColor} enabled={!tutorialMode&&myColor!=='spectator'&&isMyTurn} paused={otherPopupActive} onOpenChange={setExpansionOfferOpen} send={sendMessage}/>
      <FrontierDropNotices key={roomId} state={gameState} paused={isAnyPopupActive&&gameState.status==='playing'}/>
      {featherConfirm&&<Modal className="lens-discard-backdrop"><section className="lens-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="feather-confirm-title"><h2 id="feather-confirm-title">Use Feather of the Fallen?</h2>{featherConfirm.piece.type==='golem'?<FrontierArt type={activeColor==='w'?'golem':'black_golem'} className="lens-confirm-art"/>:<PieceIcon type={featherConfirm.piece.type} color={featherConfirm.piece.color} className="w-16 h-16 mx-auto"/>}<p>Revive <strong>{{p:'Pawn',sp:'Super Pawn',n:'Knight',sn:'Super Knight',b:'Bishop',r:'Rook',q:'Queen',golem:'Golem',berserker:'Berserker',musketeer:'Musketeer',summoner:'Summoner',ninja:'Ninja'}[featherConfirm.piece.type]}</strong>?</p><small>Single-use move action. Choose an empty square on your first rank next.</small><div><Button onClick={()=>setFeatherConfirm(undefined)}>Cancel</Button><Button variant="primary" disabled={!isMyTurn} onClick={()=>{setFeatherChoice(featherConfirm);setFeatherConfirm(undefined);setFrontierItemMode('feather');}}>Activate</Button></div></section></Modal>}
      {lensCandidate&&<Modal className="lens-discard-backdrop"><section className="lens-discard-dialog" role="dialog" aria-modal="true" aria-labelledby="lens-confirm-title"><FrontierArt type="lens" className="lens-confirm-art"/><h2 id="lens-confirm-title">Use Fateweaver’s Lens?</h2><p>Discard <strong>{lensCandidate.name.toUpperCase()}</strong> and draw a replacement?</p><small>Free action · once per turn</small><div><Button onClick={()=>setLensCandidate(null)}>Choose another card</Button><Button variant="primary" disabled={!isMyTurn||isJokerLocked||!currentHand.some(c=>c.id===lensCandidate.id)} onClick={()=>{sendMessage({type:'frontier_item',item:'lens',cardId:lensCandidate.id});setLensCandidate(null);setLensMode(false);}}>Activate</Button></div></section></Modal>}
      {frontierIntro&&<FrontierIntro onClose={()=>setFrontierIntro(false)}/>}
      {gameState.pendingSummon && (myColor===gameState.pendingSummon.player) && <div className="ground-popup"><section className="ground-dialog summon-choice-dialog" role="dialog" aria-modal="true" aria-label="Choose a piece to revive"><h2>Summoning circle is ready</h2><p>Choose a captured piece to revive on {gameState.summoningCircles?.find(c=>c.id===gameState.pendingSummon!.circleId)?.square}. This is free. The chess clock is paused.</p><div className="revival-options">{eligibleRevives(gameState,gameState.pendingSummon.player).map(({piece,index})=><button className="revival-choice" key={index} onClick={()=>{  sendMessage({type:'resolve_summon',captureIndex:index}); }}><V5Piece type={piece.type} color={gameState.pendingSummon!.player} className="w-16 h-16"/><span>{piece.type==='sp'?'Super Pawn':piece.type==='sn'?'Super Knight':({p:'Pawn',n:'Knight',b:'Bishop',r:'Rook',q:'Queen'} as any)[piece.type]}</span></button>)}</div><div className="flex justify-end mt-3"><button onClick={()=>sendMessage({type:'resolve_summon',captureIndex:null})}>Decline revival</button></div></section></div>}
      {mode==='online'&&(recoveryRequired||(myColor!=='spectator'&&gameState.status==='playing'&&recovery.length>0))&&<RecoveryPanel roomId={roomId} recovery={recovery} myColor={myColor} send={sendMessage} requestCode={recoveryRequired||myColor==='spectator'} onDismiss={()=>setRecoveryRequired(false)} onLeave={()=>{sendMessage({type:'return_to_lobby'});handleJoinRoom(generateRandomRoomCode(),'online');}}/>}
      {showArbiterPause&&arbiterPaused&&myColor!=='spectator'&&<Modal><section className="viewer-dialog"><h2 className="pause-info-title">Match paused</h2><p>The Arbiter paused the clock. Cards and piece moves are disabled until the Arbiter resumes the match.</p><Button aria-label="Close dialog" onClick={()=>setShowArbiterPause(false)}>Got it</Button></section></Modal>}
      {tutorialMode&&<MainTutorialOverlay state={tutorialState} dispatch={tutorialDispatch} compact={compactUI} onExit={()=>onExitTutorial?.()} onOpenPanel={key=>setCompactPanel(key)} onResetSelection={()=>{setSelectedCard(null);setIsWildPowerUp(false);}}/>}
      {/* Top Header (Hidden in pre-stage lobby) */}
      {gameState.status !== 'lobby' && (
        <>
          <GameHeader viewerTools={viewerTools} isArbiter={roomPlayers[playerId]?.role==='arbiter'} arbiterPaused={arbiterPaused} onToggleArbiterPause={()=>sendMessage({type:'arbiter_pause',paused:!arbiterPaused})}
            compact={compactUI}
            onOpenGrounds={()=>setGroundsIntro(true)}
            grounds={gameState.grounds}
            roomId={roomId}
            myColor={myColor}
            turn={gameState.turn}
            mode={mode}
            whitePoints={gameState.whitePoints}
            blackPoints={gameState.blackPoints}
            status={gameState.status}
            clock={gameState.clock || { enabled: false, initialMinutes: 5, incrementSeconds: 0, w: 300, b: 300, lastTick: null, isRunning: false }}
            isCheck={isCurrentKingInCheck}
            onOpenRules={()=>openRules()}
            onOpenClockConfig={() => setIsClockModalOpen(true)}
            onResign={() => setConfirmResign(true)}
            onSwitchMode={handleSwitchMode}
            onReturnToLobby={handleReturnToLobby}
          />

          {/* Connection & Mode Sub-Bar */}
          <div className="connection-subbar bg-white/80 dark:bg-stone-900/80 border-b border-stone-200/90 dark:border-stone-800 px-4 py-1.5 text-xs text-stone-600 dark:text-stone-400 shadow-2xs transition-colors">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              {/* Left Side: Player Identity / Mode */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] flex items-center gap-1 text-stone-500 dark:text-stone-400">
                  You play as: <strong className="text-stone-800 dark:text-stone-200 capitalize font-bold">
                    {myColor === 'w' ? 'White (P1)' : myColor === 'b' ? 'Black (P2)' : 'Spectator'}
                  </strong>
                </span>
              </div>

              {/* Right Side: Room code on the left of synced status */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                  <span className="font-semibold text-stone-400 dark:text-stone-500">Room:</span>
                  <span className="font-mono font-bold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-2 py-0.5 rounded border border-stone-200/80 dark:border-stone-700 select-all">
                    {roomId}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {connected ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Synced</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
                      <span className="text-[11px] text-blue-700 dark:text-blue-400 font-semibold">Reconnecting...</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Content: Room Lobby or Game Arena */}
      {gameState.status === 'lobby' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 flex items-center justify-center">
          <RoomLobby roomTools={viewerTools} onClaimArbiter={()=>sendMessage({type:'claim_arbiter'})} onReturnAsPlayer={()=>sendMessage({type:'return_as_player'})}
            roomId={roomId}
            mode={mode}
            players={roomPlayers}
            myPlayerId={playerId}
            myColor={myColor}
            lobbyConfig={lobbyConfig}
            onUpdateConfig={handleUpdateLobbyConfig}
            onStartGame={handleStartGameFromLobby}
            onOpenRules={openRules}
            onSwitchMode={handleSwitchMode}
            onJoinRoom={handleJoinRoom}
            onRenamePlayer={handleRenamePlayer}
            onExitLobby={()=>sendMessage(myColor==='spectator'?{type:'quit_viewing'}:{type:'exit_to_new_lobby'})}
            onRegenerateRoom={()=>sendMessage({type:'regenerate_room_code'})}
            onSetPlayerReady={handleSetPlayerReady}
          />
        </main>
      ) : (
        /* Main Game Arena */
        <MatchMotion game={gameState} viewColor={activeColor} session={`${roomId}:${mode}`} connected={connected}>
        <main className="game-layout flex-1 w-full mx-auto grid items-start" data-handoff={handoffPending || undefined} aria-busy={handoffPending}>
        {!compactUI && <aside className="desktop-left-column">
          <DiscardAndDeck hiddenDeckCount={gameState.hiddenDeckCount} historyLog={gameState.historyLog} unseenHandCards={activeVision?[]:opponentHand.filter(card=>!card.knownStartingPawnFor)} deckCards={gameState.deck} discardPile={gameState.discard} exhaustedCards={gameState.exhausted || []} isMyTurn={isMyTurn}/>
          <section className="desktop-left-chat glass-panel"><h2>Chat{unreadChat>0?` (${unreadChat})`:''}</h2>{mode==='online'?<ChatPanel messages={chatMessages} onSendMessage={text=>{sendMessage({type:'send_chat',text});setUnreadChat(0);}} playerId={playerId} playerName={playerName} myColor={myColor} disabled={!connected}/>:<p className="desktop-chat-placeholder">Chat is available in online matches.</p>}</section>
        </aside>}
        {phoneLandscape && <aside className="landscape-support-column">
          <div ref={setLandscapeOpponentHost} className="landscape-tag-host"/>
          <button onClick={()=>setCompactPanel('powers')}><Zap size={17}/>Power-ups & Items</button>
          <div className="landscape-info-actions"><button onClick={()=>setCompactPanel('info')}><Info size={16}/>Info</button>{opponentWidget}</div>
          <div ref={setLandscapeDescriptionHost} className="landscape-description-host"/>
          <div ref={setLandscapePlayerHost} className="landscape-tag-host landscape-own-tag"/>
        </aside>}
        {/* Left Column: Board & Cards */}
        <div className="game-main flex flex-col gap-3">
          <div className="compact-top-stack">
          {landscapeTag(<div className="opponent-tag-row">
          <PlayerPanel actions={compactUI?<>{!phoneLandscape&&opponentWidget}{mode==='online'&&<button className="tag-icon-button" aria-label="Open chat" onClick={()=>{setChatOpen(true);setUnreadChat(0);}}><MessageSquare size={17}/>{unreadChat>0&&<small>{unreadChat}</small>}</button>}{!phoneLandscape&&<button className="tag-icon-button" aria-label="Open match info" onClick={()=>setCompactPanel('info')}><Info size={19}/></button>}</>:opponentWidget} onInspectCaptures={() => setCaptureViewer(opponentColor)} color={opponentColor}
            name={Object.values(roomPlayers).find(player => player.color === opponentColor)?.name || (opponentColor === 'w' ? 'White player' : 'Black player')}
            active={gameState.turn === opponentColor} cards={gameState.handCounts?.[opponentColor]??gameState.hands[opponentColor].length}
            points={opponentColor === 'w' ? gameState.whitePoints : gameState.blackPoints}
            champion={gameState.champions?.[opponentColor]}
            shieldTurns={Math.max(0, ...(gameState.awakenedRooks || []).filter(rook => rook.color === opponentColor).map(rook => rook.turnsRemaining))}
            beaconTurns={gameState.beaconEffect?.active ? Math.max(0, (gameState.beaconEffect.expiresOnTurnNumber ?? (gameState.turnNumber + 6)) - gameState.turnNumber) : undefined}
          />
                    {/* Opponent Hand Display & Power-Up Status */}


          </div>,landscapeOpponentHost)}
          {compactUI&&<div className="frontier-board-toolbar"><div ref={setBoardControlsHost} className="compact-board-controls-host"/></div>}
          </div>

          {/* Clock Block Warning Notification Banner */}
          {clockBlockToast && <Toast onDismiss={()=>setClockBlockToast(null)}>Cannot Activate Clock: {clockBlockToast}</Toast>}

          <div className="pc-board-region">
          {!compactUI&&<><div className="pc-board-tools"><div ref={setBoardControlsHost} className="compact-board-controls-host"/></div>{gameState.frontier?.expanded&&<div className="pc-board-zoom"><button className="player-zoom-switch" role="switch" aria-checked={frontierZoomOut} aria-label="Zoom out board" onClick={()=>setFrontierZoomOut(v=>!v)}><span className="zoom-switch-track"><span/></span>Zoom out</button></div>}</>}
          {/* Interactive Chess Board */}
          <div ref={boardViewport} className="board-viewport"><div className="board-stage flex justify-center">
                          {frontierItemMode&&<div className="ground-controls frontier-deploy-guide"><strong>{itemGuide}</strong>{frontierItemMode==='sigil'&&<button className="ui-button ui-button--primary" disabled={!boardItemTargets.length||!isMyTurn} onClick={submitBoardItem}>Activate{boardItemTargets.length?` · ${boardItemTargets.join(', ')}`:''}</button>}<button onClick={()=>{setFrontierItemMode(null);setWingsFrom(null);setFeatherChoice(undefined);}}>Cancel</button></div>}{golemPlacement&&<div className="ground-controls frontier-deploy-guide"><strong>Deploy Golem · choose an empty square on your first rank</strong><button onClick={()=>setGolemPlacement(false)}>Cancel</button></div>}{groundMode&&<div className="ground-controls"><strong>{groundMode==='transport'?'Choose your piece on a portal to warp':groundMode==='portal'&&!portalFrom?'Choose a portal to relocate':`Place ${GROUND_NAMES[groundMode as GroundType]}`}</strong><button onClick={()=>{setGroundMode(null);setGroundSquare(null);}}>Cancel</button></div>}
<ChessBoard
              frontier={gameState.frontier} frontierGame={gameState}
              tutorialGuide={tutorialMode?{from:tutorialState.step<8?TUTORIAL_ROUTE[tutorialState.step][0]:null,to:tutorialState.step<8?TUTORIAL_ROUTE[tutorialState.step][1]:null,guard:square=>{const allowed=tutorialSquareAllowed(tutorialState,square);if(allowed&&createSafeChess(tutorialState.fen).get(square as any)?.color==='w')tutorialDispatch({type:'square',value:square});return allowed;}}:undefined}
              controlsHost={boardControlsHost}
              powerUpRecipient={myColor==='spectator'?undefined:myColor}
              hasPopup={isAnyPopupActive}
              capturedPieceTypes={(gameState.captures?.[opponentColor]||[]).filter(p=>p.color===activeColor&&['p','sp','n','sn','b','r','q'].includes(p.type)).map(p=>(p.type==='sp'?'p':p.type==='sn'?'n':p.type) as StandardPieceType)}
              grounds={gameState.grounds}
              groundNotice={groundNotice} onDismissGroundNotice={()=>setGroundNotice(null)}
              hands={gameState.hands} historyLog={gameState.historyLog} summoningCircles={gameState.summoningCircles} soulSummons={gameState.soulSummons} pieceIds={gameState.pieceIds}
              blastSquares={selfDestructConfirm?golemBlastSquares(gameState,selfDestructConfirm):[]}
              groundTargets={['star','banner','sigil'].includes(frontierItemMode||'')?[...boardItemSquares,...boardItemTargets]:frontierItemMode==='wings'?(wingsFrom?wingsTargets(gameState,activeColor,wingsFrom):allSquares(gameState.fen).filter(q=>occupant(gameState,q)?.color===activeColor)):frontierItemMode==='feather'?allSquares(gameState.fen).filter(q=>q.slice(1)===(activeColor==='w'?'1':'8')&&emptyFrontierSquare(gameState,q)):golemPlacement?allSquares(gameState.fen).filter(q=>q.slice(1)===(activeColor==='w'?'1':'8')&&emptyFrontierSquare(gameState,q)):gameState.frontier?.expanded&&selectedCard?.type==='traverse'&&!frontierFrom&&!groundMode?allSquares(gameState.fen).filter(q=>occupant(gameState,q)?.color===activeColor):gameState.frontier?.expanded&&frontierFrom&&!groundMode?(selectedCard?.type==='traverse'?traverseTargets(gameState,activeColor,frontierFrom):frontierMoves(gameState,frontierFrom,occupant(gameState,frontierFrom)?.type==='golem'?({pawn:'k',knight:'n',bishop:'b',rook:'r',queen:'q'} as any)[selectedCard?.type||'']:undefined,occupant(gameState,frontierFrom)?.type==='golem'&&selectedCard?.type!=='pawn')):selectedCard?.type==='soul_release'&&isMyTurn?soulTargets(gameState,selectedCard,activeColor):validGroundTargets}
              onGroundSquare={q=>{if(!groundMode&&!selectedCard&&!frontierItemMode&&!lensMode&&!golemPlacement&&!isWildPowerUp&&!isMonolithPowerUp&&isMyTurn){const golem=gameState.frontier?.golems.find(g=>g.square===q&&g.owner===activeColor);if(golem){setGolemActionSquare(q);return true;}if(golemActionSquare){setGolemActionSquare(null);return true;}}if(['star','banner','sigil'].includes(frontierItemMode||'')){if(!isMyTurn)return true;
                if(frontierItemMode==='star'){if(occupant(gameState,q)?.color===activeColor&&starTargets(gameState,activeColor,q).length){setBoardItemFrom(q);setBoardItemTargets([]);}else if(boardItemFrom&&boardItemSquares.includes(q)){sendMessage({type:'frontier_item',item:'star',from:boardItemFrom,to:q});setFrontierItemMode(null);setBoardItemFrom(null);setBoardItemTargets([]);}}
                else if(frontierItemMode==='banner'&&boardItemSquares.includes(q))setBannerConfirm(q);
                else if(frontierItemMode==='sigil'){if(selectedChampion?.type==='summoner'&&!boardItemFrom&&boardItemSquares.includes(q)){setBoardItemFrom(q);setBoardItemTargets([]);}else if(boardItemSquares.includes(q)){if(selectedChampion?.type==='ninja')setBoardItemTargets(old=>old.includes(q)?old.filter(x=>x!==q):old.length<2?[...old,q]:[old[1],q]);else setBoardItemTargets([q]);}}
                return true;}if(frontierItemMode==='wings'){if(!isMyTurn)return true;if(occupant(gameState,q)?.color===activeColor){setWingsFrom(q);return true;}if(wingsFrom&&wingsTargets(gameState,activeColor,wingsFrom).includes(q)){sendFrontierBoardMove(wingsFrom,{type:'frontier_item',item:'wings',from:wingsFrom,to:q});setFrontierItemMode(null);setWingsFrom(null);}return true;}if(frontierItemMode==='feather'){if(isMyTurn&&featherChoice&&q.slice(1)===(activeColor==='w'?'1':'8')&&emptyFrontierSquare(gameState,q)){sendMessage({type:'frontier_item',item:'feather',to:q,captureIndex:featherChoice.index});setFrontierItemMode(null);setFeatherChoice(undefined);}return true;}if(lensMode)return true;if(golemPlacement){if(isMyTurn&&q.slice(1)===(activeColor==='w'?'1':'8')&&emptyFrontierSquare(gameState,q)){sendMessage({type:'frontier_item',item:'core',to:q});setGolemPlacement(false);}return true;}if(gameState.frontier?.expanded&&!groundMode&&isMyTurn&&(selectedCard?.type==='traverse'||selectedCard&&['pawn','knight','bishop','rook','queen'].includes(selectedCard.type)&&(occupant(gameState,q)?.type==='golem'||!!frontierFrom&&occupant(gameState,frontierFrom)?.type==='golem'))){const piece=occupant(gameState,q);if(piece?.color===activeColor){setFrontierFrom(q);return true;}if(frontierFrom){if(selectedCard?.type==='traverse'&&!traverseTargets(gameState,activeColor,frontierFrom).includes(q))return true;sendFrontierBoardMove(frontierFrom,{type:occupant(gameState,frontierFrom)?.type==='golem'?'frontier_golem_move':'play_card_move',cardId:selectedCard!.id,from:frontierFrom,to:q} as any);setFrontierFrom(null);setSelectedCard(null);}return true;}if(selectedCard?.type==='soul_release'){if(isMyTurn&&soulTargets(gameState,selectedCard,activeColor).includes(q)){sendMessage({type:'play_soul_release',cardId:selectedCard.id,targetSquare:q});setSelectedCard(null);}return true;}if(!groundMode)return false;if(!isMyTurn || !validGroundTargets.includes(q))return true;if(groundMode==='portal'&&!portalFrom){if(gameState.grounds?.tiles[q]==='portal')setPortalFrom(q);return true;}setGroundSquare(q);return true;}}

              fen={gameState.fen}
              onOpenChat={!compactUI && mode === 'online' ? () => { setChatOpen(true); setUnreadChat(0); } : undefined}
              unreadChat={unreadChat}
              myColor={activeColor}
              turn={gameState.turn}
              turnNumber={gameState.turnNumber}
              isMyTurn={isMyTurn}
            hand={currentHand}
              selectedCard={selectedCard}
              onSelectCard={myColor==='spectator'?()=>{}:handleSelectCard}
              restrictedSquares={gameState.restrictedSquares}
              monolithSquare={gameState.monolithSquare}
              monolithLastMovedTurn={gameState.monolithLastMovedTurn}
              lastMovedPiece={lastPieceMoved}
              lastMovedSquare={lastMovedSquare}
              lastMoveDetails={gameState.lastMoveDetails}
              isWildPowerUp={isWildPowerUp}
              isMonolithPowerUp={isMonolithPowerUp}
              champions={gameState.champions}
              beaconEffect={gameState.beaconEffect}
              staticEffect={gameState.staticEffect}
              clockAlert={gameState.clockAlert}
              clockBlockReason={clockBlockReason}
              onDismissClockAlert={handleDismissClockAlert}
              passRedrawAlert={gameState.passRedrawAlert}
              onDismissPassRedrawAlert={handleDismissPassRedrawAlert}
              superPawns={gameState.superPawns}
              superKnights={gameState.superKnights}
              awakenedRooks={gameState.awakenedRooks}
              awakenedPieces={gameState.awakenedPieces}
              awakenedPieceSquare={gameState.awakenedPieceSquare}
              championMarks={gameState.championMarks}
              awakeningAlert={gameState.awakeningAlert}
              onDismissAwakeningAlert={handleDismissAwakeningAlert}
              awakeningMode={awakeningMode}
              onSetAwakeningMode={setAwakeningMode}
              onMove={handleStandardMove}
              onPushMove={handlePushMove}
              onSwitchMove={handleSwitchMove}
              onRestrictSquare={handleRestrictSquare}
              onPlaceMonolith={handlePlaceMonolith}
              onDeployChampion={handleDeployChampion}
              onChampionMove={handleChampionMove}
              onChampionUltimate={handleChampionUltimate}
              onPlayAwakeningPawn={handlePlayAwakeningPawn}
              onPlayAwakeningRook={handlePlayAwakeningRook}
              onPlayAwakeningKnight={handlePlayAwakeningKnight}
              onPlayAwakeningBishop={handlePlayAwakeningBishop}
              onPlayAwakeningQueen={handlePlayAwakeningQueen}
              onPlayAwakeningKing={handlePlayAwakeningKing}
              onPlayAwakeningAsWild={handlePlayAwakeningAsWild}
            />


              {gameState.status==='playing' && gameState.pendingPortal && isMyTurn && <div className="ground-popup"><section className="ground-dialog" role="dialog" aria-modal="true" aria-label="Portal warp choice"><h2>Use the Portal?</h2><p>Your piece landed on {gameState.pendingPortal.from}. Warp to the opposite Portal for free, or stay here and end your turn.</p><div className="flex justify-end gap-2"><button disabled={!travelTarget} onClick={()=>sendMessage({type:'resolve_portal',transport:true})}>Warp (Free)</button><button onClick={()=>sendMessage({type:'resolve_portal',transport:false})}>Stay & end turn</button></div></section></div>}
              {groundsIntro&&gameState.grounds&&<GroundsIntro grounds={gameState.grounds} onClose={()=>setGroundsIntro(false)}/>}
              {groundMode&&groundSquare&&<div className="ground-popup"><section className="ground-dialog placement-dialog" role="dialog" aria-modal="true" aria-label="Confirm tile action"><div className="placement-heading"><V5Power type={groundMode==='transport'?'portal':groundMode} className="w-16 h-16"/><h2>{groundMode==='transport'?'Warp through portal?':`Place ${GROUND_NAMES[groundMode as GroundType]}?`}</h2></div><p className="placement-meta"><strong>{groundSquare.toUpperCase()}</strong> · {groundMode==='transport'?'Free action, once per turn':'Uses your move action'}</p>{groundMode!=='transport'&&<p className="placement-description">{GROUND_DESCRIPTION[groundMode]}</p>}<div className="placement-actions"><button className="confirm-primary" onClick={()=>{ sendMessage(groundMode==='transport'?{type:'portal_move',from:groundSquare}:{type:'place_ground',groundType:groundMode as GroundType,square:groundSquare,portalFrom:portalFrom||undefined});setGroundMode(null);setGroundSquare(null);}}>Place here</button><button onClick={()=>setGroundSquare(null)}>Choose another square</button></div></section></div>}

          </div></div>
          </div>

          {golemActionSquare&&gameState.frontier?.golems.some(g=>g.square===golemActionSquare&&g.owner===activeColor)&&<PopupLayer><aside className="golem-floating-controls"><GolemActionPanel state={gameState} color={activeColor} square={golemActionSquare} disabled={!isMyTurn} onSelfDestruct={()=>setSelfDestructConfirm(golemActionSquare)} onCancel={()=>{setGolemActionSquare(null);setSelfDestructConfirm(null);}}/></aside></PopupLayer>}

          {/* Player Hand */}
          <div className={`match-hand-dock ${selectedCard?'dock-has-description':''}`}>
          {landscapeTag(<div className="dock-player-tag">{chestNotice&&<div className="chest-key-notice" role="status">{chestNotice}</div>}{compactUI&&gameState.frontier?.expanded&&<div className="player-zoom-row"><button className="player-zoom-switch" role="switch" aria-checked={frontierZoomOut} aria-label="Zoom out board" onClick={()=>setFrontierZoomOut(v=>!v)}><span className="zoom-switch-track"><span/></span>Zoom out</button></div>}<PlayerPanel deckCount={compactUI?(gameState.hiddenDeckCount??gameState.deck.length):undefined} onInspectCaptures={() => setCaptureViewer(activeColor)} color={activeColor}
            name={Object.values(roomPlayers).find(player => player.color === activeColor)?.name || (activeColor === 'w' ? 'White player' : 'Black player')}
            active={gameState.turn === activeColor} cards={gameState.handCounts?.[activeColor]??gameState.hands[activeColor].length}
            points={activeColor === 'w' ? gameState.whitePoints : gameState.blackPoints}
            turnLabel={gameState.turn === activeColor ? (myColor === 'spectator' ? 'To move' : 'Your turn') : undefined}
            champion={gameState.champions?.[activeColor]}
            shieldTurns={Math.max(0, ...(gameState.awakenedRooks || []).filter(rook => rook.color === activeColor).map(rook => rook.turnsRemaining))}
            beaconTurns={gameState.beaconEffect?.active ? Math.max(0, (gameState.beaconEffect.expiresOnTurnNumber ?? (gameState.turnNumber + 6)) - gameState.turnNumber) : undefined}
          />
          </div>,landscapePlayerHost)}
          {compactUI&&<div className="compact-dock-actions"><button onClick={()=>setCompactPanel('powers')}><Zap size={16}/>Power-ups & Items</button>{travelTarget && <button disabled={!isMyTurn || Boolean(gameState.pendingPortal)} onClick={()=>{if(isMyTurn)sendMessage({type:'portal_move',from:travelTarget.from});}}>Travel (Free)</button>}<button disabled={!isMyTurn || isJokerLocked} onClick={handleOpenDiscardRedraw}><RefreshCw size={14}/>Redraw / Pass</button></div>}
          {lensMode&&<div className="lens-hand-guide"><span>Fateweaver’s Lens · click a card to discard and replace.</span><button onClick={()=>{setLensMode(false);setLensCandidate(null);}}>Cancel</button></div>}
          <div className="desktop-hand-layout">
          {myColor==='spectator'&&roomPlayers[playerId]?.role!=='arbiter'?<div className="viewing-hand-placeholder"><span>Spectator · hands and traps are hidden</span><Button className="ck-leave-button" onClick={handleReturnToLobby}>Quit viewing</Button></div>:(          <CardHand desktopActions={!compactUI?<div className="pc-hand-actions"><button disabled={!isMyTurn || isJokerLocked} onClick={handleOpenDiscardRedraw}><RefreshCw size={14}/>Redraw / Pass</button>{travelTarget&&<button disabled={!isMyTurn||Boolean(gameState.pendingPortal)} onClick={()=>{if(isMyTurn)sendMessage({type:'portal_move',from:travelTarget.from});}}>Travel (Free)</button>}</div>:undefined} suppressJokerSurgePopup={tutorialMode} compact={compactUI} floatingDetails={!compactUI} descriptionHost={phoneLandscape?landscapeDescriptionHost:!compactUI?desktopDescriptionHost:undefined}
            disabledSoulIds={currentHand.filter(c=>c.type==='soul_release'&&!soulTargets(gameState,c,activeColor).length).map(c=>c.id)}
            discardMode={lensMode} boundCardId={gameState.frontier?.bind?.target===activeColor?gameState.frontier.bind.cardId:undefined} hand={currentHand}
            selectedCardId={lensMode?lensCandidate?.id||null:selectedCard?.id || null}
            onSelectCard={myColor==='spectator'?()=>{}:handleSelectCard}
            onPlayRefresh={cardId=>{if(!isMyTurn||isJokerLocked)return;sendMessage({type:'play_refresh',cardId});setSelectedCard(null);}}
            onPlayJoker={handlePlayJoker}
            onPlayBeacon={handlePlayBeacon}
            onPlayStatic={handlePlayStatic}
            onPlayClock={handlePlayClock}
            onTravel={undefined}
            canTravel={Boolean(isMyTurn&&travelTarget&&!gameState.pendingPortal)}
            onOpenDiscardRedraw={undefined}
            isJokerLocked={isJokerLocked}
            isMyTurn={isMyTurn}
            playerColor={activeColor}
            lastMovedPiece={lastPieceMoved}
            monolithSquare={gameState.monolithSquare}
            activeChampion={gameState.champions ? gameState.champions[activeColor] : null}
            clockBlockReason={clockBlockReason}
            onClockBlocked={handleClockBlocked}
            awakeningMode={awakeningMode}
            onSetAwakeningMode={setAwakeningMode}
            isKingInCheck={isCurrentKingInCheck}
            checkEscapeCardTypes={checkEscapeCardTypes}
          />)}

          {!compactUI && <div ref={setDesktopDescriptionHost} className="desktop-description-host"/>}
          </div>
          </div>
        </div>

        {/* Right Column: Controls, Deck/Discard, Power-ups & History Log */}
        <aside className="game-sidebar">
          {/* Deck & Discard Pile */}
          {compactUI && <DiscardAndDeck
            hiddenDeckCount={gameState.hiddenDeckCount} compact={compactUI} openRequest={pileRequest}
            historyLog={gameState.historyLog} unseenHandCards={activeVision?[]:opponentHand.filter(card=>!card.knownStartingPawnFor)} deckCards={gameState.deck}
            discardPile={gameState.discard}
            exhaustedCards={gameState.exhausted || []}
            isMyTurn={isMyTurn}
          />}

          {/* Tactical Power-Ups */}
          {!compactUI && tacticalPowers}

          {!compactUI && <GameLog historyLog={gameState.historyLog} trapsEnabled={Boolean(gameState.expansions?.treacherousGrounds)}/>}
        </aside>
      </main>
      </MatchMotion>
      )}

      {gameState.status !== 'lobby' && <PopupLayer><div data-mobile-device={typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) ? "true" : "false"} className="portrait-guard" role="alert"><Maximize size={40}/><h2>Rotate to portrait</h2><p>Rotate your device to continue playing.</p><small>The match and chess clock continue running.</small></div></PopupLayer>}
      {compactUI && compactPanel && <Modal className="compact-modal-backdrop" onClick={()=>setCompactPanel(null)}><section className="compact-dialog" onClick={e=>e.stopPropagation()}><div className="compact-dialog-heading"><h2>{compactPanel==='info'?'Match Info':compactPanel==='powers'?'Power-ups & Items':'Game Log'}</h2><button aria-label="Close dialog" onClick={()=>setCompactPanel(null)}><X size={20}/></button></div>
        {compactPanel==='info' && <div className="compact-info-list"><button onClick={()=>{setCompactPanel(null);setPileRequest({type:'deck',id:Date.now()});}}><Layers/><span>Draw Pile<small>{(gameState.hiddenDeckCount??gameState.deck.length)} cards remaining</small></span><span>›</span></button><button onClick={()=>{setCompactPanel(null);setPileRequest({type:'discard',id:Date.now()});}}><ScrollText/><span>Discard & Exhausted<small>Last played: {gameState.discard.at(-1)?.name || 'None'}</small></span><span>›</span></button><button onClick={()=>{setCompactPanel(null);setOpponentInfoRequest(v=>v+1);}}><Zap/><span>Opponent’s Power-ups<small>View available power-ups</small></span><span>›</span></button><button onClick={()=>setCompactPanel('log')}><ScrollText/><span>Game Log<small>Moves and match events</small></span><span>›</span></button></div>}
        {compactPanel==='powers' && tacticalPowers}
        {compactPanel==='log' && <GameLog historyLog={gameState.historyLog} trapsEnabled={Boolean(gameState.expansions?.treacherousGrounds)}/>}
      </section></Modal>}
      {gameState.status==='playing'&&<MatchActivityNotices key={`${roomId}:${mode}`} state={gameState} color={activeColor} sharedDevice={false}/> }
      {gameState.status==='playing'&&gameState.expansions?.theAwakening===true&&(myColor!=='spectator')&&<AwakeningTutorial key={roomId} sharedDevice={false} hands={gameState.hands} color={activeColor} paused={handoffPending||groundsIntro} onOpenChange={setAwakeningTutorialOpen}/>}
      {mode === 'online' && <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} messages={chatMessages} onSendMessage={text => sendMessage({type:'send_chat',text})} playerId={playerId} playerName={playerName} myColor={myColor} disabled={!connected} />}
      {deployedChampion && <ChampionInfoDialog champion={deployedChampion} deployed onClose={()=>setDeployedChampion(null)}/>}
      {uiNotice && <Toast onDismiss={() => setUiNotice(null)}>{uiNotice}</Toast>}
      {idleReminder && <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <section className="glass-panel w-full max-w-sm p-5 text-center" role="dialog" aria-modal="true" aria-label="Your turn reminder">
          <h2 className="font-bold text-lg">It’s your turn!</h2>
          <p className="text-sm my-3">You’ve been inactive for 45 seconds. Ready to make your next move?</p>
          <Button onClick={() => setIdleReminder(false)}>Continue playing</Button>
        </section>
      </Modal>}
      {rematchRequest?.opponentId===playerId && <Modal className="result-backdrop rematch-backdrop">
        <section className="rematch-dialog" role="dialog" aria-modal="true" aria-label="Rematch request">
          <h2>Rematch request</h2><p>Your opponent wants to play again with the same match settings.</p>
          <div className="result-secondary-actions"><button onClick={()=>sendMessage({type:'respond_rematch',requestId:rematchRequest.id,accept:false})}>Decline</button><button className="result-primary" onClick={()=>sendMessage({type:'respond_rematch',requestId:rematchRequest.id,accept:true})}>Accept</button></div>
        </section>
      </Modal>}
      {/* Modals */}
      {captureViewer && <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="capture-dialog glass-panel w-full max-w-md p-4">
          <div className="flex justify-between items-center gap-3"><h2 className="font-bold">Pieces captured by {captureViewer === 'w' ? 'White' : 'Black'}</h2><Button variant="ghost" aria-label="Close dialog" onClick={() => setCaptureViewer(null)}>×</Button></div>
          {(gameState.captures?.[captureViewer] || []).length ? <div className="captured-piece-grid">{gameState.captures![captureViewer].map((piece,index) => <div key={index} title={piece.type} className="captured-piece-tile">{piece.type==='golem'?<FrontierArt type={piece.color==='w'?'golem':'black_golem'} className="w-12 h-12"/>:<PieceIcon type={piece.type} color={piece.color} className="w-12 h-12" />}</div>)}</div> : <p className="text-sm mt-4">No pieces captured yet.</p>}
        </div>
      </Modal>}
      {confirmResign && <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="glass-panel w-full max-w-sm p-4"><h2 className="font-bold">Resign this match?</h2><p className="text-sm my-3">Your opponent will win the match.</p><div className="flex gap-2 justify-end"><Button onClick={() => setConfirmResign(false)}>Keep playing</Button><Button variant="danger" onClick={() => { sendMessage({type:'resign'}); setConfirmResign(false); }}>Resign</Button></div></div>
      </Modal>}
      <VictoryModal
        rematchPending={Boolean(rematchRequest)}
        sharedDevice={false}
        status={gameState.status}
        winner={gameState.winner}
        winReason={gameState.winReason}
        myColor={myColor}
        whitePoints={gameState.whitePoints}
        blackPoints={gameState.blackPoints}
        onRematch={handleRestartGame}
        onReturnToLobby={handleReturnToLobby}
      />

      <DiscardModal
        hand={currentHand}
        isOpen={isDiscardModalOpen}
        newCardIds={gameState.pendingSwapDiscard?.player === activeColor ? gameState.pendingSwapDiscard.newCardIds : []}
        onConfirmDiscard={handleConfirmDiscard}
        onCancel={() => {setIsDiscardModalOpen(false);if(tutorialMode)tutorialDispatch({type:'close-panel'});}}
      />

      <DiscardRedrawModal
        hand={currentHand}
        isOpen={isDiscardRedrawModalOpen}
        onConfirm={handleConfirmDiscardRedraw}
        onPassTurn={() => {
          handlePassTurn();
          setIsDiscardRedrawModalOpen(false);
          setSelectedCard(null);
        }}
        onCancel={() => {setIsDiscardRedrawModalOpen(false);if(tutorialMode)tutorialDispatch({type:'close-panel'});}}
      />

      <RulesModal onStartTutorial={()=>{setIsRulesModalOpen(false);setTutorialLaunch(true);}}
        initialSection={rulesSection}
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        hasShiftedParadigm={gameState.expansions?.shiftedParadigm !== false}
        hasChampionsOfTheMonolith={gameState.expansions?.championsOfTheMonolith !== false}
        hasTheAwakening={gameState.expansions?.theAwakening !== false}
      />

      <LobbyModal
        isOpen={isLobbyModalOpen}
        onJoinRoom={handleJoinRoom}
        onClose={() => setIsLobbyModalOpen(false)}
      />

      <ClockConfigModal
        isOpen={isClockModalOpen}
        clock={gameState.clock || { enabled: false, initialMinutes: 5, incrementSeconds: 0 }}
        onSave={handleSaveClockConfig}
        onClose={() => setIsClockModalOpen(false)}
      />

      {/* Opponent Pass & Redraw Confirmation Popup */}
      {gameState.passRedrawAlert && (myColor !== gameState.passRedrawAlert.player) && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 dark:bg-stone-950/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-purple-300 dark:border-purple-800 rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-xs">
              <RefreshCw className="w-6 h-6 animate-spin-once" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                Opponent Redrew Cards
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                {gameState.passRedrawAlert.player === 'w' ? 'White' : 'Black'} passed their turn and only redrew{' '}
                <strong>{gameState.passRedrawAlert.count ? `${gameState.passRedrawAlert.count} card${gameState.passRedrawAlert.count > 1 ? 's' : ''}` : 'cards'}</strong> (no chess piece was moved).
              </p>
            </div>
            <button
              type="button"
              id="btn-confirm-opponent-redraw"
              onClick={handleDismissPassRedrawAlert}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer active:scale-98"
            >
              OK, Got It
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
