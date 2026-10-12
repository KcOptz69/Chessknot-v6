import type {FrontierState, FrontierItem} from './utils/frontier.ts';
import type { Grounds, GroundType } from './utils/grounds.ts';
export type PlayerColor = 'w' | 'b';

export type StandardPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceType = StandardPieceType | 'm' | 'sp' | 'sn'; // 'm' for monolith, 'sp' for super pawn, 'sn' for super knight

export type CardType =
  | 'traverse'
  | 'pawn'
  | 'knight'
  | 'bishop'
  | 'rook'
  | 'queen'
  | 'soul_release'
  | 'wild'
  | 'refresh'
  | 'brick'
  | 'joker'
  | 'previous'
  | 'push'
  | 'switch'
  | 'restrict'
  | 'monolith'
  | 'beacon'
  | 'static'
  | 'clock'
  | 'champion'
  | 'awakening_pawn'
  | 'awakening_rook'
  | 'awakening_knight'
  | 'awakening_bishop'
  | 'awakening_queen'
  | 'awakening_king';

export type ChampionType = 'berserker' | 'musketeer' | 'summoner' | 'ninja';

export interface ChampionPiece {
  type: ChampionType;
  color: PlayerColor;
  square: string;
}

export interface AwakenedRookState {
  square: string;
  color: PlayerColor;
  turnsRemaining: number; // 5 turns countdown, ticks down each turn starting opponent's turn
  hasCaptured: boolean; // while awakened, can only capture once
}

export interface AwakeningAlertState {
  player: PlayerColor;
  cardType: CardType;
  cardName: string;
  effectTitle: string;
  effectDescription: string;
  pieceSquare?: string;
  timestamp: number;
}

export interface BeaconEffectState {
  active: boolean;
  protectedSquares: string[];
  expiresOnTurnNumber: number; // Active for 4 turns: activation turn, opp turn, next turn, opp next turn
}

export interface StaticEffectState {
  active: boolean;
  pending?: boolean;
  casterColor?: PlayerColor;
  procOnTurnNumber?: number; // Turn number when stun procs at opponent's 2nd turn
  expiresOnTurnNumber: number; // Turn number when stun expires
  stunnedSquares: string[];
}

export interface ClockAlertState {
  player: PlayerColor;
  message: string;
  timestamp: number;
}

export interface PassRedrawAlertState {
  player: PlayerColor;
  action: 'redraw' | 'pass';
  count?: number;
  message: string;
  timestamp: number;
}

export interface Card {
  id: string;
  type: CardType;
  name: string;
  description: string;
  isJokerWild?: boolean;
  knownStartingPawnFor?: PlayerColor;
  soul?: { queenId: string; piece: CapturedPiece };
}

export type PowerUpType = 'draw' | 'monolith' | 'wild' | 'vision';

export interface PowerUpAward {
  id:string; player:PlayerColor; turnNumber:number; type:PowerUpType; name:string; newCount:number;
}

export interface PowerUpsState {
  draw: number;     // Draw 2, discard 2 (stack count)
  monolith: number; // Add or move monolith (stack count)
  wild: number;     // Move any piece without card (stack count)
  vision: number;   // Reveal opponent's hand (stack count)
}

export interface GameClockState {
  enabled: boolean;
  initialMinutes: number;
  incrementSeconds: number;
  w: number; // remaining seconds
  b: number; // remaining seconds
  lastTick: number | null; // Date.now() timestamp when turn started
  isRunning: boolean;
}

export type GameStatus =
  | 'lobby'
  | 'waiting'
  | 'playing'
  | 'checkmate'
  | 'points_win'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'timeout';

export interface GameLogEntry {
  id: string;
  turn: PlayerColor;
  turnNumber: number;
  actionType:
    | 'move'
    | 'king_move'
    | 'castle'
    | 'push'
    | 'switch'
    | 'restrict'
    | 'monolith'
    | 'deck_refresh'
    | 'refresh'
    | 'joker'
    | 'powerup'
    | 'powerup_refresh'
    | 'pass'
    | 'beacon'
    | 'static'
    | 'clock'
    | 'champion_deploy'
    | 'champion_move'
    | 'champion_ultimate'
    | 'awakening'
    | 'revive'
    | 'soul_release';
  frontierEvent?: {kind:string;square?:string;item?:import('./utils/frontier.ts').FrontierItem;recipient?:PlayerColor};
  trapEventType?: string;
  cardName?: string;
  detail: string;
  timestamp: number;
  whitePoints: number;
  blackPoints: number;
  isCheck?: boolean;
}

export interface LastMoveDetails {
  player: PlayerColor;
  actionType:
    | 'move'
    | 'push'
    | 'switch'
    | 'monolith'
    | 'restrict'
    | 'refresh'
    | 'joker'
    | 'redraw'
    | 'pass'
    | 'draw_powerup'
    | 'powerup'
    | 'vision'
    | 'beacon'
    | 'static'
    | 'clock'
    | 'champion_deploy'
    | 'champion_move'
    | 'champion_ultimate'
    | 'awakening'
    | 'revive'
    | 'soul_release';
  from?: string | null;
  to?: string | null;
  intermediateSquare?: string | null;
  firstTo?: string | null;
  swappedSquares?: [string, string];
  monolithSquare?: string | null;
  monolithFrom?: string | null;
  restrictedSquare?: string | null;
  championType?: ChampionType;
  championSquare?: string;
  ultimateDetails?: string;
  awakeningType?: CardType;
  awakeningDetails?: string;
  musketeerSnipedSquare?: string | null;
  ninjaAssassinatedSquares?: string[] | null;
}

export interface GameExpansionsConfig {
  arcaneFrontier?: boolean;
  shiftedParadigm: boolean;
  championsOfTheMonolith?: boolean;
  theAwakening?: boolean;
  treacherousGrounds?: boolean;
  treacherousGroundsSelected?: string[];
}

export interface CapturedPiece { type: StandardPieceType | ChampionType | 'sp' | 'sn' | 'golem'; color: PlayerColor; capturedTurn?:number; }

export interface SummoningCircle { bishopSquare?:string; bishopId?:string; id:string; owner:PlayerColor; square:string; remaining:number; createdTurn:number; interrupted?:boolean; finished?:boolean; }
export interface SoulSummon { id:string; owner:PlayerColor; pieceId:string; remaining:number; createdTurn:number; }

export interface BoardSnapshot {
  frontier?: FrontierState;
  frontierLocked?: boolean;
  awakeningSkill?: boolean;
  summoningCircles?: SummoningCircle[];
  soulSummons?: SoulSummon[];
  pieceIds?: Record<string,string>;
  grounds?: Grounds;
  captures?: { w: CapturedPiece[]; b: CapturedPiece[] };
  fen: string;
  monolithSquare: string | null;
  restrictedSquares: string[];
  champions: {
    w: ChampionPiece | null;
    b: ChampionPiece | null;
  };
  superPawns?: string[];
  superKnights?: string[];
  awakenedRooks?: AwakenedRookState[];
  awakenedPieces?: string[];
  championMarks?: Array<{ square: string; mark: 'target' | 'katana' }>;
}

export interface GameState {
  frontier?: FrontierState;
  handCounts?: {w:number;b:number};
  hiddenDeckCount?: number;
  summoningCircles?: SummoningCircle[];
  soulSummons?: SoulSummon[];
  pendingSummon?: { player:PlayerColor; circleId:string; nextTurn:PlayerColor } | null;
  notice?: {id:string;text:string};
  pieceIds?: Record<string,string>;
  superPawnIds?: string[];
  superKnightIds?: string[];
  grounds?: Grounds;
  captures?: { w: CapturedPiece[]; b: CapturedPiece[] };
  fen: string;
  turn: PlayerColor;
  turnNumber: number;
  deck: Card[];
  discard: Card[];
  exhausted?: Card[];
  hands: {
    w: Card[];
    b: Card[];
  };
  powerUps: {
    w: PowerUpsState;
    b: PowerUpsState;
  };
  powerUpAwards?: PowerUpAward[];
  powerUpProgress?: {
    w: number;
    b: number;
  };
  expansions?: GameExpansionsConfig;
  monolithSquare: string | null;
  monolithLastMovedTurn: number | null;
  restrictedSquares: string[];
  champions: {
    w: ChampionPiece | null;
    b: ChampionPiece | null;
  };
  beaconEffect: BeaconEffectState | null;
  staticEffect: StaticEffectState | null;
  clockAlert: ClockAlertState | null;
  passRedrawAlert: PassRedrawAlertState | null;
  awakeningAlert?: AwakeningAlertState | null;
  pendingPortal?: {player: PlayerColor;from:string;nextTurn:PlayerColor;turnFinished?:boolean}|null;
  pendingSwapDiscard?: { player: PlayerColor; newCardIds: string[] } | null;
  superPawns?: string[]; // Squares containing Super Pawns
  superKnights?: string[]; // Squares containing Super Knights
  awakenedRooks?: AwakenedRookState[]; // Rooks with uncapturable shield and single capture rule
  awakenedPieces?: string[]; // Squares containing pieces in Awakened State
  awakenedPieceSquare?: string | null; // Most recently awakened piece square for glowing red aura
  awakenedByPlayer?: PlayerColor | null; // Player who played the awakening card
  awakenedOnTurnNumber?: number | null; // Turn number when awakening was played
  championMarks?: Array<{ square: string; mark: 'target' | 'katana' }>; // Marks for Musketeer sniped and Ninja assassinated squares
  boardHistory?: BoardSnapshot[];
  lastMovedPiece: {
    w: StandardPieceType | null;
    b: StandardPieceType | null;
  };
  lastMovedSquare: {
    w: string | null;
    b: string | null;
  };
  lastMoveDetails?: LastMoveDetails | null;
  jokerLocked: {
    w: boolean;
    b: boolean;
  };
  clock: GameClockState;
  visionActive: {
    w: boolean;
    b: boolean;
  };
  historyLog: GameLogEntry[];
  status: GameStatus;
  winner: PlayerColor | 'draw' | null;
  winReason: string | null;
  whitePoints: number;
  blackPoints: number;
}

export interface RoomPlayer {
  role?: 'arbiter';
  id: string;
  name: string;
  color: PlayerColor | 'spectator';
  connected: boolean;
  isHost?: boolean;
  isReady?: boolean;
}

export interface RoomLobbyConfig {
  allowArbiter?: boolean;
  hostId: string;
  colorPreference: 'w' | 'b' | 'random';
  clockEnabled: boolean;
  initialMinutes: number;
  incrementSeconds: number;
  gameStarted: boolean;
  expansions?: GameExpansionsConfig;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor?: PlayerColor | 'spectator';
  text: string;
  timestamp: number;
}

export interface RoomState {
  arbiterClockPaused?: boolean;
  arbiterRecovery?: {name:string;code:string};
  rematchRequest?: { requesterId: string; opponentId: string; id: string };
  roomId: string;
  players: Record<string, RoomPlayer>;
  gameState: GameState;
  createdAt: number;
  mode: 'online' | 'pass_and_play';
  lobbyConfig: RoomLobbyConfig;
  chatMessages?: ChatMessage[];
  recovery?: {playerId:string;name:string;color:PlayerColor;deadline:number;code?:string}[];
}

export type ClientMessage =
  | {type: 'expand_frontier'; test?: boolean}
  | {type: 'frontier_item';item:FrontierItem;captureIndex?:number;from?:string;to?:string;cardId?:string;targetCardId?:string;targetSquare?:string;targetFriendlySquare?:string;targetSquares?:string[]}
  | {type: 'frontier_golem_move';cardId:string;from:string;to:string}
  | {type: 'frontier_self_destruct';from:string}
  | {type: 'frontier_bind';targetCardId:string}

  | {type:'claim_arbiter'}
  | {type:'return_as_player';color?:PlayerColor}
  | {type:'quit_viewing'}
  | {type:'kick_spectator';playerId:string}
  | {type:'arbiter_pause';paused:boolean}
  | {type:'regenerate_room_code'}
  | {type:'leave_lobby'}
  | {type:'exit_to_new_lobby'}
  | { type:'recover_seat'; roomId:string; recoveryCode:string }
  | { type:'claim_disconnect' }
  | { type:'resolve_summon'; captureIndex:number|null }
  | { type:'play_soul_release'; cardId:string; targetSquare:string }
  | { type: 'join_room'; resumeToken?:string; roomId: string; playerId: string; playerName: string; preferredColor?: PlayerColor; mode?: 'online' | 'pass_and_play' }
  | { type: 'create_room'; roomId: string; playerId: string; playerName: string; mode?: 'online' | 'pass_and_play' }
  | { type: 'rename_player'; playerId: string; playerName: string }
  | { type: 'send_chat'; text: string }
  | { type: 'set_room_mode'; mode: 'online' | 'pass_and_play' }
  | { type: 'update_lobby_config'; allowArbiter?:boolean; colorPreference?: 'w' | 'b' | 'random'; clockEnabled?: boolean; initialMinutes?: number; incrementSeconds?: number; mode?: 'online' | 'pass_and_play'; expansions?: GameExpansionsConfig }
  | { type: 'set_player_ready'; isReady: boolean }
  | { type: 'start_game'; colorPreference?: 'w' | 'b' | 'random'; clockConfig?: { enabled: boolean; initialMinutes: number; incrementSeconds: number }; expansions?: GameExpansionsConfig }
  | { type: 'return_to_lobby' }
  | { type: 'place_ground'; groundType: GroundType; square: string; portalFrom?: string }
  | { type: 'resolve_portal'; transport:boolean }
  | { type: 'portal_move'; from: string }
  | { type: 'play_card_move'; cardId: string | null; from: string; to: string; promotion?: string }
  | { type: 'play_king_move'; from: string; to: string }
  | { type: 'play_push'; cardId: string | null; from: string; to: string }
  | { type: 'play_switch'; cardId: string; square1: string; square2: string }
  | { type: 'play_restrict'; cardId: string; targetSquare: string }
  | { type: 'play_monolith'; cardId: string | null; targetSquare: string; isPowerUp?: boolean }
  | { type: 'play_refresh'; cardId: string }
  | { type: 'play_joker'; cardId: string }
  | { type: 'play_beacon'; cardId: string }
  | { type: 'play_static'; cardId: string }
  | { type: 'play_clock'; cardId: string }
  | { type: 'play_champion_deploy'; cardId: string; championType?: ChampionType; targetSquare: string }
  | { type: 'play_champion_move'; from: string; to: string }
  | { type: 'play_champion_ultimate'; cardId: string; championType?: ChampionType; targetSquare?: string; targetSquares?: string[]; targetFriendlySquare?: string }
  | { type: 'play_awakening_pawn'; cardId: string; targetSquare: string }
  | { type: 'play_awakening_rook'; cardId: string; from: string; to: string }
  | { type: 'play_awakening_knight'; cardId: string; from?: string; to?: string; secondTo?: string; targetSquare?: string }
  | { type: 'play_awakening_bishop'; circleSquare?:string; cardId: string; from: string; to: string; revivePieceType?: PieceType; reviveSquare?: string }
  | { type: 'play_awakening_queen'; cardId: string; from: string; to: string; deploySquare?: string }
  | { type: 'play_awakening_king'; cardId: string; from: string; to: string }
  | { type: 'play_awakening_as_wild'; cardId: string; from: string; to: string; promotion?: string }
  | { type: 'dismiss_awakening_alert' }
  | { type: 'dismiss_clock_alert' }
  | { type: 'dismiss_pass_redraw_alert' }
  | { type: 'update_clock_config'; enabled: boolean; initialMinutes: number; incrementSeconds: number }
  | { type: 'start_powerup_draw' }
  | { type: 'use_powerup_draw'; discardCardIds?: [string, string] | string[] }
  | { type: 'use_powerup_vision' }
  | { type: 'refresh_powerups' }
  | { type: 'use_powerup_wild_move'; from: string; to: string; secondTo?: string; promotion?: string }
  | { type: 'place_ground'; groundType: GroundType; square: string; portalFrom?: string }
  | { type: 'portal_move'; from: string }
  | { type: 'play_card_move'; asWild?: boolean; cardId?: string; from: string; to: string; secondTo?: string; promotion?: string }
  | { type: 'discard_redraw'; cardIds: string[] }
  | { type: 'pass_turn' }
  | { type: 'resign' }
  | { type: 'restart_game' }
  | { type: 'respond_rematch'; requestId: string; accept: boolean }
  | { type: 'ping' };

export type ServerMessage =
  | {type:'recovery_required';roomId:string}
  | {type:'room_code_changed';roomId:string}
  | {type:'session_credentials';roomId:string;playerId:string;resumeToken:string}
  | { type: 'room_state'; state: RoomState; yourColor: PlayerColor | 'spectator' }
  | { type: 'error'; message: string }
  | { type: 'pong' };
