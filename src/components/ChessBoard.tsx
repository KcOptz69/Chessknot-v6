import {bishopCircleTargets} from '../utils/summoning.ts';
import {frontierMoves,frontierKingSafe,executeLandingMove,occupant,frontierUltimateTargets,emptyFrontierSquare,monolithPlacementSquare} from '../utils/frontier.ts';
import {FrontierArt,GolemIdleArt} from './FrontierUI.tsx';
import {ranksFor,isExtendedFen} from '../utils/frontierBoard.ts';
import {ChampionInfoDialog} from './ChampionInfoDialog.tsx';
import {BoardEffects} from './BoardEffects.tsx';
import {CardEffectNotifications} from './CardEffectNotifications.tsx';
import {awakenedAppearance} from '../utils/awakenedAppearance.ts';
import {groundMoves, type Grounds} from '../utils/grounds.ts';
import {V5Power} from './V5Art.tsx';
import React from 'react';
import { PopupLayer, Modal } from './UI';
import { createPortal } from 'react-dom';
import { playReviveSound, playMoveSound, playCaptureSound } from '../utils/audio.ts';
import { Square } from 'chess.js';
import {
  Card,
  LastMoveDetails,
  PlayerColor,
  StandardPieceType,
  ChampionPiece,
  ChampionType,
  BeaconEffectState,
  StaticEffectState,
  ClockAlertState,
  PassRedrawAlertState,
  AwakenedRookState,
  AwakeningAlertState,
} from '../types.ts';
import { PieceIcon } from './PieceIcons.tsx';
import {
  MessageSquare,
  Ban,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  Wind,
  ShieldCheck,
  Zap,
  Clock,
  Swords,
  Target,
  Crosshair,
  Wand2,
  RefreshCw,
  Shield,
  X,
  Info,
  Crown,
  Check,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  createSafeChess,
  getLegalMovesForPiece,
  getPushMoves,
  isCardPermittedForPiece,
  isKingChecked,
  getChampionDeploySquares,
  getChampionNormalMoves,
  getBerserkerUltimateMoves,
  getMusketeerSnipeTargets,
  getSummonerPlacementSquares,
  getNinjaAdjacentEnemyPieces,
  isCastlingBlockedByRestrictedSquares,
  getSurroundingSquares,
  getQueenMovesForKing,
  getCapturedPieces,
  CHAMPION_DETAILS,
} from '../utils/chessLogic.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface ChessBoardProps {
  frontierGame?:import('../types.ts').GameState;
  frontier?:import('../utils/frontier.ts').FrontierState;
  tutorialGuide?: {from:string|null;to:string|null;guard:(square:string)=>boolean};
  controlsHost?: HTMLElement|null;
  powerUpRecipient?:PlayerColor;
  summoningCircles?: import('../types.ts').SummoningCircle[];
  hands?: import('../types.ts').GameState['hands'];
  historyLog?: import('../types.ts').GameState['historyLog'];
  soulSummons?: import('../types.ts').SoulSummon[];
  pieceIds?: Record<string,string>;
  grounds?: Grounds;
  capturedPieceTypes?: StandardPieceType[];
  blastSquares?:string[];
  groundTargets?: string[];
  onGroundSquare?: (square:string)=>boolean;
  onOpenChat?: () => void;
  unreadChat?: number;
  groundNotice?: string | null;
  onDismissGroundNotice?: () => void;
  fen: string;
  myColor: PlayerColor;
  turn: PlayerColor;
  turnNumber?: number;
  isMyTurn: boolean;
  hand?: Card[];
  selectedCard: Card | null;
  onSelectCard?: (card: Card | null) => void;
  restrictedSquares: string[];
  monolithSquare: string | null;
  monolithLastMovedTurn?: number | null;
  lastMovedPiece: StandardPieceType | null;
  lastMovedSquare: string | null;
  lastMoveDetails?: LastMoveDetails | null;
  isWildPowerUp: boolean;
  isMonolithPowerUp: boolean;
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null;
  beaconEffect?: BeaconEffectState | null;
  staticEffect?: StaticEffectState | null;
  clockAlert?: ClockAlertState | null;
  clockBlockReason?: string | null;
  onDismissClockAlert?: () => void;
  passRedrawAlert?: PassRedrawAlertState | null;
  onDismissPassRedrawAlert?: () => void;
  superPawns?: string[];
  superKnights?: string[];
  awakenedRooks?: AwakenedRookState[];
  awakenedPieces?: string[];
  awakenedPieceSquare?: string | null;
  championMarks?: Array<{ square: string; mark: 'target' | 'katana' }>;
  awakeningAlert?: AwakeningAlertState | null;
  onDismissAwakeningAlert?: () => void;
  awakeningMode?: 'wild' | 'skill' | null;
  onSetAwakeningMode?: (mode: 'wild' | 'skill' | null) => void;
  onMove: (from: string, to: string, secondTo?: string) => void;
  onPushMove: (from: string, to: string) => void;
  onSwitchMove: (sq1: string, sq2: string) => void;
  onRestrictSquare: (sq: string) => void;
  onPlaceMonolith: (sq: string) => void;
  onDeployChampion?: (targetSquare: string) => void;
  onChampionMove?: (from: string, to: string) => void;
  onChampionUltimate?: (payload: {
    cardId: string;
    targetSquare?: string;
    targetFriendlySquare?: string;
    targetSquares?: string[];
  }) => void;
  onPlayAwakeningPawn?: (targetSquare: string) => void;
  onPlayAwakeningRook?: (from: string, to: string) => void;
  onPlayAwakeningKnight?: (from: string, to?: string, secondTo?: string) => void;
  onPlayAwakeningBishop?: (from: string, to: string, revivePieceType: StandardPieceType, reviveSquare: string) => void;
  onPlayAwakeningQueen?: (from: string, to: string, deploySquare?: string) => void;
  onPlayAwakeningKing?: (from: string, to: string) => void;
  onPlayAwakeningAsWild?: (cardId: string, from: string, to: string, promotion?: string) => void;
  hasPopup?: boolean;
}

const PIECE_NAMES: Record<StandardPieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export const ChessBoard: React.FC<ChessBoardProps> = ({
  frontierGame,frontier,tutorialGuide,
  summoningCircles=[],soulSummons=[],pieceIds={},hands,historyLog=[],
  onOpenChat, unreadChat = 0,
  fen,
  myColor,
  turn,
  turnNumber,
  capturedPieceTypes,grounds,blastSquares=[],groundTargets=[],onGroundSquare,groundNotice,onDismissGroundNotice,
  isMyTurn,
  hand = [],
  selectedCard,
  onSelectCard,
  restrictedSquares,
  monolithSquare,
  monolithLastMovedTurn,
  lastMovedPiece,
  lastMovedSquare,
  lastMoveDetails,
  isWildPowerUp,
  isMonolithPowerUp,
  champions,
  beaconEffect,
  staticEffect,
  clockAlert,
  clockBlockReason,
  onDismissClockAlert,
  passRedrawAlert,
  onDismissPassRedrawAlert,
  superPawns = [],
  superKnights = [],
  awakenedRooks = [],
  awakenedPieces = [],
  awakenedPieceSquare,
  championMarks,
  awakeningAlert,
  onDismissAwakeningAlert,
  awakeningMode = 'skill',
  onSetAwakeningMode,
  onMove,
  onPushMove,
  onSwitchMove,
  onRestrictSquare,
  onPlaceMonolith,
  onDeployChampion,
  onChampionMove,
  onChampionUltimate,
  onPlayAwakeningPawn,
  onPlayAwakeningRook,
  onPlayAwakeningKnight,
  onPlayAwakeningBishop,
  onPlayAwakeningQueen,
  onPlayAwakeningKing,
  onPlayAwakeningAsWild,
  controlsHost = null,
  powerUpRecipient,
  hasPopup = false,
}) => {
  const { isDark } = useTheme();
  const [selectedSquare, setSelectedSquare] = React.useState<string | null>(null);
  const [switchSquare1, setSwitchSquare1] = React.useState<string | null>(null);
  const [flipBoard, setFlipBoard] = React.useState<boolean>(myColor === 'b');
  const [autoFlip, setAutoFlip] = React.useState<boolean>(true);
  const [cooldownWarning, setCooldownWarning] = React.useState<string | null>(null);

  // Awakening Interactive States
  // Super Knight prompt after first move
  const [knightMovePrompt, setKnightMovePrompt] = React.useState<{
    from: string;
    to: string;
    firstCaptured: boolean;
  } | null>(null);
  const [awaitingKnightSecondMove, setAwaitingKnightSecondMove] = React.useState<boolean>(false);

  const [bishopCirclePlacement,setBishopCirclePlacement]=React.useState<{from:string;to:string}|null>(null);
  const [bishopMoveWarning,setBishopMoveWarning]=React.useState<string|null>(null);
  const bishopMoveAllowed=React.useRef(false);
  React.useEffect(()=>{setBishopCirclePlacement(null);setBishopMoveWarning(null);},[selectedCard?.id,isMyTurn]);
  // Bishop revive prompt
  const [bishopRevivePrompt, setBishopRevivePrompt] = React.useState<{
    from: string;
    to: string;
    chosenPiece?: StandardPieceType;
  } | null>(null);

  // Queen convert & deploy prompt
  const [queenDeployPrompt, setQueenDeployPrompt] = React.useState<{
    from: string;
    to: string;
    capturedType: StandardPieceType;
  } | null>(null);

  // Summoner ultimate state: first pick friendly piece, then destination next to summoner
  const [summonerPieceToTeleport, setSummonerPieceToTeleport] = React.useState<string | null>(null);
  // Ninja ultimate state: pick up to 2 adjacent enemy pieces
  const [ninjaTargets, setNinjaTargets] = React.useState<string[]>([]);

  // Champion inspection state for detailed tooltip (opened on click only)
  const [inspectedChampionSquare,setInspectedChampionSquare] = React.useState<string|null>(null);
  const [informationOpen,setInformationOpen]=React.useState(false);
  // Piece clicks select actions without opening Champion descriptions.



  const chess = React.useMemo(() => {
    return createSafeChess(fen);
  }, [fen]);

  const monolithSurroundingSquares = React.useMemo(() => {
    return monolithSquare ? getSurroundingSquares(monolithSquare,fen) : [];
  }, [monolithSquare]);

  // Beacon Buff: Only units surrounding the Monolith receive the invulnerability buff.
  // If pieces leave the field or the Monolith changes position, they will not be invulnerable anymore.
  const beaconProtectedSquares = React.useMemo(() => {
    if (!beaconEffect?.active || !monolithSquare) return [];
    return monolithSurroundingSquares;
  }, [beaconEffect?.active, monolithSquare, monolithSurroundingSquares]);

  const isKingInCheck = React.useMemo(() => {
    if(frontierGame?.frontier?.expanded)return !frontierKingSafe(frontierGame,turn);return isKingChecked(chess, turn, monolithSquare, champions, beaconProtectedSquares, grounds);
  }, [chess, turn, monolithSquare, champions, beaconProtectedSquares, grounds,frontierGame]);

  const myChampion = champions ? champions[turn] : null;
  const enemyColor = turn === 'w' ? 'b' : 'w';
  const enemyChampion = champions ? champions[enemyColor] : null;
  const whiteChampion = champions ? champions.w : null;
  const blackChampion = champions ? champions.b : null;
  const portalOccupied = Object.entries(grounds?.tiles ?? {}).some(([square, type]) =>
    type === 'portal' && Boolean(chess.get(square as Square) ||
      whiteChampion?.square === square || blackChampion?.square === square)
  );

  const staticStunnedSquares = staticEffect?.active ? staticEffect.stunnedSquares : [];

  const hasAnyPopupPrompt = Boolean(
    hasPopup || bishopMoveWarning ||
    knightMovePrompt ||
    awaitingKnightSecondMove ||
    bishopRevivePrompt ||
    queenDeployPrompt ||
    inspectedChampionSquare ||
    cooldownWarning ||
    informationOpen ||
    clockAlert ||
    passRedrawAlert ||
    groundNotice ||
    (typeof document !== 'undefined' && Boolean(
      document.querySelector('.ground-popup, .ground-dialog, [role="dialog"], [aria-modal="true"], .has-popup-open, .capture-dialog, .modal, [data-dialog="true"]')
    ))
  );

  // Auto-dismiss cooldown warning
  React.useEffect(() => {
    if (cooldownWarning) {
      const timer = setTimeout(() => setCooldownWarning(null), cooldownWarning.startsWith("No card for ") ? 1000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [cooldownWarning, controlsHost]);

  // Keep board orientation synced if player color changes
  React.useEffect(() => {
    if (autoFlip) {
      setFlipBoard(myColor === 'b');
    }
  }, [myColor, autoFlip]);

  const preserveSelectionRef = React.useRef(false);

  // Clear selections when card or turn changes
  React.useEffect(() => {
    if (preserveSelectionRef.current) {
      preserveSelectionRef.current = false;
      return;
    }
    setSelectedSquare(null);
    setSwitchSquare1(null);
    setSummonerPieceToTeleport(null);
    setNinjaTargets([]);
  }, [selectedCard, turn, isWildPowerUp, isMonolithPowerUp]);

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = [...ranksFor(fen)].reverse();

  const displayFiles = flipBoard ? [...files].reverse() : files;
  const displayRanks = flipBoard ? [...ranks].reverse() : ranks;

  // Champion Summoning: empty squares on player's side of board (first four rows only)
  // White: ranks 1-4. Black: ranks 5-8.
  const validChampionDeploySquares = React.useMemo(() => {
    if (selectedCard?.type !== 'champion' || myChampion) return [];
    return getChampionDeploySquares(
      turn,
      chess,
      restrictedSquares,
      monolithSquare,
      enemyChampion
    );
  }, [selectedCard, myChampion, turn, chess, restrictedSquares, monolithSquare, enemyChampion]);

  // Champion Ultimate Targets (when champion is already on board)
  const championUltimateTargets = React.useMemo(() => {
    if (selectedCard?.type !== 'champion' || !myChampion) return [];
    if(frontierGame?.frontier?.expanded){if(myChampion.type==='summoner'&&!summonerPieceToTeleport)return Object.keys(frontierGame.pieceIds||{}).filter(q=>occupant(frontierGame,q)?.color===turn);return frontierUltimateTargets(frontierGame,turn,summonerPieceToTeleport||undefined);}

    if (myChampion.type === 'berserker') {
      return getBerserkerUltimateMoves(
        myChampion,
        chess,
        restrictedSquares,
        monolithSquare,
        enemyChampion,
        beaconProtectedSquares,
        awakenedRooks,
        awakenedPieces
      );
    }

    if (myChampion.type === 'musketeer') {
      return getMusketeerSnipeTargets(
        myChampion,
        chess,
        monolithSquare,
        enemyChampion,
        beaconProtectedSquares,
        awakenedRooks,
        awakenedPieces
      );
    }

    if (myChampion.type === 'summoner') {
      if (!summonerPieceToTeleport) {
        // Step 1: Any friendly standard piece on board
        const targets: string[] = [];
        const board = chess.board();
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const p = board[r][f];
            if (p && p.color === turn) {
              const sq = `${files[f]}${8 - r}`;
              targets.push(sq);
            }
          }
        }
        return targets;
      } else {
        // Step 2: Placement squares adjacent to Summoner
        return getSummonerPlacementSquares(
          myChampion.square,
          turn,
          chess,
          restrictedSquares,
          monolithSquare,
          enemyChampion,
          beaconProtectedSquares,
          awakenedRooks,
          awakenedPieces
        );
      }
    }

    if (myChampion.type === 'ninja') {
      return getNinjaAdjacentEnemyPieces(
        myChampion.square,
        turn,
        chess,
        enemyChampion,
        beaconProtectedSquares,
        awakenedRooks,
        awakenedPieces
      );
    }

    return [];
  }, [
    selectedCard,
    myChampion,
    chess,
    restrictedSquares,
    monolithSquare,
    enemyChampion,
    beaconProtectedSquares,
    summonerPieceToTeleport,
    turn,
    awakenedRooks,
    awakenedPieces,
  ]);

  // Determine valid destination squares based on currently selected square
  const validDestinations = React.useMemo(() => {
    if (!selectedSquare) return [];
    if(tutorialGuide?.from&&tutorialGuide.to)return selectedSquare===tutorialGuide.from?[tutorialGuide.to]:[];
    if (selectedSquare === monolithSquare) return [];
    if(frontierGame?.frontier?.expanded && (!selectedCard||['pawn','knight','bishop','rook','queen','wild','previous','traverse','push'].includes(selectedCard.type)||selectedCard.type.startsWith('awakening_')||isWildPowerUp)){const d=structuredClone(frontierGame);let from=selectedSquare;if(awaitingKnightSecondMove&&knightMovePrompt){try{executeLandingMove(d,knightMovePrompt.from,knightMovePrompt.to);}catch{return [];}from=knightMovePrompt.to;}return frontierMoves(d,from,selectedCard?.type==='push'||selectedCard?.type==='awakening_king'&&awakeningMode==='skill'&&isKingInCheck?'q':undefined,selectedCard?.type==='push').filter(q=>!awaitingKnightSecondMove||!knightMovePrompt?.firstCaptured||(!occupant(d,q)&&!['boss','mimic'].includes(d.frontier?.pois[q]||'')));}
    if(grounds && selectedCard?.type!=='push' && !(selectedCard?.type==='champion')){
      const from=awaitingKnightSecondMove&&knightMovePrompt?knightMovePrompt.to:selectedSquare;
      const preview=createSafeChess(fen);
      if(awaitingKnightSecondMove&&knightMovePrompt){preview.remove(knightMovePrompt.from as Square);preview.put({type:'n',color:turn},from as Square);}
      const destinations=groundMoves({fen:preview.fen(),grounds,champions:champions||{w:null,b:null},restrictedSquares,monolithSquare} as any,from);
      if(destinations)return destinations;
    }

    // If awaiting Super Knight 2nd move:
    if (awaitingKnightSecondMove && knightMovePrompt) {
      const tempChess = createSafeChess(chess.fen());
      tempChess.remove(knightMovePrompt.from as Square);
      tempChess.put({ type: 'n', color: turn }, knightMovePrompt.to as Square);

      const previewEnemyChampion = enemyChampion?.square === knightMovePrompt.to ? null : enemyChampion;
      const previewChampions = champions ? { ...champions, [enemyColor]: previewEnemyChampion } : champions;
      const rawMoves2 = getLegalMovesForPiece(
        knightMovePrompt.to as Square,
        tempChess,
        restrictedSquares,
        monolithSquare,
        staticStunnedSquares,
        beaconProtectedSquares,
        myChampion?.square || null,
        previewEnemyChampion,
        previewChampions,
        awakenedRooks,
        superPawns,
        superKnights, undefined, grounds
      );
      if (knightMovePrompt.firstCaptured) {
        // Can only move to empty squares (no capture allowed)
        return rawMoves2.filter(
          (sq) => !tempChess.get(sq as Square) && !(previewEnemyChampion && previewEnemyChampion.square === sq)
        );
      }
      return rawMoves2;
    }

    // Check if player selected their Champion piece directly to make a normal move
    if (myChampion && selectedSquare === myChampion.square) {
      return getChampionNormalMoves(
        myChampion,
        chess,
        restrictedSquares,
        monolithSquare,
        enemyChampion,
        staticStunnedSquares,
        beaconProtectedSquares,
        awakenedRooks,
        awakenedPieces, grounds
      );
    }

    const piece = chess.get(selectedSquare as Square);
    if (!piece || piece.color !== turn) return [];

    // Awakening King skill: Queen-like moves across board when King is checked
    if (
      selectedCard?.type === 'awakening_king' &&
      awakeningMode === 'skill' &&
      piece.type === 'k'
    ) {
      return getQueenMovesForKing(
        selectedSquare as Square,
        chess,
        restrictedSquares,
        monolithSquare,
        champions,
        beaconProtectedSquares,
        awakenedRooks
      );
    }

    // Push Card behavior: Queen-like, no captures, no jumps (blocked by Champions)
    if (selectedCard?.type === 'push') {
      return getPushMoves(selectedSquare, chess, restrictedSquares, monolithSquare, champions);
    }

    // Standard piece move (or Wild powerup / King move)
    return getLegalMovesForPiece(
      selectedSquare as Square,
      chess,
      restrictedSquares,
      monolithSquare,
      staticStunnedSquares,
      beaconProtectedSquares,
      myChampion?.square || null,
      enemyChampion,
      champions,
      awakenedRooks,
      superPawns,
      superKnights,
      awakenedPieces, grounds
    );
  }, [
    grounds,
    frontierGame,
    isWildPowerUp,
    isKingInCheck,
    tutorialGuide,
    selectedSquare,
    chess,
    selectedCard,
    restrictedSquares,
    monolithSquare,
    turn,
    myChampion,
    enemyChampion,
    champions,
    staticStunnedSquares,
    beaconProtectedSquares,
    awakenedRooks,
    superPawns,
    superKnights,
    awakenedPieces,
    awaitingKnightSecondMove,
    knightMovePrompt,
    awakeningMode,
  ]);

  const bishopCircleSquares=bishopCirclePlacement&&frontierGame?bishopCircleTargets(frontierGame,bishopCirclePlacement.from,bishopCirclePlacement.to):[];
  // Valid card targets (pieces or squares eligible for the currently selected card / power-up)
  const validCardTargets = React.useMemo(() => {
    if (!selectedCard && !isWildPowerUp && !isMonolithPowerUp) return [];
    const targets: string[] = [];

    // Monolith card / powerup: empty squares
    if (selectedCard?.type === 'monolith' || isMonolithPowerUp) {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          if (
            (!frontierGame || monolithPlacementSquare(frontierGame,sq)) &&
            !chess.get(sq as Square) &&
            !frontierGame?.frontier?.golems.some(g=>g.square===sq) &&
            sq !== monolithSquare &&
            !restrictedSquares.includes(sq) &&
            !(champions && (champions.w?.square === sq || champions.b?.square === sq))
          ) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    // Restrict card: empty squares
    if (selectedCard?.type === 'restrict') {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          if (
            !chess.get(sq as Square) &&
            !frontierGame?.frontier?.golems.some(g=>g.square===sq) &&
            sq !== monolithSquare &&
            !restrictedSquares.includes(sq) &&
            !(champions && (champions.w?.square === sq || champions.b?.square === sq))
          ) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    // Switch card: friendly pieces
    if (selectedCard?.type === 'switch') {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          const p = chess.get(sq as Square);
          if ((p && p.color === turn) || (myChampion && myChampion.square === sq)) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    // Champion card: deploy squares if not deployed, or empty
    if (selectedCard?.type === 'champion') {
      if (!myChampion || !myChampion.square) {
        return validChampionDeploySquares;
      }
      return championUltimateTargets;
    }

    // Push card: ALL friendly pieces (standard piece or champion) that have valid push moves
    if (selectedCard?.type === 'push') {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          const p = chess.get(sq as Square);
          const isFriendlyPiece = Boolean(p && p.color === turn);
          const isFriendlyChamp = Boolean(myChampion && myChampion.square === sq);
          if ((isFriendlyPiece || isFriendlyChamp) && sq !== monolithSquare && getPushMoves(sq, chess, restrictedSquares, monolithSquare, champions).length > 0) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    // Awakening cards in skill mode:
    if (selectedCard?.type === 'awakening_pawn' && awakeningMode === 'skill') {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          const p = chess.get(sq as Square);
          if (p && p.color === turn && p.type === 'p' && !superPawns.includes(sq)) {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    if (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') {
      for (const r of ranksFor(fen)) {
        for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
          const sq = `${f}${r}`;
          const p = chess.get(sq as Square);
          if (p && p.color === turn && p.type === 'n') {
            targets.push(sq);
          }
        }
      }
      return targets;
    }

    // Standard piece cards (and wild / awakening in wild mode):
    // ONLY include pieces that ACTUALLY have at least 1 legal move!
    for (let r = 1; r <= 8; r++) {
      for (const f of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        const sq = `${f}${r}`;
        const p = chess.get(sq as Square);
        if (p && p.color === turn && sq !== monolithSquare) {
          const allowed =
            isWildPowerUp ||
            (selectedCard &&
              (awakeningMode === 'wild' ||
                (selectedCard.type === 'awakening_king' && !isKingInCheck) ||
                isCardPermittedForPiece(selectedCard, p.type as StandardPieceType, lastMovedPiece)));
          if (allowed) {
            const moves = getLegalMovesForPiece(
              sq as Square,
              chess,
              restrictedSquares,
              monolithSquare,
              staticStunnedSquares,
              beaconProtectedSquares,
              myChampion?.square || null,
              enemyChampion,
              champions,
              awakenedRooks,
              superPawns,
              superKnights,
              awakenedPieces, grounds
            );
            if (moves.length > 0) {
              targets.push(sq);
            }
          }
        }
      }
    }

    return targets;
  }, [
    selectedCard,
    isWildPowerUp,
    isMonolithPowerUp,
    chess,
    turn,
    monolithSquare,
    restrictedSquares,
    champions,
    myChampion,
    validChampionDeploySquares,
    frontierGame,
    fen,
    championUltimateTargets,
    awakeningMode,
    superPawns,
    superKnights,
    lastMovedPiece,
    staticStunnedSquares,
    beaconProtectedSquares,
    awakenedRooks,
    awakenedPieces,
    enemyChampion,
  ]);

  const handleSquareClick = (square: string) => {
    if(tutorialGuide&&!tutorialGuide.guard(square))return;
    if(onGroundSquare?.(square))return;
    if(bishopCirclePlacement){if(bishopCircleSquares.includes(square)){onPlayAwakeningBishop?.(bishopCirclePlacement.from,bishopCirclePlacement.to,'p',square);setBishopCirclePlacement(null);setSelectedSquare(null);}return;}
    if(!bishopMoveAllowed.current&&selectedSquare&&validDestinations.includes(square)&&summoningCircles.some(c=>c.bishopId===pieceIds[selectedSquare]&&!c.finished&&!c.interrupted)){setBishopMoveWarning(square);return;}
    // Check if clicked a champion square (White or Black)
    const isWhiteChamp = champions?.w?.square === square;
    const isBlackChamp = champions?.b?.square === square;
    const clickedChamp = isWhiteChamp ? champions?.w : isBlackChamp ? champions?.b : null;

    // A legal Champion target must reach the action handler before inspection.
    // This also applies to Champion ultimates and a staged Super Knight jump.
    const isChampionActionTarget = Boolean(
      isMyTurn && clickedChamp && clickedChamp.color !== turn && (
        ((selectedSquare || awaitingKnightSecondMove) && validDestinations.includes(square)) ||
        (selectedCard?.type === 'champion' && championUltimateTargets.includes(square))
      )
    );
    if (clickedChamp && !isChampionActionTarget && (!isMyTurn || clickedChamp.color !== turn)) {
      return;
    }

    if (!isMyTurn) return;

    // 1. MONOLITH PLACEMENT MODE (Card or Power-Up)
    if (isMonolithPowerUp || selectedCard?.type === 'monolith') {
      if (square === monolithSquare) {
        setCooldownWarning('Cannot move Monolith to the same square where it is currently standing!');
        return;
      }
      if (
        monolithSquare &&
        monolithLastMovedTurn !== null &&
        monolithLastMovedTurn !== undefined &&
        monolithLastMovedTurn === (turnNumber ?? 1) - 1
      ) {
        setCooldownWarning('Monolith cannot be moved: It was placed or moved on the previous turn!');
        return;
      }
      const pieceOnSquare = chess.get(square as Square);
      const champOnSquare =
        (whiteChampion && whiteChampion.square === square) ||
        (blackChampion && blackChampion.square === square);
      if (restrictedSquares.includes(square) || pieceOnSquare || champOnSquare || frontierGame && !monolithPlacementSquare(frontierGame,square)) {
        return; // Cannot place on occupied or restricted square
      }
      onPlaceMonolith(square);
      return;
    }

    // 2. RESTRICT CARD MODE
    if (selectedCard?.type === 'restrict') {
      const pieceOnSquare = chess.get(square as Square);
      const champOnSquare =
        (whiteChampion && whiteChampion.square === square) ||
        (blackChampion && blackChampion.square === square);
      if (restrictedSquares.includes(square) || pieceOnSquare || champOnSquare || square === monolithSquare || frontierGame?.frontier?.golems.some(g=>g.square===square)) {
        return; // Restrict card can only choose empty squares
      }
      onRestrictSquare(square);
      return;
    }

    // 3. SWITCH CARD MODE: Can target all of your pieces (standard pieces and Champion)
    if (selectedCard?.type === 'switch') {
      const piece = chess.get(square as Square);
      const isMyChamp = Boolean(myChampion && myChampion.square === square);
      if (!piece && !isMyChamp) return;
      if (piece && piece.color !== turn) return;

      if (!switchSquare1) {
        setSwitchSquare1(square);
      } else if (switchSquare1 === square) {
        setSwitchSquare1(null); // Deselect
      } else {
        onSwitchMove(switchSquare1, square);
        setSwitchSquare1(null);
      }
      return;
    }

    // 4. CHAMPION CARD MODE: SUMMONING (when no champion on board)
    if (selectedCard?.type === 'champion' && !myChampion) {
      if (validChampionDeploySquares.includes(square)) {
        if (onDeployChampion) {
          onDeployChampion(square);
        }
      } else {
        setCooldownWarning(
          turn === 'w'
            ? 'Must deploy on an empty square on your side of the board (Ranks 1 to 4)!'
            : 'Must deploy on an empty square on your side of the board (Ranks 5 to 8)!'
        );
      }
      return;
    }

    // 5. CHAMPION CARD MODE: ULTIMATE SKILL (when champion already exists)
    if (selectedCard?.type === 'champion' && myChampion) {
      if (myChampion.type === 'berserker') {
        if (championUltimateTargets.includes(square)) {
          onChampionUltimate?.({ cardId: selectedCard.id, targetSquare: square });
        }
        return;
      }

      if (myChampion.type === 'musketeer') {
        if (championUltimateTargets.includes(square)) {
          onChampionUltimate?.({ cardId: selectedCard.id, targetSquare: square });
        }
        return;
      }

      if (myChampion.type === 'summoner') {
        if (!summonerPieceToTeleport) {
          const piece = chess.get(square as Square);
          if (piece && piece.color === turn) {
            setSummonerPieceToTeleport(square);
          }
        } else {
          if (square === summonerPieceToTeleport) {
            setSummonerPieceToTeleport(null); // Deselect
          } else if (championUltimateTargets.includes(square)) {
            onChampionUltimate?.({
              cardId: selectedCard.id,
              targetFriendlySquare: summonerPieceToTeleport,
              targetSquare: square,
            });
            setSummonerPieceToTeleport(null);
          }
        }
        return;
      }

      if (myChampion.type === 'ninja') {
        if (championUltimateTargets.includes(square)) {
          let updated = [...ninjaTargets];
          if (updated.includes(square)) {
            updated = updated.filter((s) => s !== square);
          } else {
            if (updated.length < 2) {
              updated.push(square);
            }
          }
          setNinjaTargets(updated);
        }
        return;
      }
    }

    // Inspect only when this is not a legal target of the selected action.
    const isPushingFriendlyChamp = selectedCard?.type === 'push' && Boolean(myChampion && square === myChampion.square);
    if (clickedChamp && !isChampionActionTarget && !isPushingFriendlyChamp) {
      if (myChampion && square === myChampion.square && isMyTurn) {
        const nextSelected = square === selectedSquare ? null : square;
        setSelectedSquare(nextSelected);

        return;
      }
      // Inspecting opponent's champion or friendly champion outside of move turn
      setSelectedSquare(null);

      return;
    }

    if (selectedSquare === myChampion?.square && validDestinations.includes(square)) {
      onChampionMove?.(myChampion.square, square);
      setSelectedSquare(null);
      setInspectedChampionSquare(null);
      return;
    }

    // 7. AWAKENING CARD SKILLS: MULTI-STEP MODES
    // A. Knight Second Move Choice
    if (awaitingKnightSecondMove && knightMovePrompt) {
      if (validDestinations.includes(square)) {
        const isSecondCapture = Boolean(chess.get(square as Square)) || Boolean(enemyChampion && enemyChampion.square === square);
        if (isSecondCapture) {
          playCaptureSound();
        } else {
          playMoveSound();
        }
        if (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') {
          onPlayAwakeningKnight?.(knightMovePrompt.from, knightMovePrompt.to, square);
        } else {
          // Super Knight 2nd jump does NOT require a piece card!
          onMove(knightMovePrompt.from, knightMovePrompt.to, square);
        }
        setKnightMovePrompt(null);
        setAwaitingKnightSecondMove(false);
        setSelectedSquare(null);
      }
      return;
    }

    // B. Bishop Revive: choosing adjacent placement square for the chosen piece
    if (bishopRevivePrompt?.chosenPiece) {
      const adj = getSurroundingSquares(bishopRevivePrompt.to);
      const isTargetEmpty =
        !chess.get(square as Square) &&
        !restrictedSquares.includes(square) &&
        square !== monolithSquare &&
        !(champions && (champions.w?.square === square || champions.b?.square === square));

      if (adj.includes(square) && isTargetEmpty) {
        playReviveSound();
        onPlayAwakeningBishop?.(bishopRevivePrompt.from, bishopRevivePrompt.to, bishopRevivePrompt.chosenPiece, square);
        setBishopRevivePrompt(null);
        setSelectedSquare(null);
      }
      return;
    }

    // C. Queen Convert: choosing adjacent deployment square for the captured piece
    if (queenDeployPrompt) {
      const adj = getSurroundingSquares(queenDeployPrompt.to);
      const isTargetEmpty =
        !chess.get(square as Square) &&
        !restrictedSquares.includes(square) &&
        square !== monolithSquare &&
        !(champions && (champions.w?.square === square || champions.b?.square === square));

      if (adj.includes(square) && isTargetEmpty) {
        onPlayAwakeningQueen?.(queenDeployPrompt.from, queenDeployPrompt.to, square);
        setQueenDeployPrompt(null);
        setSelectedSquare(null);
      }
      return;
    }

    // D. Awakening Pawn Skill: Select friendly pawn to permanently upgrade
    if (selectedCard?.type === 'awakening_pawn' && awakeningMode === 'skill') {
      const clickedPiece = chess.get(square as Square);
      if (clickedPiece && clickedPiece.color === turn && clickedPiece.type === 'p') {
        onPlayAwakeningPawn?.(square);
        setSelectedSquare(null);
        return;
      } else {
        setCooldownWarning('Awakening: Pawn — Select one of your Pawns to permanently upgrade into a Super Pawn!');
        return;
      }
    }

    // E. Awakening Knight Skill: Clicking friendly Knight transforms it directly into a Super Knight!
    if (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') {
      const clickedPiece = chess.get(square as Square);
      if (clickedPiece && clickedPiece.color === turn && clickedPiece.type === 'n') {
        onPlayAwakeningKnight?.(square, square);
        setSelectedSquare(null);
        return;
      }
    }

    // 8. NORMAL PIECE MOVES & AWAKENING MOVES
    const piece = chess.get(square as Square);

    // If already have a selected piece and clicked a valid destination:
    if (selectedSquare && validDestinations.includes(square)) {
      if (superKnights.includes(selectedSquare) && !(selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill')) {
        const firstCaptured = Boolean(chess.get(square as Square)) || enemyChampion?.square === square;
        setKnightMovePrompt({ from: selectedSquare, to: square, firstCaptured });
        setSelectedSquare(null);
        return;
      }
      // Check if moving with Awakening Card as Wild
      if (selectedCard?.type.startsWith('awakening_') && (awakeningMode === 'wild' || (selectedCard.type === 'awakening_king' && !isKingInCheck))) {
        onPlayAwakeningAsWild?.(selectedCard.id, selectedSquare, square);
        setSelectedSquare(null);
        return;
      }

      // Awakening Card Skills:
      if (selectedCard?.type === 'awakening_rook' && awakeningMode === 'skill') {
        onPlayAwakeningRook?.(selectedSquare, square);
        setSelectedSquare(null);
        return;
      }

      if (
        (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') ||
        superKnights.includes(selectedSquare)
      ) {
        const didCapture = Boolean(chess.get(square as Square)) || Boolean(enemyChampion && enemyChampion.square === square);
        setKnightMovePrompt({ from: selectedSquare, to: square, firstCaptured: didCapture });
        setSelectedSquare(null);
        return;
      }

      if (selectedCard?.type === 'awakening_bishop' && awakeningMode === 'skill') {
        setBishopCirclePlacement({from:selectedSquare,to:square});return;
      }
      if (selectedCard?.type === 'awakening_queen' && awakeningMode === 'skill') {
        onPlayAwakeningQueen?.(selectedSquare,square);setSelectedSquare(null);return;
      }

      if (selectedCard?.type === 'awakening_king' && awakeningMode === 'skill') {
        onPlayAwakeningKing?.(selectedSquare, square);
        setSelectedSquare(null);
        return;
      }

      if (selectedCard?.type === 'push') {
        onPushMove(selectedSquare, square);
      } else {
        const isCapture = Boolean(chess.get(square as Square)) || Boolean(enemyChampion && enemyChampion.square === square);
        if (isCapture) {
          playCaptureSound();
        } else {
          playMoveSound();
        }
        onMove(selectedSquare, square);
      }
      setSelectedSquare(null);
      return;
    }

    // Check if player selected their King and tried to click a castling square blocked by a restricted tile
    const selectedPiece = selectedSquare ? chess.get(selectedSquare as Square) : null;
    if (selectedPiece && selectedPiece.type === 'k' && isCastlingBlockedByRestrictedSquares(selectedSquare!, square, restrictedSquares)) {
      setCooldownWarning('Cannot castle: The King or Rook would land on a restricted tile!');
      setSelectedSquare(null);
      return;
    }

    // Push Card mode: can select ANY friendly piece on the board (standard piece or friendly champion)
    if (selectedCard?.type === 'push') {
      const pieceOnSquare = chess.get(square as Square);
      const isFriendlyPiece = Boolean(pieceOnSquare && pieceOnSquare.color === turn);
      const isFriendlyChampOnSquare = Boolean(myChampion && myChampion.square === square);
      if ((isFriendlyPiece || isFriendlyChampOnSquare) && square !== monolithSquare) {
        setSelectedSquare(square === selectedSquare ? null : square);
        return;
      }
    }

    // Otherwise, selecting a piece to move:
    if (piece && piece.color === turn && square !== monolithSquare) {
      // Super Knights use normal Knight cards for the first move; only the optional second jump is free.
      if (piece.type === 'k') {
        setSelectedSquare(square === selectedSquare ? null : square);
        return;
      }

      // If Wild powerup is active, any piece can move
      if (isWildPowerUp) {
        setSelectedSquare(square === selectedSquare ? null : square);
        return;
      }

      // If a card is already selected, verify the card allows moving this piece
      if (selectedCard) {
        // If Awakening card is played in Wild mode, any friendly piece can be selected
        if (selectedCard.type.startsWith('awakening_') && (awakeningMode === 'wild' || (selectedCard.type === 'awakening_king' && !isKingInCheck))) {
          setSelectedSquare(square === selectedSquare ? null : square);
          return;
        }

        const allowed = isCardPermittedForPiece(
          selectedCard,
          piece.type as StandardPieceType,
          lastMovedPiece
        );
        if (allowed) {
          if (selectedCard.type === 'awakening_king' && awakeningMode === 'skill') {
            const inCheck = isKingChecked(chess, turn, monolithSquare, champions, beaconProtectedSquares, grounds);
            if (!inCheck) {
              onSetAwakeningMode?.('wild');
              setSelectedSquare(square === selectedSquare ? null : square);
              return;
            }
          }
          setSelectedSquare(square === selectedSquare ? null : square);
          return;
        }
      }

      // Only a matching standard piece card can be selected by tapping its piece.
      const cardForPiece: Record<string,string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
      const matchingPieceCard = hand.find(c => !c.isJokerWild && c.type === cardForPiece[piece.type]);

      if (matchingPieceCard) {
        preserveSelectionRef.current = true;
        setSelectedSquare(square);
        if (onSelectCard) {
          onSelectCard(matchingPieceCard);
        }
        return;
      } else {
        setCooldownWarning(`No card for ${PIECE_NAMES[piece.type as StandardPieceType] || 'this piece'} in hand!`);
        setSelectedSquare(null);
        return;
      }
    } else {
      setSelectedSquare(null);
    }
  };

  // Active champion currently inspected for detailed tooltip (friendly or opponent champion, click only)
  const activeTooltipSquare = inspectedChampionSquare;
  const activeTooltipChamp = React.useMemo(() => {
    if (!activeTooltipSquare || !champions) return null;
    if (champions.w && champions.w.square === activeTooltipSquare) return champions.w;
    if (champions.b && champions.b.square === activeTooltipSquare) return champions.b;
    return null;
  }, [activeTooltipSquare, champions]);

  const boardControls = (<div className="board-controls flex items-center justify-between w-full max-w-[560px] mb-2 px-1 text-xs text-stone-600 dark:text-stone-400">
        <div className="flex items-center gap-2">
          <span>
            Turn {turnNumber} · <strong className="text-stone-900 dark:text-stone-100">{flipBoard ? 'Black' : 'White'}</strong>
          </span>
          <button
            onClick={() => setFlipBoard(!flipBoard)}
            className="text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold text-[11px] underline underline-offset-2 transition-colors cursor-pointer"
          >
            Flip
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop Champion display */}
          <div className="hidden sm:flex items-center gap-1">
            {whiteChampion && blackChampion ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setInspectedChampionSquare(
                      inspectedChampionSquare === whiteChampion.square ? null : whiteChampion.square
                    );
                  }}
                  className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded border shadow-xs transition-colors ${
                    inspectedChampionSquare === whiteChampion.square
                      ? 'bg-blue-600 text-white border-blue-700'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700'
                  }`}
                  title={`Inspect White Champion (${CHAMPION_DETAILS[whiteChampion.type].title})`}
                >
                  <PieceIcon type={whiteChampion.type} color="w" className="w-3.5 h-3.5" />
                  <span>White: {CHAMPION_DETAILS[whiteChampion.type].title.split(' ')[0]}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectedChampionSquare(
                      inspectedChampionSquare === blackChampion.square ? null : blackChampion.square
                    );
                  }}
                  className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded border shadow-xs transition-colors ${
                    inspectedChampionSquare === blackChampion.square
                      ? 'bg-purple-600 text-white border-purple-700'
                      : 'text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800'
                  }`}
                  title={`Inspect Black Champion (${CHAMPION_DETAILS[blackChampion.type].title})`}
                >
                  <PieceIcon type={blackChampion.type} color="b" className="w-3.5 h-3.5" />
                  <span>Black: {CHAMPION_DETAILS[blackChampion.type].title.split(' ')[0]}</span>
                </button>
              </div>
            ) : (whiteChampion || blackChampion) ? (
              <button
                type="button"
                onClick={() => {
                  const target = whiteChampion || blackChampion;
                  if (target) {
                    setInspectedChampionSquare(
                      inspectedChampionSquare === target.square ? null : target.square
                    );
                  }
                }}
                className={`text-[11px] font-bold flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded border shadow-xs transition-colors ${
                  inspectedChampionSquare
                    ? 'bg-purple-600 text-white border-purple-700'
                    : 'text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200 bg-purple-50 dark:bg-purple-950/70 border-purple-200 dark:border-purple-800'
                }`}
                title="Toggle Champion Toolkit"
              >
                <Swords className="w-3 h-3" />
                <span>
                  {whiteChampion
                    ? `Champion: ${CHAMPION_DETAILS[whiteChampion.type].title.split(' ')[0]}`
                    : `Champion: ${CHAMPION_DETAILS[blackChampion!.type].title.split(' ')[0]}`}
                </span>
              </button>
            ) : null}
          </div>

          {/* Mobile Champion display: Show only the icon of the champion near auto-flip */}
          <div className="flex sm:hidden items-center gap-1">
            {whiteChampion && (
              <button
                type="button"
                onClick={() => {
                  setInspectedChampionSquare(
                    inspectedChampionSquare === whiteChampion.square ? null : whiteChampion.square
                  );
                }}
                className={`p-1 rounded border shadow-xs transition-colors cursor-pointer ${
                  inspectedChampionSquare === whiteChampion.square
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white dark:bg-stone-900 border-blue-300 dark:border-blue-700'
                }`}
                title={`White Champion: ${CHAMPION_DETAILS[whiteChampion.type].title}`}
              >
                <PieceIcon type={whiteChampion.type} color="w" className="w-4 h-4" />
              </button>
            )}
            {blackChampion && (
              <button
                type="button"
                onClick={() => {
                  setInspectedChampionSquare(
                    inspectedChampionSquare === blackChampion.square ? null : blackChampion.square
                  );
                }}
                className={`p-1 rounded border shadow-xs transition-colors cursor-pointer ${
                  inspectedChampionSquare === blackChampion.square
                    ? 'bg-purple-600 text-white border-purple-700'
                    : 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-700'
                }`}
                title={`Black Champion: ${CHAMPION_DETAILS[blackChampion.type].title}`}
              >
                <PieceIcon type={blackChampion.type} color="b" className="w-4 h-4" />
              </button>
            )}
          </div>

          {onOpenChat && <button type="button" className="mobile-chat px-2 py-1 rounded border border-blue-400 text-blue-500" onClick={onOpenChat} aria-label={`Open chat${unreadChat ? `, ${unreadChat} unread messages` : ''}`}><MessageSquare className="w-4 h-4 inline" aria-hidden="true" /> {unreadChat > 0 ? <span>{Math.min(unreadChat,99)}</span> : null}</button>}
          <button
            onClick={() => setAutoFlip(!autoFlip)}
            className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer flex items-center gap-1 shadow-xs ${
              autoFlip
                ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-300 font-bold'
                : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
            }`}
            title="Toggle whether the board automatically flips on turn change"
          >
            <span>Auto-Flip:</span>
            <span>{autoFlip ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>);

  return (
    <div className="chess-arena flex flex-col items-center select-none w-full" data-has-popup={hasAnyPopupPrompt ? 'true' : 'false'}>
      {/* Board Controls */}
      {controlsHost ? createPortal(boardControls,controlsHost) : boardControls}

      {groundNotice && <PopupLayer enabled={Boolean(controlsHost)}><div className="board-notification small-game-notice" ><div className="board-ground-notice w-full max-w-[560px] mb-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/90 border border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-200 text-xs flex items-center justify-between shadow-xs animate-fade-in" role="status"><div className="flex items-center gap-2"><Zap className="w-4 h-4 shrink-0"/><span className="font-semibold leading-snug">{groundNotice}</span></div><button onClick={onDismissGroundNotice} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-600 text-white cursor-pointer shrink-0 ml-2">OK</button></div></div></PopupLayer>}
      <CardEffectNotifications awards={frontierGame?.powerUpAwards} recipient={powerUpRecipient} awakening={awakeningAlert} beacon={beaconEffect} staticEffect={staticEffect} clock={clockAlert} turnNumber={turnNumber??0} onOpenChange={setInformationOpen}/>

      {/* Awakening: Knight Transform In-Place Banner */}
      {selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill' && selectedSquare && chess.get(selectedSquare as Square)?.type === 'n' && chess.get(selectedSquare as Square)?.color === turn && !knightMovePrompt && (
        <div className="w-full max-w-[560px] mb-2 p-3 rounded-xl bg-gradient-to-r from-red-950/90 via-stone-900 to-red-950/90 border-2 border-red-500/80 text-white text-xs flex flex-col gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Sparkles className="w-4 h-4 text-red-400" />
              <span>Awaken Knight on {selectedSquare}</span>
            </div>
          </div>
          <p className="text-[11px] text-stone-300 leading-snug">
            Transform this Knight into a <strong>Super Knight</strong> on <strong>{selectedSquare}</strong>, or click any highlighted destination square to leap and awaken!
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                onPlayAwakeningKnight?.(selectedSquare, selectedSquare);
                setSelectedSquare(null);
              }}
              className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1"
            >
              <span>⚡ Transform to Super Knight on {selectedSquare}</span>
            </button>
            <button
              onClick={() => setSelectedSquare(null)}
              className="py-1.5 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs border border-stone-700 cursor-pointer"
            >
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Awakening: Super Knight Double Move Prompt Banner */}
      {knightMovePrompt && !awaitingKnightSecondMove && (
        <PopupLayer><div className="ground-popup"><div role="dialog" aria-modal="true" aria-label="Super Knight second jump" className="ground-dialog w-full max-w-[560px] mb-2 p-3 rounded-xl bg-gradient-to-r from-red-950/90 via-stone-900 to-red-950/90 border-2 border-red-500/80 text-white text-xs flex flex-col gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Sparkles className="w-4 h-4 text-red-400" />
              <span>Super Knight first move selected ({knightMovePrompt.to})!</span>
            </div>
            <span className="text-[10px] bg-red-900/60 border border-red-600/50 text-red-200 px-1.5 py-0.5 rounded font-mono">
              {knightMovePrompt.firstCaptured ? '⚔️ Captured on move 1' : 'No capture yet'}
            </span>
          </div>
          <p className="text-[11px] text-stone-300 leading-snug">
            Would you like to activate the <strong>Double Move</strong>? If activated, you can move this Knight once more (can only capture once total). Using the double move will revert this piece to a normal Knight.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                setAwaitingKnightSecondMove(true);
                setSelectedSquare(knightMovePrompt.to);
              }}
              className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1"
            >
              <span>⚡ Activate Double Move</span>
            </button>
            <button
              onClick={() => {
                if (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') {
                  onPlayAwakeningKnight?.(knightMovePrompt.from, knightMovePrompt.to);
                } else {
                  onMove(knightMovePrompt.from, knightMovePrompt.to);
                }
                setKnightMovePrompt(null);
                setAwaitingKnightSecondMove(false);
              }}
              className="py-1.5 px-3 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs border border-stone-700 cursor-pointer"
            >
              <span>Keep Super Knight & End Turn</span>
            </button>
          </div>
        </div></div></PopupLayer>
      )}

      {/* Awakening: Super Knight 2nd Move Active Banner */}
      {awaitingKnightSecondMove && knightMovePrompt && (
        <div className="w-full max-w-[560px] mb-2 p-2.5 rounded-xl bg-red-950/90 border border-red-500 text-white text-xs flex items-center justify-between shadow-xs animate-pulse">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-bold">
              Click a destination square to complete the Super Knight's 2nd move {knightMovePrompt.firstCaptured ? '(no captures allowed)' : '(1 capture allowed)'}!
            </span>
          </div>
          <button
            onClick={() => {
              if (selectedCard?.type === 'awakening_knight' && awakeningMode === 'skill') {
                onPlayAwakeningKnight?.(knightMovePrompt.from, knightMovePrompt.to);
              } else {
                onMove(knightMovePrompt.from, knightMovePrompt.to);
              }
              setKnightMovePrompt(null);
              setAwaitingKnightSecondMove(false);
              setSelectedSquare(null);
            }}
            className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-600 cursor-pointer shrink-0 ml-2"
          >
            Cancel 2nd Move
          </button>
        </div>
      )}

      {bishopMoveWarning&&<Modal><section className="ground-dialog" role="dialog" aria-modal="true"><h2>Cancel the Bishop’s ritual?</h2><p>Moving this Bishop interrupts its summoning circle.</p><button onClick={()=>setBishopMoveWarning(null)}>Keep channeling</button><button onClick={()=>{const q=bishopMoveWarning;setBishopMoveWarning(null);bishopMoveAllowed.current=true;handleSquareClick(q);bishopMoveAllowed.current=false;}}>Move Bishop</button></section></Modal>}
      {bishopCirclePlacement&&<div className="ground-controls bishop-circle-placement"><strong>Circle · choose an empty rank 4 or 5 square. The Bishop move is pending.</strong><button onClick={()=>setBishopCirclePlacement(null)}>Cancel</button></div>}
      {/* Awakening: Bishop Revive Choice Banner */}
      {bishopRevivePrompt && (
        <div className={bishopRevivePrompt.chosenPiece ? "" : "ground-popup"}><div role={bishopRevivePrompt.chosenPiece ? undefined : "dialog"} aria-modal={bishopRevivePrompt.chosenPiece ? undefined : true} aria-label="Awakened Bishop revival" className="ground-dialog w-full max-w-[560px] mb-2 p-3 rounded-xl bg-gradient-to-r from-red-950/90 via-stone-900 to-red-950/90 border-2 border-red-500/80 text-white text-xs flex flex-col gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Sparkles className="w-4 h-4 text-red-400" />
              <span>Awakening: Bishop — Revive a Fallen Piece!</span>
            </div>
            <button
              onClick={() => {
                onPlayAwakeningBishop?.(bishopRevivePrompt.from, bishopRevivePrompt.to, 'p', '');
                setBishopRevivePrompt(null);
              }}
              className="text-[10px] text-stone-400 hover:text-white underline cursor-pointer"
            >
              Skip Revive
            </button>
          </div>
          {!bishopRevivePrompt.chosenPiece ? (
            <div>
              <p className="text-[11px] text-stone-300 mb-2 leading-snug">
                Step 1: Choose which of your fallen pieces to revive adjacent to your Bishop on <strong>{bishopRevivePrompt.to}</strong>:
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from(new Set((capturedPieceTypes ?? getCapturedPieces(chess, turn)))).map((pType) => (
                  <button
                    key={pType}
                    onClick={() => setBishopRevivePrompt({ ...bishopRevivePrompt, chosenPiece: pType })}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-red-900/60 border border-stone-700 hover:border-red-500 text-white font-bold text-xs cursor-pointer transition-colors shadow-xs"
                  >
                    <PieceIcon type={pType} color={turn} className="w-4 h-4" />
                    <span>Revive {PIECE_NAMES[pType]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/80 text-emerald-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PieceIcon type={bishopRevivePrompt.chosenPiece} color={turn} className="w-5 h-5" />
                  <span>Now click any empty square adjacent to <strong>{bishopRevivePrompt.to}</strong> to place your revived {PIECE_NAMES[bishopRevivePrompt.chosenPiece]}!</span>
                </div>
                <button
                  onClick={() => setBishopRevivePrompt({ ...bishopRevivePrompt, chosenPiece: undefined })}
                  className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 hover:text-white cursor-pointer"
                >
                  Change
                </button>
              </div>
            </div>
          )}
        </div></div>
      )}

      {/* Awakening: Queen Convert & Deploy Banner */}
      {queenDeployPrompt && (
        <div className="w-full max-w-[560px] mb-2 p-3 rounded-xl bg-gradient-to-r from-red-950/90 via-stone-900 to-red-950/90 border-2 border-red-500/80 text-white text-xs flex flex-col gap-2 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-blue-300">
              <Crown className="w-4 h-4 text-red-400" />
              <span>Awakening: Queen — Captured {PIECE_NAMES[queenDeployPrompt.capturedType]} Converted!</span>
            </div>
            <button
              onClick={() => {
                onPlayAwakeningQueen?.(queenDeployPrompt.from, queenDeployPrompt.to);
                setQueenDeployPrompt(null);
              }}
              className="text-[10px] text-stone-400 hover:text-white underline cursor-pointer"
            >
              Skip Deploy
            </button>
          </div>
          <div className="p-2 rounded-lg bg-red-950/60 border border-red-500/80 text-white text-xs flex items-center gap-2">
            <PieceIcon type={queenDeployPrompt.capturedType} color={turn} className="w-5 h-5 shrink-0" />
            <span>The captured enemy piece is now yours! Click an empty adjacent square around <strong>{queenDeployPrompt.to}</strong> to deploy your new ally.</span>
          </div>
        </div>
      )}

      {/* Cooldown / Error Warning Notice */}
      {cooldownWarning && (
        <PopupLayer enabled={Boolean(controlsHost)}><div role="status" className={`board-notification small-game-notice move-error-notice${cooldownWarning.startsWith("No card for ") ? " missing-card-notice" : ""}`}><div className="w-full max-w-[560px] mb-2 p-2 rounded-xl bg-red-50 dark:bg-red-950/90 border border-red-300 dark:border-red-700 text-red-950 dark:text-red-200 text-xs flex items-center gap-2 shadow-xs animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <span className="font-medium">{cooldownWarning}</span>
        </div></div></PopupLayer>
      )}

      {/* Ninja Ultimate Confirmation Bar */}
      {selectedCard?.type === 'champion' && myChampion?.type === 'ninja' && ninjaTargets.length > 0 && (
        <div className="w-full max-w-[560px] mb-2 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/90 border border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200 text-xs flex items-center justify-between shadow-xs">
          <span>
            Selected {ninjaTargets.length} target(s): [<strong>{ninjaTargets.join(', ')}</strong>]
          </span>
          <button
            onClick={() => {
              onChampionUltimate?.({ cardId: selectedCard.id, targetSquares: ninjaTargets });
              setNinjaTargets([]);
            }}
            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase cursor-pointer transition-transform active:scale-95 shadow-xs"
          >
            Confirm Assassination
          </button>
        </div>
      )}

      {activeTooltipChamp && <ChampionInfoDialog champion={activeTooltipChamp} champions={champions} onInspect={setInspectedChampionSquare} onClose={()=>setInspectedChampionSquare(null)}/>}

      {/* Board Shell Container */}
      <div className="relative w-full max-w-[560px]">
        {/* 8x8 Chessboard */}
        <div
          id="chess-board"
          style={isExtendedFen(fen)?{aspectRatio:'8 / 12',gridTemplateRows:'repeat(12,minmax(0,1fr))'}:undefined}
          data-orientation={flipBoard ? 'black' : 'white'}
          className="relative w-full max-w-[560px] aspect-square grid grid-cols-8 grid-rows-8 border-[3px] sm:border-[6px] border-[#263449] dark:border-[#263449] rounded-xl shadow-xl overflow-hidden bg-[#263449] dark:bg-[#263449] ring-1 ring-stone-900/10 dark:ring-stone-700/50 touch-manipulation"
        >
        {displayRanks.map((rank, rIdx) =>
          displayFiles.map((file, fIdx) => {
            const square = `${file}${rank}`;
            const isLight = (fIdx + rIdx) % 2 === 0;
            const piece = chess.get(square as Square);
            const frontierGolem=frontier?.golems.find(g=>g.square===square);
            const frontierPOI=frontier?.pois[square];
            const isRestricted = restrictedSquares.includes(square);
            const isMonolith = monolithSquare === square;

            // Champions on squares
            const isWhiteChamp = whiteChampion && whiteChampion.square === square;
            const isBlackChamp = blackChampion && blackChampion.square === square;
            const championPiece = isWhiteChamp ? whiteChampion : isBlackChamp ? blackChampion : null;
            const isMyChampionSquare = Boolean(myChampion && myChampion.square === square);

            const isSelected = selectedSquare === square || switchSquare1 === square;
            const isValidDestination = validDestinations.includes(square);

            const isKingSquare = piece && piece.type === 'k' && piece.color === turn;
            const inCheckGlow = isKingSquare && isKingInCheck;

            // Beacon / Static effects
            const isPiecePresent = Boolean(piece) || Boolean(championPiece) || Boolean(frontierGolem);
            const isBeaconProtected = beaconProtectedSquares.includes(square) && isPiecePresent;
            const isStaticStunned = staticStunnedSquares.includes(square);

            // Champion summon highlight: empty square on player's side (first 4 rows only)
            const isChampionDeployTarget = validChampionDeploySquares.includes(square);

            // Champion Ultimate highlights
            const isChampionUltimateTarget = championUltimateTargets.includes(square);
            const isNinjaSelectedTarget = ninjaTargets.includes(square);
            const isSummonerSelectedAlly = summonerPieceToTeleport === square;

            // Opponent and last move highlighting
            const isMove =
              lastMoveDetails &&
              (lastMoveDetails.actionType === 'move' ||
                lastMoveDetails.actionType === 'push' ||
                lastMoveDetails.actionType === 'champion_move' || lastMoveDetails.actionType === 'awakening' || lastMoveDetails.actionType === 'powerup');
            const isMoveFrom = isMove && lastMoveDetails?.from === square;
            const isMoveTo = isMove && lastMoveDetails?.to === square;
            const isIntermediateMove = isMove && Boolean(lastMoveDetails?.intermediateSquare === square || lastMoveDetails?.firstTo === square);
            const isKnightActiveJumpFrom = Boolean(knightMovePrompt && knightMovePrompt.from === square);
            const isKnightActiveJumpIntermediate = Boolean(knightMovePrompt && knightMovePrompt.to === square);
            const isOpponentMove = Boolean(lastMoveDetails && lastMoveDetails.player !== myColor);

            // Swapped squares highlighting
            const isSwapped =
              lastMoveDetails?.actionType === 'switch' &&
              lastMoveDetails.swappedSquares &&
              lastMoveDetails.swappedSquares.includes(square);

            // Monolith last move highlighting
            const isMonolithFrom =
              lastMoveDetails?.actionType === 'monolith' && lastMoveDetails.monolithFrom === square;

            // Push Card Wind Highlighting:
            const isPushMove = lastMoveDetails?.actionType === 'push';
            const isPushMovedFrom = isPushMove && lastMoveDetails?.from === square;
            const isPushMovedTo = isPushMove && lastMoveDetails?.to === square;

            // Card target check: Only squares that match validCardTargets (or validDestinations when selected)
            const isCardTarget = validCardTargets.includes(square);

            // Awakening piece classifications
            const isSuperPawn = Boolean(piece?.type === 'p' && superPawns.includes(square));
            const isSuperKnight = Boolean(piece?.type === 'n' && superKnights.includes(square));
            const currentAwakenedRook =
              piece?.type === 'r'
                ? awakenedRooks.find((r) => r.square === square && (r.turnsRemaining === undefined || r.turnsRemaining > 0))
                : null;
            const id=pieceIds[square];
            const isSoulPiece=Boolean(id&&soulSummons.some(t=>t.pieceId===id));
            const isAwakened = Boolean(isSuperPawn || isSuperKnight || currentAwakenedRook ||
              (piece && awakenedAppearance(piece.type,piece.color as PlayerColor,id,turnNumber??0,summoningCircles,hands,historyLog)));
            const championMark = championMarks?.find((m) => m.square === square);

            // Bishop revive adjacent target square
            const isBishopReviveTarget = Boolean(
              bishopRevivePrompt?.chosenPiece &&
                getSurroundingSquares(bishopRevivePrompt.to).includes(square) &&
                !piece &&
                !championPiece &&
                !isRestricted &&
                !isMonolith
            );

            // Queen convert adjacent target square
            const isQueenDeployTarget = Boolean(
              queenDeployPrompt &&
                getSurroundingSquares(queenDeployPrompt.to).includes(square) &&
                !piece &&
                !championPiece &&
                !isRestricted &&
                !isMonolith
            );

            // Determine square base background: smooth classic ivory & walnut tones with dark mode palette
            let squareBg = isDark
              ? (isLight ? 'bg-[#a7b7cb]' : 'bg-[#4c6380]')
              : (isLight ? 'bg-[#e4eaf2]' : 'bg-[#8b9db5]');

            if (isRestricted) {
              squareBg = 'bg-red-900/80 border-2 border-red-500/80';

            } else if (isSwapped) {
              squareBg = 'bg-fuchsia-400/35 ring-2 ring-inset ring-fuchsia-400/80';
            } else if (isPushMovedTo) {
              squareBg = 'bg-teal-400/40 ring-2 ring-inset ring-teal-300 shadow-[inset_0_0_16px_rgba(45,212,191,0.6)]';
            } else if (isPushMovedFrom) {
              squareBg = 'bg-teal-200/30 ring-2 ring-dashed ring-teal-400/80 shadow-[inset_0_0_10px_rgba(45,212,191,0.35)]';
            } else if (isKnightActiveJumpIntermediate) {
              squareBg = 'bg-rose-400/40 ring-2 ring-inset ring-rose-500 shadow-[inset_0_0_14px_rgba(244,63,94,0.6)]';
            } else if (isKnightActiveJumpFrom) {
              squareBg = 'bg-rose-200/30 ring-2 ring-dashed ring-rose-400/80';
            } else if (isIntermediateMove) {
              squareBg = isOpponentMove
                ? 'bg-amber-400/35 ring-2 ring-inset ring-amber-400/80 shadow-[inset_0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-blue-300/35 ring-2 ring-inset ring-blue-400/80 shadow-[inset_0_0_10px_rgba(59,130,246,0.4)]';
            } else if (isMoveTo) {
              squareBg = isOpponentMove
                ? 'bg-blue-400/40 ring-2 ring-inset ring-blue-400 shadow-[inset_0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-blue-300/30 ring-2 ring-inset ring-blue-400/70';
            } else if (isMoveFrom) {
              squareBg = isOpponentMove
                ? 'bg-blue-200/30 ring-2 ring-dashed ring-blue-500/80'
                : 'bg-blue-100/25 ring-2 ring-dashed ring-blue-400/60';
            } else if (isMonolithFrom) {
              squareBg = 'bg-sky-300/20 ring-2 ring-dashed ring-sky-400/70';
            }

            const isMonolithTarget =
              (isMonolithPowerUp || selectedCard?.type === 'monolith') &&
              !piece &&
              !championPiece &&
              !isRestricted &&
              !isMonolith && !summoningCircles.some(c=>c.square===square&&!c.finished&&!c.interrupted)&&(!frontierGame||monolithPlacementSquare(frontierGame,square));
            const isRestrictTarget =
              selectedCard?.type === 'restrict' &&
              !frontier?.golems.some(g=>g.square===square) &&
              !piece &&
              !championPiece &&
              !isRestricted &&
              !isMonolith;

            const isInspectedChampion = activeTooltipSquare === square && Boolean(championPiece && championPiece.square === square);

            return (
              <div
                key={square}
                data-tone={isLight?'light':'dark'} id={`square-${square}`}
                data-last-move={isMoveTo?'to':isMoveFrom?'from':isIntermediateMove?'via':undefined}
                role="button" tabIndex={0} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type as StandardPieceType] || piece.type}` : ''}`}
                aria-pressed={isSelected}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSquareClick(square); } }}
                onClick={() => handleSquareClick(square)}
                className={`relative flex items-center justify-center transition-colors ${/[WXYZ]/.test(rank)?'frontier-field-square':''} ${squareBg} ${(groundTargets.includes(square)||bishopCircleSquares.includes(square))?"ring-2 ring-blue-400 z-10":""} ${
                  isSelected ? 'ring-4 ring-blue-400 z-10' : ''
                } ${
                  isInspectedChampion && !isSelected
                    ? 'ring-3 ring-purple-400 dark:ring-purple-300 z-20 shadow-md animate-pulse'
                    : ''
                } ${
                  isChampionDeployTarget
                    ? 'cursor-pointer z-10'
                    : ''
                } ${
                  isChampionUltimateTarget
                    ? 'ring-2 ring-blue-400 bg-blue-950/40 hover:bg-blue-900/60 cursor-pointer animate-pulse z-10'
                    : ''
                } ${
                  isNinjaSelectedTarget ? 'ring-4 ring-emerald-400 bg-emerald-950/60 z-15' : ''
                } ${
                  isSummonerSelectedAlly ? 'ring-4 ring-indigo-400 bg-indigo-950/60 z-15' : ''
                } ${
                  !selectedSquare && isCardTarget && !['soul_release','monolith','restrict','champion'].includes(selectedCard?.type||'')
                    ? 'ring-2 ring-indigo-400/90 shadow-[0_0_12px_rgba(129,140,248,0.6)] z-10 cursor-pointer animate-pulse'
                    : ''
                } ${
                  isPushMovedTo ? 'shadow-[0_0_20px_rgba(45,212,191,0.8)]' : ''
                } ${isMonolithTarget ? 'cursor-pointer' : ''} ${
                  isRestrictTarget ? 'cursor-pointer' : ''
                } ${
                  (selectedCard?.type === 'restrict' ||
                    selectedCard?.type === 'monolith' ||
                    isMonolithPowerUp) &&
                  !isMonolithTarget &&
                  !isRestrictTarget
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
              >
                {(groundTargets.includes(square)||bishopCircleSquares.includes(square)||isChampionDeployTarget||isMonolithTarget||isRestrictTarget||isBishopReviveTarget||isQueenDeployTarget||(selectedCard?.type==='soul_release'&&isCardTarget)) && <div className="ground-placement-target" data-ground-target={square} aria-label={`Available tile target ${square}`}><span /></div>}
                {grounds?.tiles[square] && <div className={`ground-tile ${piece || championPiece || frontierGolem || isMonolith ? 'occupied' : ''} ${grounds.tiles[square] === 'portal' && portalOccupied ? 'portal-linked-active' : ''}`} data-ground-type={grounds.tiles[square]} data-square-tone={isLight ? 'light' : 'dark'} aria-label={`${grounds.tiles[square]} tile at ${square}`} style={{'--tile-color':({boost:'#22c55e',gravity:'#a56b3d',defense:'#f5c542',portal:'#ff8b24'} as Record<string,string>)[grounds.tiles[square]]} as React.CSSProperties}><V5Power type={grounds.tiles[square]} className="w-full h-full"/><span className="powered-tile-aura"/>{[0,1,2].map(i=><span key={i} className="powered-tile-mote" style={{left:`${20+i*30}%`,animationDelay:`${i*.4}s`}}/>)}</div>}
                {!!grounds?.traps.filter(t=>t.square===square).length && <div className="ground-traps" aria-label={`Your traps at ${square}`}>{grounds.traps.filter(t=>t.square===square).map(t=><V5Power key={t.id} type={t.type} className="w-4 h-4"/>)}</div>}
                {summoningCircles.filter(c=>c.square===square&&!c.finished&&!c.interrupted).map(c=><div key={c.id} className={`summoning-circle ${c.owner==='w'?'circle-white':'circle-black'}`} title={`Summoning circle: ${c.remaining} owner turns remaining`}><span>✦</span><b>{c.remaining}</b></div>)}
                {soulSummons.filter(t=>t.pieceId===pieceIds[square]).map(t=><div key={t.id} className="soul-countdown" role="status" aria-label={`Soul: ${t.remaining} owner turns remaining`} title={`Temporary Soul: ${t.remaining} owner turns remaining — zero army and capture value`}><span aria-hidden="true">✦</span>{t.remaining}t</div>)}
                {grounds?.poison.some(d=>d.square===square)&&<div className="ground-marker" title="Poison countdown"><V5Power type="poison" className="w-3 h-3"/>{grounds.poison.find(d=>d.square===square)?.remaining}</div>}
                {grounds?.disarm.some(d=>d.square===square)&&<div className="ground-marker" title="Disarmed: cannot capture"><V5Power type="disarm" className="w-4 h-4"/></div>}
                {grounds?.banished.some(d=>d.square===square)&&<div className="ground-marker" title="Banished piece return countdown"><V5Power type="banish" className="w-3 h-3"/>{grounds.banished.find(d=>d.square===square)?.remaining}</div>}
                {/* Beacon Holy Sanctum Field Aura on surrounding squares */}
                {beaconEffect?.active && monolithSurroundingSquares.includes(square) && (
                  <div className="absolute inset-0 bg-yellow-400/15 border border-yellow-400/30 pointer-events-none rounded-sm z-15" />
                )}

                {/* Invulnerable Shield Buff Marker on pieces in the Beacon field */}
                {isBeaconProtected && (
                  <div
                    className="piece-protection-badge absolute top-0.5 right-0.5 pointer-events-none z-25 flex items-center justify-center p-0.5 rounded-full bg-blue-950/90 border border-yellow-400 shadow-md"
                    title="Protected by Beacon: Invulnerable while surrounding the Monolith"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-yellow-300 filter drop-shadow animate-pulse" />
                  </div>
                )}

                {/* Static Pending Charging Aura around Monolith: ONLY blue highlights show */}
                {staticEffect?.pending && monolithSurroundingSquares.includes(square) && (
                  <div className="absolute inset-0 bg-blue-500/25 border-2 border-blue-400/70 shadow-[inset_0_0_14px_rgba(59,130,246,0.5)] pointer-events-none rounded-sm z-20 animate-pulse" />
                )}

                {/* Electric Stun Static Aura (Active: Stunned) - lightning marker displayed when already stunning */}
                {isStaticStunned && (
                  <div className="absolute inset-0 bg-cyan-400/25 border-2 border-cyan-300/80 pointer-events-none rounded-sm flex items-start justify-start p-0.5 z-20 animate-pulse">
                    <div className="p-0.5 rounded-full bg-cyan-950/90 border border-cyan-300 shadow-md">
                      <Zap className="w-3.5 h-3.5 text-cyan-300 filter drop-shadow animate-bounce" />
                    </div>
                  </div>
                )}

                {piece&&summoningCircles.some(c=>c.bishopId===pieceIds[square]&&!c.finished&&!c.interrupted)&&<div className={`bishop-channeling ${piece.color==='b'?'channel-black':''}`} aria-label="Bishop channeling ritual"><span/><span/>{[0,1,2].map(i=><i key={i} style={{animationDelay:`${i*.35}s`}}/>)}</div>}
                {/* Wind Highlights for piece moved by push card */}
                {isPushMovedTo && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-sm flex items-center justify-center z-25">
                    <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/25 via-cyan-400/35 to-emerald-400/25 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-80 animate-wind-gust">
                      <Wind className="w-10 h-10 text-teal-200 filter drop-shadow-[0_0_8px_rgba(45,212,191,0.9)]" />
                    </div>
                  </div>
                )}

                {/* Wind Origin Trail Highlight */}
                {isPushMovedFrom && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40 z-15">
                    <Wind className="w-6 h-6 text-teal-300" />
                  </div>
                )}

                {/* Restricted Square Indicator */}
                {isRestricted && (
                  <div className="restricted-tile-overlay absolute inset-0 flex flex-col items-center justify-center bg-red-950/60 pointer-events-none">
                    <Ban className="w-6 h-6 text-red-400 animate-pulse" />
                    <span className="text-[8px] font-extrabold text-red-200 uppercase tracking-tighter">
                      LOCKED
                    </span>
                  </div>
                )}

                {/* King in check warning glow */}
                {inCheckGlow && (
                  <div className="absolute inset-0 bg-red-600/40 animate-pulse rounded-sm pointer-events-none" />
                )}

                {(frontierGolem||frontierPOI)&&<div data-motion-piece={frontierGolem?'golem':undefined} className={`absolute inset-0 z-10 pointer-events-none ${!frontier?.ready&&!frontierGolem?'frontier-silhouette':''} ${['bag','key','chest'].includes(frontierPOI||'')?`frontier-board-item ${frontierPOI==='chest'?'frontier-chest':''} ${piece||championPiece||frontierGolem||isMonolith?'with-piece':''}`:''}`} data-frontier-item={['bag','key','chest'].includes(frontierPOI||'')?frontierPOI:undefined} title={frontierGolem?'Controlled Golem · 10 points':frontierPOI==='boss'?'Arcane Golem':frontierPOI}>
                  {frontierGolem||frontierPOI==='boss'?<GolemIdleArt type={frontierGolem?(frontierGolem.owner==='w'?'golem':'black_golem'):frontier?.boss?.health===1?'weakened':'boss'} weakened={frontierPOI==='boss'&&frontier?.boss?.health===1}/>:<FrontierArt type={frontierPOI!}/>}
                  {frontierPOI==='boss'&&frontier?.ready&&<div className={`frontier-boss-hp ${frontier.boss?.health===1?'weakened':''}`} role="progressbar" aria-label="Arcane Golem health" aria-valuenow={frontier.boss?.health===1?50:100} aria-valuemin={0} aria-valuemax={100}><span style={{width:frontier.boss?.health===1?'50%':'100%'}}/></div>}
                </div>}
                {blastSquares.includes(square)&&<div className='golem-blast-preview' aria-label='Golem explosion area'/>}
                {/* Monolith Piece */}
                {isMonolith && (
                  <div data-motion-piece="monolith" className="w-[98%] h-[98%] z-10 flex items-center justify-center transition-transform hover:scale-105 pointer-events-none">
                    <PieceIcon type="m" className="w-full h-full aspect-square" />
                  </div>
                )}

                {isMonolith && beaconEffect?.active && <span className="monolith-beacon-countdown" role="status" title="Beacon protection — remaining game turns" aria-label={`Beacon: ${Math.max(0,(beaconEffect.expiresOnTurnNumber ?? ((turnNumber??0)+6))-(turnNumber??0))} turns remaining`}><Shield className="w-2.5 h-2.5"/>{Math.max(0,(beaconEffect.expiresOnTurnNumber ?? ((turnNumber??0)+6))-(turnNumber??0))}t</span>}

                {/* Champion Piece (0 pts badge removed when placed on board) */}
                {championPiece && (
                  <div
                    data-motion-piece="champion"
                    data-poisoned={grounds?.poison.some(d => d.square === square) || undefined}
                    className={`relative w-[88%] h-[88%] z-12 flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer ${
                      isMyChampionSquare
                        ? 'filter drop-shadow-[0_0_6px_rgba(192,132,252,0.9)] animate-pulse'
                        : 'filter drop-shadow-md'
                    }`}
                    title={`⚔️ ${championPiece.type.toUpperCase()} Champion • Click for Standard Movement & Ultimate`}
                  >
                    <PieceIcon type={championPiece.type} color={championPiece.color} className="w-full h-full aspect-square" />
                  </div>
                )}

                {/* Standard Chess Piece */}
                {piece && !isMonolith && (
                  <div
                    data-motion-piece="standard"
                    data-poisoned={grounds?.poison.some(d => d.square === square) || undefined}
                    data-soul-piece={isSoulPiece||undefined}
                    className={`w-[86%] h-[86%] z-10 flex items-center justify-center transition-all duration-200 hover:scale-105 pointer-events-none ${
                      !selectedSquare && isCardTarget
                        ? 'filter drop-shadow-[0_0_4px_rgba(129,140,248,0.9)] drop-shadow-[0_0_1px_rgba(255,255,255,0.7)] animate-pulse'

                        : 'filter drop-shadow-md'
                    }`}
                  >
                    <PieceIcon
                      type={
                        isSuperPawn
                          ? 'sp'
                          : isSuperKnight
                          ? 'sn'
                          : (piece.type as StandardPieceType)
                      }
                      color={piece.color as PlayerColor}
                      awakened={isAwakened || Boolean(currentAwakenedRook)}
                      className="w-full h-full aspect-square"
                    />
                  </div>
                )}

                {/* Invulnerable Shield Buff Marker on Awakened Rook */}
                {currentAwakenedRook && (
                  <>
                    <div
                      className="rook-protection-badge absolute top-0.5 right-0.5 pointer-events-none z-25 flex items-center justify-center p-0.5 rounded-full bg-red-950/90 border border-red-400 shadow-md"
                      title={`Awakened Rook: Invulnerable for ${currentAwakenedRook.turnsRemaining} turns! ${currentAwakenedRook.hasCaptured ? '(Capture used)' : '(1 capture left)'}`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-red-400 filter drop-shadow animate-pulse" />
                    </div>
                    <div
                      className="rook-countdown-badge absolute bottom-0.5 left-0.5 pointer-events-none z-25 flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-red-950/90 border border-red-500 text-[9px] font-black text-red-200 shadow-md"
                      title={`${currentAwakenedRook.turnsRemaining} turns remaining`}
                    >
                      <Shield className="w-2.5 h-2.5 text-red-400" />
                      <span>{currentAwakenedRook.turnsRemaining}t</span>
                    </div>
                  </>
                )}

                {/* Super Knight Intermediate 1st Leap Indicator */}
                {isIntermediateMove && (
                  <div
                    className="absolute bottom-0.5 right-0.5 pointer-events-none z-25 px-1 py-0.2 rounded-full bg-blue-900/90 dark:bg-stone-900/90 border border-blue-400 text-[8px] font-black text-blue-200 shadow-xs flex items-center gap-0.5"
                    title="Super Knight Leap 1 (Intermediate)"
                  >
                    <span>1st Leap</span>
                  </div>
                )}

                {/* Champion Ultimate Target Marker */}
                {isChampionUltimateTarget && !isChampionDeployTarget && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
                    {myChampion?.type === 'musketeer' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-blue-400 bg-blue-500/30 flex items-center justify-center animate-pulse">
                        <Crosshair className="w-4 h-4 text-blue-300" />
                      </div>
                    ) : myChampion?.type === 'summoner' ? (
                      <div className="w-5 h-5 rounded-full border-2 border-indigo-400 bg-indigo-500/30 flex items-center justify-center animate-pulse">
                        <Wand2 className="w-3 h-3 text-indigo-300" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-blue-400 ring-4 ring-blue-400/40 animate-pulse shadow-md" />
                    )}
                  </div>
                )}

                {/* Champion Marks: Musketeer sniped target icon or Ninja assassinated katana slash */}
                {championMark && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-22">
                    {championMark.mark === 'target' ? (
                      <div className="relative flex flex-col items-center justify-center animate-fade-in" title="Musketeer Sniped Square">
                        <div className="w-8 h-8 rounded-full border-2 border-red-500/90 bg-red-950/70 shadow-[0_0_16px_rgba(239,68,68,0.9)] flex items-center justify-center animate-pulse">
                          <Target className="w-5 h-5 text-red-400 filter drop-shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
                        </div>
                        <span className="text-[7px] font-black tracking-tight text-red-300 bg-red-950/90 px-1 py-0.2 rounded border border-red-500/80 -mt-1 shadow-xs uppercase">
                          Sniped
                        </span>
                      </div>
                    ) : (
                      <div className="relative w-full h-full flex flex-col items-center justify-center animate-fade-in overflow-hidden" title="Ninja Assassinated Square">
                        {/* Katana slash lines */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_0_8px_rgba(16,185,129,0.9)]" viewBox="0 0 100 100">
                          <line x1="10" y1="90" x2="90" y2="10" stroke="#34d399" strokeWidth="4.5" strokeLinecap="round" />
                          <line x1="18" y1="88" x2="88" y2="18" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
                          <line x1="28" y1="72" x2="72" y2="28" stroke="#10b981" strokeWidth="8" strokeOpacity="0.35" strokeLinecap="round" />
                        </svg>
                        <div className="w-6 h-6 rounded-full bg-emerald-950/80 border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)] flex items-center justify-center z-10 animate-pulse">
                          <Swords className="w-3.5 h-3.5 text-emerald-300" />
                        </div>
                        <span className="text-[6.5px] font-black tracking-tight text-emerald-300 bg-emerald-950/90 px-1 py-0.2 rounded border border-emerald-500/80 mt-0.5 shadow-xs uppercase z-10">
                          Assassinated
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Valid Move Targets */}
                {isValidDestination && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    {piece || (enemyChampion && enemyChampion.square === square) ? (
                      // Capture ring
                      <div className="w-full h-full border-4 border-red-500/90 rounded-sm bg-red-500/20 animate-pulse" />
                    ) : selectedCard?.type === 'push' ? (
                      // Push move marker (emerald)
                      <div className="w-4 h-4 rounded-full bg-emerald-400 ring-4 ring-emerald-400/40 shadow-md" />
                    ) : (
                      // Standard move dot
                      <div className="w-3.5 h-3.5 rounded-full bg-blue-500/80 ring-4 ring-blue-500/30" />
                    )}
                  </div>
                )}

                {/* Switch selection helper */}
                {switchSquare1 === square && (
                  <div className="absolute inset-0 border-2 border-fuchsia-400 bg-fuchsia-500/20 animate-pulse pointer-events-none" />
                )}

                {/* Square Edge Rank / File Coordinates */}
                {fIdx === 0 && (
                  <span
                    className={`absolute top-0.5 left-1 text-[9px] font-mono font-bold select-none pointer-events-none ${
                      isDark
                        ? isLight
                          ? 'text-[#2e241d]/80'
                          : 'text-[#9c8e7f]/80'
                        : isLight
                        ? 'text-[#87725e]'
                        : 'text-[#f6f2ea]/90'
                    }`}
                  >
                    {rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold select-none pointer-events-none ${
                      isDark
                        ? isLight
                          ? 'text-[#2e241d]/80'
                          : 'text-[#9c8e7f]/80'
                        : isLight
                        ? 'text-[#87725e]'
                        : 'text-[#f6f2ea]/90'
                    }`}
                  >
                    {file}
                  </span>
                )}
              </div>
            );
          })
        )}
        <BoardEffects frontier={frontier} jokerEventId={historyLog.find(e=>e.actionType==='joker')?.id} fen={fen} pieceIds={pieceIds} champions={champions} grounds={grounds} clockAlert={clockAlert} flipped={flipBoard}/>
        </div>
        {/* End of 8x8 Chessboard */}
      </div>
      {/* End Board Shell Container */}

      {/* Guidance Banner */}
      <div className="board-guidance mt-2 text-center text-xs text-stone-700 dark:text-stone-300 min-h-[22px] max-w-[560px] font-medium">
        {isMonolithPowerUp || selectedCard?.type === 'monolith' ? (
          <span className="text-sky-700 dark:text-sky-400 font-semibold animate-pulse">
            Click any empty, unrestricted square to place or relocate the Monolith.
          </span>
        ) : selectedCard?.type === 'restrict' ? (
          <span className="text-red-700 dark:text-red-400 font-semibold animate-pulse">
            Click any empty, unrestricted square to mark it permanently restricted for the entire game!
          </span>
        ) : selectedCard?.type === 'champion' && !myChampion ? (
          <span className="text-purple-700 dark:text-purple-400 font-bold animate-pulse">
            ⚔️ Champion Deploy: Click any empty square on your side of the board ({turn === 'w' ? 'Ranks 1–4' : 'Ranks 5–8'}) to summon your legendary Champion!
          </span>
        ) : selectedCard?.type === 'champion' && myChampion ? (
          <span className="text-blue-800 dark:text-blue-300 font-bold animate-pulse">
            {myChampion.type === 'berserker' && '💥 Berserker Ultimate: Click any square across ranks/files/diagonals to sweep like a Queen!'}
            {myChampion.type === 'musketeer' && '🎯 Musketeer Ultimate: Click an enemy piece within 3 tiles to Snipe and eliminate it!'}
            {myChampion.type === 'summoner' &&
              (!summonerPieceToTeleport
                ? '🔮 Summoner Ultimate: Click any friendly piece on the board to select for teleportation.'
                : `Piece at ${summonerPieceToTeleport} selected. Now click an adjacent square next to Summoner to teleport!`)}
            {myChampion.type === 'ninja' &&
              `🗡️ Ninja Ultimate: Select up to 2 adjacent enemy pieces, then click Confirm Assassination! (${ninjaTargets.length}/2 selected)`}
          </span>
        ) : selectedCard?.type === 'switch' ? (
          <span className="text-fuchsia-700 dark:text-fuchsia-400 font-semibold">
            {switchSquare1
              ? `Piece at ${switchSquare1} chosen. Now click a second friendly piece (or Champion) to swap.`
              : 'Click any of your pieces (standard piece or Champion) to begin swap.'}
          </span>
        ) : selectedCard?.type === 'push' ? (
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
            Push Card Active: Select any piece to slide like a Queen (cannot capture or pass through Champions/pieces).
          </span>
        ) : isWildPowerUp ? (
          <span className="text-blue-700 dark:text-blue-400 font-semibold animate-pulse">
            Wild Power-Up Active: Select ANY piece to move freely.
          </span>
        ) : selectedCard?.type === 'previous' ? (
          <span className="text-indigo-700 dark:text-indigo-400 font-bold animate-pulse">
            Previous Card Active: You must move a {lastMovedPiece ? PIECE_NAMES[lastMovedPiece] : 'piece'} (your previously moved piece). Target pieces marked with PREV!
          </span>
        ) : selectedCard?.type === 'clock' ? (
          clockBlockReason ? (
            <span className="text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-1.5 animate-pulse">
              <Ban className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>Cannot Activate Clock: {clockBlockReason}</span>
            </span>
          ) : (
            <span className="text-blue-800 dark:text-blue-300 font-bold animate-pulse">
              ⏳ Activate the Clock: Click "Activate Clock" in hand to revert 2 turns (opponent's previous move and your previous move)! (Free Action)
            </span>
          )
        ) : activeTooltipChamp ? (
          <span className="text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center gap-1.5 animate-pulse">
            <Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>
              {CHAMPION_DETAILS[activeTooltipChamp.type].title}: Standard Move without a card • Play Champion card for Ultimate!
            </span>
          </span>
        ) : selectedCard ? (
          <span className="text-blue-800 dark:text-blue-300 font-semibold">
            {selectedCard.type==='soul_release'?'Soul Release: select a highlighted empty square around its original Queen. Move action.':`${selectedCard.name} Card Selected: Select an eligible piece to move.`}
          </span>
        ) : myChampion && selectedSquare === myChampion.square ? (
          <span className="text-purple-700 dark:text-purple-400 font-semibold">
            Champion {myChampion.type.toUpperCase()} Selected: Move freely without requiring a card!
          </span>
        ) : isMyTurn ? (
          <span className="text-stone-600 dark:text-stone-400">
            Select a card from your hand, or click your King (or Champion) to move without a card.
          </span>
        ) : (
          <span className="text-stone-500 dark:text-stone-400">Waiting for opponent to take their turn...</span>
        )}
      </div>
    </div>
  );
};
